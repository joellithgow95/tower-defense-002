/**
 * Connects the player, the bots or the online room, the rules and the picture.
 * Offline (no ?room= in the address) you are player 0 against bots. Online, src/net/lockstep.ts runs the
 * match only as far as the room's server has confirmed, so every browser sees the same game.
 */
import { createBot } from '../core/bot';
import { type Mode, modes } from '../core/config';
import { Match, fingerprint } from '../core/match';
import { CELL, TICKS_PER_SECOND, alive, checkBuild, defaultSpirits, enemies, players, withSpirits, withinReach } from '../core/sim';
import spiritContent from '../../content/spirits.json';
import type { Action, Config, GameEvent, Player, Refusal, SpiritDef, SpiritMode, State } from '../core/types';
import { problems } from '../core/validate';
import { Lockstep } from '../net/lockstep';
import { MAX_NAME, type ServerMessage, TURN_TICKS } from '../net/protocol';
import { BUTTON_LABELS, SELECT_BUTTON, SETTINGS_BUTTON, defaults, loadPreferences, type ControllerPreferences } from './controller-preferences';
import { createControllerSettings } from './controller-settings';
import { createSingleGamepadInput } from './gamepad';
import { createLocalControllers } from './local-controllers';
import { PLAYER_COLORS } from './models';
import { ROOM_CODE, connect, newRoomCode } from './online';
import { type LocalSpirit, createView } from './view';

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
const gamepad = createSingleGamepadInput();
const controllers = createLocalControllers();
const settings = createControllerSettings($('controller-settings') as HTMLDialogElement, suspendControllers);
const soloProfile = loadPreferences();
const joinProfile = defaults();
const localProfiles = new Map<Player, ControllerPreferences>();
const controllerHelp = $('controller-help');
let local = false, joining = false;

function profileFor(seat?: Player) {
  if (!local) return soloProfile;
  if (seat === undefined) return joinProfile;
  let profile = localProfiles.get(seat);
  if (!profile) {
    profile = loadPreferences(seat);
    localProfiles.set(seat, profile);
  }
  return profile;
}

$('controller-open').onclick = () => settings.open(profileFor(me), local ? me : undefined);
function suspendControllers() {
  gamepad.suspend();
  controllers.suspend();
  stopWalking();
}

const roomParam = new URLSearchParams(location.search).get('room');
const roomCode = roomParam && ROOM_CODE.test(roomParam) ? roomParam : null;

/** Which player you are: always 0 offline; online, your seat, or -1 while watching. */
let me: Player = 0;
let mode: Mode = 'duel', config: Config = modes.duel.config;
let match: Match = new Match(config);
let bots: ((s: State, cfg: Config) => Action[])[] = [], paused = false, queued: Action[] = [];
let target: Player = -1;
let selected = Object.keys(modes.duel.config.content.towers)[0];
type Cell = { x: number; y: number };
let hover: Cell | null = null;
let messageUntil = 0;
let controllerActive = false;
let cursor: Cell = { x: 0, y: 0 };
let owed = 0;
type Dir = { x: number; y: number };
/** `held` is the walking direction last sent for this seat. */
type Seat = { target: Player; selected: string; cursor: Cell; held: Dir };
let seats: Seat[] = [];

// Spirits. The match state is the truth; `spiritModes` is what this screen last asked for, so a quick
// second press of Q flips back even before the server has confirmed the first.
const spiritList = spiritContent as Record<string, SpiritDef>;
let mySpirit = Object.keys(spiritList)[0];
let localSpirits: string[] = [];
let spiritModes: SpiritMode[] = [];
const keysDown = new Set<string>();
let padHeld: Dir = { x: 0, y: 0 };
let sentHeld: Dir = { x: 0, y: 0 };
const STILL: Dir = { x: 0, y: 0 };
const WALK_KEYS: Record<string, Dir> = {
  w: { x: 0, y: -1 }, arrowup: { x: 0, y: -1 }, s: { x: 0, y: 1 }, arrowdown: { x: 0, y: 1 },
  a: { x: -1, y: 0 }, arrowleft: { x: -1, y: 0 }, d: { x: 1, y: 0 }, arrowright: { x: 1, y: 0 },
};

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
  'not-in-kit': 'Your spirit\'s followers can\'t build that.',
  'needs-cursor': 'Fly as the wisp to build (Q).',
  'needs-walk': 'Walk to do that (Q).',
  'out-of-reach': 'Walk closer: that is out of your spirit\'s reach.',
  'bad-move': 'That move is not allowed.',
});

function say(text: string, seconds = 2.5) {
  $('message').textContent = text;
  messageUntil = performance.now() + seconds * 1000;
}

const human = (p: Player) => local ? controllers.seat(p) !== null : p === me;

function name(p: Player) {
  if (local) return human(p) ? `Player ${p + 1}` : `Bot ${p + 1}`;
  if (room) return `${room.seats[p]?.name ?? 'Bot'}${p === me ? ' (you)' : ''}`;
  return p === me ? 'You' : enemies(match.state, me, p) ? `Bot ${p + 1}` : `Ally ${p + 1}`;
}
const colorOf = (p: Player) => `#${PLAYER_COLORS[p].toString(16).padStart(6, '0')}`;
/** Enemies you can still attack; none once your own castle has fallen, or while you watch. */
const foes = (s: State, player: Player = me) => (player >= 0 && alive(s, player) ? players(s).filter((p) => alive(s, p) && enemies(s, player, p)) : []);

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
      el.onclick = () => { if (!local && foes(match.state).includes(p)) target = p; };
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
  // The controller cursor starts on your castle.
  const { bases, width } = match.state, home = bases[Math.max(me, 0)];
  if (local) {
    const firstTower = Object.keys(config.content.towers)[0];
    seats = bases.map((cell, player) => ({
      target: foes(match.state, player)[0] ?? -1,
      selected: kitOf(player).includes(firstTower) ? firstTower : kitOf(player)[0],
      cursor: { x: cell % width, y: Math.floor(cell / width) },
      held: { ...STILL },
    }));
  }
  spiritModes = match.state.spirits.map((sp) => sp.mode);
  keysDown.clear();
  padHeld = { ...STILL };
  sentHeld = { ...STILL };
  showKit();
  cursor = { x: home % width, y: Math.floor(home / width) };
  if (controllerActive) hover = cursor;
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
  const nextConfig = spiritConfig(mode);
  show(new Match(nextConfig), nextConfig);
  bots = players(match.state).map((p) => createBot(p, seed + p));
  queued = [];
  owed = 0;
  paused = false;
  ($('mode') as HTMLSelectElement).value = mode;
  if (local) { say(''); return; }
  try { localStorage.setItem('mode', mode); } catch { /* private window: just don't remember */ }
  const aim = foes(match.state).length > 1 ? ' Click an enemy castle (or press T) to pick who to attack.' : '';
  say(`You are the ${spiritList[mySpirit].label}. Walk with WASD or the arrows. Press Q to fly as a wisp and build on your land (blue). Walk back to your castle and press Space to launch your troops.${aim}`, 10);
}

/** A mode's config with this screen's spirit choices: yours offline, each seat's in local multiplayer. */
function spiritConfig(next: Mode): Config {
  const base = modes[next].config;
  const spirits = defaultSpirits(base.teams.length);
  if (local) localSpirits.forEach((id, p) => { if (p < spirits.length) spirits[p] = id; });
  else spirits[0] = mySpirit;
  return withSpirits(base, spirits);
}

/** The towers a player's spirit can build. */
const kitOf = (p: Player) => config.content.spirits[match.state.spirits[Math.max(p, 0)].id].kit;
const spiritLabel = (p: Player) => config.content.spirits[match.state.spirits[p].id].label;
/** The cell under a spirit's body, where its wisp sets off from. */
function bodyCell(p: Player): Cell {
  const sp = match.state.spirits[p];
  return { x: Math.round(sp.x / CELL), y: Math.round(sp.y / CELL) };
}
const walking = (p: Player = me) => p >= 0 && spiritModes[p] === 'walk';

/** Only your spirit's towers get a card, numbered 1, 2, 3 in order. */
function showKit() {
  const kit = kitOf(me);
  let n = 0;
  for (const c of cards) {
    c.button.hidden = local || !kit.includes(c.id);
    if (!c.button.hidden) c.key.textContent = String(++n);
  }
  if (!kit.includes(selected)) selected = kit[0];
}
const kitCards = () => cards.filter((c) => !c.button.hidden);

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
  return { id, def, button, key };
});

const modeSelect = $('mode') as HTMLSelectElement;
for (const [id, m] of Object.entries(modes)) modeSelect.append(new Option(m.label, id));
modeSelect.onchange = () => {
  const next = modeSelect.value as Mode;
  if (local) enterLobby(next);
  else restart(next);
  modeSelect.blur();
};

const spiritSelect = $('spirit') as HTMLSelectElement;
const spiritOptions = (select: HTMLSelectElement) => {
  for (const [id, sp] of Object.entries(spiritList)) select.append(Object.assign(new Option(sp.label, id), { title: `${sp.about} ${sp.passive}` }));
};
spiritOptions(spiritSelect);
try { const saved = localStorage.getItem('spirit'); if (saved && saved in spiritList) mySpirit = saved; } catch { /* use the default */ }
spiritSelect.value = mySpirit;
spiritSelect.onchange = () => {
  mySpirit = spiritSelect.value;
  try { localStorage.setItem('spirit', mySpirit); } catch { /* private window: just don't remember */ }
  spiritSelect.blur();
  restart();
};

function enterLobby(next: Mode) {
  joining = true;
  localSpirits = defaultSpirits(modes[next].config.teams.length);
  controllers.reset(modes[next].config.teams.length);
  controllerActive = false;
  hover = null;
  restart(next);
  $('restart').textContent = 'Start match';
  ($('restart') as HTMLButtonElement).disabled = true;
}

function startMatch() {
  if (joining && !controllers.humans()) return;
  joining = false;
  $('restart').textContent = 'Restart';
  ($('restart') as HTMLButtonElement).disabled = false;
  controllers.suspend();
  restart();
}

$('local').onclick = () => {
  local = !local;
  document.body.classList.toggle('local', local);
  suspendControllers();
  $('controller-open').textContent = local ? 'Player 1 controller settings' : 'Controller settings';
  for (const id of ['cards', 'launch', 'sell', 'spirit']) $(id).hidden = local;
  $('local').textContent = local ? 'Solo play' : 'Local multiplayer';
  if (local) enterLobby('fourWay');
  else {
    joining = false;
    controllers.reset(0);
    startMatch();
  }
};

function build() {
  if (hover && !paused) act({ type: 'build', player: me, tower: selected, ...hover });
}
/** Sell the nearest of your buildings within your spirit's reach. */
function sell() {
  if (me < 0 || paused) return;
  const action = sellNearby(me);
  if (typeof action === 'string') say(action);
  else act(action);
}
function sellNearby(p: Player): Action | string {
  if (!walking(p)) return 'Walk to one of your buildings to sell it (Q to walk).';
  const near = withinReach(match.state, config, p).find((r) => r.kind === 'building');
  if (!near) return 'Walk up to one of your buildings to sell it.';
  return { type: 'sell', player: p, x: near.cell % match.state.width, y: Math.floor(near.cell / match.state.width) };
}
function launch() {
  if (target >= 0 && !paused) act({ type: 'launch', player: me, target });
}
/**
 * Use the nearest thing your spirit can reach. Today that is only your castle, which launches;
 * sluices and calling stones will join `withinReach` in src/core/sim.ts and get their own action here.
 */
function interact() {
  if (me < 0 || paused) return;
  if (!walking()) { say('Walk to use things (Q to walk).'); return; }
  const near = withinReach(match.state, config, me).find((r) => r.kind === 'castle');
  if (near) launch();
  else say('Walk to your castle to launch your troops.');
}

/** Walk or fly. The body stops when the wisp takes off; the wisp sets off from where the body stands. */
function toggleMode() {
  if (me < 0 || paused || !alive(match.state, me) || match.state.winner !== null) return;
  const next: SpiritMode = walking() ? 'cursor' : 'walk';
  spiritModes[me] = next;
  act({ type: 'spirit-mode', player: me, mode: next });
  sentHeld = { ...STILL };
  if (next === 'cursor') {
    cursor = bodyCell(me);
    if (controllerActive) hover = cursor;
  } else syncHeld();
}

/** The direction you are holding: the controller's, or else the keys'. */
function heldNow(): Dir {
  let x = padHeld.x, y = padHeld.y;
  if (!x && !y) for (const key of keysDown) { x += WALK_KEYS[key].x; y += WALK_KEYS[key].y; }
  return { x: Math.sign(x), y: Math.sign(y) };
}

/** Send your walking direction, only when it changes: a held key costs one action, not one per tick. */
function syncHeld() {
  if (me < 0 || !walking() || paused || !alive(match.state, me)) return;
  const held = heldNow();
  if (held.x === sentHeld.x && held.y === sentHeld.y) return;
  sentHeld = held;
  act({ type: 'spirit-move', player: me, ...held });
}

/** Let go of everything, so a missed key-up can't leave a spirit walking on its own. */
function stopWalking() {
  keysDown.clear();
  padHeld = { ...STILL };
  if (me >= 0 && (sentHeld.x || sentHeld.y)) act({ type: 'spirit-move', player: me, x: 0, y: 0 });
  sentHeld = { ...STILL };
  if (!local) return;
  seats.forEach((seat, player) => {
    if (seat.held.x || seat.held.y) queued.push({ type: 'spirit-move', player, x: 0, y: 0 });
    seat.held = { ...STILL };
  });
}
/** Offline only: an online match can't pause for one player. */
function togglePause() {
  if (net || joining || controllers.disconnected() || match.state.winner !== null) return;
  if (!paused) stopWalking();
  paused = !paused;
  say(paused ? 'Paused' : 'Go!', paused ? 1e6 : 1);
}
$('pause').onclick = togglePause;
$('restart').onclick = () => local ? startMatch() : restart();
$('sell').onclick = sell;
$('launch').onclick = launch;
$('online').onclick = () => { location.search = net ? '' : `?room=${newRoomCode()}`; };
$('report').onclick = async () => {
  const report = JSON.stringify({ ...match.replay(__BUILD__), fingerprint: fingerprint(match.state) });
  try { await navigator.clipboard.writeText(report); say('Bug report copied. Paste it into a new GitHub issue.', 5); }
  catch { prompt('Copy this bug report:', report); }
};

function point(e: PointerEvent) {
  controllerActive = false;
  hover = view.cellAt(e.clientX, e.clientY);
}

/** Pointing at an enemy castle aims at it; anywhere else, it builds. */
function buildOrAim() {
  if (local || !hover || paused) return;
  const castle = match.state.bases.indexOf(hover.y * match.state.width + hover.x);
  if (castle >= 0 && foes(match.state).includes(castle)) target = castle;
  else if (walking()) say('Press Q to fly as the wisp, then click to build.');
  else build();
}

canvas.addEventListener('pointermove', point);
canvas.addEventListener('pointerleave', () => { if (!controllerActive) hover = null; });
canvas.addEventListener('pointerdown', (e) => {
  point(e);
  if (e.button === 0) buildOrAim();
});
addEventListener('keydown', (e) => {
  if (settings.active || e.metaKey || e.ctrlKey || e.altKey || e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement) return;
  const key = e.key.toLowerCase();
  if (local) {
    if (key === 'p' && !e.repeat) togglePause();
    if (key === 'r' && !e.repeat) startMatch();
    return;
  }
  if (key in WALK_KEYS) {
    e.preventDefault();
    keysDown.add(key);
    syncHeld();
    return;
  }
  if (key === 'q' && !e.repeat) toggleMode();
  if (key === 'e' && !e.repeat) interact();
  if (key === 'x') sell();
  if (key === ' ') { e.preventDefault(); launch(); }
  if (key === 't') cycleTarget();
  if (key === 'p' && !e.repeat) togglePause();
  if (key === 'r' && !e.repeat) restart();
  const card = kitCards()[Number(key) - 1];
  if (card) selected = card.id;
});
addEventListener('keyup', (e) => {
  const key = e.key.toLowerCase();
  if (!keysDown.delete(key)) return;
  syncHeld();
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
  if (!local && me >= 0 && winner === config.teams[me]) return `${winners.length > 1 ? 'Your team wins!' : 'You win!'}${again}`;
  return `${winners.map(name).join(' and ')} win${winners.length > 1 ? '' : 's'}.${again}`;
}

/** What one tick did, as you see it. */
function react(events: GameEvent[], wasAlive: boolean) {
  view.show(events);
  const why = reasons();
  for (const e of events) if (e.type === 'refused' && human(e.action.player)) say(local ? `${name(e.action.player)} · ${why[e.reason]}` : why[e.reason]);
  if (!local && wasAlive && !alive(match.state, me)) say('Your castle has fallen! Your buildings are ruins now. Watch how it ends.', 6);
  if (match.state.winner !== null) say(winText(match.state.winner), 1e6);
}

// ---------- Controller ----------

function availableGamepads() {
  try { return navigator.getGamepads?.() ?? []; }
  catch { return []; } // Gamepad access can be blocked in an embedded page.
}

function readController(now: number) {
  const input = gamepad.poll(availableGamepads(), now, soloProfile);
  if (!input && controllerActive) {
    controllerActive = false;
    hover = null;
    stopWalking();
    settings.close();
    if (!net && !paused && match.state.winner === null) {
      togglePause();
      say('Controller disconnected. Reconnect to resume, or press P.', 1e6);
    }
  }
  controllerHelp.hidden = !input;
  if (!input?.ready) {
    controllerHelp.textContent = 'Release the controller buttons and center the stick.';
    return;
  }

  if (settings.active) {
    settings.handle(input.pressed, input.move);
    return;
  }
  const { bindings } = soloProfile;
  const pressed = (button: number) => input.pressed.includes(button);
  const ended = match.state.winner !== null;
  const label = (button: number) => BUTTON_LABELS[button];
  const towerButtons = [bindings.previous, bindings.next].map(label).join(' · ');
  const pauseHelp = net ? '' : ` · ${label(bindings.pause)}  Pause`;
  const help = ended
    ? `${label(bindings.restart)}  ${net ? 'Lobby' : 'Play again'}`
    : paused
      ? `${label(bindings.pause)}  Resume · ${label(bindings.restart)}  Restart`
      : walking()
        ? `Stick / D-pad  Walk · ${label(bindings.mode)}  Fly to build · ${label(bindings.build)}  Use (launch at your castle) · ${label(bindings.sell)}  Sell nearby · ${label(bindings.target)}  Aim${pauseHelp}`
        : `Stick / D-pad  Fly · ${towerButtons}  Tower · ${label(bindings.build)}  Build or aim · ${label(bindings.mode)}  Walk${pauseHelp}`;
  const helpWithSettings = `${help} · View / Create  Settings`;
  if (controllerHelp.textContent !== helpWithSettings) controllerHelp.textContent = helpWithSettings;

  if (pressed(SETTINGS_BUTTON)) {
    settings.open(soloProfile);
    return;
  }
  const tower = Number(pressed(bindings.next)) - Number(pressed(bindings.previous));
  if (input.held.x !== padHeld.x || input.held.y !== padHeld.y) {
    padHeld = input.held;
    if (walking()) { controllerActive = true; syncHeld(); }
  }
  if (!input.move && !input.pressed.some((button) => Object.values(bindings).includes(button))) return;
  if (!controllerActive && hover) cursor = hover;
  controllerActive = true;
  hover = cursor;
  if (pressed(bindings.restart) && (paused || ended)) {
    restart();
    return;
  }
  if (pressed(bindings.pause)) {
    togglePause();
    return;
  }
  if (paused || ended) return;

  if (pressed(bindings.mode)) toggleMode();
  if (input.move && !walking()) {
    const { width, height } = match.state;
    cursor = {
      x: Math.min(width - 1, Math.max(0, cursor.x + input.move.x)),
      y: Math.min(height - 1, Math.max(0, cursor.y + input.move.y)),
    };
    hover = cursor;
  }
  if (tower) {
    const kit = kitCards();
    const index = kit.findIndex((card) => card.id === selected);
    selected = kit[(index + tower + kit.length) % kit.length].id;
  }
  if (pressed(bindings.target)) cycleTarget();
  if (pressed(bindings.launch)) launch();
  if (pressed(bindings.sell)) sell();
  else if (pressed(bindings.build)) {
    if (walking()) interact();
    else buildOrAim();
  }
}

function readLocalControllers(now: number) {
  const inputs = controllers.poll(now, profileFor);
  const disconnect = controllers.disconnected();
  const owner = settings.owner ?? me;
  if (settings.active && controllers.seat(owner) === -1) settings.close();
  const hostBindings = profileFor(me).bindings;
  const label = (key: keyof typeof hostBindings) => BUTTON_LABELS[hostBindings[key]];
  controllerHelp.hidden = false;
  const help = disconnect
    ? 'Controller disconnected · Press A / Cross on a controller to reclaim the seat'
    : joining
      ? `${controllers.humans()}/${seats.length} joined · A / Cross  Join · ${label('pause')}  Start · Empty seats are bots`
      : paused || match.state.winner !== null
        ? `${label('pause')}  Resume · ${label('restart')}  Restart · View / Create  Settings`
        : `Stick / D-pad  Walk or fly · ${label('mode')}  Walk / fly · View / Create  Open your controls`;
  if (controllerHelp.textContent !== help) controllerHelp.textContent = help;
  const modal = settings.active;
  for (const { pad, device, input } of inputs) {
    if (!input.ready) continue;
    const pressed = (button: number) => input.pressed.includes(button);
    if (modal) {
      if (device.seat === owner) settings.handle(input.pressed, input.move);
      continue;
    }
    if (settings.active) break;
    if (device.seat === undefined) {
      if (pressed(SELECT_BUTTON)) {
        controllers.claim(pad.index, joining);
        if (joining && controllers.humans()) ($('restart') as HTMLButtonElement).disabled = false;
      }
      continue;
    }
    const player = device.seat;
    const seat = seats[player];
    const profile = profileFor(player);
    const { bindings } = profile;
    if (pressed(SETTINGS_BUTTON)) {
      settings.open(profile, player);
      break;
    }
    if (player === me) {
      if (pressed(bindings.pause)) {
        if (joining) startMatch();
        else if (!disconnect) togglePause();
        break;
      }
      if (pressed(bindings.restart) && (paused || match.state.winner !== null)) { startMatch(); break; }
    }
    const turn = Number(pressed(bindings.next)) - Number(pressed(bindings.previous));
    // While joining, the tower buttons choose your spirit.
    if (joining && turn) {
      const ids = Object.keys(spiritList);
      localSpirits[player] = ids[(ids.indexOf(localSpirits[player]) + turn + ids.length) % ids.length];
      restart();
      break;
    }
    if (joining || disconnect || paused || match.state.winner !== null || !alive(match.state, player)) continue;
    const { width, height } = match.state;
    const { move, held } = input;
    if (pressed(bindings.mode)) {
      const next: SpiritMode = walking(player) ? 'cursor' : 'walk';
      spiritModes[player] = next;
      queued.push({ type: 'spirit-mode', player, mode: next });
      seat.held = { ...STILL };
      if (next === 'cursor') seat.cursor = bodyCell(player);
    }
    if (walking(player)) {
      if (held.x !== seat.held.x || held.y !== seat.held.y) {
        seat.held = held;
        queued.push({ type: 'spirit-move', player, ...held });
      }
    } else if (move) {
      seat.cursor = {
        x: Math.max(0, Math.min(width - 1, seat.cursor.x + move.x)),
        y: Math.max(0, Math.min(height - 1, seat.cursor.y + move.y)),
      };
    }
    if (turn) {
      const kit = kitOf(player);
      seat.selected = kit[(kit.indexOf(seat.selected) + turn + kit.length) % kit.length];
    }
    if (pressed(bindings.target)) {
      const options = foes(match.state, player);
      if (options.length) seat.target = options[(options.indexOf(seat.target) + 1) % options.length];
    }
    const aim = seat.target;
    if (pressed(bindings.launch) && aim >= 0) queued.push({ type: 'launch', player, target: aim });
    if (pressed(bindings.sell)) {
      const action = sellNearby(player);
      if (typeof action === 'string') say(`${name(player)} · ${action}`);
      else queued.push(action);
    } else if (pressed(bindings.build)) {
      // Walking, A uses what is in reach (your castle launches); flying, it builds.
      if (!walking(player)) queued.push({ type: 'build', player, tower: seat.selected, ...seat.cursor });
      else if (aim >= 0 && withinReach(match.state, config, player).some((r) => r.kind === 'castle')) queued.push({ type: 'launch', player, target: aim });
      else say(`${name(player)} · Walk to your castle to launch your troops.`);
    }
  }
}

addEventListener('blur', suspendControllers);
document.addEventListener('visibilitychange', suspendControllers);

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
    if (p === room!.you) {
      const choose = document.createElement('select');
      choose.ariaLabel = 'Your spirit';
      spiritOptions(choose);
      choose.value = seat.spirit;
      choose.onchange = () => net!.send({ t: 'spirit', spirit: choose.value });
      li.append(choose);
    } else li.append(` · ${spiritList[seat.spirit]?.label ?? seat.spirit}`);
    if (p === room!.you) li.append(button('Stand up', () => net!.send({ t: 'sit', seat: null })));
    else if (!seat.name) li.append(button('Sit here', () => net!.send({ t: 'sit', seat: p })));
    list.append(li);
  });
  $('watching').textContent = room.watching.length ? `Watching: ${room.watching.join(', ')}` : '';
}
const button = (text: string, onclick: () => void) => Object.assign(document.createElement('button'), { textContent: text, onclick });

function onServer(m: ServerMessage) {
  if (m.t === 'room') {
    const spirits = m.seats.map((seat) => seat.spirit);
    const lobbyChanged = !room || room.mode !== m.mode || room.phase !== m.phase || room.seats.map((seat) => seat.spirit).join() !== spirits.join();
    room = m;
    me = m.you ?? -1;
    if (m.phase === 'lobby' && lobbyChanged) {
      lock = null;
      const preview = withSpirits(modes[m.mode].config, spirits);
      show(new Match(preview), preview);
    }
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
  for (const [id, m] of Object.entries(modes)) {
    if (id !== 'fourWay' && id !== 'twoVsTwo') roomMode.append(new Option(m.label, id));
  }
  roomMode.onchange = () => net!.send({ t: 'mode', mode: roomMode.value as Mode });
  $('start').onclick = () => net!.send({ t: 'start' });
  $('copy-link').onclick = async () => {
    try { await navigator.clipboard.writeText(location.href); say('Link copied. Send it to your friends.'); }
    catch { prompt('Send your friends this link:', location.href); }
  };
  for (const id of ['mode', 'spirit', 'pause', 'local']) $(id).hidden = true;
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
let last = performance.now();
function loop(now: number) {
  const seconds = Math.min((now - last) / 1000, 0.25);
  last = now;
  if (!document.hidden && document.hasFocus()) {
    if (local) readLocalControllers(now);
    else readController(now);
  }
  // The controller settings pause an offline game; online, the match carries on.
  const suspended = !net && (paused || settings.active || joining || controllers.disconnected());
  if (lock) runOnline(seconds);
  else if (!net && !suspended) runOffline(seconds);
  draw(now, suspended ? 0 : seconds);
  requestAnimationFrame(loop);
}

/** Offline: fixed ticks however fast the screen draws. Time spent in a hidden tab is dropped. */
function runOffline(seconds: number) {
  owed += seconds;
  while (owed >= TICK) {
    owed -= TICK;
    if (match.state.winner !== null) continue;
    const wasAlive = alive(match.state, me);
    react(match.step([...queued.splice(0), ...bots.flatMap((bot, p) => human(p) ? [] : bot(match.state, config))]), wasAlive);
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
  if (racing && lock!.behind <= 3 * TURN_TICKS) caughtUp();
}

/**
 * After racing through a backlog (a reconnect or a hidden tab), trust the match again for your spirit:
 * its mode, and a stop if it is still walking a direction you no longer hold.
 */
function caughtUp() {
  if (me < 0) return;
  const sp = match.state.spirits[me];
  spiritModes[me] = sp.mode;
  sentHeld = { x: sp.dx, y: sp.dy };
  if (sp.mode === 'walk') syncHeld();
}

function draw(now: number, seconds: number) {
  const s = match.state;
  if (!foes(s).includes(target)) { target = -1; cycleTarget(); }
  for (const { p, el, text } of badges) {
    if (local) {
      drawLocalSeat(p, el, text);
      continue;
    }
    const gold = p === me ? ` · ● ${s.gold[p]} gold` : '';
    const spirit = `${spiritLabel(p)}${s.spirits[p].mode === 'cursor' ? ' (flying)' : ''}`;
    text.textContent = alive(s, p) ? `${spirit} · ♥ ${s.baseHealth[p]}${gold} · ⚔ ${armyText(s.garrison[p])}` : 'fallen';
    el.classList.toggle('target', p === target);
    el.classList.toggle('fallen', !alive(s, p));
  }
  for (const c of cards) {
    c.button.setAttribute('aria-pressed', String(c.id === selected));
    c.button.classList.toggle('poor', me < 0 || s.gold[me] < c.def.cost);
  }
  if (now > messageUntil) $('message').textContent = '';
  // The build cursor is the wisp: only shown while flying.
  const aimCell = me >= 0 && !walking() ? hover : null;
  const own = aimCell && s.towers.find((t) => t.cell === aimCell.y * s.width + aimCell.x);
  const def = config.content.towers[own ? own.id : selected];
  const ok = me >= 0 && (!!own || !checkBuild(s, config, me, selected, aimCell?.x ?? -1, aimCell?.y ?? -1));
  for (let p = 0; p < PLAYER_COLORS.length; p++) {
    if (local && p < seats.length) continue;
    const active = !local && p === me;
    view.highlight(p, active ? aimCell : null, ok, def.kind === 'shooter' ? def.range / 1000 : 0, active && target >= 0 ? s.bases[target] : -1);
  }
  const locals: LocalSpirit[] = local
    ? seats.flatMap((seat, player) => (human(player) ? [{ player, wisp: walking(player) ? null : seat.cursor }] : []))
    : me >= 0 ? [{ player: me, wisp: aimCell }] : [];
  view.draw(s, config, seconds, local || me < 0 ? null : me, locals);
}
function drawLocalSeat(p: Player, el: HTMLElement, text: HTMLElement) {
  const s = match.state;
  const seat = seats[p];
  const options = foes(s, p);
  if (!options.includes(seat.target)) seat.target = options[0] ?? -1;
  const occupied = human(p);
  const tower = seat.selected;
  const flying = s.spirits[p].mode === 'cursor' ? ' (flying)' : '';
  el.querySelector('b')!.textContent = `${name(p)} · ${spiritLabel(p)}${flying}${controllers.seat(p) === -1 ? ' · Disconnected' : ''}`;
  const gold = occupied ? ` · ● ${s.gold[p]} gold` : '';
  const towerDef = config.content.towers[tower];
  const selection = occupied ? ` · ${towerDef.label} (${towerDef.cost} gold)` : '';
  const aim = occupied && seat.target >= 0 ? ` · Aim: ${name(seat.target)}` : '';
  text.textContent = alive(s, p) ? `♥ ${s.baseHealth[p]}${gold} · ⚔ ${armyText(s.garrison[p])}${selection}${aim}` : 'fallen';
  el.classList.toggle('fallen', !alive(s, p));
  const cell = occupied && alive(s, p) && !walking(p) ? seat.cursor : null;
  const own = cell && s.towers.find((t) => t.player === p && t.cell === cell.y * s.width + cell.x);
  const def = config.content.towers[own ? own.id : tower];
  const ok = !!cell && (!!own || !checkBuild(s, config, p, tower, cell.x, cell.y));
  view.highlight(p, cell, ok, def.kind === 'shooter' ? def.range / 1000 : 0, occupied && seat.target >= 0 ? s.bases[seat.target] : -1);
}

requestAnimationFrame(loop);
