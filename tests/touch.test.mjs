import test from "node:test";
import assert from "node:assert/strict";
import { settings, defaultSettings } from "../src/settings.js";

globalThis.window = new EventTarget();
Object.defineProperty(globalThis, "navigator", { configurable: true, value: { getGamepads: () => [] } });
const { PlayerInput, setTouchDirection, setTouchButton, pressStart, startPressed, clearInput, suspendInput } = await import("../src/input.js");
const { stickDirection } = await import("../src/touch.js");

test("stick has a dead zone, cardinal directions, and all four diagonals", () => {
  assert.deepEqual(stickDirection(0, 0, 80), [0, 0]);
  assert.deepEqual(stickDirection(8, 8, 80), [0, 0]);
  for (const [x, y, expected] of [[80, 0, [1, 0]], [-80, 0, [-1, 0]], [0, -80, [0, 1]], [0, 80, [0, -1]],
    [50, -50, [1, 1]], [-50, -50, [-1, 1]], [50, 50, [1, -1]], [-50, 50, [-1, -1]],
    [80, 10, [1, 0]], [10, -80, [0, 1]], [240, -240, [1, 1]]]) {
    assert.deepEqual(stickDirection(x, y, 80), expected);
  }
});

test("touch moves, aims, shoots, and jumps together regardless of key bindings", () => {
  const player = new PlayerInput(0);
  settings.bindings[0].a = "KeyJ"; settings.bindings[0].b = "KeyK";
  setTouchDirection(1, 1); setTouchButton("b", true); setTouchButton("a", true);
  player.sample();
  assert.equal(player.horizontal, 1); assert.equal(player.vertical, 1);
  assert.equal(player.b, true); assert.equal(player.a, true); assert.equal(player.aDown, true);
  player.sample(); assert.equal(player.aDown, false); assert.equal(player.bDown, false);
  setTouchButton("a", false); player.sample();
  assert.equal(player.a, false); assert.equal(player.b, true); assert.equal(player.horizontal, 1);
  clearInput(); player.sample();
  assert.equal(player.horizontal, 0); assert.equal(player.vertical, 0);
  assert.equal(player.a, false); assert.equal(player.b, false);
  Object.assign(settings, defaultSettings());
});

test("touch cannot leak through customization and start is edge triggered", () => {
  const player = new PlayerInput(0);
  pressStart(); assert.equal(startPressed(), true); assert.equal(startPressed(), false);
  suspendInput(true);
  setTouchDirection(-1, -1); setTouchButton("a", true); setTouchButton("b", true); pressStart();
  player.sample();
  assert.equal(player.horizontal, 0); assert.equal(player.a, false); assert.equal(player.b, false);
  assert.equal(startPressed(), false);
  suspendInput(false); player.sample();
  assert.equal(player.horizontal, 0); assert.equal(player.aDown, false); assert.equal(player.b, false);
  pressStart(); clearInput(); assert.equal(startPressed(), false);
});

test("touch release preserves physical keyboard input and blur clears both", () => {
  const player = new PlayerInput(0);
  const key = new Event("keydown", { cancelable: true });
  Object.assign(key, { code: "ArrowLeft", repeat: false }); window.dispatchEvent(key);
  setTouchDirection(1, 0); player.sample(); assert.equal(player.horizontal, 1);
  setTouchDirection(0, 0); player.sample(); assert.equal(player.horizontal, -1);
  setTouchButton("b", true); window.dispatchEvent(new Event("blur")); player.sample();
  assert.equal(player.horizontal, 0); assert.equal(player.b, false);
});
