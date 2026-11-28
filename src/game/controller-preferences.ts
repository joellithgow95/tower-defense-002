export const DEFAULT_BINDINGS = {
  build: 0,
  sell: 2,
  previous: 4,
  next: 5,
  pause: 9,
  restart: 3,
  launch: 7,
  target: 6,
};

export type ControllerAction = keyof typeof DEFAULT_BINDINGS;
export type ControllerPreferences = {
  bindings: Record<ControllerAction, number>;
  deadZone: number;
  speed: number;
};

export const ACTIONS = Object.keys(DEFAULT_BINDINGS) as ControllerAction[];
export const BUTTON_LABELS: Readonly<Record<number, string>> = {
  0: 'A / ✕', 2: 'X / □', 3: 'Y / △', 4: 'LB / L1', 5: 'RB / R1',
  6: 'LT / L2', 7: 'RT / R2', 9: 'Menu / Options', 10: 'L3', 11: 'R3',
};
export const SETTINGS_BUTTON = 8;
export const SELECT_BUTTON = 0;
export const BACK_BUTTON = 1;
export const SPEEDS = [
  { label: 'Slow', first: 320, repeat: 150 },
  { label: 'Normal', first: 240, repeat: 95 },
  { label: 'Fast', first: 180, repeat: 60 },
];

const STORAGE_KEY = 'td002.controller.v1';
export const defaults = (): ControllerPreferences => ({ bindings: { ...DEFAULT_BINDINGS }, deadZone: 45, speed: 1 });

function profileKey(seat?: number) {
  return seat === undefined ? STORAGE_KEY : `${STORAGE_KEY}.seat.${seat + 1}`;
}

export function loadPreferences(seat?: number): ControllerPreferences {
  try {
    const saved = JSON.parse(localStorage.getItem(profileKey(seat)) ?? 'null');
    if (saved) {
      const bindings = { ...saved.bindings };
      // Older profiles have six bindings. Preserve their choices when assigning the two new actions.
      for (const action of ['launch', 'target'] as const) {
        if (bindings[action] !== undefined) continue;
        const used = new Set(Object.values(bindings));
        const preferred = DEFAULT_BINDINGS[action];
        bindings[action] = used.has(preferred)
          ? Object.keys(BUTTON_LABELS).map(Number).find((button) => !used.has(button))
          : preferred;
      }
      const buttons = ACTIONS.map((action) => bindings[action]);
      if (buttons.every((button) => Number.isInteger(button) && BUTTON_LABELS[button])
        && new Set(buttons).size === ACTIONS.length
        && Number.isInteger(saved.deadZone) && saved.deadZone >= 20 && saved.deadZone <= 80 && saved.deadZone % 5 === 0
        && Number.isInteger(saved.speed) && SPEEDS[saved.speed]) {
        return { bindings, deadZone: saved.deadZone, speed: saved.speed };
      }
    }
  } catch { /* Storage may be disabled or contain invalid JSON. */ }
  return seat === 0 ? loadPreferences() : defaults();
}

export function savePreferences(preferences: ControllerPreferences, seat?: number) {
  try {
    localStorage.setItem(profileKey(seat), JSON.stringify(preferences));
    return true;
  } catch {
    return false;
  }
}

export function rebind(preferences: ControllerPreferences, action: ControllerAction, button: number) {
  if (!BUTTON_LABELS[button]) return;
  const bindings = preferences.bindings;
  const other = ACTIONS.find((candidate) => bindings[candidate] === button);
  if (other) bindings[other] = bindings[action];
  bindings[action] = button;
}
