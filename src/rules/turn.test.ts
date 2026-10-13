import { describe, expect, it } from "vitest";
import { RuleError } from "./errors";
import * as T from "./turn";
import type { Song, Turn } from "./types";

const SONG: Song = { id: "s1", title: "Don't Stop Me Now - Remastered 2011", artist: "Queen", album: "Jazz" };
const SELF_TITLED: Song = { id: "s2", title: "Say It Ain't So", artist: "Weezer", album: "Weezer (Blue Album)" };

const T0 = 1_000_000;
/** Wall clock `secs` seconds after the clock started. */
const at = (secs: number) => T0 + secs * 1000;

function running(song: Song = SONG): Turn {
  return T.startClock(T.createTurn({ round: 1, team: "green", listenerId: "lis", song }), T0);
}

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    if (e instanceof RuleError) return e.code;
    throw e;
  }
  return undefined;
}

describe("starting points and the clock", () => {
  it("starts at 100 and loses 1 point every 6 seconds", () => {
    const t = running();
    expect(T.pointsLeft(t, at(0))).toBe(100);
    expect(T.pointsLeft(t, at(5.9))).toBe(100);
    expect(T.pointsLeft(t, at(6))).toBe(99);
    expect(T.pointsLeft(t, at(60))).toBe(90);
    expect(T.pointsLeft(t, at(179))).toBe(71);
  });

  it("does not run before the listener starts the clock", () => {
    const t = T.createTurn({ round: 1, team: "green", listenerId: "lis", song: SONG });
    expect(T.elapsed(t, at(100))).toBe(0);
    expect(T.pointsLeft(t, at(100))).toBe(100);
    expect(code(() => T.guess(t, "p", "anything", at(1)))).toBe("turn-not-running");
  });

  it("ends the turn with 0 points at 3:00", () => {
    const t = T.settle(running(), at(180));
    expect(t.phase).toBe("over");
    expect(t.result).toEqual({ reason: "time", points: 0, at: 180 });
  });

  it("rejects a correct guess that arrives after time is up", () => {
    expect(code(() => T.guess(running(), "p", "don't stop me now", at(181)))).toBe("turn-over");
  });

  it("freezes while paused and picks up where it left off", () => {
    let t = T.pause(running(), at(30));
    expect(T.elapsed(t, at(500))).toBe(30);
    expect(code(() => T.giveHint(t, "a hint", at(40)))).toBe("paused");
    t = T.resume(t, at(500));
    expect(T.elapsed(t, at(506))).toBe(36);
    expect(T.pointsLeft(t, at(506))).toBe(94);
  });
});

describe("hints", () => {
  it("gives 3 free hints, then charges 50 for each extra one", () => {
    let t = running();
    for (const h of ["guitar", "70s", "british"]) {
      expect(T.nextHintCost(t)).toBe(0);
      t = T.giveHint(t, h, at(0));
    }
    expect(T.pointsLeft(t, at(0))).toBe(100);
    expect(T.freeHintsLeft(t)).toBe(0);
    expect(T.nextHintCost(t)).toBe(50);
    t = T.giveHint(t, "piano", at(0));
    expect(T.pointsLeft(t, at(0))).toBe(50);
  });

  it("keeps every hint on the turn until it ends", () => {
    let t = T.giveHint(running(), "  upbeat   anthem ", at(3));
    t = T.guess(t, "p", "we will rock you", at(10));
    t = T.guess(t, "p", "dont stop me now", at(20));
    expect(t.hints.map((h) => h.text)).toEqual(["upbeat anthem"]);
  });

  it("refuses blank hints", () => {
    expect(code(() => T.giveHint(running(), "   ", at(1)))).toBe("empty-text");
  });
});

describe("guesses", () => {
  it("banks the points left on a correct guess", () => {
    const t = T.guess(running(), "p", "don't stop me now", at(30));
    expect(t.result).toEqual({ reason: "guessed", points: 95, at: 30 });
  });

  it("takes 20 off for each wrong guess", () => {
    let t = T.guess(running(), "p", "bohemian rhapsody", at(0));
    expect(T.pointsLeft(t, at(0))).toBe(80);
    t = T.guess(t, "p", "we are the champions", at(0));
    expect(T.pointsLeft(t, at(0))).toBe(60);
  });

  it("ends the turn when wrong guesses use up the points", () => {
    let t = running();
    for (let i = 0; i < 4; i++) t = T.guess(t, "p", `wrong ${i}`, at(0));
    expect(t.phase).toBe("running");
    t = T.guess(t, "p", "wrong again", at(0));
    expect(t.result).toEqual({ reason: "no-points", points: 0, at: 0 });
  });
});

describe("reveal", () => {
  it("reveals the artist or the album once, for 50", () => {
    let t = T.reveal(running(), "artist", at(0));
    expect(t.reveal).toMatchObject({ kind: "artist", value: "Queen" });
    expect(T.pointsLeft(t, at(0))).toBe(50);
    expect(code(() => T.reveal(t, "album", at(1)))).toBe("already-revealed");
  });

  it("is not allowed on a self-titled album", () => {
    const t = running(SELF_TITLED);
    expect(T.canReveal(t)).toEqual({ ok: false, reason: "self-titled" });
    expect(code(() => T.reveal(t, "album", at(1)))).toBe("self-titled");
  });
});

describe("worked examples from the plan", () => {
  it("A: right at 1:30 after 1 wrong guess and 3 hints banks 65", () => {
    let t = running();
    t = T.giveHint(t, "rock", at(5));
    t = T.giveHint(t, "70s", at(20));
    t = T.guess(t, "p", "bohemian rhapsody", at(40));
    t = T.giveHint(t, "having a good time", at(60));
    t = T.guess(t, "p", "Dont Stop Me Now", at(90));
    expect(t.result).toEqual({ reason: "guessed", points: 65, at: 90 });
  });

  it("B: a 4th hint then a reveal at 1:00 ends the turn on 0", () => {
    let t = running();
    for (const h of ["a", "b", "c", "d"]) t = T.giveHint(t, h, at(60));
    expect(T.pointsLeft(t, at(60))).toBe(40);
    t = T.reveal(t, "album", at(60));
    expect(t.result).toEqual({ reason: "no-points", points: 0, at: 60 });
  });
});

describe("count it", () => {
  it("gives the points the team had at the moment of that guess", () => {
    let t = T.guess(running(), "p", "dont stop me know", at(12)); // fuzzy match already accepts this…
    expect(t.result?.reason).toBe("guessed");

    t = running();
    t = T.guess(t, "p", "the one about having a good time", at(30)); // …but not this, so -20
    t = T.giveHint(t, "a", at(40));
    expect(T.pointsLeft(t, at(42))).toBe(73);
    t = T.countGuess(t, 0);
    // 100 - 5 for 30 seconds; the guess's own 20 is refunded and the later hint doesn't count
    expect(t.result).toEqual({ reason: "guessed", points: 95, at: 30 });
    expect(t.guesses[0]).toMatchObject({ correct: true, counted: true });
  });

  it("can rescue a turn that just ran out of time", () => {
    let t = T.guess(running(), "p", "good time song", at(170));
    t = T.settle(t, at(180));
    expect(t.result?.reason).toBe("time");
    t = T.countGuess(t, 0);
    expect(t.result).toEqual({ reason: "guessed", points: 72, at: 170 });
  });

  it("can't overturn a voided turn", () => {
    let t = T.guess(running(), "p", "good time song", at(10));
    t = T.voidTurn(t, at(20));
    expect(code(() => T.countGuess(t, 0))).toBe("cannot-count");
  });
});

describe("skip and void", () => {
  it("allows one skip, only before the clock starts", () => {
    const ready = T.createTurn({ round: 1, team: "green", listenerId: "lis", song: SONG });
    const skipped = T.skipSong(ready, SELF_TITLED);
    expect(skipped.song).toBe(SELF_TITLED);
    expect(code(() => T.skipSong(skipped, SONG))).toBe("no-skips-left");
    expect(code(() => T.skipSong(running(), SONG))).toBe("turn-not-ready");
  });

  it("voids a turn to 0 points", () => {
    expect(T.voidTurn(running(), at(50)).result).toEqual({ reason: "voided", points: 0, at: 50 });
  });
});
