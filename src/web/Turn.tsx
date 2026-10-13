import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { RULES, TEAMS, type Song, type TeamId } from "../rules";
import type { ClientMessage, RoomView, TurnView } from "../shared/protocol";
import { formatClock, useClock } from "./useClock";

export const TEAM_NAME: Record<TeamId, string> = { green: "Green", black: "Black" };

type Send = (m: ClientMessage) => void;

export function TurnScreen({ view, send }: { view: RoomView; send: Send }) {
  const turn = view.turn!;
  const { secondsLeft, points } = useClock(turn);
  const listening = turn.role === "listener";
  const started = turn.phase !== "ready";

  return (
    <>
      <section className="panel stack" aria-label="This turn">
        <span className="kicker">
          Round {turn.round} of {RULES.rounds}
        </span>
        <h2>
          <span className={`dot ${turn.team}`} /> {TEAM_NAME[turn.team]} team's turn
        </h2>
        <p>{roleLine(turn)}</p>
        <div className="dials">
          <div className="dial">
            <span className="big" data-testid="clock">
              {formatClock(secondsLeft)}
            </span>
            <span className="label">Time left</span>
          </div>
          <div className="dial">
            <span className="big" data-testid="points">
              {points}
            </span>
            <span className="label">Points</span>
          </div>
        </div>
      </section>

      {turn.paused && <p className="notice">The clock is paused while {turn.listenerName} reconnects.</p>}

      {turn.phase === "ready" &&
        (listening ? (
          <PickSong turn={turn} send={send} />
        ) : (
          <p className="panel">{turn.listenerName} is picking a song.</p>
        ))}

      {started && listening && turn.song && turn.phase === "running" && <SongCard song={turn.song} />}
      {turn.phase === "over" && <TurnResult view={view} send={send} />}
      {turn.phase === "running" && listening && <ListenerControls turn={turn} send={send} />}
      {started && <Hints turn={turn} />}
      {turn.phase === "running" && turn.role === "guesser" && <GuessBox send={send} />}
      {started && <Guesses turn={turn} send={send} />}

      {view.isHost && turn.phase === "running" && (
        <section className="panel stack">
          <span className="label">Host</span>
          <ConfirmButton className="button small" confirmLabel="Tap again to void (0 points)" onConfirm={() => send({ type: "void" })}>
            Void this turn for a rule break
          </ConfirmButton>
        </section>
      )}

      <Scores view={view} />
    </>
  );
}

function roleLine(turn: TurnView): string {
  switch (turn.role) {
    case "listener":
      return "You're the listener. Type hints, but no singing, humming, lyrics, artist or album.";
    case "guesser":
      return `${turn.listenerName} is the listener. Type your guesses below.`;
    case "watcher":
      return `${turn.listenerName} is the listener. Your team is watching this one.`;
  }
}

function PickSong({ turn, send }: { turn: TurnView; send: Send }) {
  return (
    <section className="panel stack">
      <h2>Pick your song</h2>
      <p className="meta">Only you can see these. Pick one you know well enough to hint at.</p>
      <ul className="choices" role="radiogroup" aria-label="Songs">
        {(turn.choices ?? []).map((s) => (
          <li key={s.id}>
            <button
              role="radio"
              aria-checked={turn.song?.id === s.id}
              className={`choice ${turn.song?.id === s.id ? "selected" : ""}`}
              onClick={() => send({ type: "pick", songId: s.id })}
            >
              <span className="song-title">{s.title}</span>
              <span className="meta">
                {s.artist} · {s.album}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button className="button primary" disabled={!turn.song} onClick={() => send({ type: "startClock" })}>
        Start the clock
      </button>
    </section>
  );
}

function SongCard({ song }: { song: Song }) {
  return (
    <section className="panel stack song-card" aria-label="Your song">
      <span className="label">Your song</span>
      <span className="song-title big-title">{song.title}</span>
      <span>
        {song.artist} · <em>{song.album}</em>
      </span>
    </section>
  );
}

function ListenerControls({ turn, send }: { turn: TurnView; send: Send }) {
  const [text, setText] = useState("");
  const [armed, setArmed] = useState(false);
  const cost = turn.nextHintCost;

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    if (cost > 0 && !armed) return setArmed(true);
    send({ type: "hint", text });
    setText("");
    setArmed(false);
  };

  return (
    <section className="panel stack">
      <form className="stack" onSubmit={submit}>
        <label className="label" htmlFor="hint">
          Your hint
        </label>
        <div className="row">
          <input id="hint" className="input" value={text} onChange={(e) => setText(e.target.value)} maxLength={200} autoComplete="off" />
          <button className="button primary" type="submit" disabled={!text.trim()}>
            {armed ? `Send for −${cost}` : "Send hint"}
          </button>
        </div>
        <span className="meta">
          {cost === 0
            ? `${turn.freeHintsLeft} free ${turn.freeHintsLeft === 1 ? "hint" : "hints"} left`
            : `Each extra hint costs ${cost} points`}
        </span>
      </form>
      <div className="stack">
        <span className="label">Reveal one, for {RULES.revealCost} points</span>
        <div className="tabs">
          {(["artist", "album"] as const).map((kind) => (
            <ConfirmButton
              key={kind}
              className="button"
              disabled={turn.revealBlocker !== null}
              confirmLabel={`Tap again: −${RULES.revealCost}`}
              onConfirm={() => send({ type: "reveal", kind })}
            >
              Reveal {kind}
            </ConfirmButton>
          ))}
        </div>
        {turn.revealBlocker === "self-titled" && <span className="meta">Self-titled album, so no reveal this turn.</span>}
        {turn.revealBlocker === "already-revealed" && <span className="meta">Already revealed this turn.</span>}
      </div>
    </section>
  );
}

function Hints({ turn }: { turn: TurnView }) {
  if (turn.hints.length === 0 && !turn.reveal) {
    return turn.phase === "running" ? <p className="meta">No hints yet.</p> : null;
  }
  return (
    <section className="panel stack" aria-label="Hints">
      <span className="label">Hints</span>
      <ol className="hints">
        {turn.hints.map((h, i) => (
          <li key={i}>
            {h.text}
            {h.cost > 0 && <span className="chip dashed">−{h.cost}</span>}
          </li>
        ))}
      </ol>
      {turn.reveal && (
        <p>
          <span className="chip solid">{turn.reveal.kind}</span> {turn.reveal.value}
        </p>
      )}
    </section>
  );
}

function GuessBox({ send }: { send: Send }) {
  const [text, setText] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    send({ type: "guess", text });
    setText("");
  };
  return (
    <form className="panel stack" onSubmit={submit}>
      <label className="label" htmlFor="guess">
        Song title
      </label>
      <div className="row">
        <input id="guess" className="input" value={text} onChange={(e) => setText(e.target.value)} maxLength={200} autoComplete="off" />
        <button className="button primary" type="submit" disabled={!text.trim()}>
          Guess
        </button>
      </div>
      <span className="meta">Each wrong guess costs {RULES.wrongGuessCost} points</span>
    </form>
  );
}

function Guesses({ turn, send }: { turn: TurnView; send: Send }) {
  if (turn.guesses.length === 0) return null;
  const canCount =
    turn.role === "listener" && (turn.result === null || turn.result.reason === "time" || turn.result.reason === "no-points");
  return (
    <section className="panel stack" aria-label="Guesses">
      <span className="label">Guesses</span>
      <ul className="roster">
        {turn.guesses.map((g, i) => (
          <li key={i}>
            <span>
              {g.playerName}: {g.text}
            </span>
            <span className={`chip ${g.correct ? "solid" : "dashed"}`}>{g.counted ? "Counted" : g.correct ? "Right" : "Wrong"}</span>
            {canCount && !g.correct && (
              <button className="button small" onClick={() => send({ type: "count", guessIndex: i })}>
                Count it
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function TurnResult({ view, send }: { view: RoomView; send: Send }) {
  const turn = view.turn!;
  const result = turn.result!;
  const last = turn.round === RULES.rounds && turn.team === TEAMS[TEAMS.length - 1];
  const headline = {
    guessed: `Got it! +${result.points}`,
    time: "Time's up",
    "no-points": "Out of points",
    voided: "Turn voided",
  }[result.reason];
  return (
    <section className="panel stack" aria-label="Turn result">
      <h2>{headline}</h2>
      {turn.song && (
        <p>
          The song was <strong className="song-title">{turn.song.title}</strong> by {turn.song.artist}.
        </p>
      )}
      <button className="button primary" onClick={() => send({ type: "next" })}>
        {last ? "See final scores" : "Next turn"}
      </button>
    </section>
  );
}

export function Scores({ view }: { view: RoomView }) {
  return (
    <section className="scores" aria-label="Scores">
      {TEAMS.map((t) => (
        <div key={t} className="score">
          <span className="big" data-testid={`score-${t}`}>
            {view.scores[t]}
          </span>
          <span className="label">
            <span className={`dot ${t}`} /> {TEAM_NAME[t]}
          </span>
        </div>
      ))}
    </section>
  );
}

/** A button that needs a second tap within a few seconds, for moves that cost points. */
function ConfirmButton(props: {
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  className: string;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      className={`${props.className} ${armed ? "armed" : ""}`}
      disabled={props.disabled}
      onClick={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        props.onConfirm();
      }}
    >
      {armed ? props.confirmLabel : props.children}
    </button>
  );
}
