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
- Shooting towers defend; spawner buildings attack. A castle at 0 health loses.
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

## Land
- You may build within `buildRadius` cells of your castle or any of your standing buildings, counting diagonals (a square ring). Every building spreads your land, so you can creep across the board. A building being sold stops counting at once.
- Nobody may build within `castleNoBuildRadius` cells of the enemy castle, so a spawner can't sit on its doorstep. Set it to 0 to allow rushing.
- Both live in `content/rules.json` (defaults 3 and 3). Range only matters when you place something: a building left outside your land stays.
- Next: buildings get health and shooters can hit enemy buildings, never the castle, so a creeping front can be pushed back.

## How this version differs for now
- The board is no longer split in halves.
- The board is the prototype's default turned sideways for desktop.
- Shots hit instantly; the arrow is only visual. (The prototype's arrows travelled.)
- Troops move through cells on whole-number steps, so old balance numbers and puzzle solutions need rechecking.
