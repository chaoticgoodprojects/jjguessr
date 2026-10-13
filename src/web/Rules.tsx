import { useEffect, useRef } from "react";
import { RULES } from "../rules";

/** The rules as short bullets, shown when a player first opens a game and behind the ? button. */
export function RulesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const minutes = (s: number) => `${s / 60} ${s === 60 ? "minute" : "minutes"}`;
  const clock = `${RULES.turnSeconds / 60}-minute clock`;
  return (
    <dialog
      ref={ref}
      className="rules"
      aria-labelledby="rules-title"
      onClose={onClose}
      // A tap on the grey around the panel closes it too.
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <div className="panel stack">
        <h2 id="rules-title">How to play</h2>
        <span className="label">Each turn</span>
        <ul className="rule-list">
          <li>
            Green and black take turns: one turn each per round, {RULES.rounds} rounds.
          </li>
          <li>The listener picks a song only they can see, starts the {clock}, and types hints.</li>
          <li>Their teammates type guesses of the song title. The other team watches.</li>
        </ul>
        <span className="label">Points</span>
        <ul className="rule-list">
          <li>
            A turn starts at {RULES.startingPoints} and loses 1 point every {RULES.secondsPerPoint} seconds.
          </li>
          <li>
            {RULES.freeHints} free hints, then −{RULES.extraHintCost} for each extra hint.
          </li>
          <li>−{RULES.wrongGuessCost} for each wrong guess.</li>
          <li>
            After {minutes(RULES.revealAfterSeconds)}, the listener can reveal the artist or the album once, for −{RULES.revealCost}. Not
            on self-titled albums.
          </li>
          <li>The turn ends when the song is guessed, the time runs out, or the points reach 0. A right guess banks the points left.</li>
        </ul>
        <span className="label">Not allowed</span>
        <ul className="rule-list">
          <li>Singing or humming, saying the artist or album, playing the song, or reciting lyrics.</li>
          <li>Telling the listener which hints to give.</li>
          <li>The host can void a turn that breaks a rule.</li>
        </ul>
        <button className="button primary" onClick={onClose} autoFocus>
          Got it
        </button>
      </div>
    </dialog>
  );
}
