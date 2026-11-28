/**
 * Messages between a player's browser and the room server (worker/index.ts).
 *
 * How online play works (lockstep): every browser runs the same match. The server never runs the game.
 * It keeps the clock: every TURN_MS it closes a "turn" and tells everyone "simulate up to tick `upTo`,
 * and here are the actions stamped on those ticks". An action is stamped with the first tick nobody has
 * simulated yet, so every browser applies it on the same tick and the matches stay identical.
 */
import type { Mode } from '../core/config';
import type { Action } from '../core/types';

/** Ticks per turn: 6 ticks = 100 ms at 60 ticks a second. */
export const TURN_TICKS = 6;
export const TURN_MS = 100;
/** Browsers report a fingerprint of their match this often, so the server can spot a desync. */
export const FINGERPRINT_EVERY = 300;
export const MAX_NAME = 20;

export interface Stamped { tick: number; action: Action }

/** A seat is a player slot in the chosen mode. An empty seat is played by a bot. */
export interface SeatView { name: string | null; online: boolean }

export type ClientMessage =
  /** `client` is a random id the tab keeps, so a reconnect gets its seat back. `build` must match the room's. */
  | { t: 'hello'; client: string; name: string; build: string }
  | { t: 'name'; name: string }
  /** Take a seat (player number), or stand up with null to watch. Lobby only. */
  | { t: 'sit'; seat: number | null }
  /** Host only, in the lobby. */
  | { t: 'mode'; mode: Mode }
  | { t: 'start' }
  /** Host only, after a match: everyone back to the lobby. */
  | { t: 'lobby' }
  /** The server fills in `player` from your seat, whatever you send. */
  | { t: 'action'; action: Action }
  | { t: 'fingerprint'; tick: number; fingerprint: string };

export type ServerMessage =
  /** Who is in the room. Sent whenever it changes. */
  | { t: 'room'; phase: 'lobby' | 'playing'; mode: Mode; seats: SeatView[]; watching: string[]; you: number | null; host: boolean }
  /** A match began, or you (re)joined one: every action so far, and how far to simulate. */
  | { t: 'start'; mode: Mode; seed: number; humans: boolean[]; actions: Stamped[]; upTo: number }
  /** A turn closed: simulate up to `upTo`, applying these actions on their ticks. */
  | { t: 'turn'; upTo: number; actions: Stamped[] }
  | { t: 'desync'; tick: number }
  | { t: 'error'; message: string };
