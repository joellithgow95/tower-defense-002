import { describe, expect, it } from 'vitest';
import { createBot } from '../src/core/bot';
import { defaultConfig as cfg, modes } from '../src/core/config';
import { Match, fingerprint, runReplay } from '../src/core/match';
import { blockedCells } from '../src/core/grid';
import { CELL, checkBuild, createMatch, step, troopHealth, withSpirits, withinReach } from '../src/core/sim';
import type { Action } from '../src/core/types';
import { problems } from '../src/core/validate';

// Rocky Pass: player 0 (Wisp by default) has its castle at x 0, y 5; player 1 (Mire) at x 21, y 6.
const quiet = { ...cfg, map: { ...cfg.map, startingTowers: [] } };
const rich = { ...quiet, rules: { ...quiet.rules, startingGold: 1000 } };
const wisp = cfg.content.spirits.wisp, mire = cfg.content.spirits.mire;
const fly = (player = 0): Action => ({ type: 'spirit-mode', player, mode: 'cursor' });
const walk = (player = 0): Action => ({ type: 'spirit-mode', player, mode: 'walk' });
const move = (x: number, y: number, player = 0): Action => ({ type: 'spirit-move', player, x, y });
const reason = (events: ReturnType<typeof step>) => events.find((e) => e.type === 'refused')?.reason;

describe('spirits as content', () => {
  it('has two spirits with different kits', () => {
    expect(Object.keys(cfg.content.spirits)).toEqual(['wisp', 'mire']);
    expect(wisp.kit).not.toEqual(mire.kit);
  });
  it('explains a kit that names a missing tower', () => {
    const bad = structuredClone(cfg);
    bad.content.spirits.wisp.kit = ['archer', 'catapult'];
    expect(problems(bad)[0]).toContain('its kit lists "catapult", but there is no tower called that');
  });
  it('explains an unknown spirit choice', () => {
    expect(problems(withSpirits(cfg, ['wisp', 'heron'])).join(' ')).toContain('There is no spirit called "heron"');
    expect(problems(withSpirits(cfg, ['wisp'])).join(' ')).toContain('give each player one');
  });
  it('alternates Wisp and Mire unless the players choose', () => {
    expect(createMatch(modes.twoVsTwo.config).spirits.map((sp) => sp.id)).toEqual(['wisp', 'mire', 'wisp', 'mire']);
    expect(createMatch(withSpirits(cfg, ['mire', 'mire'])).spirits.map((sp) => sp.id)).toEqual(['mire', 'mire']);
  });
});

describe('walking', () => {
  it('starts walking on its own castle', () => {
    const s = createMatch(quiet);
    expect(s.spirits[0]).toMatchObject({ id: 'wisp', mode: 'walk', x: 0, y: 5 * CELL, dx: 0, dy: 0 });
  });
  it('keeps walking the held direction until told to stop, at its own speed', () => {
    const s = createMatch(quiet);
    step(s, quiet, [move(1, 0), move(-1, 0, 1)]);
    for (let i = 0; i < 9; i++) step(s, quiet);
    expect(s.spirits[0].x).toBe(10 * wisp.walkSpeed);
    expect(s.spirits[1].x).toBe(21 * CELL - 10 * mire.walkSpeed);
    step(s, quiet, [move(0, 0)]);
    const stopped = s.spirits[0].x;
    step(s, quiet);
    expect(s.spirits[0].x).toBe(stopped);
  });
  it('walks diagonals at about the same speed, in whole numbers', () => {
    const s = createMatch(quiet);
    step(s, quiet, [move(1, -1)]);
    expect(s.spirits[0].x).toBe(Math.floor((wisp.walkSpeed * 707) / 1000));
    expect(Number.isInteger(s.spirits[0].y)).toBe(true);
  });
  it('stays on the board', () => {
    const s = createMatch(quiet);
    step(s, quiet, [move(-1, 0)]);
    for (let i = 0; i < 30; i++) step(s, quiet);
    expect(s.spirits[0].x).toBe(0);
  });
  it('floats over buildings and never blocks a route or a build', () => {
    const s = createMatch(rich);
    const before = blockedCells(s);
    s.spirits[0].x = 2 * CELL;
    expect(blockedCells(s)).toEqual(before);
    expect(checkBuild(s, rich, 0, 'archer', 2, 5)).toBeNull();
  });
  it('rests in cursor mode, and refuses a walk while flying', () => {
    const s = createMatch(quiet);
    step(s, quiet, [move(1, 0)]);
    step(s, quiet, [fly()]);
    const x = s.spirits[0].x;
    step(s, quiet);
    expect(s.spirits[0]).toMatchObject({ x, dx: 0, dy: 0, mode: 'cursor' });
    expect(reason(step(s, quiet, [move(1, 0)]))).toBe('needs-walk');
  });
  it('refuses a direction that is not -1, 0 or 1', () => {
    expect(reason(step(createMatch(quiet), quiet, [move(2, 0)]))).toBe('bad-move');
  });
});

describe('cursor mode and kits', () => {
  it('builds only as the wisp, and the wisp is seen where it built', () => {
    const s = createMatch(rich);
    expect(reason(step(s, rich, [{ type: 'build', player: 0, tower: 'archer', x: 2, y: 3 }]))).toBe('needs-cursor');
    step(s, rich, [fly(), { type: 'build', player: 0, tower: 'archer', x: 2, y: 3 }]);
    expect(s.towers).toHaveLength(1);
    expect(s.spirits[0].wispCell).toBe(3 * s.width + 2);
  });
  it('builds only from its own kit', () => {
    const s = createMatch(rich);
    expect(checkBuild(s, rich, 0, 'knight_hall', 2, 3)).toBe('not-in-kit');
    expect(checkBuild(s, rich, 0, 'barracks', 2, 3)).toBeNull();
    expect(checkBuild(s, rich, 1, 'barracks', 19, 6)).toBe('not-in-kit');
    expect(checkBuild(s, rich, 1, 'knight_hall', 19, 6)).toBeNull();
  });
});

describe('reach', () => {
  it('launches only while walking within reach of its castle', () => {
    const s = createMatch(quiet);
    s.garrison[0].soldier = 2;
    s.spirits[0].x = 3 * CELL;
    expect(reason(step(s, quiet, [{ type: 'launch', player: 0, target: 1 }]))).toBe('out-of-reach');
    s.spirits[0].x = CELL;
    expect(reason(step(s, quiet, [fly(), { type: 'launch', player: 0, target: 1 }]))).toBe('needs-walk');
    expect(step(s, quiet, [walk(), { type: 'launch', player: 0, target: 1 }])).toContainEqual(expect.objectContaining({ type: 'launched', count: 2 }));
  });
  it('sells only a building within reach', () => {
    const s = createMatch(rich);
    step(s, rich, [fly(), { type: 'build', player: 0, tower: 'archer', x: 3, y: 5 }, walk()]);
    expect(reason(step(s, rich, [{ type: 'sell', player: 0, x: 3, y: 5 }]))).toBe('out-of-reach');
    s.spirits[0].x = 2 * CELL;
    step(s, rich, [{ type: 'sell', player: 0, x: 3, y: 5 }]);
    expect(s.towers[0].demolish).toBeGreaterThan(0);
  });
  it('lists what is in reach, nearest first, and nothing while flying', () => {
    const s = createMatch(rich);
    step(s, rich, [fly(), { type: 'build', player: 0, tower: 'archer', x: 1, y: 5 }, walk()]);
    expect(withinReach(s, rich, 0)).toEqual([{ kind: 'castle', cell: s.bases[0] }, { kind: 'building', cell: 5 * s.width + 1 }]);
    s.spirits[0].x = CELL;
    expect(withinReach(s, rich, 0)[0]).toEqual({ kind: 'building', cell: 5 * s.width + 1 });
    step(s, rich, [fly()]);
    expect(withinReach(s, rich, 0)).toEqual([]);
  });
});

describe('passives', () => {
  it('Wisp troops march faster than Mire troops', () => {
    const s = createMatch(quiet);
    s.troops.push({ uid: 900, id: 'soldier', player: 0, target: 1, hp: 6, from: s.bases[0], to: s.bases[0] + 1, progress: 0 });
    s.troops.push({ uid: 901, id: 'soldier', player: 1, target: 0, hp: 6, from: s.bases[1], to: s.bases[1] - 1, progress: 0 });
    step(s, quiet);
    const soldier = cfg.content.troops.soldier.speed;
    expect(s.troops[0].progress).toBe(Math.floor((soldier * 115) / 100));
    expect(s.troops[1].progress).toBe(soldier);
  });
  it('Mire troops have more health', () => {
    const s = createMatch(quiet);
    expect(troopHealth(s, quiet, 1, 'knight')).toBe(36);
    expect(troopHealth(s, quiet, 0, 'knight')).toBe(30);
  });
});

describe('determinism', () => {
  /** Bots, plus player 0's spirit wandering on a fixed pattern, so walking is in the replay. */
  function wander(config = cfg) {
    const match = new Match(config);
    const bots = config.teams.map((_, p) => createBot(p, 70 + p));
    const dirs = [[1, 0], [0, 1], [-1, -1], [1, 1], [0, 0], [-1, 0]];
    while (match.state.tick < 60 * 90 && match.state.winner === null) {
      const t = match.state.tick;
      const extra: Action[] = t % 47 === 0 ? [move(dirs[(t / 47) % dirs.length][0], dirs[(t / 47) % dirs.length][1], 1)] : [];
      match.step([...extra, ...bots.flatMap((b) => b(match.state, config))]);
    }
    return match;
  }
  it('gives the same match twice', () => {
    expect(fingerprint(wander().state)).toBe(fingerprint(wander().state));
  });
  it('replays walking and building to exactly the same state', () => {
    const match = wander(withSpirits(cfg, ['mire', 'wisp']));
    expect(match.state.spirits[1].x).not.toBe(21 * CELL);
    expect(match.state.towers.length).toBeGreaterThan(2);
    const replay = JSON.parse(JSON.stringify(match.replay()));
    expect(replay.version).toBe(3);
    expect(fingerprint(runReplay(replay))).toBe(fingerprint(match.state));
  });
  it('keeps every spirit position a whole number', () => {
    for (const sp of wander().state.spirits) {
      expect(Number.isInteger(sp.x)).toBe(true);
      expect(Number.isInteger(sp.y)).toBe(true);
    }
  });
});

describe('bots', () => {
  it('build from their spirit\'s kit with either spirit', () => {
    for (const spirits of [['wisp', 'mire'], ['mire', 'wisp']]) {
      const config = withSpirits(modes.duel.config, spirits);
      const match = new Match(config);
      const bots = [createBot(0, 3), createBot(1, 4)];
      while (match.state.tick < 60 * 120 && match.state.winner === null) match.step(bots.flatMap((b) => b(match.state, config)));
      for (const p of [0, 1]) {
        const built = match.state.towers.filter((t) => t.player === p).length;
        expect(built).toBeGreaterThan(1);
      }
      for (const t of match.state.towers) {
        const starting = config.map.startingTowers.some((st) => st.player === t.player && st.y * match.state.width + st.x === t.cell);
        if (!starting) expect(config.content.spirits[spirits[t.player]].kit).toContain(t.id);
      }
    }
  });
});
