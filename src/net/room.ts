/**
 * One game room's rules, with no networking: the server (worker/index.ts) feeds it messages and a clock,
 * and tests drive it directly. It never runs the game; it only orders actions and keeps the turn clock.
 */
import { type Mode, modes } from '../core/config';
import type { Action } from '../core/types';
import { type ClientMessage, MAX_NAME, type ServerMessage, type Stamped, TURN_TICKS } from './protocol';

/** Limits that keep one misbehaving browser from flooding a room. */
const MAX_PEOPLE = 12;
const MAX_ACTIONS_PER_TURN = 20;

interface Person { name: string; send: (m: ServerMessage) => void; online: boolean; actionsThisTurn: number }

export class RoomCore {
  phase: 'lobby' | 'playing' = 'lobby';
  mode: Mode = 'duel';
  /** seats[p] is the client id sitting as player p, or null for a bot. */
  seats: (string | null)[] = [null, null];
  people = new Map<string, Person>();
  build: string | null = null;
  host: string | null = null;

  // The current match.
  seed = 0;
  humans: boolean[] = [];
  upTo = 0;
  actions: Stamped[] = [];
  private pending: Stamped[] = [];
  private fingerprints = new Map<number, string>();
  private desynced = false;

  constructor(private random: () => number = Math.random) {}

  /** The clock should run only during a match with someone connected. */
  get running() { return this.phase === 'playing' && [...this.people.values()].some((p) => p.online); }

  /** A browser connected and said hello. Returns false (after telling it why) if it can't join. */
  join(client: string, rawName: string, build: string, send: (m: ServerMessage) => void): boolean {
    const known = this.people.get(client);
    if (!known && this.people.size >= MAX_PEOPLE) { send({ t: 'error', message: 'This room is full.' }); return false; }
    if (this.build && this.build !== build && this.anyoneOnline()) {
      send({ t: 'error', message: 'This room is running a different version of the game. Refresh the page to update.' });
      return false;
    }
    this.build = build;
    const name = (rawName.trim() || 'Player').slice(0, MAX_NAME);
    this.people.set(client, { name, send, online: true, actionsThisTurn: 0 });
    if (!this.host || !this.people.get(this.host)?.online) this.host = client;
    // A newcomer to the lobby takes the first empty seat.
    if (this.phase === 'lobby' && !this.seats.includes(client)) {
      const free = this.seats.indexOf(null);
      if (free >= 0) this.seats[free] = client;
    }
    if (this.phase === 'playing') send(this.startMessage());
    this.broadcastRoom();
    return true;
  }

  leave(client: string) {
    const person = this.people.get(client);
    if (!person) return;
    person.online = false;
    // In the lobby you lose your seat; in a match it waits for you to reconnect.
    if (this.phase === 'lobby') {
      this.seats = this.seats.map((s) => (s === client ? null : s));
      this.people.delete(client);
    }
    if (this.host === client) this.host = [...this.people.entries()].find(([, p]) => p.online)?.[0] ?? null;
    this.broadcastRoom();
  }

  receive(client: string, m: ClientMessage) {
    const person = this.people.get(client);
    if (!person) return;
    const isHost = client === this.host;
    if (m.t === 'name') {
      person.name = String(m.name ?? '').trim().slice(0, MAX_NAME) || person.name;
      this.broadcastRoom();
    } else if (m.t === 'sit' && this.phase === 'lobby') {
      if (m.seat !== null && (!Number.isInteger(m.seat) || m.seat < 0 || m.seat >= this.seats.length || this.seats[m.seat] !== null)) return;
      this.seats = this.seats.map((s) => (s === client ? null : s));
      if (m.seat !== null) this.seats[m.seat] = client;
      this.broadcastRoom();
    } else if (m.t === 'mode' && isHost && this.phase === 'lobby' && m.mode in modes) {
      this.mode = m.mode;
      const size = modes[m.mode].config.teams.length;
      const sitting = this.seats.filter((s) => s !== null);
      this.seats = Array.from({ length: size }, (_, i) => sitting[i] ?? null);
      this.broadcastRoom();
    } else if (m.t === 'start' && isHost && this.phase === 'lobby') {
      this.startMatch();
    } else if (m.t === 'lobby' && isHost && this.phase === 'playing') {
      this.phase = 'lobby';
      for (const [id, p] of this.people) if (!p.online) { this.people.delete(id); this.seats = this.seats.map((s) => (s === id ? null : s)); }
      this.broadcastRoom();
    } else if (m.t === 'action' && this.phase === 'playing') {
      const seat = this.seats.indexOf(client);
      if (seat < 0 || person.actionsThisTurn >= MAX_ACTIONS_PER_TURN) return;
      const action = cleanAction(m.action, seat);
      if (!action) return;
      person.actionsThisTurn++;
      // Nobody has simulated tick `upTo` yet, so every browser can still apply this action on it.
      const stamped = { tick: this.upTo, action };
      this.pending.push(stamped);
      this.actions.push(stamped);
    } else if (m.t === 'fingerprint' && this.phase === 'playing' && Number.isInteger(m.tick) && m.tick <= this.upTo) {
      const seen = this.fingerprints.get(m.tick);
      if (seen === undefined) this.fingerprints.set(m.tick, String(m.fingerprint));
      else if (seen !== m.fingerprint && !this.desynced) {
        this.desynced = true;
        this.broadcast({ t: 'desync', tick: m.tick });
      }
      for (const tick of this.fingerprints.keys()) if (tick < this.upTo - 3600) this.fingerprints.delete(tick);
    }
  }

  /** Close the current turn. The server calls this every TURN_MS while `running`. */
  turn() {
    if (this.phase !== 'playing') return;
    this.upTo += TURN_TICKS;
    this.broadcast({ t: 'turn', upTo: this.upTo, actions: this.pending });
    this.pending = [];
    for (const p of this.people.values()) p.actionsThisTurn = 0;
  }

  private startMatch() {
    this.phase = 'playing';
    this.seed = Math.floor(this.random() * 2 ** 31);
    this.humans = this.seats.map((s) => s !== null);
    this.upTo = 0;
    this.actions = [];
    this.pending = [];
    this.fingerprints.clear();
    this.desynced = false;
    this.broadcast(this.startMessage());
    this.broadcastRoom();
  }

  private startMessage(): ServerMessage {
    return { t: 'start', mode: this.mode, seed: this.seed, humans: this.humans, actions: this.actions.filter((a) => a.tick < this.upTo), upTo: this.upTo };
  }

  private anyoneOnline() { return [...this.people.values()].some((p) => p.online); }

  private broadcast(m: ServerMessage) { for (const p of this.people.values()) if (p.online) p.send(m); }

  private broadcastRoom() {
    const seats = this.seats.map((id) => {
      const p = id ? this.people.get(id) : undefined;
      return { name: p?.name ?? null, online: !!p?.online };
    });
    const watching = [...this.people.entries()].filter(([id, p]) => p.online && !this.seats.includes(id)).map(([, p]) => p.name);
    for (const [id, p] of this.people) {
      if (!p.online) continue;
      const seat = this.seats.indexOf(id);
      p.send({ t: 'room', phase: this.phase, mode: this.mode, seats, watching, you: seat >= 0 ? seat : null, host: id === this.host });
    }
  }
}

/** Rebuild an action from known fields only, as the sender's own player. Anything malformed is dropped. */
function cleanAction(a: Action, player: number): Action | null {
  if (!a || typeof a !== 'object') return null;
  const int = (v: unknown) => (Number.isInteger(v) ? (v as number) : null);
  if (a.type === 'build') {
    const x = int(a.x), y = int(a.y);
    return x === null || y === null || typeof a.tower !== 'string' ? null : { type: 'build', player, tower: a.tower.slice(0, 40), x, y };
  }
  if (a.type === 'sell') {
    const x = int(a.x), y = int(a.y);
    return x === null || y === null ? null : { type: 'sell', player, x, y };
  }
  if (a.type === 'launch') {
    const target = int(a.target);
    return target === null ? null : { type: 'launch', player, target };
  }
  return null;
}
