import { useState, type FormEvent } from "react";
import { TEAMS, type TeamId } from "../rules";
import type { ClientMessage, PlayerView, RoomView } from "../shared/protocol";
import { ConfirmButton, TEAM_NAME } from "./common";
import { lastName, rememberName } from "./identity";

type Send = (m: ClientMessage) => void;

/** Both teams side by side, green on the left. The host can swap or remove anyone. */
export function Players({ view, send }: { view: RoomView; send: Send }) {
  return (
    <section className="teams" aria-label="Players">
      {TEAMS.map((team) => (
        <div key={team} className="panel stack team" data-team={team}>
          <h2>
            <span className={`dot ${team}`} /> {TEAM_NAME[team]}
          </h2>
          {view.teams[team].length === 0 ? (
            <p className="meta">No one yet</p>
          ) : (
            <ul className="roster">
              {view.teams[team].map((p) => (
                <PlayerRow key={p.id} player={p} view={view} send={send} />
              ))}
            </ul>
          )}
          {view.phase === "lobby" && !view.isHost && view.you && view.you.team !== team && (
            <button className="button small" onClick={() => send({ type: "join", name: view.you!.name, team })}>
              Switch to {TEAM_NAME[team]}
            </button>
          )}
        </div>
      ))}
    </section>
  );
}

function PlayerRow({ player, view, send }: { player: PlayerView; view: RoomView; send: Send }) {
  const other: TeamId = player.team === "green" ? "black" : "green";
  const listening = view.phase === "playing" && view.turn?.listenerId === player.id;
  // The listener can't be moved mid-turn, so don't offer it.
  const busy = listening && view.turn?.phase !== "over";
  return (
    <li className={player.connected ? "" : "offline"}>
      <span className="player-name">{player.name}</span>
      {player.id === view.you?.id && <span className="chip solid">You</span>}
      {player.id === view.hostId && <span className="chip">Host</span>}
      {listening && <span className="chip">Listener</span>}
      {!player.connected && <span className="chip dashed">Away</span>}
      {view.isHost && view.phase !== "finished" && !busy && (
        <span className="row-actions">
          <button
            className="button small"
            aria-label={`Move ${player.name} to ${TEAM_NAME[other]}`}
            onClick={() => send({ type: "move", playerId: player.id, team: other })}
          >
            Swap
          </button>
          {player.id !== view.hostId && (
            <ConfirmButton
              className="button small"
              label={`Remove ${player.name}`}
              confirmLabel="Tap to remove"
              onConfirm={() => send({ type: "remove", playerId: player.id })}
            >
              Remove
            </ConfirmButton>
          )}
        </span>
      )}
    </li>
  );
}

/** For someone not seated yet: take back an away player's seat, or join as someone new. */
export function JoinForm({ view, send }: { view: RoomView; send: Send }) {
  const [name, setName] = useState(lastName);
  const [team, setTeam] = useState<TeamId | null>(null);
  const away = TEAMS.flatMap((t) => view.teams[t]).filter((p) => !p.connected);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!team) return;
    rememberName(name.trim());
    send({ type: "join", name, team });
  };

  return (
    <form className="panel stack" onSubmit={submit}>
      {away.length > 0 && (
        <div className="stack" role="group" aria-label="Rejoin">
          <h2>Been here already?</h2>
          <span className="label">Tap your name to get your seat back</span>
          <div className="folder-tabs">
            {away.map((p) => (
              <button key={p.id} type="button" className="tab small" onClick={() => send({ type: "rejoin", playerId: p.id })}>
                <span className={`dot ${p.team}`} /> {p.name}
              </button>
            ))}
          </div>
        </div>
      )}
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
