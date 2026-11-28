/** A very simple opponent: now and then it builds near an enemy's route, and it attacks the weakest enemy once its garrison is big enough. */
import { blockedCells, distances, nextStep } from './grid';
import { alive, checkBuild, enemies, players } from './sim';
import type { Action, Config, Player, State } from './types';

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

export function createBot(player: Player, seed: number) {
  const random = rng(seed);
  let want: string | null = null;
  let attackAt = 4 + (random() % 6);
  return (s: State, cfg: Config): Action[] => {
    if (s.tick % 90 !== 0 || s.winner !== null || !alive(s, player)) return [];
    const foes = players(s).filter((q) => alive(s, q) && enemies(s, player, q));
    const army = Object.values(s.garrison[player]).reduce((a, b) => a + b, 0);
    if (army >= attackAt && foes.length) {
      attackAt = 4 + (random() % 6);
      // The weakest castle; a tie is broken at random, so bots don't all pick on the same player.
      const weakest = foes.filter((q) => s.baseHealth[q] === Math.min(...foes.map((f) => s.baseHealth[f])));
      const target = weakest[random() % weakest.length];
      return [{ type: 'launch', player, target }];
    }
    const roll = random() % 10;
    want ??= roll < 6 ? 'archer' : roll < 9 ? 'barracks' : 'knight_hall';
    if (s.gold[player] < cfg.content.towers[want].cost) return [];
    // Cells on or beside the routes enemies take to our castle.
    const goal = s.bases[player], d = distances(s, goal, blockedCells(s));
    const path: number[] = [];
    for (const q of foes) {
      for (let c = nextStep(s, s.bases[q], goal, d); c !== null && c !== goal; c = nextStep(s, c, goal, d)) path.push(c);
    }
    const options: Action[] = [];
    for (let y = 0; y < s.height; y++) {
      for (let x = 0; x < s.width; x++) {
        const near = path.some((c) => Math.abs((c % s.width) - x) + Math.abs(Math.floor(c / s.width) - y) <= 1);
        if (near && !checkBuild(s, cfg, player, want, x, y)) options.push({ type: 'build', player, tower: want, x, y });
      }
    }
    if (!options.length) return [];
    want = null;
    return [options[random() % options.length]];
  };
}
