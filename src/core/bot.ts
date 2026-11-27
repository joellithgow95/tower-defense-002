/** A very simple opponent: now and then it buys something and puts it near the enemy's route. */
import { blockedCells, distances, nextStep } from './grid';
import { checkBuild, other } from './sim';
import type { Action, Config, State, Team } from './types';

/** Small seeded random numbers (mulberry32), so bot matches can be repeated. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return (t ^ (t >>> 14)) >>> 0;
  };
}

export function createBot(team: Team, seed: number) {
  const random = rng(seed);
  let want: string | null = null;
  return (s: State, cfg: Config): Action[] => {
    if (s.tick % 90 !== 0 || s.winner !== null) return [];
    const roll = random() % 10;
    want ??= roll < 6 ? 'archer' : roll < 9 ? 'barracks' : 'knight_hall';
    if (s.gold[team] < cfg.content.towers[want].cost) return [];
    // Cells on or beside the path enemies take to our base.
    const goal = s.bases[team], d = distances(s, goal, blockedCells(s));
    const path: number[] = [];
    for (let c = nextStep(s, s.bases[other(team)], goal, d); c !== null && c !== goal; c = nextStep(s, c, goal, d)) path.push(c);
    const options: Action[] = [];
    for (let y = 0; y < s.height; y++) {
      for (let x = 0; x < s.width; x++) {
        const near = path.some((c) => Math.abs((c % s.width) - x) + Math.abs(Math.floor(c / s.width) - y) <= 1);
        if (near && !checkBuild(s, cfg, team, want, x, y)) options.push({ type: 'build', team, tower: want, x, y });
      }
    }
    if (!options.length) return [];
    want = null;
    return [options[random() % options.length]];
  };
}
