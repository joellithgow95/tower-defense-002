---
id: design
title: Design
status: accepted
created: 2026-11-27
updated: 2026-11-27
---
# Design

## What carries over from the prototype
- Towers are walls. Troops re-route whenever the board changes. A build that would wall anyone in is refused.
- You can build on a cell troops are walking through: they turn back and re-route. The one exception is a troop that has only just stepped out of its building.
- Shooting towers defend; spawner buildings attack.
- Selling takes 3 seconds, so routes can't be flipped instantly. It refunds 60%.
- Inspirations: Comet Crash first, then Desktop Tower Defense and Fieldrunners; Bloons and Kingdom Rush for tower feel.
- Balance rule: every card needs a job that no other card does better.

## Wanted later
- Multiplayer, daily puzzles scored by moves ("strokes" and par), and a campaign with dialogue
- Whimsical fantasy tribes: Kingdom, Goblins, Elves, Wizards; later Dwarves, Undead, a frog tribe
- Terrain: swamp (slows, takes more damage), water (slows), forest (cover), mountains
- Card and deck modes, turn-based mode
- A headless simulator for balance, bots and ML training
- A smaller-board mode for phones

## Players and teams
- Two to four players (`MAX_PLAYERS` in `src/core/sim.ts`). Each has their own castle, gold, land and buildings.
- Every player is on a team, set by the game mode in `src/core/config.ts`: `[0, 1, 2]` is a free-for-all, `[0, 0, 1]` is two against one. Allies never shoot each other's troops and can't attack each other.
- A castle at 0 health has fallen. That player's troops disband and their buildings become grey ruins: still walls, so routes don't suddenly change, but they do nothing. The player can watch the rest of the match.
- A team loses when all its castles have fallen; the last team standing wins.
- Every standing castle must keep a route to every standing enemy castle; a build that would cut one is refused.

## Armies (inspired by Comet Crash)
- Spawner buildings don't send troops on their own. They train them into a garrison at your castle.
- Each spawner adds `garrison` room for its troop (`content/towers.json`). A full garrison stops training until you launch.
- **Launch** (Space) sends your whole garrison at the enemy castle you are aiming at (click it, or press T). Troops leave the castle in single file, one every `launchGapTicks`, and take the shortest route.
- If their target falls while they march, they turn on the nearest enemy still standing.
- The garrison doesn't defend; your towers do.
- Later ideas: launch only part of the garrison, pick which troops go, launch from a spawner instead of the castle.

## Land
- You may build within `buildRadius` cells of your castle or any of your standing buildings, counting diagonals (a square ring). Every building spreads your land, so you can creep across the board. A building being sold stops counting at once.
- Nobody may build within `castleNoBuildRadius` cells of a standing enemy castle, so a spawner can't sit on its doorstep. Set it to 0 to allow rushing.
- Both live in `content/rules.json` (defaults 3 and 3). Range only matters when you place something: a building left outside your land stays.
- Next: buildings get health and shooters can hit enemy buildings, never the castle, so a creeping front can be pushed back.

## How this version differs for now
- Each player is a spirit (Wisp or Mire) that walks the board and flies as a wisp to build. Launching and selling now need your spirit walking within reach. Exploratory, see [spirits](gameplay/spirits.md).
- The board is no longer split in halves.
- The board is the prototype's default turned sideways for desktop.
- Shots hit instantly; the arrow is only visual. (The prototype's arrows travelled.)
- Troops move through cells on whole-number steps, so old balance numbers and puzzle solutions need rechecking.
