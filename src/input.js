// Keyboard + gamepad input mapped onto the original "Main" action map:
// Horizontal/Vertical axes, B (fire, Z) and A (jump, X), Start (Esc).

const KEYMAPS = [
  { left: "ArrowLeft", right: "ArrowRight", up: "ArrowUp", down: "ArrowDown", b: "KeyZ", a: "KeyX" },
  { left: "KeyA", right: "KeyD", up: "KeyW", down: "KeyS", b: "KeyF", a: "KeyG" },
];

const held = new Set();
const pressedThisFrame = new Set();

window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  held.add(e.code);
  pressedThisFrame.add(e.code);
  if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault();
});
window.addEventListener("keyup", (e) => held.delete(e.code));
window.addEventListener("blur", () => held.clear());

/** Per-player input state sampled once per fixed step. Mirrors the IInput interface. */
export class PlayerInput {
  constructor(index) {
    this.index = index;
    this.horizontal = 0;
    this.vertical = 0;
    this.b = false; this.bDown = false;   // fire
    this.a = false; this.aDown = false;   // jump
    this._prevA = false; this._prevB = false;
  }

  sample() {
    const k = KEYMAPS[this.index];
    let h = (held.has(k.right) ? 1 : 0) - (held.has(k.left) ? 1 : 0);
    let v = (held.has(k.up) ? 1 : 0) - (held.has(k.down) ? 1 : 0);
    let a = held.has(k.a), b = held.has(k.b);

    const pad = navigator.getGamepads ? navigator.getGamepads()[this.index] : null;
    if (pad) {
      const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
      if (Math.abs(ax) > 0.5) h = Math.sign(ax);
      if (Math.abs(ay) > 0.5) v = -Math.sign(ay);
      const btn = (i) => pad.buttons[i] && pad.buttons[i].pressed;
      if (btn(14)) h = -1; if (btn(15)) h = 1;
      if (btn(12)) v = 1; if (btn(13)) v = -1;
      a = a || btn(0);        // buttonSouth
      b = b || btn(1) || btn(2); // buttonEast (+ West for comfort)
    }
    this.horizontal = h; this.vertical = v;
    this.aDown = a && !this._prevA; this.bDown = b && !this._prevB;
    this.a = a; this.b = b;
    this._prevA = a; this._prevB = b;
  }

  get active() {
    const k = KEYMAPS[this.index];
    const pad = navigator.getGamepads ? navigator.getGamepads()[this.index] : null;
    return Object.values(k).some((c) => held.has(c)) || (pad && pad.buttons.some((b) => b.pressed));
  }
}

/** Edge-triggered global keys (start/pause, debug toggles). */
export function consumePress(code) {
  if (pressedThisFrame.has(code)) { pressedThisFrame.delete(code); return true; }
  return false;
}

export function startPressed() {
  let pad = false;
  for (const p of (navigator.getGamepads ? navigator.getGamepads() : [])) {
    if (p && p.buttons[9] && p.buttons[9].pressed) pad = true;
  }
  const k = consumePress("Enter") || consumePress("Escape");
  return k || pad;
}

export function endFrame() { pressedThisFrame.clear(); }
