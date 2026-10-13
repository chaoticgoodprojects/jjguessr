import type { RoomView } from "../shared/protocol";
import { Scores, TEAM_NAME } from "./Turn";

export function Finished({ view }: { view: RoomView }) {
  const { green, black } = view.scores;
  const headline =
    green === black
      ? `It's a tie at ${green}`
      : green > black
        ? `${TEAM_NAME.green} wins, ${green} to ${black}`
        : `${TEAM_NAME.black} wins, ${black} to ${green}`;
  return (
    <>
      <section className="panel stack">
        <span className="kicker">Game over</span>
        <h2>{headline}</h2>
      </section>
      <Scores view={view} />
      <section className="panel stack" aria-label="Every turn">
        <span className="label">Every turn</span>
        <ul className="roster">
          {view.history.map((t, i) => (
            <li key={i}>
              <span className={`dot ${t.team}`} />
              <span className="grow">
                {t.song ? `${t.song.title} · ${t.song.artist}` : "No song"}
                <span className="meta"> Round {t.round} · {t.listenerName}</span>
              </span>
              <span className="chip">{t.points}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
