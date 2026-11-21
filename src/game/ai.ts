import type { GameSim } from "./sim";
import { getFoeBrain, type LearnFeatures } from "./learningAi";
import { bestSelfPlayStyle, type AiStyle } from "./selfPlayBook";
import type { Team, TrainKind } from "./types";

function featuresFrom(sim: GameSim, team: Team): LearnFeatures {
  const s = sim.getState();
  const enemy = team === "foe" ? "you" : "foe";
  const yours = s.buildings.filter((b) => b.team === enemy);
  const foes = s.buildings.filter((b) => b.team === team);
  // Composition knowledge is limited to units that have crossed toward this
  // keep. Production queues remain hidden.
  const observedArmy = s.units.filter((u) => {
    if (u.team !== enemy || u.hp <= 0) return false;
    return team === "foe" ? u.pos.y <= 430 : u.pos.y >= s.keeps.you.pos.y - 430;
  });
  const isCombatStructure = (kind: (typeof yours)[number]["kind"]) =>
    kind !== "barracks" && kind !== "house" && kind !== "barricade";
  return {
    yourTowers: yours.filter((b) => isCombatStructure(b.kind)).length,
    yourArmy: observedArmy.length,
    yourBarracks: yours.filter((b) => b.kind === "barracks").length,
    foeTowers: foes.filter((b) => isCombatStructure(b.kind)).length,
    foeArmy: s.units.filter((u) => u.team === team).length,
    foeBarracks: foes.filter((b) => b.kind === "barracks").length,
    foeGold: s.gold[team],
    yourGold: s.gold[enemy],
    wave: s.waveIndex,
    hpLead: s.keeps[team].hp - s.keeps[enemy].hp,
    yourFast: observedArmy.filter((u) => u.kind === "runner" || u.kind === "raider").length,
    yourHeavy: observedArmy.filter((u) => u.kind === "brute" || u.kind === "ward" || u.kind === "rammer" || u.kind === "trebuchet").length,
    yourRanged: observedArmy.filter((u) => u.kind === "archer").length,
  };
}

function economy(sim: GameSim, team: Team, housesWanted: number) {
  const state = sim.getState();
  const houses = sim.getBuildings(team).filter((b) => b.kind === "house").length;
  if (houses < housesWanted && state.wood[team] >= 55) sim.placeAiBuilding("house", 0, team);
  if (sim.peonSlotsUsed(team) < sim.peonCap(team)) sim.enqueuePeon(team);
}

function trainRotation(sim: GameSim, team: Team, kinds: TrainKind[]) {
  const tick = Math.floor(sim.getState().time / 5);
  sim.aiEnqueueTrain(kinds[tick % kinds.length]!, team);
}

/** Counters whatever has crossed the midline, then attacks in mixed groups. */
function reactiveCommander(sim: GameSim, team: Team) {
  const skill = Math.max(48, getFoeBrain().stats().intellect);
  const state = sim.getState();
  const seen = featuresFrom(sim, team);
  sim.aiAssignWorkers(team);
  const buildings = sim.getBuildings(team);
  const defenses = buildings.filter((b) => b.kind === "watchtower" || b.kind === "ballista" || b.kind === "catapult");
  const barracks = buildings.filter((b) => b.kind === "barracks");
  const watches = defenses.filter((b) => b.kind === "watchtower").length;
  const pressed = seen.hpLead < -50 || seen.yourArmy >= 5;
  economy(sim, team, pressed ? 1 : seen.wave >= 2 ? 2 : 1);
  const wantWatch = seen.yourRanged >= 2 ? 2 : 1;
  if (watches < wantWatch) sim.placeAiBuilding("watchtower", 0, team);
  else if (barracks.length === 0) sim.placeAiBuilding("barracks", 0, team);
  else if ((seen.yourFast >= 2 || seen.wave >= 3) && !defenses.some((b) => b.kind === "ballista")) {
    sim.placeAiBuilding("ballista", 0, team);
  } else if ((seen.yourHeavy >= 2 || seen.yourTowers >= 3) && !defenses.some((b) => b.kind === "catapult")) {
    sim.placeAiBuilding("catapult", 0, team);
  }
  if (defenses.length >= 1 && seen.wave >= 1) sim.aiBuildDefensiveBarricade(team);
  if (barracks.length > 0) sim.aiTrainUnits(team, null);
  if (defenses.length >= 1 && (pressed || state.gold[team] > 110)) {
    sim.aiUpgradeDefense(seen.yourFast >= 2 ? "rate" : "adaptive", team);
  }
  sim.aiCoordinateRush(skill, team);
}

/** Population first, then a levy flood. Towers come only after the army is rolling. */
function armyCommander(sim: GameSim, team: Team) {
  sim.aiAssignWorkers(team);
  const buildings = sim.getBuildings(team);
  const barracks = buildings.filter((b) => b.kind === "barracks");
  const houses = buildings.filter((b) => b.kind === "house").length;
  economy(sim, team, 3);
  if (houses >= 1 && barracks.length === 0) sim.placeAiBuilding("barracks", 0, team);
  if (barracks.length > 0) trainRotation(sim, team, ["levy", "levy", "runner", "ward"]);
  if (houses >= 2 && !buildings.some((b) => b.kind === "watchtower")) sim.placeAiBuilding("watchtower", 0, team);
  sim.aiCoordinateRush(80, team);
}

/** Barracks, then rams and a catapult. It does not wall up with watchtowers. */
function siegeCommander(sim: GameSim, team: Team) {
  sim.aiAssignWorkers(team);
  const buildings = sim.getBuildings(team);
  const barracks = buildings.filter((b) => b.kind === "barracks");
  economy(sim, team, 1);
  if (barracks.length === 0) sim.placeAiBuilding("barracks", 0, team);
  else if (!buildings.some((b) => b.kind === "catapult")) sim.placeAiBuilding("catapult", 0, team);
  else if (!buildings.some((b) => b.kind === "watchtower")) sim.placeAiBuilding("watchtower", 0, team);
  if (barracks.length > 0) trainRotation(sim, team, ["rammer", "ward", "trebuchet", "levy"]);
  sim.aiCoordinateRush(70, team);
}

/** Towers, upgrades, and barricades. Troops are a late afterthought. */
function towerCommander(sim: GameSim, team: Team) {
  sim.aiAssignWorkers(team);
  const state = sim.getState();
  const buildings = sim.getBuildings(team);
  const watches = buildings.filter((b) => b.kind === "watchtower").length;
  const defenses = buildings.filter((b) => b.kind === "watchtower" || b.kind === "ballista" || b.kind === "catapult");
  economy(sim, team, 1);
  if (watches < 2) sim.placeAiBuilding("watchtower", 0, team);
  else if (!buildings.some((b) => b.kind === "ballista")) sim.placeAiBuilding("ballista", 0, team);
  else if (!buildings.some((b) => b.kind === "catapult")) sim.placeAiBuilding("catapult", 0, team);
  else if (!buildings.some((b) => b.kind === "barracks")) sim.placeAiBuilding("barracks", 0, team);
  if (defenses.length >= 1) {
    sim.aiBuildDefensiveBarricade(team);
    if (state.gold[team] > 80) sim.aiUpgradeDefense("damage", team);
  }
  if (buildings.some((b) => b.kind === "barracks")) trainRotation(sim, team, ["archer", "ward", "levy"]);
  sim.aiCoordinateRush(30, team);
}

function zoneOf(sim: GameSim, team: Team, padId: string | undefined) {
  return sim.getPads(team).find((p) => p.id === padId)?.zone;
}

/**
 * Full yard and peon cap, upgraded barracks (damage + rate), ballista defense,
 * churches, and siege/screen composition driven by the evolved DoctrineTune.
 */
function doctrineCommander(sim: GameSim, team: Team) {
  sim.aiAssignWorkers(team);
  if (sim.peonSlotsUsed(team) < sim.peonCap(team)) sim.enqueuePeon(team);
  const state = sim.getState();
  const enemy = team === "foe" ? "you" : "foe";
  const seen = featuresFrom(sim, team);
  const buildings = sim.getBuildings(team);
  const ecoPads = sim.getPads(team).filter((p) => p.zone === "eco").length;
  const yard = buildings.filter((b) => b.kind === "house" && zoneOf(sim, team, b.padId) === "eco").length;
  const barList = buildings.filter((b) => b.kind === "barracks");
  const barracks = barList.length;
  const barsBusy = barracks > 0 && barList.every((b) => b.queue.length >= 2);
  const ballistas = buildings.filter((b) => b.kind === "ballista");
  const forward = buildings.filter((b) => b.kind === "house" && zoneOf(sim, team, b.padId) === "midEco").length;
  const churches = buildings.filter((b) => b.kind === "church").length;
  const queued = buildings.flatMap((b) => b.queue.map((job) => job.kind));
  const ownUnits = state.units.filter((u) => u.team === team && u.hp > 0);
  const countKind = (kind: string) =>
    ownUnits.filter((u) => u.kind === kind).length +
    queued.filter((queuedKind) => queuedKind === kind).length;
  const trebs = countKind("trebuchet");
  const rams = countKind("rammer");
  const spies = countKind("spy");
  const tune = sim.getDoctrineTune(team);
  const ecoFull = yard >= ecoPads && sim.peonSlotsUsed(team) >= sim.peonCap(team);
  const enemyTrebs = state.units.filter((u) => u.team === enemy && u.hp > 0 && u.kind === "trebuchet").length;
  const wantTrebs = ecoFull ? (seen.yourTowers >= 2 ? tune.trebGoal : Math.min(tune.trebGoal, 2)) : 0;
  const wantRams = ecoFull ? tune.ramGoal : 0;
  const wantSpies = ecoFull && (enemyTrebs > 0 || seen.yourTowers >= 2) ? tune.spyGoal : 0;

  if (yard < 1) sim.placeAiBuilding("house", 0, team, "eco");
  else if (tune.ecoFirst >= 1 && yard < ecoPads) sim.placeAiBuilding("house", 0, team, "eco");
  else if (ballistas.length < tune.ballistaGoal) sim.placeAiBuilding("ballista", 0, team);
  else if (barracks < tune.barracksGoal) sim.placeAiBuilding("barracks", 0, team);
  else if (yard < ecoPads) sim.placeAiBuilding("house", 0, team, "eco");
  else if (barsBusy && barracks < 3) sim.placeAiBuilding("barracks", 0, team);
  else if (forward + churches < 2) sim.placeAiBuilding("house", 0, team, "midEco");
  else if (churches < tune.churchGoal) sim.aiConsecrate(team);
  else if (barracks < 3 && state.gold[team] >= 220 && state.wood[team] >= 140) {
    sim.placeAiBuilding("barracks", 0, team);
  }

  if (tune.barricades >= 1 && (seen.yourArmy >= 4 || state.waveIndex >= 2) && ballistas.length >= 1) {
    sim.aiBuildDefensiveBarricade(team);
  }
  if (ecoFull) sim.aiUpgradeBarracks(team);
  if (ballistas.some((b) => b.damageRank < 2 || b.rateRank < 2) && state.gold[team] >= 160) {
    sim.aiUpgradeDefense("adaptive", team);
  }

  const pickScreen = (slot: number): TrainKind => {
    const roll = (slot * 17) % 100;
    if (roll < tune.wardPct) return "ward";
    if (roll < tune.wardPct + tune.archerPct) return "archer";
    return "levy";
  };

  const armyUsed = sim.armySlotsUsed(team);
  const armyCap = sim.armyCap(team);
  const needFirstSiege = ecoFull && seen.yourTowers >= 2 && trebs === 0 && rams === 0;
  if (barracks >= 1) {
    const tick = Math.floor(state.time / 3);
    if (!ecoFull) {
      const needEarly = seen.yourArmy >= 2 ? Math.max(tune.earlyScreen, 4) : tune.earlyScreen;
      if (armyUsed < needEarly) sim.aiEnqueueTrain(pickScreen(tick), team);
    } else {
      for (let b = 0; b < barracks; b++) {
        const w = state.wood[team];
        const g = state.gold[team];
        const slotsLeft = armyCap - sim.armySlotsUsed(team);
        if (b === 0 && trebs < wantTrebs && w >= 200 && g >= 150) {
          sim.aiEnqueueTrain("trebuchet", team);
        } else if (b === 0 && rams < wantRams && w >= 100 && g >= 75) {
          sim.aiEnqueueTrain("rammer", team);
        } else if (b === 0 && spies < wantSpies && g >= 165) {
          sim.aiEnqueueTrain("spy", team);
        } else if (needFirstSiege && slotsLeft <= 2) {
          // Leave room for a treb or ram instead of filling the last cap slots with screen.
        } else {
          const pick = pickScreen(tick + b);
          // Don't burn timber on archers while banking for the first siege engine.
          const train: TrainKind = needFirstSiege && pick === "archer" && w < 180 ? "levy" : pick;
          sim.aiEnqueueTrain(train, team);
        }
      }
    }
  }

  const keepThreatened =
    state.keeps[team].hp < state.keeps[team].maxHp * 0.85 && seen.yourArmy >= 4;
  const alreadyPushing = state.defendLayer[team] === "assault";
  const hasSiege = seen.yourTowers < 2 || trebs >= 1 || rams >= 1;
  const cappedOut = armyUsed >= Math.max(tune.attackAt, armyCap - 2);
  const attackReady =
    !keepThreatened &&
    (cappedOut ||
      (alreadyPushing && armyUsed >= Math.max(4, Math.floor(tune.attackAt / 2))) ||
      (armyUsed >= tune.attackAt && hasSiege));
  if (attackReady) sim.setDefendLayer("assault", team);
  else sim.setDefendLayer("home", team);
}

const COMMANDERS: Record<AiStyle, (sim: GameSim, team: Team) => void> = {
  reactive: reactiveCommander,
  army: armyCommander,
  siege: siegeCommander,
  towers: towerCommander,
  doctrine: doctrineCommander,
};

export function runAiTurn(sim: GameSim, _reserve: number, team: Team = "foe", style: AiStyle = bestSelfPlayStyle()) {
  COMMANDERS[style](sim, team);
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
