import type { DoctrineTune } from "./doctrineTune";
import type { Team } from "./types";
import { arcadeTiming, planWave, type ArcadeDifficulty, type WavePlan } from "./wavePlanner";

/** Who runs one keep. The map still has exactly two keeps. */
export type CompanySeat = "human" | "cpu" | "assisted";

/**
 * Agreed before the first tick. `you` is the blue south keep, `foe` the red north keep.
 * Difficulty is the arcade ladder (Easy / Normal / Hard). There is no fourth ladder.
 */
export interface CompanySetup {
  difficulty: ArcadeDifficulty;
  sides: Record<Team, CompanySeat>;
}

/** Host plus one friend. A third player is refused. Observers are not players and do not count. */
export const MAX_COMPANY_HUMANS = 2;

export function defaultCompany(): CompanySetup {
  return { difficulty: "normal", sides: { you: "human", foe: "cpu" } };
}

export function companyUsable(value: unknown): value is CompanySetup {
  if (!value || typeof value !== "object") return false;
  const setup = value as CompanySetup;
  return (
    (setup.difficulty === "easy" || setup.difficulty === "normal" || setup.difficulty === "hard") &&
    seatOk(setup.sides?.you) &&
    seatOk(setup.sides?.foe)
  );
}

function seatOk(seat: unknown): seat is CompanySeat {
  return seat === "human" || seat === "cpu" || seat === "assisted";
}

/** Both keeps have a human. Assistants do not make a side a CPU opponent. */
export function companyIsPvp(setup: CompanySetup) {
  return setup.sides.you !== "cpu" && setup.sides.foe !== "cpu";
}

/**
 * Empty keeps become CPU. A seated keep cannot stay CPU.
 * An assistant choice is kept when someone is still sitting there.
 */
export function reconcileCompany(setup: CompanySetup, players: { team: Team }[]): CompanySetup {
  const sides: Record<Team, CompanySeat> = { you: setup.sides.you, foe: setup.sides.foe };
  for (const team of ["you", "foe"] as const) {
    const seated = players.some((p) => p.team === team);
    if (!seated) sides[team] = "cpu";
    else if (sides[team] === "cpu") sides[team] = "human";
  }
  return { difficulty: setup.difficulty, sides };
}

export function companySetupValid(setup: CompanySetup, players: { team: Team }[]) {
  if (players.length < 1 || players.length > MAX_COMPANY_HUMANS) return false;
  const next = reconcileCompany(setup, players);
  for (const team of ["you", "foe"] as const) {
    const seated = players.filter((p) => p.team === team).length;
    if (next.sides[team] === "cpu") {
      if (seated > 0) return false;
    } else if (seated === 0) return false;
  }
  return players.every((p) => p.team === "you" || p.team === "foe");
}

/**
 * PvP: both keeps get the same march at the picked difficulty. Easy eases both.
 * Hard uses the shared Hard march. Neither human gets the asymmetric enemy script.
 * PvE: the CPU keep gets that difficulty's march. The human keep always gets the
 * normal roster, including on Hard.
 */
export function companySidePlans(
  waveNumber: number,
  laneCount: number,
  setup: CompanySetup,
): { you: WavePlan; foe: WavePlan } {
  if (companyIsPvp(setup)) {
    const shared = planWave(waveNumber, laneCount, setup.difficulty);
    return { you: shared, foe: shared };
  }
  const friendly = planWave(waveNumber, laneCount, "normal");
  const pressed = planWave(waveNumber, laneCount, setup.difficulty);
  return {
    you: setup.sides.you === "cpu" ? pressed : friendly,
    foe: setup.sides.foe === "cpu" ? pressed : friendly,
  };
}

/**
 * The build clock is shared. PvP follows the difficulty for both players.
 * PvE Easy keeps the longer arcade clock. PvE Hard does not shorten the human's rest.
 */
export function companyTiming(setup: CompanySetup) {
  if (!companyIsPvp(setup) && setup.difficulty === "hard") return arcadeTiming("normal");
  return arcadeTiming(setup.difficulty);
}

/**
 * Easy CPU opponent only. Same doctrine commander, tighter goals, so it banks
 * instead of spending every coin. Normal and Hard keep today's arcade builder.
 */
export function easyCpuTune(base: DoctrineTune): Partial<DoctrineTune> {
  return {
    churchGoal: 1,
    barracksGoal: 1,
    trebGoal: 1,
    ramGoal: Math.min(base.ramGoal, 3),
    spyGoal: 0,
    attackAt: base.attackAt + 8,
    earlyScreen: Math.max(4, base.earlyScreen),
    churchSaveAt: base.churchSaveAt + 160,
    siegeTrebCap: 1,
    ballistaGoal: Math.min(base.ballistaGoal, 1),
  };
}

export function companyDifficultyBlurb(setup: CompanySetup) {
  if (companyIsPvp(setup)) {
    if (setup.difficulty === "easy") return "Both keeps get the same easier march.";
    if (setup.difficulty === "hard") return "Both keeps get the same Hard march.";
    return "Both keeps get the same arcade march.";
  }
  if (setup.difficulty === "easy") {
    return "The CPU march is easier and its builder spends less. Your roster stays normal, with longer to build.";
  }
  if (setup.difficulty === "hard") {
    return "The CPU gets the Hard march. Your keep keeps the normal roster.";
  }
  return "The CPU plays today's arcade. Your keep gets the same normal roster.";
}

export function companySeatLabel(seat: CompanySeat) {
  if (seat === "assisted") return "Human + CPU";
  if (seat === "cpu") return "CPU";
  return "Human";
}
