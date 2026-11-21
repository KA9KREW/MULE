import type { GameSim } from "./sim";
import { getFoeBrain, type LearnFeatures } from "./learningAi";
import type { TrainKind } from "./types";

function featuresFrom(sim: GameSim): LearnFeatures {
  const s = sim.getState();
  const yours = s.buildings.filter((b) => b.team === "you");
  const foes = s.buildings.filter((b) => b.team === "foe");
  // Composition knowledge is limited to units that have crossed toward the
  // foe's half of the map; production queues remain hidden.
  const observedArmy = s.units.filter((u) => u.team === "you" && u.pos.y <= 430);
  const isCombatStructure = (kind: (typeof yours)[number]["kind"]) =>
    kind !== "barracks" && kind !== "house" && kind !== "barricade";
  return {
    yourTowers: yours.filter((b) => isCombatStructure(b.kind)).length,
    yourArmy: observedArmy.length,
    yourBarracks: yours.filter((b) => b.kind === "barracks").length,
    foeTowers: foes.filter((b) => isCombatStructure(b.kind)).length,
    foeArmy: s.units.filter((u) => u.team === "foe").length,
    foeBarracks: foes.filter((b) => b.kind === "barracks").length,
    foeGold: s.gold.foe,
    yourGold: s.gold.you,
    wave: s.waveIndex,
    hpLead: s.keeps.foe.hp - s.keeps.you.hp,
    yourFast: observedArmy.filter((u) => u.kind === "runner" || u.kind === "raider").length,
    yourHeavy: observedArmy.filter((u) => u.kind === "brute" || u.kind === "ward" || u.kind === "rammer" || u.kind === "trebuchet").length,
    yourRanged: observedArmy.filter((u) => u.kind === "archer").length,
  };
}

export function runAiTurn(sim: GameSim, _reserve: number) {
  // Rush timing still tightens as the saved brain gains games. Build and train
  // choices come from the board, not from that table's random early actions.
  const skill = Math.max(48, getFoeBrain().stats().intellect);
  const state = sim.getState();
  const seen = featuresFrom(sim);
  sim.aiAssignWorkers();

  const buildings = sim.getBuildings("foe");
  const houses = buildings.filter((b) => b.kind === "house");
  const defenses = buildings.filter(
    (b) => b.kind === "watchtower" || b.kind === "ballista" || b.kind === "catapult",
  );
  const barracks = buildings.filter((b) => b.kind === "barracks");
  const watches = defenses.filter((b) => b.kind === "watchtower").length;
  const ballistas = defenses.filter((b) => b.kind === "ballista").length;
  const catapults = defenses.filter((b) => b.kind === "catapult").length;
  const pressed = seen.hpLead < -50 || seen.yourArmy >= 5;

  const desiredHouses = pressed ? Math.min(2, Math.max(1, houses.length)) : seen.wave >= 5 ? 3 : seen.wave >= 2 ? 2 : 1;
  if (houses.length < desiredHouses && state.wood.foe >= 55) {
    sim.placeAiBuilding("house", 0);
  }
  if (sim.peonSlotsUsed("foe") < sim.peonCap("foe")) {
    sim.enqueuePeon("foe");
  }

  // Answer the army that has actually been seen. Open with one tower and a
  // barracks so the foe fights instead of copying the same four-tower wall.
  const wantWatch = seen.yourRanged >= 2 ? 2 : 1;
  const wantBallista = seen.yourFast >= 2 || seen.wave >= 3 ? 1 : 0;
  const wantCatapult = seen.yourHeavy >= 2 || seen.yourTowers >= 3 || seen.wave >= 5 ? 1 : 0;
  if (watches < wantWatch) {
    sim.placeAiBuilding("watchtower", 0);
  } else if (barracks.length === 0) {
    sim.placeAiBuilding("barracks", 0);
  } else if (ballistas < wantBallista) {
    sim.placeAiBuilding("ballista", 0);
  } else if (catapults < wantCatapult) {
    sim.placeAiBuilding("catapult", 0);
  } else if (!pressed && defenses.length < 3 && seen.wave >= 3) {
    sim.placeAiBuilding(seen.yourFast > seen.yourHeavy ? "ballista" : "watchtower", 0);
  }

  if (defenses.length >= 1 && seen.wave >= 1) {
    sim.aiBuildDefensiveBarricade();
  }
  if (barracks.length > 0) sim.aiTrainUnits();

  const upgrade =
    seen.yourFast >= 2 ? "rate" : seen.yourHeavy >= 2 || seen.yourTowers >= 3 ? "damage" : "adaptive";
  if (defenses.length >= 1 && (pressed || state.gold.foe > 110)) {
    sim.aiUpgradeDefense(upgrade);
  }
  sim.aiCoordinateRush(skill);
  if (state.gold.foe > 150 && barracks.length > 0) sim.aiTrainUnits();
}

export function notifyAiMatchStart() {
  getFoeBrain().beginMatch();
}

/** won === true means the human won (foe lost). */
export function notifyAiMatchEnd(humanWon: boolean | null) {
  const wonByFoe = humanWon === null ? null : !humanWon;
  getFoeBrain().endMatch(wonByFoe);
}

export function foeBrainStats() {
  return getFoeBrain().stats();
}

// Re-export for trainers that want typed train kinds
export type { TrainKind };
