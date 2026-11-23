import { useEffect, useRef, useState } from "react";
import type { RallyStance, RallyUi } from "../game/types";

interface RallyStanceBarProps {
  rally: RallyUi;
  /** Arrow keys and Enter, while Taken the Field and the site menu is closed. */
  keys: boolean;
  onStance: (stance: RallyStance) => void;
}

const STANCES: { id: RallyStance; label: string }[] = [
  { id: "follow", label: "Follow" },
  { id: "defensive", label: "Defensive" },
  { id: "stand", label: "Stand ground" },
  { id: "aggressive", label: "Aggressive" },
];

export function RallyStanceBar({ rally, keys, onStance }: RallyStanceBarProps) {
  const [focus, setFocus] = useState(() => Math.max(0, STANCES.findIndex((stance) => stance.id === rally.stance)));
  const rallyRef = useRef(rally);
  const keysRef = useRef(keys);
  const onStanceRef = useRef(onStance);
  const focusRef = useRef(focus);
  rallyRef.current = rally;
  keysRef.current = keys;
  onStanceRef.current = onStance;
  const index = Math.max(0, Math.min(focus, STANCES.length - 1));
  focusRef.current = index;

  useEffect(() => {
    const next = STANCES.findIndex((stance) => stance.id === rally.stance);
    if (next >= 0) setFocus(next);
  }, [rally.leaderId, rally.stance]);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (!keysRef.current) return;
      const target = ev.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA")) return;
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const dir =
        ev.key === "ArrowLeft" || ev.key === "ArrowUp"
          ? -1
          : ev.key === "ArrowRight" || ev.key === "ArrowDown"
            ? 1
            : 0;
      if (dir !== 0) {
        ev.preventDefault();
        ev.stopPropagation();
        setFocus((current) => {
          const next = Math.max(0, Math.min(STANCES.length - 1, current + dir));
          focusRef.current = next;
          return next;
        });
        return;
      }
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      ev.stopPropagation();
      if (ev.repeat) return;
      const stance = STANCES[Math.min(focusRef.current, STANCES.length - 1)];
      if (stance) onStanceRef.current(stance.id);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  return (
    <div
      className="sheet-float rally-stance"
      role="region"
      aria-label={rally.several ? `Rally stance, ${rally.leaderLabel}` : "Rally stance"}
      onMouseDown={(ev) => ev.stopPropagation()}
    >
      {rally.several ? <div className="rally-stance-who">{rally.leaderLabel}</div> : null}
      <div className="rally-stance-row" role="group" aria-label="Rally stance">
        {STANCES.map((stance, stanceIndex) => (
          <button
            key={stance.id}
            type="button"
            className={`rally-stance-btn${rally.stance === stance.id ? " on" : ""}${
              keys && stanceIndex === index ? " field-focus" : ""
            }`}
            aria-pressed={rally.stance === stance.id}
            aria-current={keys && stanceIndex === index ? "true" : undefined}
            onClick={() => onStance(stance.id)}
          >
            {stance.label}
          </button>
        ))}
      </div>
      {keys ? <p className="field-keys">Arrows choose. Enter sets.</p> : null}
    </div>
  );
}
