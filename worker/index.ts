/**
 * The online server, on Cloudflare. Pages and assets come straight from dist/; only /room/<code> reaches this code.
 * Each room is a Durable Object: one small, single-threaded server per room code that holds the players'
 * connections and the turn clock. The game rules live in src/net/room.ts; this file only moves messages.
 */
import { DurableObject } from 'cloudflare:workers';
import type { ClientMessage, ServerMessage } from '../src/net/protocol';
import { TURN_MS } from '../src/net/protocol';
import { RoomCore } from '../src/net/room';

interface Env { ROOMS: DurableObjectNamespace<Room> }

/** Room codes are short lowercase letters and digits, e.g. /room/k7q2x. */
const ROOM_PATH = /^\/room\/([a-z0-9]{4,12})$/;
const MAX_MESSAGE = 2048;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const match = new URL(request.url).pathname.match(ROOM_PATH);
    if (!match) return new Response('Not found', { status: 404 });
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    return env.ROOMS.get(env.ROOMS.idFromName(match[1])).fetch(request);
  },
} satisfies ExportedHandler<Env>;

export class Room extends DurableObject<Env> {
  private core = new RoomCore();
  /** The socket each client id is currently using; a reconnect replaces the old one. */
  private sockets = new Map<string, WebSocket>();
  private clock: ReturnType<typeof setInterval> | null = null;

  async fetch(): Promise<Response> {
    const { 0: browser, 1: server } = new WebSocketPair();
    server.accept();
    let client: string | null = null;
    const send = (m: ServerMessage) => { try { server.send(JSON.stringify(m)); } catch { /* already closed */ } };

    server.addEventListener('message', (event) => {
      if (typeof event.data !== 'string' || event.data.length > MAX_MESSAGE) return;
      let m: ClientMessage;
      try { m = JSON.parse(event.data); } catch { return; }
      if (client === null) {
        if (m.t !== 'hello' || typeof m.client !== 'string' || !/^[a-z0-9-]{8,64}$/.test(m.client)) return server.close(1008, 'Say hello first');
        const old = this.sockets.get(m.client);
        if (!this.core.join(m.client, String(m.name ?? ''), String(m.build ?? ''), send)) return server.close(1008, 'Refused');
        client = m.client;
        this.sockets.set(client, server);
        if (old && old !== server) try { old.close(1000, 'Opened in another tab'); } catch { /* gone */ }
      } else {
        this.core.receive(client, m);
      }
      this.updateClock();
    });
    const gone = () => {
      // A reconnect may already have replaced this socket; only the current one counts.
      if (client !== null && this.sockets.get(client) === server) {
        this.sockets.delete(client);
        this.core.leave(client);
      }
      this.updateClock();
    };
    server.addEventListener('close', gone);
    server.addEventListener('error', gone);
    return new Response(null, { status: 101, webSocket: browser });
  }

  /** Tick only during a match with someone connected, so an empty room costs nothing and pauses. */
  private updateClock() {
    if (this.core.running && !this.clock) this.clock = setInterval(() => { this.core.turn(); this.updateClock(); }, TURN_MS);
    else if (!this.core.running && this.clock) { clearInterval(this.clock); this.clock = null; }
  }
}
