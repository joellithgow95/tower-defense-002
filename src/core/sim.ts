/**
 * The whole game, with no graphics, clock or randomness.
 * Same config + same actions on the same ticks = the same match, on any machine.
 * Keep it that way: whole numbers only, and no Math.random, Date, sin, cos or sqrt.
 */
import { blockedCells, distances, neighbours, nextStep } from './grid';
import type { Action, Config, GameEvent, Refusal, State, Team, Tower, Troop } from './types';

export const TICKS_PER_SECOND = 60;
/** Distance units per cell. A speed in thousandths of a cell per second is then also units per tick. */
export const CELL = 60_000;
const UNITS_PER_THOUSANDTH = CELL / 1000;

export const other = (team: Team): Team => (team === 0 ? 1 : 0);

export function createMatch({ map, rules, content }: Config): State {
  const height = map.rows.length, width = map.rows[0].length;
  const flat = map.rows.join('');
  const s: State = {
    tick: 0, width, height,
    gold: [rules.startingGold, rules.startingGold],
    baseHealth: [rules.baseHealth, rules.baseHealth],
    bases: [flat.indexOf('1'), flat.indexOf('2')],
    rock: [...flat].map((ch) => ch === '#'),
    towers: [], troops: [], nextUid: 1, winner: null,
  };
  for (const t of map.startingTowers) addTower(s, content, t.id, t.team, t.y * width + t.x);
  return s;
}

function addTower(s: State, content: Config['content'], id: string, team: Team, cell: number) {
  const def = content.towers[id];
  s.towers.push({ uid: s.nextUid++, id, team, cell, demolish: 0, timer: def.kind === 'shooter' ? def.fireTicks : def.spawnTicks });
}

/** Cells apart, counting a diagonal step as one: a square ring around a cell. */
const cellsApart = (s: State, a: number, b: number) =>
  Math.max(Math.abs((a % s.width) - (b % s.width)), Math.abs(Math.floor(a / s.width) - Math.floor(b / s.width)));

/** Land spreads from your castle and your standing buildings; a building being sold no longer counts. */
export function inTerritory(s: State, rules: Config['rules'], team: Team, cell: number): boolean {
  if (cellsApart(s, s.bases[team], cell) <= rules.buildRadius) return true;
  return s.towers.some((t) => t.team === team && t.demolish === 0 && cellsApart(s, t.cell, cell) <= rules.buildRadius);
}

/** Inside the ring around `team`'s enemy's castle where nobody may build. */
export const nearEnemyCastle = (s: State, rules: Config['rules'], team: Team, cell: number) =>
  cellsApart(s, s.bases[other(team)], cell) <= rules.castleNoBuildRadius;

/** Why a build would be refused, or null if it is allowed. Changes nothing. */
export function checkBuild(s: State, cfg: Config, team: Team, id: string, x: number, y: number): Refusal | null {
  const def = cfg.content.towers[id];
  if (s.winner !== null) return 'game-over';
  if (!def) return 'unknown-tower';
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= s.width || y >= s.height) return 'outside';
  const cell = y * s.width + x;
  if (!inTerritory(s, cfg.rules, team, cell)) return 'not-your-land';
  if (nearEnemyCastle(s, cfg.rules, team, cell)) return 'near-enemy-castle';
  const blocked = blockedCells(s);
  if (blocked[cell] || s.troops.some((t) => t.from === cell || t.to === cell)) return 'occupied';
  if (s.gold[team] < def.cost) return 'no-gold';

  // Nobody may be walled in: both bases, every working spawner and every troop need a route.
  blocked[cell] = true;
  const toBase = [distances(s, s.bases[0], blocked), distances(s, s.bases[1], blocked)];
  const reaches = (from: number, side: Team) => nextStep(s, from, s.bases[side], toBase[side]) !== null;
  if (!reaches(s.bases[0], 1)) return 'blocks-route';
  const spawners = s.towers.filter((t) => t.demolish === 0 && cfg.content.towers[t.id].kind === 'spawner').map((t) => ({ cell: t.cell, team: t.team }));
  if (def.kind === 'spawner') spawners.push({ cell, team });
  if (spawners.some((t) => !reaches(t.cell, other(t.team)))) return 'blocks-route';
  if (s.troops.some((t) => !reaches(t.to, other(t.team)))) return 'blocks-route';
  return null;
}

function apply(s: State, cfg: Config, a: Action, events: GameEvent[]) {
  const refuse = (reason: Refusal) => events.push({ type: 'refused', action: a, reason });
  if (a.type === 'build') {
    const reason = checkBuild(s, cfg, a.team, a.tower, a.x, a.y);
    if (reason) return refuse(reason);
    s.gold[a.team] -= cfg.content.towers[a.tower].cost;
    addTower(s, cfg.content, a.tower, a.team, a.y * s.width + a.x);
  } else {
    const tower = s.towers.find((t) => t.cell === a.y * s.width + a.x && t.team === a.team && t.demolish === 0);
    if (!tower || s.winner !== null) return refuse('nothing-to-sell');
    tower.demolish = cfg.rules.demolishTicks;
  }
}

/** Where a troop is, in distance units, measured from the board's top-left cell centre. */
export function troopPosition(s: State, t: Troop): { x: number; y: number } {
  const fx = t.from % s.width, fy = Math.floor(t.from / s.width);
  return {
    x: fx * CELL + (t.to % s.width - fx) * t.progress,
    y: fy * CELL + (Math.floor(t.to / s.width) - fy) * t.progress,
  };
}

function moveTroops(s: State, cfg: Config, events: GameEvent[]) {
  const blocked = blockedCells(s);
  const toBase = [distances(s, s.bases[0], blocked), distances(s, s.bases[1], blocked)];
  const arrived = new Set<number>();
  for (const t of s.troops) {
    const side = other(t.team), goal = s.bases[side];
    // A wall appeared ahead: turn round on the spot.
    if (t.to !== goal && blocked[t.to] && !blocked[t.from]) {
      [t.from, t.to] = [t.to, t.from];
      t.progress = CELL - t.progress;
    }
    t.progress += cfg.content.troops[t.id].speed;
    while (t.progress >= CELL) {
      if (t.to === goal) {
        s.baseHealth[side] = Math.max(0, s.baseHealth[side] - cfg.content.troops[t.id].damage);
        events.push({ type: 'base-hit', team: side });
        arrived.add(t.uid);
        break;
      }
      const next = nextStep(s, t.to, goal, toBase[side]);
      if (next === null) { t.progress = CELL; break; }
      t.from = t.to;
      t.to = next;
      t.progress -= CELL;
    }
  }
  s.troops = s.troops.filter((t) => !arrived.has(t.uid));
}

function runTower(s: State, cfg: Config, tower: Tower, events: GameEvent[]) {
  const def = cfg.content.towers[tower.id];
  if (--tower.timer > 0) return;
  if (def.kind === 'spawner') {
    tower.timer = def.spawnTicks;
    const goal = s.bases[other(tower.team)];
    const next = nextStep(s, tower.cell, goal, distances(s, goal, blockedCells(s)));
    if (next !== null) {
      s.troops.push({ uid: s.nextUid++, id: def.troop, team: tower.team, hp: cfg.content.troops[def.troop].health, from: tower.cell, to: next, progress: 0 });
    }
    return;
  }
  const tx = (tower.cell % s.width) * CELL, ty = Math.floor(tower.cell / s.width) * CELL;
  const range = def.range * UNITS_PER_THOUSANDTH;
  let target: Troop | null = null, best = range * range + 1;
  for (const t of s.troops) {
    if (t.team === tower.team || t.hp <= 0) continue;
    const p = troopPosition(s, t);
    const d = (p.x - tx) ** 2 + (p.y - ty) ** 2;
    if (d < best) { best = d; target = t; }
  }
  if (!target) { tower.timer = 1; return; }
  tower.timer = def.fireTicks;
  // Hits land at once; the arrow you see is only for show.
  target.hp -= def.damage;
  const p = troopPosition(s, target);
  events.push({ type: 'shot', from: tower.cell, target: target.uid, x: p.x, y: p.y });
  if (target.hp <= 0) {
    s.gold[tower.team] += cfg.content.troops[target.id].bounty;
    events.push({ type: 'death', x: p.x, y: p.y, team: target.team });
  }
}

/** Advance one tick. Mutates `s` and returns what happened, for drawing and sound. */
export function step(s: State, cfg: Config, actions: Action[] = []): GameEvent[] {
  const events: GameEvent[] = [];
  for (const a of actions) apply(s, cfg, a, events);
  if (s.winner !== null) return events;
  s.tick++;

  if (s.tick % cfg.rules.incomeTicks === 0) {
    s.gold[0] += cfg.rules.goldPerIncome;
    s.gold[1] += cfg.rules.goldPerIncome;
  }

  const sold = new Set<number>();
  for (const tower of s.towers) {
    if (tower.demolish > 0) {
      if (--tower.demolish === 0) {
        sold.add(tower.uid);
        s.gold[tower.team] += Math.floor((cfg.content.towers[tower.id].cost * cfg.rules.refundPercent) / 100);
      }
    } else {
      runTower(s, cfg, tower, events);
      s.troops = s.troops.filter((t) => t.hp > 0);
    }
  }
  s.towers = s.towers.filter((t) => !sold.has(t.uid));

  moveTroops(s, cfg, events);

  const [a, b] = s.baseHealth;
  if (a === 0 || b === 0) s.winner = a === b ? 'draw' : a === 0 ? 1 : 0;
  return events;
}

/** Is this cell next to another? Used by tests and tools. */
export const adjacent = (s: State, a: number, b: number) => neighbours(s, a).includes(b);
