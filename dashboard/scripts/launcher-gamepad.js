// ============ GAMEPAD INPUT LAYER ============
// Standalone polling loop that translates Web Gamepad API state into high-level
// CustomEvents on `window`. Other modules subscribe instead of polling.
//
// Events emitted (event.detail shape):
//   multideck:gamepad:nav      { dir: 'up'|'down'|'left'|'right' }   (dpad + left stick edge)
//   multideck:gamepad:accept   {}                                     (A button press)
//   multideck:gamepad:cancel   {}                                     (B button press)
//   multideck:gamepad:option   { index: 0|1|2|3 }                     (A/B/X/Y for modal picks)
//   multideck:gamepad:shoulder { side: 'L'|'R', kind: 'bumper'|'trigger' }
//   multideck:gamepad:ptt-down {}                                     (L1 down → start recording)
//   multideck:gamepad:ptt-up   {}                                     (L1 up   → stop recording)
//   multideck:gamepad:connected    { id }
//   multideck:gamepad:disconnected { id }
//
// Standard mapping reference (per Web Gamepad API spec):
//   buttons[0]=A  [1]=B  [2]=X  [3]=Y
//   buttons[4]=L1 [5]=R1 [6]=L2 [7]=R2
//   buttons[12]=DPad-Up [13]=DPad-Down [14]=DPad-Left [15]=DPad-Right
//   axes[0]=LStickX axes[1]=LStickY axes[2]=RStickX axes[3]=RStickY
(() => {
  const STICK_DEADZONE = 0.55;
  const STICK_REPEAT_MS = 220;
  const TRIGGER_THRESHOLD = 0.5;

  const BUTTON = {
    A: 0, B: 1, X: 2, Y: 3,
    L1: 4, R1: 5, L2: 6, R2: 7,
    DPAD_UP: 12, DPAD_DOWN: 13, DPAD_LEFT: 14, DPAD_RIGHT: 15,
  };

  const NAV_BUTTONS = {
    [BUTTON.DPAD_UP]: 'up',
    [BUTTON.DPAD_DOWN]: 'down',
    [BUTTON.DPAD_LEFT]: 'left',
    [BUTTON.DPAD_RIGHT]: 'right',
  };

  const OPTION_BUTTONS = {
    [BUTTON.A]: 0,
    [BUTTON.B]: 1,
    [BUTTON.X]: 2,
    [BUTTON.Y]: 3,
  };

  let prev = null;            // previous frame's pressed-state for edge detection
  let lastStickAt = 0;        // throttle stick repeats
  let lastStickDir = null;    // direction the stick last fired
  let pttDown = false;        // ptt latch (L1)
  let rafId = null;

  function emit(name, detail = {}) {
    window.dispatchEvent(new CustomEvent('multideck:gamepad:' + name, { detail }));
  }

  function snapshotPressed(gp) {
    const m = {};
    for (let i = 0; i < gp.buttons.length; i++) {
      const b = gp.buttons[i];
      m[i] = !!(b && (b.pressed || (b.value > TRIGGER_THRESHOLD)));
    }
    return m;
  }

  function readStickDir(axes) {
    const x = axes[0] || 0, y = axes[1] || 0;
    if (Math.abs(x) < STICK_DEADZONE && Math.abs(y) < STICK_DEADZONE) return null;
    if (Math.abs(x) > Math.abs(y)) return x > 0 ? 'right' : 'left';
    return y > 0 ? 'down' : 'up';
  }

  function poll() {
    rafId = requestAnimationFrame(poll);
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const p of pads) { if (p && p.connected) { gp = p; break; } }
    if (!gp) { prev = null; return; }

    const now = performance.now();
    const cur = snapshotPressed(gp);

    if (prev) {
      // Edge-detected button presses
      for (const [b, dir] of Object.entries(NAV_BUTTONS)) {
        if (cur[b] && !prev[b]) emit('nav', { dir });
      }
      if (cur[BUTTON.A] && !prev[BUTTON.A]) {
        emit('accept');
        emit('option', { index: OPTION_BUTTONS[BUTTON.A] });
      }
      if (cur[BUTTON.B] && !prev[BUTTON.B]) {
        emit('cancel');
        emit('option', { index: OPTION_BUTTONS[BUTTON.B] });
      }
      if (cur[BUTTON.X] && !prev[BUTTON.X]) emit('option', { index: OPTION_BUTTONS[BUTTON.X] });
      if (cur[BUTTON.Y] && !prev[BUTTON.Y]) emit('option', { index: OPTION_BUTTONS[BUTTON.Y] });

      if (cur[BUTTON.L1] && !prev[BUTTON.L1]) emit('shoulder', { side: 'L', kind: 'bumper' });
      if (cur[BUTTON.R1] && !prev[BUTTON.R1]) emit('shoulder', { side: 'R', kind: 'bumper' });
      if (cur[BUTTON.L2] && !prev[BUTTON.L2]) emit('shoulder', { side: 'L', kind: 'trigger' });
      if (cur[BUTTON.R2] && !prev[BUTTON.R2]) emit('shoulder', { side: 'R', kind: 'trigger' });

      // Push-to-talk on L1: latched, edge-triggered both directions
      if (cur[BUTTON.L1] && !pttDown) { pttDown = true; emit('ptt-down'); }
      if (!cur[BUTTON.L1] && pttDown) { pttDown = false; emit('ptt-up'); }
    }
    prev = cur;

    // Left-stick edge → nav (throttled so it doesn't fire every frame at full deflection)
    const dir = readStickDir(gp.axes || []);
    if (dir) {
      if (dir !== lastStickDir || (now - lastStickAt) > STICK_REPEAT_MS) {
        emit('nav', { dir });
        lastStickAt = now;
        lastStickDir = dir;
      }
    } else {
      lastStickDir = null;
    }
  }

  window.addEventListener('gamepadconnected', (e) => {
    emit('connected', { id: e.gamepad.id });
    if (rafId === null) poll();
  });
  window.addEventListener('gamepaddisconnected', (e) => {
    emit('disconnected', { id: e.gamepad.id });
    const pads = (navigator.getGamepads && navigator.getGamepads()) || [];
    const stillConnected = Array.from(pads).some(p => p && p.connected);
    if (!stillConnected && rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
      prev = null;
      pttDown = false;
    }
  });

  // If a pad is already connected at boot (Chromium remembers connections
  // across reloads in the same profile), kick off the loop immediately.
  const existing = (navigator.getGamepads && navigator.getGamepads()) || [];
  if (Array.from(existing).some(p => p && p.connected)) {
    poll();
  }

  // Expose a probe for the rest of the UI to detect "are we on a controller?"
  window.MultideckGamepad = {
    isConnected() {
      const pads = (navigator.getGamepads && navigator.getGamepads()) || [];
      return Array.from(pads).some(p => p && p.connected);
    },
    BUTTON,
  };
})();
