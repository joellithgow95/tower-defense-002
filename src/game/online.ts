/** The browser's connection to a room: a WebSocket that reconnects by itself and keeps its seat. */
import type { ClientMessage, ServerMessage } from '../net/protocol';

export const ROOM_CODE = /^[a-z0-9]{4,12}$/;

/** A fresh room code, like "k7q2x". */
export function newRoomCode() {
  const letters = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => letters[b % letters.length]).join('');
}

/** An id this tab keeps for the room, so reloading or reconnecting gets the same seat back. */
function clientId(room: string) {
  const key = `client:${room}`;
  try {
    const saved = sessionStorage.getItem(key);
    if (saved) return saved;
    const id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
    return id;
  } catch { return crypto.randomUUID(); }
}

export function connect(room: string, name: string, onMessage: (m: ServerMessage) => void, onStatus: (connected: boolean, why?: string) => void) {
  const client = clientId(room);
  let socket: WebSocket | null = null, retry = 0, stopped = false;

  function open() {
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/room/${room}`;
    const ws = (socket = new WebSocket(url));
    ws.onopen = () => {
      retry = 0;
      ws.send(JSON.stringify({ t: 'hello', client, name, build: __BUILD__ } satisfies ClientMessage));
      onStatus(true);
    };
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data) as ServerMessage;
      if (m.t === 'error') stopped = true;
      onMessage(m);
    };
    ws.onclose = (e) => {
      if (socket !== ws) return;
      // Refused (wrong version, full room) or replaced by another tab: don't keep retrying.
      if (stopped || e.code === 1008 || e.reason === 'Opened in another tab') { onStatus(false, e.reason || 'Disconnected'); return; }
      onStatus(false);
      setTimeout(open, Math.min(500 * 2 ** retry++, 5000));
    };
  }
  open();
  return {
    send(m: ClientMessage) { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(m)); },
  };
}
