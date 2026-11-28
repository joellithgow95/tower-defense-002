/**
 * Rules, buildings, troops and game modes. Maps live in content/maps/ and are found by src/core/maps.ts.
 * This file imports no maps, so the online server (worker/) can use the modes without them.
 */
import rules from '../../content/rules.json';
import towers from '../../content/towers.json';
import troops from '../../content/troops.json';
import type { Config, Content, MapDef, Rules, TowerDef } from './types';

export const content: Content = { troops, towers: towers as Record<string, TowerDef> };
export const gameRules: Rules = rules;

/**
 * Ways to play. `teams[p]` is player p's team: different numbers fight, equal numbers are allies.
 * A map says which of these it supports in its "modes" list; a mode needs one castle per player.
 */
export const modes = {
  duel: { label: '1 v 1', teams: [0, 1] },
  ffa: { label: '3-way free-for-all', teams: [0, 1, 2] },
  fourWay: { label: '4-way free-for-all', teams: [0, 1, 2, 3] },
  twoVsTwo: { label: '2 v 2', teams: [0, 0, 1, 1] },
  twoVsOne: { label: '2 v 1', teams: [0, 0, 1] },
  oneVsTwo: { label: '1 v 2', teams: [0, 1, 1] },
} satisfies Record<string, { label: string; teams: number[] }>;

export type Mode = keyof typeof modes;
export const isMode = (id: unknown): id is Mode => typeof id === 'string' && Object.hasOwn(modes, id);

/** What a match is played on: a map id (its file name in content/maps/) and one of the modes it supports. */
export interface Choice { map: string; mode: Mode }
export const defaultChoice: Choice = { map: 'rocky-pass', mode: 'duel' };
/** Map ids are file names: lowercase letters, numbers and dashes. */
export const MAP_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The config for one match: this map, played as this mode. */
export function matchConfig(map: MapDef, mode: Mode): Config {
  return { map, rules: gameRules, content, teams: [...modes[mode].teams] };
}
