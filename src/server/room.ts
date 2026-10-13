/**
 * One game room, independent of how it's hosted. The Durable Object in
 * room-object.ts stores a RoomData and feeds it connections, messages and
 * clock alarms; tests drive the same functions directly.
 *
 * Players are known to the room by a secret token their browser keeps, and
 * to each other by a short public id. Tokens never leave the room.
 */
import {
  RuleError,
  TEAMS,
  canReveal,
  elapsed,
  endsAt,
  freeHintsLeft,
  game as G,
  moveDeductions,
  nextHintCost,
  pointsLeft,
  type Game,
  type Rng,
  type Song,
  type TeamId,
  type Turn,
} from "../rules";
import type { ClientMessage, PlayerView, Role, RoomView, SongSource, TurnSummary, TurnView } from "../shared/protocol";
import { DEFAULT_PACK_ID, PACKS, findPack } from "./packs";

export interface RoomData {
  code: string;
  game: Game;
  source: SongSource;
  /** Secret token → public player id. */
  seats: Record<string, string>;
  createdAt: number;
  lastActiveAt: number;
}

export type IdGen = () => string;

/** Rooms are cleared out a day after the last move. */
export const ROOM_TTL_MS = 24 * 60 * 60 * 1000;

export function createRoom(code: string, hostToken: string, now: number, newId: IdGen): RoomData {
  const hostId = newId();
  const pack = findPack(DEFAULT_PACK_ID)!;
  return {
    code,
    game: G.createGame(hostId, pack.songs),
    source: { kind: "pack", id: pack.id, name: pack.name },
    seats: { [hostToken]: hostId },
    createdAt: now,
    lastActiveAt: now,
  };
}

/** The public id for a token, giving the browser a seat the first time it shows up. */
export function seat(room: RoomData, token: string, newId: IdGen): { room: RoomData; playerId: string } {
  const existing = room.seats[token];
  if (existing) return { room, playerId: existing };
  const playerId = newId();
  return { room: { ...room, seats: { ...room.seats, [token]: playerId } }, playerId };
}

export type HandleResult = { ok: true; room: RoomData } | { ok: false; message: string };

/** A move that needs a fetch first (reading a pasted playlist) is handled by `useSongs` instead. */
export type SyncMessage = Exclude<ClientMessage, { type: "usePlaylist" }>;

export function handle(room: RoomData, playerId: string, msg: SyncMessage, now: number, rng: Rng = Math.random): HandleResult {
  return attempt(() => {
    if (msg.type === "usePack") {
      const pack = findPack(msg.packId);
      if (!pack) throw new RuleError("not-a-choice", "That song pack doesn't exist.");
      return useSongs(room, playerId, pack.songs, { kind: "pack", id: pack.id, name: pack.name }, now);
    }
    const game = apply(G.tick(room.game, now), playerId, msg, now, rng);
    return { ...room, game, lastActiveAt: now };
  });
}

/** Whether this player may change the songs right now, checked before fetching a playlist. */
export function canChangeSongs(room: RoomData, playerId: string): HandleResult {
  return attempt(() => ({ ...room, game: G.setSongs(room.game, playerId, room.game.pool) }));
}

export function useSongs(room: RoomData, playerId: string, songs: Song[], source: SongSource, now: number): RoomData {
  return { ...room, game: G.setSongs(room.game, playerId, songs), source, lastActiveAt: now };
}

export function attempt(fn: () => RoomData): HandleResult {
  try {
    return { ok: true, room: fn() };
  } catch (e) {
    if (e instanceof RuleError) return { ok: false, message: e.message };
    throw e;
  }
}

function apply(game: Game, playerId: string, msg: Exclude<SyncMessage, { type: "usePack" }>, now: number, rng: Rng): Game {
  switch (msg.type) {
    case "join":
      return G.join(game, { id: playerId, name: msg.name, team: msg.team });
    case "start":
      return G.start(game, playerId, rng);
    case "pick":
      return G.pickSong(game, playerId, msg.songId);
    case "startClock":
      return G.startClock(game, playerId, now);
    case "hint":
      return G.giveHint(game, playerId, msg.text, now);
    case "reveal":
      return G.reveal(game, playerId, msg.kind, now);
    case "guess":
      return G.guess(game, playerId, msg.text, now);
    case "count":
      return G.countGuess(game, playerId, msg.guessIndex);
    case "void":
      return G.voidTurn(game, playerId, now);
    case "next":
      if (!game.players.some((p) => p.id === playerId)) {
        throw new RuleError("unknown-player", "Join the game first.");
      }
      return G.nextTurn(game, rng);
  }
}

/**
 * Pauses the clock while the listener is offline and restarts it when they're
 * back, so a dropped phone doesn't eat the team's time. Returns the same room
 * when nothing changes.
 */
export function syncPresence(room: RoomData, online: ReadonlySet<string>, now: number): RoomData {
  const turn = room.game.turn;
  if (!turn || turn.phase !== "running") return room;
  const listenerHere = online.has(turn.listenerId);
  let game = room.game;
  if (!listenerHere && turn.pausedAt === null) game = G.pause(G.tick(game, now), now);
  else if (listenerHere && turn.pausedAt !== null) game = G.resume(game, now);
  return game === room.game ? room : { ...room, game };
}

/** Clock alarm: ends the turn if its 3 minutes are up. */
export function tickRoom(room: RoomData, now: number): RoomData {
  const game = G.tick(room.game, now);
  return game === room.game ? room : { ...room, game };
}

/** When the room next needs waking: the end of a running turn, or else the time it expires. */
export function nextAlarm(room: RoomData): number {
  const expiry = room.lastActiveAt + ROOM_TTL_MS;
  const turnEnd = room.game.turn ? endsAt(room.game.turn) : null;
  return turnEnd === null ? expiry : Math.min(turnEnd, expiry);
}

/** What one player sees. `online` holds the public ids with an open connection. */
export function viewFor(room: RoomData, playerId: string, online: ReadonlySet<string>, now: number): RoomView {
  const { game } = room;
  const toView = (p: { id: string; name: string; team: TeamId }): PlayerView => ({ ...p, connected: online.has(p.id) });
  const teams = Object.fromEntries(TEAMS.map((t) => [t, G.teamMembers(game, t).map(toView)])) as Record<TeamId, PlayerView[]>;
  const me = game.players.find((p) => p.id === playerId);
  const check = G.canStart(game);
  return {
    code: room.code,
    phase: game.phase,
    you: me ? toView(me) : null,
    isHost: game.hostId === playerId,
    hostId: game.hostId,
    teams,
    startBlocker: check.ok ? null : check.message,
    songCount: game.pool.length,
    source: room.source,
    packs: PACKS.map((p) => ({ id: p.id, name: p.name, count: p.songs.length })),
    turn: game.turn ? turnView(game, game.turn, playerId, now) : null,
    history: game.history.map((t) => summary(game, t)),
    scores: G.scores(game),
  };
}

function turnView(game: Game, turn: Turn, playerId: string, now: number): TurnView {
  const player = game.players.find((p) => p.id === playerId);
  const role: Role =
    turn.listenerId === playerId ? "listener" : player?.team === turn.team ? "guesser" : "watcher";
  const isListener = role === "listener";
  const over = turn.phase === "over";
  const check = canReveal(turn);
  return {
    round: turn.round,
    team: turn.team,
    listenerId: turn.listenerId,
    listenerName: nameOf(game, turn.listenerId),
    phase: turn.phase,
    role,
    choices: isListener && turn.phase === "ready" ? turn.choices : null,
    song: isListener || over ? turn.song : null,
    elapsed: elapsed(turn, now),
    paused: turn.pausedAt !== null,
    albumKnown: turn.song?.album != null,
    deductions: moveDeductions(turn),
    points: pointsLeft(turn, now),
    hints: turn.hints.map((h) => ({ text: h.text, cost: h.cost })),
    freeHintsLeft: freeHintsLeft(turn),
    nextHintCost: nextHintCost(turn),
    reveal: turn.reveal ? { kind: turn.reveal.kind, value: turn.reveal.value } : null,
    // Only the listener may learn the album is self-titled; it would hint at the answer.
    revealBlocker: check.ok ? null : check.reason === "self-titled" && !isListener ? null : check.reason,
    guesses: turn.guesses.map((g) => ({ playerName: nameOf(game, g.playerId), text: g.text, correct: g.correct, counted: g.counted })),
    result: turn.result ? { reason: turn.result.reason, points: turn.result.points } : null,
  };
}

function summary(game: Game, turn: Turn): TurnSummary {
  return {
    round: turn.round,
    team: turn.team,
    listenerName: nameOf(game, turn.listenerId),
    song: turn.song,
    points: turn.result?.points ?? 0,
    reason: turn.result?.reason ?? "voided",
  };
}

function nameOf(game: Game, playerId: string): string {
  return game.players.find((p) => p.id === playerId)?.name ?? "Someone who left";
}
