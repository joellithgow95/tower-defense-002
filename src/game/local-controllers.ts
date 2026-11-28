import type { ControllerPreferences } from './controller-preferences';
import { createGamepadInput } from './gamepad';

export function createLocalControllers() {
  const devices = new Map<number, { id: string; input: ReturnType<typeof createGamepadInput>; seat?: number }>();
  let seats: (number | null)[] = [];

  function reset(count: number) {
    seats = Array.from({ length: count }, () => null);
    devices.clear();
  }

  function poll(now: number, preferencesFor: (seat?: number) => ControllerPreferences) {
    let pads: (Gamepad | null)[];
    try { pads = Array.from(navigator.getGamepads?.() ?? []); }
    catch { pads = []; }

    for (const [index, device] of devices) {
      const pad = pads[index];
      if (pad?.connected && pad.id === device.id && pad.mapping === 'standard') continue;
      if (device.seat !== undefined) seats[device.seat] = -1;
      devices.delete(index);
    }

    return pads.flatMap((pad) => {
      if (!pad?.connected || pad.mapping !== 'standard') return [];
      let device = devices.get(pad.index);
      if (!device) {
        device = { id: pad.id, input: createGamepadInput() };
        devices.set(pad.index, device);
      }
      return [{ pad, device, input: device.input.poll(pad, now, preferencesFor(device.seat)) }];
    });
  }

  function claim(index: number, joining: boolean) {
    const device = devices.get(index);
    if (!device || device.seat !== undefined) return;
    const disconnected = seats.indexOf(-1);
    const seat = disconnected >= 0 ? disconnected : joining ? seats.indexOf(null) : -1;
    if (seat < 0) return;
    seats[seat] = index;
    device.seat = seat;
    device.input.suspend();
  }

  return {
    reset, poll, claim,
    seat: (player: number) => seats[player],
    humans: () => seats.filter((index) => index !== null).length,
    disconnected: () => seats.includes(-1),
    suspend: () => { for (const device of devices.values()) device.input.suspend(); },
  };
}
