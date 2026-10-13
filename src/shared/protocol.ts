/**
 * Messages between a player's browser and their game's room on the server.
 * Players send moves; the room answers every change with a fresh RoomView,
 * cut down to what that player is allowed to see.
 */
import type { RevealKind, Song, TeamId, TurnEndReason } from "../rules";

export type ClientMessage =
  | { type: "join"; name: string; team: TeamId }
  | { type: "start" }
  | { type: "usePack"; packId: string }
  | { type: "usePlaylist"; link: string }
  | { type: "pick"; songId: string }
  | { type: "startClock" }
  | { type: "hint"; text: string }
  | { type: "reveal"; kind: RevealKind }
  | { type: "guess"; text: string }
  | { type: "count"; guessIndex: number }
  | { type: "void" }
  | { type: "next" };

export type ServerMessage =
  | { type: "state"; state: RoomView }
  | { type: "error"; message: string };

export interface PlayerView {
  id: string;
  name: string;
  team: TeamId;
  connected: boolean;
}

export type Role = "listener" | "guesser" | "watcher";

export interface TurnView {
  round: number;
  team: TeamId;
  listenerId: string;
  listenerName: string;
  phase: "ready" | "running" | "over";
  role: Role;
  /** The songs to pick from. Listener only, before the clock starts. */
  choices: Song[] | null;
  /** The listener always sees their pick; everyone else sees it once the turn is over. */
  song: Song | null;
  /** Seconds on the clock when this view was sent. */
  elapsed: number;
  paused: boolean;
  /** False for songs from a pasted playlist, which only allow the artist reveal. */
  albumKnown: boolean;
  /** Points lost to extra hints, wrong guesses and the reveal. Time comes off on top. */
  deductions: number;
  points: number;
  hints: { text: string; cost: number }[];
  freeHintsLeft: number;
  nextHintCost: number;
  reveal: { kind: RevealKind; value: string } | null;
  /** Why a reveal isn't allowed, or null if it is. */
  revealBlocker: "already-revealed" | "self-titled" | null;
  guesses: { playerName: string; text: string; correct: boolean; counted: boolean }[];
  result: { reason: TurnEndReason; points: number } | null;
}

export interface TurnSummary {
  round: number;
  team: TeamId;
  listenerName: string;
  song: Song | null;
  points: number;
  reason: TurnEndReason;
}

/** Where the game's songs come from. */
export type SongSource = { kind: "pack"; id: string; name: string } | { kind: "playlist"; name: string };

export interface PackInfo {
  id: string;
  name: string;
  count: number;
}

export interface RoomView {
  code: string;
  phase: "lobby" | "playing" | "finished";
  /** This player, once they've put a name down. */
  you: PlayerView | null;
  isHost: boolean;
  hostId: string;
  teams: Record<TeamId, PlayerView[]>;
  /** Why the host can't start yet, or null when they can. */
  startBlocker: string | null;
  songCount: number;
  source: SongSource;
  packs: PackInfo[];
  turn: TurnView | null;
  history: TurnSummary[];
  scores: Record<TeamId, number>;
}

/** Room codes: 4 consonants, so codes are easy to read aloud and never spell a word. */
export const CODE_ALPHABET = "BCDFGHJKLMNPQRSTVWXZ";
export const CODE_LENGTH = 4;

export function isRoomCode(s: string): boolean {
  return s.length === CODE_LENGTH && [...s].every((c) => CODE_ALPHABET.includes(c));
}

/** A browser's secret seat token: proves "I'm the same player" on reconnect. */
export function isToken(s: string): boolean {
  return /^[A-Za-z0-9-]{16,64}$/.test(s);
}

export function parseClientMessage(raw: string): ClientMessage | null {
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof m !== "object" || m === null) return null;
  const o = m as Record<string, unknown>;
  switch (o.type) {
    case "start":
    case "startClock":
    case "void":
    case "next":
      return { type: o.type };
    case "join":
      return typeof o.name === "string" && (o.team === "green" || o.team === "black")
        ? { type: "join", name: o.name, team: o.team }
        : null;
    case "pick":
      return typeof o.songId === "string" ? { type: "pick", songId: o.songId } : null;
    case "usePack":
      return typeof o.packId === "string" ? { type: "usePack", packId: o.packId } : null;
    case "usePlaylist":
      return typeof o.link === "string" ? { type: "usePlaylist", link: o.link } : null;
    case "hint":
    case "guess":
      return typeof o.text === "string" ? { type: o.type, text: o.text } : null;
    case "reveal":
      return o.kind === "artist" || o.kind === "album" ? { type: "reveal", kind: o.kind } : null;
    case "count":
      return Number.isInteger(o.guessIndex) ? { type: "count", guessIndex: o.guessIndex as number } : null;
    default:
      return null;
  }
}
