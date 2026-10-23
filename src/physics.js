// Minimal Rigidbody2D emulation: semi-implicit Euler like Box2D
// (v += g*dt; p += v*dt) landing on the tilemap ledges from above.
// Physics2D.IgnoreLayerCollision is modelled per body via `ignore` (a Set of layers).

import { landingLedge, ledgeUnder } from "./world.js";

export const GRAVITY = -9.81; // Physics2DSettings.m_Gravity.y

export class Body {
  /**
   * @param {object} o
   * @param {number} o.gravityScale Rigidbody2D.gravityScale
   * @param {{ox:number, oy:number, w:number, h:number}} o.box solid BoxCollider2D (offset+size)
   */
  constructor({ x = 0, y = 0, gravityScale = 1, box = { ox: 0, oy: 0.5, w: 1, h: 1 }, collides = true } = {}) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.gravityScale = gravityScale;
    this.box = box;
    this.collides = collides;
    this.ledge = null;          // collider we're resting on
    this.ignore = new Set();    // ignored ground layers
  }

  get bottom() { return this.y + this.box.oy - this.box.h / 2; }
  get x0() { return this.x + this.box.ox - this.box.w / 2; }
  get x1() { return this.x + this.box.ox + this.box.w / 2; }

  setIgnore(layer, on) { if (on) this.ignore.add(layer); else this.ignore.delete(layer); }

  step(dt) {
    this.vy += GRAVITY * this.gravityScale * dt;
    const prevBottom = this.bottom;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (!this.collides) { this.ledge = null; return; }

    if (this.vy <= 0) {
      const hit = landingLedge(this.x0, this.x1, prevBottom, this.bottom, this.ignore);
      if (hit) {
        this.y += hit.top - this.bottom;
        this.vy = 0;
        this.ledge = hit;
        return;
      }
    }
    if (this.ledge && (this.vy > 0 || this.ignore.has(this.ledge.layer) ||
        !ledgeUnder(this.x0, this.x1, this.bottom, this.ignore))) this.ledge = null;
  }

  get grounded() { return this.ledge !== null; }
}

/** Axis-aligned box overlap test on world-space {x0,x1,y0,y1}. */
export function overlaps(a, b) {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

/** World box for a collider at (x, y) with offset/size, mirrored when facing left. */
export function worldBox(x, y, ox, oy, w, h, flip = false) {
  const cx = x + (flip ? -ox : ox), cy = y + oy;
  return { x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2 };
}
