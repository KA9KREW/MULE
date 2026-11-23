export type Team = "you" | "foe";
export type WaveUnitKind = "raider" | "soldier" | "brute" | "runner" | "ward";
export type TrainKind = "levy" | "runner" | "archer" | "ward" | "rammer" | "trebuchet" | "spy";
/** Trained at an upgraded keep. Not a barracks train kind. */
export type KeepTrainKind = "raider" | "brute";
/** Human + CPU assistant. One mode at a time. Default is hands off. */
export type PartnerMode = "handsOff" | "reinforce" | "hold" | "lead";
/** Barracks trains, keep trains, and cathedral templars. */
export type PartnerTrainId = TrainKind | KeepTrainKind | "templar";
/** Base upgrades the assistant can be told to finish before its own plan. */
export type PartnerUpgradeId = "keep" | "market" | "cathedral" | "church";
export interface PartnerCall {
  id: number;
  kind: "train" | "upgrade";
  unit?: PartnerTrainId;
  site?: PartnerUpgradeId;
}
export type SiegePhase = "packed" | "unpacking" | "ready" | "packing";
/** Templars queue at a cathedral, not at barracks. Arena starter uses peon. */
export type UnitKind = WaveUnitKind | TrainKind | "templar" | "peon";
export type BuildingKind = "watchtower" | "ballista" | "catapult" | "barracks" | "church" | "house" | "market" | "barricade";

/** Per-team wood/gold exchange. Your trades do not move the other keep's prices. */
export interface MarketQuotes {
  /** Gold paid to buy 100 wood. */
  woodBuy: number;
  /** Gold gained for selling 100 wood. */
  woodSell: number;
  /** Wood paid to buy 100 gold. */
  goldBuy: number;
  /** Wood gained for selling 100 gold. */
  goldSell: number;
}

export interface FieldChoice {
  id: string;
  label: string;
  gold: number;
  wood: number;
  enabled: boolean;
  price: string;
}

/** Left popup while the local player is taken the field and standing on a site. */
export type FieldSiteUi =
  | { kind: "build"; padId: string; title: string; choices: FieldChoice[] }
  | {
      kind: "train";
      /** 0 when the site is the keep. */
      buildingId: number;
      keep: boolean;
      title: string;
      rally: boolean;
      multi: boolean;
      choices: FieldChoice[];
      freeLines: string[];
    }
  | { kind: "chapel"; buildingId: number; choices: FieldChoice[] }
  | {
      kind: "market";
      buildingId: number;
      woodBuy: number;
      woodSell: number;
      goldBuy: number;
      goldSell: number;
      canBuyWood: boolean;
      canSellWood: boolean;
      canBuyGold: boolean;
      canSellGold: boolean;
    };
export type ResourceKind = "pine" | "copper";
/** eco = keep-yard houses; midEco = purple no-man's-land houses (army pop). */
export type PadZone = "combat" | "eco" | "midEco";
export type GamePhase = "title" | "running" | "ended";
/** Procedural map id, e.g. `seed-1842291`. Infinite campaign maps. */
export type MapId = string;
/** Road index, west to east. A map has 1–3 roads. */
export type Lane = 0 | 1 | 2;
export type LaneCount = 1 | 2 | 3;
/** Troop stance: own keep, river belts, or enemy keep. */
export type DefendLayerId = "keep" | "home" | "mid" | "forward" | "assault";

export interface Vec2 {
  x: number;
  y: number;
}

export interface PeonJob {
  timeLeft: number;
  totalTime: number;
}

export interface Keep {
  team: Team;
  pos: Vec2;
  hp: number;
  maxHp: number;
  hitFlash: number;
  attackTimer: number;
  attackFlash: number;
  attackTarget?: Vec2;
  peonQueue: PeonJob[];
  /** Paid upgrade (1000 gold, 1000 wood). Unlocks raider and brute training. */
  upgraded: boolean;
  /** Raider and brute jobs. Only filled after the keep is upgraded. */
  troopQueue: KeepTrainJob[];
  /** New keep troops guard the player who turned this on. */
  commanderRally?: boolean;
  commanderRallyPlayer?: string;
}

export interface Unit {
  id: number;
  team: Team;
  kind: UnitKind;
  lane: Lane;
  pos: Vec2;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  bounty: number;
  attackCooldown: number;
  attackTimer: number;
  towerResist: number;
  keepMult: number;
  siegeGap: number;
  targetUnitId?: number;
  targetKeep: boolean;
  fromBarracks: boolean;
  /** Runner only. The next melee hit is a charge until it connects; leaving contact arms it again. */
  chargeReady?: boolean;
  ignoreEnemyCreeps: boolean;
  rallyPoint?: Vec2;
  /** Spot where auto-engage broke off. The unit returns here before chasing again. */
  engageFrom?: Vec2;
  aiHeldForRush?: boolean;
  aiStagingPoint?: Vec2;
  /** Trebuchet only. Packed to roll; unpacked and ready to throw. */
  siegePhase?: SiegePhase;
  siegeTimer?: number;
  /** Templar: seconds until Rally is ready again. */
  rallyCooldown?: number;
  /** Seconds of Rally haste remaining (attack 25% faster). */
  rallyBuffTimer?: number;
  /** Arena gun-game ladder index (0 = peon … 4 = runner). */
  arenaRung?: number;
  /** Arena kills scored by this fighter (career). */
  arenaKills?: number;
  /** Kills on the current rung toward the next promote. */
  arenaRungProgress?: number;
  /** Last unit that damaged this body (arena kill credit). */
  lastHitBy?: number;
  /**
   * Look / travel yaw while driven (possess / Final Duel / arena).
   * Synced over skirmish so peers see turn-in-place; cleared when undriven.
   */
  facing?: number;
  /** Cohesive wave batch id (same wave + lane + team) so wave troops march in formation. */
  waveBatchId?: number;
  /** Friendly unit id this barracks unit is guarding & following (AoE2 guard). */
  guardUnitId?: number;
  /** Explicit AoE2 right-click attack target (enemy unit id). */
  orderTargetUnitId?: number;
  /** Explicit AoE2 right-click attack target (enemy building id). */
  orderTargetBuildingId?: number;
  /** Explicit AoE2 right-click attack target (enemy barricade id). */
  orderTargetBarricadeId?: number;
  /** Explicit AoE2 right-click attack target (enemy keep). */
  orderTargetKeep?: boolean;
  /** AoE2 patrol route endpoints. */
  patrolA?: Vec2;
  patrolB?: Vec2;
  patrolToB?: boolean;
  /** Stand ground: hold formation position and only fight enemies within reach. */
  holdPosition?: boolean;
  /** True when the player issued a direct micro order (move/guard/attack/patrol/hold). */
  manualOrder?: boolean;
  /**
   * Human + CPU only. Set when this player orders the troop, control-groups it, or possesses it.
   * Stays set until Release to CPU. The assistant never commands these troops.
   */
  humanOwned?: boolean;
}

/** First-person body the local player is driving, or none. */
export interface PossessedUi {
  id: number;
  kind: UnitKind;
  label: string;
  hp: number;
  maxHp: number;
  /** Kills and keep/barricade hits while driving soldiers this match. */
  visionScore: number;
  visionMax: number;
  /** Trebuchet possess: 0–1 wind on the arm. */
  charge: number;
  /** Building or barricade currently in the trebuchet sights. */
  aimLabel: string;
  /** Templar Rally: show ability control. */
  canRally?: boolean;
  /** Templar Rally ready (cooldown finished). */
  rallyReady?: boolean;
  /** Seconds left on Templar Rally cooldown. */
  rallyCooldown?: number;
}

export type WavePhase = "build" | "spawning" | "fighting";

export interface TrainJob {
  kind: TrainKind;
  timeLeft: number;
  totalTime: number;
}

export interface KeepTrainJob {
  kind: KeepTrainKind;
  timeLeft: number;
  totalTime: number;
}

/** Paid templar job at a cathedral. The unit kind is always templar. */
export interface TemplarJob {
  timeLeft: number;
  totalTime: number;
}

export interface Building {
  id: number;
  team: Team;
  kind: BuildingKind;
  padId: string;
  pos: Vec2;
  spent: number;
  spentWood: number;
  canRefund: boolean;
  damageRank: 0 | 1 | 2;
  rateRank: 0 | 1 | 2;
  attackTimer: number;
  trainTimer: number;
  animKick: number;
  hp: number;
  maxHp: number;
  queue: TrainJob[];
  rallyPoint?: Vec2;
  /** Spy sabotage. Gun stays silent while this is above zero. */
  disableTimer?: number;
  /** Church: seconds until the next free soldier. */
  churchLevyTimer?: number;
  /** Church: seconds until the next free templar. */
  churchTemplarTimer?: number;
  /** Church raised to a cathedral after that team's keep is upgraded. */
  cathedral?: boolean;
  /** Paid templar jobs. Only a cathedral fills this. */
  templarQueue?: TemplarJob[];
  /** New troops from this hall guard the player who turned this on. */
  commanderRally?: boolean;
  commanderRallyPlayer?: string;
}

export interface Pad {
  id: string;
  team: Team;
  pos: Vec2;
  /** Roads a tower on this pad can reach. Eco pads cover none. */
  laneCoverage: Lane[];
  zone: PadZone;
}

export interface ResourceNode {
  id: string;
  team: Team;
  kind: ResourceKind;
  pos: Vec2;
  loadsLeft: number;
  maxLoads: number;
  maxWorkers: number;
  workers: number;
  gatherTime: number;
  goldPerLoad: number;
  woodPerLoad: number;
  regenEvery: number;
  regenAcc: number;
}

export interface Barricade {
  id: number;
  team: Team;
  lane: Lane;
  pos: Vec2;
  hp: number;
  maxHp: number;
  buildProgress: number;
  buildTime: number;
  built: boolean;
  builderId?: number;
}

export interface Villager {
  id: number;
  team: Team;
  pos: Vec2;
  speed: number;
  hp: number;
  maxHp: number;
  /** Melee damage. AI peons carry the current wave scalar; humans stay at baseline. */
  damage: number;
  state:
    | "idle"
    | "toNode"
    | "gathering"
    | "toKeep"
    | "home"
    | "defend"
    | "toGarrison"
    | "garrisoned"
    | "toBarricade"
    | "buildingBarricade"
    | "toRepair"
    | "repairing"
    | "moving"
    | "patrolling";
  targetNodeId?: string;
  targetEnemyId?: number;
  targetBarricadeId?: number;
  targetRepairBuildingId?: number;
  targetRepairBarricadeId?: number;
  targetRepairKeep?: boolean;
  moveTarget?: Vec2;
  patrolA?: Vec2;
  patrolB?: Vec2;
  patrolToB?: boolean;
  /** Leash origin while a patrol fight pulls the peon off the route. */
  engageFrom?: Vec2;
  forcedAttack?: boolean;
  timer: number;
  carryingGold: number;
  carryingWood: number;
  attackTimer: number;
}

export interface FloatingText {
  id: number;
  pos: Vec2;
  text: string;
  color: string;
  life: number;
  rise: number;
}

export type CombatEventKind =
  | "arrow"
  | "meleeHit"
  | "unitDeath"
  | "keepImpact"
  | "ramImpact"
  | "woodHit"
  | "woodBreak"
  | "buildComplete"
  | "waveHorn"
  | "trebuchet"
  | "sabotage";

export interface CombatEvent {
  id: number;
  kind: CombatEventKind;
  pos: Vec2;
  target?: Vec2;
  team?: Team;
  life: number;
}

export interface CommandMarker {
  id: number;
  kind: "move" | "gather" | "attack" | "patrol" | "rally" | "guard" | "repair";
  pos: Vec2;
  life: number;
}

export interface ToastItem {
  id: number;
  text: string;
  life: number;
}

export interface WaveQueueItem {
  team: Team;
  kind: UnitKind;
  lane: Lane;
  batchId?: number;
  spawnPos?: Vec2;
}

export interface WaveSpec {
  raider: number;
  soldier: number;
  brute: number;
  runner: number;
  ward: number;
}

export interface TeamStats {
  slain: number;
  goldEarned: number;
}

export interface MapDef {
  id: MapId;
  seed: number;
  name: string;
  tagline: string;
  lanes: LaneCount;
  pads: { id: string; x: number; y: number; laneCoverage: Lane[]; zone?: PadZone }[];
  nodes: {
    id: string;
    kind: ResourceKind;
    x: number;
    yourY: number;
    loads: number;
    gold: number;
    wood: number;
    gather: number;
    regen: number;
  }[];
  startTowerPad: string;
}

export interface GameState {
  phase: GamePhase;
  mapId: MapId;
  time: number;
  paused: boolean;
  speed: 1 | 2;
  soundOn: boolean;
  audioUnlocked: boolean;
  keeps: Record<Team, Keep>;
  gold: Record<Team, number>;
  wood: Record<Team, number>;
  /** Wood/gold exchange. Each keep has its own quotes. */
  market: Record<Team, MarketQuotes>;
  units: Unit[];
  buildings: Building[];
  villagers: Villager[];
  barricades: Barricade[];
  pads: Pad[];
  nodes: ResourceNode[];
  waveIndex: number;
  wavePhase: WavePhase;
  buildTimer: number;
  waveSpawnTimer: number;
  waveSpawnSide: Team;
  pendingWaveUnits: WaveQueueItem[];
  allWavesLaunched: boolean;
  wavesCleared: number;
  buildSelection: BuildingKind | null;
  selectedBuildingId: number | null;
  /** Friendly barracks selected together. Empty unless the selection is that player's barracks. */
  selectedBuildingIds: number[];
  selectedVillagerIds: number[];
  /** Selected friendly barracks units (AoE2 individual / group selection). */
  selectedUnitIds: number[];
  /** When set, DetailSheet shows peon training at the keep. */
  selectedKeepTeam: Team | null;
  hoveredPadId: string | null;
  toasts: ToastItem[];
  floatingTexts: FloatingText[];
  combatEvents: CombatEvent[];
  commandMarkers: CommandMarker[];
  stats: Record<Team, TeamStats>;
  pulseNodeUntil: number;
  firstVillagerAssigned: boolean;
  endReason: string;
  redFlash: number;
  shake: number;
  keepLevel: number;
  matchXpEarned: number;
  lastXpGain: number;
  won: boolean | null;
  /** Which side this client's build highlights belong to. Not sent in match snapshots. */
  commandTeam: Team;
  /** Living barracks-trained soldier the local player is driving in first person. */
  possessedId: number | null;
  /** Kills and keep/barricade hits scored while possessed this match. Unlocks FPS zoom-out. */
  possessVisionScore: number;
  /** Trebuchet possess wind (0–1). Unused for other bodies. */
  possessCharge: number;
  possessAimBuildingId: number | null;
  possessAimBarricadeId: number | null;
  /** Enemy trebuchet in the sights while possessing an engine. */
  possessAimUnitId: number | null;
  /** Barracks troops concentrate on this river belt when set. */
  defendLayer: Record<Team, DefendLayerId | null>;
  /** Local FFA gun-game practice or Final Duel yard; null outside those modes. */
  arena: ArenaMatchState | null;
  /** Skirmish Final Duel (propose → accept → courtyard 1v1). */
  finalDuel: FinalDuelState | null;
}

export type FinalDuelPhase = "off" | "proposed" | "active";
export type FinalDuelLife = "runner" | "ward";

export interface FinalDuelState {
  phase: FinalDuelPhase;
  proposedBy: Team | null;
  life: Record<Team, FinalDuelLife | null>;
  unitId: Record<Team, number | null>;
}

export interface ArenaRespawn {
  team: Team;
  rung: number;
  kills: number;
  at: number;
  isPlayer: boolean;
  /** Duel: which life this respawn restores. */
  duelLife?: FinalDuelLife;
}

export interface ArenaMatchState {
  playerUnitId: number | null;
  respawns: ArenaRespawn[];
  /** True while skirmish Final Duel owns the courtyard. */
  duel?: boolean;
}

export interface ArenaStandingUi {
  id: number;
  label: string;
  rung: number;
  rungLabel: string;
  kills: number;
  you: boolean;
  alive: boolean;
}

export interface QueueSlotUi {
  kind: TrainKind | KeepTrainKind | "templar";
  label: string;
  pct: number;
  /** Barracks that owns this slot when several barracks are selected. */
  buildingId?: number;
  /** Index in that barracks' queue. Omitted when a single barracks is selected. */
  queueIndex?: number;
}

export interface KeepTrainOptionUi {
  kind: KeepTrainKind;
  label: string;
  blurb: string;
  cost: number;
  woodCost: number;
}

export interface TrainOptionUi {
  kind: TrainKind;
  label: string;
  blurb: string;
  cost: number;
  woodCost: number;
  unlocked: boolean;
  lockHint: string;
}

export interface SelectedArmyUi {
  count: number;
  leadId: number;
  leadLabel: string;
  groups: { kind: UnitKind; label: string; count: number }[];
  orderSummary: string;
  allHolding: boolean;
  anyManual: boolean;
  canPossess: boolean;
}

export interface PartnerUi {
  mode: PartnerMode;
  /** Top of the partner list, such as "Upgrade keep" or "Train archer". Null when the list is empty. */
  active: string | null;
  queue: { id: number; label: string }[];
  modes: { id: PartnerMode; label: string }[];
  calls: { token: string; label: string; price: string; enabled: boolean }[];
  canRelease: boolean;
}

export interface UiSnapshot {
  phase: GamePhase;
  mapId: MapId;
  mapName: string;
  mapTagline: string;
  mapSeed: number;
  campaignLevel: number;
  scoutSalt: number;
  paused: boolean;
  speed: 1 | 2;
  soundOn: boolean;
  yourHp: number;
  foeHp: number;
  yourMaxHp: number;
  foeMaxHp: number;
  yourGold: number;
  yourWood: number;
  foeGold: number;
  foeWood: number;
  waveLabel: string;
  waveTheme: string;
  wavePhase: WavePhase;
  buildTimer: number;
  canRush: boolean;
  totalWaves: number;
  toasts: string[];
  buildSelection: BuildingKind | null;
  selectedBuildingId: number | null;
  selectedBuildingTeam: Team | null;
  selectedBuildingKind: BuildingKind | null;
  /** Living friendly barracks in the current selection. */
  selectedBarracksCount: number;
  selectedKeepTeam: Team | null;
  selectedPeonCount: number;
  selectedArmy: SelectedArmyUi | null;
  selectedRanks: { damage: number; rate: number } | null;
  selectedCanUpgradeDamage: boolean;
  selectedCanUpgradeRate: boolean;
  selectedCanRaze: boolean;
  selectedCanConsecrate: boolean;
  /** Selected house sits on a purple midfield pad (can become a church). */
  selectedIsMidHouse: boolean;
  selectedRazeRefund: number;
  selectedRazeRefundWood: number;
  selectedTrainPct: number | null;
  selectedUpgradeCost: { damage: number; rate: number };
  trainQueue: QueueSlotUi[];
  trainOptions: TrainOptionUi[];
  peonQueue: QueueSlotUi[];
  peonCount: number;
  peonCap: number;
  armyCount: number;
  armyCap: number;
  /** Field army gold+wood cost (your side). */
  armyCost: number;
  /** Field army gold+wood cost (opponent). */
  foeArmyCost: number;
  /** Peons standing idle or walking home with no job. */
  idlePeonCount: number;
  /** Friendly buildings, built barricades, and keep currently below max HP. */
  damagedStructureCount: number;
  /** Friendly peons currently walking to repair or actively repairing structures. */
  repairingPeonCount: number;
  keepGarrisoned: number;
  keepGarrisonMax: number;
  canTrainPeon: boolean;
  peonTrainCost: { gold: number; wood: number };
  /** Local team's keep has paid for the upgrade. */
  keepUpgraded: boolean;
  /** Own keep is selected and is not upgraded yet. */
  canUpgradeKeep: boolean;
  keepUpgradeCost: { gold: number; wood: number };
  /** Empty until the selected keep is upgraded. */
  keepTrainOptions: KeepTrainOptionUi[];
  keepTroopQueue: QueueSlotUi[];
  /** Selected church has been raised to a cathedral. */
  selectedIsCathedral: boolean;
  /** Own church, keep already upgraded, not yet a cathedral, and the player can pay. */
  selectedCanRaiseCathedral: boolean;
  cathedralUpgradeCost: { gold: number; wood: number };
  templarTrainCost: { gold: number; wood: number };
  templarQueue: QueueSlotUi[];
  buildCosts: Record<BuildingKind, { gold: number; wood: number }>;
  keepLevel: number;
  keepXp: number;
  keepXpNext: number;
  keepXpPct: number;
  endReason: string;
  lastXpGain: number;
  stats: {
    slain: number;
    goldEarned: number;
    waves: number;
    yourKeep: number;
    foeKeep: number;
  };
  /** Persistent Q-learning foe — climbs as it plays you. */
  foeIntellect: number;
  foeGames: number;
  foeWins: number;
  foeExplore: number;
  foeLastAction: string;
  /** Side this screen commands. Guest is `foe` while the map stays north-up. */
  localTeam: Team;
  pvp: boolean;
  /** Subscribe-only view. Gold and keeps below are absolute: Blue is south, Red is north. */
  observer: boolean;
  blueGold: number;
  blueWood: number;
  blueArmy: number;
  blueArmyCap: number;
  blueKeep: number;
  blueKeepMax: number;
  redGold: number;
  redWood: number;
  redArmy: number;
  redArmyCap: number;
  redKeep: number;
  redKeepMax: number;
  /** Persistent player win count for the keep tug badge. */
  playerWins: number;
  /** Set while a Ten Marches mission is the live match. */
  missionId: number | null;
  missionName: string;
  /** Unit name just won from this mission, or empty. Onslaughts hold the ground without a new unit. */
  freshUnlock: string;
  /** This victory was the first time the march was held. */
  freshHold: boolean;
  /** Set while the local player is in first person on a soldier. */
  possessed: PossessedUi | null;
  /** Build, train, church/market choice, or market trades under the fielded unit. */
  fieldSite: FieldSiteUi | null;
  /** Human + CPU assistant for this keep. Null for a human keep, a pure CPU keep, and observers. */
  partner: PartnerUi | null;
  /** This keep's exchange prices. */
  marketQuotes: MarketQuotes;
  /** Purple midfield house can still be raised into a market. */
  selectedCanRaiseMarket: boolean;
  /** Active bridge layer to hold, or null for stand-down. */
  defendLayer: DefendLayerId | null;
  /** Bridge belts available on this map (1–3). */
  defendLayers: { id: DefendLayerId; label: string }[];
  /** Local Arena gun-game practice. */
  arena: boolean;
  arenaRung: number;
  arenaRungMax: number;
  arenaRungLabel: string;
  arenaKills: number;
  /** Kills on current rung / kills needed to promote (or win on runner). */
  arenaProgress: number;
  arenaNeed: number;
  arenaStandings: ArenaStandingUi[];
  /** Match clock seconds. */
  matchTime: number;
  finalDuel: {
    phase: FinalDuelPhase;
    proposedBy: Team | null;
    youLife: FinalDuelLife | null;
    foeLife: FinalDuelLife | null;
    canPropose: boolean;
    canAccept: boolean;
  } | null;
}

export interface RectHit {
  kind: "keep" | "pad" | "building" | "node" | "unit" | "villager";
  id: string;
}
