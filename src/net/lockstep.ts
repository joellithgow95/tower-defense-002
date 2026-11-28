/**
 * The browser's half of online play: runs the match only as far as the server has confirmed,
 * applying each action on the tick the server stamped it with. No networking here, so tests can drive it.
 */
import { createBot } from '../core/bot';
import { modes, withSpirits } from '../core/config';
import { Match, fingerprint } from '../core/match';
import type { Action, GameEvent } from '../core/types';
import { FINGERPRINT_EVERY, type ServerMessage, type Stamped } from './protocol';

type Start = Extract<ServerMessage, { t: 'start' }>;

export class Lockstep {
  readonly match: Match;
  readonly config;
  /** The server has confirmed every tick before this one. */
  upTo: number;
  private due = new Map<number, Action[]>();
  private bots;

  constructor(start: Start) {
    this.config = withSpirits(modes[start.mode].config, start.spirits);
    this.match = new Match(this.config);
    // Empty seats are bots. Every browser runs the same bots with the same seed, so their moves match too.
    this.bots = start.humans.flatMap((human, p) => (human ? [] : [createBot(p, start.seed + p)]));
    this.upTo = start.upTo;
    this.add(start.actions);
  }

  /** A turn arrived from the server. */
  receive(turn: { upTo: number; actions: Stamped[] }) {
    this.add(turn.actions);
    this.upTo = Math.max(this.upTo, turn.upTo);
  }

  /** Ticks we are allowed to run but haven't yet. */
  get behind() { return this.match.state.winner === null ? this.upTo - this.match.state.tick : 0; }

  /** Run one tick if the server has confirmed it. Returns its events and, now and then, a fingerprint to report. */
  step(): { events: GameEvent[]; report?: { tick: number; fingerprint: string } } | null {
    const s = this.match.state;
    if (this.behind <= 0) return null;
    const actions = [...(this.due.get(s.tick) ?? []), ...this.bots.flatMap((bot) => bot(s, this.config))];
    this.due.delete(s.tick);
    const events = this.match.step(actions);
    const report = s.tick % FINGERPRINT_EVERY === 0 ? { tick: s.tick, fingerprint: fingerprint(s) } : undefined;
    return { events, report };
  }

  private add(actions: Stamped[]) {
    for (const { tick, action } of actions) {
      const list = this.due.get(tick) ?? [];
      list.push(action);
      this.due.set(tick, list);
    }
  }
}
