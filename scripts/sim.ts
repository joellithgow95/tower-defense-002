// Bot vs bot with no graphics:  npm run sim -- 20
import { createBot } from '../src/core/bot';
import { defaultConfig } from '../src/core/config';
import { Match, fingerprint } from '../src/core/match';

const games = Number(process.argv.at(-1)) || 5;
const started = performance.now();
for (let seed = 1; seed <= games; seed++) {
  const match = new Match(defaultConfig);
  const bots = [createBot(0, seed), createBot(1, seed + 1000)];
  while (match.state.winner === null && match.state.tick < 60 * 60 * 10) match.step(bots.flatMap((b) => b(match.state, defaultConfig)));
  const s = match.state;
  console.log(JSON.stringify({ seed, winner: s.winner, seconds: Math.round(s.tick / 60), baseHealth: s.baseHealth, fingerprint: fingerprint(s) }));
}
console.error(`${games} games in ${((performance.now() - started) / 1000).toFixed(1)} s`);
