import { describe, expect, it } from "vitest";
import { RuleError } from "./errors";
import * as G from "./game";
import type { Game } from "./game";
import type { Player, Song } from "./types";

const songs: Song[] = Array.from({ length: 24 }, (_, i) => ({
  id: `s${i}`,
  title: `Song Number ${i}`,
  artist: `Artist ${i}`,
  album: `Album ${i}`,
}));

/** Always takes the first song left in the pool. */
const first = () => 0;
const T0 = 1_000_000;

const PLAYERS: Player[] = [
  { id: "ann", name: "Ann", team: "green" },
  { id: "bo", name: "Bo", team: "black" },
  { id: "cy", name: "Cy", team: "green" },
  { id: "di", name: "Di", team: "black" },
  { id: "ed", name: "Ed", team: "green" },
];

function lobby(players = PLAYERS, pool = songs): Game {
  return players.reduce((g, p) => G.join(g, p), G.createGame("ann", pool));
}

/** The listener picks the first song offered and starts the clock. */
function play(g: Game, now = T0): Game {
  const turn = g.turn!;
  return G.startClock(G.pickSong(g, turn.listenerId, turn.choices[0]!.id), turn.listenerId, now);
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

describe("lobby", () => {
  it("needs 2 players per team and 20 songs to start", () => {
    expect(G.canStart(lobby(PLAYERS.slice(0, 3)))).toMatchObject({ ok: false, code: "not-enough-players" });
    expect(G.canStart(lobby(PLAYERS, songs.slice(0, 19)))).toMatchObject({ ok: false, code: "not-enough-songs" });
    expect(G.canStart(lobby())).toEqual({ ok: true });
  });

  it("requires a name", () => {
    expect(code(() => G.join(G.createGame("ann", songs), { id: "x", name: "  ", team: "green" }))).toBe("empty-text");
  });

  it("only lets the host start", () => {
    expect(code(() => G.start(lobby(), "bo", first))).toBe("not-host");
  });

  it("locks teams once the game starts", () => {
    const g = G.start(lobby(), "ann", first);
    expect(code(() => G.join(g, { id: "bo", name: "Bo", team: "green" }))).toBe("game-already-started");
  });
});

describe("turn order and listeners", () => {
  it("plays 10 rounds, green then black, rotating listeners in join order", () => {
    let g = G.start(lobby(), "ann", first);
    const order: string[] = [];
    while (g.phase === "playing") {
      const turn = g.turn!;
      order.push(`${turn.round}${turn.team[0]}:${turn.listenerId}`);
      g = G.voidTurn(g, "ann", T0);
      g = G.nextTurn(g, first);
    }
    expect(order).toHaveLength(20);
    expect(order.slice(0, 8)).toEqual(["1g:ann", "1b:bo", "2g:cy", "2b:di", "3g:ed", "3b:bo", "4g:ann", "4b:di"]);
    expect(g.phase).toBe("finished");
  });

  it("removes a song once it's played, guessed or not, and keeps the ones passed over", () => {
    let g = G.start(lobby(), "ann", first);
    expect(g.pool).toHaveLength(songs.length);
    g = play(g);
    const played = g.turn!.song!.id;
    expect(g.pool.map((s) => s.id)).not.toContain(played);
    expect(g.pool).toHaveLength(songs.length - 1);
    g = G.nextTurn(G.voidTurn(g, "ann", T0), first);
    expect(g.turn!.choices.map((s) => s.id)).not.toContain(played);
  });
});

describe("who can do what", () => {
  it("only the listener picks, starts the clock, hints and reveals", () => {
    const g = G.start(lobby(), "ann", first);
    expect(code(() => G.pickSong(g, "cy", g.turn!.choices[0]!.id))).toBe("not-listener");
    const picked = G.pickSong(g, "ann", g.turn!.choices[0]!.id);
    expect(code(() => G.startClock(picked, "cy", T0))).toBe("not-listener");
    const live = G.startClock(picked, "ann", T0);
    expect(code(() => G.giveHint(live, "cy", "hi", T0))).toBe("not-listener");
    expect(code(() => G.reveal(live, "bo", "artist", T0))).toBe("not-listener");
  });

  it("only the listener's teammates can guess", () => {
    const g = play(G.start(lobby(), "ann", first));
    expect(code(() => G.guess(g, "ann", "x", T0))).toBe("not-guesser");
    expect(code(() => G.guess(g, "bo", "x", T0))).toBe("not-guesser");
    expect(G.guess(g, "cy", "x", T0).turn!.guesses).toHaveLength(1);
  });
});

describe("song choices", () => {
  it("offers the listener 5 different songs from the pool", () => {
    const g = G.start(lobby(), "ann", Math.random);
    const ids = g.turn!.choices.map((s) => s.id);
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
    for (const id of ids) expect(g.pool.map((s) => s.id)).toContain(id);
  });

  it("offers whatever is left when fewer than 5 songs remain", () => {
    let g = G.start(lobby(PLAYERS, songs.slice(0, 20)), "ann", first);
    while (g.turnNumber < 18) g = G.nextTurn(G.voidTurn(play(g), "ann", T0), first);
    expect(g.turn!.choices).toHaveLength(2);
  });
});

describe("scoring a game", () => {
  it("adds banked points to the team that earned them", () => {
    let g = play(G.start(lobby(), "ann", first));
    g = G.guess(g, "cy", g.turn!.song!.title, T0 + 30_000);
    expect(G.scores(g)).toEqual({ green: 95, black: 0 });
    g = play(G.nextTurn(g, first));
    g = G.tick(g, T0 + 180_000);
    expect(g.turn!.result?.reason).toBe("time");
    expect(G.scores(G.nextTurn(g, first))).toEqual({ green: 95, black: 0 });
  });

  it("won't move on until the turn is over", () => {
    const g = play(G.start(lobby(), "ann", first));
    expect(code(() => G.nextTurn(g, first))).toBe("turn-not-running");
  });
});

describe("changing the songs", () => {
  it("lets the host swap the song list in the lobby only", () => {
    const g = lobby();
    expect(G.setSongs(g, "ann", songs.slice(0, 21)).pool).toHaveLength(21);
    expect(code(() => G.setSongs(g, "bo", songs))).toBe("not-host");
    expect(code(() => G.setSongs(G.start(g, "ann", first), "ann", songs))).toBe("game-already-started");
  });
});

describe("names", () => {
  it("keeps names unique, ignoring case and spacing", () => {
    const g = lobby();
    expect(code(() => G.join(g, { id: "x", name: " ann ", team: "black" }))).toBe("name-taken");
    expect(G.findByName(g, "  CY ")?.id).toBe("cy");
    // Re-sending your own name (to switch teams) is fine.
    expect(G.join(g, { id: "ann", name: "Ann", team: "black" }).players.find((p) => p.id === "ann")?.team).toBe("black");
  });
});

describe("the host rearranging players", () => {
  it("moves and removes anyone in the lobby", () => {
    let g = G.movePlayer(lobby(), "ann", "bo", "green");
    expect(G.teamMembers(g, "green").map((p) => p.id)).toEqual(["ann", "bo", "cy", "ed"]);
    g = G.removePlayer(g, "ann", "ed");
    expect(g.players.map((p) => p.id)).toEqual(["ann", "bo", "cy", "di"]);
  });

  it("is host only, and the host stays in", () => {
    expect(code(() => G.movePlayer(lobby(), "bo", "di", "green"))).toBe("not-host");
    expect(code(() => G.removePlayer(lobby(), "bo", "di"))).toBe("not-host");
    expect(code(() => G.removePlayer(lobby(), "ann", "ann"))).toBe("cant-remove-host");
    expect(code(() => G.removePlayer(lobby(), "ann", "zed"))).toBe("unknown-player");
  });

  it("during the game, leaves the current listener alone until their turn ends", () => {
    const g = G.start(lobby(), "ann", first); // Ann listens first
    expect(code(() => G.movePlayer(g, "ann", "ann", "black"))).toBe("listener-busy");
    const over = G.voidTurn(play(g), "ann", T0 + 1000);
    expect(G.movePlayer(over, "ann", "ann", "black").players.find((p) => p.id === "ann")?.team).toBe("black");
  });

  it("during the game, keeps at least 2 players on each team", () => {
    const g = G.start(lobby(), "ann", first); // green: Ann, Cy, Ed; black: Bo, Di
    expect(code(() => G.removePlayer(g, "ann", "di"))).toBe("not-enough-players");
    expect(code(() => G.movePlayer(g, "ann", "bo", "green"))).toBe("not-enough-players");
    const moved = G.movePlayer(g, "ann", "ed", "black");
    expect(G.teamMembers(moved, "black").map((p) => p.id)).toEqual(["bo", "di", "ed"]);
    expect(G.removePlayer(moved, "ann", "di").players.some((p) => p.id === "di")).toBe(false);
  });

  it("picks future listeners from the teams as they are now", () => {
    let g = G.start(lobby(), "ann", first);
    g = G.movePlayer(g, "ann", "cy", "black"); // green: Ann, Ed; black in join order: Bo, Cy, Di
    while (g.turnNumber < 3) g = G.nextTurn(G.voidTurn(play(g), "ann", T0 + 1000), first);
    expect(g.turn).toMatchObject({ round: 2, team: "black", listenerId: "cy" }); // Di's turn before the move
  });
});
