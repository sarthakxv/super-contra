// Enemies ported from the decompiled Soldier, SoldierHiding, Thief, Turret, GroundTurret,
// EnemyShooter, PlayerTargeter and BulletSoldier. Each is built from its level3 scene node
// (or the Thief prefab), so positions, colliders, shoot points and tuning come from the data.

import { prefab, comp, child } from "./assets.js";
import { Animator, controllerByRef } from "./anim.js";
import { Body } from "./physics.js";
import { overlapGround, LAYER } from "./world.js";
import { drawSprite } from "./render.js";
import { Hitbox, Damage, DamageType } from "./combat.js";
import { Explosion } from "./effects.js";

const DEG = 180 / Math.PI;
const SFX = { EnemyGun: 4, EnemyHit: 6, EnemyHit2: 14, EnemyExplode: 16 };

const boxOf = (node) => {
  const b = comp(node, "BoxCollider2D").fields;
  return { ox: b.m_Offset.x, oy: b.m_Offset.y, w: b.m_Size.x, h: b.m_Size.y };
};
const randRange = (a, b) => a + Math.random() * (b - a);

/** BulletSoldier: straight line, speed/lifetime from the prefab, Enemy damage. */
export class EnemyBullet {
  constructor(game, x, y, dx, dy, prefabName = "Bullet Soldier") {
    const p = prefab(prefabName);
    const f = comp(p, "BulletSoldier").fields;
    this.game = game;
    this.x = x; this.y = y;
    const len = Math.hypot(dx, dy) || 1;
    this.vx = dx / len * f.speed; this.vy = dy / len * f.speed;
    this.life = f.destroyAfter;
    this.sprite = comp(p, "SpriteRenderer").fields.m_Sprite.name;
    this.explosion = f._explosion.name;
    this.alive = true;
    this.order = 20;
    this.flip = false;
    this.damage = game.addDamage(new Damage(this, boxOf(child(p, "Damage")), DamageType.Enemy, () => this.explode()));
  }

  explode() {
    if (!this.alive) return;
    this.alive = false;
    this.game.add(new Explosion(this.game, this.explosion, this.x, this.y));
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0) this.alive = false;
  }

  draw() { drawSprite(this.sprite, this.x, this.y); }
}

/** Shared plumbing: renderer/animator, hitbox, contact damage, targeter, EnemyShooter magazine. */
class Enemy {
  constructor(game, node) {
    this.game = game;
    this.node = node;
    this.x = node.x; this.y = node.y;
    this.flip = node.sx < 0;
    this.alive = true;

    const r = child(node, "Renderer") || node;
    const anim = comp(r, "Animator2D");
    this.anim = anim ? new Animator(controllerByRef(anim.fields._controller.ref)) : null;
    this.order = comp(r, "SpriteRenderer")?.fields.m_SortingOrder ?? 0;

    const hb = child(node, "Hitbox");
    if (hb) this.hitbox = game.addHitbox(new Hitbox(this, boxOf(hb), comp(hb, "Hitbox").fields._supportedTypes,
      (damage) => { this.hitByPlayer = damage.type === DamageType.Player; }));
    const dmg = child(node, "Damage");
    if (dmg) this.damage = game.addDamage(new Damage(this, boxOf(dmg), comp(dmg, "Damage").fields.damageType));

    const sh = child(node, "Shooter");
    if (sh) {
      const es = comp(sh, "EnemyShooter").fields;
      this.reloadInterval = es.reloadInterval;
      this.maxBullets = es.maxBullets;
      this.bullets = this.maxBullets;
      this.reloadTime = 0;
      // Extracted world positions already include the root's scale.x mirror; store
      // facing-right offsets so callers can mirror by the current facing.
      const mirror = Math.sign(node.sx) || 1;
      this.points = {};
      for (const p of sh.children) {
        const sp = comp(p, "ShootPoint");
        if (sp) this.points[sp.fields.direction] = [(p.x - node.x) * mirror, p.y - node.y];
      }
    }
    this.lastTargetUpdate = 0;
    this.target = null;
    this.health = 1;
  }

  get facing() { return this.flip ? -1 : 1; }

  /** PlayerTargeter.UpdateTarget: nearest player by |dx|, re-evaluated at most every `interval`. */
  updateTarget(interval, range) {
    const t = this.game.time;
    if (t - this.lastTargetUpdate < interval) return;
    this.lastTargetUpdate = t;
    const players = this.game.targetablePlayers();
    let best = null, bestD = Infinity;
    for (const p of players) {
      const d = Math.abs(this.x - p.x);
      if (d < bestD) { bestD = d; best = p; }
    }
    this.target = best && bestD < range ? best : null;
    if (this.target && !this.target.alive) this.target = null;
  }

  /** EnemyShooter.ServerUpdate: reload timer only runs while the magazine is empty. */
  updateMagazine(dt) {
    if (this.maxBullets === undefined) return;
    if (this.bullets === 0) this.reloadTime += dt; else this.reloadTime = 0;
    if (this.reloadTime > this.reloadInterval) this.bullets = this.maxBullets;
  }

  /** EnemyShooter.Shoot: spawn a Bullet Soldier at the aim's shoot point. */
  fire(aim, dx, dy) {
    if (this.bullets <= 0) return false;
    this.bullets--;
    const [lx, ly] = this.points[aim];
    this.game.add(new EnemyBullet(this.game, this.x + lx, this.y + ly, dx, dy));
    return true;
  }

  /** CmdHit: each hit removes 1/numberOfPlayers health. Returns true when it dies. */
  takeHits(hitSfx) {
    const n = this.hitbox ? this.hitbox.consume() : 0;
    if (!n) return false;
    this.game.sfx(hitSfx);
    this.health -= n / this.game.players.length;
    if (this.health <= 0 && this.hitByPlayer) this.game.score.kill(this, this.scoreKind);
    return this.health <= 0;
  }

  disableHitboxes() {
    if (this.damage) this.damage.enabled = false;
    if (this.hitbox) this.hitbox.invincible = true;
  }

  draw() {
    if (this.anim && this.anim.sprite) drawSprite(this.anim.sprite, this.x, this.y, this.flip);
  }
}

/** Physics-driven enemies (Soldier / SoldierHiding / Thief) share a Rigidbody2D + ground checker. */
class GroundEnemy extends Enemy {
  constructor(game, node) {
    super(game, node);
    const rb = comp(node, "Rigidbody2D").fields;
    this.body = new Body({ x: node.x, y: node.y, gravityScale: rb.m_GravityScale, box: boxOf(node) });
    this.groundBox = boxOf(child(node, "Ground Checker"));
  }

  get x() { return this.body ? this.body.x : this._x; }
  set x(v) { if (this.body) this.body.x = v; else this._x = v; }
  get y() { return this.body ? this.body.y : this._y; }
  set y(v) { if (this.body) this.body.y = v; else this._y = v; }

  groundHits() {
    const b = this.groundBox;
    return overlapGround(this.x + b.ox - b.w / 2, this.x + b.ox + b.w / 2,
      this.y + b.oy - b.h / 2, this.y + b.oy + b.h / 2);
  }
}

// ---------------------------------------------------------------- Soldier (rifleman)
export class Soldier extends GroundEnemy {
  constructor(game, node) {
    super(game, node);
    this.scoreKind = "rifle";
    const f = comp(node, "Soldier").fields;
    this.attackRange = f.attackRange;
    this.flip = f.lookDirection === 1;
    this.jumpForce = comp(child(node, "Jumper"), "SimpleJump").fields.force;
    this.state = "Aiming";
    this.aim = 2;
  }

  updateDirection() {
    this.aim = 2;
    if (!this.target) return;
    const dx = this.target.x - this.x, dy = this.target.y - this.y;
    const a = Math.atan2(dy, Math.abs(dx)) * DEG;
    this.aim = a > 30 ? 1 : a > -30 ? 2 : 3;
    this.flip = !(dx > 0);
  }

  shoot() {
    if (!this.target) return false;
    let dx = this.target.x - this.x, dy = this.target.y - this.y;
    if (this.aim === 3) dy -= 0.5;
    const [lx, ly] = this.points[this.aim];
    if (this.bullets <= 0) return false;
    this.bullets--;
    this.game.add(new EnemyBullet(this.game, this.x + lx * this.facing, this.y + ly, dx, dy));
    return true;
  }

  update(dt) {
    switch (this.state) {
      case "Aiming":
        this.updateTarget(1, this.attackRange);
        this.updateDirection();
        if (this.shoot()) { this.state = "Shooting"; this.game.sfx(SFX.EnemyGun); }
        break;
      case "Shooting":
        if (this.anim.finished) this.state = "Aiming";
        break;
      case "Dead":
        if (this.anim.finished) this.alive = false;
        break;
    }
    const names = { 1: "High", 2: "Straight", 3: "Low" };
    const anim = this.state === "Dead" ? "Dead" : `${this.state === "Shooting" ? "Shoot" : "Aim"} ${names[this.aim]}`;
    this.anim.play(anim);
    if (this.state !== "Dead" && this.takeHits(SFX.EnemyHit2)) this.die();
    this.updateMagazine(dt);
    this.body.step(dt);
    this.anim.update(dt);
  }

  die() {
    this.disableHitboxes();
    this.body.gravityScale = 1;
    this.body.vy += this.jumpForce;
    this.state = "Dead";
    this.anim.play("Dead");
  }
}

// ---------------------------------------------------------------- SoldierHiding (bush sniper)
export class SoldierHiding extends GroundEnemy {
  constructor(game, node) {
    super(game, node);
    this.scoreKind = "hiding";
    const f = comp(node, "SoldierHiding").fields;
    this.attackRange = f.attackRange;
    this.hidingTime = f.hidingTime;
    this.aimingTime = f.aimingTime;
    this.hideOffset = f.hidingYOffset;
    this.jumpForce = comp(child(node, "Jumper"), "SimpleJump").fields.force;
    this.startY = node.y;
    this.state = "Aiming";
    this.aimingStarted = 0;
    this.hidingStarted = 0;
    this.freezeY = true;
  }

  update(dt) {
    const t = this.game.time;
    const toward = (target) => {
      const d = target - this.body.y;
      this.body.y += Math.sign(d) * Math.min(Math.abs(d), dt * 4);
    };
    switch (this.state) {
      case "Hiding":
        toward(this.startY - this.hideOffset);
        if (t - this.hidingStarted > this.hidingTime) { this.state = "Aiming"; this.aimingStarted = t; }
        break;
      case "Aiming":
        toward(this.startY);
        this.updateTarget(5, this.attackRange);
        if (this.target) this.flip = !(this.target.x - this.x > 0);
        if (Math.abs(this.body.y - this.startY) < 0.01) this.hitbox.invincible = false;
        if (t - this.aimingStarted > this.aimingTime / 3) {
          if (this.target && this.bullets > 0) {
            this.bullets--;
            const [lx, ly] = this.points[2];
            this.game.add(new EnemyBullet(this.game, this.x + lx * this.facing, this.y + ly, this.facing, 0));
            this.state = "Shooting";
            this.game.sfx(SFX.EnemyGun);
            break;
          }
          if (t - this.aimingStarted > this.aimingTime) {
            this.state = "Hiding";
            this.hitbox.invincible = true;
            this.hidingStarted = t;
          }
        }
        break;
      case "Shooting":
        if (this.anim.finished) this.state = "Aiming";
        break;
      case "Dead":
        if (this.anim.finished) this.alive = false;
        break;
    }
    const anims = { Aiming: "Aim Straight", Shooting: "Shoot Straight", Hiding: "Aim Low", Dead: "Dead" };
    this.anim.play(anims[this.state]);
    if (this.state !== "Dead" && this.takeHits(SFX.EnemyHit2)) this.die();
    this.updateMagazine(dt);
    if (!this.freezeY) this.body.step(dt);
    this.anim.update(dt);
  }

  die() {
    this.disableHitboxes();
    this.freezeY = false;
    this.body.gravityScale = 1;
    this.body.vy += this.jumpForce;
    this.state = "Dead";
    this.anim.play("Dead");
  }
}

// ---------------------------------------------------------------- Thief (runner)
export class Thief extends GroundEnemy {
  constructor(game, node) {
    super(game, node);
    this.scoreKind = "runner";
    const f = comp(node, "Thief").fields;
    this.moveRange = f.moveRange;
    this.flip = f.lookDirection === 1;
    this.speed = comp(child(node, "Mover"), "SimpleMove").fields.speed;
    const j = comp(child(node, "Jumper"), "RandomJump").fields;
    this.jumpMin = j.minForce; this.jumpMax = j.maxForce;
    this.state = "Jumping";
  }

  update(dt) {
    const ground = this.groundHits();
    const grounded = ground.length > 0;
    const onWater = ground.some((g) => g.layer === LAYER.Water);
    switch (this.state) {
      case "Moving":
        this.updateTarget(0.5, this.moveRange);
        if (!this.target) break;
        if (!grounded) {
          if (Math.floor(Math.random() * 11) < 3) {
            this.flip = !this.flip;
            this.body.vx = this.facing * this.speed;
            this.body.x += this.facing * 0.2;
            break;
          }
          this.body.vy += randRange(this.jumpMin, this.jumpMax);
          this.state = "Jumping";
          break;
        }
        this.body.vx = this.facing * this.speed;
        if (onWater) { this.state = "Splash"; this.disableHitboxes(); }
        break;
      case "Jumping":
        if (grounded) {
          if (onWater) { this.state = "Splash"; this.disableHitboxes(); break; }
          this.state = "Moving";
        }
        break;
      case "Dead":
      case "Splash":
        this.body.vx = 0;
        if (this.anim.finished) { this.alive = false; break; }
        if (this.state === "Dead") this.body.vx = -this.facing * this.speed;
        break;
    }
    const anims = { Moving: "Run", Jumping: "Jump", Dead: "Dead", Splash: "Splash" };
    this.anim.play(anims[this.state]);
    if (this.state !== "Dead" && this.state !== "Splash" && this.takeHits(SFX.EnemyHit2)) this.die();
    this.body.step(dt);
    this.anim.update(dt);
    if (this.y < -50) this.alive = false;
  }

  die() {
    this.disableHitboxes();
    this.body.gravityScale = 1;
    this.body.vy += randRange(this.jumpMin, this.jumpMax);
    this.state = "Dead";
    this.anim.play("Dead");
  }
}

/** Spawn a Thief from the prefab (EnemySpawner). */
export function spawnThief(game, x, y) {
  const node = { ...prefab("Thief") };
  const relocate = (n, dx, dy) => ({ ...n, x: n.x + dx, y: n.y + dy, children: n.children.map((c) => relocate(c, dx, dy)) });
  return game.add(new Thief(game, relocate(node, x - node.x, y - node.y)));
}

// ---------------------------------------------------------------- Turret (12-way wall gun)
const TURRET_DIRS = ["Up", "RightHigh", "RightMidHigh", "Right", "RightMidLow", "RightLow",
  "Down", "LeftLow", "LeftMidLow", "Left", "LeftMidHigh", "LeftHigh"];

export class Turret extends Enemy {
  constructor(game, node) {
    super(game, node);
    this.scoreKind = "turret";
    const f = comp(node, "Turret").fields;
    this.health = f.health;
    this.attackRange = f.attackRange;
    this.rotateInterval = f.turretRotateInterval;
    this.shootInterval = f.shootInterval;
    this.state = "Closed";
    this.cur = 0; this.tgt = 0;
    this.lastRotate = 0; this.lastShoot = 0;
  }

  updateDirection() {
    if (!this.target) return;
    let a = 90 - Math.atan2(this.target.y - this.y, this.target.x - this.x) * DEG;
    if (a < 0) a += 360;
    this.tgt = Math.floor(a / 27.692308) % 12;
    const t = this.game.time;
    if (this.tgt !== this.cur && t - this.lastRotate >= this.rotateInterval) {
      let c = this.cur;
      const g = this.tgt;
      if (c < g) c = (g - c < c + 12 - g) ? c + 1 : (c !== 0 ? c - 1 : 11);
      else c = (c - g < g + 12 - c) ? c - 1 : (c + 1) % 12;
      this.cur = c;
      this.lastRotate = t;
    }
  }

  update(dt) {
    const t = this.game.time;
    switch (this.state) {
      case "Closed":
        this.updateTarget(1, this.attackRange);
        if (this.target) this.state = "Opening";
        break;
      case "Opening":
        if (this.anim.finished) {
          this.updateTarget(1, this.attackRange);
          this.updateDirection();
          this.cur = this.tgt;
          this.state = "Aiming";
        }
        break;
      case "Aiming":
        this.updateTarget(1, this.attackRange);
        this.updateDirection();
        this.hitbox.invincible = false;
        if (!this.target) { this.state = "Closing"; break; }
        if (t - this.lastShoot > this.shootInterval) {
          const rad = (this.cur * 30) * Math.PI / 180;
          this.fire(this.cur, Math.sin(rad), Math.cos(rad));
          this.lastShoot = t;
        }
        break;
      case "Closing":
        this.hitbox.invincible = true;
        if (this.anim.finished) this.state = "Closed";
        break;
      case "Destroyed":
        if (this.anim.finished) this.alive = false;
        break;
    }
    this.anim.play(this.state === "Aiming" ? TURRET_DIRS[this.cur] : this.state === "Destroyed" ? "Destroy" : this.state);
    if (this.state !== "Destroyed" && this.takeHits(SFX.EnemyHit)) this.die();
    this.updateMagazine(dt);
    this.anim.update(dt);
  }

  die() {
    this.game.sfx(SFX.EnemyExplode);
    this.state = "Destroyed";
    this.disableHitboxes();
    this.anim.play("Destroy");
  }
}

// ---------------------------------------------------------------- GroundTurret (pop-up cannon)
const GT_DIRS = ["Up", "High", "Straight"];
const GT_ANGLES = [120, 150, 180];

export class GroundTurret extends Enemy {
  constructor(game, node) {
    super(game, node);
    this.scoreKind = "turret";
    const f = comp(node, "GroundTurret").fields;
    this.health = f.health;
    this.attackRange = f.attackRange;
    this.rotateInterval = f.turretRotateInterval;
    this.maxBurst = f.maxBulletCount;
    this.bulletInterval = f.bulletInterval;
    this.shootInterval = f.shootInterval;
    this.burst = this.maxBurst;
    this.state = "Inactive";
    this.cur = 0; this.tgt = 0;
    this.lastRotate = 0; this.lastBullet = 0; this.lastShoot = 0;
  }

  updateDirection() {
    if (!this.target) return;
    const a = 180 - Math.atan2(this.target.y - this.y, this.target.x - this.x) * DEG;
    this.tgt = a < 30 ? 2 : a < 50 ? 1 : a <= 180 ? 0 : 2;
    const t = this.game.time;
    if (this.tgt !== this.cur && t - this.lastRotate >= this.rotateInterval) {
      this.cur += Math.sign(this.tgt - this.cur);
      this.lastRotate = t;
    }
  }

  update(dt) {
    const t = this.game.time;
    switch (this.state) {
      case "Inactive":
        this.updateTarget(1, this.attackRange);
        if (this.target) this.state = "Appearing";
        break;
      case "Appearing":
        if (this.anim.finished) {
          this.updateTarget(1, this.attackRange);
          this.updateDirection();
          this.cur = this.tgt;
          this.state = "Shooting";
        }
        break;
      case "Shooting":
        this.updateTarget(1, this.attackRange);
        this.updateDirection();
        this.hitbox.invincible = false;
        if (this.target && t - this.lastShoot > this.shootInterval) {
          if (this.burst > 0) {
            if (t - this.lastBullet > this.bulletInterval) {
              this.burst--;
              const rad = GT_ANGLES[this.cur] * Math.PI / 180;
              this.fire(this.cur, Math.cos(rad), Math.sin(rad));
              this.lastBullet = t;
            }
          } else {
            this.burst = this.maxBurst;
            this.lastShoot = t;
          }
        }
        break;
      case "Destroyed":
        if (this.anim.finished) this.alive = false;
        break;
    }
    const anim = { Inactive: "Empty", Appearing: "Appear", Destroyed: "Destroy" }[this.state] || GT_DIRS[this.cur];
    this.anim.play(anim);
    if (this.state !== "Destroyed" && this.takeHits(SFX.EnemyHit)) this.die();
    this.updateMagazine(dt);
    this.anim.update(dt);
  }

  die() {
    this.game.sfx(SFX.EnemyExplode);
    this.state = "Destroyed";
    this.disableHitboxes();
    this.anim.play("Destroy");
  }
}

/** Static scene sprite (bushes that hide the snipers). */
export class Prop {
  constructor(node) {
    this.x = node.x; this.y = node.y;
    this.alive = true;
    const sr = comp(node, "SpriteRenderer").fields;
    this.sprite = sr.m_Sprite && sr.m_Sprite.name;
    this.order = sr.m_SortingOrder;
    this.flip = node.sx < 0;
  }
  update() {}
  draw() { if (this.sprite) drawSprite(this.sprite, this.x, this.y, this.flip); }
}
