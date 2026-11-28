/** Connects the player, the bots, the rules and the picture. */
import { createBot } from '../core/bot';
import { type Mode, modes } from '../core/config';
import { Match, fingerprint } from '../core/match';
import { TICKS_PER_SECOND, alive, checkBuild, enemies, players } from '../core/sim';
import type { Action, Config, Player, Refusal, State } from '../core/types';
import { problems } from '../core/validate';
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

let mode: Mode = 'duel', config: Config = modes.duel.config;
let match: Match, bots: ((s: State, cfg: Config) => Action[])[] = [], paused = false, queued: Action[] = [];
let target: Player = -1;
let selected = Object.keys(modes.duel.config.content.towers)[0];
let hover: { x: number; y: number } | null = null;
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

const name = (p: Player) => (p === me ? 'You' : enemies(match.state, me, p) ? `Bot ${p + 1}` : `Ally ${p + 1}`);
const colorOf = (p: Player) => `#${PLAYER_COLORS[p].toString(16).padStart(6, '0')}`;
/** Enemies you can still attack; none once your own castle has fallen. */
const foes = (s: State) => (alive(s, me) ? players(s).filter((p) => alive(s, p) && enemies(s, me, p)) : []);

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
      el.onclick = () => { if (foes(match.state).includes(p)) target = p; };
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
  bots = players(match.state).filter((p) => p !== me).map((p) => createBot(p, seed + p));
  queued = [];
  paused = false;
  target = -1;
  cycleTarget();
  view.reset(match.state);
  buildBadges();
  ($('mode') as HTMLSelectElement).value = mode;
  try { localStorage.setItem('mode', mode); } catch { /* private window: just don't remember */ }
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
modeSelect.onchange = () => { restart(modeSelect.value as Mode); modeSelect.blur(); };

const sell = () => hover && queued.push({ type: 'sell', player: me, ...hover });
const launch = () => target >= 0 && queued.push({ type: 'launch', player: me, target });
const togglePause = () => { paused = !paused; say(paused ? 'Paused' : 'Go!', paused ? 1e6 : 1); };
$('pause').onclick = togglePause;
$('restart').onclick = () => restart();
$('sell').onclick = () => say('Point at one of your towers and press X.');
$('launch').onclick = () => !paused && launch();
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
  else queued.push({ type: 'build', player: me, tower: selected, ...hover });
});
addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.target instanceof HTMLSelectElement) return;
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
  if (winner === 'draw') return 'A draw. Press R to play again.';
  if (winner !== config.teams[me]) return 'The bots win. Press R to try again.';
  return players(match.state).some((p) => p !== me && config.teams[p] === winner) ? 'Your team wins! Press R to play again.' : 'You win! Press R to play again.';
}

try { const saved = localStorage.getItem('mode'); if (saved && saved in modes) mode = saved as Mode; } catch { /* use the default */ }
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
    const wasAlive = alive(match.state, me);
    const events = match.step([...queued.splice(0), ...bots.flatMap((bot) => bot(match.state, config))]);
    view.show(events);
    const why = reasons();
    for (const e of events) if (e.type === 'refused' && e.action.player === me) say(why[e.reason]);
    if (wasAlive && !alive(match.state, me)) say('Your castle has fallen! Your buildings are ruins now. Watch how it ends.', 6);
    if (match.state.winner !== null) say(winText(match.state.winner), 1e6);
  }
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
    c.button.classList.toggle('poor', s.gold[me] < c.def.cost);
  }
  if (now > messageUntil) $('message').textContent = '';
  const own = hover && s.towers.find((t) => t.cell === hover!.y * s.width + hover!.x);
  const def = config.content.towers[own ? own.id : selected];
  view.highlight(hover, !!own || !checkBuild(s, config, me, selected, hover?.x ?? -1, hover?.y ?? -1), def.kind === 'shooter' ? def.range / 1000 : 0);
  view.draw(s, config, paused ? 0 : seconds, me, target);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
