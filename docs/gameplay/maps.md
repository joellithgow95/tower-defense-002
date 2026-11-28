---
id: gameplay.maps
title: Maps
status: exploratory
created: 2026-11-28
updated: 2026-11-28
---
# Maps

How maps work today, how to add one, and what the next map, Drowned Woods, would need. The first two sections describe the game as built. The last section is proposals and open questions only.

## How maps work now

- Every map is one JSON file in [`content/maps/`](../../content/maps/). The game finds them by itself (`src/core/maps.ts`), so no code lists them.
- A map's **id** is its file name without `.json`, e.g. `three-crowns`. Never rename a map file: bug reports and replays refer to the id. Change `name` instead.
- A file has these fields:

  | Field | What |
  |---|---|
  | `name` | The name players see |
  | `description` | A sentence or two, shown as a tooltip when choosing a map |
  | `modes` | The game modes it can be played as, e.g. `["ffa", "twoVsOne"]`. The modes and their teams are in `src/core/config.ts` |
  | `startingTowers` | Buildings each player starts with: `player`, tower `id`, `x`, `y` |
  | `rows` | The board, one string per row: `.` grass, `#` rock, `1`–`4` each player's castle |

- The number of players is the number of castles, so a mode fits a map only if it has one player per castle. `2 v 2` needs four castles.
- **Choosing a map.** The same menu, "Map · mode" (e.g. "Three Crowns · 2 v 1"), is used for solo play against bots, shared-screen play and the online lobby. It lists every map with each mode it supports. Solo play remembers your last choice.
- **Online.** The host picks; the room sends the map id and the mode to every browser in its start message, and each browser builds the same match from its own copy of the map. The room's version check means everyone has the same map files. The room server itself has no map files: it checks only that the id looks like one.
- **Replays and bug reports** save the whole map, including its id, inside the report. A report replays the same even if the map file changes later; `npm run replay` says so when it notices.
- **Headless matches:** `npm run sim -- --map three-crowns` plays every mode that map supports, `--mode twoVsOne` narrows it, and `--map all` plays every map and mode. `npm run replay -- report.json --map three-crowns` also checks which map the report was on.

## How to add a map

1. Copy a map with the same number of players, e.g. `content/maps/three-crowns.json`, to a new file named in lowercase with dashes: `content/maps/misty-ford.json`.
2. Change `name` and `description`, draw the board in `rows` (every row the same length), and move the `startingTowers` onto grass near their castles.
3. List its `modes`.
4. Run `npm run check`. If something is wrong, the `content` test says what and in which file.
5. Play it with `npm run dev`, and run `npm run sim -- --map misty-ford` to see bots finish matches on it.

A new **mode** (say, a 2 v 1 v 1) is a code change: add it to `modes` in `src/core/config.ts`, then list it in the maps that support it.

## Terrain for Drowned Woods

Drowned Woods is planned as a wetland map with water, shallows, causeways and a sluice. Today the core knows only grass, rock and castles: `rock` is one `boolean[]` in `State`, and troops find their way by counting steps (`src/core/grid.ts`), so every open cell costs the same. Everything below is a proposal.

### Proposed cell letters and rules

| Terrain | Letter (proposal) | Walk | Build | Notes |
|---|---|---|---|---|
| Shallows | `~` | Yes, slowly | Yes? | Open question below |
| Deep water | `w` | No | No | Like rock that towers can't stand on either |
| Causeway | `=` | Yes, quickly | No | Keeps a fast lane open that no one can wall off |
| Drowned tree | `T` | No | No | A blocker that looks different from rock |
| Habitat | `h` | Yes | No? | Spawning grounds from the Alderfen sluice idea in [campaign missions](campaign-missions.md) |
| Sluice | `S` | No | No | A machine cell; see below |
| Calling stone | `C` | No | No | A machine cell; see below |

Single letters keep `rows` easy to draw by hand. A per-map `legend` field could map letters to terrain instead, so a later map can reuse letters.

### What the core would need

- **A terrain kind per cell** instead of `rock: boolean[]`, still whole numbers: e.g. `terrain: number[]` with a small table of rules from `content/terrain.json` (walkable, buildable, move cost).
- **Weighted routes.** Slow and fast cells only change routes if the route finder counts cost instead of steps. A whole-number Dijkstra with a fixed tie-break order would keep it deterministic. Troop speed per cell would also need to change.
- **Validation:** every castle still needs a route to every enemy castle, and starting towers can't sit on water.
- **Drawing:** water, shallows, causeways and trees in `src/game/models.ts`.

### Machinery: the sluice and the calling stone

A sluice that "changes terrain for everyone when a player interacts with it" means terrain can change during a match. That is a bigger step than static terrain:

- Terrain moves into `State` (it changes), and a new action such as `{ type: 'use', player, x, y }` goes through `step`. This changes the replay format and the core, so it needs Joel's approval first, per [`AGENTS.md`](../../AGENTS.md).
- When water rises or falls, troops standing on newly deep cells need a rule (pushed to the nearest dry cell? drowned?), and the "every castle keeps a route" rule must still hold.
- The calling stone's effect isn't decided. It might summon a neutral creature, or call habitat creatures to defend. It would use the same `use` action.

### Open questions

- [`design.md`](../design.md) lists "water (slows)" and "swamp (slows, takes more damage)" as wanted terrain. Here, deep water is impassable and shallows are the slow cells. Which is right, or are both kinds of water wanted?
- Can you build on shallows?
- Who may use the sluice: anyone, whoever has land next to it, or whoever holds it? Does it cost gold, and can it be used again (and how soon)?
- Does a sluice change take effect at once or over a few seconds, so players can react?
- Should habitat cells do anything in a versus match, or only in campaign missions?
- Is a map's "modes" list enough, or should a map also say which modes it is *best* for (e.g. Drowned Woods built for 2 v 2)?
- Should maps have `label` like towers and troops do, instead of `name`? Today `name` is kept because it was already there and is saved in old bug reports.
