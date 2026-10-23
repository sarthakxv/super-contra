import { loadAssets } from "./assets.js";
import { initRender, clear, text, fillRectScreen, VIEW_W, VIEW_H, getCtx } from "./render.js";
import { PlayerInput, consumePress, startPressed, endFrame, clearInput, suspendInput } from "./input.js";
import { initAudio, resumeAudio, toggleMute, playMusic, stopMusic } from "./audio.js";
import { assets } from "./assets.js";
import { Game } from "./game.js";
import { settings, keyLabel } from "./settings.js";
import { loadCharacters } from "./characters.js";
import { initCustomization } from "./customize.js";

const STEP = 0.02; // Unity Fixed Timestep

const inputs = [new PlayerInput(0), new PlayerInput(1)];
let scene = "title";
let menuIndex = 0;
let game = null;
let paused = false;
let titleMusicStarted = false;
let customization = null;

function refreshActions() {
  document.getElementById("customize-button").hidden = scene !== "title" && (!paused || !!game?.result);
  document.getElementById("resume-button").hidden = scene !== "game" || !paused || !!game?.result;
}

function refreshHelp() {
  const help = document.getElementById("help");
  help.replaceChildren();
  settings.bindings.forEach((keys, i) => {
    const label = document.createElement("b"); label.textContent = `P${i + 1} `;
    help.append(label, `${[keys.up, keys.left, keys.down, keys.right].map(keyLabel).join("/")} move · ${keyLabel(keys.b)} fire · ${keyLabel(keys.a)} jump`, document.createElement("br"));
  });
  help.append("gamepads supported · Enter/Esc start/pause · F2 colliders · M mute");
}

addEventListener("keydown", () => {
  if (customization?.open) return;
  resumeAudio();
  if (!titleMusicStarted && scene === "title") { titleMusicStarted = true; playMusic("01 Title", false); }
}, { capture: true });

function updateTitle() {
  if (consumePress(settings.bindings[0].up) || consumePress(settings.bindings[1].up)) menuIndex = 0;
  if (consumePress(settings.bindings[0].down) || consumePress(settings.bindings[1].down)) menuIndex = 1;
  if (startPressed() || consumePress(settings.bindings[0].b) || consumePress(settings.bindings[0].a)) {
    stopMusic();
    game = new Game(inputs, menuIndex + 1);
    window.game = game; // console access for debugging
    scene = "game";
    paused = false;
    clearInput(); refreshActions();
  }
}

function drawTitle() {
  clear();
  // The NESMaps sheet embeds the original title screen in its first 256 px.
  const img = assets.images["ContraMapStage1BG.png"];
  const ctx = getCtx();
  if (img) {
    ctx.drawImage(img, 256, 0, 256, 240, 0, -24, 256, 240);
    // Move the original medal cursor (image 292,159 16x10) to the selected row.
    fillRectScreen(36, 135, 16, 10, "#000");
    ctx.drawImage(img, 292, 159, 16, 10, 36, 135 + menuIndex * 16, 16, 10);
  }
  fillRectScreen(0, VIEW_H - 16, VIEW_W, 16, "#000");
  text(`ENTER / ${keyLabel(settings.bindings[0].b)} to start`, VIEW_W / 2, VIEW_H - 12, "#888", "center");
}

function update() {
  if (customization?.open) { endFrame(); return; }
  if (consumePress("F2") && game) game.debug = !game.debug;
  if (consumePress("KeyM")) toggleMute();
  if (scene === "title") updateTitle();
  else if (scene === "game") {
    if (game.result) {
      if (game.time - game.resultTime > 2 && startPressed()) {
        stopMusic(); scene = "title"; game = null; paused = false;
        clearInput(); refreshActions();
      }
      else game.update(STEP);
    } else {
      if (startPressed()) { paused = !paused; clearInput(); refreshActions(); }
      if (!paused) game.update(STEP);
    }
  }
  endFrame();
}

function draw() {
  if (scene === "title") drawTitle();
  else {
    game.draw();
    if (paused) {
      fillRectScreen(0, 0, VIEW_W, VIEW_H, "rgba(0,0,0,0.5)");
      text("PAUSED", VIEW_W / 2, VIEW_H / 2 - 4, "#fff", "center");
    }
  }
}

// Open the CRT (see index.html) once the warm-up line has finished stretching,
// so a fast load doesn't cut it short.
async function powerOn() {
  const crt = document.getElementById("crt");
  await Promise.all(crt.getAnimations().map((a) => a.finished)).catch(() => {});
  document.body.classList.replace("crt-boot", "crt-on");
}

async function boot() {
  const canvas = document.getElementById("screen");
  initRender(canvas);
  await loadAssets();
  await loadCharacters();
  customization = initCustomization({
    onOpen() {
      if (scene === "game") paused = true;
      suspendInput(true); refreshActions();
    },
    onClose({ saved, persisted }) {
      suspendInput(false); refreshActions(); refreshHelp();
      const feedback = document.getElementById("settings-feedback");
      feedback.hidden = !saved || persisted;
      feedback.textContent = saved && !persisted ? "Applied for this session. Browser storage is unavailable; these settings will reset after reload." : "";
    },
  });
  const customizeButton = document.getElementById("customize-button");
  customizeButton.disabled = false;
  customizeButton.addEventListener("click", () => customization.show(scene === "game"));
  document.getElementById("resume-button").addEventListener("click", () => {
    paused = false; clearInput(); refreshActions(); canvas.focus();
  });
  refreshHelp(); refreshActions();
  initAudio().catch((e) => console.warn("audio init", e));
  canvas.focus();
  let acc = 0, last = performance.now(), poweredOn = false;
  const frame = (now) => {
    const elapsed = Math.min(0.25, (now - last) / 1000);
    acc += elapsed;
    last = now;
    while (acc >= STEP) { update(); acc -= STEP; }
    draw();
    customization.draw(elapsed);
    if (!poweredOn) { poweredOn = true; powerOn(); } // first frame has pixels now
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

boot().catch((e) => {
  console.error(e);
  document.body.classList.replace("crt-boot", "crt-on");
  document.body.append(String(e));
});
