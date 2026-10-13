import { useEffect, useState, type ReactNode } from "react";
import type { TeamId } from "../rules";

export const TEAM_NAME: Record<TeamId, string> = { green: "Green", black: "Black" };

/** A button that needs a second tap within a few seconds, for moves that cost points or can't be undone. */
export function ConfirmButton(props: {
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  className: string;
  disabled?: boolean;
  label?: string;
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
      aria-label={armed ? undefined : props.label}
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
