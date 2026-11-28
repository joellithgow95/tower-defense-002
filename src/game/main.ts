/** Connects the player, the bot, the rules and the picture. */
import { createBot } from '../core/bot';
import { defaultConfig as config } from '../core/config';
import { Match, fingerprint } from '../core/match';
import { TICKS_PER_SECOND, checkBuild } from '../core/sim';
import type { Action, Refusal } from '../core/types';
import { problems } from '../core/validate';
import { BUTTON_LABELS, SETTINGS_BUTTON } from './controller-preferences';
import { createControllerSettings } from './controller-settings';
import { createGamepadInput } from './gamepad';
import { createView } from './view';

const $ = (id: string) => document.getElementById(id)!;
const canvas = $('board') as HTMLCanvasElement;
const mistakes = problems(config);
if (mistakes.length) {
  $('message').textContent = mistakes.join(' ');
  throw new Error(mistakes.join('\n'));
}

const view = createView(canvas);
const gamepad = createGamepadInput();
const controllerHelp = $('controller-help');
const settings = createControllerSettings(
  $('controller-settings') as HTMLDialogElement,
  $('controller-open') as HTMLButtonElement,
  gamepad.suspend,
);
const REASONS: Record<Refusal, string> = {
  'game-over': 'The match is over. Press R to play again.',
  'unknown-tower': 'That tower does not exist.',
  outside: 'That is off the board.',
  'not-your-land': `Build within ${config.rules.buildRadius} cells of your castle or one of your buildings.`,
  'near-enemy-castle': 'Too close to the enemy castle.',
  occupied: 'Something is already there.',
  'no-gold': 'Not enough gold yet.',
  'blocks-route': 'That would wall troops in. Leave a route open.',
  'nothing-to-sell': 'Point at one of your towers to sell it.',
};

let match: Match, bot: ReturnType<typeof createBot>, paused = false, queued: Action[] = [];
let selected = Object.keys(config.content.towers)[0];
type Cell = { x: number; y: number };
let hover: Cell | null = null;
let messageUntil = 0;
let controllerActive = false;
let cursor: Cell;
let owed = 0;

function say(text: string, seconds = 2.5) {
  $('message').textContent = text;
  messageUntil = performance.now() + seconds * 1000;
}

function restart() {
  match = new Match(config);
  bot = createBot(1, Date.now());
  queued = [];
  owed = 0;
  paused = false;
  const { bases, width } = match.state;
  cursor = { x: bases[0] % width, y: Math.floor(bases[0] / width) };
  if (controllerActive) hover = cursor;
  view.reset(match.state);
  say('Pick a tower, then build on your land (blue). Every building spreads your land. Your towers are the walls.', 6);
}

const cards = Object.entries(config.content.towers).map(([id, def], i) => {
  const button = document.createElement('button');
  const key = Object.assign(document.createElement('kbd'), { textContent: String(i + 1) });
  const cost = Object.assign(document.createElement('small'), { textContent: `${def.cost} gold` });
  button.append(def.label, ' ', key, document.createElement('br'), cost);
  button.onclick = () => (selected = id);
  $('cards').append(button);
  return { id, def, button };
});

function build() {
  if (hover && !paused) queued.push({ type: 'build', team: 0, tower: selected, ...hover });
}

function sell() {
  if (hover && !paused) queued.push({ type: 'sell', team: 0, ...hover });
}

function togglePause() {
  if (match.state.winner !== null) return;
  paused = !paused;
  say(paused ? 'Paused' : 'Go!', paused ? 1e6 : 1);
}
$('pause').onclick = togglePause;
$('restart').onclick = restart;
$('sell').onclick = () => say('Point at one of your towers and press X.');
$('report').onclick = async () => {
  const report = JSON.stringify({ ...match.replay(__BUILD__), fingerprint: fingerprint(match.state) });
  try { await navigator.clipboard.writeText(report); say('Bug report copied. Paste it into a new GitHub issue.', 5); }
  catch { prompt('Copy this bug report:', report); }
};

function point(e: PointerEvent) {
  controllerActive = false;
  hover = view.cellAt(e.clientX, e.clientY);
}

canvas.addEventListener('pointermove', point);
canvas.addEventListener('pointerleave', () => { if (!controllerActive) hover = null; });
canvas.addEventListener('pointerdown', (e) => {
  point(e);
  if (e.button === 0) build();
});
addEventListener('keydown', (e) => {
  if (settings.active || e.metaKey || e.ctrlKey || e.altKey) return;
  const key = e.key.toLowerCase();
  if (key === 'x') sell();
  if (key === 'p' && !e.repeat) togglePause();
  if (key === 'r' && !e.repeat) restart();
  const card = cards[Number(key) - 1];
  if (card) selected = card.id;
});

function availableGamepads() {
  try { return navigator.getGamepads?.() ?? []; }
  catch { return []; } // Gamepad access can be blocked in an embedded page.
}

function readController(now: number) {
  const input = gamepad.poll(availableGamepads(), now, settings.preferences);
  if (!input && controllerActive) {
    controllerActive = false;
    hover = null;
    settings.cancelCapture();
    if (!paused && match.state.winner === null) togglePause();
    if (match.state.winner === null) say('Controller disconnected. Reconnect to resume, or press P.', 1e6);
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
  const { bindings } = settings.preferences;
  const pressed = (button: number) => input.pressed.includes(button);
  const ended = match.state.winner !== null;
  const buildButton = BUTTON_LABELS[bindings.build];
  const pauseButton = BUTTON_LABELS[bindings.pause];
  const restartButton = BUTTON_LABELS[bindings.restart];
  const towerButtons = [bindings.previous, bindings.next].map((button) => BUTTON_LABELS[button]).join(' · ');
  const help = ended
    ? `${restartButton}  Play again`
    : paused
      ? `${pauseButton}  Resume · ${restartButton}  Restart`
      : `Stick / D-pad  Move · ${towerButtons}  Tower · ${buildButton}  Build · ${BUTTON_LABELS[bindings.sell]}  Sell · ${pauseButton}  Pause`;
  const helpWithSettings = `${help} · View / Create  Settings`;
  if (controllerHelp.textContent !== helpWithSettings) controllerHelp.textContent = helpWithSettings;

  if (pressed(SETTINGS_BUTTON)) {
    settings.open();
    return;
  }
  const tower = Number(pressed(bindings.next)) - Number(pressed(bindings.previous));
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

  if (input.move) {
    const { width, height } = match.state;
    cursor = {
      x: Math.min(width - 1, Math.max(0, cursor.x + input.move.x)),
      y: Math.min(height - 1, Math.max(0, cursor.y + input.move.y)),
    };
    hover = cursor;
  }
  if (tower) {
    const index = cards.findIndex((card) => card.id === selected);
    selected = cards[(index + tower + cards.length) % cards.length].id;
  }
  if (pressed(bindings.sell)) sell();
  else if (pressed(bindings.build)) build();
}

addEventListener('blur', gamepad.suspend);
document.addEventListener('visibilitychange', gamepad.suspend);
restart();
const TICK = 1 / TICKS_PER_SECOND;
let last = performance.now();
function loop(now: number) {
  // The game advances in fixed ticks however fast the screen draws. Time spent in a hidden tab is dropped.
  const seconds = Math.min((now - last) / 1000, 0.25);
  last = now;
  if (!document.hidden && document.hasFocus()) readController(now);
  const suspended = paused || settings.active;
  if (!suspended) owed += seconds;
  while (!suspended && owed >= TICK) {
    owed -= TICK;
    if (match.state.winner !== null) continue;
    const events = match.step([...queued.splice(0), ...bot(match.state, config)]);
    view.show(events);
    for (const e of events) if (e.type === 'refused' && e.action.team === 0) say(REASONS[e.reason]);
    if (match.state.winner !== null) say(match.state.winner === 0 ? 'You win! Press R to play again.' : match.state.winner === 1 ? 'The bot wins. Press R to try again.' : 'A draw. Press R to play again.', 1e6);
  }
  const s = match.state;
  $('hp0').textContent = String(s.baseHealth[0]);
  $('hp1').textContent = String(s.baseHealth[1]);
  $('gold').textContent = String(s.gold[0]);
  for (const c of cards) {
    c.button.setAttribute('aria-pressed', String(c.id === selected));
    c.button.classList.toggle('poor', s.gold[0] < c.def.cost);
  }
  if (now > messageUntil) $('message').textContent = '';
  const own = hover && s.towers.find((t) => t.cell === hover!.y * s.width + hover!.x);
  const def = config.content.towers[own ? own.id : selected];
  view.highlight(hover, !!own || !checkBuild(s, config, 0, selected, hover?.x ?? -1, hover?.y ?? -1), def.kind === 'shooter' ? def.range / 1000 : 0);
  view.draw(s, config, suspended ? 0 : seconds);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
