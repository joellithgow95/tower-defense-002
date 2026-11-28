/**
 * A player is a number from 0: player 0's castle is `1` in the map file, player 1's is `2`, and so on.
 * A team is a number too. Players on the same team are allies: they never shoot each other's troops.
 */
export type Player = number;

export interface TroopDef { label: string; health: number; /** thousandths of a cell per second */ speed: number; damage: number; bounty: number }
export type TowerDef =
  | { label: string; kind: 'shooter'; cost: number; /** thousandths of a cell */ range: number; fireTicks: number; damage: number }
  /** A spawner trains its troop into your castle's garrison. Each one makes room for `garrison` more of that troop. */
  | { label: string; kind: 'spawner'; cost: number; troop: string; spawnTicks: number; garrison: number };
export interface Rules {
  startingGold: number; goldPerIncome: number; incomeTicks: number; baseHealth: number; refundPercent: number; demolishTicks: number;
  /** You may build this many cells (diagonals count) from your castle or one of your standing buildings. */
  buildRadius: number;
  /** Nobody may build this close to an enemy castle. 0 turns it off. */
  castleNoBuildRadius: number;
  /** When you launch, one troop marches out of your castle every this many ticks. */
  launchGapTicks: number;
}
export interface MapDef { name: string; startingTowers: { player: Player; id: string; x: number; y: number }[]; rows: string[] }
export interface Content { troops: Record<string, TroopDef>; towers: Record<string, TowerDef> }
/** `teams[p]` is player p's team, one entry per castle on the map. [0, 1, 2] is a free-for-all; [0, 0, 1] is two against one. */
export interface Config { map: MapDef; rules: Rules; content: Content; teams: number[] }

export type Action =
  | { type: 'build'; player: Player; tower: string; x: number; y: number }
  | { type: 'sell'; player: Player; x: number; y: number }
  /** Send your whole garrison to attack `target`'s castle. */
  | { type: 'launch'; player: Player; target: Player };

export interface Tower { uid: number; id: string; player: Player; cell: number; timer: number; /** 0 = standing */ demolish: number }
/** A troop is always on the edge from one cell to a neighbour; progress runs 0..CELL. */
export interface Troop { uid: number; id: string; player: Player; /** whose castle it is marching on */ target: Player; hp: number; from: number; to: number; progress: number }
/** A launched troop still waiting its turn to march out of the castle. */
export interface Departure { id: string; target: Player }

export type Refusal =
  | 'game-over' | 'knocked-out' | 'unknown-tower' | 'outside' | 'not-your-land' | 'near-enemy-castle' | 'occupied' | 'no-gold'
  | 'blocks-route' | 'nothing-to-sell' | 'empty-garrison' | 'bad-target';

export type GameEvent =
  | { type: 'shot'; from: number; target: number; x: number; y: number }
  | { type: 'death'; x: number; y: number; player: Player }
  | { type: 'base-hit'; player: Player }
  | { type: 'trained'; player: Player; troop: string }
  | { type: 'launched'; player: Player; target: Player; count: number }
  | { type: 'knocked-out'; player: Player }
  | { type: 'refused'; action: Action; reason: Refusal };

/** Everything per player is an array indexed by player number. */
export interface State {
  tick: number;
  width: number;
  height: number;
  teams: number[];
  gold: number[];
  /** A castle at 0 has fallen: that player is out, and their buildings are ruins. */
  baseHealth: number[];
  bases: number[];
  rock: boolean[];
  towers: Tower[];
  troops: Troop[];
  /** Troops waiting at each castle, by troop id, in content order. */
  garrison: Record<string, number>[];
  /** Launched troops queued to leave each castle, and ticks until the next one goes. */
  departures: Departure[][];
  departTimer: number[];
  nextUid: number;
  /** The winning team, once only one team has a castle standing. */
  winner: number | 'draw' | null;
}
