import type { State } from './types';

/** Fixed neighbour order, so every browser breaks path ties the same way. */
export function neighbours(s: State, c: number): number[] {
  const x = c % s.width, y = Math.floor(c / s.width), out: number[] = [];
  if (y > 0) out.push(c - s.width);
  if (x < s.width - 1) out.push(c + 1);
  if (y < s.height - 1) out.push(c + s.width);
  if (x > 0) out.push(c - 1);
  return out;
}

export function blockedCells(s: State): boolean[] {
  const b = s.rock.slice();
  for (const t of s.towers) b[t.cell] = true;
  for (const base of s.bases) b[base] = true;
  return b;
}

/** Steps from every walkable cell to `goal` (-1 = no route). The goal itself may be a wall. */
export function distances(s: State, goal: number, blocked: boolean[]): number[] {
  const d = new Array<number>(blocked.length).fill(-1);
  d[goal] = 0;
  const queue = [goal];
  for (let i = 0; i < queue.length; i++) {
    for (const n of neighbours(s, queue[i])) {
      if (d[n] !== -1 || blocked[n]) continue;
      d[n] = d[queue[i]] + 1;
      queue.push(n);
    }
  }
  return d;
}

/** The next cell on a shortest route. Works from a blocked cell too (a spawner's own cell). */
export function nextStep(s: State, from: number, goal: number, d: number[]): number | null {
  let best: number | null = null;
  for (const n of neighbours(s, from)) {
    if (n === goal) return n;
    if (d[n] >= 0 && (best === null || d[n] < d[best])) best = n;
  }
  return best;
}
