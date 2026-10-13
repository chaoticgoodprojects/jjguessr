export type RuleErrorCode =
  | "turn-not-ready"
  | "turn-not-running"
  | "turn-over"
  | "paused"
  | "not-paused"
  | "no-skips-left"
  | "empty-text"
  | "text-too-long"
  | "already-revealed"
  | "self-titled"
  | "no-such-guess"
  | "already-correct"
  | "cannot-count"
  | "not-enough-players"
  | "not-enough-songs"
  | "no-songs-left"
  | "game-not-started"
  | "game-over"
  | "game-already-started"
  | "not-listener"
  | "not-guesser"
  | "not-host"
  | "unknown-player";

/** A move the rules don't allow. The message is shown to players as is. */
export class RuleError extends Error {
  constructor(
    readonly code: RuleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RuleError";
  }
}
