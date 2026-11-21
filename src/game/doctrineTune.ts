/** Knobs the doctrine feedback loop is allowed to change. */
export type DoctrineTune = {
  attackAt: number;
  trebGoal: number;
  ramGoal: number;
  spyGoal: number;
  escortGap: number;
  standoff: number;
  padGuards: number;
  barracksGoal: number;
  ballistaGoal: number;
  wardPct: number;
  archerPct: number;
  earlyScreen: number;
  ecoFirst: number;
  barricades: number;
  churchGoal: number;
};

export const doctrineTune: DoctrineTune = {
  attackAt: 16,
  trebGoal: 5,
  ramGoal: 6,
  spyGoal: 1,
  escortGap: 34,
  standoff: 175,
  padGuards: 0,
  barracksGoal: 1,
  ballistaGoal: 1,
  wardPct: 35,
  archerPct: 25,
  earlyScreen: 2,
  ecoFirst: 1,
  barricades: 1,
  churchGoal: 2,
};
