/**
 * The whole game, with no graphics, clock or randomness.
 * Same config + same actions on the same ticks = the same match, on any machine.
 * Keep it that way: whole numbers only, and no Math.random, Date, sin, cos or sqrt.
 */
import { blockedCells, distances, neighbours, nextStep } from './grid';
import type { Action, Config, GameEvent, Player, Refusal, Spirit, SpiritDef, State, Tower, Troop } from './types';

export const TICKS_PER_SECOND = 60;
/** The most castles a map may have. Each player needs a colour in src/game/models.ts. */
export const MAX_PLAYERS = 4;
/** Distance units per cell. A speed in thousandths of a cell per second is then also units per tick. */
export const CELL = 60_000;
const UNITS_PER_THOUSANDTH = CELL / 1000;

/** Every player number, in order. */
export const players = (s: State): Player[] => s.bases.map((_, p) => p);
/** Still in the match: their castle stands. */
export const alive = (s: State, p: Player) => s.baseHealth[p] > 0;
export const enemies = (s: State, a: Player, b: Player) => s.teams[a] !== s.teams[b];

/** Where each castle is in the map rows: player 0 is `1`, player 1 is `2`, and so on. */
export function castleCells(rows: string[]): number[] {
  const flat = rows.join(''), cells: number[] = [];
  for (let digit = 1; flat.includes(String(digit)); digit++) cells.push(flat.indexOf(String(digit)));
  return cells;
}

/** Wisp, Mire, Wisp, Mire: so in 2 v 2 each team has one of each. */
export const defaultSpirits = (count: number): string[] => Array.from({ length: count }, (_, p) => (p % 2 ? 'mire' : 'wisp'));
/** Each player's spirit id: the config's choice, or the default. */
/** A config with each player's chosen spirit. */
export const withSpirits = (config: Config, spirits: string[]): Config => ({ ...config, spirits: [...spirits] });
export const spiritIds = (cfg: Config): string[] => cfg.spirits ?? defaultSpirits(cfg.teams.length);
export const spiritDef = (s: State, cfg: Config, p: Player): SpiritDef => cfg.content.spirits[s.spirits[p].id];

export function createMatch({ map, rules, content, teams, spirits }: Config): State {
  const height = map.rows.length, width = map.rows[0].length;
  const bases = castleCells(map.rows);
  const each = <T>(make: () => T) => bases.map(make);
  const s: State = {
    tick: 0, width, height,
    teams: [...teams],
    gold: each(() => rules.startingGold),
    baseHealth: each(() => rules.baseHealth),
    bases,
    rock: [...map.rows.join('')].map((ch) => ch === '#'),
    towers: [], troops: [],
    garrison: each(() => emptyGarrison(content)),
    departures: each(() => []),
    departTimer: each(() => 0),
    spirits: [],
    nextUid: 1, winner: null,
  };
  // Every spirit starts standing on its castle, walking. Fixed key order, so fingerprints match.
  const ids = spirits ?? defaultSpirits(teams.length);
  s.spirits = bases.map((cell, p): Spirit => ({ id: ids[p], mode: 'walk', x: (cell % width) * CELL, y: Math.floor(cell / width) * CELL, dx: 0, dy: 0, wispCell: cell }));
  for (const t of map.startingTowers) addTower(s, content, t.id, t.player, t.y * width + t.x);
  return s;
}

/** Every troop id at 0, always in the same order, so fingerprints match on every machine. */
const emptyGarrison = (content: Config['content']) => Object.fromEntries(Object.keys(content.troops).map((id) => [id, 0]));

/** How many of `troop` your castle can hold: the sum of `garrison` over your standing buildings that train it. */
export function garrisonRoom(s: State, cfg: Config, player: Player, troop: string): number {
  let room = 0;
  for (const t of s.towers) {
    const def = cfg.content.towers[t.id];
    if (t.player === player && t.demolish === 0 && def.kind === 'spawner' && def.troop === troop) room += def.garrison;
  }
  return room;
}

function addTower(s: State, content: Config['content'], id: string, player: Player, cell: number) {
  const def = content.towers[id];
  s.towers.push({ uid: s.nextUid++, id, player, cell, demolish: 0, timer: def.kind === 'shooter' ? def.fireTicks : def.spawnTicks });
}

/** Cells apart, counting a diagonal step as one: a square ring around a cell. */
const cellsApart = (s: State, a: number, b: number) =>
  Math.max(Math.abs((a % s.width) - (b % s.width)), Math.abs(Math.floor(a / s.width) - Math.floor(b / s.width)));

/** Land spreads from your castle and your standing buildings; a building being sold no longer counts. */
export function inTerritory(s: State, rules: Config['rules'], player: Player, cell: number): boolean {
  if (cellsApart(s, s.bases[player], cell) <= rules.buildRadius) return true;
  return s.towers.some((t) => t.player === player && t.demolish === 0 && cellsApart(s, t.cell, cell) <= rules.buildRadius);
}

/** Inside the ring around a standing enemy castle, where `player` may not build. */
export const nearEnemyCastle = (s: State, rules: Config['rules'], player: Player, cell: number) =>
  players(s).some((q) => alive(s, q) && enemies(s, player, q) && cellsApart(s, s.bases[q], cell) <= rules.castleNoBuildRadius);

/** Steps along the shortest route from `from` to player `q`'s castle, or -1 if there is none. `from` may be a castle. */
function stepsTo(s: State, from: number, q: Player, toCastle: number[]): number {
  if (from === s.bases[q]) return 0;
  if (toCastle[from] >= 0) return toCastle[from];
  let best = -1;
  for (const n of neighbours(s, from)) {
    const d = n === s.bases[q] ? 1 : toCastle[n] >= 0 ? toCastle[n] + 1 : -1;
    if (d >= 0 && (best < 0 || d < best)) best = d;
  }
  return best;
}

/** The standing enemy of `player` with the shortest route from `from`; ties go to the lower player number. -1 if none. */
function nearestEnemy(s: State, player: Player, from: number, toCastles: number[][]): Player {
  let best = -1, bestSteps = -1;
  for (const q of players(s)) {
    if (!alive(s, q) || !enemies(s, player, q)) continue;
    const steps = stepsTo(s, from, q, toCastles[q]);
    if (steps >= 0 && (bestSteps < 0 || steps < bestSteps)) { best = q; bestSteps = steps; }
  }
  return best;
}

/** Is `cell` within reach of where `player`'s spirit stands? Squared distances, like tower range. */
export function inReach(s: State, cfg: Config, player: Player, cell: number): boolean {
  const sp = s.spirits[player], reach = spiritDef(s, cfg, player).reach * UNITS_PER_THOUSANDTH;
  const dx = (cell % s.width) * CELL - sp.x, dy = Math.floor(cell / s.width) * CELL - sp.y;
  return dx * dx + dy * dy <= reach * reach;
}

/**
 * What a walking spirit can act on from where it stands, nearest first (the castle first on a tie).
 * Empty in cursor mode. Map machinery (sluices, calling stones) joins this list as a new `kind`.
 */
export type Reachable = { kind: 'castle'; cell: number } | { kind: 'building'; cell: number };
export function withinReach(s: State, cfg: Config, player: Player): Reachable[] {
  const sp = s.spirits[player];
  if (sp.mode !== 'walk' || !alive(s, player)) return [];
  const found: (Reachable & { d: number })[] = [];
  const distance = (cell: number) => ((cell % s.width) * CELL - sp.x) ** 2 + (Math.floor(cell / s.width) * CELL - sp.y) ** 2;
  if (inReach(s, cfg, player, s.bases[player])) found.push({ kind: 'castle', cell: s.bases[player], d: distance(s.bases[player]) });
  for (const t of s.towers) {
    if (t.player === player && t.demolish === 0 && inReach(s, cfg, player, t.cell)) found.push({ kind: 'building', cell: t.cell, d: distance(t.cell) });
  }
  // A stable sort, and the castle went in first, so ties keep it in front.
  found.sort((a, b) => a.d - b.d);
  return found.map(({ kind, cell }) => ({ kind, cell }));
}

/** Distances to every castle, for one board layout. */
const castleDistances = (s: State, blocked: boolean[]) => s.bases.map((base) => distances(s, base, blocked));

/** Why a build would be refused, or null if it is allowed. Changes nothing. */
export function checkBuild(s: State, cfg: Config, player: Player, id: string, x: number, y: number): Refusal | null {
  const def = cfg.content.towers[id];
  if (s.winner !== null) return 'game-over';
  if (!alive(s, player)) return 'knocked-out';
  if (!def) return 'unknown-tower';
  if (!spiritDef(s, cfg, player).kit.includes(id)) return 'not-in-kit';
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= s.width || y >= s.height) return 'outside';
  const cell = y * s.width + x;
  if (!inTerritory(s, cfg.rules, player, cell)) return 'not-your-land';
  if (nearEnemyCastle(s, cfg.rules, player, cell)) return 'near-enemy-castle';
  const blocked = blockedCells(s);
  if (blocked[cell]) return 'occupied';
  // Troops in the way back off (see moveTroops), unless one has just stepped out of its castle and has nowhere to go.
  if (s.troops.some((t) => t.to === cell && blocked[t.from])) return 'occupied';
  if (s.gold[player] < def.cost) return 'no-gold';

  // Nobody may be walled in: every standing castle needs a route to every standing enemy castle,
  // and every troop needs one to its target.
  blocked[cell] = true;
  const toCastles = castleDistances(s, blocked);
  const reaches = (from: number, q: Player) => nextStep(s, from, s.bases[q], toCastles[q]) !== null;
  for (const p of players(s)) {
    for (const q of players(s)) {
      if (p < q && alive(s, p) && alive(s, q) && enemies(s, p, q) && !reaches(s.bases[p], q)) return 'blocks-route';
    }
  }
  // A troop walking into the new building turns back to where it came from, so its route starts there.
  if (s.troops.some((t) => alive(s, t.target) && !reaches(t.to === cell ? t.from : t.to, t.target))) return 'blocks-route';
  return null;
}

function apply(s: State, cfg: Config, a: Action, events: GameEvent[]) {
  const refuse = (reason: Refusal) => events.push({ type: 'refused', action: a, reason });
  if (!(a.player in s.bases)) return refuse('knocked-out');
  const spirit = s.spirits[a.player];
  if (a.type === 'build') {
    const reason = checkBuild(s, cfg, a.player, a.tower, a.x, a.y);
    if (reason) return refuse(reason);
    // Only the wisp builds. The build says where, so the wisp's every move need not be sent.
    if (spirit.mode !== 'cursor') return refuse('needs-cursor');
    s.gold[a.player] -= cfg.content.towers[a.tower].cost;
    const cell = a.y * s.width + a.x;
    addTower(s, cfg.content, a.tower, a.player, cell);
    spirit.wispCell = cell;
    return;
  }
  if (s.winner !== null) return refuse('game-over');
  if (!alive(s, a.player)) return refuse('knocked-out');
  if (a.type === 'spirit-mode') {
    if (a.mode !== 'walk' && a.mode !== 'cursor') return refuse('bad-move');
    spirit.mode = a.mode;
    // The body rests while the wisp flies, so it doesn't drift off.
    spirit.dx = 0;
    spirit.dy = 0;
    return;
  }
  if (a.type === 'spirit-move') {
    if (![-1, 0, 1].includes(a.x) || ![-1, 0, 1].includes(a.y)) return refuse('bad-move');
    if (spirit.mode !== 'walk') return refuse('needs-walk');
    spirit.dx = a.x;
    spirit.dy = a.y;
    return;
  }
  // Launching and selling happen where the spirit stands.
  if (spirit.mode !== 'walk') return refuse('needs-walk');
  if (a.type === 'launch') {
    if (!inReach(s, cfg, a.player, s.bases[a.player])) return refuse('out-of-reach');
    if (!(a.target in s.bases) || !alive(s, a.target) || !enemies(s, a.player, a.target)) return refuse('bad-target');
    const garrison = s.garrison[a.player];
    let count = 0;
    // They leave in content/troops.json order.
    for (const id of Object.keys(garrison)) {
      for (let i = 0; i < garrison[id]; i++) s.departures[a.player].push({ id, target: a.target });
      count += garrison[id];
      garrison[id] = 0;
    }
    if (!count) return refuse('empty-garrison');
    if (s.departTimer[a.player] === 0) s.departTimer[a.player] = 1;
    events.push({ type: 'launched', player: a.player, target: a.target, count });
  } else {
    const tower = s.towers.find((t) => t.cell === a.y * s.width + a.x && t.player === a.player && t.demolish === 0);
    if (!tower) return refuse('nothing-to-sell');
    if (!inReach(s, cfg, a.player, tower.cell)) return refuse('out-of-reach');
    tower.demolish = cfg.rules.demolishTicks;
  }
}

/** A troop's full health, after its spirit's passive. Whole numbers, rounded down. */
export const troopHealth = (s: State, cfg: Config, p: Player, id: string) =>
  Math.max(1, Math.floor((cfg.content.troops[id].health * (spiritDef(s, cfg, p).troopHealthPercent ?? 100)) / 100));
/** A troop's speed, after its spirit's passive. */
const troopSpeed = (s: State, cfg: Config, p: Player, id: string) =>
  Math.floor((cfg.content.troops[id].speed * (spiritDef(s, cfg, p).troopSpeedPercent ?? 100)) / 100);

/** Launched troops leave the castle in single file, one every `launchGapTicks`. */
function marchOut(s: State, cfg: Config, toCastles: number[][]) {
  for (const p of players(s)) {
    const queue = s.departures[p];
    if (!queue.length || --s.departTimer[p] > 0) continue;
    const home = s.bases[p];
    // If their target fell while they waited, they go for the nearest enemy instead.
    if (!alive(s, queue[0].target)) queue[0].target = nearestEnemy(s, p, home, toCastles);
    const { id, target } = queue[0];
    const next = target < 0 ? null : nextStep(s, home, s.bases[target], toCastles[target]);
    // Building never seals a castle in, so there is always a way out; wait a tick just in case.
    if (next === null) { s.departTimer[p] = 1; continue; }
    queue.shift();
    s.troops.push({ uid: s.nextUid++, id, player: p, target, hp: troopHealth(s, cfg, p, id), from: home, to: next, progress: 0 });
    s.departTimer[p] = queue.length ? cfg.rules.launchGapTicks : 0;
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

function moveTroops(s: State, cfg: Config, blocked: boolean[], toCastles: number[][], events: GameEvent[]) {
  const arrived = new Set<number>();
  for (const t of s.troops) {
    // Their target fell: march on the nearest enemy still standing.
    if (!alive(s, t.target)) {
      const target = nearestEnemy(s, t.player, t.to, toCastles);
      if (target < 0) continue;
      t.target = target;
    }
    const goal = s.bases[t.target];
    // A wall appeared ahead: turn round on the spot.
    if (t.to !== goal && blocked[t.to] && !blocked[t.from]) {
      [t.from, t.to] = [t.to, t.from];
      t.progress = CELL - t.progress;
    }
    t.progress += troopSpeed(s, cfg, t.player, t.id);
    while (t.progress >= CELL) {
      if (t.to === goal) {
        s.baseHealth[t.target] = Math.max(0, s.baseHealth[t.target] - cfg.content.troops[t.id].damage);
        events.push({ type: 'base-hit', player: t.target });
        arrived.add(t.uid);
        break;
      }
      const next = nextStep(s, t.to, goal, toCastles[t.target]);
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
    // Train one troop into the castle's garrison. A full garrison waits a whole cycle before trying again.
    tower.timer = def.spawnTicks;
    if (s.garrison[tower.player][def.troop] >= garrisonRoom(s, cfg, tower.player, def.troop)) return;
    s.garrison[tower.player][def.troop]++;
    events.push({ type: 'trained', player: tower.player, troop: def.troop });
    return;
  }
  const tx = (tower.cell % s.width) * CELL, ty = Math.floor(tower.cell / s.width) * CELL;
  const range = def.range * UNITS_PER_THOUSANDTH;
  let target: Troop | null = null, best = range * range + 1;
  for (const t of s.troops) {
    if (!enemies(s, t.player, tower.player) || t.hp <= 0) continue;
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
    s.gold[tower.player] += cfg.content.troops[target.id].bounty;
    events.push({ type: 'death', x: p.x, y: p.y, player: target.player });
  }
}

/** Walking spirits move by their held direction. They float over rock and buildings and never block a route. */
function moveSpirits(s: State, cfg: Config) {
  const maxX = (s.width - 1) * CELL, maxY = (s.height - 1) * CELL;
  for (const p of players(s)) {
    const sp = s.spirits[p];
    if (sp.mode !== 'walk' || (!sp.dx && !sp.dy)) continue;
    let speed = spiritDef(s, cfg, p).walkSpeed;
    // No square roots in the core: 707/1000 is close enough to one over root two for a diagonal.
    if (sp.dx && sp.dy) speed = Math.floor((speed * 707) / 1000);
    sp.x = Math.min(maxX, Math.max(0, sp.x + sp.dx * speed));
    sp.y = Math.min(maxY, Math.max(0, sp.y + sp.dy * speed));
  }
}

/** A fallen player's troops disband and their buildings become ruins: still walls, but they do nothing. */
function knockOut(s: State, p: Player, events: GameEvent[]) {
  s.troops = s.troops.filter((t) => t.player !== p);
  s.departures[p] = [];
  s.departTimer[p] = 0;
  for (const id of Object.keys(s.garrison[p])) s.garrison[p][id] = 0;
  s.spirits[p].dx = 0;
  s.spirits[p].dy = 0;
  events.push({ type: 'knocked-out', player: p });
}

/** Advance one tick. Mutates `s` and returns what happened, for drawing and sound. */
export function step(s: State, cfg: Config, actions: Action[] = []): GameEvent[] {
  const events: GameEvent[] = [];
  for (const a of actions) apply(s, cfg, a, events);
  if (s.winner !== null) return events;
  s.tick++;
  const standing = players(s).filter((p) => alive(s, p));

  if (s.tick % cfg.rules.incomeTicks === 0) for (const p of standing) s.gold[p] += cfg.rules.goldPerIncome;

  const sold = new Set<number>();
  for (const tower of s.towers) {
    if (tower.demolish > 0) {
      if (--tower.demolish === 0) {
        sold.add(tower.uid);
        s.gold[tower.player] += Math.floor((cfg.content.towers[tower.id].cost * cfg.rules.refundPercent) / 100);
      }
    } else if (alive(s, tower.player)) {
      runTower(s, cfg, tower, events);
      s.troops = s.troops.filter((t) => t.hp > 0);
    }
  }
  s.towers = s.towers.filter((t) => !sold.has(t.uid));

  moveSpirits(s, cfg);
  const blocked = blockedCells(s);
  const toCastles = castleDistances(s, blocked);
  marchOut(s, cfg, toCastles);
  moveTroops(s, cfg, blocked, toCastles, events);

  for (const p of standing) if (!alive(s, p)) knockOut(s, p, events);
  const teamsLeft = new Set(players(s).filter((p) => alive(s, p)).map((p) => s.teams[p]));
  if (teamsLeft.size <= 1) s.winner = teamsLeft.size === 1 ? [...teamsLeft][0] : 'draw';
  return events;
}

/** Is this cell next to another? Used by tests and tools. */
export const adjacent = (s: State, a: number, b: number) => neighbours(s, a).includes(b);
