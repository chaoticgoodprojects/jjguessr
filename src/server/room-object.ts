/**
 * The Durable Object that hosts one room. It keeps the RoomData in storage,
 * holds every player's WebSocket (hibernation API, so idle rooms cost
 * nothing), and after each change sends every player their own view. Its
 * single alarm fires when a turn's time runs out or the room expires.
 */
import { DurableObject } from "cloudflare:workers";
import { isToken, parseClientMessage, type ServerMessage } from "../shared/protocol";
import {
  attempt,
  canChangeSongs,
  createRoom,
  handle,
  nextAlarm,
  rejoin,
  returningPlayer,
  ROOM_TTL_MS,
  seat,
  syncPresence,
  tickRoom,
  useSongs,
  viewFor,
  type HandleResult,
  type RoomData,
} from "./room";
import { fetchPublicPlaylist, playlistIdFrom } from "./spotify";

const STORAGE_KEY = "room";

interface Attachment {
  playerId: string;
  /** Missing on sockets opened before rejoining existed. */
  token?: string;
}

export class RoomObject extends DurableObject<Env> {
  private room: RoomData | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.room = (await ctx.storage.get<RoomData>(STORAGE_KEY)) ?? null;
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/init" && request.method === "POST") return this.init(request);
    if (!this.room) return new Response("No game with that code.", { status: 404 });
    if (url.pathname === "/info") return Response.json({ code: this.room.code, phase: this.room.game.phase });
    if (url.pathname === "/ws") return this.openSocket(request, url);
    return new Response("Not found", { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (!this.room) return;
    const msg = typeof raw === "string" ? parseClientMessage(raw) : null;
    if (!msg) return send(ws, { type: "error", message: "The app sent something the game didn't understand. Try reloading." });
    const { playerId, token } = ws.deserializeAttachment() as Attachment;

    // Coming back as an away player, by tapping their name or typing it again.
    const comingBack =
      msg.type === "rejoin" ? msg.playerId : msg.type === "join" ? returningPlayer(this.room, playerId, msg.name, this.online()) : null;
    if (comingBack) {
      if (!token) return send(ws, { type: "error", message: "Reload the page and try again." });
      const seated = rejoin(this.room, token, playerId, comingBack, this.online());
      if (!seated.ok) return send(ws, { type: "error", message: seated.message });
      ws.serializeAttachment({ playerId: seated.playerId, token } satisfies Attachment);
      return this.update(seated.room);
    }
    if (msg.type === "rejoin") return;

    const result = msg.type === "usePlaylist" ? await this.loadPlaylist(playerId, msg.link) : handle(this.room, playerId, msg, Date.now());
    if (!result.ok) return send(ws, { type: "error", message: result.message });
    await this.update(result.room);
  }

  /** Public ids with an open connection, leaving out a socket on its way out. */
  private online(closing?: WebSocket): Set<string> {
    const sockets = this.ctx.getWebSockets().filter((ws) => ws !== closing && ws.readyState === WebSocket.OPEN);
    return new Set(sockets.map((ws) => (ws.deserializeAttachment() as Attachment).playerId));
  }

  /** Reads a pasted public playlist and, if the room still allows it after the fetch, swaps it in. */
  private async loadPlaylist(playerId: string, link: string): Promise<HandleResult> {
    const allowed = canChangeSongs(this.room!, playerId);
    if (!allowed.ok) return allowed;
    const id = playlistIdFrom(link);
    if (!id) return { ok: false, message: "That doesn't look like a Spotify playlist link. Copy it from Share → Copy link to playlist." };
    const playlist = await fetchPublicPlaylist(id);
    if (!playlist.ok) return playlist;
    // Other moves may have landed while we waited on Spotify, so apply to the room as it is now.
    if (!this.room) return { ok: false, message: "This game has expired." };
    return attempt(() => useSongs(this.room!, playerId, playlist.songs, { kind: "playlist", name: playlist.name }, Date.now()));
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    if (this.room) await this.update(this.room, ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    if (this.room) await this.update(this.room, ws);
  }

  async alarm(): Promise<void> {
    if (!this.room) return;
    const now = Date.now();
    if (now >= this.room.lastActiveAt + ROOM_TTL_MS) {
      for (const ws of this.ctx.getWebSockets()) ws.close(1000, "This game has expired.");
      this.room = null;
      await this.ctx.storage.deleteAll();
      return;
    }
    await this.update(tickRoom(this.room, now));
    // update() only re-arms when something changed; an early wake still needs the next one.
    if (this.room) await this.ctx.storage.setAlarm(nextAlarm(this.room));
  }

  private async init(request: Request): Promise<Response> {
    if (this.room) return new Response("Code taken", { status: 409 });
    const { code, token } = (await request.json()) as { code: string; token: string };
    await this.save(createRoom(code, token, Date.now(), newId));
    return new Response(null, { status: 201 });
  }

  private async openSocket(request: Request, url: URL): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected a WebSocket", { status: 426 });
    const token = url.searchParams.get("token") ?? "";
    if (!isToken(token)) return new Response("Bad token", { status: 400 });
    const seated = seat(this.room!, token, newId);

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ playerId: seated.playerId, token } satisfies Attachment);
    await this.update(seated.room);
    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * Applies who's online (pausing or resuming the clock), saves if anything
   * changed, and sends everyone their view. `closing` is a socket on its way out.
   */
  private async update(room: RoomData, closing?: WebSocket): Promise<void> {
    const now = Date.now();
    const sockets = this.ctx.getWebSockets().filter((ws) => ws !== closing && ws.readyState === WebSocket.OPEN);
    const online = this.online(closing);
    const synced = syncPresence(room, online, now);
    if (synced !== this.room) await this.save(synced);
    for (const ws of sockets) {
      const { playerId } = ws.deserializeAttachment() as Attachment;
      send(ws, { type: "state", state: viewFor(synced, playerId, online, now) });
    }
  }

  private async save(room: RoomData): Promise<void> {
    this.room = room;
    await this.ctx.storage.put(STORAGE_KEY, room);
    await this.ctx.storage.setAlarm(nextAlarm(room));
  }
}

function send(ws: WebSocket, msg: ServerMessage): void {
  try {
    ws.send(JSON.stringify(msg));
  } catch {
    // The socket closed between the check and the send; its close handler will rebroadcast.
  }
}

function newId(): string {
  return crypto.randomUUID().slice(0, 8);
}
