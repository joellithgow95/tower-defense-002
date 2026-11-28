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
/**
 * A spirit of the Lyth. Each player is one; the creatures and folk who answer it are its towers and troops.
 * See docs/gameplay/spirits.md.
 */
export interface SpiritDef {
  label: string;
  about: string;
  /** thousandths of a cell per second, while walking */
  walkSpeed: number;
  /** thousandths of a cell: how far from where it stands the spirit can act */
  reach: number;
  /** The tower ids it may build. Its troops are whatever those spawners train. */
  kit: string[];
  /** Its one passive, in words players see. */
  passive: string;
  /** Percent of normal speed for its troops; 100 if left out. */
  troopSpeedPercent?: number;
  /** Percent of normal health for its troops; 100 if left out. */
  troopHealthPercent?: number;
}
export interface MapDef { name: string; startingTowers: { player: Player; id: string; x: number; y: number }[]; rows: string[] }
export interface Content { troops: Record<string, TroopDef>; towers: Record<string, TowerDef>; spirits: Record<string, SpiritDef> }
/** `teams[p]` is player p's team, one entry per castle on the map. [0, 1, 2] is a free-for-all; [0, 0, 1] is two against one. */
/** `spirits[p]` is player p's spirit id; left out, players alternate Wisp, Mire, Wisp, Mire. */
export interface Config { map: MapDef; rules: Rules; content: Content; teams: number[]; spirits?: string[] }

export type Action =
  | { type: 'build'; player: Player; tower: string; x: number; y: number }
  | { type: 'sell'; player: Player; x: number; y: number }
  /** Send your whole garrison to attack `target`'s castle. */
  | { type: 'launch'; player: Player; target: Player }
  /** Hold a direction while walking: x and y are -1, 0 or 1. Sent when it changes, not every tick. */
  | { type: 'spirit-move'; player: Player; x: number; y: number }
  /** Walk on the board, or fly as a wisp to build. */
  | { type: 'spirit-mode'; player: Player; mode: SpiritMode };

export type SpiritMode = 'walk' | 'cursor';
/**
 * A player's spirit. `x`, `y` is where its body stands, in distance units from the top-left cell centre.
 * In cursor mode the body rests there and the wisp flies; `wispCell` is the last cell the wisp built on.
 */
export interface Spirit { id: string; mode: SpiritMode; x: number; y: number; dx: number; dy: number; wispCell: number }

export interface Tower { uid: number; id: string; player: Player; cell: number; timer: number; /** 0 = standing */ demolish: number }
/** A troop is always on the edge from one cell to a neighbour; progress runs 0..CELL. */
export interface Troop { uid: number; id: string; player: Player; /** whose castle it is marching on */ target: Player; hp: number; from: number; to: number; progress: number }
/** A launched troop still waiting its turn to march out of the castle. */
export interface Departure { id: string; target: Player }

export type Refusal =
  | 'game-over' | 'knocked-out' | 'unknown-tower' | 'outside' | 'not-your-land' | 'near-enemy-castle' | 'occupied' | 'no-gold'
  | 'blocks-route' | 'nothing-to-sell' | 'empty-garrison' | 'bad-target'
  | 'not-in-kit' | 'needs-cursor' | 'needs-walk' | 'out-of-reach' | 'bad-move';

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
  spirits: Spirit[];
  nextUid: number;
  /** The winning team, once only one team has a castle standing. */
  winner: number | 'draw' | null;
}
