// Bots against each other with no graphics:  npm run sim -- 20   or, for another mode:  npm run sim -- 20 ffa
import { createBot } from '../src/core/bot';
import { type Mode, modes } from '../src/core/config';
import { Match, fingerprint } from '../src/core/match';

const args = process.argv.slice(2);
const games = Number(args.find((a) => /^\d+$/.test(a))) || 5;
const mode = (args.find((a) => a in modes) ?? 'duel') as Mode;
const config = modes[mode].config;
console.error(`${games} games of ${modes[mode].label}`);
const started = performance.now();
for (let seed = 1; seed <= games; seed++) {
  const match = new Match(config);
  const bots = config.teams.map((_, p) => createBot(p, seed + 1000 * p));
  while (match.state.winner === null && match.state.tick < 60 * 60 * 10) match.step(bots.flatMap((b) => b(match.state, config)));
  const s = match.state;
  console.log(JSON.stringify({ seed, winner: s.winner, seconds: Math.round(s.tick / 60), baseHealth: s.baseHealth, fingerprint: fingerprint(s) }));
}
console.error(`${games} games in ${((performance.now() - started) / 1000).toFixed(1)} s`);
