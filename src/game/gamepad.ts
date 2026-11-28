import { SPEEDS, type ControllerPreferences } from './controller-preferences';

const UP = 12, DOWN = 13, LEFT = 14, RIGHT = 15;

function direction(pad: Gamepad, deadZone: number) {
  const x = Number(pad.buttons[RIGHT]?.pressed ?? false) - Number(pad.buttons[LEFT]?.pressed ?? false);
  const y = Number(pad.buttons[DOWN]?.pressed ?? false) - Number(pad.buttons[UP]?.pressed ?? false);
  if (x || y) return x ? { x, y: 0 } : { x: 0, y };

  const [stickX = 0, stickY = 0] = pad.axes;
  if (Math.max(Math.abs(stickX), Math.abs(stickY)) < deadZone) return { x: 0, y: 0 };
  return Math.abs(stickX) >= Math.abs(stickY)
    ? { x: Math.sign(stickX), y: 0 }
    : { x: 0, y: Math.sign(stickY) };
}

/** The direction held right now, diagonals included, for walking a spirit. */
function heldDirection(pad: Gamepad, deadZone: number) {
  const x = Number(pad.buttons[RIGHT]?.pressed ?? false) - Number(pad.buttons[LEFT]?.pressed ?? false);
  const y = Number(pad.buttons[DOWN]?.pressed ?? false) - Number(pad.buttons[UP]?.pressed ?? false);
  if (x || y) return { x, y };
  const [stickX = 0, stickY = 0] = pad.axes;
  if (Math.max(Math.abs(stickX), Math.abs(stickY)) < deadZone) return { x: 0, y: 0 };
  // An axis counts once it is at least half the stronger one, so a slight lean doesn't turn a straight walk diagonal.
  const strongest = Math.max(Math.abs(stickX), Math.abs(stickY)) / 2;
  return { x: Math.abs(stickX) >= strongest ? Math.sign(stickX) : 0, y: Math.abs(stickY) >= strongest ? Math.sign(stickY) : 0 };
}

export function createGamepadInput() {
  let previous: boolean[] = [];
  let previousDirection = { x: 0, y: 0 };
  let repeatAt = 0;
  let requireNeutral = true;

  function poll(pad: Gamepad, now: number, preferences: ControllerPreferences) {
    const buttons = pad.buttons.map((button) => button.pressed);
    const move = direction(pad, preferences.deadZone / 100);
    if (requireNeutral) {
      requireNeutral = !!(move.x || move.y || buttons.some(Boolean));
      previous = [];
      previousDirection = { x: 0, y: 0 };
      if (requireNeutral) return { ready: false as const };
    }

    const pressed = buttons.flatMap((down, button) => down && !previous[button] ? [button] : []);
    const changed = move.x !== previousDirection.x || move.y !== previousDirection.y;
    const step = !!(move.x || move.y) && (changed || now >= repeatAt);
    const speed = SPEEDS[preferences.speed];
    if (step) repeatAt = now + (changed ? speed.first : speed.repeat);
    const input = {
      ready: true as const,
      move: step ? move : undefined,
      held: heldDirection(pad, preferences.deadZone / 100),
      pressed,
    };
    previous = buttons;
    previousDirection = move;
    return input;
  }

  return { poll, suspend: () => { requireNeutral = true; } };
}


/** Keep the same controller selected while playing solo or in an online room. */
export function createSingleGamepadInput() {
  const input = createGamepadInput();
  let active: Pick<Gamepad, 'index' | 'id'> | undefined;
  function poll(pads: ArrayLike<Gamepad | null>, now: number, preferences: ControllerPreferences) {
    const current = active && pads[active.index];
    const pad = current?.connected && current.id === active?.id && current.mapping === 'standard'
      ? current
      : Array.from(pads).find((candidate) => candidate?.connected && candidate.mapping === 'standard');
    if (!pad || active?.index !== pad.index || active.id !== pad.id) input.suspend();
    active = pad ? { index: pad.index, id: pad.id } : undefined;
    return pad ? input.poll(pad, now, preferences) : null;
  }
  return { poll, suspend: input.suspend };
}
