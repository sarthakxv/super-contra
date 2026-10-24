// Keyboard, touch + gamepad input mapped onto the original "Main" action map:
// Horizontal/Vertical axes, B (fire, Z) and A (jump, X), Start (Esc).

import { settings } from "./settings.js";

const held = new Set();
const pressedThisFrame = new Set();
const players = new Set();
let suspended = false;
const touch = { horizontal: 0, vertical: 0, a: false, b: false };

export function setTouchDirection(horizontal, vertical) {
  if (suspended) return;
  touch.horizontal = horizontal; touch.vertical = vertical;
}

export function setTouchButton(action, down) {
  if (!suspended && (action === "a" || action === "b")) touch[action] = down;
}

export function pressStart() {
  if (!suspended) pressedThisFrame.add("Enter");
}

export function clearInput() {
  held.clear();
  pressedThisFrame.clear();
  touch.horizontal = touch.vertical = 0;
  touch.a = touch.b = false;
  for (const player of players) player.reset();
}

export function suspendInput(value) {
  suspended = value;
  clearInput();
  // A held gamepad Start button must be released before it can pause again.
  padStartHeld = true;
}

window.addEventListener("keydown", (e) => {
  if (suspended || e.target.closest?.("input, select, textarea, dialog, [contenteditable]")) return;
  if (e.target.closest?.("button") && !["Escape", "KeyM", "F2"].includes(e.code)) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (settings.bindings.some((keys) => Object.values(keys).includes(e.code)) || e.code === "Space") e.preventDefault();
  if (e.repeat) return;
  held.add(e.code);
  pressedThisFrame.add(e.code);
  if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault();
});
window.addEventListener("keyup", (e) => held.delete(e.code));
window.addEventListener("blur", clearInput);

/** Per-player input state sampled once per fixed step. Mirrors the IInput interface. */
export class PlayerInput {
  constructor(index) {
    this.index = index;
    players.add(this);
    this.reset();
  }

  reset() {
    this.horizontal = 0;
    this.vertical = 0;
    this.b = false; this.bDown = false;   // fire
    this.a = false; this.aDown = false;   // jump
    this._prevA = false; this._prevB = false;
  }

  sample() {
    if (suspended) { this.reset(); return; }
    const k = settings.bindings[this.index];
    let h = (held.has(k.right) ? 1 : 0) - (held.has(k.left) ? 1 : 0);
    let v = (held.has(k.up) ? 1 : 0) - (held.has(k.down) ? 1 : 0);
    let a = held.has(k.a), b = held.has(k.b);
    if (this.index === 0) {
      h = touch.horizontal || h; v = touch.vertical || v;
      a = a || touch.a; b = b || touch.b;
    }

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
    if (suspended) return false;
    const k = settings.bindings[this.index];
    const pad = navigator.getGamepads ? navigator.getGamepads()[this.index] : null;
    return (this.index === 0 && Object.values(touch).some(Boolean)) ||
      Object.values(k).some((c) => held.has(c)) || (pad && pad.buttons.some((b) => b.pressed));
  }
}

/** Edge-triggered global keys (start/pause, debug toggles). */
export function consumePress(code) {
  if (pressedThisFrame.has(code)) { pressedThisFrame.delete(code); return true; }
  return false;
}

let padStartHeld = false;

export function startPressed() {
  let pad = false;
  for (const p of (navigator.getGamepads ? navigator.getGamepads() : [])) {
    if (p && p.buttons[9] && p.buttons[9].pressed) pad = true;
  }
  const padDown = pad && !padStartHeld; // edge-triggered like keyboard presses
  padStartHeld = pad;
  const enter = consumePress("Enter"), escape = consumePress("Escape");
  return !suspended && (enter || escape || padDown);
}

export function endFrame() { pressedThisFrame.clear(); }
