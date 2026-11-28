export const DEFAULT_BINDINGS = {
  build: 0,
  sell: 2,
  previous: 4,
  next: 5,
  pause: 9,
  restart: 3,
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

export function loadPreferences(): ControllerPreferences {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (saved) {
      const buttons = ACTIONS.map((action) => saved.bindings?.[action]);
      if (buttons.every((button) => Number.isInteger(button) && BUTTON_LABELS[button])
        && new Set(buttons).size === ACTIONS.length
        && Number.isInteger(saved.deadZone) && saved.deadZone >= 20 && saved.deadZone <= 80 && saved.deadZone % 5 === 0
        && Number.isInteger(saved.speed) && SPEEDS[saved.speed]) {
        return saved;
      }
    }
  } catch { /* Storage may be disabled or contain invalid JSON. */ }
  return defaults();
}

export function savePreferences(preferences: ControllerPreferences) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
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
