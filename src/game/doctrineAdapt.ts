import { isWardKind } from "./balance";
import type { DoctrineTune } from "./doctrineTune";
import type { GameSim } from "./sim";
import type { Team, TrainKind } from "./types";

export type AdaptiveStance =
  | "standard"
  | "hold-rush"
  | "punish-greed"
  | "anti-fortress"
  | "anti-ballista"
  | "anti-ward"
  | "anti-swarm"
  | "anti-siege";

export interface EnemyIntel {
  watchtowers: number;
  ballistas: number;
  catapults: number;
  defenseTowers: number;
  barracks: number;
  churches: number;
  houses: number;
  barricades: number;
  wards: number;
  levies: number;
  archers: number;
  runners: number;
  rams: number;
  trebs: number;
  spies: number;
  totalArmy: number;
  approachingHome: number;
}

export interface AdaptivePlan {
  stance: AdaptiveStance;
  wantBallistas: number;
  wantCatapults: number;
  wantTrebs: number;
  wantRams: number;
  wantSpies: number;
  needGuardDogs: boolean;
  emergencyDefend: boolean;
  bankForTreb: boolean;
  wardPct: number;
  archerPct: number;
  runnerPct: number;
  pushFloor: number;
  requireTrebs: number;
  upgradePref: "damage" | "rate" | "adaptive";
}

/**
 * Map-visible intel only (enemy structures on the field + living spawned units).
 * Never peeks into hidden training queues, keeping Human vs AI 100% fair.
 */
export function scoutEnemy(sim: GameSim, team: Team): EnemyIntel {
  const s = sim.getState();
  const enemy: Team = team === "foe" ? "you" : "foe";
  const blds = s.buildings.filter((b) => b.team === enemy && b.hp > 0);
  const watchtowers = blds.filter((b) => b.kind === "watchtower").length;
  const ballistas = blds.filter((b) => b.kind === "ballista").length;
  const catapults = blds.filter((b) => b.kind === "catapult").length;
  const barracks = blds.filter((b) => b.kind === "barracks").length;
  const churches = blds.filter((b) => b.kind === "church").length;
  const houses = blds.filter((b) => b.kind === "house").length;
  const barricades = s.barricades.filter((b) => b.team === enemy && b.built && b.hp > 0).length;

  const units = s.units.filter((u) => u.team === enemy && u.hp > 0);
  const combatUnits = units.filter((u) => u.fromBarracks);
  const approachingHome = units.filter((u) =>
    team === "foe" ? u.pos.y <= 520 : u.pos.y >= s.keeps.you.pos.y - 520,
  ).length;

  return {
    watchtowers,
    ballistas,
    catapults,
    defenseTowers: watchtowers + ballistas + catapults,
    barracks,
    churches,
    houses,
    barricades,
    wards: combatUnits.filter((u) => isWardKind(u.kind)).length,
    levies: combatUnits.filter((u) => u.kind === "levy").length,
    archers: combatUnits.filter((u) => u.kind === "archer").length,
    runners: combatUnits.filter((u) => u.kind === "runner").length,
    rams: combatUnits.filter((u) => u.kind === "rammer").length,
    trebs: combatUnits.filter((u) => u.kind === "trebuchet").length,
    spies: combatUnits.filter((u) => u.kind === "spy").length,
    totalArmy: combatUnits.length,
    approachingHome,
  };
}

/**
 * On-the-fly counter planner grounded in Roadkeep's combat math:
 * - Wards counter archers/watchtowers; Levies (+25%) & Ballistas counter Wards.
 * - Catapults splash clumps & hit Trebs (1.65x); Spies & Runners (1.55x) hunt Trebs.
 * - Trebuchets (190 range) & Spies dismantle Ballista (178 range) fortresses.
 * - Ballista Rate Rank 1+ posts guard dogs that instakill Spies.
 */
export function adaptDoctrinePlan(
  tune: DoctrineTune,
  intel: EnemyIntel,
  own: {
    time: number;
    ecoFull: boolean;
    churches: number;
    armyUsed: number;
    armyCap: number;
    trebs: number;
    keepHpRatio: number;
  },
): AdaptivePlan {
  let stance: AdaptiveStance = "standard";
  let wardPct = tune.wardPct;
  let archerPct = tune.archerPct;
  let runnerPct = 0;

  const lateDefense = own.ecoFull && (own.churches >= 1 || own.time >= 200 || intel.totalArmy >= 10);
  let wantBallistas = lateDefense ? Math.max(tune.ballistaGoal, 2) : tune.ballistaGoal;
  let wantCatapults = lateDefense ? 1 : 0;

  const fortified = intel.defenseTowers >= 3 || (own.time >= 210 && intel.defenseTowers >= 2);
  let wantTrebs = own.ecoFull
    ? fortified
      ? Math.max(tune.trebGoal, intel.defenseTowers >= 4 ? 3 : 2)
      : intel.defenseTowers >= 2
        ? Math.min(tune.trebGoal, 2)
        : 0
    : 0;
  let wantRams = own.ecoFull ? tune.ramGoal : 0;
  let wantSpies =
    own.ecoFull && (intel.trebs > 0 || intel.defenseTowers >= 3)
      ? Math.max(tune.spyGoal, intel.trebs > 0 ? 2 : 1)
      : 0;
  let needGuardDogs = intel.spies > 0 || (own.time >= 240 && intel.barracks >= 1);
  let upgradePref: "damage" | "rate" | "adaptive" = "adaptive";

  // 1. Emergency anti-rush: enemy crosses early before our eco finishes.
  const emergencyDefend =
    (!own.ecoFull && (intel.approachingHome >= 5 || own.keepHpRatio < 0.85)) ||
    (own.keepHpRatio < 0.7 && intel.approachingHome >= 4);
  if (emergencyDefend) {
    stance = "hold-rush";
    wantBallistas = Math.max(wantBallistas, 1);
  }

  // 2. Counter enemy Siege (Trebuchets / heavy Rams).
  if (intel.trebs >= 1 || intel.rams >= 3) {
    stance = "anti-siege";
    if (intel.trebs >= 1) {
      wantSpies = own.ecoFull ? Math.max(wantSpies, Math.min(3, intel.trebs + 1)) : wantSpies;
      // Fast runners (54 spd, 1.55x melee vs trebs) rush enemy trebs down.
      runnerPct = 25;
      archerPct = Math.min(archerPct, 10); // Archers deal only 0.28x to trebs!
      wantCatapults = Math.max(wantCatapults, 1);
    }
    if (intel.rams >= 3) {
      wantBallistas = Math.max(wantBallistas, 2);
      archerPct = Math.min(archerPct, 10); // Archers deal only 0.38x to rams!
      upgradePref = "damage";
    }
  }

  // 3. Counter enemy Fortress / Ballista Wall (Issues #9 & #10 pattern).
  if (intel.defenseTowers >= 3) {
    if (stance === "standard") stance = intel.ballistas >= 2 ? "anti-ballista" : "anti-fortress";
    wantBallistas = Math.max(wantBallistas, 2);
    wantCatapults = Math.max(wantCatapults, 1);
    wantTrebs = own.ecoFull ? Math.max(wantTrebs, intel.defenseTowers >= 4 ? 3 : 2) : 0;
    wantSpies = own.ecoFull ? Math.max(wantSpies, 2) : 0;
    if (intel.ballistas >= 2) {
      // Ballistas pierce Ward armor; lean into cheaper Levies + Rams behind Trebuchets.
      wardPct = Math.min(wardPct, 20);
      archerPct = Math.min(archerPct, 20);
      wantRams = own.ecoFull ? Math.max(wantRams, 5) : 0;
    } else {
      // Watchtower/Catapult wall without Ballistas: Wards (0.88 resist) walk right through!
      wardPct = Math.max(wardPct, 45);
    }
  }

  // 4. Counter enemy Unit Composition dynamically.
  if (intel.wards >= 4 && intel.wards >= intel.levies) {
    if (stance === "standard") stance = "anti-ward";
    // Archers only deal 0.40x to Wards; Levies deal 1.25x bonus vs Wards!
    archerPct = 0;
    wardPct = Math.min(wardPct, 20);
    wantBallistas = Math.max(wantBallistas, 2);
    upgradePref = "damage";
  } else if (intel.archers >= 5) {
    if (stance === "standard") stance = "anti-swarm";
    // Wards take 0.40x from Archers; Catapults splash clumped Archers.
    wardPct = Math.max(wardPct, 45);
    archerPct = Math.min(archerPct, 15);
    wantCatapults = Math.max(wantCatapults, 1);
  } else if (intel.levies + intel.runners >= 8) {
    if (stance === "standard") stance = "anti-swarm";
    wantCatapults = Math.max(wantCatapults, 1);
    if (intel.runners >= 4) {
      wantBallistas = Math.max(wantBallistas, 2);
      upgradePref = "rate";
    }
    archerPct = Math.max(archerPct, 30);
  }

  // 5. Punish greedy low-defense openings (enemy booms houses/churches with <= 1 tower).
  const greedyEnemy =
    own.ecoFull &&
    own.time < 220 &&
    intel.defenseTowers <= 1 &&
    intel.totalArmy <= 4 &&
    (intel.houses >= 3 || intel.churches >= 1);
  if (greedyEnemy && stance === "standard") {
    stance = "punish-greed";
    runnerPct = Math.max(runnerPct, 20);
  }

  // 6. Timber banking & push threshold discipline.
  const bankForTreb =
    own.ecoFull &&
    fortified &&
    own.trebs < Math.min(wantTrebs, 3) &&
    own.armyUsed >= 8;

  let pushFloor = tune.attackAt;
  let requireTrebs = 0;
  if (greedyEnemy) {
    pushFloor = Math.max(12, tune.attackAt - 6);
  } else if (intel.defenseTowers >= 3 && own.churches >= 1) {
    // Never feed a small wave into a 3-4 tower fortress; wait for a real siege army.
    pushFloor = Math.min(own.armyCap - 3, Math.max(tune.attackAt, 28));
    requireTrebs = 2;
  } else if (intel.totalArmy >= 22 && own.churches >= 1) {
    // Match a large human army instead of throwing 20 into 35+.
    pushFloor = Math.min(own.armyCap - 3, Math.max(tune.attackAt, Math.min(32, intel.totalArmy)));
  }

  // Normalize percentages cleanly so levy gets the remainder.
  const sum = wardPct + archerPct + runnerPct;
  if (sum > 90) {
    const scale = 90 / sum;
    wardPct = Math.round(wardPct * scale);
    archerPct = Math.round(archerPct * scale);
    runnerPct = Math.round(runnerPct * scale);
  }

  return {
    stance,
    wantBallistas,
    wantCatapults,
    wantTrebs,
    wantRams,
    wantSpies,
    needGuardDogs,
    emergencyDefend,
    bankForTreb,
    wardPct,
    archerPct,
    runnerPct,
    pushFloor,
    requireTrebs,
    upgradePref,
  };
}

export function pickAdaptiveScreenUnit(plan: AdaptivePlan, slot: number): TrainKind {
  const roll = (slot * 17) % 100;
  if (roll < plan.wardPct) return "ward";
  if (roll < plan.wardPct + plan.archerPct) return "archer";
  if (roll < plan.wardPct + plan.archerPct + plan.runnerPct) return "runner";
  return "levy";
}
