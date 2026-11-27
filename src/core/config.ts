import rules from '../../content/rules.json';
import towers from '../../content/towers.json';
import troops from '../../content/troops.json';
import rockyPass from '../../content/maps/rocky-pass.json';
import type { Config, MapDef, TowerDef } from './types';

export const defaultConfig: Config = {
  map: rockyPass as MapDef,
  rules,
  content: { troops, towers: towers as Record<string, TowerDef> },
};
