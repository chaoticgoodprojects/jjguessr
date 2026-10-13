import { describe, expect, it } from "vitest";
import { parseClientMessage } from "../shared/protocol";
import { createRoom, handle, seat, viewFor, type RoomData } from "./room";
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
  const act = (playerId: string, raw: object) => {
    const r = handle(room, playerId, parseClientMessage(JSON.stringify(raw))!, NOW + 1, () => 0);
    if (r.ok) room = r.room;
    return r;
  };
  return { seatOf, act, room: () => room };
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

    const view = viewFor(room(), b, new Set([b]));
    expect(view.you).toEqual({ id: b, name: "Bo", team: "black", connected: true });
    expect(view.isHost).toBe(false);
    expect(view.teams.green).toEqual([{ id: host, name: "Ann", team: "green", connected: false }]);
    expect(view.startBlocker).toBe("Each team needs at least 2 players.");
    expect(JSON.stringify(view)).not.toContain(SAMPLE_SONGS[0]!.title);
  });

  it("shows nobody as joined before they put a name down", () => {
    const { seatOf, room } = setup();
    const b = seatOf("b-token-0000000000");
    expect(viewFor(room(), b, new Set([b])).you).toBeNull();
  });
});

describe("parseClientMessage", () => {
  it("rejects anything that isn't a known move", () => {
    expect(parseClientMessage("not json")).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "join", name: "x", team: "purple" }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "start" }))).toEqual({ type: "start" });
  });
});
