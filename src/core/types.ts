export type Team = 0 | 1;

export interface TroopDef { label: string; health: number; /** thousandths of a cell per second */ speed: number; damage: number; bounty: number }
export type TowerDef =
  | { label: string; kind: 'shooter'; cost: number; /** thousandths of a cell */ range: number; fireTicks: number; damage: number }
  | { label: string; kind: 'spawner'; cost: number; troop: string; spawnTicks: number };
export interface Rules {
  startingGold: number; goldPerIncome: number; incomeTicks: number; baseHealth: number; refundPercent: number; demolishTicks: number;
  /** You may build this many cells (diagonals count) from your castle or one of your standing buildings. */
  buildRadius: number;
  /** Nobody may build this close to the enemy castle. 0 turns it off. */
  castleNoBuildRadius: number;
}
export interface MapDef { name: string; startingTowers: { team: Team; id: string; x: number; y: number }[]; rows: string[] }
export interface Content { troops: Record<string, TroopDef>; towers: Record<string, TowerDef> }
export interface Config { map: MapDef; rules: Rules; content: Content }

export type Action =
  | { type: 'build'; team: Team; tower: string; x: number; y: number }
  | { type: 'sell'; team: Team; x: number; y: number };

export interface Tower { uid: number; id: string; team: Team; cell: number; timer: number; /** 0 = standing */ demolish: number }
/** A troop is always on the edge from one cell to a neighbour; progress runs 0..CELL. */
export interface Troop { uid: number; id: string; team: Team; hp: number; from: number; to: number; progress: number }

export type Refusal = 'game-over' | 'unknown-tower' | 'outside' | 'not-your-land' | 'near-enemy-castle' | 'occupied' | 'no-gold' | 'blocks-route' | 'nothing-to-sell';

export type GameEvent =
  | { type: 'shot'; from: number; target: number; x: number; y: number }
  | { type: 'death'; x: number; y: number; team: Team }
  | { type: 'base-hit'; team: Team }
  | { type: 'refused'; action: Action; reason: Refusal };

export interface State {
  tick: number;
  width: number;
  height: number;
  gold: [number, number];
  baseHealth: [number, number];
  bases: [number, number];
  rock: boolean[];
  towers: Tower[];
  troops: Troop[];
  nextUid: number;
  winner: Team | 'draw' | null;
}
