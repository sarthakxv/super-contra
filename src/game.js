// Level runtime: entity list, damage resolution, camera (CameraController), sounds
// (SoundManager table from the scene) and level flow (LevelController).

import { assets, comp } from "./assets.js";
import { camera, clear, drawSprite, strokeBox, text, HALF_W, VIEW_W, VIEW_H, fillRectScreen } from "./render.js";
import { buildWorld, ledges, water, LAYER } from "./world.js";
import { resolveDamage } from "./combat.js";
import { playSfx, playMusic, stopMusic } from "./audio.js";
import { Player, State } from "./player.js";
import { Soldier, SoldierHiding, Thief, Turret, GroundTurret, Prop } from "./enemies.js";
import { Bridge, FalconBox, Scroll, ObjectEnabler, EnemySpawner, FallDamage } from "./objects.js";
import { SuperMachine } from "./boss.js";

const SCENE_TYPES = { Soldier, SoldierHiding, Thief, Turret, GroundTurret, SuperMachine,
  Bridge, FalconBox, EnemySpawner };

const RESULT_SFX = { victory: 0, defeat: 1 };

const CAMERA_Y = -0.55;
const CAMERA_MIN_X = -2, CAMERA_MAX_X = 190;

export class Game {
  constructor(inputs, playerCount) {
    buildWorld(); // fresh ledges each run: bridges add/remove their own part colliders
    this.time = 0;
    this.dt = 0.02;
    this.entities = [];
    this.hitboxes = [];
    this.damages = [];
    this.debug = false;
    this.result = null;       // "victory" | "defeat"
    this.resultTime = 0;
    this.bossLock = false;
    this.bossCameraX = CAMERA_MAX_X;

    // SoundManager.sounds: SFX type -> clip name.
    const sm = this.findNode("Sound Manager");
    this.sounds = {};
    for (const s of comp(sm, "SoundManager").fields.sounds) this.sounds[s.type] = s.clip && s.clip.name;

    const lm = this.findNode("Level Manager");
    const spawn = lm.children.find((c) => c.name === "Player Spawn");
    const bossCam = lm.children.find((c) => c.name === "Boss Camera Location");
    if (bossCam) this.bossCameraX = bossCam.x;

    camera.x = -1.7; camera.y = CAMERA_Y;
    this.wallX = Infinity;
    this.players = [];
    for (let i = 0; i < playerCount; i++) {
      this.players.push(this.add(new Player(this, i, inputs[i], spawn.x + i * 1.5, spawn.y)));
    }
    this.buildLevel();
    playMusic("03 Stage 1 - Jungle % Stage 7 - Hangar");
  }

  /** Instantiate every scripted scene object by its MonoBehaviour type. */
  buildLevel() {
    const scrolls = {};
    const enablers = [];
    const visit = (node) => {
      const types = node.components.map((c) => c.type);
      const scripted = types.find((t) => SCENE_TYPES[t]);
      if (scripted) { this.add(new SCENE_TYPES[scripted](this, node)); return; }
      if (types.includes("Scroll")) { scrolls[node.tkey] = this.add(new Scroll(this, node)); return; }
      if (types.includes("ObjectEnabler")) { enablers.push(node); return; }
      if (node.name.startsWith("Fall Damage")) { this.add(new FallDamage(this, node)); return; }
      if (node.name.startsWith("Bush")) this.add(new Prop(node));
      for (const c of node.children) visit(c);
    };
    for (const root of assets.level.scene) {
      if (["Grid", "Main Camera", "Level Manager", "Sound Manager", "EventSystem"].includes(root.name)) continue;
      if (root.name.startsWith("Blueprint")) continue;
      visit(root);
    }
    for (const node of enablers) {
      const targetRef = comp(node, "ObjectEnabler").fields.target.ref;
      // The enabler references the Scroll's GameObject; match it against the Scroll node's GameObject key.
      const target = Object.values(scrolls).find((s) => s.node.key === targetRef);
      this.add(new ObjectEnabler(this, node, target));
    }
  }

  targetablePlayers() {
    return this.players.filter((p) => p.state !== State.Spectate && p.state !== State.Dead);
  }

  cameraRight() { return camera.x + HALF_W; }

  onBossStarted() { this.bossLock = true; }

  onBossDefeated() {
    this.bossLock = false;
    this.finish("victory");
  }

  findNode(name) { return assets.level.scene.find((n) => n.name === name); }

  add(e) { this.entities.push(e); return e; }
  addHitbox(h) { this.hitboxes.push(h); return h; }
  addDamage(d) { this.damages.push(d); return d; }

  sfx(type) { const clip = this.sounds[type]; if (clip) playSfx(clip); }

  livePlayers() { return this.players.filter((p) => p.state !== State.Spectate); }

  /** Screen edges are walls: CameraController clamps the player to cam.x - 8 (left). */
  clampToView(p) {
    const minX = camera.x - HALF_W;
    const maxX = camera.x + HALF_W - 0.4;
    if (p.body.x < minX) p.body.x = minX;
    // Co-op only: keep the leader from walking off the right edge away from a partner.
    if (this.players.length > 1 && p.body.x > maxX) p.body.x = maxX;
    // The boss wall's solid collider.
    const half = p.body.box.w / 2;
    if (p.body.x + half > this.wallX) p.body.x = this.wallX - half;
  }

  updateCamera(dt) {
    const live = this.livePlayers();
    if (this.bossLock) {
      const d = this.bossCameraX - camera.x;
      camera.x += Math.sign(d) * Math.min(Math.abs(d), dt * 4);
    } else if (live.length) {
      const tx = live.reduce((s, p) => s + p.x, 0) / live.length;
      const step = Math.abs(tx - camera.x) * dt * 10;
      camera.x += Math.sign(tx - camera.x) * Math.min(step, Math.abs(tx - camera.x));
      if (Math.abs(camera.x - tx) < 1) camera.x = tx;
    }
    camera.x = Math.min(CAMERA_MAX_X, Math.max(CAMERA_MIN_X, camera.x));
    camera.y = CAMERA_Y;
  }

  onPlayerOut() {
    if (this.players.every((p) => p.state === State.Spectate)) this.finish("defeat");
  }

  finish(result) {
    if (this.result) return;
    this.result = result;
    this.resultTime = this.time;
    stopMusic();
    this.sfx(RESULT_SFX[result]);
  }

  update(dt) {
    this.dt = dt;
    this.time += dt;
    for (const p of this.players) p.input.sample();
    // Iterate over a snapshot: entities may spawn others during update.
    for (const e of this.entities.slice()) if (e.alive) e.update(dt);
    resolveDamage(this.damages, this.hitboxes);
    this.updateCamera(dt);
    this.entities = this.entities.filter((e) => e.alive);
    this.damages = this.damages.filter((d) => d.owner.alive);
    this.hitboxes = this.hitboxes.filter((h) => h.owner.alive);
  }

  draw() {
    clear();
    drawSprite("ContraMapStage1BG_0", 94, 0.5);
    const sorted = this.entities.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    for (const e of sorted) e.draw();
    if (this.debug) this.drawDebug();
    this.drawHud();
  }

  drawHud() {
    // UI.PlayerHealth: one medal per remaining life, top-left.
    this.players.forEach((p, i) => {
      const lives = p.state === State.Spectate ? 0 : p.lives;
      text(`${i + 1}P`, 4 + i * 128, 4, i ? "#7cf" : "#f77");
      for (let k = 0; k < Math.min(lives, 6); k++) {
        fillRectScreen(20 + i * 128 + k * 8, 5, 5, 8, "#3af");
        fillRectScreen(21 + i * 128 + k * 8, 6, 3, 3, "#fff");
      }
    });
    if (this.result) {
      fillRectScreen(0, 0, VIEW_W, VIEW_H, "rgba(0,0,0,0.82)");
      text(this.result === "victory" ? "VICTORY" : "DEFEAT", VIEW_W / 2, VIEW_H / 2 - 8,
        this.result === "victory" ? "#fffb00" : "#ff000e", "center", 16);
      if (this.time - this.resultTime > 2) text("press ENTER", VIEW_W / 2, VIEW_H / 2 + 14, "#aaa", "center");
    }
  }

  drawDebug() {
    for (const l of ledges) {
      if (l.layer === LAYER.Water) continue;
      strokeBox((l.x0 + l.x1) / 2, (l.top + l.bottom) / 2, l.x1 - l.x0, l.top - l.bottom,
        l.layer === LAYER.Ground ? "#f00" : "#ff0");
    }
    for (const w of water) strokeBox((w.x0 + w.x1) / 2, (w.top + w.bottom) / 2, w.x1 - w.x0, w.top - w.bottom, "#0af");
    for (const h of this.hitboxes) {
      const b = h.world();
      strokeBox((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, b.x1 - b.x0, b.y1 - b.y0, h.invincible ? "#888" : "#0f0");
    }
    for (const d of this.damages) {
      if (!d.enabled) continue;
      const b = d.world();
      strokeBox((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, b.x1 - b.x0, b.y1 - b.y0, "#f0f");
    }
    const p = this.players[0];
    text(`x ${p.x.toFixed(2)} y ${p.y.toFixed(2)} st ${Object.keys(State)[p.state]}`, 2, VIEW_H - 10, "#fff");
  }
}
