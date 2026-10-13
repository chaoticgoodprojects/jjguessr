/**
 * The front door. Creates rooms and routes each room's traffic to its
 * Durable Object; everything else is the web app, served from static assets.
 *
 *   POST /api/rooms                 { token } → { code }
 *   GET  /api/rooms/:code           → 200 if the game exists, 404 if not
 *   GET  /api/rooms/:code/ws?token  → WebSocket into the room
 */
import { CODE_ALPHABET, CODE_LENGTH, isRoomCode, isToken } from "../shared/protocol";

export { RoomObject } from "./room-object";

const CREATE_ATTEMPTS = 8;

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] !== "api" || parts[1] !== "rooms") return env.ASSETS.fetch(request);

    if (parts.length === 2 && request.method === "POST") return createRoom(request, env);

    const code = (parts[2] ?? "").toUpperCase();
    if (!isRoomCode(code)) return new Response("No game with that code.", { status: 404 });
    const room = env.ROOMS.get(env.ROOMS.idFromName(code));
    if (parts.length === 3 && request.method === "GET") return room.fetch(new Request("https://room/info"));
    if (parts.length === 4 && parts[3] === "ws") {
      return room.fetch(new Request(`https://room/ws${url.search}`, request));
    }
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

async function createRoom(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token : "";
  if (!isToken(token)) return new Response("Bad token", { status: 400 });
  for (let i = 0; i < CREATE_ATTEMPTS; i++) {
    const code = randomCode();
    const room = env.ROOMS.get(env.ROOMS.idFromName(code));
    const res = await room.fetch("https://room/init", { method: "POST", body: JSON.stringify({ code, token }) });
    if (res.status === 201) return Response.json({ code }, { status: 201 });
  }
  return new Response("Couldn't find a free game code. Try again.", { status: 503 });
}

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}
