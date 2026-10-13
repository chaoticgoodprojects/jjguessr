import { useState, type FormEvent } from "react";
import { RULES, TEAMS, type TeamId } from "../rules";
import type { ClientMessage, PlayerView, RoomView } from "../shared/protocol";
import { lastName, rememberName } from "./identity";
import { useRoom } from "./useRoom";

const TEAM_NAME: Record<TeamId, string> = { green: "Green", black: "Black" };

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
        <Lobby view={view} send={send} />
      ) : (
        <Playing view={view} />
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

function Lobby({ view, send }: { view: RoomView; send: (m: ClientMessage) => void }) {
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

      <section className="panel stack">
        {view.isHost ? (
          <>
            <button className="button primary" disabled={view.startBlocker !== null} onClick={() => send({ type: "start" })}>
              Start the game
            </button>
            <p className="meta">{view.startBlocker ?? `${view.songCount} songs ready from the sample list.`}</p>
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

/** Stand-in until the turn screens land in the next milestone. */
function Playing({ view }: { view: RoomView }) {
  const turn = view.turn;
  return (
    <section className="panel stack">
      {turn ? (
        <>
          <span className="kicker">
            Round {turn.round} of {RULES.rounds}
          </span>
          <h2>
            <span className={`dot ${turn.team}`} /> {TEAM_NAME[turn.team]} team's turn
          </h2>
          <p>
            {turn.listenerId === view.you?.id ? "You're the listener this turn." : `${turn.listenerName} is the listener this turn.`}
          </p>
        </>
      ) : (
        <h2>Game over</h2>
      )}
      <div className="scores">
        {TEAMS.map((t) => (
          <div key={t} className="score">
            <span className="big">{view.scores[t]}</span>
            <span className="label">
              <span className={`dot ${t}`} /> {TEAM_NAME[t]}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
