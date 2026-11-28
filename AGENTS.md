<!-- KEEP THIS FILE IN SYNC — update when a path, rule or workflow changes. -->
# Instructions for coding agents

A low-poly fantasy maze tower defense in TypeScript, Three.js, Vite and Vitest, played on desktop first.
It is a small game built together by a family, not an engine or a library, and some contributors
are new to code, git and coding agents.

Contributors use different agents (Claude Code, Codex, Cursor and others). This file is the one set
of rules for all of them; `CLAUDE.md` only imports it. Don't depend on skills or plugins from outside
this repo: other contributors can't load them.

## Map

| Path | What |
|---|---|
| `content/` | Towers, troops, rules and maps as JSON. Most balance and map changes live only here |
| `src/core/` | The game itself: no graphics, no browser. Strict rules below |
| `src/game/` | Three.js drawing (`view.ts`), models (`models.ts`), controls (`main.ts`), HTML styles |
| `tests/` | Vitest tests |
| `scripts/` | Headless bot matches (`npm run sim`) and bug report replay (`npm run replay`) |
| `docs/` | Plan, game design, creative vision, worldbuilding and decisions. Read [`docs/AGENTS.md`](docs/AGENTS.md) before editing there |
| `.github/` | Issue forms, the PR template, and the `Check` workflow that runs `npm run check` on every PR |

## Working with contributors

- Explain what you are about to change, and why, in plain words. Define git and code terms the first time.
- Keep each change small: one idea per branch and pull request (PR).
- Start every change from an up-to-date `main`: `git switch main`, `git pull`, then a new branch named `<github-username>/<short-description>`, e.g. `sam/archer-range`.
- Commit messages are `type: what changed`, where type is `feat`, `fix`, `docs`, `test`, `refactor` or `chore`, e.g. `feat: archer shoots farther`. Add a line saying why when it isn't obvious.
- Before saying you're done, run `npm run check`. For anything visible, also look at it in the game with `npm run dev`.
- Open a PR using the template. Joel reviews and merges every PR; never merge one yourself.
- Ask before adding a dependency, deleting files, or changing how replays or the game core work.

## Hard rules

- **Never commit or push to `main`.** Every change goes through a PR so a second person sees it first.
- **Never put passwords, tokens or keys in code, commits, issues or chat.** The repo is public: anyone can read it, history included.
- **Never change a content id** such as `archer`. Replays and bug reports refer to it; change `label` to rename something.
- **Never treat proposed lore as a game rule.** Worldbuilding is exploration until a decision is accepted; see [`docs/AGENTS.md`](docs/AGENTS.md).

## Rules for `src/core/`

Multiplayer, replays, puzzles, bots and training all rely on these.

- The same config and actions on the same ticks must give the same state on every machine.
- Whole numbers only. No `Math.random`, `Date`, `performance.now`, `sin`, `cos` or `sqrt`. For randomness use the seeded `rng()`.
- No imports from `three`, the DOM or `src/game/`.
- The game changes only through `step(state, config, actions)`. The view reads state and never writes it.
- 60 ticks per second. 60,000 distance units per cell.

## Content

- `speed` is thousandths of a cell per second; `range` is thousandths of a cell; `...Ticks` are 60ths of a second.
- A new tower or troop works with a placeholder block until it gets a model in `src/game/models.ts`.
- Board size comes from the map file, so smaller boards need no code change. Team 0's castle is `1` in the map file. Where each side may build comes from `buildRadius` and `castleNoBuildRadius` in `content/rules.json`, not from the map.

## Art

Low-poly, flat-shaded, built in code from simple shapes. One cell is 1 unit. Keep silhouettes easy to tell apart from the fixed camera, and always show the team colour.

## Gotchas

- A mistake in a `content/` JSON file fails the `content` test in `npm run check` with a plain-English message. Read it before touching code.
- Script arguments go after `--`: `npm run sim -- 20`, not `npm run sim 20`.
- Copy a bug report before restarting: restart begins a new match, and the old one can no longer be copied.

## Reference

This is a rebuild of an earlier Godot prototype. [`docs/design.md`](docs/design.md) records what carries over.
