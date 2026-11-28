import { describe, expect, it } from 'vitest';
import { createBot } from '../src/core/bot';
import { defaultConfig as cfg } from '../src/core/config';
import { Match, fingerprint, observe, runReplay } from '../src/core/match';
import { CELL, adjacent, checkBuild, createMatch, step } from '../src/core/sim';
import { problems } from '../src/core/validate';

const quiet = { ...cfg, map: { ...cfg.map, startingTowers: [] } };
const corridor = { ...cfg, rules: { ...cfg.rules, castleNoBuildRadius: 0 }, map: { name: 'corridor', startingTowers: [], rows: ['######', '1....2', '######'] } };

function botMatch(ticks: number) {
  const match = new Match(cfg);
  const bots = [createBot(0, 7), createBot(1, 8)];
  while (match.state.tick < ticks && match.state.winner === null) {
    match.step(bots.flatMap((b) => b(match.state, cfg)));
    for (const t of match.state.troops) {
      expect(adjacent(match.state, t.from, t.to)).toBe(true);
      expect(t.progress).toBeGreaterThanOrEqual(0);
      expect(t.progress).toBeLessThanOrEqual(CELL);
    }
  }
  return match;
}

describe('content', () => {
  it('has no mistakes', () => expect(problems(cfg)).toEqual([]));
  it('explains a mistake in plain English', () => {
    const bad = structuredClone(cfg);
    bad.content.troops.soldier.health = -1;
    expect(problems(bad)[0]).toContain('"health" must be a whole number above 0');
  });
});

describe('building', () => {
  it('charges gold', () => {
    const s = createMatch(quiet);
    step(s, quiet, [{ type: 'build', team: 0, tower: 'archer', x: 1, y: 4 }]);
    expect(s.towers).toHaveLength(1);
    expect(s.gold[0]).toBe(40);
  });
  it('lets you build where troops are walking, and they go round', () => {
    const s = createMatch(quiet);
    const at = (x: number, y: number) => y * s.width + x;
    s.troops.push({ uid: 999, id: 'soldier', team: 1, hp: 10, from: at(3, 5), to: at(2, 5), progress: CELL / 2 });
    step(s, quiet, [{ type: 'build', team: 0, tower: 'archer', x: 2, y: 5 }]);
    expect(s.towers).toHaveLength(1);
    for (let i = 0; i < 120; i++) {
      step(s, quiet);
      const troop = s.troops.find((t) => t.uid === 999);
      if (troop) expect(troop.to).not.toBe(at(2, 5));
    }
  });
  it('will not build in front of a troop that has just left its building', () => {
    const s = createMatch(cfg);
    const at = (x: number, y: number) => y * s.width + x;
    s.troops.push({ uid: 999, id: 'soldier', team: 0, hp: 10, from: at(2, 4), to: at(3, 4), progress: 0 });
    expect(checkBuild(s, cfg, 0, 'archer', 3, 4)).toBe('occupied');
  });
  it('refuses to seal the only route', () => {
    const s = createMatch(corridor);
    expect(checkBuild(s, corridor, 0, 'archer', 2, 1)).toBe('blocks-route');
  });
  it('refunds after the demolish delay', () => {
    const s = createMatch(quiet);
    step(s, quiet, [{ type: 'build', team: 0, tower: 'archer', x: 1, y: 4 }]);
    step(s, quiet, [{ type: 'sell', team: 0, x: 1, y: 4 }]);
    const before = s.gold[0];
    for (let i = 0; i < quiet.rules.demolishTicks; i++) step(s, quiet);
    expect(s.towers).toHaveLength(0);
    expect(s.gold[0]).toBeGreaterThanOrEqual(before + 12);
  });
});

describe('land', () => {
  // Rocky Pass: team 0's castle is at x 0, y 5 and team 1's at x 21, y 6. buildRadius and castleNoBuildRadius are 3.
  const rich = { ...quiet, rules: { ...quiet.rules, startingGold: 1000 } };
  it('starts as a ring around your castle, diagonals included', () => {
    const s = createMatch(rich);
    expect(checkBuild(s, rich, 0, 'archer', 3, 2)).toBeNull();
    expect(checkBuild(s, rich, 0, 'archer', 4, 5)).toBe('not-your-land');
    expect(checkBuild(s, rich, 0, 'archer', 15, 1)).toBe('not-your-land');
  });
  it('spreads from each building you add', () => {
    const s = createMatch(rich);
    step(s, rich, [{ type: 'build', team: 0, tower: 'archer', x: 3, y: 5 }]);
    expect(checkBuild(s, rich, 0, 'archer', 6, 5)).toBeNull();
    expect(checkBuild(s, rich, 1, 'archer', 6, 5)).toBe('not-your-land');
  });
  it('stops spreading from a building once it is being sold', () => {
    const s = createMatch(rich);
    step(s, rich, [{ type: 'build', team: 0, tower: 'archer', x: 3, y: 5 }]);
    step(s, rich, [{ type: 'sell', team: 0, x: 3, y: 5 }]);
    expect(checkBuild(s, rich, 0, 'archer', 6, 5)).toBe('not-your-land');
  });
  it('can reach across the board, but not into the ring round the enemy castle', () => {
    const s = createMatch(rich);
    for (let x = 3; x <= 15; x += 3) step(s, rich, [{ type: 'build', team: 0, tower: 'archer', x, y: 5 }]);
    expect(s.towers).toHaveLength(5);
    expect(checkBuild(s, rich, 0, 'archer', 17, 2)).toBeNull();
    expect(checkBuild(s, rich, 0, 'archer', 18, 3)).toBe('near-enemy-castle');
    const open = { ...rich, rules: { ...rich.rules, castleNoBuildRadius: 0 } };
    expect(checkBuild(s, open, 0, 'archer', 18, 3)).toBeNull();
  });
  it('explains a bad radius', () => {
    const bad = structuredClone(cfg);
    bad.rules.castleNoBuildRadius = -1;
    expect(problems(bad)[0]).toContain('"castleNoBuildRadius" must be a whole number, 0 or more');
  });
});

describe('a match', () => {
  it('ends when troops reach a base', () => {
    const s = createMatch({ ...cfg, map: { ...cfg.map, startingTowers: [cfg.map.startingTowers[0]] } });
    while (s.winner === null && s.tick < 60 * 600) step(s, cfg);
    expect(s.winner).toBe(0);
  });
  it('replays to exactly the same state', () => {
    const match = botMatch(60 * 90);
    const replay = JSON.parse(JSON.stringify(match.replay()));
    expect(fingerprint(runReplay(replay))).toBe(fingerprint(match.state));
  });
  it('gives observers a copy', () => {
    const s = createMatch(cfg);
    observe(s, 0).towers.length = 0;
    expect(s.towers).toHaveLength(2);
  });
});
