---
id: decisions.controller-settings
title: In-game controller settings
status: proposed
created: 2026-11-28
updated: 2026-11-28
---

## Context

The controller can play a match with fixed bindings. Players need to adjust the controls without leaving the game.

## Decision

- Open Controller settings from the HUD or the controller's left center button (View / Create / Share).
- Remap Build, Sell, Previous tower, Next tower, Pause and Restart. Choose an action, then press a face or shoulder button, trigger, stick click or Menu / Options. If another action already uses that button, swap the bindings.
- Use the D-pad or left stick to navigate the settings, the bottom face button to select, and the right face button to back out. Reserve the left center button and D-pad. The right face button is reserved for canceling a binding in the settings.
- Tune stick dead zone from 20% to 80% in 5% steps. Choose Slow, Normal or Fast for held movement on the stick and D-pad.
- Apply changes immediately and save them in the current browser. Restore defaults from the same screen.
- Suspend the match while settings are open. On exit, restore its prior running or paused state, unless the active controller disconnected and paused the match. Require neutral input before gameplay resumes.

## Rationale

Fixed settings navigation provides a recovery path after remapping. Swapping keeps all actions assigned. Browser storage keeps the profile local across matches and reloads.

## Alternatives

An Apply button and per-device profiles would support editing several profiles together. A single live profile keeps setup short for the current one-player game.

## Implications

Gameplay prompts reflect the saved bindings. A missing or invalid profile falls back to defaults. If storage is unavailable, changes work for the current page. The settings apply to controllers with the browser's standard mapping.

## Open questions

Playtest the repeat presets and dead zone range on physical controllers.
