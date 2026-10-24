// Stage-1 boss wall, ported from SuperMachine: two lobbing guns + a core.

import { prefab, comp, child } from "./assets.js";
import { Animator, controllerByRef } from "./anim.js";
import { Body } from "./physics.js";
import { overlapGround, LAYER } from "./world.js";
import { drawSprite } from "./render.js";
import { Hitbox, Damage, DamageType } from "./combat.js";
import { Explosion } from "./effects.js";

const SFX = { BossDefeat: 3, EnemyGun2: 5, EnemyHit: 6, EnemyExplode: 16 };

const boxOf = (node) => {
  const b = comp(node, "BoxCollider2D").fields;
  return { ox: b.m_Offset.x, oy: b.m_Offset.y, w: b.m_Size.x, h: b.m_Size.y };
};

/**
 * "Super Machine Bullet": BulletSoldier (speed 5, life 2 s) on a dynamic body (gravity 2.5)
 * that RandomJump kicks up by Random(0..10) on start; it explodes on Ground/Water (mask 144).
 */
class MachineBullet {
  constructor(game, x, y, dx) {
    const p = prefab("Super Machine Bullet");
    const f = comp(p, "BulletSoldier").fields;
    const j = comp(child(p, "Jumper"), "RandomJump").fields;
    this.game = game;
    this.alive = true;
    this.order = 20;
    this.flip = false;
    this.scale = p.sx;
    this.speed = f.speed;
    this.dx = Math.sign(dx);
    this.life = f.destroyAfter;
    this.explosion = f._explosion.name;
    this.sprite = comp(p, "SpriteRenderer").fields.m_Sprite.name;
    this.body = new Body({ x, y, gravityScale: comp(p, "Rigidbody2D").fields.m_GravityScale, collides: false });
    this.body.vy += j.minForce + Math.random() * (j.maxForce - j.minForce);
    this.ground = boxOf(child(p, "Grounder"));
    this.damage = game.addDamage(new Damage(this, boxOf(child(p, "Damage")), DamageType.Enemy, () => this.explode()));
  }

  get x() { return this.body.x; }
  get y() { return this.body.y; }

  explode() {
    if (!this.alive) return;
    this.alive = false;
    this.game.add(new Explosion(this.game, this.explosion, this.x, this.y));
  }

  update(dt) {
    this.body.x += this.dx * this.speed * dt;  // BulletSoldier.Update moves the transform
    this.body.step(dt);                        // plus Rigidbody2D gravity
    const g = this.ground, s = this.scale;
    const hits = overlapGround(this.x - g.w * s / 2, this.x + g.w * s / 2, this.y - g.h * s / 2, this.y + g.h * s / 2)
      .filter((l) => l.layer === LAYER.Ground || l.layer === LAYER.Water);
    if (hits.length && this.body.vy < 0) this.explode();
    this.life -= dt;
    if (this.life <= 0) this.alive = false;
  }

  draw() { drawSprite(this.sprite, this.x, this.y); }
}

class Part {
  constructor(boss, node, hitNode, health) {
    this.boss = boss;
    this.alive = true;
    this.x = node.x; this.y = node.y;
    this.flip = false;
    this.anim = new Animator(controllerByRef(comp(node, "Animator2D").fields._controller.ref));
    this.order = comp(node, "SpriteRenderer").fields.m_SortingOrder;
    this.hitbox = boss.game.addHitbox(new Hitbox(this, boxOf(hitNode), comp(hitNode, "Hitbox").fields._supportedTypes,
      (damage) => { this.hitByPlayer = damage.type === DamageType.Player; }));
    this.health = health;
    this.state = "Idle";
    const pt = node.children.find((c) => comp(c, "ShootPoint"));
    this.point = pt ? [pt.x, pt.y] : null;
  }
}

export class SuperMachine {
  constructor(game, node) {
    this.game = game;
    this.alive = true;
    this.x = node.x; this.y = node.y;
    this.order = 1;
    const f = comp(node, "SuperMachine").fields;
    this.attackRange = f.attackRange;
    this.shootInterval = f.shootInterval;
    this.wallSprite = comp(child(node, "Renderer"), "SpriteRenderer").fields.m_Sprite.name;
    const core = child(node, "Core Hitbox");
    const L = child(node, "L Shooter"), R = child(node, "R Shooter");
    this.left = new Part(this, L, child(L, "Hitbox"), f.leftShooterHealth);
    this.right = new Part(this, R, child(R, "Hitbox"), f.rightShooterHealth);
    this.core = new Part(this, core, core, f.coreHealth);
    this.parts = [this.left, this.right, this.core];
    this.state = "Inactive";
    this.lastTarget = 0;
    this.lastShoot = 0;
    this.shooter = 0;
    // Solid wall collider (never disabled): the left face blocks the player.
    const col = boxOf(child(node, "Collider"));
    game.wallX = node.x + col.ox - col.w / 2;
  }

  shoot() {
    const t = this.game.time;
    if (t - this.lastShoot <= this.shootInterval) return;
    this.lastShoot = t;
    this.shooter++;
    const part = this.shooter % 2 === 0 ? this.left : this.right;
    if (part.state === "Destroyed") return;
    const [px, py] = part.point;
    this.game.add(new MachineBullet(this.game, px, py, -1));
    this.game.sfx(SFX.EnemyGun2);
    part.state = "Shooting";
    part.anim.play("Shoot", true);
  }

  hitPart(part) {
    const n = part.hitbox.consume();
    if (!n || part.health <= 0 || part.state === "Destroyed") return;
    this.game.sfx(SFX.EnemyHit);
    part.health -= n / this.game.players.length;
    if (part.health > 0) return;
    if (part.hitByPlayer) this.game.score.kill(part, part === this.core ? "bossCore" : "bossGun");
    if (part === this.core) {
      this.game.sfx(SFX.BossDefeat);
      this.die(this.core);
      if (this.left.state !== "Destroyed") this.die(this.left);
      if (this.right.state !== "Destroyed") this.die(this.right);
      this.game.onBossDefeated();
    } else {
      this.game.sfx(SFX.EnemyExplode);
      this.die(part);
    }
  }

  die(part) {
    part.hitbox.invincible = true;
    part.state = "Destroyed";
    part.anim.play("Destroy");
    this.game.add(new Explosion(this.game, "Big Explosion", part.x, part.y));
    if (part === this.core) {
      this.state = "Destroyed";
      for (const p of this.parts) p.hitbox.invincible = true;
    }
  }

  update(dt) {
    const t = this.game.time;
    if (this.state === "Inactive") {
      if (t - this.lastTarget >= 2) {
        this.lastTarget = t;
        const near = this.game.targetablePlayers().some((p) => Math.abs(p.x - this.x) < this.attackRange);
        if (near) { this.state = "Shooting"; this.game.onBossStarted(); }
      }
    } else if (this.state === "Shooting") {
      this.shoot();
    }
    for (const p of [this.left, this.right]) {
      if (p.state === "Shooting" && p.anim.finished) p.state = "Idle";
      if (p.state !== "Destroyed") p.anim.play(p.state === "Shooting" ? "Shoot" : "Idle");
    }
    for (const p of this.parts) { this.hitPart(p); p.anim.update(dt); }
  }

  draw() {
    drawSprite(this.wallSprite, this.x, this.y);
    for (const p of this.parts) if (p.anim.sprite) drawSprite(p.anim.sprite, p.x, p.y);
  }
}
