export const SETTINGS_KEY = "contra.customization.v1";
export const ACTIONS = {
  left: "Move left", right: "Move right", up: "Aim up", down: "Crouch / aim down",
  b: "Fire", a: "Jump",
};
export const DEFAULT_BINDINGS = [
  { left: "ArrowLeft", right: "ArrowRight", up: "ArrowUp", down: "ArrowDown", b: "KeyZ", a: "KeyX" },
  { left: "KeyA", right: "KeyD", up: "KeyW", down: "KeyS", b: "KeyF", a: "KeyG" },
];
export const CHARACTER_IDS = ["commando", "viper", "ember", "ghost"];
const RESERVED = new Set(["Enter", "Escape", "KeyM", "F2"]);
const KEY_PATTERN = /^(Key[A-Z]|Digit[0-9]|Arrow(Left|Right|Up|Down)|Shift(Left|Right)|Space|Backspace|Tab|Backquote|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|Numpad([0-9]|Add|Subtract|Multiply|Divide|Decimal)|Insert|Delete|Home|End|PageUp|PageDown)$/;

export function defaultSettings() {
  return { version: 1, bindings: DEFAULT_BINDINGS.map((keys) => ({ ...keys })), characters: ["commando", "commando"] };
}

export function keyLabel(code) {
  if (code === "ShiftLeft") return "Left Shift";
  if (code === "ShiftRight") return "Right Shift";
  return code.replace(/^Key/, "").replace(/^Digit/, "").replace(/^Arrow/, "").replace(/^Numpad/, "Num ");
}

export function bindingError(bindings, player, action, code) {
  if (RESERVED.has(code)) return `${keyLabel(code)} is reserved for ${code === "KeyM" ? "mute" : code === "F2" ? "debugging" : "start / pause"}.`;
  if (!KEY_PATTERN.test(code)) return "Choose a letter, number, arrow, or another standard keyboard key.";
  for (let i = 0; i < bindings.length; i++) {
    for (const [name, bound] of Object.entries(bindings[i])) {
      if (bound === code && !(i === player && name === action)) {
        return `${keyLabel(code)} is already assigned to Player ${i + 1}: ${ACTIONS[name]}.`;
      }
    }
  }
  return "";
}

export function normalizeSettings(value) {
  const result = defaultSettings();
  if (!value || value.version !== 1) return result;
  if (Array.isArray(value.bindings) && value.bindings.length === 2 &&
      value.bindings.every((keys) => keys && Object.keys(ACTIONS).every((action) => typeof keys[action] === "string"))) {
    const bindings = value.bindings.map((keys) => Object.fromEntries(Object.keys(ACTIONS).map((action) => [action, keys[action]])));
    if (bindings.every((keys, player) => Object.entries(keys).every(([action, code]) => !bindingError(bindings, player, action, code)))) result.bindings = bindings;
  }
  if (Array.isArray(value.characters)) {
    result.characters = result.characters.map((fallback, i) => CHARACTER_IDS.includes(value.characters[i]) ? value.characters[i] : fallback);
  }
  return result;
}

export function loadSettings() {
  try { return normalizeSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY))); }
  catch { return defaultSettings(); }
}

export const settings = loadSettings();

export function saveSettings(value) {
  Object.assign(settings, normalizeSettings(value));
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); return true; }
  catch { return false; }
}
