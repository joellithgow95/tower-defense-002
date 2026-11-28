import {
  ACTIONS, BACK_BUTTON, BUTTON_LABELS, SELECT_BUTTON, SETTINGS_BUTTON, SPEEDS,
  defaults, rebind, savePreferences, type ControllerAction, type ControllerPreferences,
} from './controller-preferences';

const LABELS: Record<ControllerAction, string> = {
  build: 'Build', sell: 'Sell', previous: 'Previous tower', next: 'Next tower', pause: 'Pause / resume', restart: 'Restart',
  launch: 'Launch troops', target: 'Cycle target', mode: 'Walk / fly',
};

export function createControllerSettings(dialog: HTMLDialogElement, suspend: () => void) {
  let preferences: ControllerPreferences;
  let owner: number | undefined;
  const title = dialog.querySelector('h2')!;
  const status = dialog.querySelector<HTMLElement>('p[role=status]')!;
  const storageStatus = dialog.querySelector<HTMLElement>('#controller-storage')!;
  const bindings = dialog.querySelector<HTMLElement>('#controller-bindings')!;
  const deadZone = dialog.querySelector<HTMLInputElement>('#controller-dead-zone')!;
  const speed = dialog.querySelector<HTMLSelectElement>('#controller-speed')!;
  let capture: ControllerAction | undefined;

  const rows = ACTIONS.map((action) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.onclick = () => {
      capture = action;
      status.textContent = `Press a button for ${LABELS[action]}. Press B / Circle or Escape to cancel.`;
      suspend();
    };
    bindings.append(button);
    return { action, button };
  });
  for (const [index, preset] of SPEEDS.entries()) speed.add(new Option(preset.label, String(index)));

  function render() {
    for (const { action, button } of rows) {
      button.hidden = owner !== undefined && owner !== 0 && (action === 'pause' || action === 'restart');
      button.textContent = `${LABELS[action]} · ${BUTTON_LABELS[preferences.bindings[action]]}`;
    }
    deadZone.value = String(preferences.deadZone);
    dialog.querySelector('output')!.value = `${preferences.deadZone}%`;
    speed.value = String(preferences.speed);
  }

  function save() {
    storageStatus.textContent = savePreferences(preferences, owner) ? '' : 'Changes apply until this page closes.';
    render();
  }

  function cancelCapture() {
    capture = undefined;
    status.textContent = '';
    suspend();
  }

  function open(profile: ControllerPreferences, seat?: number) {
    if (dialog.open) return;
    preferences = profile;
    owner = seat;
    title.textContent = seat === undefined ? 'Controller settings' : `Player ${seat + 1} controller settings`;
    storageStatus.textContent = '';
    render();
    dialog.showModal();
    rows[0].button.focus();
    suspend();
  }

  deadZone.oninput = () => { preferences.deadZone = Number(deadZone.value); save(); };
  speed.onchange = () => { preferences.speed = Number(speed.value); save(); };
  dialog.querySelector<HTMLButtonElement>('#controller-reset')!.onclick = () => {
    cancelCapture();
    Object.assign(preferences, defaults());
    save();
    status.textContent = 'Defaults restored.';
  };
  dialog.querySelector<HTMLButtonElement>('#controller-done')!.onclick = () => dialog.close();
  dialog.addEventListener('close', cancelCapture);
  dialog.addEventListener('cancel', (event) => {
    if (!capture) return;
    event.preventDefault();
    cancelCapture();
  });

  function handle(pressed: number[], move?: { x: number; y: number }) {
    if (pressed.includes(BACK_BUTTON) || pressed.includes(SETTINGS_BUTTON)) {
      if (capture) cancelCapture();
      else dialog.close();
      return;
    }
    if (capture) {
      const button = pressed.find((index) => BUTTON_LABELS[index]);
      if (button !== undefined) {
        rebind(preferences, capture, button);
        cancelCapture();
        save();
      }
      return;
    }
    const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([hidden]), input, select'));
    const focused = document.activeElement;
    if (move?.y) {
      const index = controls.findIndex((control) => control === focused);
      controls[(index + move.y + controls.length) % controls.length].focus();
    }
    if (move?.x && focused === deadZone) {
      if (move.x > 0) deadZone.stepUp();
      else deadZone.stepDown();
      preferences.deadZone = Number(deadZone.value);
      save();
    }
    if (move?.x && focused === speed) {
      preferences.speed = (preferences.speed + move.x + SPEEDS.length) % SPEEDS.length;
      save();
    }
    if (pressed.includes(SELECT_BUTTON) && focused instanceof HTMLButtonElement) focused.click();
  }

  return {
    open, handle, close: () => dialog.close(),
    get active() { return dialog.open; },
    get owner() { return owner; },
  };
}
