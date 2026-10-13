import { describe, expect, it } from "vitest";
import { parseClientMessage } from "../shared/protocol";
import { createRoom, handle, nextAlarm, ROOM_TTL_MS, seat, syncPresence, viewFor } from "./room";
import { SAMPLE_SONGS } from "./sample-songs";

const NOW = 1_000_000;
const ids = () => {
  let n = 0;
  return () => `p${++n}`;
};

function setup() {
  const newId = ids();
  let room = createRoom("KPRT", "host-token-0000000", SAMPLE_SONGS, NOW, newId);
  const seatOf = (token: string) => {
    const s = seat(room, token, newId);
    room = s.room;
    return s.playerId;
  };
  const act = (playerId: string, raw: object, at = NOW + 1) => {
    const r = handle(room, playerId, parseClientMessage(JSON.stringify(raw))!, at, () => 0);
    if (r.ok) room = r.room;
    return r;
  };
  const setRoom = (r: typeof room) => (room = r);
  return { seatOf, act, room: () => room, setRoom };
}

/** Four players seated and joined, game started: Ann (host) and Cy on green, Bo and Di on black. */
function started() {
  const s = setup();
  const [ann, bo, cy, di] = ["host-token-0000000", "bo-token-00000000", "cy-token-00000000", "di-token-00000000"].map(s.seatOf) as [string, string, string, string];
  s.act(ann, { type: "join", name: "Ann", team: "green" });
  s.act(bo, { type: "join", name: "Bo", team: "black" });
  s.act(cy, { type: "join", name: "Cy", team: "green" });
  s.act(di, { type: "join", name: "Di", team: "black" });
  expect(s.act(ann, { type: "start" }).ok).toBe(true);
  return { ...s, ann, bo, cy, di };
}

describe("seats", () => {
  it("gives the creator the host seat and keeps it across reconnects", () => {
    const { seatOf } = setup();
    expect(seatOf("host-token-0000000")).toBe("p1");
    expect(seatOf("host-token-0000000")).toBe("p1");
    expect(seatOf("other-token-000000")).toBe("p2");
  });
});

describe("lobby to first turn", () => {
  it("lets players join, switch teams, and the host start once teams are full", () => {
    const { seatOf, act, room } = setup();
    const host = seatOf("host-token-0000000");
    const [b, c, d] = ["b", "c", "d"].map((x) => seatOf(`${x}-token-0000000000`)) as [string, string, string];

    act(host, { type: "join", name: "Ann", team: "green" });
    act(b, { type: "join", name: "Bo", team: "green" });
    act(c, { type: "join", name: "Cy", team: "black" });
    expect(act(host, { type: "start" })).toMatchObject({ ok: false, message: "Each team needs at least 2 players." });

    act(d, { type: "join", name: "Di", team: "green" });
    act(d, { type: "join", name: "Di", team: "black" });
    expect(act(host, { type: "start" }).ok).toBe(true);
    expect(room().game.turn).toMatchObject({ round: 1, team: "green", listenerId: host });
  });

  it("only lets the host start", () => {
    const { seatOf, act } = setup();
    const b = seatOf("b-token-0000000000");
    expect(act(b, { type: "start" })).toMatchObject({ ok: false, message: "Only the host can do that." });
  });
});

describe("what each player sees", () => {
  it("shows teams, who's online, and who the host is, but never the song pool", () => {
    const { seatOf, act, room } = setup();
    const host = seatOf("host-token-0000000");
    const b = seatOf("b-token-0000000000");
    act(host, { type: "join", name: "Ann", team: "green" });
    act(b, { type: "join", name: "Bo", team: "black" });

    const view = viewFor(room(), b, new Set([b]), NOW);
    expect(view.you).toEqual({ id: b, name: "Bo", team: "black", connected: true });
    expect(view.isHost).toBe(false);
    expect(view.teams.green).toEqual([{ id: host, name: "Ann", team: "green", connected: false }]);
    expect(view.startBlocker).toBe("Each team needs at least 2 players.");
    expect(JSON.stringify(view)).not.toContain(SAMPLE_SONGS[0]!.title);
  });

  it("shows nobody as joined before they put a name down", () => {
    const { seatOf, room } = setup();
    const b = seatOf("b-token-0000000000");
    expect(viewFor(room(), b, new Set([b]), NOW).you).toBeNull();
  });
});

describe("playing a turn", () => {
  it("shows the choices and the song only to the listener until the turn ends", () => {
    const { act, room, ann, bo, cy } = started();
    const all = new Set([ann, bo, cy]);
    const choices = viewFor(room(), ann, all, NOW).turn!.choices!;
    expect(choices).toHaveLength(5);
    expect(viewFor(room(), cy, all, NOW).turn!.choices).toBeNull();

    act(ann, { type: "pick", songId: choices[0]!.id });
    act(ann, { type: "startClock" }, NOW);
    const song = choices[0]!;
    expect(viewFor(room(), ann, all, NOW).turn!.song).toEqual(song);
    for (const p of [bo, cy]) {
      const v = viewFor(room(), p, all, NOW);
      expect(v.turn!.song).toBeNull();
      expect(JSON.stringify(v)).not.toContain(song.title);
    }
    expect(viewFor(room(), cy, all, NOW).turn!.role).toBe("guesser");
    expect(viewFor(room(), bo, all, NOW).turn!.role).toBe("watcher");

    expect(act(bo, { type: "guess", text: song.title }, NOW + 30_000)).toMatchObject({ ok: false });
    expect(act(cy, { type: "guess", text: song.title }, NOW + 30_000).ok).toBe(true);
    const after = viewFor(room(), bo, all, NOW + 31_000);
    expect(after.turn!.song).toEqual(song);
    expect(after.turn!.result).toEqual({ reason: "guessed", points: 95 });
    expect(after.scores).toEqual({ green: 95, black: 0 });
  });

  it("moves to the next team's turn when anyone in the game taps next", () => {
    const { act, room, ann, bo, cy } = started();
    act(ann, { type: "void" });
    expect(act(cy, { type: "next" }).ok).toBe(true);
    expect(room().game.turn).toMatchObject({ round: 1, team: "black", listenerId: bo });
    expect(viewFor(room(), cy, new Set(), NOW).history).toHaveLength(1);
  });

  it("pauses the clock while the listener is offline and resumes when they're back", () => {
    const { act, room, setRoom, ann, cy } = started();
    act(ann, { type: "pick", songId: room().game.turn!.choices[0]!.id });
    act(ann, { type: "startClock" }, NOW);
    setRoom(syncPresence(room(), new Set([cy]), NOW + 10_000));
    expect(room().game.turn!.pausedAt).toBe(NOW + 10_000);
    expect(viewFor(room(), cy, new Set([cy]), NOW + 60_000).turn).toMatchObject({ paused: true, elapsed: 10 });
    setRoom(syncPresence(room(), new Set([cy, ann]), NOW + 60_000));
    expect(viewFor(room(), cy, new Set([cy, ann]), NOW + 66_000).turn).toMatchObject({ paused: false, elapsed: 16 });
  });

  it("wakes the room when the turn's time runs out, or else when it expires", () => {
    const { act, room, ann } = started();
    expect(nextAlarm(room())).toBe(room().lastActiveAt + ROOM_TTL_MS);
    act(ann, { type: "pick", songId: room().game.turn!.choices[0]!.id });
    act(ann, { type: "startClock" }, NOW);
    expect(nextAlarm(room())).toBe(NOW + 180_000);
  });

  it("hides that an album is self-titled from everyone but the listener", () => {
    const { act, room, setRoom, ann, cy } = started();
    const selfTitled = { id: "st", title: "Say It Ain't So", artist: "Weezer", album: "Weezer (Blue Album)" };
    const r = room();
    setRoom({ ...r, game: { ...r.game, turn: { ...r.game.turn!, choices: [selfTitled] } } });
    act(ann, { type: "pick", songId: "st" });
    act(ann, { type: "startClock" }, NOW);
    expect(viewFor(room(), ann, new Set(), NOW).turn!.revealBlocker).toBe("self-titled");
    expect(viewFor(room(), cy, new Set(), NOW).turn!.revealBlocker).toBeNull();
  });
});

describe("parseClientMessage", () => {
  it("rejects anything that isn't a known move", () => {
    expect(parseClientMessage("not json")).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "join", name: "x", team: "purple" }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "start" }))).toEqual({ type: "start" });
    expect(parseClientMessage(JSON.stringify({ type: "reveal", kind: "lyrics" }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "count", guessIndex: 1.5 }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "guess", text: "hello" }))).toEqual({ type: "guess", text: "hello" });
  });
});
