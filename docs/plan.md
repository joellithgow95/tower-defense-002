---
id: plan
title: Plan
status: accepted
created: 2026-11-27
updated: 2026-11-27
---
# Plan

**Goal:** a maze tower defense that's fun to play together and easy to contribute to. Desktop first; a smaller-board mobile mode is a later experiment.

| Stage | Done when | Status |
|---|---|---|
| 1. Foundation | One map, a few buildings, a simple bot, tests, **and a live link** | In progress: all but the live link |
| 2. Online play | Two computers stay in sync, including after a tab switch or reconnect | Built: rooms, lobby, lockstep, reconnect; needs a real-world playtest and the Firefox/Safari check |
| 3. Contributor-ready | Bug reports with replays, issue forms, a preview link on each PR, first-change guide tried by a new person | Partly done: bug reports, replays and issue forms exist |
| 4. Make it fun | More content, better bot, lots of playtesting | Not started |
| 5. The big features | Daily puzzles, campaign, tribes, then ML training | Not started |

Playtesting starts as soon as there's a live link. Contributing is open now: start with [your first change](first-change.md). Stage 3 makes it smoother, not possible.

## How online play works
Each player's game sends only actions (build, sell, launch) to a Cloudflare Durable Object, one per room. It keeps the clock: every 100 ms it closes a turn and sends everyone the actions stamped on its ticks. Every browser runs the same match only as far as the server has confirmed, runs the bots for empty seats itself, and reports a fingerprint every 5 seconds so the server can spot a desync. A browser that was hidden or reconnects replays the room's action log to catch up. Details in `src/net/protocol.ts`.

## Not yet proven
- Identical results across different browser engines. Check Firefox and Safari before relying on it.
- Performance with large numbers of troops.
