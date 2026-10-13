import type { TEAMS } from "./config";

export type TeamId = (typeof TEAMS)[number];

export interface Song {
  id: string;
  title: string;
  artist: string;
  album: string;
}

export interface Player {
  id: string;
  name: string;
  team: TeamId;
}

export type RevealKind = "artist" | "album";

/** Elapsed turn time in seconds, measured from the moment the clock started, with pauses removed. */
export type TurnSeconds = number;

export interface Hint {
  /** Order among all hints, guesses and reveals in the turn. */
  seq: number;
  text: string;
  at: TurnSeconds;
  cost: number;
}

export interface Guess {
  seq: number;
  playerId: string;
  text: string;
  at: TurnSeconds;
  correct: boolean;
  /** True when the listener used "Count it" on a guess the app rejected. */
  counted: boolean;
}

export interface Reveal {
  seq: number;
  kind: RevealKind;
  value: string;
  at: TurnSeconds;
}

export type TurnEndReason = "guessed" | "time" | "no-points" | "voided";

export interface TurnResult {
  reason: TurnEndReason;
  points: number;
  at: TurnSeconds;
}

export interface Turn {
  round: number;
  team: TeamId;
  listenerId: string;
  /** Songs offered to the listener for this turn. */
  choices: Song[];
  /** The listener's pick. Can change until the clock starts. */
  song: Song | null;
  phase: "ready" | "running" | "over";
  /** Wall clock (ms) when the clock started. */
  startedAt: number | null;
  /** Wall clock (ms) when the current pause began, if paused. */
  pausedAt: number | null;
  /** Total ms spent paused before the current pause. */
  pausedMs: number;
  /** Next sequence number for a hint, guess or reveal. */
  seq: number;
  hints: Hint[];
  guesses: Guess[];
  reveal: Reveal | null;
  result: TurnResult | null;
}
