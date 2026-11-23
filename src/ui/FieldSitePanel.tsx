import { useEffect, useRef, useState } from "react";
import type { BuildingKind, FieldSiteUi, KeepTrainKind, TrainKind } from "../game/types";

interface FieldSitePanelProps {
  site: FieldSiteUi;
  /** Coarse pointer: show an on-screen pad until a keyboard is used. */
  touch: boolean;
  /** Mouse look is in use, so right-click can free the pointer. */
  mouseLook: boolean;
  onBuild: (kind: BuildingKind, padId: string) => void;
  onTrain: (kind: TrainKind, buildingId: number) => void;
  onKeepTrain: (kind: KeepTrainKind) => void;
  onTemplar: (buildingId: number) => void;
  onChurch: (buildingId: number) => void;
  onMarket: (buildingId: number) => void;
  onTrade: (resource: "wood" | "gold", side: "buy" | "sell") => void;
  onRally: (on: boolean, target: { buildingId?: number; keep?: boolean }) => void;
}

type MenuDir = "up" | "down" | "left" | "right";

interface MenuSlot {
  key: string;
  label: string;
  price?: string;
  enabled: boolean;
  kind: "choice" | "rally";
  pressed?: boolean;
  onPress: () => void;
}

const MENU_COLS = 2;

function moveMenu(slots: MenuSlot[], index: number, dir: MenuDir): number {
  if (slots.length === 0) return 0;
  const rallyAt = slots.findIndex((slot) => slot.kind === "rally");
  const choiceCount = rallyAt >= 0 ? rallyAt : slots.length;
  const clamped = Math.max(0, Math.min(index, slots.length - 1));
  const onRally = rallyAt >= 0 && clamped === rallyAt;
  const at = (row: number, col: number) => {
    const next = row * MENU_COLS + col;
    return next >= 0 && next < choiceCount ? next : -1;
  };

  if (onRally) {
    if (dir === "up" && choiceCount > 0) return choiceCount - 1;
    return clamped;
  }

  const col = clamped % MENU_COLS;
  const row = Math.floor(clamped / MENU_COLS);
  const rows = Math.max(1, Math.ceil(choiceCount / MENU_COLS));

  if (dir === "left") return col > 0 ? clamped - 1 : clamped;
  if (dir === "right") return col < MENU_COLS - 1 && clamped + 1 < choiceCount ? clamped + 1 : clamped;
  if (dir === "up") {
    if (row === 0) return clamped;
    const next = at(row - 1, col);
    return next >= 0 ? next : at(row - 1, 0);
  }
  const below = at(row + 1, col);
  if (below >= 0) return below;
  if (row + 1 < rows) return choiceCount - 1;
  return rallyAt >= 0 ? rallyAt : clamped;
}

function siteListKey(site: FieldSiteUi): string {
  if (site.kind === "build") return `build:${site.padId}:${site.choices.map((choice) => choice.id).join(",")}`;
  if (site.kind === "market") return `market:${site.buildingId}`;
  if (site.kind === "chapel") return `chapel:${site.buildingId}:${site.choices.map((choice) => choice.id).join(",")}`;
  return `train:${site.keep ? "keep" : site.buildingId}:${site.choices.map((choice) => choice.id).join(",")}`;
}

export function FieldSitePanel({
  site,
  touch,
  mouseLook,
  onBuild,
  onTrain,
  onKeepTrain,
  onTemplar,
  onChurch,
  onMarket,
  onTrade,
  onRally,
}: FieldSitePanelProps) {
  const slots: MenuSlot[] = [];
  if (site.kind === "market") {
    const rows: { label: string; price: string; enabled: boolean; resource: "wood" | "gold"; side: "buy" | "sell" }[] = [
      { label: "Buy wood", price: `${site.woodBuy}g`, enabled: site.canBuyWood, resource: "wood", side: "buy" },
      { label: "Sell wood", price: `${site.woodSell}g`, enabled: site.canSellWood, resource: "wood", side: "sell" },
      { label: "Buy gold", price: `${site.goldBuy}w`, enabled: site.canBuyGold, resource: "gold", side: "buy" },
      { label: "Sell gold", price: `${site.goldSell}w`, enabled: site.canSellGold, resource: "gold", side: "sell" },
    ];
    for (const row of rows) {
      slots.push({
        key: row.label,
        label: row.label,
        price: row.price,
        enabled: row.enabled,
        kind: "choice",
        onPress: () => onTrade(row.resource, row.side),
      });
    }
  } else if (site.kind === "chapel") {
    for (const choice of site.choices) {
      slots.push({
        key: choice.id,
        label: choice.label,
        price: choice.price,
        enabled: choice.enabled,
        kind: "choice",
        onPress: () => (choice.id === "market" ? onMarket(site.buildingId) : onChurch(site.buildingId)),
      });
    }
  } else if (site.kind === "build") {
    for (const choice of site.choices) {
      slots.push({
        key: choice.id,
        label: choice.label,
        price: choice.price,
        enabled: choice.enabled,
        kind: "choice",
        onPress: () => onBuild(choice.id as BuildingKind, site.padId),
      });
    }
  } else {
    for (const choice of site.choices) {
      slots.push({
        key: choice.id,
        label: choice.label,
        price: choice.price,
        enabled: choice.enabled,
        kind: "choice",
        onPress: () => {
          if (site.keep) onKeepTrain(choice.id as KeepTrainKind);
          else if (choice.id === "templar") onTemplar(site.buildingId);
          else onTrain(choice.id as TrainKind, site.buildingId);
        },
      });
    }
    slots.push({
      key: "rally",
      label: "Rally to player",
      enabled: true,
      kind: "rally",
      pressed: site.rally,
      onPress: () => onRally(!site.rally, site.keep ? { keep: true } : { buildingId: site.buildingId }),
    });
  }

  const listKey = siteListKey(site);
  const [focus, setFocus] = useState(0);
  const [hasKeyboard, setHasKeyboard] = useState(false);
  const slotsRef = useRef(slots);
  const focusRef = useRef(0);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  slotsRef.current = slots;
  const index = slots.length === 0 ? 0 : Math.min(focus, slots.length - 1);
  focusRef.current = index;

  useEffect(() => {
    focusRef.current = 0;
    setFocus(0);
  }, [listKey]);

  useEffect(() => {
    itemRefs.current[index]?.scrollIntoView({ block: "nearest" });
  }, [index, listKey]);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA")) return;
      setHasKeyboard((on) => (on ? on : true));
      const list = slotsRef.current;
      if (list.length === 0 || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const dir: MenuDir | null =
        ev.key === "ArrowUp"
          ? "up"
          : ev.key === "ArrowDown"
            ? "down"
            : ev.key === "ArrowLeft"
              ? "left"
              : ev.key === "ArrowRight"
                ? "right"
                : null;
      if (dir) {
        ev.preventDefault();
        ev.stopPropagation();
        setFocus((current) => {
          const next = moveMenu(slotsRef.current, current, dir);
          focusRef.current = next;
          return next;
        });
        return;
      }
      if (ev.key !== "Enter" && ev.key.toLowerCase() !== "f") return;
      ev.preventDefault();
      ev.stopPropagation();
      if (ev.repeat) return;
      const slot = list[Math.min(focusRef.current, list.length - 1)];
      if (slot?.enabled) slot.onPress();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const showPad = touch && !hasKeyboard;
  const choices = slots.filter((slot) => slot.kind === "choice");
  const rally = slots.find((slot) => slot.kind === "rally");
  const title = site.kind === "market" ? "Market" : site.kind === "chapel" ? "Church pad" : site.title;
  const freeLines = site.kind === "train" ? site.freeLines : [];

  const activate = (slot: MenuSlot) => {
    if (slot.enabled) slot.onPress();
  };

  const renderChoice = (slot: MenuSlot, slotIndex: number) => (
    <button
      key={slot.key}
      ref={(node) => {
        itemRefs.current[slotIndex] = node;
      }}
      type="button"
      className={`train-opt${slot.enabled ? " afford" : ""}${slotIndex === index ? " field-focus" : ""}`}
      disabled={!slot.enabled}
      aria-current={slotIndex === index ? "true" : undefined}
      onClick={() => activate(slot)}
    >
      <strong>{slot.label}</strong>
      {slot.price ? <em>{slot.price}</em> : null}
    </button>
  );

  return (
    <div
      className="sheet-float field-site"
      role="region"
      aria-label={title}
      onMouseDown={(ev) => ev.stopPropagation()}
    >
      <div className="detail-title">{title}</div>
      {freeLines.length > 0 && (
        <div className="field-free">
          {freeLines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
      )}
      {choices.length > 0 && (
        <div className="field-choices">
          {choices.map((slot) => renderChoice(slot, slots.indexOf(slot)))}
        </div>
      )}
      {rally && (
        <button
          ref={(node) => {
            itemRefs.current[slots.indexOf(rally)] = node;
          }}
          type="button"
          className={`field-rally${rally.pressed ? " on" : ""}${slots.indexOf(rally) === index ? " field-focus" : ""}`}
          aria-pressed={rally.pressed}
          aria-current={slots.indexOf(rally) === index ? "true" : undefined}
          onClick={() => activate(rally)}
        >
          {rally.label}
        </button>
      )}
      {site.kind === "train" && (
        <p className="field-buff">
          Rallied units gain +20% attack and defence, with extra defence versus towers and archers.
        </p>
      )}
      <p className="field-keys">
        {showPad
          ? "Pad moves the highlight. Select confirms."
          : "Arrows move the highlight. Enter or F selects."}
        {mouseLook ? " Right-click frees the pointer. Click the field or right-click again to look." : ""}
      </p>
      {showPad && (
        <div className="field-pad" role="group" aria-label="Menu pad">
          <button type="button" className="up" aria-label="Up" onClick={() => setFocus((current) => moveMenu(slots, current, "up"))}>
            ↑
          </button>
          <button type="button" className="left" aria-label="Left" onClick={() => setFocus((current) => moveMenu(slots, current, "left"))}>
            ←
          </button>
          <button type="button" className="pick" onClick={() => activate(slots[index])}>
            Select
          </button>
          <button type="button" className="right" aria-label="Right" onClick={() => setFocus((current) => moveMenu(slots, current, "right"))}>
            →
          </button>
          <button type="button" className="down" aria-label="Down" onClick={() => setFocus((current) => moveMenu(slots, current, "down"))}>
            ↓
          </button>
        </div>
      )}
    </div>
  );
}
