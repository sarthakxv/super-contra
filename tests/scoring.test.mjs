import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { HIGH_SCORE_KEY, HighScore, highScore, RunScore, formatScore, formatTime } from "../src/score.js";
import { assets } from "../src/assets.js";
import { Game } from "../src/game.js";
import { Soldier, SoldierHiding, Thief, Turret, GroundTurret, spawnThief } from "../src/enemies.js";
import { SuperMachine } from "../src/boss.js";
import { State } from "../src/player.js";
import { Damage, DamageType, resolveDamage } from "../src/combat.js";

for (const name of ["level", "prefabs", "anims"]) {
  assets[name] = JSON.parse(await readFile(new URL(`../assets/${name}.json`, import.meta.url), "utf8"));
}

let storage;
beforeEach(() => {
  storage = new Map();
  globalThis.localStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  highScore.bestScore = 0;
  highScore.persisted = true;
});

const newScore = () => new RunScore(0, 100, 3, new HighScore());
const newGame = () => new Game([{ sample() {}, horizontal: 0, vertical: 0, b: false, bDown: false, aDown: false }], 1);

// Exercise actual damage resolution, including the player-source attribution hooks.
function hit(target, count = 1, type = DamageType.Player) {
  target.hitbox.invincible = false;
  const b = target.hitbox.world();
  const damages = Array.from({ length: count }, () => {
    const bullet = { alive: true, x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
    return new Damage(bullet, { ox: 0, oy: 0, w: 0.1, h: 0.1 }, type);
  });
  resolveDamage(damages, [target.hitbox]);
}

test("point values, zero-point runners, and duplicate elimination awards", () => {
  const score = newScore();
  const values = { runner: 0, rifle: 100, hiding: 200, turret: 500, bossGun: 1000, bossCore: 5000 };
  for (const [kind, points] of Object.entries(values)) {
    const target = {}, before = score.total;
    score.kill(target, kind);
    assert.equal(score.total - before, points);
    score.kill(target, kind);
    assert.equal(score.total - before, points);
  }
  for (let i = 0; i < 1000; i++) score.kill({}, "runner");
  assert.equal(score.total, 6800);
  assert.equal(score.breakdown.enemies, 800);
  assert.equal(score.breakdown.boss, 6000);
  assert.equal(score.kills, 1004);
});

test("progress pays whole new percentages once, even across deaths and backtracking", () => {
  const score = newScore();
  for (const x of [-10, 0, 0.99]) score.advance(x);
  assert.equal(score.total, 0);
  score.advance(1); assert.equal(score.total, 50);
  score.advance(50); assert.equal(score.total, 2500);
  score.recordDeath();
  for (const x of [0, 49, 50, NaN, Infinity]) score.advance(x);
  assert.equal(score.total, 2500);
  score.advance(1000); assert.equal(score.total, 5000);
  assert.equal(score.deaths, 1);
});

test("victory completes progress and awards survival based on lethal transitions", () => {
  for (const [deaths, expected] of [[0, 3000], [1, 2000], [2, 1000], [3, 0], [4, 0]]) {
    const score = newScore();
    score.advance(20);
    for (let i = 0; i < deaths; i++) score.recordDeath();
    score.finish("victory", 240);
    assert.equal(score.breakdown.progress, 5000);
    assert.equal(score.breakdown.survival, expected);
    assert.equal(score.total, 5000 + expected);
  }
});

test("speed bonus uses whole gameplay seconds and the 120/121/220 boundaries", () => {
  for (const [seconds, expected] of [[60, 2000], [120, 2000], [120.99, 2000], [121, 1980],
    [160, 1200], [219.99, 20], [220, 0], [600, 0]]) {
    const score = newScore();
    score.finish("victory", seconds);
    assert.equal(score.breakdown.speed, expected, `${seconds} seconds`);
    assert.equal(score.elapsed, seconds);
  }
});

test("defeat retains earned points without bonuses and every result freezes all counters", () => {
  for (const result of ["victory", "defeat"]) {
    const score = newScore();
    score.kill({}, "rifle"); score.advance(50); score.recordDeath();
    score.finish(result, 121);
    if (result === "defeat") assert.deepEqual(score.breakdown,
      { progress: 2500, enemies: 100, boss: 0, survival: 0, speed: 0 });
    const snapshot = JSON.stringify(score);
    score.kill({}, "bossCore"); score.kill({}, "runner"); score.advance(100); score.recordDeath();
    score.finish("victory", 0);
    assert.equal(JSON.stringify(score), snapshot);
  }
});

test("records persist before a run ends, survive reload, and do not replace ties", () => {
  const score = newScore();
  score.kill({}, "rifle");
  assert.deepEqual(JSON.parse(storage.get(HIGH_SCORE_KEY)), { version: 1, bestScore: 100 });
  const reloaded = new HighScore();
  assert.equal(reloaded.bestScore, 100);
  const next = new RunScore(0, 100, 3, reloaded);
  next.kill({}, "rifle"); assert.equal(next.newBest, false);
  next.kill({}, "hiding"); assert.equal(next.newBest, true);
  next.finish("defeat", 30);
  assert.equal(new HighScore().bestScore, 300);
  const fresh = new RunScore(0, 100, 3, reloaded);
  assert.equal(fresh.total, 0);
  assert.equal(fresh.record.bestScore, 300);
});

test("corrupt, unsupported, negative, fractional, and unsafe stored scores start at zero", () => {
  for (const value of ["broken", "null", "{}", '{"version":2,"bestScore":100}',
    '{"version":1,"bestScore":-1}', '{"version":1,"bestScore":1.5}',
    '{"version":1,"bestScore":"100"}', '{"version":1,"bestScore":9007199254740992}']) {
    storage.set(HIGH_SCORE_KEY, value);
    assert.equal(new HighScore().bestScore, 0);
  }
});

test("denied storage retains a session best without crashing or false tie celebrations", () => {
  globalThis.localStorage = { getItem() { throw Error("denied"); }, setItem() { throw Error("denied"); } };
  const record = new HighScore();
  const score = new RunScore(0, 100, 3, record);
  score.kill({}, "rifle");
  assert.equal(record.bestScore, 100);
  assert.equal(record.persisted, false);
  const next = new RunScore(0, 100, 3, record);
  next.kill({}, "rifle");
  assert.equal(next.newBest, false);
  next.kill({}, "hiding");
  assert.equal(record.bestScore, 300);
});

test("real enemy damage hooks award eligible kills once and reject non-player damage", () => {
  const game = newGame();
  let expected = 0;
  for (const [Enemy, points] of [[Soldier, 100], [SoldierHiding, 200], [Turret, 500], [GroundTurret, 500], [Thief, 0]]) {
    const enemy = game.entities.find((e) => e instanceof Enemy);
    hit(enemy, Math.ceil(enemy.health) + 5);
    enemy.update(0.02);
    expected += points;
    assert.equal(game.score.total, expected, Enemy.name);
    hit(enemy, 5); enemy.update(0.02);
    assert.equal(game.score.total, expected, `${Enemy.name} duplicates`);
  }
  const soldier = game.entities.find((e) => e instanceof Soldier && e.health > 0);
  hit(soldier, 1, DamageType.General); soldier.update(0.02);
  assert.equal(game.score.total, expected);
});

test("spawned runners and environmental runner cleanup never award points", () => {
  const game = newGame();
  for (let i = 0; i < 30; i++) {
    const runner = spawnThief(game, 7, 2);
    hit(runner); runner.update(0.02);
  }
  const falling = spawnThief(game, 7, -100);
  falling.update(0.02);
  assert.equal(falling.alive, false);
  assert.equal(game.score.kills, 30);
  assert.equal(game.score.total, 0);
});

test("real player deaths count once, preserve score, and dead movement cannot add progress", () => {
  const game = newGame(), player = game.players[0];
  player.body.x = 40; player.update(0.02);
  const earned = game.score.total;
  hit(player, 1, DamageType.Enemy); player.update(0.02);
  assert.equal(player.state, State.Dead);
  assert.equal(game.score.deaths, 1);
  player.body.x = 100;
  hit(player, 1, DamageType.Enemy); player.update(0.02);
  assert.equal(game.score.deaths, 1);
  assert.equal(game.score.total, earned);
  player.body.x = 40;
  game.time = 2.1; player.update(0.02);
  assert.notEqual(player.state, State.Dead);
  assert.equal(game.score.deaths, 1);
  assert.equal(game.score.total, earned);
});

test("boss core auto-destruction gives no gun points and post-result updates stay frozen", () => {
  const game = newGame(), boss = game.entities.find((e) => e instanceof SuperMachine);
  hit(boss.core, 30); boss.hitPart(boss.core);
  assert.equal(game.result, "victory");
  assert.equal(game.score.breakdown.boss, 5000);
  assert.equal(boss.left.state, "Destroyed");
  assert.equal(boss.right.state, "Destroyed");
  const snapshot = JSON.stringify(game.score);
  hit(boss.left, 30); boss.hitPart(boss.left);
  for (let i = 0; i < 150; i++) game.update(0.02);
  game.finish("defeat");
  assert.equal(JSON.stringify(game.score), snapshot);
  assert.equal(game.result, "victory");
});

test("direct boss-gun destruction awards each gun once before the core", () => {
  const game = newGame(), boss = game.entities.find((e) => e instanceof SuperMachine);
  for (const gun of [boss.left, boss.right]) {
    hit(gun, 15); boss.hitPart(gun);
    hit(gun, 15); boss.hitPart(gun);
  }
  assert.equal(game.score.breakdown.boss, 2000);
  hit(boss.core, 30); boss.hitPart(boss.core);
  assert.equal(game.score.breakdown.boss, 7000);
});

test("HUD numbers and gameplay time format without truncation", () => {
  assert.equal(formatScore(0), "000000");
  assert.equal(formatScore(12300), "012300");
  assert.equal(formatScore(1000000), "1000000");
  assert.equal(formatTime(121.9), "2:01");
  assert.equal(formatTime(3600), "60:00");
});
