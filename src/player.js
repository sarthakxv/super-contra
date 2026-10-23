// Port of Player (+ SimpleMove, SimpleJump, GroundChecker, Invincibility) from the
// decompiled Assembly-CSharp. Values come from the "Player" prefab.

import { prefab, comp, child } from "./assets.js";
import { Animator } from "./anim.js";
import { Body } from "./physics.js";
import { overlapGround, LAYER } from "./world.js";
import { drawSprite, camera, HALF_H, getCtx } from "./render.js";
import { Hitbox } from "./combat.js";
import { Shooter, spawnPlayerBullet } from "./bullets.js";
import { settings } from "./settings.js";
import { characterSprite } from "./characters.js";

export const State = {
  Idle: 0, Moving: 1, Jumping: 2, Falling: 3, Splash: 4, Dive: 5,
  Swimming: 6, WaterGetUp: 7, Dead: 8, Spectate: 9,
};
export const Aim = {
  Up: 0, High: 1, Straight: 2, Low: 3, Down: 4, StraightUp: 5, StraightDown: 6,
  WaterStraight: 8, WaterHigh: 9, WaterUp: 10,
};

// Shoot point forward vectors (facing right), from the ShootPoint transforms' rotations.
const AIM_VECTORS = {
  [Aim.Up]: [0, 1], [Aim.High]: [0.7071, 0.7071], [Aim.Straight]: [1, 0], [Aim.Low]: [0.7071, -0.7071],
  [Aim.Down]: [1, 0], [Aim.StraightUp]: [0, 1], [Aim.StraightDown]: [0, -1],
  [Aim.WaterStraight]: [1, 0], [Aim.WaterHigh]: [0.7071, 0.7071], [Aim.WaterUp]: [0, 1],
};

// (90 - atan2(v,|h|)*Rad2Deg) / 45 for quantized input; a table avoids float64 rounding (45.000001).
function aimFromInput(h, v) {
  if (v > 0) return h !== 0 ? Aim.High : Aim.Up;
  if (v < 0) return h !== 0 ? Aim.Low : Aim.Down;
  return Aim.Straight;
}

export class Player {
  constructor(game, index, input, x, y) {
    this.game = game;
    this.index = index;
    this.character = settings.characters[index];
    this.input = input;
    this.alive = true;
    this.order = 50;

    const p = prefab("Player");
    const rb = comp(p, "Rigidbody2D").fields;
    const col = comp(p, "BoxCollider2D").fields;
    this.body = new Body({ x, y, gravityScale: rb.m_GravityScale,
      box: { ox: col.m_Offset.x, oy: col.m_Offset.y, w: col.m_Size.x, h: col.m_Size.y } });
    this.speed = comp(child(p, "Mover"), "SimpleMove").fields.speed;      // 4
    this.jumpForce = comp(child(p, "Jumper"), "SimpleJump").fields.force; // 12.5
    const gc = comp(child(p, "Ground Checker"), "BoxCollider2D").fields;
    this.groundBox = { ox: gc.m_Offset.x, oy: gc.m_Offset.y, w: gc.m_Size.x, h: gc.m_Size.y };
    const hb = child(p, "Hitbox");
    const hbBox = comp(hb, "BoxCollider2D").fields;
    this.hitbox = game.addHitbox(new Hitbox(this,
      { ox: hbBox.m_Offset.x, oy: hbBox.m_Offset.y, w: hbBox.m_Size.x, h: hbBox.m_Size.y },
      comp(hb, "Hitbox").fields._supportedTypes));
    this.invincibilityTime = comp(child(p, "Invincibility"), "Invincibility").fields.invincibilityTime;
    this.maxLives = comp(p, "Player").fields._maxLives;
    this.lives = this.maxLives;

    this.bodyRenderer = child(p, "Body Renderer");
    this.shootPoints = {};
    for (const sp of child(p, "Shooter").children) {
      this.shootPoints[comp(sp, "ShootPoint").fields.direction] = [sp.x, sp.y];
    }

    this.bodyAnim = new Animator("Controller Body");
    this.legsAnim = new Animator("Controller Legs");
    this.shooter = new Shooter(game);

    this.state = State.Jumping; // MyStart: spawns falling in
    this.aim = Aim.Straight;
    this.look = 1;              // 1 right, -1 left
    this.flip = false;          // transform.localScale.x < 0
    this.isShooting = false;
    this.lastShootingTime = -999;
    this.startFallTime = -999;
    this.deadTime = 0;
    this.invincibleUntil = 0;
  }

  get x() { return this.body.x; }
  get y() { return this.body.y; }
  get invincible() { return this.game.time < this.invincibleUntil; }

  // ------------------------------------------------------------- grounder (GroundChecker)
  groundHits() {
    const b = this.groundBox;
    return overlapGround(this.x + b.ox - b.w / 2, this.x + b.ox + b.w / 2,
      this.y + b.oy - b.h / 2, this.y + b.oy + b.h / 2, this.body.ignore);
  }

  move(h) { this.body.vx = h * this.speed; }
  jump() { this.body.vy += this.jumpForce; }

  shoot() {
    if (!this.shooter.tryShoot()) return;
    const [lx, ly] = this.shootPoints[this.aim] || this.shootPoints[Aim.Straight];
    const [fx, fy] = AIM_VECTORS[this.aim];
    const s = this.flip ? -1 : 1;
    spawnPlayerBullet(this.game, this.shooter.weapon, this.x + lx * s, this.y + ly, fx * s, fy);
    this.game.sfx(this.shooter.weapon.sfx);
    this.isShooting = true;
    this.lastShootingTime = this.game.time;
  }

  respawn() {
    this.body.y = camera.y + HALF_H;   // top edge of the screen, x unchanged
    this.body.vx = this.body.vy = 0;
    this.shooter.assign(0);
    this.shooter.extraFireRate = 0;
    this.state = State.Jumping;
    this.invincibleUntil = this.game.time + this.invincibilityTime;
  }

  // ------------------------------------------------------------- Player.UpdateState
  updateState() {
    const inp = this.input;
    const h = inp.horizontal, v = inp.vertical;
    const shoot = this.shooter.weapon.isContinuous ? inp.b : inp.bDown;
    const jump = inp.aDown;
    const t = this.game.time;
    const ground = this.groundHits();
    const grounded = ground.length > 0;
    const groundLayer = grounded ? ground[0].layer : -1;
    const has = (layer) => ground.some((g) => g.layer === layer);
    const onlyWater = groundLayer === LAYER.Water && !has(LAYER.Ground) && !has(LAYER.Platform);

    switch (this.state) {
      case State.Idle:
        if (Math.abs(h) > 0.05) this.state = State.Moving;
        if (!grounded) this.state = State.Falling;
        if (jump) {
          if (this.aim === Aim.Down) {
            // prone + jump drops through platforms (but not solid ground)
            if (groundLayer === LAYER.Platform && !has(LAYER.Ground)) {
              this.state = State.Falling;
              this.body.setIgnore(LAYER.Platform, true);
              this.startFallTime = t;
            }
          } else {
            this.state = State.Jumping;
            this.jump();
          }
        }
        if (this.isShooting && this.bodyAnim.finished) this.isShooting = false;
        if (onlyWater) this.state = State.Splash;
        this.move(0);
        if (shoot) this.shoot();
        break;

      case State.Moving:
        if (Math.abs(h) <= 0.05) this.state = State.Idle;
        if (!grounded) this.state = State.Falling;
        if (jump) { this.state = State.Jumping; this.jump(); }
        if (this.isShooting && this.bodyAnim.finished) this.isShooting = false;
        if (onlyWater) this.state = State.Splash;
        this.move(h);
        if (shoot) this.shoot();
        break;

      case State.Jumping:
        if (this.body.vy > 0.1) {
          this.body.setIgnore(LAYER.Platform, true);
          this.body.setIgnore(LAYER.Ground, true);
        } else {
          if (grounded) this.state = onlyWater ? State.Splash : State.Idle;
          this.body.setIgnore(LAYER.Platform, false);
          this.body.setIgnore(LAYER.Ground, false);
        }
        if (Math.abs(h) > 0.01) this.move(h);
        if (shoot) this.shoot();
        break;

      case State.Falling:
        if (t - this.startFallTime > 0.3) {
          this.body.setIgnore(LAYER.Platform, false);
          if (grounded) this.state = onlyWater ? State.Splash : State.Idle;
        }
        if (shoot) this.shoot();
        break;

      case State.Splash:
        if (this.legsAnim.finished) this.state = State.Swimming;
        this.move(0);
        break;

      case State.Swimming:
        this.move(h);
        if (this.isShooting && this.legsAnim.finished) this.isShooting = false;
        if (v < -0.05) this.state = State.Dive;
        if (shoot) this.shoot();
        if (has(LAYER.Ground) || has(LAYER.Platform)) this.state = State.WaterGetUp;
        break;

      case State.Dive:
        if (v > -0.05) this.state = State.Swimming;
        this.move(0);
        break;

      case State.WaterGetUp:
        if (this.bodyAnim.finished) this.state = State.Idle;
        this.move(0);
        break;

      case State.Dead:
        if (!this.legsAnim.finished) {
          this.move(this.look === 1 ? -1 : 1);  // knock-back away from facing
          this.body.setIgnore(LAYER.Platform, this.body.vy > 0.1);
        } else {
          this.body.setIgnore(LAYER.Platform, false);
          this.move(0);
        }
        if (t - this.deadTime > 2) {
          if (this.lives > 0) { this.lives--; this.respawn(); }
          else { this.state = State.Spectate; this.game.onPlayerOut(this); }
        }
        break;

      case State.Spectate:
        break;
    }

    if (this.hitbox.consume() > 0 && this.state !== State.Dead && this.state !== State.Spectate) {
      this.state = State.Dead;
      this.deadTime = t;
      this.body.vx = this.body.vy = 0;
      this.jump();            // death hop
      this.game.sfx(2);       // SFX 2: Death
    }
  }

  updateLook() {
    const h = this.input.horizontal;
    if (h > 0) this.look = 1; else if (h < 0) this.look = -1;
  }

  updateAim() {
    this.aim = aimFromInput(this.input.horizontal, this.input.vertical);
    if (this.state === State.Jumping) {
      if (this.aim === Aim.Up) this.aim = Aim.StraightUp;
      else if (this.aim === Aim.Down) this.aim = Aim.StraightDown;
    }
    if (this.state === State.Falling) this.aim = Aim.Straight;
    if (this.state === State.Swimming) {
      if (this.aim === Aim.Up) this.aim = Aim.WaterUp;
      else if (this.aim === Aim.High) this.aim = Aim.WaterHigh;
      else if (this.aim === Aim.Straight) this.aim = Aim.WaterStraight;
    }
  }

  updateAnimations() {
    const st = this.state;
    let legs = "Idle", body = "Idle";
    let restartBody = false, restartLegs = false;
    const firedNow = this.game.time - this.lastShootingTime < this.game.dt;
    const faceInput = () => { this.flip = this.look === -1; };

    if (st === State.Idle || st === State.Moving) {
      if (st === State.Idle) { body = "Aim Straight"; legs = "Idle"; }
      else { body = "Run"; legs = "Run"; faceInput(); }
      if (this.aim === Aim.Up) body = "Aim Up";
      else if (this.aim === Aim.High) body = "Aim High";
      else if (this.aim === Aim.Low) body = "Aim Low";
      else if (this.aim === Aim.Down) { legs = "Aim Down"; body = "Aim Down"; }
      if (this.isShooting) {
        body = body.replace("Aim", "Shoot").replace("Run", "Shoot Straight");
        if (legs.includes("Aim")) { legs = legs.replace("Aim", "Shoot"); restartLegs = firedNow; }
        if (firedNow) restartBody = true;
      }
    } else if (st === State.Jumping) {
      body = "Jump"; legs = "Jump"; faceInput();
    } else if (st === State.Falling) {
      body = "Falling"; legs = "Falling";
    } else if (st === State.Swimming) {
      faceInput();
      body = "Empty"; legs = "Water Idle";
      if (this.aim === Aim.WaterHigh) legs = "Water Aim High";
      else if (this.aim === Aim.WaterUp) legs = "Water Aim Up";
      if (this.isShooting) {
        legs = this.aim === Aim.WaterStraight ? "Water Shoot Straight" : legs.replace("Aim", "Shoot");
        if (firedNow) restartLegs = true;
      }
    } else if (st === State.Splash) { legs = "Splash"; body = "Empty"; }
    else if (st === State.Dive) { legs = "Dive"; body = "Empty"; }
    else if (st === State.WaterGetUp) { legs = "Water GetUp"; body = "Water GetUp"; }
    else if (st === State.Dead) { body = "Empty"; legs = "Dead"; }
    else if (st === State.Spectate) { body = "Empty"; legs = "Empty"; }

    this.bodyAnim.play(body, restartBody);
    this.legsAnim.play(legs, restartLegs);
  }

  updateHitbox() {
    const st = this.state, hb = this.hitbox;
    if (st === State.Dead || st === State.Spectate) { hb.invincible = true; return; }
    hb.invincible = this.invincible;
    if ((st === State.Idle || st === State.Moving) && this.aim === Aim.Down) { hb.setVOffset(-0.625); hb.setVSize(0.75); }
    else if (st === State.Jumping) { hb.setVOffset(0.5); hb.setVSize(1); }
    else if (st === State.Swimming || st === State.WaterGetUp) { hb.setVOffset(-0.5); hb.setVSize(1); }
    else { hb.setVOffset(0); hb.setVSize(2); }
    if (st === State.Splash || st === State.Dive) hb.invincible = true;
  }

  update(dt) {
    this.updateState();
    this.updateLook();
    this.updateAim();
    this.updateAnimations();
    this.updateHitbox();
    this.shooter.update(dt);
    this.body.step(dt);
    // Keep the player inside the camera's horizontal bounds (screen edges are walls in Contra).
    this.game.clampToView(this);
    this.bodyAnim.update(dt);
    this.legsAnim.update(dt);
    if (this.y < camera.y - HALF_H - 4 && this.state !== State.Dead && this.state !== State.Spectate) {
      this.hitbox.hits++; // fell off the world
    }
  }

  draw() {
    if (this.state === State.Spectate) return;
    // InvincibilityCoroutine: renderers toggle every 0.1 s, starting hidden.
    if (this.invincible) {
      const elapsed = this.game.time - (this.invincibleUntil - this.invincibilityTime);
      if (Math.floor(elapsed / 0.1) % 2 === 0) return;
    }
    const bx = this.bodyRenderer.lx, by = this.bodyRenderer.ly;
    // Player 2 gets a hue shift (the Unity build tinted players via UI.ColorSelection).
    const ctx = getCtx();
    if (this.index === 1 && this.character === "commando") ctx.filter = "hue-rotate(140deg)";
    const sprite = (name) => characterSprite(this.character, name, this.index === 1);
    if (this.legsAnim.sprite) drawSprite(sprite(this.legsAnim.sprite), this.x, this.y, this.flip);
    if (this.bodyAnim.sprite) drawSprite(sprite(this.bodyAnim.sprite), this.x + (this.flip ? -bx : bx), this.y + by, this.flip);
    ctx.filter = "none";
  }
}
