// Hitbox / Damage pairing. A Damage trigger hits a Hitbox when they overlap and the
// hitbox supports the damage type (DamageType.General is accepted by everyone).

import { worldBox, overlaps } from "./physics.js";

export const DamageType = { Player: 0, Invader: 1, Enemy: 2, General: 3 };

export class Hitbox {
  /**
   * @param owner entity with x, y, flip
   * @param {{ox,oy,w,h}} box BoxCollider2D offset/size
   * @param {number[]} types Hitbox._supportedTypes
   */
  constructor(owner, box, types, onHit = null) {
    this.owner = owner;
    this.base = { ...box };
    this.box = { ...box };
    this.types = types;
    this.invincible = false;
    this.enabled = true;
    this.hits = 0;
    this.onHit = onHit;
  }

  setVOffset(v) { this.box.oy = this.base.oy + v; }
  setVSize(s) { this.box.h = s; }

  world() {
    const o = this.owner, b = this.box;
    return worldBox(o.x, o.y, b.ox, b.oy, b.w, b.h, o.flip);
  }

  /** Hitbox.IsHit(out hits): consumes pending hits. */
  consume() {
    const n = this.hits;
    this.hits = 0;
    return n;
  }
}

export class Damage {
  constructor(owner, box, type, onHit = null) {
    this.owner = owner;
    this.box = box;
    this.type = type;
    this.onHit = onHit;
    this.enabled = true;
  }

  world() {
    const o = this.owner, b = this.box;
    const s = o.scale || 1;
    return worldBox(o.x, o.y, b.ox * s, b.oy * s, b.w * s, b.h * s, o.flip);
  }
}

/** Resolve all damage/hitbox overlaps for this step. */
export function resolveDamage(damages, hitboxes) {
  for (const d of damages) {
    if (!d.enabled || !d.owner.alive) continue;
    const db = d.world();
    for (const h of hitboxes) {
      if (!h.enabled || !h.owner.alive || h.owner === d.owner) continue;
      if (h.invincible) continue;
      if (d.type !== DamageType.General && !h.types.includes(d.type)) continue;
      if (!overlaps(db, h.world())) continue;
      h.hits++;
      if (h.onHit) h.onHit(d);
      if (d.onHit) d.onHit(h);
      if (!d.enabled || !d.owner.alive) break;
    }
  }
}
