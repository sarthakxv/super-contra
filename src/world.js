// Static level collision rebuilt from the Grid tilemaps (cell size 1 unit, tile anchor 0.5).
// Ground (layer 7) and Platforms (layer 8) cells carry a thin slab physics shape
// (y -0.0625..0.125 around the cell center); Water (layer 4) cells are full squares.

import { assets } from "./assets.js";

export const LAYER = { Water: 4, Character: 6, Ground: 7, Platform: 8, Player: 9 };

/** One-way ledges: {x0, x1, top, bottom, layer}. Adjacent cells are merged into runs. */
export const ledges = [];
/** Water boxes: {x0, x1, top, bottom}. */
export const water = [];

export function buildWorld() {
  ledges.length = 0;
  water.length = 0;
  for (const [name, tm] of Object.entries(assets.level.tilemaps)) {
    if (name === "BG") continue;
    const rows = new Map();
    for (const [cx, cy, si] of tm.cells) {
      const sh = tm.sprites[si];
      if (!sh) continue;
      const poly = sh.shape[0];
      const ys = poly.map((p) => p[1]);
      const top = cy + 0.5 + Math.max(...ys), bottom = cy + 0.5 + Math.min(...ys);
      const key = `${top}|${bottom}`;
      if (!rows.has(key)) rows.set(key, []);
      rows.get(key).push(cx);
    }
    for (const [key, xs] of rows) {
      const [top, bottom] = key.split("|").map(Number);
      xs.sort((a, b) => a - b);
      let start = xs[0], prev = xs[0];
      const flush = () => {
        const run = { x0: start, x1: prev + 1, top, bottom, layer: tm.layer };
        (tm.layer === LAYER.Water ? water : ledges).push(run);
      };
      for (let i = 1; i < xs.length; i++) {
        if (xs[i] !== prev + 1) { flush(); start = xs[i]; }
        prev = xs[i];
      }
      flush();
    }
  }
}

/**
 * Find the highest ledge whose top is crossed by a falling box bottom between
 * prevBottom and newBottom (one-way: only from above). Returns ledge or null.
 */
export function landingLedge(x0, x1, prevBottom, newBottom, { skipPlatforms = false, ignore = null } = {}) {
  let best = null;
  for (const l of ledges) {
    if (skipPlatforms && l.layer === LAYER.Platform) continue;
    if (l === ignore) continue;
    if (x1 <= l.x0 || x0 >= l.x1) continue;
    if (prevBottom >= l.top - 1e-4 && newBottom <= l.top) {
      if (!best || l.top > best.top) best = l;
    }
  }
  return best;
}

/** Ledge directly under a box bottom (standing check), within epsilon. */
export function ledgeUnder(x0, x1, bottom, eps = 0.02) {
  let best = null;
  for (const l of ledges) {
    if (x1 <= l.x0 || x0 >= l.x1) continue;
    if (Math.abs(bottom - l.top) <= eps && (!best || l.top > best.top)) best = l;
  }
  return best;
}

export function inWater(x0, x1, y0, y1) {
  for (const w of water) {
    if (x1 > w.x0 && x0 < w.x1 && y1 > w.bottom && y0 < w.top) return w;
  }
  return null;
}
