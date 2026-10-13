/**
 * One game room, independent of how it's hosted. The Durable Object in
 * room-object.ts stores a RoomData and feeds it connections and messages;
 * tests drive the same functions directly.
 *
 * Players are known to the room by a secret token their browser keeps, and
 * to each other by a short public id. Tokens never leave the room.
 */
import { RuleError, TEAMS, game as G, type Game, type Rng, type Song, type TeamId } from "../rules";
import type { ClientMessage, PlayerView, RoomView } from "../shared/protocol";

export interface RoomData {
  code: string;
  game: Game;
  /** Secret token → public player id. */
  seats: Record<string, string>;
  createdAt: number;
  lastActiveAt: number;
}

export type IdGen = () => string;

export function createRoom(code: string, hostToken: string, songs: Song[], now: number, newId: IdGen): RoomData {
  const hostId = newId();
  return {
    code,
    game: G.createGame(hostId, songs),
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

export function handle(room: RoomData, playerId: string, msg: ClientMessage, now: number, rng: Rng = Math.random): HandleResult {
  try {
    const game = apply(room.game, playerId, msg, rng);
    return { ok: true, room: { ...room, game, lastActiveAt: now } };
  } catch (e) {
    if (e instanceof RuleError) return { ok: false, message: e.message };
    throw e;
  }
}

function apply(game: Game, playerId: string, msg: ClientMessage, rng: Rng): Game {
  switch (msg.type) {
    case "join":
      return G.join(game, { id: playerId, name: msg.name, team: msg.team });
    case "start":
      return G.start(game, playerId, rng);
  }
}

/** What one player sees. `online` holds the public ids with an open connection. */
export function viewFor(room: RoomData, playerId: string, online: ReadonlySet<string>): RoomView {
  const { game } = room;
  const toView = (p: { id: string; name: string; team: TeamId }): PlayerView => ({ ...p, connected: online.has(p.id) });
  const teams = Object.fromEntries(TEAMS.map((t) => [t, G.teamMembers(game, t).map(toView)])) as Record<TeamId, PlayerView[]>;
  const me = game.players.find((p) => p.id === playerId);
  const check = G.canStart(game);
  const turn = game.turn;
  const listener = turn && game.players.find((p) => p.id === turn.listenerId);
  return {
    code: room.code,
    phase: game.phase,
    you: me ? toView(me) : null,
    isHost: game.hostId === playerId,
    hostId: game.hostId,
    teams,
    startBlocker: check.ok ? null : check.message,
    songCount: game.pool.length,
    turn: turn
      ? { round: turn.round, team: turn.team, listenerId: turn.listenerId, listenerName: listener?.name ?? "" }
      : null,
    scores: G.scores(game),
  };
}

/** Rooms are cleared out a day after the last move. */
export const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
