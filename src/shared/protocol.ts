/**
 * Messages between a player's browser and their game's room on the server.
 * Players send moves; the room answers every change with a fresh RoomView,
 * cut down to what that player is allowed to see.
 */
import type { TeamId } from "../rules";

export type ClientMessage =
  | { type: "join"; name: string; team: TeamId }
  | { type: "start" };

export type ServerMessage =
  | { type: "state"; state: RoomView }
  | { type: "error"; message: string };

export interface PlayerView {
  id: string;
  name: string;
  team: TeamId;
  connected: boolean;
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
  turn: { round: number; team: TeamId; listenerId: string; listenerName: string } | null;
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
  if (o.type === "start") return { type: "start" };
  if (o.type === "join" && typeof o.name === "string" && (o.team === "green" || o.team === "black")) {
    return { type: "join", name: o.name, team: o.team };
  }
  return null;
}
