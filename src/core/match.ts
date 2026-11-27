/** Replays, state fingerprints and the reset/step/observe interface for bots and training. */
import { createMatch, other, step } from './sim';
import type { Action, Config, GameEvent, State, Team } from './types';

export interface Replay { version: 1; game: string; config: Config; actions: { tick: number; action: Action }[]; ticks: number }

export class Match {
  state: State;
  private log: Replay['actions'] = [];
  constructor(readonly config: Config) { this.state = createMatch(config); }

  step(actions: Action[] = []): GameEvent[] {
    for (const action of actions) this.log.push({ tick: this.state.tick, action });
    return step(this.state, this.config, actions);
  }

  replay(game = 'dev'): Replay {
    return structuredClone({ version: 1 as const, game, config: this.config, actions: this.log, ticks: this.state.tick });
  }
}

export function runReplay(r: Replay): State {
  const s = createMatch(r.config);
  let i = 0;
  const due = () => {
    const out: Action[] = [];
    while (i < r.actions.length && r.actions[i].tick === s.tick) out.push(r.actions[i++].action);
    return out;
  };
  while (s.tick < r.ticks && s.winner === null) step(s, r.config, due());
  return s;
}

/** FNV-1a over the state. Two machines in sync have equal fingerprints. */
export function fingerprint(s: State): string {
  const text = JSON.stringify(s);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** What one player may see, from their own side. A copy, so a bot cannot change the match. */
export function observe(s: State, team: Team) {
  return structuredClone({
    tick: s.tick, width: s.width, height: s.height, team,
    gold: s.gold[team],
    baseHealth: { own: s.baseHealth[team], enemy: s.baseHealth[other(team)] },
    bases: { own: s.bases[team], enemy: s.bases[other(team)] },
    rock: s.rock, towers: s.towers, troops: s.troops, winner: s.winner,
  });
}
