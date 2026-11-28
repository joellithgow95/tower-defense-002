---
id: gameplay.spirits
title: Spirits, walk mode and cursor mode
status: exploratory
created: 2026-11-28
updated: 2026-11-28
---
# Spirits

The idea is Joel's (agreed 2026-11-28). Players aren't peoples. Each player is a force or spirit of the Lyth, and the creatures and folk who answer that spirit are its towers and troops. Those same creatures turn up on their own in the campaign, and a spirit's followers mix species, so a species never stands for a side (see [decision 0002](../decisions/0002-cultural-coexistence.md)).

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

**Walk mode.** The spirit is a body on the board, which you steer like a Comet Crash ship. You act on what is within `reach` of where you stand:
- At your own castle you can **launch** your garrison.
- Beside one of your buildings you can **sell** it.
- Map machinery such as sluices and calling stones can be added here later (see "Reach" below).

**Cursor mode.** The spirit becomes a wisp that flies wherever you point. This is the only mode that builds, within the usual land rules (`buildRadius`, `castleNoBuildRadius`). While the wisp flies, the body rests where you left it, drawn smaller, and it doesn't move. Switching back to walk puts you back in the body. You don't teleport to the wisp.

Every spirit starts each match walking, standing on its castle.

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

The game is lockstep: only actions travel online, never positions. So walking is sent as **changes of direction**, not as a position every tick:

| Action | Effect |
|---|---|
| `{ type: 'spirit-move', player, x, y }` | Hold a direction (-1, 0 or 1 on each axis). Sent when the held keys or stick change, so a long walk costs two actions: start and stop |
| `{ type: 'spirit-mode', player, mode }` | Set walk or cursor. It sets the mode rather than toggling it, so a repeated message can't flip it back. Switching mode stops the body |
| `build` | Unchanged shape. Refused with `needs-cursor` unless the spirit is flying, and `not-in-kit` for a tower outside its kit. The build itself says which cell, so the wisp's movements are never sent: your own screen draws your wisp at your cursor, and everyone else sees it jump to each cell it builds on |
| `launch` | Unchanged shape. Refused with `needs-walk` while flying, and `out-of-reach` unless your castle is within reach |
| `sell` | Unchanged shape. The building must be within reach of the walking body |

Each tick, a walking spirit moves `walkSpeed` units in its held direction, and about 707/1000 of that on each axis when walking diagonally, because the core has no square roots. It stays on the board. To stop a key or stick from getting stuck, the browser sends a stop when the window loses focus, the tab is hidden, the game pauses, the controller settings open or the controller disconnects. The room server (`src/net/room.ts`) cleans both new actions like the others: directions are clamped to -1..1, and an unknown mode is dropped.

## Reach

`withinReach(state, config, player)` in `src/core/sim.ts` lists what a walking spirit can act on, nearest first, with the castle first on a tie. It doesn't change anything. Today the list holds `castle` and `building`. Reach is measured from the body to the centre of the thing's cell, using squared distances like tower range.

To add a sluice or a calling stone later:
1. Add a new `kind` to the list.
2. Give it its own action, for example `{ type: 'operate', player, x, y }`, that the core accepts only when that thing is within reach.
3. In `main.ts`, map **Use** to it.

"Use" (E, or A while walking) acts on the nearest *usable* thing. Today that is only your castle, so Use launches. Selling stays on its own button, so you can't sell by accident while reaching for the castle.

## Spirits don't block troops

Spirits float over rock, buildings and troops. They aren't in `blockedCells`, so they never change a route or stop a build, and troops pass straight through them.

## Controls

| | Keyboard and mouse | Controller (solo, online or local multiplayer) |
|---|---|---|
| Walk | WASD or arrows (diagonals allowed) | Left stick or D-pad, 8 directions |
| Walk / fly | Q | B / Circle (new rebindable `mode` binding) |
| Build (flying) | Click a cell; 1, 2 pick from your kit | Move the cursor, A builds; LB/RB pick from your kit |
| Use (walking) | E or Space at your castle launches | A at your castle launches; RT launches too |
| Sell (walking) | X sells the nearest of your buildings in reach | X / Square |
| Aim | T, or click an enemy castle (works in either mode) | LT |

Walking with the mouse alone isn't supported yet. Clicking the board while walking tells you to press Q.

## Choosing a spirit

- **Solo:** a spirit dropdown next to the mode dropdown. Changing it restarts the match. Bots get the default for their seat.
- **Local multiplayer:** while players are joining, a joined player's LB/RB switch that seat's spirit. Badges show each seat's spirit.
- **Online:** a dropdown on your own seat in the lobby (`{ t: 'spirit' }` to the room). Bot seats keep their default. The `start` message carries every seat's spirit, so late joiners and reconnects build the same match.

## Bots and the simulator

Bots don't walk. A bot's spirit stays on its castle and switches mode in the same tick as each move: it flies to build and walks to launch. It picks towers from its own spirit's kit. `npm run sim` runs unchanged.

## Open questions for Joel

1. **Return to the body, or land under the wisp?** Now, switching back to walk puts you back in the resting body. Landing where the wisp is would make walking almost pointless, since you could fly to your castle. Is resting the right feel?
2. **Should building need the wisp at all?** The alternative is building in walk mode within reach, with the wisp used for long-range placement. That would make the modes a trade-off rather than a switch.
3. **Can spirits interact with each other?** For example, Mire could slow an enemy body it stands next to, or Wisp could hide its body. Nothing like that exists yet.
4. **Should the body be blocked by rock or buildings?** It floats over everything today, which keeps the core simple.
5. **Kits:** both share the Archer Tower, because there are only three towers. Should each spirit get a tower of its own once there is more content?
6. **Controller button for walk / fly:** B / Circle was free during play, but B also means "back" inside the settings dialog, so you can't capture it there by pressing it; it can only be reached by swapping. Is another button better (Y is Restart; L3 is free)?
7. **Should a mouse-only player be able to walk** (for example, right-click to walk to a cell)? That would need either a "walk to" action or the existing direction action sent from the client.
8. **Spirits in the campaign:** is the player character in the campaign also a spirit, or does that stay a multiplayer framing?
