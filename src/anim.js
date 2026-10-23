// Port of Animator2D (com.sigma.scripts.data.animation): frame-stepped sprite
// animation driven by AnimatorController2D clip lists.
//   interval = 1/speed; frame i shows once time >= interval*i;
//   finished when time >= interval*length -> loop restarts, else stops on last frame;
//   Play(name) only restarts if name differs or restart is forced.

import { assets } from "./assets.js";

export class Animator {
  /** @param {string} controllerName key in anims.controllers */
  constructor(controllerName) {
    const c = assets.anims.controllers[controllerName];
    if (!c) throw new Error(`unknown controller ${controllerName}`);
    this.clips = {};
    c.identifiers.forEach((id, i) => { this.clips[id] = assets.anims.animations[c.animations[i]]; });
    this.current = null;
    this.name = null;
    this.time = 0;
    this.frame = 0;
    this.sprite = null;
    this.playing = false;
    this.onEvent = null;
    this.changed = false;
    this.play(c.defaultAnimation);
  }

  has(name) { return name in this.clips; }

  play(name, restart = false) {
    if (name === this.name && !restart) return;
    const clip = this.clips[name];
    if (!clip) return;
    this.name = name;
    this.current = clip;
    this.time = 0;
    this.frame = 0;
    this.playing = true;
    this.changed = true;
    this.sprite = clip.frames[0] || null;
  }

  get finished() {
    return this.current && this.time >= this.current.interval * this.current.frames.length;
  }

  update(dt) {
    const clip = this.current;
    if (!clip || !this.playing) return;
    this.time += dt;
    while (this.frame < clip.frames.length && this.time >= clip.interval * this.frame) {
      this.sprite = clip.frames[this.frame];
      this.frame++;
      if (this.onEvent) {
        for (const e of clip.events) if (e.frame === this.frame) this.onEvent(e);
      }
    }
    if (this.finished) {
      if (clip.loop) this.play(this.name, true);
      else this.playing = false;
    }
  }
}
