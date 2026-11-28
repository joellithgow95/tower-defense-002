import rules from '../../content/rules.json';
import towers from '../../content/towers.json';
import troops from '../../content/troops.json';
import spirits from '../../content/spirits.json';
import rockyPass from '../../content/maps/rocky-pass.json';
import threeCrowns from '../../content/maps/three-crowns.json';
import fourCrossroads from '../../content/maps/four-crossroads.json';
import type { Config, MapDef, SpiritDef, TowerDef } from './types';

const content = { troops, towers: towers as Record<string, TowerDef>, spirits: spirits as Record<string, SpiritDef> };
export const maps = { rockyPass: rockyPass as MapDef, threeCrowns: threeCrowns as MapDef, fourCrossroads: fourCrossroads as MapDef };

/** Ways to play. `teams[p]` is player p's team: different numbers fight, equal numbers are allies. */
export const modes = {
  duel: { label: '1 v 1', config: { map: maps.rockyPass, rules, content, teams: [0, 1] } },
  ffa: { label: '3-way free-for-all', config: { map: maps.threeCrowns, rules, content, teams: [0, 1, 2] } },
  fourWay: { label: '4-way free-for-all', config: { map: maps.fourCrossroads, rules, content, teams: [0, 1, 2, 3] } },
  twoVsTwo: { label: '2 v 2', config: { map: maps.fourCrossroads, rules, content, teams: [0, 0, 1, 1] } },
  twoVsOne: { label: '2 v 1', config: { map: maps.threeCrowns, rules, content, teams: [0, 0, 1] } },
  oneVsTwo: { label: '1 v 2', config: { map: maps.threeCrowns, rules, content, teams: [0, 1, 1] } },
} satisfies Record<string, { label: string; config: Config }>;

export type Mode = keyof typeof modes;
export const defaultConfig: Config = modes.duel.config;

/** A mode's config with each player's chosen spirit. */
export const withSpirits = (config: Config, spirits: string[]): Config => ({ ...config, spirits: [...spirits] });
