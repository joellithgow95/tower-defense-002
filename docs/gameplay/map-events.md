---
id: gameplay.map-events
title: Map machinery and events
status: exploratory
created: 2026-11-28
updated: 2026-11-28
---
# Map machinery and events

How players use a map's machinery (sluices, calling stones) and how a map changes during a match. Nothing here is built. It assumes the players-as-spirits idea (`docs/gameplay/spirits.md`, still on the `joellithgow95/spirits` branch):
- **walk mode:** the spirit's body acts on things within its reach;
- **fly (cursor) mode:** the spirit builds, launches and sells.

**Where ideas came from:**
- **Joel (2026-11-28):** the directions he endorsed.
- **Agent suggestions:** marked *(agent suggestion)* below. Nobody has endorsed them yet.

## What Joel endorsed (2026-11-28)

### Three ways to interact
The spirit's body does all three, in walk mode.

- **Carry** (Joel's favourite): pick up an object, such as a lantern, a seed or a sluice key, and take it somewhere. It makes a push and pull between players.
- **Hold**: stand at a machine for a few seconds to turn it. If an enemy spirit is there too, it becomes a tug-of-war.
- **Tend**: spend time at a habitat or object to change how quickly it changes.

### Show it in the world, not on the HUD
Lean heavily on diegetic UI: warnings and state appear in the world itself. Examples:
- marks on posts as the water rises;
- a sluice wheel that visibly turns;
- stones that glow as they charge;
- mist creeping in from the edges.

Avoid HUD bars wherever the world can show it.

### Machines are a mix
Some machines are **capturable** and favour whoever holds them. Others have **map-wide effects** on everyone.

### Match length
Never over 15 minutes, ideally 6 to 12. Events should help pace a match toward that. For example, slow map-wide changes can shrink the board late in a match, like sudden death.

### Later
Affinities between particular spirits and particular events (e.g. Mire is good at holding machines) come later.

## Agent suggestions

### A pressure gauge per event *(agent suggestion)*
Each event has a hidden gauge, a whole number in the match state:
- time fills it a little every tick;
- player actions fill or drain it (cranking the sluice, walling a spawning run, ringing a stone);
- the event fires when the gauge reaches its threshold, then resets or drops.

So the same event comes sooner in an aggressive match and later in a quiet one. Its pace depends on what players do, not only on a timer. Why this fits:
- **Deterministic.** Whole numbers moved only by `step`, so every browser and every replay agrees, as the `src/core/` rules require.
- **Tunable.** The fill rates and thresholds live in content JSON.
- **Diegetic.** The gauge can drive the world's warnings: the water mark creeps up, the stone glows brighter.

### Walking costs building time *(agent suggestion)*
Only a walking body can carry, hold or tend, and only the flying wisp can build. Every trip to a machine is time not spent building, and it leaves your body somewhere an enemy body can contest. This trade-off is the main reason machinery is interesting, so keep machines a walk away from the castles.

## Open questions
- **Swing:** how much should one event be able to change who wins? Enough to come back from behind, but not enough to make a lead meaningless.
- **Warning:** which events are telegraphed, and how far ahead? The slow ones (rising water) are obvious. Should the fast ones (a spawning run) get a few seconds' warning in the world?
- **Carried objects:** when does a carried object drop? On being touched by an enemy body, on switching to fly mode, or when your castle is hit? Can it be stolen directly? Where does it go if dropped in deep water?
- **2 to 4 players:**
  - How does a tug-of-war resolve with three spirits at one wheel?
  - Do map-wide events fall harder on some seats than others on a four-castle map?
  - Does a capturable machine snowball in a free-for-all?
- **The hard cap:** what happens at 15 minutes if no one has won? Sudden death, a draw, or the most castle health wins?

## Drowned Woods map (multiplayer sketch)

A two-player board from Joel (2026-11-28), 22 wide and 12 tall. Turning it half a turn gives the same board with the castles swapped, so neither side has an advantage. It's drawn here in the terrain letters proposed in [maps](maps.md), which differ from Joel's sketch in two places:

| Terrain | Joel's sketch | [maps.md](maps.md) proposal (used below) |
|---|---|---|
| Shallows (slow) | `,` | `~` |
| Deep channel | `~` | `w` |

```
    0123456789012345678901
 0  TT...~~~~wwww~~~~...TT
 1  T...~~~~~~ww~~~~~~...T
 2  ..C.~~TT~~ww~~~~~~....
 3  ....~~~~~~ww~~~hh~....
 4  ....~~~~~~ww~~~hh~....
 5  1..=======SS=======...
 6  ...=======SS=======..2
 7  ....~hh~~~ww~~~~~~....
 8  ....~hh~~~ww~~~~~~....
 9  ....~~~~~~ww~~TT~~.C..
10  T...~~~~~~ww~~~~~~...T
11  TT...~~~~wwww~~~~...TT
```

**Key:**
- `.` peat: buildable, like grass today.
- `~` shallows: walkable but slow.
- `w` deep channel: impassable and unbuildable.
- `=` causeway: fast, no building.
- `SS` the sluice: the only crossing over the channel.
- `C` calling stones.
- `hh` spawning grounds: the wildlife habitat from [issue #19](https://github.com/joellithgow95/tower-defense-002/issues/19).
- `T` drowned trees: blockers.
- `1`, `2` castles.

Each castle has a calling stone in its back corner and one habitat on its own side of the channel, so a spawning run crosses from one player's side to the other's. The causeway can't be built on, so the "every castle keeps a route" rule always holds through the sluice.

**One correction to [maps.md](maps.md):** that page proposes the sluice as a cell nobody walks through. On this board the sluice is the only crossing, so the sluice cells must be walkable: the machine is a gate-bridge.

### Events, from seconds to the whole match (Joel, 2026-11-28)

| Speed | Event | What changes |
|---|---|---|
| Seconds | **Calling stone** | Ring it with your body for a pulse that briefly pulls troops or wildlife toward it. Long cooldown |
| Seconds to minutes | **Mist** | Hides troops. View only: the match underneath is unchanged |
| About a minute | **Sluice** | Hold to crank it. **Open:** the shallows drain to buildable peat and troops speed up, but the habitats dry out and the wildlife gets angry. **Closed:** the shallows flood, so only the causeway crosses. Affects everyone |
| Every few minutes | **Spawning run** | Wildlife crosses from one habitat to the other. Walling off its run angers it |
| Whole match | **Rising water** | Creeps up on its own. Opening the sluice slows it; forcing it shut speeds it up. It is the late-game clock |
| Whole match | **Drowned trees rot** | Trees fall and open cells |

In Joel's terms:
- The calling stones are **capturable**: they favour whoever rings them.
- The sluice and the rising water are **map-wide**.
- The sluice is a **hold**, and a tug-of-war when both spirits are at the wheel.
- The habitats are a place to **tend**.

### Notes on the sketch *(agent suggestion)*
- **Rising water as the clock:** use one gauge (as above), so the water pushes the match toward an end inside 6 to 12 minutes. As it rises, peat at the edges turns to shallows and shallows turn to deep water, so the buildable board shrinks toward the causeway. The causeway and the castles never flood.
- **Mist must still be decided by the core.** It doesn't change the match, but when and where it falls should come from the seed and the tick, so every screen shows the same mist.
- **Spawning run route:** the two habitats are on opposite sides of the channel. Does the run cross by the sluice and causeway, where both players' troops march, or can wildlife swim the deep channel?

### Carry on this map: the sluice key *(agent suggestion)*
Joel's favourite verb isn't in the sketch yet. One way to add it:

- **One sluice key.** It starts at the sluice. Cranking the sluice needs the key in the hands of a spirit at the wheel.
- **Carrying it away locks the sluice** in its current state, open or closed, for as long as the key is gone. Taking it home is a strong move, but your body is busy while you do it.
- **The carrier walks slower.** If an enemy spirit's body touches the carrier, the key drops on that cell.
- **A key dropped in deep water** drifts back to the sluice after a while, so it can't be lost for good.
- **Diegetic:** the key glows, and the sluice wheel's lock visibly opens when the key is home.

An alternative or addition is **a lantern** that clears mist around whoever carries it. It's a softer object to fight over, and it fits the "lanterns in the mist" material culture in [Drowned Woods](../worldbuilding/locations/drowned-woods.md).

### Water: deep blocks, shallows slow
Joel decided on 2026-11-28: deep water blocks troops and shallows slow them. [`design.md`](../design.md) now says so.

### What building it would take
Most of this changes `src/core/` and the replay format:
- terrain kinds in the state;
- weighted routes for slow and fast cells;
- terrain that changes during a match;
- gauges;
- carry, hold and tend actions.

[maps.md](maps.md) lists the details. Per [`AGENTS.md`](../../AGENTS.md), each of those needs Joel's approval before it's built. It would also land after the spirits branch, which adds the walking body and its reach.

The board above is two-player only. A four-player Drowned Woods is an open question.
