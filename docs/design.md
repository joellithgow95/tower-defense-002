# Design

## What carries over from the prototype
- Towers are walls. Troops re-route whenever the board changes. A build that would wall anyone in is refused.
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

## How this version differs for now
- The board is the prototype's default turned sideways for desktop.
- Shots hit instantly; the arrow is only visual. (The prototype's arrows travelled.)
- Troops move through cells on whole-number steps, so old balance numbers and puzzle solutions need rechecking.
