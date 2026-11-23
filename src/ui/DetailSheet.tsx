import { useEffect, useState } from "react";
import { BASE_ARMY_CAP, CHURCH_ARMY_POP, HOUSE_POP, MID_HOUSE_ARMY_POP } from "../game/balance";
import { isEnemyStructure } from "../game/ownership";
import { buildingName } from "../game/sim";
import type { BuildingKind, KeepTrainKind, TrainKind, UiSnapshot, UnitKind } from "../game/types";

export interface DetailSheetProps {
  ui: UiSnapshot;
  onUpgradeDamage: () => void;
  onUpgradeRate: () => void;
  onRaze: () => void;
  onConsecrate: () => void;
  onRaiseMarket: () => void;
  onTrade: (resource: "wood" | "gold", side: "buy" | "sell") => void;
  onUpgradeKeep: () => void;
  onEnqueueKeep: (kind: KeepTrainKind) => void;
  onCancelKeepQueue: (index: number) => void;
  onRaiseCathedral: () => void;
  onEnqueueTemplar: () => void;
  onCancelTemplar: (index: number) => void;
  onClose: () => void;
  onEnqueue: (kind: TrainKind) => void;
  onCancelQueue: (index: number) => void;
  onEnqueuePeon: () => void;
  onCallHome: () => void;
  onGarrison: () => void;
  onUngarrison: () => void;
  armyPatrolMode: boolean;
  onPossessSelected: () => void;
  onToggleArmyHold: () => void;
  onStartArmyPatrol: () => void;
  onStopArmy: () => void;
  onReleaseArmy: () => void;
  onFilterArmyKind: (kind: UnitKind) => void;
}

const STRUCTURE_ROLE: Partial<Record<BuildingKind, string>> = {
  watchtower: "Fast arrows. Best against light troops, and weak once they reach the keep.",
  ballista: "Armor-piercing bolts at a fixed rate. Upgrade posts guard dogs that kill spies on the pad.",
  catapult: "Splash that stays strong at the gate and breaks barricades.",
  barricade: "A peon blocks one road. Melee has to chop it. A ram smashes it.",
  church: `Upgraded purple house. Blessing aura (+25% damage, regen), +${CHURCH_ARMY_POP} army pop. Free soldier every 10s, templar knight every 60s.`,
};

function costLabel(gold: number, wood: number) {
  const parts: string[] = [];
  if (gold > 0) parts.push(`${gold}g`);
  if (wood > 0) parts.push(`${wood}w`);
  return parts.join(" · ") || "0";
}

export function DetailSheet({
  ui,
  onUpgradeDamage,
  onUpgradeRate,
  onRaze,
  onConsecrate,
  onRaiseMarket,
  onTrade,
  onUpgradeKeep,
  onEnqueueKeep,
  onCancelKeepQueue,
  onRaiseCathedral,
  onEnqueueTemplar,
  onCancelTemplar,
  onClose,
  onEnqueue,
  onCancelQueue,
  onEnqueuePeon,
  onCallHome,
  onGarrison,
  onUngarrison,
  armyPatrolMode,
  onPossessSelected,
  onToggleArmyHold,
  onStartArmyPatrol,
  onStopArmy,
  onReleaseArmy,
  onFilterArmyKind,
}: DetailSheetProps) {
  const keepPanel = ui.selectedKeepTeam === ui.localTeam;
  const buildingPanel = Boolean(ui.selectedBuildingId && ui.selectedBuildingKind);
  const armyPanel = !keepPanel && !buildingPanel && Boolean(ui.selectedArmy && ui.selectedArmy.count > 0);
  const subject = keepPanel
    ? "keep"
    : buildingPanel
      ? `b${ui.selectedBuildingId}`
      : armyPanel
        ? "army"
        : "";
  const [collapsed, setCollapsed] = useState(false);
  const [razeConfirm, setRazeConfirm] = useState(false);
  useEffect(() => {
    setCollapsed(false);
    setRazeConfirm(false);
  }, [subject]);
  if (!keepPanel && !buildingPanel && !armyPanel) return null;

  const sheetClass = collapsed ? "detail sheet-float collapsed" : "detail sheet-float";
  const headControls = (
    <div className="detail-head-actions">
      <button
        type="button"
        className="ghost"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expand panel" : "Collapse panel"}
        title={collapsed ? "Expand" : "Collapse"}
      >
        {collapsed ? "▴" : "▾"}
      </button>
      <button type="button" className="ghost" onClick={onClose} aria-label="Close">
        ✕
      </button>
    </div>
  );

  if (armyPanel) {
    const army = ui.selectedArmy!;
    const title = army.count === 1 ? army.leadLabel : `Selected Army (${army.count})`;
    const orderStatus = army.orderSummary?.trim() || "Auto";
    return (
      <div className={`${sheetClass} army-sheet`} role="region" aria-label="Selected army">
        <div className="detail-head">
          <div className="army-head-copy">
            <div className="army-title-row">
              <div className="detail-title">{title}</div>
              <span className={`army-status-badge${army.anyManual ? " manual" : ""}`}>{orderStatus}</span>
            </div>
          </div>
          {headControls}
        </div>
        {!collapsed && (
          <div className="detail-body">
            {army.groups.length > 0 && (
              <div className="army-groups" role="group" aria-label="Selected unit types">
                {army.groups.map((g) => (
                  <button
                    key={g.kind}
                    type="button"
                    className={`army-chip${army.groups.length === 1 ? " solo" : ""}`}
                    onClick={() => onFilterArmyKind(g.kind)}
                    title={
                      army.groups.length === 1
                        ? `${g.label} (${g.count} selected)`
                        : `Click to select only ${g.label}`
                    }
                  >
                    <span>{g.label}</span>
                    <em>×{g.count}</em>
                  </button>
                ))}
              </div>
            )}

            <div className="army-cmd-bar" role="toolbar" aria-label="Army commands">
              <button
                type="button"
                className={`army-cmd primary${army.canPossess ? " afford" : ""}`}
                disabled={!army.canPossess}
                onClick={onPossessSelected}
                title="Take first-person command of the lead soldier (V)"
              >
                <span>Take Field</span>
                <kbd>V</kbd>
              </button>
              <button
                type="button"
                className={`army-cmd${army.allHolding ? " active" : ""}`}
                aria-pressed={army.allHolding}
                onClick={onToggleArmyHold}
                title="Hold position and engage nearby foes without chasing (H)"
              >
                <span>Hold</span>
                <kbd>H</kbd>
              </button>
              <button
                type="button"
                className={`army-cmd${armyPatrolMode ? " active" : ""}`}
                aria-pressed={armyPatrolMode}
                onClick={onStartArmyPatrol}
                title="Patrol between current spot and destination (P)"
              >
                <span>Patrol</span>
                <kbd>P</kbd>
              </button>
              <button
                type="button"
                className="army-cmd"
                onClick={onStopArmy}
                title="Halt movement and clear active attack/guard targets (X)"
              >
                <span>Stop</span>
                <kbd>X</kbd>
              </button>
              <button
                type="button"
                className={`army-cmd${army.anyManual ? " afford" : ""}`}
                disabled={!army.anyManual}
                onClick={onReleaseArmy}
                title="Release manual orders and return squad to global lane/defend stance"
              >
                <span>Auto</span>
              </button>
            </div>

            <p className="army-tip">
              Right-click ground to form up · ally to guard &amp; follow · foe/tower to focus-fire · Dbl-click picks same type
            </p>
          </div>
        )}
      </div>
    );
  }

  if (keepPanel) {
    const canPay =
      ui.yourGold >= ui.peonTrainCost.gold && ui.yourWood >= ui.peonTrainCost.wood;
    return (
      <div className={sheetClass}>
        <div className="detail-head">
          <div>
            <div className="detail-title">{ui.keepUpgraded ? "Your Keep · Upgraded" : "Your Keep"}</div>
            <div className="detail-sub">
              Peons {ui.peonCount}/{ui.peonCap} · Garrison {ui.keepGarrisoned}/{ui.keepGarrisonMax}
            </div>
          </div>
          {headControls}
        </div>
        {!collapsed && (
        <div className="detail-body">
        <p className="detail-note">
          Queue peons here. Cap starts at 2 — build Houses on green pads behind the keep.
        </p>
        <div className="train-options">
          <button
            type="button"
            className={`train-opt${ui.canTrainPeon && canPay ? " afford" : ""}`}
            disabled={!ui.canTrainPeon || !canPay}
            onClick={onEnqueuePeon}
            title={ui.canTrainPeon ? undefined : "Pop cap reached — build a House"}
          >
            <strong>Train Peon</strong>
            <em>{costLabel(ui.peonTrainCost.gold, ui.peonTrainCost.wood)}</em>
          </button>
          <button type="button" className="train-opt" onClick={onCallHome}>
            <strong>Call home</strong>
          </button>
          <button
            type="button"
            className="train-opt"
            onClick={onGarrison}
            disabled={ui.keepGarrisoned >= ui.keepGarrisonMax}
          >
            <strong>Garrison peons</strong>
          </button>
          <button
            type="button"
            className="train-opt"
            onClick={onUngarrison}
            disabled={ui.keepGarrisoned === 0}
          >
            <strong>Ungarrison all</strong>
          </button>
        </div>
        <div className="queue-row">
          <span className="queue-label">Peon queue</span>
          <div className="queue-slots">
            {ui.peonQueue.length === 0 && <span className="queue-empty">Empty</span>}
            {ui.peonQueue.map((slot, i) => (
              <div key={`peon-${i}`} className="queue-chip">
                <i style={{ width: `${Math.round(slot.pct * 100)}%` }} />
                <span>{slot.label}</span>
              </div>
            ))}
          </div>
        </div>
        {!ui.keepUpgraded && (
          <div className="train-options">
            <button
              type="button"
              className={`train-opt${
                ui.canUpgradeKeep &&
                ui.yourGold >= ui.keepUpgradeCost.gold &&
                ui.yourWood >= ui.keepUpgradeCost.wood
                  ? " afford"
                  : ""
              }`}
              disabled={
                !ui.canUpgradeKeep ||
                ui.yourGold < ui.keepUpgradeCost.gold ||
                ui.yourWood < ui.keepUpgradeCost.wood
              }
              onClick={onUpgradeKeep}
            >
              <strong>Upgrade keep</strong>
              <em>{costLabel(ui.keepUpgradeCost.gold, ui.keepUpgradeCost.wood)}</em>
            </button>
          </div>
        )}
        {ui.keepUpgraded && (
          <>
            <p className="detail-note">Raiders and brutes train here and count toward the army cap.</p>
            <div className="train-options">
              {ui.keepTrainOptions.map((opt) => {
                const afford = ui.yourGold >= opt.cost && ui.yourWood >= opt.woodCost;
                const room = ui.armyCount < ui.armyCap;
                return (
                  <button
                    key={opt.kind}
                    type="button"
                    className={`train-opt${afford && room ? " afford" : ""}`}
                    disabled={!afford || !room}
                    onClick={() => onEnqueueKeep(opt.kind)}
                  >
                    <strong>{opt.label}</strong>
                    <em>{costLabel(opt.cost, opt.woodCost)}</em>
                  </button>
                );
              })}
            </div>
            <div className="queue-row">
              <span className="queue-label">Keep queue</span>
              <div className="queue-slots">
                {ui.keepTroopQueue.length === 0 && <span className="queue-empty">Empty — tap a unit above</span>}
                {ui.keepTroopQueue.map((slot, i) => (
                  <button
                    key={`${slot.kind}-${i}`}
                    type="button"
                    className="queue-chip"
                    onClick={() => onCancelKeepQueue(i)}
                    title="Cancel (50% refund)"
                  >
                    <i style={{ width: `${Math.round(slot.pct * 100)}%` }} />
                    <span>{slot.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
        </div>
        )}
      </div>
    );
  }

  const isEnemy = isEnemyStructure(ui.localTeam, ui.selectedBuildingTeam);
  const isBarracks = ui.selectedBuildingKind === "barracks";
  const isChurch = ui.selectedBuildingKind === "church";
  const isTrainHall = isBarracks;
  const isHouse = ui.selectedBuildingKind === "house";
  const isMarket = ui.selectedBuildingKind === "market";
  const isBallista = ui.selectedBuildingKind === "ballista";
  const structureName = ui.selectedIsCathedral ? "Cathedral" : buildingName(ui.selectedBuildingKind!);
  const templarAfford = ui.yourGold >= ui.templarTrainCost.gold && ui.yourWood >= ui.templarTrainCost.wood;
  const armyRoom = ui.armyCount < ui.armyCap;

  return (
    <div className={sheetClass}>
      <div className="detail-head">
        <div>
          <div className="detail-title">{isEnemy ? `Enemy ${structureName}` : structureName}</div>
          <div className="detail-sub">{isEnemy ? "Inspection view only" : "Your structure"}</div>
        </div>
        {headControls}
      </div>

      {!collapsed && (
      <div className="detail-body">
      {isHouse && (
        <p className="detail-note">
          Yard houses add +{HOUSE_POP} peon pop. Purple midfield houses add +{MID_HOUSE_ARMY_POP} army pop and can consecrate into a church (+{CHURCH_ARMY_POP} army pop) for 500g.
          Keep grants {BASE_ARMY_CAP} base army slots (up to {BASE_ARMY_CAP + 2 * CHURCH_ARMY_POP} max with 2 churches).
        </p>
      )}
      {isHouse && !isEnemy && ui.selectedIsMidHouse && (
        <button
          type="button"
          className="cta"
          disabled={!ui.selectedCanConsecrate}
          onClick={onConsecrate}
          title="500 gold — church with free soldiers, templars, and a blessing aura"
        >
          Consecrate church · 500g
        </button>
      )}
      {isHouse && !isEnemy && ui.selectedIsMidHouse && (
        <button
          type="button"
          className={`train-opt${ui.selectedCanRaiseMarket ? " afford" : ""}`}
          disabled={!ui.selectedCanRaiseMarket}
          onClick={onRaiseMarket}
        >
          <strong>Market</strong>
          <em>100g · 100w</em>
        </button>
      )}
      {isMarket && !isEnemy && (
        <div className="train-options">
          <button
            type="button"
            className={`train-opt${ui.yourGold >= ui.marketQuotes.woodBuy ? " afford" : ""}`}
            disabled={ui.yourGold < ui.marketQuotes.woodBuy}
            onClick={() => onTrade("wood", "buy")}
          >
            <strong>Buy wood</strong>
            <em>{ui.marketQuotes.woodBuy}g</em>
          </button>
          <button
            type="button"
            className={`train-opt${ui.yourWood >= 100 ? " afford" : ""}`}
            disabled={ui.yourWood < 100}
            onClick={() => onTrade("wood", "sell")}
          >
            <strong>Sell wood</strong>
            <em>{ui.marketQuotes.woodSell}g</em>
          </button>
          <button
            type="button"
            className={`train-opt${ui.yourWood >= ui.marketQuotes.goldBuy ? " afford" : ""}`}
            disabled={ui.yourWood < ui.marketQuotes.goldBuy}
            onClick={() => onTrade("gold", "buy")}
          >
            <strong>Buy gold</strong>
            <em>{ui.marketQuotes.goldBuy}w</em>
          </button>
          <button
            type="button"
            className={`train-opt${ui.yourGold >= 100 ? " afford" : ""}`}
            disabled={ui.yourGold < 100}
            onClick={() => onTrade("gold", "sell")}
          >
            <strong>Sell gold</strong>
            <em>{ui.marketQuotes.goldSell}w</em>
          </button>
        </div>
      )}
      {!isHouse && !isTrainHall && !isChurch && !isMarket && STRUCTURE_ROLE[ui.selectedBuildingKind!] && (
        <p className="detail-note">{STRUCTURE_ROLE[ui.selectedBuildingKind!]}</p>
      )}
      {isChurch && !ui.selectedIsCathedral && <p className="detail-note">{STRUCTURE_ROLE.church}</p>}
      {isChurch && ui.selectedIsCathedral && (
        <p className="detail-note">
          Cathedral. Blessing aura (+25% damage, regen), +{CHURCH_ARMY_POP} army pop. Free soldier every 10s, free
          templar every 60s. Queue more templars below.
        </p>
      )}
      {isChurch && !isEnemy && !ui.selectedIsCathedral && ui.keepUpgraded && (
        <button
          type="button"
          className="cta"
          disabled={!ui.selectedCanRaiseCathedral}
          onClick={onRaiseCathedral}
          title={`${ui.cathedralUpgradeCost.gold} gold and ${ui.cathedralUpgradeCost.wood} wood — queue templars here`}
        >
          Raise cathedral · {costLabel(ui.cathedralUpgradeCost.gold, ui.cathedralUpgradeCost.wood)}
        </button>
      )}
      {ui.selectedIsCathedral && !isEnemy && (
        <>
          <div className="train-options">
            <button
              type="button"
              className={`train-opt${templarAfford && armyRoom ? " afford" : ""}`}
              disabled={!templarAfford || !armyRoom}
              onClick={onEnqueueTemplar}
            >
              <strong>Templar</strong>
              <em>{costLabel(ui.templarTrainCost.gold, ui.templarTrainCost.wood)}</em>
            </button>
          </div>
          <div className="queue-row">
            <span className="queue-label">Templar queue</span>
            <div className="queue-slots">
              {ui.templarQueue.length === 0 && <span className="queue-empty">Empty — tap Templar above</span>}
              {ui.templarQueue.map((slot, i) => (
                <button
                  key={`templar-${i}`}
                  type="button"
                  className="queue-chip"
                  onClick={() => onCancelTemplar(i)}
                  title="Cancel (50% refund)"
                >
                  <i style={{ width: `${Math.round(slot.pct * 100)}%` }} />
                  <span>{slot.label}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {!isTrainHall && !isHouse && !isChurch && !isMarket && (
        <>
          <div className="rank-row">
            <span>Damage</span>
            <div className="pips">
              {[1, 2, 3].map((n) => (
                <i key={n} className={(ui.selectedRanks?.damage ?? 1) >= n ? "on" : ""} />
              ))}
            </div>
          </div>
          <div className="rank-row">
            <span>{isBallista ? "Guard dogs" : "Fire rate"}</span>
            <div className="pips">
              {(isBallista ? [1, 2] : [1, 2, 3]).map((n) => (
                <i
                  key={n}
                  className={
                    isBallista
                      ? (ui.selectedRanks?.rate ?? 1) > n
                        ? "on"
                        : ""
                      : (ui.selectedRanks?.rate ?? 1) >= n
                        ? "on"
                        : ""
                  }
                />
              ))}
            </div>
          </div>
        </>
      )}

      {isTrainHall && !isEnemy && (
        <>
          <p className="detail-note">
            Army {ui.armyCount}/{ui.armyCap}. Levies crack wards, rams break barricades, trebuchets need four shots, spies
            hunt trebuchets, riders shrug arrows, archers walk around blocks.
          </p>
          {ui.selectedBarracksCount > 1 && (
            <p className="detail-note">
              {ui.selectedBarracksCount} barracks selected. Each new unit goes to the shortest queue.
            </p>
          )}

          <div className="train-options">
            {ui.trainOptions.map((opt) => {
              const afford = ui.yourGold >= opt.cost && ui.yourWood >= opt.woodCost;
              const room = ui.armyCount < ui.armyCap;
              return (
                <button
                  key={opt.kind}
                  type="button"
                  className={`train-opt${opt.unlocked ? "" : " locked"}${opt.unlocked && afford && room ? " afford" : ""}`}
                  disabled={!opt.unlocked || !afford || !room}
                  onClick={() => onEnqueue(opt.kind)}
                  title={opt.unlocked ? undefined : opt.lockHint}
                >
                  <strong>{opt.label}</strong>
                  <em>{costLabel(opt.cost, opt.woodCost)}</em>
                </button>
              );
            })}
          </div>

          <div className="queue-row">
            <span className="queue-label">{ui.selectedBarracksCount > 1 ? "Queues" : "Queue"}</span>
            <div className="queue-slots">
              {ui.trainQueue.length === 0 && <span className="queue-empty">Empty — tap a unit above</span>}
              {ui.trainQueue.map((slot, i) => (
                <button
                  key={`${slot.kind}-${i}`}
                  type="button"
                  className="queue-chip"
                  onClick={() => onCancelQueue(i)}
                  title="Cancel (50% refund)"
                >
                  <i style={{ width: `${Math.round(slot.pct * 100)}%` }} />
                  <span>{slot.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="rank-row">
            <span>Troop power</span>
            <div className="pips">
              {[1, 2, 3].map((n) => (
                <i key={n} className={(ui.selectedRanks?.damage ?? 1) >= n ? "on" : ""} />
              ))}
            </div>
          </div>
          <div className="rank-row">
            <span>Train speed</span>
            <div className="pips">
              {[1, 2, 3].map((n) => (
                <i key={n} className={(ui.selectedRanks?.rate ?? 1) >= n ? "on" : ""} />
              ))}
            </div>
          </div>
        </>
      )}

      {!isEnemy && (
        <div className="detail-actions">
          {!isHouse && !isChurch && !isMarket && (
            <>
              <button
                type="button"
                className={
                  ui.selectedCanUpgradeDamage && ui.yourGold >= ui.selectedUpgradeCost.damage ? "afford" : undefined
                }
                onClick={onUpgradeDamage}
                disabled={!ui.selectedCanUpgradeDamage}
              >
                {isBarracks ? "Power" : "Damage"}
                <em>{ui.selectedCanUpgradeDamage ? `${ui.selectedUpgradeCost.damage}g` : "MAX"}</em>
              </button>
              <button
                type="button"
                className={
                  ui.selectedCanUpgradeRate && ui.yourGold >= ui.selectedUpgradeCost.rate ? "afford" : undefined
                }
                onClick={onUpgradeRate}
                disabled={!ui.selectedCanUpgradeRate}
              >
                {isBarracks ? "Speed" : isBallista ? "Dogs" : "Rate"}
                <em>{ui.selectedCanUpgradeRate ? `${ui.selectedUpgradeCost.rate}g` : "MAX"}</em>
              </button>
            </>
          )}
          <button
            type="button"
            className="danger-btn"
            onClick={() => setRazeConfirm(true)}
            disabled={!ui.selectedCanRaze}
          >
            Raze
            <em>
              {ui.selectedRazeRefund > 0 || ui.selectedRazeRefundWood > 0
                ? `+${ui.selectedRazeRefund}g +${ui.selectedRazeRefundWood}w`
                : "0"}
            </em>
          </button>
        </div>
      )}
      {razeConfirm && (
        <div className="raze-confirm" role="alertdialog" aria-labelledby="raze-confirm-title" aria-modal="true">
          <p id="raze-confirm-title">Are you sure you want to delete this building?</p>
          <div className="raze-confirm-actions">
            <button type="button" className="ghost" onClick={() => setRazeConfirm(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="danger-btn"
              onClick={() => {
                setRazeConfirm(false);
                onRaze();
              }}
            >
              Raze
            </button>
          </div>
        </div>
      )}
      </div>
      )}
    </div>
  );
}
