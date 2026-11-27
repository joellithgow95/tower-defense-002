# Instructions for coding agents

Low-poly fantasy maze tower defense. TypeScript, Three.js, Vite, Vitest. Desktop first.
Some contributors are new to code, git and coding agents.

## Working with contributors
- Explain what you are about to change, and why, in plain words. Define git and code terms the first time.
- Keep each change small: one idea per branch and pull request. Never commit straight to `main`.
- Before saying you're done, run `npm run check`. For anything visible, also look at it in the game.
- Ask before adding a dependency, deleting files, or changing how replays or the game core work.

## Layout
| Path | What |
|---|---|
| `content/` | Towers, troops, rules and maps as JSON. Most balance and map changes live only here |
| `src/core/` | The game itself: no graphics, no browser |
| `src/game/` | Three.js drawing (`view.ts`), models (`models.ts`), controls (`main.ts`), HTML styles |
| `tests/` | Vitest tests |
| `scripts/` | Headless bot matches and bug report replay |

## Rules for `src/core/`
Multiplayer, replays, puzzles, bots and training all rely on these.
- The same config and actions on the same ticks must give the same state on every machine.
- Whole numbers only. No `Math.random`, `Date`, `performance.now`, `sin`, `cos` or `sqrt`. For randomness use the seeded `rng()`.
- No imports from `three`, the DOM or `src/game/`.
- The game changes only through `step(state, config, actions)`. The view reads state and never writes it.
- 60 ticks per second. 60,000 distance units per cell.

## Content
- `speed` is thousandths of a cell per second; `range` is thousandths of a cell; `...Ticks` are 60ths of a second.
- Ids (`archer`) are permanent. Change `label` to rename something.
- A new tower or troop works with a placeholder block until it gets a model in `src/game/models.ts`.
- Board size comes from the map file, so smaller boards need no code change. Maps are two-sided: left half is team 0.

## Art
Low-poly, flat-shaded, built in code from simple shapes. One cell is 1 unit. Keep silhouettes easy to tell apart from the fixed camera, and always show the team colour.

## Reference
This is a rebuild of an earlier Godot prototype. `docs/design.md` records what carries over.
