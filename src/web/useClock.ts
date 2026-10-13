import { useEffect, useState } from "react";
import { RULES } from "../rules";
import type { TurnView } from "../shared/protocol";

/**
 * The turn clock, counted down in the browser between server updates. The
 * server stays in charge: every view it sends resets the starting point, and
 * it ends the turn itself when time is up.
 */
export function useClock(turn: TurnView | null): { secondsLeft: number; points: number } {
  const [received, setReceived] = useState(() => performance.now());
  const [now, setNow] = useState(received);

  useEffect(() => {
    const t = performance.now();
    setReceived(t);
    setNow(t);
  }, [turn]);

  const ticking = turn?.phase === "running" && !turn.paused;
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(id);
  }, [ticking]);

  if (!turn) return { secondsLeft: RULES.turnSeconds, points: RULES.startingPoints };
  if (turn.result) return { secondsLeft: Math.max(0, RULES.turnSeconds - turn.elapsed), points: turn.result.points };
  const elapsed = Math.min(RULES.turnSeconds, turn.elapsed + (ticking ? (now - received) / 1000 : 0));
  const timeCost = Math.floor(elapsed / RULES.secondsPerPoint);
  return {
    secondsLeft: RULES.turnSeconds - elapsed,
    points: Math.max(0, RULES.startingPoints - timeCost - turn.deductions),
  };
}

export function formatClock(seconds: number): string {
  const s = Math.ceil(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
