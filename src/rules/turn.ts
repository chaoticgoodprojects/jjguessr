/**
 * One team's turn: the clock, hints, guesses, the reveal, and the points left.
 *
 * Every function is pure. Callers pass the wall clock (`now`, in ms) so the
 * game server is the only clock anyone trusts, and tests can step time freely.
 * Moves return a new Turn and throw RuleError when the rules say no.
 */
import { RULES } from "./config";
import { RuleError } from "./errors";
import { isSelfTitled, titleMatches } from "./match";
import type { Guess, RevealKind, Song, TeamId, Turn, TurnEndReason, TurnSeconds } from "./types";

const MAX_TEXT = 200;
const MAX_TIME_PENALTY = Math.floor(RULES.turnSeconds / RULES.secondsPerPoint);

export function createTurn(init: { round: number; team: TeamId; listenerId: string; choices: Song[] }): Turn {
  return {
    ...init,
    song: null,
    phase: "ready",
    startedAt: null,
    pausedAt: null,
    pausedMs: 0,
    seq: 0,
    hints: [],
    guesses: [],
    reveal: null,
    result: null,
  };
}

/** Seconds on the turn clock, with pauses taken out. Stops when the turn ends. */
export function elapsed(turn: Turn, now: number): TurnSeconds {
  if (turn.result) return turn.result.at;
  if (turn.startedAt === null) return 0;
  const until = turn.pausedAt ?? now;
  const secs = (until - turn.startedAt - turn.pausedMs) / 1000;
  return Math.min(Math.max(secs, 0), RULES.turnSeconds);
}

export function secondsLeft(turn: Turn, now: number): TurnSeconds {
  return RULES.turnSeconds - elapsed(turn, now);
}

/** 1 point every 6 seconds. */
export function timePenalty(at: TurnSeconds): number {
  return Math.min(Math.floor(at / RULES.secondsPerPoint), MAX_TIME_PENALTY);
}

/** Points lost to extra hints, wrong guesses and the reveal, counting only moves made before `beforeSeq`. */
export function moveDeductions(turn: Turn, beforeSeq = Infinity): number {
  let total = 0;
  for (const h of turn.hints) if (h.seq < beforeSeq) total += h.cost;
  for (const g of turn.guesses) if (g.seq < beforeSeq && !g.correct) total += RULES.wrongGuessCost;
  if (turn.reveal && turn.reveal.seq < beforeSeq) total += RULES.revealCost;
  return total;
}

/** What the team would bank if they guessed right now. */
export function pointsLeft(turn: Turn, now: number): number {
  if (turn.result) return turn.result.points;
  return Math.max(0, RULES.startingPoints - timePenalty(elapsed(turn, now)) - moveDeductions(turn));
}

export function nextHintCost(turn: Turn): number {
  return turn.hints.length >= RULES.freeHints ? RULES.extraHintCost : 0;
}

export function freeHintsLeft(turn: Turn): number {
  return Math.max(0, RULES.freeHints - turn.hints.length);
}

/** Whether the listener may still reveal, and why not if they can't. */
export function canReveal(turn: Turn): { ok: true } | { ok: false; reason: "already-revealed" | "self-titled" } {
  if (turn.reveal) return { ok: false, reason: "already-revealed" };
  if (turn.song && isSelfTitled(turn.song.artist, turn.song.album)) return { ok: false, reason: "self-titled" };
  return { ok: true };
}

/** The listener chooses this turn's song from the choices offered. They can change their mind until the clock starts. */
export function pickSong(turn: Turn, songId: string): Turn {
  if (turn.phase !== "ready") throw new RuleError("turn-not-ready", "The song is locked once the clock starts.");
  const song = turn.choices.find((s) => s.id === songId);
  if (!song) throw new RuleError("not-a-choice", "That song isn't one of this turn's choices.");
  return { ...turn, song };
}

export function startClock(turn: Turn, now: number): Turn {
  if (turn.phase !== "ready") throw new RuleError("turn-not-ready", "This turn has already started.");
  if (!turn.song) throw new RuleError("no-song-picked", "Pick a song first.");
  return { ...turn, phase: "running", startedAt: now };
}

/** Freezes the clock, for example while the listener reconnects. */
export function pause(turn: Turn, now: number): Turn {
  const t = settle(turn, now);
  assertRunning(t);
  return { ...t, pausedAt: now };
}

export function resume(turn: Turn, now: number): Turn {
  if (turn.pausedAt === null) throw new RuleError("not-paused", "The clock isn't paused.");
  return { ...turn, pausedMs: turn.pausedMs + (now - turn.pausedAt), pausedAt: null };
}

export function giveHint(turn: Turn, text: string, now: number): Turn {
  const t = settle(turn, now);
  assertLive(t);
  const clean = cleanText(text);
  const hint = { seq: t.seq, text: clean, at: elapsed(t, now), cost: nextHintCost(t) };
  return endIfNoPoints({ ...t, seq: t.seq + 1, hints: [...t.hints, hint] }, now);
}

export function reveal(turn: Turn, kind: RevealKind, now: number): Turn {
  const t = settle(turn, now);
  assertLive(t);
  const check = canReveal(t);
  if (!check.ok) {
    throw check.reason === "self-titled"
      ? new RuleError("self-titled", "This song is on a self-titled album, so neither the artist nor the album can be revealed.")
      : new RuleError("already-revealed", "The artist or album has already been revealed this turn.");
  }
  const song = pickedSong(t);
  const value = kind === "artist" ? song.artist : song.album;
  const r = { seq: t.seq, kind, value, at: elapsed(t, now) };
  return endIfNoPoints({ ...t, seq: t.seq + 1, reveal: r }, now);
}

export function guess(turn: Turn, playerId: string, text: string, now: number): Turn {
  const t = settle(turn, now);
  assertLive(t);
  const clean = cleanText(text);
  const at = elapsed(t, now);
  const correct = titleMatches(clean, pickedSong(t).title);
  const g: Guess = { seq: t.seq, playerId, text: clean, at, correct, counted: false };
  const next = { ...t, seq: t.seq + 1, guesses: [...t.guesses, g] };
  if (correct) return end(next, "guessed", pointsLeft(t, now), at);
  return endIfNoPoints(next, now);
}

/**
 * The listener's "Count it" for a guess the app wrongly rejected. The team
 * gets the points they had at the moment of that guess. Allowed until the
 * game moves on, so a turn that just timed out can still be rescued.
 */
export function countGuess(turn: Turn, guessIndex: number): Turn {
  const g = turn.guesses[guessIndex];
  if (!g) throw new RuleError("no-such-guess", "That guess doesn't exist.");
  if (g.correct) throw new RuleError("already-correct", "That guess already counted.");
  if (turn.phase === "ready") throw new RuleError("turn-not-running", "The clock hasn't started.");
  if (turn.result && (turn.result.reason === "guessed" || turn.result.reason === "voided")) {
    throw new RuleError("cannot-count", "This turn is already settled.");
  }
  const points = Math.max(0, RULES.startingPoints - timePenalty(g.at) - moveDeductions(turn, g.seq));
  const guesses = turn.guesses.map((x, i) => (i === guessIndex ? { ...x, correct: true, counted: true } : x));
  return { ...turn, phase: "over", pausedAt: null, guesses, result: { reason: "guessed", points, at: g.at } };
}

/** The host's call when someone breaks a rule: the turn ends with 0 points. */
export function voidTurn(turn: Turn, now: number): Turn {
  const t = settle(turn, now);
  return end(t, "voided", 0, elapsed(t, now));
}

/** Ends the turn if time ran out. Call it on every clock tick and before every move. */
export function settle(turn: Turn, now: number): Turn {
  if (turn.phase !== "running") return turn;
  if (elapsed(turn, now) >= RULES.turnSeconds) return end(turn, "time", 0, RULES.turnSeconds);
  return turn;
}

function endIfNoPoints(turn: Turn, now: number): Turn {
  return pointsLeft(turn, now) <= 0 ? end(turn, "no-points", 0, elapsed(turn, now)) : turn;
}

function end(turn: Turn, reason: TurnEndReason, points: number, at: TurnSeconds): Turn {
  if (turn.result) return turn;
  return { ...turn, phase: "over", pausedAt: null, result: { reason, points, at } };
}

function assertRunning(turn: Turn): void {
  if (turn.phase === "ready") throw new RuleError("turn-not-running", "The clock hasn't started.");
  if (turn.phase === "over") throw new RuleError("turn-over", "This turn is over.");
}

function assertLive(turn: Turn): void {
  assertRunning(turn);
  if (turn.pausedAt !== null) throw new RuleError("paused", "The clock is paused.");
}

/** A running turn always has a song: startClock refuses without one. */
function pickedSong(turn: Turn): Song {
  if (!turn.song) throw new RuleError("no-song-picked", "Pick a song first.");
  return turn.song;
}

function cleanText(text: string): string {
  const clean = text.trim().replace(/\s+/g, " ");
  if (!clean) throw new RuleError("empty-text", "Type something first.");
  if (clean.length > MAX_TEXT) throw new RuleError("text-too-long", `Keep it under ${MAX_TEXT} characters.`);
  return clean;
}
