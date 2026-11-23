import type { UiSnapshot } from "../game/types";

interface ObserverBoardProps {
  ui: UiSnapshot;
  onLeave: () => void;
}

function Side({
  name,
  tone,
  gold,
  wood,
  army,
  cap,
  keep,
  max,
}: {
  name: string;
  tone: "blue" | "red";
  gold: number;
  wood: number;
  army: number;
  cap: number;
  keep: number;
  max: number;
}) {
  const hp = Math.max(0, Math.min(1, keep / Math.max(1, max)));
  return (
    <section className={`observer-side ${tone}`} aria-label={`${name} keep`}>
      <strong>{name}</strong>
      <span>Gold {gold}</span>
      <span>Wood {wood}</span>
      <span>
        Army {army}/{cap}
      </span>
      <span>
        Keep {keep}
        <i style={{ width: `${hp * 100}%` }} />
      </span>
    </section>
  );
}

/** Scoreboard for a capture. No orders. Blue is the south keep, Red the north keep. */
export function ObserverBoard({ ui, onLeave }: ObserverBoardProps) {
  return (
    <div className="observer-board">
      <Side
        name="Blue"
        tone="blue"
        gold={ui.blueGold}
        wood={ui.blueWood}
        army={ui.blueArmy}
        cap={ui.blueArmyCap}
        keep={ui.blueKeep}
        max={ui.blueKeepMax}
      />
      <Side
        name="Red"
        tone="red"
        gold={ui.redGold}
        wood={ui.redWood}
        army={ui.redArmy}
        cap={ui.redArmyCap}
        keep={ui.redKeep}
        max={ui.redKeepMax}
      />
      <button type="button" className="ghost observer-leave" onClick={onLeave}>
        Leave
      </button>
    </div>
  );
}
