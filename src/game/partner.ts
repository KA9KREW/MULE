import {
  CATHEDRAL_UPGRADE_GOLD,
  CATHEDRAL_UPGRADE_WOOD,
  CHURCH_UPGRADE_GOLD,
  KEEP_UPGRADE_GOLD,
  KEEP_UPGRADE_WOOD,
  MARKET_UPGRADE_GOLD,
  MARKET_UPGRADE_WOOD,
  UNIT_DEFS,
} from "./balance";
import type { PartnerCall, PartnerMode, PartnerTrainId, PartnerUpgradeId } from "./types";

export const PARTNER_QUEUE_CAP = 5;

export const PARTNER_MODE_CHOICES: { id: PartnerMode; label: string }[] = [
  { id: "handsOff", label: "Hands off" },
  { id: "reinforce", label: "Reinforce me" },
  { id: "hold", label: "Hold the line" },
  { id: "lead", label: "CPU leads" },
];

const TRAINS: PartnerTrainId[] = [
  "levy",
  "runner",
  "archer",
  "ward",
  "rammer",
  "trebuchet",
  "spy",
  "raider",
  "brute",
  "templar",
];

const UPGRADES: PartnerUpgradeId[] = ["keep", "market", "church", "cathedral"];

export function partnerModeUsable(value: unknown): value is PartnerMode {
  return value === "handsOff" || value === "reinforce" || value === "hold" || value === "lead";
}

function price(gold: number, wood: number) {
  const parts: string[] = [];
  if (gold > 0) parts.push(`${gold}g`);
  if (wood > 0) parts.push(`${wood}w`);
  return parts.join(" · ") || "0";
}

export function partnerCallLabel(call: { kind: "train" | "upgrade"; unit?: PartnerTrainId; site?: PartnerUpgradeId }) {
  if (call.kind === "train" && call.unit && (TRAINS as string[]).includes(call.unit)) {
    return `Train ${UNIT_DEFS[call.unit].label.toLowerCase()}`;
  }
  if (call.kind === "upgrade" && call.site === "keep") return "Upgrade keep";
  if (call.kind === "upgrade" && call.site === "market") return "Market";
  if (call.kind === "upgrade" && call.site === "cathedral") return "Cathedral";
  if (call.kind === "upgrade" && call.site === "church") return "Church";
  return "Call";
}

export interface PartnerChoice {
  token: string;
  label: string;
  price: string;
}

export function partnerChoices(): PartnerChoice[] {
  const upgrades: PartnerChoice[] = [
    { token: "upgrade:keep", label: "Upgrade keep", price: price(KEEP_UPGRADE_GOLD, KEEP_UPGRADE_WOOD) },
    { token: "upgrade:market", label: "Market", price: price(MARKET_UPGRADE_GOLD, MARKET_UPGRADE_WOOD) },
    { token: "upgrade:church", label: "Church", price: price(CHURCH_UPGRADE_GOLD, 0) },
    {
      token: "upgrade:cathedral",
      label: "Cathedral",
      price: price(CATHEDRAL_UPGRADE_GOLD, CATHEDRAL_UPGRADE_WOOD),
    },
  ];
  const trains = TRAINS.map((unit) => {
    const def = UNIT_DEFS[unit];
    return {
      token: `train:${unit}`,
      label: `Train ${def.label.toLowerCase()}`,
      price: price(def.cost ?? 0, def.woodCost ?? 0),
    };
  });
  return [...upgrades, ...trains];
}

export function partnerTokenUsable(
  token: string,
): { kind: "train"; unit: PartnerTrainId } | { kind: "upgrade"; site: PartnerUpgradeId } | null {
  const split = token.split(":");
  const kind = split[0];
  const id = split[1];
  if (!id || split.length !== 2) return null;
  if (kind === "train" && (TRAINS as string[]).includes(id)) return { kind: "train", unit: id as PartnerTrainId };
  if (kind === "upgrade" && (UPGRADES as string[]).includes(id)) return { kind: "upgrade", site: id as PartnerUpgradeId };
  return null;
}

export function partnerCallUsable(value: unknown): value is PartnerCall {
  if (!value || typeof value !== "object") return false;
  const call = value as PartnerCall;
  if (!Number.isFinite(call.id)) return false;
  if (call.kind === "train") return !!call.unit && (TRAINS as string[]).includes(call.unit);
  if (call.kind === "upgrade") return !!call.site && (UPGRADES as string[]).includes(call.site);
  return false;
}
