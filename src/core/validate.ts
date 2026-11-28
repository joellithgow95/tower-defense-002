/** Plain-English checks for the files in content/, so a typo says what to fix. */
import { MAX_PLAYERS, castleCells, spiritIds } from './sim';
import type { Config } from './types';

export function problems(config: Config): string[] {
  const { content, map, rules, teams } = config;
  const out: string[] = [];
  const whole = (where: string, obj: object, keys: string[]) => {
    for (const k of keys) {
      const v = (obj as Record<string, unknown>)[k];
      if (!Number.isInteger(v) || (v as number) <= 0) out.push(`${where}: "${k}" must be a whole number above 0 (it is ${JSON.stringify(v)}).`);
    }
  };
  for (const [id, t] of Object.entries(content.troops)) {
    const where = `content/troops.json → ${id}`;
    if (!t.label) out.push(`${where}: give it a "label", the name players see.`);
    whole(where, t, ['health', 'speed', 'damage', 'bounty']);
    if (t.speed >= 60000) out.push(`${where}: "speed" is too fast; keep it under 60000.`);
  }
  for (const [id, t] of Object.entries(content.towers)) {
    const where = `content/towers.json → ${id}`;
    if (!t.label) out.push(`${where}: give it a "label", the name players see.`);
    if (t.kind === 'shooter') whole(where, t, ['cost', 'range', 'fireTicks', 'damage']);
    else if (t.kind === 'spawner') {
      whole(where, t, ['cost', 'spawnTicks', 'garrison']);
      if (!content.troops[t.troop]) out.push(`${where}: there is no troop called "${t.troop}" in content/troops.json.`);
    } else out.push(`${where}: "kind" must be "shooter" or "spawner".`);
  }
  for (const [id, sp] of Object.entries(content.spirits)) {
    const where = `content/spirits.json → ${id}`;
    if (!sp.label) out.push(`${where}: give it a "label", the name players see.`);
    if (!sp.passive) out.push(`${where}: describe its passive in "passive", in words players see.`);
    whole(where, sp, ['walkSpeed', 'reach']);
    if (sp.walkSpeed >= 60000) out.push(`${where}: "walkSpeed" is too fast; keep it under 60000.`);
    if (!Array.isArray(sp.kit) || !sp.kit.length) out.push(`${where}: "kit" must list at least one tower it can build, e.g. ["archer"].`);
    else for (const tower of sp.kit) if (!content.towers[tower]) out.push(`${where}: its kit lists "${tower}", but there is no tower called that in content/towers.json.`);
    for (const k of ['troopSpeedPercent', 'troopHealthPercent'] as const) {
      const v = sp[k];
      if (v !== undefined && (!Number.isInteger(v) || v < 50 || v > 200)) out.push(`${where}: "${k}" must be a whole number from 50 to 200 (it is ${JSON.stringify(v)}). Leave it out for 100.`);
    }
  }
  whole('content/rules.json', rules, ['startingGold', 'goldPerIncome', 'incomeTicks', 'baseHealth', 'refundPercent', 'demolishTicks', 'buildRadius', 'launchGapTicks']);
  if (!Number.isInteger(rules.castleNoBuildRadius) || rules.castleNoBuildRadius < 0) {
    out.push(`content/rules.json: "castleNoBuildRadius" must be a whole number, 0 or more (it is ${JSON.stringify(rules.castleNoBuildRadius)}). Use 0 to turn it off.`);
  }

  const where = `map "${map.name}"`;
  const width = map.rows[0]?.length ?? 0;
  if (!width || map.rows.some((r) => r.length !== width)) out.push(`${where}: every row must be the same length.`);
  const flat = map.rows.join('');
  if (/[^.#1-9]/.test(flat)) out.push(`${where}: use only . (grass), # (rock) and 1, 2, 3... (each player's castle).`);
  const castles = castleCells(map.rows).length;
  if (castles < 2) out.push(`${where}: put at least two castles on it, "1" and "2".`);
  if (castles > MAX_PLAYERS) out.push(`${where}: has ${castles} castles; the most a map may have is ${MAX_PLAYERS}.`);
  for (let digit = 1; digit <= 9; digit++) {
    const count = flat.split(String(digit)).length - 1;
    if (digit <= castles && count !== 1) out.push(`${where}: there must be exactly one "${digit}".`);
    if (digit > castles && count) out.push(`${where}: castle "${digit}" needs castles 1 to ${digit - 1} too.`);
  }
  if (teams.length !== castles) out.push(`${where} has ${castles} castles, but this game mode has ${teams.length} players.`);
  const chosen = spiritIds(config);
  if (chosen.length !== teams.length) out.push(`This game mode has ${teams.length} players but ${chosen.length} spirits; give each player one.`);
  for (const id of chosen) if (!content.spirits[id]) out.push(`There is no spirit called "${id}" in content/spirits.json.`);
  if (new Set(teams).size < 2) out.push(`${where}: a game needs at least two teams.`);
  for (const t of map.startingTowers) {
    if (!(t.player >= 0 && t.player < castles)) out.push(`${where}: a starting ${t.id} belongs to player ${t.player}, who has no castle.`);
    if (!content.towers[t.id]) out.push(`${where}: there is no tower called "${t.id}".`);
    if (map.rows[t.y]?.[t.x] !== '.') out.push(`${where}: the starting ${t.id} at x ${t.x}, y ${t.y} must be on grass.`);
  }
  return out;
}
