// Minimal Rigidbody2D emulation: semi-implicit Euler like Box2D
// (v += g*dt; p += v*dt) with one-way landing on the tilemap ledges.

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
    this.ledge = null;        // ledge we're standing on
    this.dropLedge = null;    // ledge we're currently falling through
    this.passPlatforms = false;
  }

  get bottom() { return this.y + this.box.oy - this.box.h / 2; }
  get x0() { return this.x + this.box.ox - this.box.w / 2; }
  get x1() { return this.x + this.box.ox + this.box.w / 2; }

  /** Start falling through the current platform (drop-down). */
  dropThrough() {
    if (this.ledge) { this.dropLedge = this.ledge; this.ledge = null; }
  }

  step(dt) {
    this.vy += GRAVITY * this.gravityScale * dt;
    const prevBottom = this.bottom;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (!this.collides) { this.ledge = null; return; }

    // Release the drop-through ledge once fully below it.
    if (this.dropLedge && this.bottom < this.dropLedge.bottom - 0.05) this.dropLedge = null;

    if (this.vy <= 0) {
      const hit = landingLedge(this.x0, this.x1, prevBottom, this.bottom,
        { skipPlatforms: this.passPlatforms, ignore: this.dropLedge });
      if (hit) {
        this.y += hit.top - this.bottom;
        this.vy = 0;
        this.ledge = hit;
        return;
      }
    }
    // Walking off the end of a ledge.
    if (this.ledge && (this.vy > 0 || !ledgeUnder(this.x0, this.x1, this.bottom))) this.ledge = null;
  }

  get grounded() { return this.ledge !== null; }
}

/** Axis-aligned box overlap test on world-space {x0,x1,y0,y1}. */
export function overlaps(a, b) {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}
