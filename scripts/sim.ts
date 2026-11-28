// Bots against each other with no graphics.
//   npm run sim -- 20                                      20 games of Rocky Pass, 1 v 1
//   npm run sim -- 20 --map three-crowns                   every mode Three Crowns can be played as
//   npm run sim -- --map three-crowns --mode twoVsOne      one map, one mode
//   npm run sim -- --mode ffa   (or just: npm run sim -- ffa)   every map that has that mode
//   npm run sim -- --map all                               every map, every mode
import { createBot } from '../src/core/bot';
import { isMode, modes } from '../src/core/config';
import { Match, fingerprint } from '../src/core/match';
import { type Choice, choiceLabel, choices, configFor, defaultChoice, mapIds } from '../src/core/maps';
import { readArgs } from './args';

const { flags, words } = readArgs(process.argv.slice(2));
const games = Number(words.find((a) => /^\d+$/.test(a))) || 5;
const map = flags.map;
const mode = flags.mode ?? words.find((a) => isMode(a));
if (map && map !== 'all' && !mapIds.includes(map)) fail(`There is no map called "${map}". The maps are: ${mapIds.join(', ')}, or "all".`);
if (mode !== undefined && !isMode(mode)) fail(`There is no mode called "${mode}". The modes are: ${Object.keys(modes).join(', ')}.`);

const picked: Choice[] = !map && !mode ? [defaultChoice] : choices.filter((c) => (!map || map === 'all' || c.map === map) && (!mode || c.mode === mode));
if (!picked.length) fail(`${map} can't be played as ${mode}.`);

const started = performance.now();
for (const choice of picked) {
  const config = configFor(choice);
  console.error(`${games} games of ${choiceLabel(choice)}`);
  for (let seed = 1; seed <= games; seed++) {
    const match = new Match(config);
    const bots = config.teams.map((_, p) => createBot(p, seed + 1000 * p));
    while (match.state.winner === null && match.state.tick < 60 * 60 * 10) match.step(bots.flatMap((b) => b(match.state, config)));
    const s = match.state;
    console.log(JSON.stringify({ map: choice.map, mode: choice.mode, seed, winner: s.winner, seconds: Math.round(s.tick / 60), baseHealth: s.baseHealth, fingerprint: fingerprint(s) }));
  }
}
console.error(`${games * picked.length} games in ${((performance.now() - started) / 1000).toFixed(1)} s`);

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
