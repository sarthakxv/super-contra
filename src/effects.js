// Explosion prefabs ("Big Explosion", "Small Explosion"): play one non-looping clip, then vanish.

import { assets } from "./assets.js";
import { drawSprite } from "./render.js";

export class Explosion {
  constructor(game, kind, x, y) {
    this.game = game;
    this.x = x; this.y = y;
    this.alive = true;
    this.order = 100;
    const clip = assets.anims.animations[kind];
    this.clip = clip;
    this.time = 0;
  }

  update(dt) {
    this.time += dt;
    if (this.time >= this.clip.interval * this.clip.frames.length) this.alive = false;
  }

  draw() {
    const i = Math.min(this.clip.frames.length - 1, Math.floor(this.time / this.clip.interval));
    drawSprite(this.clip.frames[i], this.x, this.y);
  }
}
