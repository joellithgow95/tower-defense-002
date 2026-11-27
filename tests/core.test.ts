import { describe, expect, it } from 'vitest';
import { createBot } from '../src/core/bot';
import { defaultConfig as cfg } from '../src/core/config';
import { Match, fingerprint, observe, runReplay } from '../src/core/match';
import { CELL, adjacent, checkBuild, createMatch, step } from '../src/core/sim';
import { problems } from '../src/core/validate';

const quiet = { ...cfg, map: { ...cfg.map, startingTowers: [] } };
const corridor = { ...cfg, map: { name: 'corridor', startingTowers: [], rows: ['######', '1....2', '######'] } };

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
  it('charges gold, and only on your own half', () => {
    const s = createMatch(quiet);
    expect(checkBuild(s, quiet, 0, 'archer', 15, 1)).toBe('not-your-land');
    step(s, quiet, [{ type: 'build', team: 0, tower: 'archer', x: 1, y: 1 }]);
    expect(s.towers).toHaveLength(1);
    expect(s.gold[0]).toBe(40);
  });
  it('refuses to seal the only route', () => {
    const s = createMatch(corridor);
    expect(checkBuild(s, corridor, 0, 'archer', 2, 1)).toBe('blocks-route');
  });
  it('refunds after the demolish delay', () => {
    const s = createMatch(quiet);
    step(s, quiet, [{ type: 'build', team: 0, tower: 'archer', x: 1, y: 1 }]);
    step(s, quiet, [{ type: 'sell', team: 0, x: 1, y: 1 }]);
    const before = s.gold[0];
    for (let i = 0; i < quiet.rules.demolishTicks; i++) step(s, quiet);
    expect(s.towers).toHaveLength(0);
    expect(s.gold[0]).toBeGreaterThanOrEqual(before + 12);
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
