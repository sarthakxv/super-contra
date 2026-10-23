import { loadAssets } from "./assets.js";
import { initRender, clear, text, fillRectScreen, VIEW_W, VIEW_H, getCtx } from "./render.js";
import { PlayerInput, consumePress, startPressed, endFrame } from "./input.js";
import { initAudio, resumeAudio, toggleMute, playMusic, stopMusic } from "./audio.js";
import { assets } from "./assets.js";
import { Game } from "./game.js";

const STEP = 0.02; // Unity Fixed Timestep

const inputs = [new PlayerInput(0), new PlayerInput(1)];
let scene = "title";
let menuIndex = 0;
let game = null;
let paused = false;
let titleMusicStarted = false;

addEventListener("keydown", () => {
  resumeAudio();
  if (!titleMusicStarted && scene === "title") { titleMusicStarted = true; playMusic("01 Title", false); }
}, { capture: true });

function updateTitle() {
  if (consumePress("ArrowUp") || consumePress("KeyW")) menuIndex = 0;
  if (consumePress("ArrowDown") || consumePress("KeyS")) menuIndex = 1;
  if (startPressed() || consumePress("KeyZ") || consumePress("KeyX")) {
    stopMusic();
    game = new Game(inputs, menuIndex + 1);
    window.game = game; // console access for debugging
    scene = "game";
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
  text("ENTER / Z to start", VIEW_W / 2, VIEW_H - 12, "#888", "center");
}

function update() {
  if (consumePress("F2") && game) game.debug = !game.debug;
  if (consumePress("KeyM")) toggleMute();
  if (scene === "title") updateTitle();
  else if (scene === "game") {
    if (game.result) {
      if (game.time - game.resultTime > 2 && startPressed()) { stopMusic(); scene = "title"; game = null; }
      else game.update(STEP);
    } else {
      if (startPressed()) paused = !paused;
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
  initAudio().catch((e) => console.warn("audio init", e));
  canvas.focus();
  let acc = 0, last = performance.now(), poweredOn = false;
  const frame = (now) => {
    acc += Math.min(0.25, (now - last) / 1000);
    last = now;
    while (acc >= STEP) { update(); acc -= STEP; }
    draw();
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
