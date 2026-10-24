import { clearInput, pressStart, setTouchButton, setTouchDirection } from "./input.js";

// Eight directions, with a neutral center and equal 45-degree sectors.
export function stickDirection(x, y, radius) {
  const distance = Math.hypot(x, y);
  if (distance < radius * 0.18) return [0, 0];
  const threshold = distance * Math.sin(Math.PI / 8);
  return [Math.abs(x) > threshold ? Math.sign(x) : 0, Math.abs(y) > threshold ? -Math.sign(y) : 0];
}

export function initTouchControls({ onInteract, onUnavailable }) {
  const touch = matchMedia("(any-pointer: coarse)");
  const portrait = matchMedia("(orientation: portrait)");
  const root = document.getElementById("touch-controls");
  const play = document.getElementById("touch-play");
  const stick = document.getElementById("touch-stick");
  const start = document.getElementById("touch-start");
  const fullscreen = document.getElementById("touch-fullscreen");
  const landscape = document.getElementById("rotate-landscape");
  const actions = new Map([
    [document.getElementById("touch-fire"), { action: "b", pointers: new Set() }],
    [document.getElementById("touch-jump"), { action: "a", pointers: new Set() }],
  ]);
  let stickPointer = null;
  const blocked = () => touch.matches && portrait.matches;

  function reset() {
    stickPointer = null;
    stick.classList.remove("is-held");
    stick.style.removeProperty("--stick-x"); stick.style.removeProperty("--stick-y");
    setTouchDirection(0, 0);
    for (const [button, state] of actions) {
      state.pointers.clear(); button.classList.remove("is-held");
      setTouchButton(state.action, false);
    }
  }

  async function enterLandscape() {
    if (!touch.matches) return;
    // Fullscreen and orientation lock need a user gesture; Safari may support neither.
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
    } catch { /* The viewport layout also works outside fullscreen. */ }
    try { await screen.orientation?.lock?.("landscape"); }
    catch { /* The portrait prompt stays visible until the device is turned. */ }
  }

  function moveStick(event) {
    const rect = stick.getBoundingClientRect();
    const x = event.clientX - rect.left - rect.width / 2;
    const y = event.clientY - rect.top - rect.height / 2;
    const radius = rect.width / 2;
    setTouchDirection(...stickDirection(x, y, radius));
    const distance = Math.hypot(x, y);
    const scale = distance ? Math.min(1, radius * 0.58 / distance) : 0;
    stick.style.setProperty("--stick-x", `${x * scale}px`);
    stick.style.setProperty("--stick-y", `${y * scale}px`);
  }

  stick.addEventListener("pointerdown", (event) => {
    if (stickPointer !== null || blocked() || play.hidden || event.button !== 0) return;
    event.preventDefault(); onInteract();
    stickPointer = event.pointerId; stick.setPointerCapture(event.pointerId);
    stick.classList.add("is-held"); moveStick(event);
  });
  stick.addEventListener("pointermove", (event) => {
    if (event.pointerId === stickPointer) moveStick(event);
  });
  const releaseStick = (event) => {
    if (event.pointerId !== stickPointer) return;
    stickPointer = null; setTouchDirection(0, 0);
    stick.classList.remove("is-held");
    stick.style.removeProperty("--stick-x"); stick.style.removeProperty("--stick-y");
  };
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) stick.addEventListener(type, releaseStick);

  for (const [button, state] of actions) {
    button.addEventListener("pointerdown", (event) => {
      if (blocked() || play.hidden || event.button !== 0) return;
      event.preventDefault(); onInteract();
      button.setPointerCapture(event.pointerId); state.pointers.add(event.pointerId);
      button.classList.add("is-held"); setTouchButton(state.action, true);
    });
    const release = (event) => {
      state.pointers.delete(event.pointerId);
      button.classList.toggle("is-held", state.pointers.size > 0);
      setTouchButton(state.action, state.pointers.size > 0);
    };
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) button.addEventListener(type, release);
  }
  root.addEventListener("contextmenu", (event) => event.preventDefault());
  start.addEventListener("click", () => {
    onInteract(); reset();
    if (start.textContent !== "Pause") enterLandscape();
    pressStart(); document.getElementById("screen").focus({ preventScroll: true });
  });
  fullscreen.hidden = !document.fullscreenEnabled;
  fullscreen.addEventListener("click", () => {
    onInteract();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else enterLandscape();
  });
  document.addEventListener("fullscreenchange", () => {
    fullscreen.setAttribute("aria-label", document.fullscreenElement ? "Exit fullscreen" : "Enter fullscreen");
  });
  landscape.hidden = !document.fullscreenEnabled && !screen.orientation?.lock;
  landscape.addEventListener("click", () => { onInteract(); enterLandscape(); });

  function viewportChanged() {
    reset();
    if (blocked()) { clearInput(); onUnavailable(); }
  }
  touch.addEventListener("change", viewportChanged);
  portrait.addEventListener("change", viewportChanged);
  window.addEventListener("resize", viewportChanged);
  window.addEventListener("blur", () => {
    reset();
    if (touch.matches) { clearInput(); onUnavailable(); }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && touch.matches) { reset(); clearInput(); onUnavailable(); }
  });

  return {
    get enabled() { return touch.matches; },
    get blocked() { return blocked(); },
    sync({ scene, paused, result, customizing }) {
      reset();
      root.hidden = customizing;
      play.hidden = scene !== "game" || paused || !!result || customizing;
      start.disabled = customizing;
      start.textContent = scene === "title" ? "Start" : result ? "Continue" : paused ? "Resume" : "Pause";
    },
  };
}
