import { useEffect, useState, type FormEvent } from "react";
import { TEAMS, type TeamId } from "../rules";
import type { ClientMessage, PlayerView, RoomView } from "../shared/protocol";
import { Finished } from "./Finished";
import { lastName, rememberName } from "./identity";
import { TEAM_NAME, TurnScreen } from "./Turn";
import { useRoom } from "./useRoom";

export function Room({ code, onHome }: { code: string; onHome: () => void }) {
  const { view, connection, error, send } = useRoom(code);

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
      <TopBar code={code} connection={connection} />
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

function TopBar({ code, connection }: { code: string; connection: string }) {
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
        <button className="button small" onClick={copy}>
          {copied ? "Link copied" : "Copy game link"}
        </button>
        {connection === "reconnecting" && <span className="meta">Reconnecting…</span>}
      </div>
    </header>
  );
}

function Lobby({ view, send, error }: { view: RoomView; send: (m: ClientMessage) => void; error: string | null }) {
  const host = [...view.teams.green, ...view.teams.black].find((p) => p.id === view.hostId);
  return (
    <>
      {view.you ? (
        <section className="teams">
          {TEAMS.map((team) => (
            <TeamPanel key={team} team={team} view={view} send={send} />
          ))}
        </section>
      ) : (
        <JoinForm send={send} />
      )}

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

function JoinForm({ send }: { send: (m: ClientMessage) => void }) {
  const [name, setName] = useState(lastName);
  const [team, setTeam] = useState<TeamId | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!team) return;
    rememberName(name.trim());
    send({ type: "join", name, team });
  };

  return (
    <form className="panel stack" onSubmit={submit}>
      <h2>Join this game</h2>
      <label className="label" htmlFor="name">
        Your name
      </label>
      <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} autoComplete="nickname" />
      <span className="label">Team</span>
      <div className="tabs" role="radiogroup" aria-label="Team">
        {TEAMS.map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={team === t}
            className={`tab ${team === t ? "selected" : ""}`}
            onClick={() => setTeam(t)}
          >
            <span className={`dot ${t}`} /> {TEAM_NAME[t]}
          </button>
        ))}
      </div>
      <button className="button primary" type="submit" disabled={!name.trim() || !team}>
        Join
      </button>
    </form>
  );
}

function TeamPanel({ team, view, send }: { team: TeamId; view: RoomView; send: (m: ClientMessage) => void }) {
  const players = view.teams[team];
  const mine = view.you?.team === team;
  return (
    <div className="panel stack" data-team={team}>
      <h2>
        <span className={`dot ${team}`} /> {TEAM_NAME[team]}
      </h2>
      {players.length === 0 ? (
        <p className="meta">No one yet</p>
      ) : (
        <ul className="roster">
          {players.map((p) => (
            <PlayerRow key={p.id} player={p} view={view} />
          ))}
        </ul>
      )}
      {!mine && view.you && (
        <button className="button small" onClick={() => send({ type: "join", name: view.you!.name, team })}>
          Switch to {TEAM_NAME[team]}
        </button>
      )}
    </div>
  );
}

function PlayerRow({ player, view }: { player: PlayerView; view: RoomView }) {
  return (
    <li className={player.connected ? "" : "offline"}>
      <span>{player.name}</span>
      {player.id === view.you?.id && <span className="chip solid">You</span>}
      {player.id === view.hostId && <span className="chip">Host</span>}
      {!player.connected && <span className="chip dashed">Away</span>}
    </li>
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
