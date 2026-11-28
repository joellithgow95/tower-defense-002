/// <reference types="vite/client" />
/**
 * Every map in content/maps/, found automatically: add a JSON file there and it shows up in the game,
 * the online lobby and `npm run sim`. A map's id is its file name without ".json"; never rename one,
 * because replays and bug reports refer to it. Change "name" to rename a map for players.
 *
 * `import.meta.glob` is a Vite feature, so the online server (worker/), which isn't built by Vite,
 * must never import this file. src/net/ gets the map's id in messages instead.
 */
import { type Choice, type Mode, defaultChoice, isMode, matchConfig, modes } from './config';
import { castleCells } from './sim';
import type { Config, MapDef } from './types';
import { mapProblems, problems } from './validate';

/** A map from content/maps/, with its id filled in from the file name. */
export type MapFile = MapDef & { id: string; name: string; description: string; modes: string[] };

const files = import.meta.glob<MapDef>('../../content/maps/*.json', { eager: true, import: 'default' });

export const maps: Record<string, MapFile> = Object.fromEntries(
  Object.entries(files).map(([path, map]) => {
    const id = path.slice(path.lastIndexOf('/') + 1, -'.json'.length);
    return [id, { ...map, id } as MapFile];
  }),
);

const castles = (id: string) => castleCells(maps[id].rows ?? []).length;

/** Map ids from fewest players to most, then by id, so menus and `npm run sim` keep a steady order. */
export const mapIds: string[] = Object.keys(maps).sort((a, b) =>
  castles(a) - castles(b) || (a < b ? -1 : a > b ? 1 : 0));

/** The map lists this mode, and has one castle per player for it. */
export const supports = (map: string, mode: string): mode is Mode =>
  Object.hasOwn(maps, map) && isMode(mode) && (maps[map].modes ?? []).includes(mode) && modes[mode].teams.length === castles(map);

/** Every map and mode that can be played, in menu order. */
export const choices: Choice[] = mapIds.flatMap((map) => (maps[map].modes ?? []).filter((mode): mode is Mode => supports(map, mode)).map((mode) => ({ map, mode })));

/** The first map (in menu order) that can be played as this mode. */
export const mapFor = (mode: Mode) => choices.find((c) => c.mode === mode)?.map ?? defaultChoice.map;

/** "Three Crowns · 2 v 1": how a choice reads in a menu. */
export const choiceLabel = ({ map, mode }: Choice) => `${maps[map]?.name ?? map} · ${modes[mode].label}`;

/** The config for a match, or an Error that says what is wrong with the choice. */
export function configFor({ map, mode }: Choice): Config {
  if (!Object.hasOwn(maps, map)) throw new Error(`There is no map called "${map}" in content/maps/.`);
  if (!supports(map, mode)) throw new Error(`content/maps/${map}.json can't be played as "${mode}". Check its "modes" list and its castles.`);
  return matchConfig(maps[map], mode);
}

export const defaultConfig: Config = configFor(defaultChoice);

export { type Choice, defaultChoice };

/** Every mistake in content/: each map file, and each map played as each of its modes. Empty means all good. */
export function contentProblems(): string[] {
  const out = new Set<string>();
  for (const id of mapIds) {
    const map = maps[id];
    for (const p of mapProblems(map)) out.add(p);
    const playable = (map.modes ?? []).filter((m): m is Mode => supports(id, m));
    for (const mode of playable) for (const p of problems(matchConfig(map, mode))) out.add(p);
  }
  return [...out];
}
