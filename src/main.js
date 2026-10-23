import { loadAssets } from "./assets.js";
import { initRender, clear, camera, drawSprite, strokeBox, text } from "./render.js";
import { buildWorld, ledges, water, LAYER } from "./world.js";
import { consumePress, endFrame } from "./input.js";

const STEP = 0.02; // Unity Fixed Timestep

let debug = true;
const held = new Set();
addEventListener("keydown", (e) => held.add(e.code));
addEventListener("keyup", (e) => held.delete(e.code));

function update() {
  if (consumePress("F2")) debug = !debug;
  const speed = held.has("ShiftLeft") ? 40 : 10;
  if (held.has("ArrowRight")) camera.x += speed * STEP;
  if (held.has("ArrowLeft")) camera.x -= speed * STEP;
  if (held.has("ArrowUp")) camera.y += speed * STEP;
  if (held.has("ArrowDown")) camera.y -= speed * STEP;
  endFrame();
}

function draw() {
  clear();
  drawSprite("ContraMapStage1BG_0", 94, 0.5);
  if (debug) {
    for (const l of ledges) strokeBox((l.x0 + l.x1) / 2, (l.top + l.bottom) / 2, l.x1 - l.x0, l.top - l.bottom,
      l.layer === LAYER.Ground ? "#f00" : "#ff0");
    for (const w of water) strokeBox((w.x0 + w.x1) / 2, (w.top + w.bottom) / 2, w.x1 - w.x0, w.top - w.bottom, "#0af");
    text(`cam ${camera.x.toFixed(1)}, ${camera.y.toFixed(1)}`, 2, 2);
  }
}

async function boot() {
  const canvas = document.getElementById("screen");
  initRender(canvas);
  await loadAssets();
  buildWorld();
  camera.x = -1.7; camera.y = -0.55;
  let acc = 0, last = performance.now();
  const frame = (now) => {
    acc += Math.min(0.25, (now - last) / 1000);
    last = now;
    while (acc >= STEP) { update(); acc -= STEP; }
    draw();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

boot().catch((e) => { console.error(e); document.body.append(String(e)); });
