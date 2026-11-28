// Re-run a bug report and check it matches:  npm run replay -- report.json
// Add --map <id> to also check the report was played on that map:  npm run replay -- report.json --map three-crowns
import { readFileSync } from 'node:fs';
import { fingerprint, runReplay } from '../src/core/match';
import { maps } from '../src/core/maps';
import { readArgs } from './args';

const { flags, words } = readArgs(process.argv.slice(2));
const file = words.at(-1);
if (!file) fail('Say which report to replay: npm run replay -- report.json');
const report = JSON.parse(readFileSync(file, 'utf8'));
if (report.version !== 2) fail(`This report is version ${report.version}; this game only replays version 2. Check out an older commit to replay it.`);

// The report carries the whole map it was played on, so it replays the same even if the map file has changed since.
const map = report.config.map;
console.log(`Map: ${map.name} (${map.id ?? 'id not recorded: this report is older than map ids'}), ${report.config.teams.length} players, teams ${JSON.stringify(report.config.teams)}`);
if (flags.map !== undefined && flags.map !== map.id) fail(`This report was played on ${map.id ?? map.name}, not ${flags.map}.`);
const current = map.id ? maps[map.id] : undefined;
if (current && (JSON.stringify(current.rows) !== JSON.stringify(map.rows) || JSON.stringify(current.startingTowers) !== JSON.stringify(map.startingTowers))) {
  console.log(`Note: content/maps/${map.id}.json has changed since this report. The replay uses the map saved in the report.`);
}

const state = runReplay(report);
const now = fingerprint(state);
console.log({ tick: state.tick, baseHealth: state.baseHealth, winner: state.winner, towers: state.towers.length, troops: state.troops.length });
console.log(now === report.fingerprint ? `Match: ${now}` : `MISMATCH: report ${report.fingerprint}, here ${now}`);
if (now !== report.fingerprint) process.exit(1);

function fail(message: string): never {
  console.log(message);
  process.exit(1);
}
