/** Online play with no network: a real RoomCore, several Lockstep browsers, and messages delivered late or in bursts. */
import { describe, expect, it } from 'vitest';
import { fingerprint } from '../src/core/match';
import { Lockstep } from '../src/net/lockstep';
import type { ClientMessage, ServerMessage } from '../src/net/protocol';
import { RoomCore } from '../src/net/room';

/** A browser: an inbox the test empties when it likes, and a match once the server starts one. */
class FakeBrowser {
  inbox: ServerMessage[] = [];
  game: Lockstep | null = null;
  seat: number | null = null;
  desync = false;
  constructor(readonly id: string, readonly room: RoomCore) {}
  connect(build = 'test') { return this.room.join(this.id, this.id, build, (m) => this.inbox.push(structuredClone(m))); }
  send(m: ClientMessage) { this.room.receive(this.id, structuredClone(m)); }
  /** Read every waiting message, then run as far as the server allows. */
  catchUp() {
    for (const m of this.inbox.splice(0)) {
      if (m.t === 'room') this.seat = m.you;
      if (m.t === 'start') this.game = new Lockstep(m);
      if (m.t === 'turn') this.game?.receive(m);
      if (m.t === 'desync') this.desync = true;
    }
    for (let r = this.game?.step(); r; r = this.game!.step()) if (r.report) this.send({ t: 'fingerprint', ...r.report });
  }
  get state() { return this.game!.match.state; }
}

/** Seeded so a failure can be repeated. */
function seeded(seed: number) { let a = seed; return () => ((a = (a * 1103515245 + 12345) % 2 ** 31) / 2 ** 31); }

describe('online play', () => {
  it('keeps two browsers in sync while both build, sell and launch', () => {
    const room = new RoomCore(seeded(1));
    const [a, b] = [new FakeBrowser('a', room), new FakeBrowser('b', room)];
    a.connect(); b.connect();
    a.catchUp(); b.catchUp();
    expect([a.seat, b.seat]).toEqual([0, 1]);
    a.send({ t: 'start' });
    const random = seeded(2);
    for (let turn = 0; turn < 600; turn++) {
      // Each browser acts now and then; b sends actions claiming to be player 0, which the server must correct.
      if (turn % 7 === 0) a.send({ t: 'action', action: { type: 'build', player: 0, tower: 'archer', x: 1 + (turn % 3), y: 2 + (turn % 5) } });
      if (turn % 11 === 0) b.send({ t: 'action', action: { type: 'build', player: 0, tower: 'barracks', x: 20 - (turn % 3), y: 3 + (turn % 7) } });
      if (turn % 90 === 0) { a.send({ t: 'action', action: { type: 'launch', player: 0, target: 1 } }); b.send({ t: 'action', action: { type: 'launch', player: 1, target: 0 } }); }
      if (turn % 45 === 0) a.send({ t: 'action', action: { type: 'sell', player: 0, x: 1, y: 2 } });
      room.turn();
      // Messages arrive late and in bursts.
      if (random() < 0.5) a.catchUp();
      if (random() < 0.3) b.catchUp();
    }
    a.catchUp(); b.catchUp();
    expect(a.state.tick).toBe(b.state.tick);
    expect(a.state.towers.some((t) => t.player === 1)).toBe(true);
    expect(fingerprint(a.state)).toBe(fingerprint(b.state));
    expect(a.desync || b.desync).toBe(false);
  });

  it('catches up a tab that was hidden, and a browser that reconnects mid-match', () => {
    const room = new RoomCore(seeded(3));
    room.mode = 'ffa';
    room.seats = [null, null, null];
    const [a, b, c] = ['a', 'b', 'c'].map((id) => new FakeBrowser(id, room));
    a.connect(); b.connect();
    a.send({ t: 'mode', mode: 'ffa' });
    a.send({ t: 'start' }); // seat 2 is a bot
    for (let turn = 0; turn < 900; turn++) {
      if (turn % 13 === 0) a.send({ t: 'action', action: { type: 'build', player: 0, tower: 'archer', x: 3, y: 10 + (turn % 3) } });
      if (turn % 17 === 0) b.send({ t: 'action', action: { type: 'build', player: 1, tower: 'archer', x: 19, y: 10 + (turn % 3) } });
      if (turn % 120 === 0) b.send({ t: 'action', action: { type: 'launch', player: 1, target: 2 } });
      room.turn();
      a.catchUp();
      // b's tab is hidden for a while: messages pile up unread.
      if (turn < 200 || turn > 400) b.catchUp();
      // b drops off and comes back; c joins late to watch.
      if (turn === 500) { room.leave('b'); b.inbox = []; b.game = null; }
      if (turn === 520) b.connect();
      if (turn === 600) c.connect();
      if (turn >= 600) c.catchUp();
    }
    for (const x of [a, b, c]) x.catchUp();
    expect(b.seat).toBe(1);
    expect(c.seat).toBeNull();
    expect(fingerprint(b.state)).toBe(fingerprint(a.state));
    expect(fingerprint(c.state)).toBe(fingerprint(a.state));
    expect([a, b, c].some((x) => x.desync)).toBe(false);
  });

  it('spots a desync from fingerprints', () => {
    const room = new RoomCore(seeded(4));
    const [a, b] = [new FakeBrowser('a', room), new FakeBrowser('b', room)];
    a.connect(); b.connect();
    a.send({ t: 'start' });
    a.send({ t: 'fingerprint', tick: 0, fingerprint: 'aaaa' });
    b.send({ t: 'fingerprint', tick: 0, fingerprint: 'bbbb' });
    a.catchUp();
    expect(a.desync).toBe(true);
  });

  it('turns away a different version of the game, and only lets the host start', () => {
    const room = new RoomCore(seeded(5));
    const [a, b] = [new FakeBrowser('a', room), new FakeBrowser('b', room)];
    a.connect('v1');
    expect(b.connect('v2')).toBe(false);
    expect(b.inbox).toContainEqual(expect.objectContaining({ t: 'error' }));
    expect(b.connect('v1')).toBe(true);
    b.send({ t: 'start' });
    expect(room.phase).toBe('lobby');
    a.send({ t: 'start' });
    expect(room.phase).toBe('playing');
  });
});
