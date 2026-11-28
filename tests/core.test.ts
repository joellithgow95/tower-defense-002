import { describe, expect, it } from 'vitest';
import { createBot } from '../src/core/bot';
import { readdirSync } from 'node:fs';
import { matchConfig, modes } from '../src/core/config';
import { defaultConfig as cfg, choices, configFor, contentProblems, mapIds, maps } from '../src/core/maps';
import { Match, fingerprint, observe, runReplay } from '../src/core/match';
import { CELL, adjacent, checkBuild, createMatch, step } from '../src/core/sim';
import { mapProblems, problems } from '../src/core/validate';

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
  it('has no mistakes', () => expect(contentProblems()).toEqual([]));
  it('explains a mistake in plain English', () => {
    const bad = structuredClone(cfg);
    bad.content.troops.soldier.health = -1;
    expect(problems(bad)[0]).toContain('"health" must be a whole number above 0');
  });
});

describe('maps', () => {
  it('finds every file in content/maps/ by itself', () => {
    const files = readdirSync('content/maps').filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
    expect([...mapIds].sort()).toEqual(files.sort());
    for (const id of mapIds) expect(maps[id].id).toBe(id);
  });
  it('keeps the maps that are already played, under the same ids', () => {
    expect(mapIds).toEqual(expect.arrayContaining(['rocky-pass', 'three-crowns', 'four-crossroads']));
  });
  it('can play every mode on some map', () => {
    for (const mode of Object.keys(modes)) expect(choices.some((c) => c.mode === mode)).toBe(true);
  });
  it('lists maps from fewest players to most', () => {
    const players = mapIds.map((id) => configFor(choices.find((c) => c.map === id)!).teams.length);
    expect(players).toEqual([...players].sort((a, b) => a - b));
  });
  it('explains a map file with missing or wrong details', () => {
    const map = { ...maps['three-crowns'], id: 'Drowned Woods', description: '', modes: ['duel', 'swim'] };
    const said = mapProblems(map).join(' ');
    expect(said).toContain('lowercase letters, numbers and dashes');
    expect(said).toContain('give it a "description"');
    expect(said).toContain('"duel" (1 v 1) needs 2 castles, but this map has 3');
    expect(said).toContain('there is no game mode called "swim"');
    expect(mapProblems({ ...maps['rocky-pass'], modes: undefined }).join(' ')).toContain('list the game modes it can be played as in "modes"');
  });
  it('refuses a map and mode that do not go together', () => {
    expect(() => configFor({ map: 'rocky-pass', mode: 'ffa' })).toThrow('content/maps/rocky-pass.json');
    expect(() => configFor({ map: 'drowned-woods', mode: 'duel' })).toThrow('no map called "drowned-woods"');
  });
  it('names the map file in a mistake about its rows', () => {
    const bad = matchConfig({ ...maps['rocky-pass'], rows: ['1..', '..2', '.'] }, 'duel');
    expect(problems(bad)).toContain('content/maps/rocky-pass.json: every row must be the same length.');
  });
});

describe('bug reports', () => {
  it('still replays a report made before maps had ids', async () => {
    const { default: old } = await import('./fixtures/report-v2-three-crowns.json');
    expect('id' in old.config.map).toBe(false);
    expect(fingerprint(runReplay(old as unknown as Parameters<typeof runReplay>[0]))).toBe(old.fingerprint);
  });
  it('records which map was played', () => {
    const match = new Match(configFor({ map: 'four-crossroads', mode: 'fourWay' }));
    match.step();
    const replay = JSON.parse(JSON.stringify(match.replay()));
    expect(replay.config.map.id).toBe('four-crossroads');
    expect(fingerprint(runReplay(replay))).toBe(fingerprint(match.state));
  });
});

describe('building', () => {
  it('charges gold', () => {
    const s = createMatch(quiet);
    step(s, quiet, [{ type: 'build', player: 0, tower: 'archer', x: 1, y: 4 }]);
    expect(s.towers).toHaveLength(1);
    expect(s.gold[0]).toBe(40);
  });
  it('lets you build where troops are walking, and they go round', () => {
    const s = createMatch(quiet);
    const at = (x: number, y: number) => y * s.width + x;
    s.troops.push({ uid: 999, id: 'soldier', player: 1, target: 0, hp: 10, from: at(3, 5), to: at(2, 5), progress: CELL / 2 });
    step(s, quiet, [{ type: 'build', player: 0, tower: 'archer', x: 2, y: 5 }]);
    expect(s.towers).toHaveLength(1);
    for (let i = 0; i < 120; i++) {
      step(s, quiet);
      const troop = s.troops.find((t) => t.uid === 999);
      if (troop) expect(troop.to).not.toBe(at(2, 5));
    }
  });
  it('will not build in front of a troop that has just left its castle', () => {
    const s = createMatch(cfg);
    const at = (x: number, y: number) => y * s.width + x;
    s.troops.push({ uid: 999, id: 'soldier', player: 0, target: 1, hp: 10, from: at(0, 5), to: at(1, 5), progress: 0 });
    expect(checkBuild(s, cfg, 0, 'archer', 1, 5)).toBe('occupied');
  });
  it('refuses to seal the only route', () => {
    const s = createMatch(corridor);
    expect(checkBuild(s, corridor, 0, 'archer', 2, 1)).toBe('blocks-route');
  });
  it('refunds after the demolish delay', () => {
    const s = createMatch(quiet);
    step(s, quiet, [{ type: 'build', player: 0, tower: 'archer', x: 1, y: 4 }]);
    step(s, quiet, [{ type: 'sell', player: 0, x: 1, y: 4 }]);
    const before = s.gold[0];
    for (let i = 0; i < quiet.rules.demolishTicks; i++) step(s, quiet);
    expect(s.towers).toHaveLength(0);
    expect(s.gold[0]).toBeGreaterThanOrEqual(before + 12);
  });
});

describe('land', () => {
  // Rocky Pass: player 0's castle is at x 0, y 5 and player 1's at x 21, y 6. buildRadius and castleNoBuildRadius are 3.
  const rich = { ...quiet, rules: { ...quiet.rules, startingGold: 1000 } };
  it('starts as a ring around your castle, diagonals included', () => {
    const s = createMatch(rich);
    expect(checkBuild(s, rich, 0, 'archer', 3, 2)).toBeNull();
    expect(checkBuild(s, rich, 0, 'archer', 4, 5)).toBe('not-your-land');
    expect(checkBuild(s, rich, 0, 'archer', 15, 1)).toBe('not-your-land');
  });
  it('spreads from each building you add', () => {
    const s = createMatch(rich);
    step(s, rich, [{ type: 'build', player: 0, tower: 'archer', x: 3, y: 5 }]);
    expect(checkBuild(s, rich, 0, 'archer', 6, 5)).toBeNull();
    expect(checkBuild(s, rich, 1, 'archer', 6, 5)).toBe('not-your-land');
  });
  it('stops spreading from a building once it is being sold', () => {
    const s = createMatch(rich);
    step(s, rich, [{ type: 'build', player: 0, tower: 'archer', x: 3, y: 5 }]);
    step(s, rich, [{ type: 'sell', player: 0, x: 3, y: 5 }]);
    expect(checkBuild(s, rich, 0, 'archer', 6, 5)).toBe('not-your-land');
  });
  it('can reach across the board, but not into the ring round the enemy castle', () => {
    const s = createMatch(rich);
    for (let x = 3; x <= 15; x += 3) step(s, rich, [{ type: 'build', player: 0, tower: 'archer', x, y: 5 }]);
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

describe('armies', () => {
  // Rocky Pass starts each side with one Barracks: 5 soldiers of room, one trained every 240 ticks.
  const train = (s: ReturnType<typeof createMatch>, ticks: number) => { for (let i = 0; i < ticks; i++) step(s, cfg); };
  it('trains troops into the castle instead of sending them', () => {
    const s = createMatch(cfg);
    train(s, 240);
    expect(s.garrison[0].soldier).toBe(1);
    expect(s.troops).toHaveLength(0);
  });
  it('stops training when the garrison is full, and more buildings make more room', () => {
    const s = createMatch(cfg);
    train(s, 240 * 8);
    expect(s.garrison[0].soldier).toBe(5);
    s.gold[0] = 1000;
    step(s, cfg, [{ type: 'build', player: 0, tower: 'barracks', x: 1, y: 2 }]);
    train(s, 240 * 6);
    expect(s.garrison[0].soldier).toBe(10);
  });
  it('launches the whole garrison in single file from the castle', () => {
    const s = createMatch(cfg);
    s.garrison[0].soldier = 3;
    const events = step(s, cfg, [{ type: 'launch', player: 0, target: 1 }]);
    expect(events).toContainEqual({ type: 'launched', player: 0, target: 1, count: 3 });
    expect(s.garrison[0].soldier).toBe(0);
    expect(s.troops).toHaveLength(1);
    expect(s.troops[0].from).toBe(s.bases[0]);
    for (let i = 1; i < cfg.rules.launchGapTicks; i++) step(s, cfg);
    expect(s.troops).toHaveLength(1);
    step(s, cfg);
    expect(s.troops).toHaveLength(2);
  });
  it('refuses an empty launch, or one at your own castle', () => {
    const s = createMatch(cfg);
    expect(step(s, cfg, [{ type: 'launch', player: 0, target: 1 }])).toContainEqual(expect.objectContaining({ reason: 'empty-garrison' }));
    s.garrison[0].soldier = 1;
    expect(step(s, cfg, [{ type: 'launch', player: 0, target: 0 }])).toContainEqual(expect.objectContaining({ reason: 'bad-target' }));
  });
});

describe('more than two players', () => {
  // Three Crowns: player 0's castle is at x 2, y 13, player 1's at x 20, y 13, player 2's at x 11, y 1.
  const ffa = configFor({ map: 'three-crowns', mode: 'ffa' }), twoVsOne = configFor({ map: 'three-crowns', mode: 'twoVsOne' });
  const at = (s: ReturnType<typeof createMatch>, x: number, y: number) => y * s.width + x;
  it('has every map and mode set up correctly', () => {
    for (const choice of choices) expect(problems(configFor(choice))).toEqual([]);
  });
  it('lets you launch at an enemy, but not at an ally', () => {
    const s = createMatch(twoVsOne);
    s.garrison[0].soldier = 2;
    expect(step(s, twoVsOne, [{ type: 'launch', player: 0, target: 1 }])).toContainEqual(expect.objectContaining({ reason: 'bad-target' }));
    expect(step(s, twoVsOne, [{ type: 'launch', player: 0, target: 2 }])).toContainEqual(expect.objectContaining({ type: 'launched', count: 2 }));
  });
  it('never shoots an ally\'s troops, but does shoot an enemy\'s', () => {
    const hpAfterAMoment = (archerOwner: number) => {
      const s = createMatch(twoVsOne);
      s.towers.push({ uid: 500, id: 'archer', player: archerOwner, cell: at(s, 10, 10), timer: 1, demolish: 0 });
      s.troops.push({ uid: 501, id: 'knight', player: 0, target: 2, hp: 30, from: at(s, 9, 11), to: at(s, 10, 11), progress: 0 });
      for (let i = 0; i < 30; i++) step(s, twoVsOne);
      const troop = s.troops.find((t) => t.uid === 501);
      expect(troop).toBeDefined();
      return troop!.hp;
    };
    expect(hpAfterAMoment(1)).toBe(30);
    expect(hpAfterAMoment(2)).toBeLessThan(30);
  });
  it('explains a map with too many castles', () => {
    const big = { ...cfg, teams: [0, 1, 2, 3, 4], map: { name: 'big', startingTowers: [], rows: ['1.2.3.4.5'] } };
    expect(problems(big).join(' ')).toContain('the most a map may have is 4');
  });
  it('keeps every castle connected to every enemy castle', () => {
    const walled = { ...ffa, map: { name: 'walled', startingTowers: [], rows: ['1.#3', '..#.', '2.#.'] }, rules: { ...ffa.rules, castleNoBuildRadius: 0 } };
    expect(problems(walled)).toEqual([]);
    const s = createMatch({ ...walled, map: { ...walled.map, rows: ['1..3', '..#.', '2.#.'] } });
    expect(checkBuild(s, walled, 0, 'archer', 1, 0)).toBe('blocks-route');
  });
  it('knocks a fallen player out: ruins stay, troops turn on the next enemy, and the match goes on', () => {
    const s = createMatch(ffa);
    s.troops.push({ uid: 900, id: 'soldier', player: 1, target: 0, hp: 6, from: at(s, 10, 7), to: at(s, 9, 7), progress: 0 });
    s.garrison[0].soldier = 4;
    s.baseHealth[0] = 1;
    s.troops.push({ uid: 901, id: 'knight', player: 2, target: 0, hp: 30, from: at(s, 3, 13), to: at(s, 2, 13), progress: CELL - 1 });
    const events = step(s, ffa);
    expect(events).toContainEqual({ type: 'knocked-out', player: 0 });
    expect(s.winner).toBeNull();
    expect(s.garrison[0].soldier).toBe(0);
    expect(s.towers.filter((t) => t.player === 0)).toHaveLength(1);
    step(s, ffa);
    expect(s.troops.find((t) => t.uid === 900)?.target).toBe(2);
    expect(checkBuild(s, ffa, 0, 'archer', 3, 12)).toBe('knocked-out');
  });
  it('ends when only one team has a castle standing', () => {
    const s = createMatch(twoVsOne);
    s.baseHealth[2] = 1;
    s.troops.push({ uid: 902, id: 'knight', player: 0, target: 2, hp: 30, from: at(s, 11, 2), to: at(s, 11, 1), progress: CELL - 1 });
    step(s, twoVsOne);
    expect(s.winner).toBe(0);
  });
  it('replays a free-for-all exactly', () => {
    const match = new Match(ffa);
    const bots = [0, 1, 2].map((p) => createBot(p, 40 + p));
    while (match.state.tick < 60 * 90 && match.state.winner === null) match.step(bots.flatMap((b) => b(match.state, ffa)));
    expect(fingerprint(runReplay(JSON.parse(JSON.stringify(match.replay()))))).toBe(fingerprint(match.state));
  });
});

describe('a match', () => {
  it('ends when launched troops reach a base', () => {
    const s = createMatch({ ...cfg, map: { ...cfg.map, startingTowers: [cfg.map.startingTowers[0]] } });
    while (s.winner === null && s.tick < 60 * 600) step(s, cfg, s.tick % 600 === 0 && s.garrison[0].soldier ? [{ type: 'launch', player: 0, target: 1 }] : []);
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
