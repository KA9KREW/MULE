import { useEffect, useRef, useState } from "react";
import type { PartnerMode, PartnerUi } from "../game/types";

interface PartnerBoxProps {
  partner: PartnerUi;
  /** Arrow keys and Enter, while Taken the Field and the site menu is closed. */
  keys: boolean;
  onMode: (mode: PartnerMode) => void;
  onCall: (token: string) => void;
  onCancel: (id: number) => void;
  onRelease: () => void;
}

type MenuDir = "up" | "down" | "left" | "right";

interface Slot {
  key: string;
  label: string;
  price?: string;
  enabled: boolean;
  pressed?: boolean;
  onPress: () => void;
}

const COLS = 2;

function moveGrid(count: number, index: number, dir: MenuDir): number {
  if (count <= 0) return 0;
  const clamped = Math.max(0, Math.min(index, count - 1));
  const col = clamped % COLS;
  const row = Math.floor(clamped / COLS);
  const rows = Math.ceil(count / COLS);
  if (dir === "left") return col > 0 ? clamped - 1 : clamped;
  if (dir === "right") return col < COLS - 1 && clamped + 1 < count ? clamped + 1 : clamped;
  if (dir === "up") {
    if (row === 0) return clamped;
    const next = (row - 1) * COLS + col;
    return next < count ? next : (row - 1) * COLS;
  }
  const below = (row + 1) * COLS + col;
  if (below < count) return below;
  if (row + 1 < rows) return count - 1;
  return clamped;
}

export function PartnerBox({ partner, keys, onMode, onCall, onCancel, onRelease }: PartnerBoxProps) {
  const slots: Slot[] = [
    ...partner.modes.map((mode) => ({
      key: mode.id,
      label: mode.label,
      enabled: true,
      pressed: partner.mode === mode.id,
      onPress: () => onMode(mode.id),
    })),
    ...partner.queue.map((call) => ({
      key: `cancel-${call.id}`,
      label: call.label,
      price: "Cancel",
      enabled: true,
      onPress: () => onCancel(call.id),
    })),
    ...partner.calls.map((call) => ({
      key: call.token,
      label: call.label,
      price: call.price,
      enabled: call.enabled,
      onPress: () => onCall(call.token),
    })),
    {
      key: "release",
      label: "Release to CPU",
      enabled: partner.canRelease,
      onPress: onRelease,
    },
  ];

  const [focus, setFocus] = useState(0);
  const slotsRef = useRef(slots);
  const focusRef = useRef(0);
  const keysRef = useRef(keys);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  slotsRef.current = slots;
  keysRef.current = keys;
  const index = slots.length === 0 ? 0 : Math.min(focus, slots.length - 1);
  focusRef.current = index;

  useEffect(() => {
    if (!keys) return;
    itemRefs.current[index]?.scrollIntoView({ block: "nearest" });
  }, [index, keys]);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (!keysRef.current) return;
      const target = ev.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA")) return;
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
          const next = moveGrid(slotsRef.current.length, current, dir);
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

  const activate = (slot: Slot) => {
    if (slot.enabled) slot.onPress();
  };

  return (
    <div
      className="sheet-float partner-box"
      role="region"
      aria-label="CPU partner"
      onMouseDown={(ev) => ev.stopPropagation()}
    >
      <div className="detail-title">CPU partner</div>
      <p className="partner-doing">Doing: {partner.active ?? "Idle"}</p>
      <div className="field-choices">
        {slots.map((slot, slotIndex) => (
          <button
            key={slot.key}
            ref={(node) => {
              itemRefs.current[slotIndex] = node;
            }}
            type="button"
            className={`train-opt${slot.enabled ? " afford" : ""}${slot.pressed ? " on" : ""}${
              keys && slotIndex === index ? " field-focus" : ""
            }`}
            disabled={!slot.enabled}
            aria-pressed={slot.pressed ? true : undefined}
            aria-current={keys && slotIndex === index ? "true" : undefined}
            onClick={() => activate(slot)}
          >
            <strong>{slot.label}</strong>
            {slot.price ? <em>{slot.price}</em> : null}
          </button>
        ))}
      </div>
      <p className="field-keys">
        {keys
          ? "Arrows move the highlight. Enter selects. On a site, that menu keeps the arrows."
          : "Order, control-group, or take the field to claim troops. Release sends them back."}
      </p>
    </div>
  );
}
