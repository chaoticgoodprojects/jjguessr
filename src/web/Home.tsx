import { useState, type FormEvent } from "react";
import { CODE_LENGTH, isRoomCode } from "../shared/protocol";
import { seatToken } from "./identity";

export function Home({ onOpenGame }: { onOpenGame: (code: string) => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      onOpenGame(await createGame());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create a game. Try again.");
      setBusy(false);
    }
  };

  const join = (e: FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!isRoomCode(c)) return setError(`Game codes are ${CODE_LENGTH} letters, like KPRT.`);
    onOpenGame(c);
  };

  return (
    <main className="page">
      <header className="masthead panel">
        <h1>jjguessr</h1>
        <span className="meta">Two teams · 10 rounds · Name that song</span>
      </header>

      <section className="panel stack">
        <h2>New game</h2>
        <button className="button primary" onClick={create} disabled={busy}>
          {busy ? "Creating…" : "Create a game"}
        </button>
      </section>

      <form className="panel stack" onSubmit={join}>
        <h2>Join a game</h2>
        <label className="label" htmlFor="code">
          Game code
        </label>
        <div className="row">
          <input
            id="code"
            className="input code-input"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={CODE_LENGTH}
            autoComplete="off"
            autoCapitalize="characters"
            placeholder="KPRT"
          />
          <button className="button" type="submit">
            Join
          </button>
        </div>
      </form>

      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}

/** Asks the server for a new game. Errors say what went wrong, so a screenshot is enough to fix it. */
async function createGame(): Promise<string> {
  const res = await fetch("/api/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: seatToken() }),
  }).catch(() => null);
  if (!res) throw new Error("Couldn't reach the game server. Check your connection and try again.");
  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`Couldn't create a game (server said ${res.status}${text ? `: ${text.slice(0, 120)}` : ""}).`);
  let code: unknown = null;
  try {
    code = (JSON.parse(text) as { code?: unknown }).code;
  } catch {
    // Not JSON, most likely a web page; reported below.
  }
  if (typeof code !== "string" || !isRoomCode(code)) {
    throw new Error("Couldn't create a game (the server sent something other than a game code).");
  }
  return code;
}
