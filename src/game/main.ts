/**
 * Connects the player, the bots or the online room, the rules and the picture.
 * Offline (no ?room= in the address) you are player 0 against bots. Online, src/net/lockstep.ts runs the
 * match only as far as the room's server has confirmed, so every browser sees the same game.
 */
import { createBot } from '../core/bot';
import { type Mode, modes } from '../core/config';
import { Match, fingerprint } from '../core/match';
import { TICKS_PER_SECOND, alive, checkBuild, enemies, players } from '../core/sim';
import type { Action, Config, GameEvent, Player, Refusal, State } from '../core/types';
import { problems } from '../core/validate';
import { Lockstep } from '../net/lockstep';
import { MAX_NAME, type ServerMessage, TURN_TICKS } from '../net/protocol';
import { PLAYER_COLORS } from './models';
import { ROOM_CODE, connect, newRoomCode } from './online';
import { createView } from './view';

const $ = (id: string) => document.getElementById(id)!;
const canvas = $('board') as HTMLCanvasElement;
for (const [id, mode] of Object.entries(modes)) {
  const mistakes = problems(mode.config);
  if (mistakes.length) {
    $('message').textContent = mistakes.join(' ');
    throw new Error(`${id}: ${mistakes.join('\n')}`);
  }
}

const view = createView(canvas);
const roomParam = new URLSearchParams(location.search).get('room');
const roomCode = roomParam && ROOM_CODE.test(roomParam) ? roomParam : null;

/** Which player you are: always 0 offline; online, your seat, or -1 while watching. */
let me: Player = 0;
let mode: Mode = 'duel', config: Config = modes.duel.config;
let match: Match = new Match(config);
let bots: ((s: State, cfg: Config) => Action[])[] = [], paused = false, queued: Action[] = [];
let target: Player = -1;
let selected = Object.keys(modes.duel.config.content.towers)[0];
let hover: { x: number; y: number } | null = null;
let messageUntil = 0;

// Online only.
let room: Extract<ServerMessage, { t: 'room' }> | null = null;
let lock: Lockstep | null = null;
let net: ReturnType<typeof connect> | null = null;

const reasons = (): Record<Refusal, string> => ({
  'game-over': 'The match is over.',
  'knocked-out': 'Your castle has fallen. You can watch the rest of the match.',
  'unknown-tower': 'That tower does not exist.',
  outside: 'That is off the board.',
  'not-your-land': `Build within ${config.rules.buildRadius} cells of your castle or one of your buildings.`,
  'near-enemy-castle': 'Too close to an enemy castle.',
  occupied: 'Something is already there.',
  'no-gold': 'Not enough gold yet.',
  'blocks-route': 'That would wall someone in. Leave a route open.',
  'nothing-to-sell': 'Point at one of your towers to sell it.',
  'empty-garrison': 'Your castle has no troops yet. Build a Barracks or Knight Hall to train some.',
  'bad-target': 'You can only attack an enemy castle that is still standing.',
});

function say(text: string, seconds = 2.5) {
  $('message').textContent = text;
  messageUntil = performance.now() + seconds * 1000;
}

function name(p: Player) {
  if (room) return `${room.seats[p]?.name ?? 'Bot'}${p === me ? ' (you)' : ''}`;
  return p === me ? 'You' : enemies(match.state, me, p) ? `Bot ${p + 1}` : `Ally ${p + 1}`;
}
const colorOf = (p: Player) => `#${PLAYER_COLORS[p].toString(16).padStart(6, '0')}`;
/** Enemies you can still attack; none once your own castle has fallen, or while you watch. */
const foes = (s: State) => (me >= 0 && alive(s, me) ? players(s).filter((p) => alive(s, p) && enemies(s, me, p)) : []);

/** Aim at the next standing enemy after the current one. */
function cycleTarget() {
  const list = foes(match.state);
  if (!list.length) return;
  target = list[(list.indexOf(target) + 1) % list.length];
}

/** One badge per player, allies side by side: name, castle health and waiting troops, plus your gold. */
let badges: { p: Player; el: HTMLElement; text: HTMLElement }[] = [];
function buildBadges() {
  const box = $('players');
  box.replaceChildren();
  badges = [];
  [...new Set(config.teams)].forEach((team, i) => {
    if (i) box.append(Object.assign(document.createElement('span'), { className: 'vs', textContent: 'vs' }));
    for (const p of players(match.state).filter((q) => config.teams[q] === team)) {
      const el = document.createElement('button');
      el.className = 'side';
      el.style.borderColor = colorOf(p);
      el.onclick = () => { if (foes(match.state).includes(p)) target = p; };
      const text = document.createElement('span');
      el.append(Object.assign(document.createElement('b'), { textContent: name(p) }), text);
      box.append(el);
      badges.push({ p, el, text });
    }
  });
}

/** Show a match (or, in an online lobby, the board you are about to play on). */
function show(next: Match, nextConfig: Config) {
  match = next;
  config = nextConfig;
  target = -1;
  cycleTarget();
  view.reset(match.state);
  buildBadges();
}

function restart(next: Mode = mode) {
  if (room) {
    if (room.host && room.phase === 'playing') net!.send({ t: 'lobby' });
    else if (room.phase === 'playing') say('Only the host can end the match.');
    return;
  }
  mode = next;
  const seed = Date.now();
  show(new Match(modes[mode].config), modes[mode].config);
  bots = players(match.state).filter((p) => p !== me).map((p) => createBot(p, seed + p));
  queued = [];
  paused = false;
  ($('mode') as HTMLSelectElement).value = mode;
  try { localStorage.setItem('mode', mode); } catch { /* private window: just don't remember */ }
  const aim = foes(match.state).length > 1 ? ' Click an enemy castle (or press T) to pick who to attack.' : '';
  say(`Build on your land (blue): towers are walls, Barracks and Knight Halls train troops. Press Space to launch them.${aim}`, 8);
}

/** Your move: offline it waits for the next tick; online it goes to the server, which stamps it with a tick. */
function act(action: Action) {
  if (me < 0) return;
  if (net) net.send({ t: 'action', action });
  else queued.push(action);
}

const cards = Object.entries(modes.duel.config.content.towers).map(([id, def], i) => {
  const button = document.createElement('button');
  const key = Object.assign(document.createElement('kbd'), { textContent: String(i + 1) });
  const cost = Object.assign(document.createElement('small'), { textContent: `${def.cost} gold` });
  button.append(def.label, ' ', key, document.createElement('br'), cost);
  button.onclick = () => (selected = id);
  $('cards').append(button);
  return { id, def, button };
});

const modeSelect = $('mode') as HTMLSelectElement;
for (const [id, m] of Object.entries(modes)) modeSelect.append(new Option(m.label, id));
modeSelect.onchange = () => { restart(modeSelect.value as Mode); modeSelect.blur(); };

const sell = () => hover && act({ type: 'sell', player: me, ...hover });
const launch = () => target >= 0 && act({ type: 'launch', player: me, target });
const togglePause = () => { if (net) return; paused = !paused; say(paused ? 'Paused' : 'Go!', paused ? 1e6 : 1); };
$('pause').onclick = togglePause;
$('restart').onclick = () => restart();
$('sell').onclick = () => say('Point at one of your towers and press X.');
$('launch').onclick = () => !paused && launch();
$('online').onclick = () => { location.search = net ? '' : `?room=${newRoomCode()}`; };
$('report').onclick = async () => {
  const report = JSON.stringify({ ...match.replay(__BUILD__), fingerprint: fingerprint(match.state) });
  try { await navigator.clipboard.writeText(report); say('Bug report copied. Paste it into a new GitHub issue.', 5); }
  catch { prompt('Copy this bug report:', report); }
};

canvas.addEventListener('pointermove', (e) => (hover = view.cellAt(e.clientX, e.clientY)));
canvas.addEventListener('pointerleave', () => (hover = null));
canvas.addEventListener('pointerdown', (e) => {
  hover = view.cellAt(e.clientX, e.clientY);
  if (e.button !== 0 || !hover || paused) return;
  // Clicking an enemy castle aims at it; anywhere else, it builds.
  const castle = match.state.bases.indexOf(hover.y * match.state.width + hover.x);
  if (castle >= 0 && foes(match.state).includes(castle)) target = castle;
  else act({ type: 'build', player: me, tower: selected, ...hover });
});
addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement) return;
  const key = e.key.toLowerCase();
  if (key === 'x' && !paused) sell();
  if (key === ' ') { e.preventDefault(); if (!paused) launch(); }
  if (key === 't') cycleTarget();
  if (key === 'p') togglePause();
  if (key === 'r') restart();
  const card = cards[Number(key) - 1];
  if (card) selected = card.id;
});

/** "6 Soldiers, 2 Knights": what is waiting in a castle. */
function armyText(garrison: Record<string, number>) {
  const parts = Object.entries(garrison).filter(([, n]) => n > 0).map(([id, n]) => `${n} ${config.content.troops[id].label}${n === 1 ? '' : 's'}`);
  return parts.join(', ') || 'no troops';
}

function winText(winner: number | 'draw') {
  const again = room ? (room.host ? ' Press R for the lobby.' : '') : ' Press R to play again.';
  if (winner === 'draw') return `A draw.${again}`;
  const winners = players(match.state).filter((p) => config.teams[p] === winner);
  if (me >= 0 && winner === config.teams[me]) return `${winners.length > 1 ? 'Your team wins!' : 'You win!'}${again}`;
  return `${winners.map(name).join(' and ')} win${winners.length > 1 ? '' : 's'}.${again}`;
}

/** What one tick did, as you see it. */
function react(events: GameEvent[], wasAlive: boolean) {
  view.show(events);
  const why = reasons();
  for (const e of events) if (e.type === 'refused' && e.action.player === me) say(why[e.reason]);
  if (wasAlive && !alive(match.state, me)) say('Your castle has fallen! Your buildings are ruins now. Watch how it ends.', 6);
  if (match.state.winner !== null) say(winText(match.state.winner), 1e6);
}

// ---------- Online: the lobby and the connection ----------

const lobby = $('lobby');
function drawLobby() {
  if (!room) return;
  lobby.hidden = room.phase !== 'lobby';
  $('room-code').textContent = roomCode!;
  const roomMode = $('room-mode') as HTMLSelectElement;
  roomMode.value = room.mode;
  roomMode.disabled = !room.host;
  ($('start') as HTMLButtonElement).hidden = !room.host;
  $('lobby-note').textContent = room.host ? 'Empty seats are played by bots.' : 'Waiting for the host to start. Empty seats are played by bots.';
  const list = $('seats');
  list.replaceChildren();
  room.seats.forEach((seat, p) => {
    const li = document.createElement('li');
    li.style.borderColor = colorOf(p);
    const teamOf = modes[room!.mode].config.teams[p];
    li.append(Object.assign(document.createElement('b'), { textContent: seat.name ?? 'Bot' }), ` · team ${teamOf + 1}${seat.name && !seat.online ? ' · away' : ''}`);
    if (p === room!.you) li.append(button('Stand up', () => net!.send({ t: 'sit', seat: null })));
    else if (!seat.name) li.append(button('Sit here', () => net!.send({ t: 'sit', seat: p })));
    list.append(li);
  });
  $('watching').textContent = room.watching.length ? `Watching: ${room.watching.join(', ')}` : '';
}
const button = (text: string, onclick: () => void) => Object.assign(document.createElement('button'), { textContent: text, onclick });

function onServer(m: ServerMessage) {
  if (m.t === 'room') {
    const lobbyChanged = !room || room.mode !== m.mode || room.phase !== m.phase;
    room = m;
    me = m.you ?? -1;
    if (m.phase === 'lobby' && lobbyChanged) { lock = null; show(new Match(modes[m.mode].config), modes[m.mode].config); }
    else buildBadges();
    drawLobby();
  } else if (m.t === 'start') {
    lock = new Lockstep(m);
    show(lock.match, lock.config);
    say(me >= 0 ? 'Go! Space launches your troops; click an enemy castle (or press T) to aim.' : 'You are watching this match.', 6);
  } else if (m.t === 'turn') {
    lock?.receive(m);
  } else if (m.t === 'desync') {
    say('Out of sync with the other players. Please press "Copy bug report" and post it in a GitHub issue.', 1e6);
  } else if (m.t === 'error') {
    say(m.message, 1e6);
    lobby.hidden = true;
  }
}

if (roomCode) {
  let saved = '';
  try { saved = localStorage.getItem('name') ?? ''; } catch { /* no storage */ }
  const nameInput = $('name') as HTMLInputElement;
  nameInput.maxLength = MAX_NAME;
  nameInput.value = saved || `Player ${Math.floor(Math.random() * 90) + 10}`;
  try { localStorage.setItem('name', nameInput.value); } catch { /* no storage */ }
  nameInput.onchange = () => {
    try { localStorage.setItem('name', nameInput.value); } catch { /* no storage */ }
    net!.send({ t: 'name', name: nameInput.value });
  };
  const roomMode = $('room-mode') as HTMLSelectElement;
  for (const [id, m] of Object.entries(modes)) roomMode.append(new Option(m.label, id));
  roomMode.onchange = () => net!.send({ t: 'mode', mode: roomMode.value as Mode });
  $('start').onclick = () => net!.send({ t: 'start' });
  $('copy-link').onclick = async () => {
    try { await navigator.clipboard.writeText(location.href); say('Link copied. Send it to your friends.'); }
    catch { prompt('Send your friends this link:', location.href); }
  };
  for (const id of ['mode', 'pause']) $(id).hidden = true;
  $('online').textContent = 'Leave room';
  net = connect(roomCode, nameInput.value, onServer, (connected, why) => {
    if (!connected) say(why ? `${why}.` : 'Connection lost. Reconnecting…', why ? 1e6 : 30);
    else if (performance.now() < messageUntil && $('message').textContent?.startsWith('Connection lost')) say('Back online.', 2);
  });
  me = -1;
  show(match, config);
} else {
  try { const saved = localStorage.getItem('mode'); if (saved && saved in modes) mode = saved as Mode; } catch { /* use the default */ }
  restart();
}

// ---------- The loop ----------

const TICK = 1 / TICKS_PER_SECOND;
let last = performance.now(), owed = 0;
function loop(now: number) {
  const seconds = Math.min((now - last) / 1000, 0.25);
  last = now;
  if (lock) runOnline(seconds);
  else if (!net) runOffline(seconds);
  draw(now, seconds);
  requestAnimationFrame(loop);
}

/** Offline: fixed ticks however fast the screen draws. Time spent in a hidden tab is dropped. */
function runOffline(seconds: number) {
  if (!paused) owed += seconds;
  while (owed >= TICK) {
    owed -= TICK;
    if (match.state.winner !== null) continue;
    const wasAlive = alive(match.state, me);
    react(match.step([...queued.splice(0), ...bots.flatMap((bot) => bot(match.state, config))]), wasAlive);
  }
}

/**
 * Online: run only ticks the server has confirmed, at normal speed. If we fall well behind
 * (a hidden tab, a reconnect, a slow frame) we race through the backlog without drawing effects.
 */
function runOnline(seconds: number) {
  const behind = lock!.behind;
  let steps: number;
  const racing = behind > 3 * TURN_TICKS;
  if (racing) { steps = Math.min(behind - TURN_TICKS, 1200); owed = 0; }
  else { owed = Math.min(owed + seconds * TICKS_PER_SECOND, 2 * TURN_TICKS); steps = Math.min(Math.floor(owed), behind); owed -= steps; }
  for (let i = 0; i < steps; i++) {
    const wasAlive = me >= 0 && alive(match.state, me);
    const result = lock!.step();
    if (!result) break;
    if (result.report) net!.send({ t: 'fingerprint', ...result.report });
    if (racing) { if (match.state.winner !== null) say(winText(match.state.winner), 1e6); }
    else react(result.events, wasAlive);
  }
}

function draw(now: number, seconds: number) {
  const s = match.state;
  if (!foes(s).includes(target)) { target = -1; cycleTarget(); }
  for (const { p, el, text } of badges) {
    const gold = p === me ? ` · ● ${s.gold[p]} gold` : '';
    text.textContent = alive(s, p) ? `♥ ${s.baseHealth[p]}${gold} · ⚔ ${armyText(s.garrison[p])}` : 'fallen';
    el.classList.toggle('target', p === target);
    el.classList.toggle('fallen', !alive(s, p));
  }
  for (const c of cards) {
    c.button.setAttribute('aria-pressed', String(c.id === selected));
    c.button.classList.toggle('poor', me < 0 || s.gold[me] < c.def.cost);
  }
  if (now > messageUntil) $('message').textContent = '';
  const own = hover && s.towers.find((t) => t.cell === hover!.y * s.width + hover!.x);
  const def = config.content.towers[own ? own.id : selected];
  const ok = me >= 0 && (!!own || !checkBuild(s, config, me, selected, hover?.x ?? -1, hover?.y ?? -1));
  view.highlight(hover, ok, def.kind === 'shooter' ? def.range / 1000 : 0);
  view.draw(s, config, paused ? 0 : seconds, me, target);
}
requestAnimationFrame(loop);
