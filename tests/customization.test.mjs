import test from "node:test";
import assert from "node:assert/strict";
import { ACTIONS, SETTINGS_KEY, settings, defaultSettings, normalizeSettings, bindingError, keyLabel, loadSettings, saveSettings } from "../src/settings.js";

test("settings reject corrupt bindings and unsupported saved versions", () => {
  for (const value of [null, {}, { version: 2 }, { version: 1, bindings: [null, null] },
    { version: 1, bindings: [{}, {}] }, { version: 1, bindings: [defaultSettings().bindings[0], null] }]) {
    assert.deepEqual(normalizeSettings(value), defaultSettings());
  }
  const duplicate = defaultSettings(); duplicate.bindings[0].b = "KeyF";
  duplicate.characters = ["viper", "bad-id"];
  assert.deepEqual(normalizeSettings(duplicate).bindings, defaultSettings().bindings);
  assert.deepEqual(normalizeSettings(duplicate).characters, ["viper", "commando"]);
  const reserved = defaultSettings(); reserved.bindings[0].a = "Enter";
  assert.deepEqual(normalizeSettings(reserved).bindings, defaultSettings().bindings);
});

test("binding validation detects cross-player conflicts and allows keeping the same key", () => {
  const { bindings } = defaultSettings();
  assert.equal(bindingError(bindings, 0, "b", "KeyZ"), "");
  assert.equal(bindingError(bindings, 0, "b", "KeyJ"), "");
  assert.match(bindingError(bindings, 0, "b", "KeyF"), /Player 2: Fire/);
  assert.match(bindingError(bindings, 0, "b", "KeyX"), /Player 1: Jump/);
  for (const code of ["Enter", "Escape", "KeyM", "F2"]) assert.match(bindingError(bindings, 0, "b", code), /reserved/);
  for (const code of ["MetaLeft", "F5", "", "<script>"]) assert.notEqual(bindingError(bindings, 0, "b", code), "");
});

test("left and right Shift are distinct bindings that survive normalization", () => {
  const draft = defaultSettings();
  for (const code of ["ShiftLeft", "ShiftRight"]) assert.equal(bindingError(draft.bindings, 0, "a", code), "");
  draft.bindings[0].a = "ShiftLeft"; draft.bindings[1].a = "ShiftRight";
  assert.deepEqual(normalizeSettings(draft), draft);
  assert.match(bindingError(draft.bindings, 1, "b", "ShiftLeft"), /Player 1: Jump/);
  assert.equal(keyLabel("ShiftLeft"), "Left Shift");
  assert.equal(keyLabel("ShiftRight"), "Right Shift");
});

test("settings round-trip without mutating a saved draft and survive denied storage", () => {
  const storage = new Map();
  globalThis.localStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  const draft = defaultSettings(); draft.bindings[0].b = "KeyJ"; draft.characters = ["ghost", "ember"];
  assert.equal(saveSettings(draft), true);
  assert.deepEqual(loadSettings(), draft);
  draft.bindings[0].b = "KeyL";
  assert.equal(settings.bindings[0].b, "KeyJ");
  storage.set(SETTINGS_KEY, "broken JSON");
  assert.deepEqual(loadSettings(), defaultSettings());
  globalThis.localStorage = { getItem() { throw Error("denied"); }, setItem() { throw Error("denied"); } };
  assert.deepEqual(loadSettings(), defaultSettings());
  assert.equal(saveSettings(draft), false);
  assert.equal(settings.bindings[0].b, "KeyL");
  Object.assign(settings, defaultSettings());
});

test("input uses saved bindings, clears held keys, and isolates customization from gameplay", async () => {
  globalThis.window = new EventTarget();
  const pads = [];
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { getGamepads: () => pads } });
  const { PlayerInput, clearInput, suspendInput, startPressed } = await import("../src/input.js");
  const player = new PlayerInput(0);
  function key(type, code, modifiers = {}) {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { code, repeat: false, ...modifiers }); window.dispatchEvent(event); return event;
  }
  settings.bindings[0].b = "KeyJ";
  key("keydown", "KeyZ"); player.sample(); assert.equal(player.b, false);
  const fire = key("keydown", "KeyJ"); player.sample();
  assert.equal(player.b, true); assert.equal(player.bDown, true); assert.equal(fire.defaultPrevented, true);
  player.sample(); assert.equal(player.bDown, false);
  suspendInput(true); key("keydown", "ArrowRight"); key("keydown", "Enter"); player.sample();
  assert.equal(player.b, false); assert.equal(player.horizontal, 0); assert.equal(startPressed(), false);
  suspendInput(false); player.sample(); assert.equal(player.horizontal, 0); assert.equal(startPressed(), false);
  key("keydown", "ArrowRight"); player.sample(); assert.equal(player.horizontal, 1);
  clearInput(); player.sample(); assert.equal(player.horizontal, 0);
  settings.bindings[0].a = "ShiftLeft";
  key("keydown", "ShiftRight", { shiftKey: true }); player.sample(); assert.equal(player.a, false);
  key("keydown", "ShiftLeft", { shiftKey: true });
  key("keydown", "KeyJ", { shiftKey: true }); player.sample();
  assert.equal(player.aDown, true); assert.equal(player.b, true);
  key("keyup", "ShiftLeft", { shiftKey: true }); player.sample(); assert.equal(player.a, false);
  clearInput();
  pads[0] = { axes: [0.9, -0.9], buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: i === 0 || i === 1 })) };
  player.sample();
  assert.equal(player.horizontal, 1); assert.equal(player.vertical, 1); assert.equal(player.a, true); assert.equal(player.b, true);
  pads.length = 0; Object.assign(settings, defaultSettings()); clearInput();
  assert.equal(Object.keys(ACTIONS).length, 6);
});
