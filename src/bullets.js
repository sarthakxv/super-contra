// Player weapons, ported from BulletNormal / BulletSpin / BulletWave(+Child) and
// ProjectileShooter. Stats come from the bullet prefabs' serialized fields.

import { prefab, comp } from "./assets.js";
import { drawSprite } from "./render.js";
import { Damage, DamageType } from "./combat.js";
import { Explosion } from "./effects.js";

/** Weapon table indexed like ProjectileShooter._bullets / BulletPowerup.bulletIndex. */
const WEAPON_PREFABS = [
  ["Bullet Normal", "BulletNormal"],   // 0: default rifle
  ["Bullet Big", "BulletNormal"],      // 1: M (and L) - continuous machine gun
  ["Bullet Spin", "BulletSpin"],       // 2: F - corkscrew
  ["Bullet Wave", "BulletWave"],       // 3: S - 5-way spread
];

export function weaponStats(index) {
  const [name, script] = WEAPON_PREFABS[index];
  const p = prefab(name);
  const f = comp(p, script).fields;
  const dmgNode = p.children.find((c) => c.name === "Damage");
  const box = dmgNode && comp(dmgNode, "BoxCollider2D");
  return {
    index, name, script,
    bullets: f._bullets, reloadInterval: f._reloadInterval, isContinuous: !!f._isContinuous,
    fireRate: f._fireRate, speed: f.speed, destroyAfter: f.destroyAfter, sfx: f._sfx,
    radius: f.radius, spinSpeed: f.spinSpeed,
    sprite: (comp(p, "SpriteRenderer") || {}).fields?.m_Sprite?.name || "Bullet Big",
    damageBox: box ? { ox: box.fields.m_Offset.x, oy: box.fields.m_Offset.y,
      w: box.fields.m_Size.x, h: box.fields.m_Size.y } : { ox: 0, oy: 0, w: 0.32, h: 0.32 },
    prefab: p,
  };
}

/** Port of ProjectileShooter: magazine + fire-rate gate + reload timer. */
export class Shooter {
  constructor(game) {
    this.game = game;
    this.extraFireRate = 0;
    this.lastFireTime = -999;
    this.reloadTime = 0;
    this.assign(0);
    this.current = this.weapon.bullets; // MyStart: Reload()
  }

  /** AssignBullet: switches weapon; the magazine count carries over until the next reload. */
  assign(index) {
    this.weapon = weaponStats(index);
  }

  update(dt) {
    const w = this.weapon;
    if (this.current < w.bullets) this.reloadTime += dt;
    else this.reloadTime = 0;
    const threshold = w.reloadInterval - (this.extraFireRate * 0.25) / w.reloadInterval;
    if (this.reloadTime > threshold) this.current = w.bullets;
  }

  /** Returns true if a shot was fired. */
  tryShoot() {
    const t = this.game.time;
    if (this.current > 0 && t - this.lastFireTime > 1 / (this.weapon.fireRate + this.extraFireRate)) {
      this.lastFireTime = t;
      this.current--;
      return true;
    }
    return false;
  }
}

class BulletBase {
  constructor(game, w, x, y, dx, dy) {
    this.game = game;
    this.w = w;
    this.x = x; this.y = y;
    const len = Math.hypot(dx, dy) || 1;
    this.dx = dx / len; this.dy = dy / len;
    this.alive = true;
    this.order = 20;
    this.age = 0;
    this.flip = false;
  }

  explode(kind = "Small Explosion") {
    if (!this.alive) return;
    this.alive = false;
    this.game.add(new Explosion(this.game, kind, this.x, this.y));
  }

  update(dt) {
    this.age += dt;
    if (this.age >= this.w.destroyAfter) this.alive = false;
  }
}

export class BulletNormal extends BulletBase {
  constructor(game, w, x, y, dx, dy, damageType = DamageType.Player) {
    super(game, w, x, y, dx, dy);
    this.damage = game.addDamage(new Damage(this, w.damageBox, damageType, () => this.explode()));
  }

  update(dt) {
    this.x += this.dx * this.w.speed * dt;
    this.y += this.dy * this.w.speed * dt;
    super.update(dt);
  }

  draw() { drawSprite(this.w.sprite, this.x, this.y); }
}

export class BulletSpin extends BulletBase {
  constructor(game, w, x, y, dx, dy, damageType = DamageType.Player) {
    super(game, w, x, y, dx, dy);
    this.cx = x; this.cy = y;
    this.t = 0;
    this.damage = game.addDamage(new Damage(this, w.damageBox, damageType, () => this.explode()));
  }

  update(dt) {
    const { speed, radius, spinSpeed } = this.w;
    this.cx += this.dx * speed * dt;
    this.cy += this.dy * speed * dt;
    const sy = Math.sin(this.t * spinSpeed) * radius;
    const sgn = this.dx > 0 ? 1 : this.dx < 0 ? -1 : 0;
    const sx = (this.dx !== 0 ? -sgn : 1) * Math.cos(this.t * spinSpeed) * radius;
    this.x = this.cx + sgn * radius + sx;
    this.y = this.cy + sy;
    this.t += dt;
    super.update(dt);
  }

  draw() { drawSprite(this.w.sprite, this.x, this.y); }
}

/**
 * BulletWave: the parent's localScale grows by speed*dt each frame; its 5 children sit at
 * fixed local offsets, so they fan out along those rays. The parent is rotated so local +x
 * points along the aim direction (eulerAngles.z = sign(dir.y) * Angle(right, dir)).
 */
export class BulletWave extends BulletBase {
  constructor(game, w, x, y, dx, dy, damageType = DamageType.Player) {
    super(game, w, x, y, dx, dy);
    this.scale = 1;
    this.angle = Math.atan2(this.dy, this.dx);
    const px = w.prefab.x, py = w.prefab.y;
    this.children = w.prefab.children.filter((c) => c.name.startsWith("Bullet Child")).map((c) => {
      const child = { alive: true, lx: c.x - px, ly: c.y - py, x, y, flip: false, scale: 1.5 };
      child.damage = game.addDamage(new Damage(child, { ox: 0, oy: 0, w: 0.32, h: 0.32 }, damageType, () => {
        if (!child.alive) return;
        child.alive = false;
        game.add(new Explosion(game, "Small Explosion", child.x, child.y));
      }));
      return child;
    });
    this.place();
  }

  place() {
    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    for (const ch of this.children) {
      const lx = ch.lx * this.scale, ly = ch.ly * this.scale;
      ch.x = this.x + lx * c - ly * s;
      ch.y = this.y + lx * s + ly * c;
    }
  }

  update(dt) {
    this.scale += this.w.speed * dt;
    this.place();
    super.update(dt);
    if (!this.alive) for (const ch of this.children) ch.alive = false;
    if (this.children.every((ch) => !ch.alive)) this.alive = false;
  }

  draw() {
    for (const ch of this.children) if (ch.alive) drawSprite("Bullet Big", ch.x, ch.y);
  }
}

export const BULLET_CLASSES = { BulletNormal, BulletSpin, BulletWave };

export function spawnPlayerBullet(game, weapon, x, y, dx, dy) {
  const Cls = BULLET_CLASSES[weapon.script];
  return game.add(new Cls(game, weapon, x, y, dx, dy));
}
