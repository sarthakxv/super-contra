import { loadAssets } from "./assets.js";
import { initRender, clear, text, fillRectScreen, VIEW_W, VIEW_H, getCtx } from "./render.js";
import { PlayerInput, consumePress, startPressed, endFrame, clearInput, suspendInput } from "./input.js";
import { initAudio, resumeAudio, toggleMute, playMusic, stopMusic } from "./audio.js";
import { assets } from "./assets.js";
import { Game } from "./game.js";
import { settings, keyLabel } from "./settings.js";
import { loadCharacters } from "./characters.js";
import { initCustomization } from "./customize.js";
import { highScore, formatScore } from "./score.js";
import { initTouchControls } from "./touch.js";

const STEP = 0.02; // Unity Fixed Timestep

const inputs = [new PlayerInput(0)];
let scene = "title";
let game = null;
let paused = false;
let titleMusicStarted = false;
let customization = null;
let touchControls = null;

function refreshActions(customizing = !!customization?.open) {
  document.getElementById("customize-button").hidden = scene !== "title" && (!paused || !!game?.result);
  document.getElementById("resume-button").hidden = scene !== "game" || !paused || !!game?.result;
  touchControls?.sync({ scene, paused, result: game?.result, customizing });
}

function refreshHelp() {
  const help = document.getElementById("help");
  help.replaceChildren();
  const keys = settings.bindings[0];
  help.append(`${[keys.up, keys.left, keys.down, keys.right].map(keyLabel).join("/")} move · ${keyLabel(keys.b)} fire · ${keyLabel(keys.a)} jump`, document.createElement("br"));
  help.append("gamepads supported · Enter/Esc start/pause · F2 colliders · M mute");
}

function interact() {
  if (customization?.open) return;
  resumeAudio();
  if (!titleMusicStarted && scene === "title") { titleMusicStarted = true; playMusic("01 Title", false); }
}
addEventListener("keydown", interact, { capture: true });
addEventListener("pointerdown", interact, { capture: true });

function updateTitle() {
  if (startPressed() || consumePress(settings.bindings[0].b) || consumePress(settings.bindings[0].a)) {
    stopMusic();
    game = new Game(inputs, inputs.length);
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
    // Single player for now: mask the original "2 PLAYERS" row (co-op returns with online play).
    fillRectScreen(52, 150, 78, 12, "#000");
  }
  fillRectScreen(0, 0, VIEW_W, 16, "#000");
  if (highScore.bestScore > 0) text(`HI ${formatScore(highScore.bestScore)}`, VIEW_W / 2, 4, "#ffcf61", "center");
  fillRectScreen(0, VIEW_H - 16, VIEW_W, 16, "#000");
  text(touchControls?.enabled ? "Tap START to play" : `ENTER / ${keyLabel(settings.bindings[0].b)} to start`, VIEW_W / 2, VIEW_H - 12, "#888", "center");
}

function update() {
  if (customization?.open || touchControls?.blocked) { endFrame(); return; }
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
      if (!paused) {
        game.update(STEP);
        if (game.result) refreshActions();
      }
    }
  }
  endFrame();
}

function draw() {
  const scoreFeedback = document.getElementById("score-feedback");
  if (scoreFeedback.hidden !== highScore.persisted) scoreFeedback.hidden = highScore.persisted;
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
      suspendInput(true); refreshActions(true);
    },
    onClose({ saved, persisted }) {
      suspendInput(false); refreshActions(); refreshHelp();
      const feedback = document.getElementById("settings-feedback");
      feedback.hidden = !saved || persisted;
      feedback.textContent = saved && !persisted ? "Applied for this session. Browser storage is unavailable; these settings will reset after reload." : "";
    },
  });
  touchControls = initTouchControls({
    onInteract: interact,
    onUnavailable() {
      if (scene === "game" && !game.result) paused = true;
      refreshActions();
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
