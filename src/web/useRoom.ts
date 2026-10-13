import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, RoomView, ServerMessage } from "../shared/protocol";
import { seatToken } from "./identity";

export type Connection = "connecting" | "open" | "reconnecting" | "missing";

const MAX_BACKOFF_MS = 8000;
const ERROR_SHOWN_MS = 5000;

/** Keeps a live connection to one room, reconnecting on drops, and holds the latest view. */
export function useRoom(code: string) {
  const [view, setView] = useState<RoomView | null>(null);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [error, setError] = useState<string | null>(null);
  const socket = useRef<WebSocket | null>(null);

  useEffect(() => {
    let stopped = false;
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const open = async () => {
      const info = await fetch(`/api/rooms/${code}`).catch(() => null);
      if (stopped) return;
      if (info?.status === 404) return setConnection("missing");

      const proto = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${location.host}/api/rooms/${code}/ws?token=${encodeURIComponent(seatToken())}`);
      socket.current = ws;
      ws.onopen = () => {
        attempt = 0;
        setConnection("open");
      };
      ws.onmessage = (e) => {
        const msg = JSON.parse(String(e.data)) as ServerMessage;
        if (msg.type === "state") setView(msg.state);
        else setError(msg.message);
      };
      ws.onclose = () => {
        if (socket.current === ws) socket.current = null;
        if (stopped) return;
        setConnection("reconnecting");
        retry = setTimeout(open, Math.min(1000 * 2 ** attempt++, MAX_BACKOFF_MS));
      };
    };

    open();
    return () => {
      stopped = true;
      clearTimeout(retry);
      socket.current?.close();
      socket.current = null;
    };
  }, [code]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), ERROR_SHOWN_MS);
    return () => clearTimeout(t);
  }, [error]);

  const send = useCallback((msg: ClientMessage) => {
    const ws = socket.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    else setError("Not connected right now. Trying again…");
  }, []);

  return { view, connection, error, send };
}
