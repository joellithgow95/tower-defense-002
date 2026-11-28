/** Connects the player, the bots, the rules and the picture. */
import { createBot } from '../core/bot';
import { type Mode, modes } from '../core/config';
import { Match, fingerprint } from '../core/match';
import { TICKS_PER_SECOND, alive, checkBuild, enemies, players } from '../core/sim';
import type { Action, Config, Player, Refusal, State } from '../core/types';
import { problems } from '../core/validate';
import { BUTTON_LABELS, SELECT_BUTTON, SETTINGS_BUTTON, defaults, loadPreferences, type ControllerPreferences } from './controller-preferences';
import { createControllerSettings } from './controller-settings';
import { createLocalControllers } from './local-controllers';
import { PLAYER_COLORS } from './models';
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
/** You are always player 0 here; everyone else is a bot. */
const me: Player = 0;
const controllers = createLocalControllers();
const settings = createControllerSettings($('controller-settings') as HTMLDialogElement, controllers.suspend);
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
let owed = 0;

type Cell = { x: number; y: number };
type Seat = { target: Player; selected: string; cursor: Cell };
let seats: Seat[] = [];
const firstTower = Object.keys(modes.duel.config.content.towers)[0];


let mode: Mode = 'duel', config: Config = modes.duel.config;
let match: Match, bots: ((s: State, cfg: Config) => Action[])[] = [], paused = false, queued: Action[] = [];
let target: Player = -1;
let selected = firstTower;
let hover: Cell | null = null;
let hostUsesController = false;
let messageUntil = 0;

const reasons = (): Record<Refusal, string> => ({
  'game-over': 'The match is over. Press R to play again.',
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

const human = (p: Player) => (!local && p === me) || (local && controllers.seat(p) !== null);
const name = (p: Player) => human(p) ? (local ? `Player ${p + 1}` : 'You') : `Bot ${p + 1}`;
const colorOf = (p: Player) => `#${PLAYER_COLORS[p].toString(16).padStart(6, '0')}`;
/** Enemies you can still attack; none once your own castle has fallen. */
const foes = (s: State, player: Player = me) => (alive(s, player) ? players(s).filter((p) => alive(s, p) && enemies(s, player, p)) : []);

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
  const byTeam = [...new Set(config.teams)];
  badges = [];
  byTeam.forEach((team, i) => {
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

function restart(next: Mode = mode) {
  mode = next;
  config = modes[mode].config;
  match = new Match(config);
  const seed = Date.now();
  bots = players(match.state).map((p) => createBot(p, seed + p));
  const { width, bases } = match.state;
  seats = bases.map((cell, p) => ({
    target: foes(match.state, p)[0] ?? -1,
    selected: p === me ? selected : firstTower,
    cursor: { x: cell % width, y: Math.floor(cell / width) },
  }));
  owed = 0;
  queued = [];
  paused = false;
  target = -1;
  cycleTarget();
  if (hostUsesController) hover = seats[me].cursor;
  view.reset(match.state);
  buildBadges();
  ($('mode') as HTMLSelectElement).value = mode;
  try { localStorage.setItem('mode', mode); } catch { /* private window: just don't remember */ }
  if (local) { say(''); return; }
  const aim = foes(match.state).length > 1 ? ' Click an enemy castle (or press T) to pick who to attack.' : '';
  say(`Build on your land (blue): towers are walls, Barracks and Knight Halls train troops. Press Space to launch them.${aim}`, 8);
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
modeSelect.onchange = () => {
  const next = modeSelect.value as Mode;
  if (local) enterLobby(next);
  else restart(next);
  modeSelect.blur();
};

function enterLobby(next: Mode) {
  joining = true;
  controllers.reset(modes[next].config.teams.length);
  hostUsesController = false;
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
  $('controller-open').textContent = local ? 'Player 1 controller settings' : 'Controller settings';
  for (const id of ['cards', 'launch', 'sell']) $(id).hidden = local;
  $('local').textContent = local ? 'Solo play' : 'Local multiplayer';
  if (local) enterLobby('fourWay');
  else {
    joining = false;
    controllers.reset(1);
    startMatch();
  }
};

const sell = () => !controllers.disconnected() && hover && queued.push({ type: 'sell', player: me, ...hover });
const launch = () => !controllers.disconnected() && target >= 0 && queued.push({ type: 'launch', player: me, target });
function togglePause() {
  if (joining || match.state.winner !== null) return;
  if (controllers.disconnected()) {
    if (local) return;
    controllers.reset(1);
    hostUsesController = false;
    hover = null;
  } else {
    paused = !paused;
  }
  say(paused ? 'Paused' : 'Go!', paused ? 1e6 : 1);
}
$('pause').onclick = togglePause;
$('restart').onclick = startMatch;
$('sell').onclick = () => say('Point at one of your towers and press X.');
$('launch').onclick = () => !local && !paused && launch();
$('report').onclick = async () => {
  const report = JSON.stringify({ ...match.replay(__BUILD__), fingerprint: fingerprint(match.state) });
  try { await navigator.clipboard.writeText(report); say('Bug report copied. Paste it into a new GitHub issue.', 5); }
  catch { prompt('Copy this bug report:', report); }
};

canvas.addEventListener('pointermove', (e) => {
  if (local) return;
  hostUsesController = false;
  hover = view.cellAt(e.clientX, e.clientY);
});
canvas.addEventListener('pointerleave', () => { if (!hostUsesController) hover = null; });
canvas.addEventListener('pointerdown', (e) => {
  if (local) return;
  hostUsesController = false;
  hover = view.cellAt(e.clientX, e.clientY);
  if (e.button !== 0 || !hover || paused || controllers.disconnected()) return;
  // Clicking an enemy castle aims at it; anywhere else, it builds.
  const castle = match.state.bases.indexOf(hover.y * match.state.width + hover.x);
  if (castle >= 0 && foes(match.state).includes(castle)) target = castle;
  else queued.push({ type: 'build', player: me, tower: selected, ...hover });
});
addEventListener('keydown', (e) => {
  if (settings.active || e.metaKey || e.ctrlKey || e.altKey || e.target instanceof HTMLSelectElement) return;
  const key = e.key.toLowerCase();
  if (local) {
    if (key === 'p' && !joining && !e.repeat) togglePause();
    if (key === 'r' && !e.repeat) startMatch();
    return;
  }
  if (key === 'x' && !paused) sell();
  if (key === ' ') { e.preventDefault(); if (!paused) launch(); }
  if (key === 't') cycleTarget();
  if (key === 'p' && !e.repeat) togglePause();
  if (key === 'r' && !e.repeat) restart();
  const card = cards[Number(key) - 1];
  if (card) selected = card.id;
});

/** "6 Soldiers, 2 Knights": what is waiting in a castle. */
function armyText(garrison: Record<string, number>) {
  const parts = Object.entries(garrison).filter(([, n]) => n > 0).map(([id, n]) => `${n} ${config.content.troops[id].label}${n === 1 ? '' : 's'}`);
  return parts.join(', ') || 'no troops';
}

function winText(winner: number | 'draw') {
  if (winner === 'draw') return 'A draw. Press R to play again.';
  if (local) {
    const winners = players(match.state).filter((p) => config.teams[p] === winner);
    return `${winners.map(name).join(' and ')} ${winners.length === 1 ? 'wins' : 'win'}!`;
  }
  if (winner !== config.teams[me]) return 'The bots win. Press R to try again.';
  return players(match.state).some((p) => p !== me && config.teams[p] === winner) ? 'Your team wins! Press R to play again.' : 'You win! Press R to play again.';
}

function readControllers(now: number) {
  const inputs = controllers.poll(now, profileFor);
  const disconnect = controllers.disconnected();
  const owner = settings.owner ?? me;
  if (settings.active && controllers.seat(owner) === -1) settings.close();
  const hostBindings = profileFor(me).bindings;
  const label = (key: keyof typeof hostBindings) => BUTTON_LABELS[hostBindings[key]];
  controllerHelp.hidden = !local && !inputs.length && !disconnect;
  const help = disconnect
    ? local
      ? 'Controller disconnected · Press A / Cross on a controller to reclaim the seat'
      : 'Controller disconnected · Press a button to reconnect, or P to use keyboard and mouse'
    : joining
      ? `${controllers.humans()}/${seats.length} joined · A / Cross  Join · ${label('pause')}  Start · Empty seats are bots`
      : paused || match.state.winner !== null
        ? `${label('pause')}  Resume · ${label('restart')}  Restart · View / Create  Settings`
        : local
          ? 'Stick / D-pad  Move · View / Create  Open your controls'
          : `Stick / D-pad  Move · ${label('previous')} / ${label('next')}  Tower · ${label('build')}  Build · ${label('sell')}  Sell · ${label('launch')}  Launch · ${label('target')}  Aim · ${label('pause')}  Pause · View / Create  Settings`;
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
      if (local) {
        if (pressed(SELECT_BUTTON)) {
          controllers.claim(pad.index, joining);
          if (joining && controllers.humans()) ($('restart') as HTMLButtonElement).disabled = false;
        }
      } else if (input.move || input.pressed.length) {
        controllers.claim(pad.index, true);
        // The first deliberate input in solo play still controls the game.
        if (device.seat === undefined) continue;
      }
      if (local || device.seat === undefined) continue;
    }
    const player = device.seat;
    const seat = seats[player];
    const profile = profileFor(player);
    const { bindings } = profile;
    if (pressed(SETTINGS_BUTTON)) {
      settings.open(profile, local ? player : undefined);
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
    if (joining || disconnect || paused || match.state.winner !== null || !alive(match.state, player)) continue;
    const { width, height } = match.state;
    const { move } = input;
    if (move) {
      const from = !local && player === me && !hostUsesController && hover ? hover : seat.cursor;
      seat.cursor = {
        x: Math.max(0, Math.min(width - 1, from.x + move.x)),
        y: Math.max(0, Math.min(height - 1, from.y + move.y)),
      };
    }
    if (player === me && (move || input.pressed.length)) {
      hostUsesController = true;
      hover = seat.cursor;
    }
    const turn = Number(pressed(bindings.next)) - Number(pressed(bindings.previous));
    if (turn) {
      const index = cards.findIndex((card) => card.id === (player === me ? selected : seat.selected));
      seat.selected = cards[(index + turn + cards.length) % cards.length].id;
      if (player === me) selected = seat.selected;
    }
    if (pressed(bindings.target)) {
      const options = foes(match.state, player);
      const current = player === me && !local ? target : seat.target;
      if (options.length) seat.target = options[(options.indexOf(current) + 1) % options.length];
      if (player === me && !local) target = seat.target;
    }
    const aim = player === me && !local ? target : seat.target;
    if (pressed(bindings.launch) && aim >= 0) queued.push({ type: 'launch', player, target: aim });
    if (pressed(bindings.sell)) queued.push({ type: 'sell', player, ...seat.cursor });
    else if (pressed(bindings.build)) queued.push({ type: 'build', player, tower: player === me ? selected : seat.selected, ...seat.cursor });
  }
}

addEventListener('blur', controllers.suspend);
document.addEventListener('visibilitychange', controllers.suspend);
controllers.reset(1);
try { const saved = localStorage.getItem('mode'); if (saved && saved in modes) mode = saved as Mode; } catch { /* use the default */ }
restart();
const TICK = 1 / TICKS_PER_SECOND;
let last = performance.now();
function loop(now: number) {
  // The game advances in fixed ticks however fast the screen draws. Time spent in a hidden tab is dropped.
  const seconds = Math.min((now - last) / 1000, 0.25);
  last = now;
  if (!document.hidden && document.hasFocus()) readControllers(now);
  const suspended = paused || joining || settings.active || controllers.disconnected();
  if (!suspended) owed += seconds;
  while (!suspended && owed >= TICK) {
    owed -= TICK;
    if (match.state.winner !== null) continue;
    const wasAlive = alive(match.state, me);
    const events = match.step([...queued.splice(0), ...bots.flatMap((bot, p) => human(p) ? [] : bot(match.state, config))]);
    view.show(events);
    const why = reasons();
    for (const e of events) if (e.type === 'refused' && human(e.action.player)) say(local ? `${name(e.action.player)} · ${why[e.reason]}` : why[e.reason]);
    if (!local && wasAlive && !alive(match.state, me)) say('Your castle has fallen! Your buildings are ruins now. Watch how it ends.', 6);
    if (match.state.winner !== null) say(winText(match.state.winner), 1e6);
  }
  const s = match.state;
  if (!foes(s).includes(target)) { target = -1; cycleTarget(); }
  for (const { p, el, text } of badges) {
    const seat = seats[p];
    const options = foes(s, p);
    if (!options.includes(seat.target)) seat.target = options[0] ?? -1;
    if (!local && p === me) seat.target = target;
    const occupied = human(p);
    const tower = p === me ? selected : seat.selected;
    el.querySelector('b')!.textContent = `${name(p)}${local && controllers.seat(p) === -1 ? ' · Disconnected' : ''}`;
    const gold = occupied ? ` · ● ${s.gold[p]} gold` : '';
    const towerDef = config.content.towers[tower];
    const selection = local && occupied ? ` · ${towerDef.label} (${towerDef.cost} gold)` : '';
    const aim = local && occupied && seat.target >= 0 ? ` · Aim: ${name(seat.target)}` : '';
    text.textContent = alive(s, p) ? `♥ ${s.baseHealth[p]}${gold} · ⚔ ${armyText(s.garrison[p])}${selection}${aim}` : 'fallen';
    el.classList.toggle('target', !local && p === target);
    el.classList.toggle('fallen', !alive(s, p));
    const cell = occupied && alive(s, p) ? (local ? seat.cursor : hover) : null;
    const own = cell && s.towers.find((t) => t.player === p && t.cell === cell.y * s.width + cell.x);
    const def = config.content.towers[own ? own.id : tower];
    const ok = !!cell && (!!own || !checkBuild(s, config, p, tower, cell.x, cell.y));
    view.highlight(p, cell, ok, def.kind === 'shooter' ? def.range / 1000 : 0, occupied && seat.target >= 0 ? s.bases[seat.target] : -1);
  }
  for (let p = badges.length; p < PLAYER_COLORS.length; p++) view.highlight(p, null, false, 0, -1);
  for (const c of cards) {
    c.button.setAttribute('aria-pressed', String(c.id === selected));
    c.button.classList.toggle('poor', s.gold[me] < c.def.cost);
  }
  if (now > messageUntil) $('message').textContent = '';
  view.draw(s, config, suspended ? 0 : seconds, local ? null : me);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
