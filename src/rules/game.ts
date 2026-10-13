/**
 * A whole game: the lobby, listener rotation, the song pool, and turn order
 * (10 rounds, green then black each round). Pure, like turn.ts. The `rng`
 * argument picks which songs the listener is offered, so tests can make that
 * predictable.
 */
import { MIN_SONGS, RULES, TEAMS } from "./config";
import { RuleError } from "./errors";
import * as T from "./turn";
import type { Player, RevealKind, Song, TeamId, Turn } from "./types";

export type Rng = () => number;

export interface Game {
  hostId: string;
  /** In join order, which is also listener order within each team. */
  players: Player[];
  /**
   * Songs not played yet. A song leaves when a listener picks it and the
   * clock starts, guessed or not. Songs offered but not picked stay in.
   */
  pool: Song[];
  phase: "lobby" | "playing" | "finished";
  /** 0-based position in the 20-turn order. */
  turnNumber: number;
  turn: Turn | null;
  history: Turn[];
}

const MAX_NAME = 24;
export const TOTAL_TURNS = RULES.rounds * TEAMS.length;

export function createGame(hostId: string, songs: Song[]): Game {
  return { hostId, players: [], pool: uniqueSongs(songs), phase: "lobby", turnNumber: 0, turn: null, history: [] };
}

/** The host swaps the song list while still in the lobby. */
export function setSongs(game: Game, byPlayerId: string, songs: Song[]): Game {
  assertHost(game, byPlayerId);
  if (game.phase !== "lobby") throw new RuleError("game-already-started", "The songs are locked once the game starts.");
  return { ...game, pool: uniqueSongs(songs) };
}

function uniqueSongs(songs: Song[]): Song[] {
  const seen = new Set<string>();
  return songs.filter((s) => !seen.has(s.id) && seen.add(s.id));
}

/** Joining, or changing name or team while still in the lobby. Late joiners join the rotation. */
export function join(game: Game, player: Player): Game {
  const name = player.name.trim().replace(/\s+/g, " ");
  if (!name) throw new RuleError("empty-text", "Put a name down to join.");
  if (name.length > MAX_NAME) throw new RuleError("text-too-long", `Names can be up to ${MAX_NAME} characters.`);
  const existing = game.players.find((p) => p.id === player.id);
  if (existing && existing.team !== player.team && game.phase !== "lobby") {
    throw new RuleError("game-already-started", "Teams are locked once the game starts.");
  }
  const clean = { ...player, name };
  const players = existing
    ? game.players.map((p) => (p.id === player.id ? clean : p))
    : [...game.players, clean];
  return { ...game, players };
}

export function leave(game: Game, playerId: string): Game {
  return { ...game, players: game.players.filter((p) => p.id !== playerId) };
}

export function teamMembers(game: Game, team: TeamId): Player[] {
  return game.players.filter((p) => p.team === team);
}

export function canStart(game: Game): { ok: true } | { ok: false; code: "not-enough-players" | "not-enough-songs"; message: string } {
  for (const team of TEAMS) {
    if (teamMembers(game, team).length < RULES.minPlayersPerTeam) {
      return { ok: false, code: "not-enough-players", message: `Each team needs at least ${RULES.minPlayersPerTeam} players.` };
    }
  }
  if (game.pool.length < MIN_SONGS) {
    return { ok: false, code: "not-enough-songs", message: `The playlist needs at least ${MIN_SONGS} songs; this one has ${game.pool.length}.` };
  }
  return { ok: true };
}

export function start(game: Game, byPlayerId: string, rng: Rng = Math.random): Game {
  assertHost(game, byPlayerId);
  if (game.phase !== "lobby") throw new RuleError("game-already-started", "The game has already started.");
  const check = canStart(game);
  if (!check.ok) throw new RuleError(check.code, check.message);
  return dealTurn({ ...game, phase: "playing", turnNumber: 0 }, rng);
}

export function roundOf(turnNumber: number): number {
  return Math.floor(turnNumber / TEAMS.length) + 1;
}

export function teamOf(turnNumber: number): TeamId {
  return TEAMS[turnNumber % TEAMS.length]!;
}

/** Each round the next teammate in join order listens, wrapping around. */
export function listenerFor(game: Game, team: TeamId, round: number): Player {
  const members = teamMembers(game, team);
  if (members.length === 0) throw new RuleError("not-enough-players", `The ${team} team has no players.`);
  return members[(round - 1) % members.length]!;
}

/** Totals so far, including the current turn once it has ended. */
export function scores(game: Game): Record<TeamId, number> {
  const totals = Object.fromEntries(TEAMS.map((t) => [t, 0])) as Record<TeamId, number>;
  const done = game.turn?.result ? [...game.history, game.turn] : game.history;
  for (const turn of done) totals[turn.team] += turn.result?.points ?? 0;
  return totals;
}

export function winner(game: Game): TeamId | "tie" | null {
  if (game.phase !== "finished") return null;
  const s = scores(game);
  return s.green === s.black ? "tie" : s.green > s.black ? "green" : "black";
}

// Moves. Each checks who is allowed to make it, then hands off to turn.ts.

export function pickSong(game: Game, byPlayerId: string, songId: string): Game {
  const turn = currentTurn(game);
  assertListener(turn, byPlayerId);
  return { ...game, turn: T.pickSong(turn, songId) };
}

/** Starting the clock locks in the listener's pick and takes it out of the pool for good. */
export function startClock(game: Game, byPlayerId: string, now: number): Game {
  const turn = currentTurn(game);
  assertListener(turn, byPlayerId);
  const started = T.startClock(turn, now);
  const pool = game.pool.filter((s) => s.id !== started.song?.id);
  return { ...game, pool, turn: started };
}

export function giveHint(game: Game, byPlayerId: string, text: string, now: number): Game {
  const turn = currentTurn(game);
  assertListener(turn, byPlayerId);
  return { ...game, turn: T.giveHint(turn, text, now) };
}

export function reveal(game: Game, byPlayerId: string, kind: RevealKind, now: number): Game {
  const turn = currentTurn(game);
  assertListener(turn, byPlayerId);
  return { ...game, turn: T.reveal(turn, kind, now) };
}

export function guess(game: Game, byPlayerId: string, text: string, now: number): Game {
  const turn = currentTurn(game);
  const player = game.players.find((p) => p.id === byPlayerId);
  if (!player || player.team !== turn.team || player.id === turn.listenerId) {
    throw new RuleError("not-guesser", "Only the listener's teammates can guess this turn.");
  }
  return { ...game, turn: T.guess(turn, byPlayerId, text, now) };
}

export function countGuess(game: Game, byPlayerId: string, guessIndex: number): Game {
  const turn = currentTurn(game);
  assertListener(turn, byPlayerId);
  return { ...game, turn: T.countGuess(turn, guessIndex) };
}

export function pause(game: Game, now: number): Game {
  return { ...game, turn: T.pause(currentTurn(game), now) };
}

export function resume(game: Game, now: number): Game {
  return { ...game, turn: T.resume(currentTurn(game), now) };
}

export function voidTurn(game: Game, byPlayerId: string, now: number): Game {
  assertHost(game, byPlayerId);
  return { ...game, turn: T.voidTurn(currentTurn(game), now) };
}

/** Clock tick from the server: ends the current turn if its time is up. */
export function tick(game: Game, now: number): Game {
  if (!game.turn) return game;
  const turn = T.settle(game.turn, now);
  return turn === game.turn ? game : { ...game, turn };
}

/** Moves on once the current turn is over: next team's turn, or the end of the game after round 10. */
export function nextTurn(game: Game, rng: Rng = Math.random): Game {
  const turn = currentTurn(game);
  if (turn.phase !== "over") throw new RuleError("turn-not-running", "Finish this turn first.");
  const moved = { ...game, history: [...game.history, turn], turn: null, turnNumber: game.turnNumber + 1 };
  if (moved.turnNumber >= TOTAL_TURNS) return { ...moved, phase: "finished" };
  return dealTurn(moved, rng);
}

function dealTurn(game: Game, rng: Rng): Game {
  const round = roundOf(game.turnNumber);
  const team = teamOf(game.turnNumber);
  const listener = listenerFor(game, team, round);
  if (game.pool.length === 0) throw new RuleError("no-songs-left", "The playlist has run out of songs.");
  const choices = sample(game.pool, RULES.songChoices, rng);
  return { ...game, turn: T.createTurn({ round, team, listenerId: listener.id, choices }) };
}

/** Up to `n` different songs from the pool, at random. */
function sample(pool: Song[], n: number, rng: Rng): Song[] {
  const left = [...pool];
  const picked: Song[] = [];
  while (picked.length < n && left.length > 0) {
    const i = Math.min(Math.floor(rng() * left.length), left.length - 1);
    picked.push(left.splice(i, 1)[0]!);
  }
  return picked;
}

function currentTurn(game: Game): Turn {
  if (game.phase === "lobby") throw new RuleError("game-not-started", "The game hasn't started yet.");
  if (game.phase === "finished" || !game.turn) throw new RuleError("game-over", "The game is over.");
  return game.turn;
}

function assertListener(turn: Turn, playerId: string): void {
  if (turn.listenerId !== playerId) throw new RuleError("not-listener", "Only this turn's listener can do that.");
}

function assertHost(game: Game, playerId: string): void {
  if (game.hostId !== playerId) throw new RuleError("not-host", "Only the host can do that.");
}
