// Numbers from the game guide (CG Template 2). Everything that scores or times a turn reads from here.
export const RULES = {
  rounds: 10,
  /** Earnable points at the start of every turn. */
  startingPoints: 100,
  turnSeconds: 180,
  /** One point is lost every this many seconds (10 a minute). */
  secondsPerPoint: 6,
  freeHints: 3,
  extraHintCost: 50,
  wrongGuessCost: 20,
  revealCost: 50,
  minPlayersPerTeam: 2,
  /** Songs the listener may swap out before the clock starts. */
  skipsPerTurn: 1,
} as const;

export const TEAMS = ["green", "black"] as const;

/** One song per turn, so a game needs at least this many. */
export const MIN_SONGS = RULES.rounds * TEAMS.length;
