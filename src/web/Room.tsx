import { useEffect, useState, type FormEvent } from "react";
import type { ClientMessage, RoomView } from "../shared/protocol";
import { Finished } from "./Finished";
import { markRulesSeen, rulesSeen } from "./identity";
import { JoinForm, Players } from "./Players";
import { RulesDialog } from "./Rules";
import { TurnScreen } from "./Turn";
import { useRoom } from "./useRoom";

export function Room({ code, onHome }: { code: string; onHome: () => void }) {
  const { view, connection, error, send } = useRoom(code);
  // The rules pop up the first time this browser opens a game, and the ? button brings them back.
  const [rulesOpen, setRulesOpen] = useState(() => !rulesSeen(code));
  const closeRules = () => {
    markRulesSeen(code);
    setRulesOpen(false);
  };

  if (connection === "missing") {
    return (
      <main className="page">
        <section className="panel stack">
          <h2>No game with that code</h2>
          <p>Check the code with whoever sent the link. Games are cleared a day after they're last played.</p>
          <button className="button" onClick={onHome}>
            Back to start
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <TopBar code={code} connection={connection} onRules={() => setRulesOpen(true)} />
      <RulesDialog open={rulesOpen} onClose={closeRules} />
      {!view ? (
        <p className="meta">Connecting…</p>
      ) : view.phase === "lobby" ? (
        <Lobby view={view} send={send} error={error} />
      ) : view.phase === "playing" && view.turn ? (
        <TurnScreen view={view} send={send} />
      ) : (
        <Finished view={view} />
      )}
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}

function TopBar({ code, connection, onRules }: { code: string; connection: string; onRules: () => void }) {
  const [copied, setCopied] = useState(false);
  const link = `${location.origin}/r/${code}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt("Copy this link", link);
    }
  };
  return (
    <header className="topbar panel">
      <div className="stack tight">
        <span className="kicker">jjguessr</span>
        <span className="game-code" aria-label={`Game code ${code.split("").join(" ")}`}>
          {code}
        </span>
      </div>
      <div className="stack tight end">
        <div className="row center">
          <button className="button small" onClick={copy}>
            {copied ? "Link copied" : "Copy game link"}
          </button>
          <button className="help" aria-label="Rules" onClick={onRules}>
            ?
          </button>
        </div>
        {connection === "reconnecting" && <span className="meta">Reconnecting…</span>}
      </div>
    </header>
  );
}

function Lobby({ view, send, error }: { view: RoomView; send: (m: ClientMessage) => void; error: string | null }) {
  const host = [...view.teams.green, ...view.teams.black].find((p) => p.id === view.hostId);
  return (
    <>
      {!view.you && <JoinForm view={view} send={send} />}
      <Players view={view} send={send} />

      <Songs view={view} send={send} error={error} />

      <section className="panel stack">
        {view.isHost ? (
          <>
            <button className="button primary" disabled={view.startBlocker !== null} onClick={() => send({ type: "start" })}>
              Start the game
            </button>
            {view.startBlocker && <p className="meta">{view.startBlocker}</p>}
          </>
        ) : (
          <>
            <p>{host ? `Waiting for ${host.name} to start the game.` : "Waiting for the host to start the game."}</p>
            {view.startBlocker && <p className="meta">{view.startBlocker}</p>}
          </>
        )}
      </section>
    </>
  );
}

/** The host picks a song pack or pastes a public Spotify playlist; everyone else sees the choice. */
function Songs({ view, send, error }: { view: RoomView; send: (m: ClientMessage) => void; error: string | null }) {
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(false);
  const { source } = view;

  // A new source or an error means the playlist request finished; give up waiting after 20 seconds regardless.
  const sourceKey = JSON.stringify(source);
  useEffect(() => setLoading(false), [sourceKey, error]);
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setLoading(false), 20_000);
    return () => clearTimeout(t);
  }, [loading]);

  const summary = `${source.name} · ${view.songCount} songs`;
  if (!view.isHost) {
    return (
      <section className="panel stack">
        <span className="label">Songs</span>
        <p>{summary}</p>
      </section>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!link.trim()) return;
    setLoading(true);
    send({ type: "usePlaylist", link });
  };

  return (
    <section className="panel stack" aria-label="Songs">
      <h2>Songs</h2>
      <div className="folder-tabs" role="radiogroup" aria-label="Song packs">
        {view.packs.map((p) => {
          const selected = source.kind === "pack" && source.id === p.id;
          return (
            <button
              key={p.id}
              role="radio"
              aria-checked={selected}
              className={`tab small ${selected ? "selected" : ""}`}
              onClick={() => send({ type: "usePack", packId: p.id })}
            >
              {p.name}
            </button>
          );
        })}
      </div>
      <form className="stack" onSubmit={submit}>
        <label className="label" htmlFor="playlist">
          Or paste a public Spotify playlist link
        </label>
        <div className="row">
          <input
            id="playlist"
            className="input small-input"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://open.spotify.com/playlist/…"
            autoComplete="off"
            inputMode="url"
          />
          <button className="button" type="submit" disabled={!link.trim() || loading}>
            {loading ? "Reading…" : "Use playlist"}
          </button>
        </div>
      </form>
      <p className="meta" data-testid="song-source">
        Using {summary}
      </p>
      {source.kind === "playlist" && <p className="meta">Playlists don't list albums, so only the artist can be revealed.</p>}
    </section>
  );
}
