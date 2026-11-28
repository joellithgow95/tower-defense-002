/** Connects the player, the bot, the rules and the picture. */
import { createBot } from '../core/bot';
import { defaultConfig as config } from '../core/config';
import { Match, fingerprint } from '../core/match';
import { TICKS_PER_SECOND, checkBuild } from '../core/sim';
import type { Action, Refusal } from '../core/types';
import { problems } from '../core/validate';
import { createView } from './view';

const $ = (id: string) => document.getElementById(id)!;
const canvas = $('board') as HTMLCanvasElement;
const mistakes = problems(config);
if (mistakes.length) {
  $('message').textContent = mistakes.join(' ');
  throw new Error(mistakes.join('\n'));
}

const view = createView(canvas);
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
let hover: { x: number; y: number } | null = null;
let messageUntil = 0;

function say(text: string, seconds = 2.5) {
  $('message').textContent = text;
  messageUntil = performance.now() + seconds * 1000;
}

function restart() {
  match = new Match(config);
  bot = createBot(1, Date.now());
  queued = [];
  paused = false;
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

const sell = () => hover && queued.push({ type: 'sell', team: 0, ...hover });
const togglePause = () => { paused = !paused; say(paused ? 'Paused' : 'Go!', paused ? 1e6 : 1); };
$('pause').onclick = togglePause;
$('restart').onclick = restart;
$('sell').onclick = () => say('Point at one of your towers and press X.');
$('report').onclick = async () => {
  const report = JSON.stringify({ ...match.replay(__BUILD__), fingerprint: fingerprint(match.state) });
  try { await navigator.clipboard.writeText(report); say('Bug report copied. Paste it into a new GitHub issue.', 5); }
  catch { prompt('Copy this bug report:', report); }
};

canvas.addEventListener('pointermove', (e) => (hover = view.cellAt(e.clientX, e.clientY)));
canvas.addEventListener('pointerleave', () => (hover = null));
canvas.addEventListener('pointerdown', (e) => {
  hover = view.cellAt(e.clientX, e.clientY);
  if (e.button === 0 && hover && !paused) queued.push({ type: 'build', team: 0, tower: selected, ...hover });
});
addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const key = e.key.toLowerCase();
  if (key === 'x' && !paused) sell();
  if (key === 'p') togglePause();
  if (key === 'r') restart();
  const card = cards[Number(key) - 1];
  if (card) selected = card.id;
});

restart();
const TICK = 1 / TICKS_PER_SECOND;
let last = performance.now(), owed = 0;
function loop(now: number) {
  // The game advances in fixed ticks however fast the screen draws. Time spent in a hidden tab is dropped.
  const seconds = Math.min((now - last) / 1000, 0.25);
  last = now;
  if (!paused) owed += seconds;
  while (owed >= TICK) {
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
  view.draw(s, config, paused ? 0 : seconds);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
