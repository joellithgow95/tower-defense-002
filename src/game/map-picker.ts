/**
 * The map-and-mode menu, e.g. "Three Crowns · 2 v 1". The same list is used offline, for shared-screen play
 * and in the online lobby, and it grows by itself when a map is added to content/maps/.
 */
import { type Choice, choiceLabel, choices, maps, supports } from '../core/maps';

const valueOf = (c: Choice) => `${c.map}/${c.mode}`;

/** Fill `select` with every playable choice; `onPick` gets the one picked. */
export function fillMapPicker(select: HTMLSelectElement, onPick: (c: Choice) => void) {
  for (const c of choices) {
    const option = new Option(choiceLabel(c), valueOf(c));
    option.title = maps[c.map].description;
    select.append(option);
  }
  select.onchange = () => {
    const [map, mode] = select.value.split('/');
    if (supports(map, mode)) onPick({ map, mode });
  };
}

export function showChoice(select: HTMLSelectElement, c: Choice) {
  select.value = valueOf(c);
  select.title = maps[c.map]?.description ?? '';
}
