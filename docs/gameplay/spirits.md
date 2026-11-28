---
id: gameplay.spirits
title: Spirits, walk mode and cursor mode
status: exploratory
created: 2026-11-28
updated: 2026-11-28
---
# Spirits

The idea is Joel's (agreed 2026-11-28; his answers to the first round of questions are folded in below). Players aren't peoples. Each player is a force or spirit of the Lyth, and the creatures and folk who answer that spirit are its towers and troops. Those same creatures turn up on their own in the campaign, and a spirit's followers mix species, so a species never stands for a side (see [decision 0002](../decisions/0002-cultural-coexistence.md)).

This is a first pass, kept small. The numbers are guesses for playtesting.

## The two spirits

They live in [`content/spirits.json`](../../content/spirits.json). The ids `wisp` and `mire` never change; art and replays use them.

| | Wisp | Mire |
|---|---|---|
| Feel | Will-o'-the-wisp: mist, lights, misdirection. Quick and light | Sinking, holding, bog. Slower and sturdier |
| `walkSpeed` | 4000 (4 cells a second) | 3000 (3 cells a second) |
| `reach` | 1500 (1.5 cells) | 2000 (2 cells) |
| `kit` | Archer Tower, Barracks | Archer Tower, Knight Hall |
| Passive | Its troops march 15% faster (`troopSpeedPercent: 115`) | Its troops have 20% more health (`troopHealthPercent: 120`) |

- The kit only limits what you may **build**. Troops come from whatever your spawners train. A map's starting buildings, such as each side's Barracks on Rocky Pass, are kept whatever your spirit.
- Each passive is one optional field. Leave it out for 100%. The content check accepts 50 to 200.
- If nobody chooses, players alternate Wisp, Mire, Wisp, Mire, so in 2 v 2 each team has one of each.

## Two modes

**Walk mode.** The spirit is a body on the board, which you steer like a Comet Crash ship.
- You can **build within `reach`** of where the body stands. The usual land rules and your kit still apply.
- Later, map machinery such as sluices and calling stones will be used from here, also within reach.

**Cursor mode.** The spirit becomes a wisp that flies freely as the cursor. It can **build anywhere on your land** (`buildRadius`, `castleNoBuildRadius`). The body rests where you left it, drawn smaller, and doesn't move.

**Launch and sell work as before**, from the cursor side, in either mode. Space launches your garrison at your target, and X sells the building under the cursor. That is the accepted rule in [design.md](../design.md); spirits don't change it.

**Switching back to walk puts you back in your body**, wherever the wisp had flown. In effect the wisp teleports home. Every spirit starts each match walking, standing on its own castle; its body is drawn on the castle roof so it can be seen.

## What blocks the walking body

| Thing | Walking body | Wisp (cursor) | Troops and routes |
|---|---|---|---|
| Rock `#` | Blocks | Flies over | Blocks troops, as before |
| Your own and your allies' buildings and castles | Walk through | Flies over | Unchanged |
| Enemy buildings, castles and ruins | Block | Flies over | Unchanged |
| Troops | Walk through | Flies over | Unchanged |

- Spirits never block troops and never affect routing. They aren't in `blockedCells`.
- Future terrain follows the same table: deep water blocks the body, and shallows slow it.
- The rule lives in `walkable()` in `src/core/sim.ts`. The body moves one axis at a time, so it slides along a wall.
- A body caught inside a cell an enemy has just built on may always walk out.

## Where it lives in the state

`state.spirits[p]` holds one spirit per player, in a fixed key order so fingerprints match:

| Field | What |
|---|---|
| `id` | `wisp` or `mire` |
| `mode` | `walk` or `cursor` |
| `x`, `y` | Where the body stands, in distance units (60,000 per cell) from the top-left cell centre. Whole numbers |
| `dx`, `dy` | The direction it is walking: -1, 0 or 1 each |
| `wispCell` | The last cell the wisp built on, so other screens can show where it is |

Each player's chosen spirit goes in `config.spirits` (an array like `teams`). Replays carry the config, so they replay the same spirits. **Replays are now version 3**: version 2 bug reports no longer replay, because the state has new fields and its fingerprints change.

## Movement as actions

The game is lockstep: only actions travel online, never positions. So walking is sent as **changes of direction**, not as a position every tick.

| Action | Effect |
|---|---|
| `{ type: 'spirit-move', player, x, y }` | Hold a direction (-1, 0 or 1 on each axis). Sent when the keys, stick or mouse direction change, so a long walk costs a handful of actions. Refused with `needs-walk` while flying |
| `{ type: 'spirit-mode', player, mode }` | Set walk or cursor. It sets the mode rather than toggling it, so a repeated message can't flip it back. Switching mode stops the body |
| `build` | Unchanged shape. While walking, refused with `out-of-reach` unless the cell is within reach of the body. Refused with `not-in-kit` for a tower outside the kit. The build says which cell, so the wisp's movements are never sent: your screen draws your wisp at your cursor, and everyone else sees it appear at each cell it builds on |
| `launch`, `sell` | Unchanged, in either mode |

Movement details:
- Each tick, a walking body moves `walkSpeed` units in its held direction. On a diagonal it moves about 707/1000 of that on each axis, because the core has no square roots.
- It stays on the board, and it stops at anything that blocks it.
- So that a key or button can't get stuck, the browser sends a stop when the window loses focus, the tab is hidden, the game pauses, the controller settings open or the controller disconnects. It also re-checks after an online catch-up.
- The room server (`src/net/room.ts`) cleans the new actions like the others: directions are clamped to -1..1, and an unknown mode is dropped.

## Reach

`inReach()` in `src/core/sim.ts` measures from the body to a cell's centre, using squared distances like tower range. Today it gates walking builds.

`withinReach()` lists what a walking spirit could act on, nearest first: your castle and buildings for now. It doesn't change anything and nothing acts on it yet. To add a sluice or a calling stone:
1. Add a new `kind` to the list.
2. Give it its own action, for example `{ type: 'operate', player, x, y }`, which the core accepts only when the thing is in reach.
3. Bind it on the screen.

## Controls

| | Keyboard and mouse | Controller (solo, online or local multiplayer) |
|---|---|---|
| Walk | WASD or arrows (diagonals allowed). **Mouse:** hold the right button, or hold the left button on a cell out of reach, and the body walks toward the pointer until you let go | Left stick or D-pad, 8 directions |
| Walk / fly | Q | B / Circle (rebindable `mode` binding) |
| Build while walking | Click a cell within reach (it lights up), or E builds on the pointed cell if in reach, else where you stand | A builds where you stand; LB/RB pick from your kit |
| Build while flying | Click a cell on your land; 1, 2 pick from your kit | Move the cursor, A builds; LB/RB pick |
| Sell | X sells the building under the mouse, in either mode | X / Square while flying |
| Launch | Space | RT |
| Aim | T, or click an enemy castle | LT |

Mouse walking turns the pointer's position into one of 8 directions on screen and stops a quarter of a cell from it. Only a change of direction is sent, the same as the keys.

## Choosing a spirit

- **Solo:** a spirit dropdown next to the mode dropdown. Changing it restarts the match. Bots get the default for their seat.
- **Local multiplayer:** while players are joining, a joined player's LB/RB switch that seat's spirit. Badges show each seat's spirit.
- **Online:** a dropdown on your own seat in the lobby (`{ t: 'spirit' }` to the room). Bot seats keep their default. The `start` message carries every seat's spirit, so late joiners and reconnects build the same match.

## Bots and the simulator

Bots don't walk. A bot's body stays on its castle and its wisp flies to build anywhere on its land. It picks towers from its own spirit's kit. `npm run sim` runs unchanged.

## Ideas for later (Joel, 2026-11-28; not built)

- **Wisping away.** The body may become attackable later. If it is destroyed, or you choose to, you "wisp away": you give up the body and wait out a regeneration cooldown, but keep your per-life buffs. Per-life buffs don't exist yet. Design them together with "buildings get health" ([design.md](../design.md), Land).
- **Affinities.** Spirits may grow stronger or weaker with terrain and events, for example the Mire in flooded ground. This is for later, alongside the terrain rules above.
- **Asymmetry.** Joel likes asymmetric games. It is undecided whether each spirit gets reskins of shared towers or truly different towers.
- **Campaign hero.** Maybe a human paired with a fairy (a spirit), and later the choice to play as the human or avatar or as the spirit. This is Joel's idea, undecided and exploratory; see [campaign foundations](../narrative/campaign.md).

## Open questions

1. **Asymmetry:** reskins of shared towers per spirit, or truly different towers? Both spirits share the Archer Tower today, because there are only three towers.
2. **Can spirits affect each other?** For example, Mire slowing an enemy body near it, or Wisp hiding its body. This comes up again once bodies can be attacked (wisping away).
3. **Mouse walking:** is "hold right, or hold left away from you" comfortable, or should it be click-to-walk-to-a-cell (a "walk to" action) instead?
4. **Walk-build reach:** are 1.5 and 2 cells right, or should building on foot reach further so walking pays off?
5. **Selling on a controller while walking** currently asks you to fly first. Should A or X while walking sell the building under you instead?
