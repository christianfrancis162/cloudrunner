// Cloudrunner — input: keyboard and mouse steering.
// One job: read the keys and the pointer and hand the game a control frame.
export const ACTION_CONFIRM = 1 << 0;
export const ACTION_PAUSE = 1 << 1;
export const ACTION_RESTART = 1 << 2;
export const ACTION_MUTE = 1 << 3;
export const ACTION_DROP = 1 << 4;

const KEYMAP = {
  ArrowUp: 'pitchUp',
  KeyW: 'pitchUp',
  ArrowDown: 'pitchDown',
  KeyS: 'pitchDown',
  ArrowLeft: 'rollLeft',
  KeyA: 'rollLeft',
  ArrowRight: 'rollRight',
  KeyD: 'rollRight',
  ShiftLeft: 'throttleUp',
  ShiftRight: 'throttleUp',
  ControlLeft: 'throttleDown',
  ControlRight: 'throttleDown',
  Space: 'airbrake',
  KeyC: 'drop',
  Enter: 'confirm',
  KeyP: 'pause',
  KeyR: 'restart',
  KeyM: 'mute',
  Digit1: 'mission1',
  Digit2: 'mission2',
  Digit3: 'mission3',
  Digit4: 'mission4',
};

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let missionSelected = -1; // index into MISSION_ORDER, -1 when none picked
  let mouseX = 0; // -1..1 across the window
  let mouseActive = false;
  let mouseSeenAt = 0;

  function onKeyDown(event) {
    const name = KEYMAP[event.code];
    if (!name) return;
    if (name === 'drop') {
      if (!event.repeat) actions |= ACTION_DROP;
      return;
    }
    if (name.startsWith('mission')) {
      if (!event.repeat) missionSelected = Number(name.slice('mission'.length)) - 1;
      return;
    }
    if (name === 'confirm' || name === 'pause' || name === 'restart' || name === 'mute') {
      if (!event.repeat) {
        if (name === 'confirm') actions |= ACTION_CONFIRM;
        if (name === 'pause') actions |= ACTION_PAUSE;
        if (name === 'restart') actions |= ACTION_RESTART;
        if (name === 'mute') actions |= ACTION_MUTE;
      }
    } else {
      keys.add(name);
    }
    if (name === 'airbrake' || name.startsWith('Arrow')) event.preventDefault();
  }

  function onKeyUp(event) {
    const name = KEYMAP[event.code];
    if (name) keys.delete(name);
  }

  function onMouseMove(event) {
    mouseX = (event.clientX / window.innerWidth) * 2 - 1;
    mouseActive = true;
    mouseSeenAt = performance.now();
  }

  function onMouseDown(event) {
    // Clicking the canvas is a confirm (start / fly again).
    if (event.target === canvas) actions |= ACTION_CONFIRM;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);

  // Read and clear one-shot actions (Enter / P / R / M / C / click).
  function takeActions() {
    const taken = actions;
    actions = 0;
    return taken;
  }

  // Read and clear the last mission picked with keys 1-4 (-1 when none).
  function takeMissionSelect() {
    const picked = missionSelected;
    missionSelected = -1;
    return picked;
  }

  // The held control frame for this tick: pitch/roll in -1..1, throttle
  // delta in -1..1 per second, airbrake flag. The mouse steers by banking
  // toward the cursor; it fades out 1.5 s after the mouse stops moving so
  // the keyboard is never fought.
  function controls(dt) {
    let pitch = 0;
    let roll = 0;
    if (keys.has('pitchUp')) pitch += 1;
    if (keys.has('pitchDown')) pitch -= 1;
    if (keys.has('rollLeft')) roll -= 1;
    if (keys.has('rollRight')) roll += 1;
    const mouseFresh = mouseActive && performance.now() - mouseSeenAt < 1500;
    if (mouseFresh && Math.abs(mouseX) > 0.08) {
      roll = Math.max(-1, Math.min(1, roll + mouseX * 1.2));
    }
    let throttleDelta = 0;
    if (keys.has('throttleUp')) throttleDelta += 1.4;
    if (keys.has('throttleDown')) throttleDelta -= 1.4;
    return {
      pitch,
      roll,
      throttleDelta,
      airbrake: keys.has('airbrake'),
    };
  }

  function destroy() {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('mousemove', onMouseMove);
    canvas.removeEventListener('mousedown', onMouseDown);
  }

  return { takeActions, takeMissionSelect, controls, destroy };
}
