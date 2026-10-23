// Pixel-perfect renderer. World units are Unity units (y up, 16 px per unit); the
// camera matches PixelPerfectCamera: 256x192 reference, orthographic size 6.

import { assets } from "./assets.js";

export const PPU = 16;
export const VIEW_W = 256;
export const VIEW_H = 192;
export const HALF_W = VIEW_W / PPU / 2; // 8 units
export const HALF_H = VIEW_H / PPU / 2; // 6 units

export const camera = { x: 0, y: 0 };

let ctx = null;

export function initRender(canvas) {
  ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const fit = () => {
    const scale = Math.max(1, Math.floor(Math.min((innerWidth - 24) / VIEW_W, (innerHeight - 140) / VIEW_H)));
    canvas.style.width = VIEW_W * scale + "px";
    canvas.style.height = VIEW_H * scale + "px";
  };
  addEventListener("resize", fit);
  fit();
  return ctx;
}

export const sx = (wx) => Math.round((wx - camera.x + HALF_W) * PPU);
export const sy = (wy) => Math.round((camera.y + HALF_H - wy) * PPU);

export function clear(color = "#000") {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

/**
 * Draw a sprite so its Unity pivot lands on world point (wx, wy).
 * flipX mirrors around the pivot like SpriteRenderer.flipX / negative scale.
 */
export function drawSprite(name, wx, wy, flipX = false, alpha = 1, flipY = false) {
  const s = assets.sprites[name];
  if (!s) return;
  const img = assets.images[s.tex];
  const px = sx(wx), py = sy(wy);
  // Off-screen cull (generous margin for big sprites like the boss).
  if (px + s.w < -64 || px - s.w > VIEW_W + 64) return;
  ctx.save();
  if (alpha !== 1) ctx.globalAlpha = alpha;
  ctx.translate(px, py);
  ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  ctx.drawImage(img, s.x, s.y, s.w, s.h, Math.round(-s.px), Math.round(-s.py), s.w, s.h);
  ctx.restore();
}

/** Outline a world-space box (debug overlay). */
export function strokeBox(cx, cy, w, h, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.strokeRect(sx(cx - w / 2) + 0.5, sy(cy + h / 2) + 0.5, Math.round(w * PPU) - 1, Math.round(h * PPU) - 1);
}

export function fillRectScreen(x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

/** Tiny built-in text renderer (uses the canvas font; HUD/menus only). */
export function text(str, x, y, color = "#fff", align = "left", size = 8) {
  ctx.fillStyle = color;
  ctx.font = `${size}px ui-monospace, Menlo, monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  ctx.fillText(str, x, y);
}

export function getCtx() { return ctx; }
