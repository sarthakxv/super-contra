// Level objects ported from Bridge, FalconBox, Scroll, BulletPowerup, FireratePowerup,
// EnemySpawner and ObjectEnabler, plus the "Fall Damage" kill strips.

import { prefab, comp, child } from "./assets.js";
import { Animator, controllerByRef } from "./anim.js";
import { Body, worldBox, overlaps } from "./physics.js";
import { ledges } from "./world.js";
import { drawSprite } from "./render.js";
import { Hitbox, Damage } from "./combat.js";
import { Explosion } from "./effects.js";
import { spawnThief } from "./enemies.js";

const SFX = { Explode: 7, Powerup: 15 };

const boxOf = (node) => {
  const b = comp(node, "BoxCollider2D").fields;
  return { ox: b.m_Offset.x, oy: b.m_Offset.y, w: b.m_Size.x, h: b.m_Size.y };
};

/** Overlap between a scene trigger box and any player's root (feet) collider. */
function playersInTrigger(game, x, y, box) {
  const t = worldBox(x, y, box.ox, box.oy, box.w, box.h);
  return game.livePlayers().filter((p) => {
    const b = p.body;
    return overlaps(t, { x0: b.x0, x1: b.x1, y0: b.bottom, y1: b.bottom + b.box.h });
  });
}

// ---------------------------------------------------------------- Bridge
export class Bridge {
  constructor(game, node) {
    this.game = game;
    this.alive = true;
    this.order = -20;
    this.x = node.x; this.y = node.y;
    const f = comp(node, "Bridge").fields;
    this.breakInterval = f.breakInterval;
    this.explosionLength = f.explosionAnimationLength;
    this.trigger = boxOf(node);
    this.parts = node.children.map((p) => {
      const tiles = p.children.filter((c) => comp(c, "SpriteRenderer"))
        .map((c) => ({ x: c.x, y: c.y, sprite: comp(c, "SpriteRenderer").fields.m_Sprite.name }));
      const col = p.children.find((c) => c.name.startsWith("Collider"));
      const b = boxOf(col);
      const ledge = { x0: col.x + b.ox - b.w / 2, x1: col.x + b.ox + b.w / 2,
        top: col.y + b.oy + b.h / 2, bottom: col.y + b.oy - b.h / 2, layer: col.layer };
      ledges.push(ledge);
      return { x: p.x, y: p.y, tiles, ledge, visible: true };
    });
    this.started = false;
    this.chainTime = 0;
    this.nextPart = 0;
    this.pending = [];
  }

  update(dt) {
    if (!this.started) {
      if (playersInTrigger(this.game, this.x, this.y, this.trigger).length) { this.started = true; this.chainTime = 0; }
      return;
    }
    this.chainTime += dt;
    // Part i starts breaking at i * breakInterval; its collider stays for explosionLength.
    while (this.nextPart < this.parts.length && this.chainTime >= this.nextPart * this.breakInterval) {
      const part = this.parts[this.nextPart++];
      this.game.sfx(SFX.Explode);
      // "Huge Explosion": three Big Explosions offset by 0/1/2 frames.
      for (const kind of ["Big Explosion", "Big Explosion Delayed 1", "Big Explosion Delayed 2"]) {
        this.game.add(new Explosion(this.game, kind, part.x, part.y));
      }
      part.visible = false;
      this.pending.push({ part, at: this.chainTime + this.explosionLength });
    }
    for (const p of this.pending) {
      if (this.chainTime >= p.at) {
        const i = ledges.indexOf(p.part.ledge);
        if (i >= 0) ledges.splice(i, 1);
      }
    }
    this.pending = this.pending.filter((p) => this.chainTime < p.at);
  }

  draw() {
    for (const p of this.parts) if (p.visible) for (const t of p.tiles) drawSprite(t.sprite, t.x, t.y);
  }
}

// ---------------------------------------------------------------- Powerups (M/F/S/L/R)
export class Powerup {
  constructor(game, name, x, y) {
    this.game = game;
    this.alive = true;
    this.order = 0;
    this.flip = false;
    const p = prefab(name);
    this.sprite = comp(p, "SpriteRenderer").fields.m_Sprite.name;
    const bp = comp(p, "BulletPowerup");
    const fp = comp(p, "FireratePowerup");
    this.bulletIndex = bp ? bp.fields.bulletIndex : null;
    this.fireRate = fp ? fp.fields.increase : null;
    const rb = comp(p, "Rigidbody2D").fields;
    this.body = new Body({ x, y, gravityScale: rb.m_GravityScale, box: boxOf(p) });
    this.body.vx += 0.1 * 15;   // AddForce((0.1, 1) * 15, Impulse), mass 1
    this.body.vy += 15;
    this.trigger = boxOf(child(p, "Hitbox"));
  }

  get x() { return this.body.x; }
  get y() { return this.body.y; }

  update(dt) {
    // Solid collider only while not rising; once landed it rests.
    this.body.collides = this.body.vy <= 0;
    if (this.body.grounded) this.body.vx = 0;
    this.body.step(dt);
    const who = playersInTrigger(this.game, this.x, this.y, this.trigger)[0];
    if (who) {
      if (this.bulletIndex !== null) { who.shooter.assign(this.bulletIndex); this.game.sfx(SFX.Powerup); }
      if (this.fireRate !== null) who.shooter.extraFireRate = this.fireRate;
      this.alive = false;
    }
    if (this.y < -20) this.alive = false;
  }

  draw() { drawSprite(this.sprite, this.x, this.y); }
}

// ---------------------------------------------------------------- Falcon Box (pillbox sensor)
export class FalconBox {
  constructor(game, node) {
    this.game = game;
    this.alive = true;
    this.x = node.x; this.y = node.y;
    this.flip = false;
    const r = child(node, "Renderer");
    this.anim = new Animator(controllerByRef(comp(r, "Animator2D").fields._controller.ref));
    this.order = comp(r, "SpriteRenderer").fields.m_SortingOrder;
    const f = comp(node, "FalconBox").fields;
    this.openCloseTime = f._openCloseTime;
    this.spawn = f.spawnObject.name;
    const hb = child(node, "Hitbox");
    this.hitbox = game.addHitbox(new Hitbox(this, boxOf(hb), comp(hb, "Hitbox").fields._supportedTypes));
    this.hitbox.invincible = true;
    this.state = "Closed";
    this.lastTransition = 0;
    this.health = 1;
  }

  update(dt) {
    const t = this.game.time;
    switch (this.state) {
      case "Closing":
        if (this.anim.finished) { this.state = "Closed"; this.lastTransition = t; this.hitbox.invincible = true; }
        break;
      case "Closed":
        if (t - this.lastTransition > this.openCloseTime) { this.state = "Opening"; this.hitbox.invincible = false; }
        break;
      case "Opening":
        if (this.anim.finished) { this.state = "Opened"; this.lastTransition = t; }
        break;
      case "Opened":
        if (t - this.lastTransition > this.openCloseTime) this.state = "Closing";
        break;
      case "Destroyed":
        if (this.anim.finished) this.alive = false;
        break;
    }
    const anims = { Closing: "Transition", Closed: "Closed", Opening: "Transition", Opened: "Opened", Destroyed: "Destroy" };
    this.anim.play(anims[this.state]);
    const hits = this.hitbox.consume();
    if (hits && this.health > 0) {
      this.health -= hits;
      if (this.health <= 0) {
        this.game.add(new Powerup(this.game, this.spawn, this.x, this.y));
        this.state = "Destroyed";
        this.hitbox.invincible = true;
        this.anim.play("Destroy");
      }
    }
    this.anim.update(dt);
  }

  draw() { if (this.anim.sprite) drawSprite(this.anim.sprite, this.x, this.y); }
}

// ---------------------------------------------------------------- Scroll (flying weapon capsule)
export class Scroll {
  constructor(game, node) {
    this.game = game;
    this.node = node;
    this.alive = true;
    this.active = false;     // hidden until its ObjectEnabler fires
    this.order = comp(node, "SpriteRenderer").fields.m_SortingOrder;
    this.sprite = comp(node, "SpriteRenderer").fields.m_Sprite.name;
    this.x = node.x; this.y = node.y;
    this.flip = false;
    const f = comp(node, "Scroll").fields;
    this.hSpeed = f._horizontalSpeed;
    this.vRange = f._verticalRange;
    this.vFreq = f._verticalFrequency;
    this.powerup = f._powerup.name;
    this.explosion = f._explosion.name;
    const hb = child(node, "Hitbox");
    this.hitbox = game.addHitbox(new Hitbox(this, boxOf(hb), comp(hb, "Hitbox").fields._supportedTypes));
    this.hitbox.enabled = false;
  }

  enable() {
    this.active = true;
    this.hitbox.enabled = true;
    this.appearTime = this.game.time;
    this.startY = this.node.y;
  }

  update(dt) {
    if (!this.active) return;
    this.x += this.hSpeed * dt;
    this.y = this.startY + Math.sin((this.game.time - this.appearTime) * this.vFreq) * this.vRange;
    if (this.hitbox.consume()) {
      this.game.add(new Explosion(this.game, this.explosion, this.x, this.y));
      this.game.add(new Powerup(this.game, this.powerup, this.x, this.y));
      this.alive = false;
    }
    if (this.x > this.game.cameraRight() + 20) this.alive = false;
  }

  draw() { if (this.active) drawSprite(this.sprite, this.x, this.y); }
}

// ---------------------------------------------------------------- ObjectEnabler
export class ObjectEnabler {
  constructor(game, node, target) {
    this.game = game;
    this.alive = true;
    this.x = node.x; this.y = node.y;
    this.trigger = boxOf(node);
    this.target = target;
    this.interval = comp(node, "ObjectEnabler").fields.checkInterval;
    this.timer = 0;
  }

  update(dt) {
    this.timer += dt;
    if (this.timer > this.interval) {
      this.timer = 0;
      if (playersInTrigger(this.game, this.x, this.y, this.trigger).length) {
        if (this.target) this.target.enable();
        this.alive = false;
      }
    }
  }

  draw() {}
}

// ---------------------------------------------------------------- EnemySpawner
export class EnemySpawner {
  constructor(game, node) {
    this.game = game;
    this.alive = true;
    this.x = node.x; this.y = node.y;
    this.trigger = boxOf(node);
    const f = comp(node, "EnemySpawner").fields;
    this.interval = f.spawnInterval;
    this.points = node.children.map((c) => [c.x, c.y]);
    this.timer = 0;
  }

  update(dt) {
    this.timer += dt;
    if (this.timer > this.interval) {
      this.timer = 0;
      if (playersInTrigger(this.game, this.x, this.y, this.trigger).length) {
        const [x, y] = this.points[Math.floor(Math.random() * this.points.length)];
        spawnThief(this.game, x, y);
      }
    }
  }

  draw() {}
}

/** "Fall Damage" strips under the level: Enemy-type damage boxes. */
export class FallDamage {
  constructor(game, node) {
    this.alive = true;
    this.x = node.x; this.y = node.y;
    this.flip = false;
    game.addDamage(new Damage(this, boxOf(node), comp(node, "Damage").fields.damageType));
  }
  update() {}
  draw() {}
}
