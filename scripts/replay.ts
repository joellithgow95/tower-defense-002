// Re-run a bug report and check it matches:  npm run replay -- report.json
import { readFileSync } from 'node:fs';
import { fingerprint, runReplay } from '../src/core/match';

const report = JSON.parse(readFileSync(process.argv.at(-1)!, 'utf8'));
if (report.version !== 3) {
  console.log(`This report is version ${report.version}; this game only replays version 3. Check out an older commit to replay it.`);
  process.exit(1);
}
const state = runReplay(report);
const now = fingerprint(state);
console.log({ tick: state.tick, baseHealth: state.baseHealth, winner: state.winner, towers: state.towers.length, troops: state.troops.length });
console.log(now === report.fingerprint ? `Match: ${now}` : `MISMATCH: report ${report.fingerprint}, here ${now}`);
if (now !== report.fingerprint) process.exit(1);
