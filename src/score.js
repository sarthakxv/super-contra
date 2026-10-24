export const HIGH_SCORE_KEY = "contra.highscore.v1";

const POINTS = { runner: 0, rifle: 100, hiding: 200, turret: 500, bossGun: 1000, bossCore: 5000 };

export class HighScore {
  constructor() {
    this.bestScore = 0;
    this.persisted = true;
    try {
      const saved = JSON.parse(localStorage.getItem(HIGH_SCORE_KEY));
      if (saved?.version === 1 && Number.isSafeInteger(saved.bestScore) && saved.bestScore >= 0) {
        this.bestScore = saved.bestScore;
      }
    } catch {
      // Corrupt data starts fresh; denied storage is reported if saving fails.
    }
  }

  improve(score) {
    if (!Number.isSafeInteger(score) || score <= this.bestScore) return;
    this.bestScore = score;
    try {
      localStorage.setItem(HIGH_SCORE_KEY, JSON.stringify({ version: 1, bestScore: score }));
      this.persisted = true;
    } catch {
      this.persisted = false;
    }
  }
}

export const highScore = new HighScore();

export class RunScore {
  constructor(startX, endX, attempts, record = highScore) {
    this.startX = startX;
    this.endX = endX;
    this.attempts = attempts;
    this.record = record;
    this.bestAtStart = record.bestScore;
    this.total = 0;
    this.breakdown = { progress: 0, enemies: 0, boss: 0, survival: 0, speed: 0 };
    this.kills = 0;
    this.deaths = 0;
    this.elapsed = 0;
    this.finished = false;
    this.awarded = new WeakSet();
  }

  get newBest() { return this.total > this.bestAtStart; }

  add(category, points) {
    if (this.finished || points <= 0) return;
    this.breakdown[category] += points;
    this.total += points;
    this.record.improve(this.total);
  }

  kill(target, kind) {
    const points = POINTS[kind];
    if (this.finished || points === undefined || this.awarded.has(target)) return;
    this.awarded.add(target);
    const boss = kind === "bossGun" || kind === "bossCore";
    if (!boss) this.kills++;
    this.add(boss ? "boss" : "enemies", points);
  }

  advance(x) {
    if (this.finished || !Number.isFinite(x)) return;
    const percent = Math.min(100, Math.max(0, Math.floor((x - this.startX) / (this.endX - this.startX) * 100 + 1e-9)));
    this.add("progress", percent * 50 - this.breakdown.progress);
  }

  recordDeath() {
    if (!this.finished) this.deaths++;
  }

  finish(result, elapsed) {
    if (this.finished) return;
    this.elapsed = elapsed;
    if (result === "victory") {
      this.advance(this.endX);
      this.add("survival", Math.max(0, this.attempts - this.deaths) * 1000);
      const seconds = Math.floor(elapsed + 1e-7);
      this.add("speed", Math.max(0, 2000 - Math.max(0, seconds - 120) * 20));
    }
    this.finished = true;
  }
}

export function formatScore(score) { return String(score).padStart(6, "0"); }

export function formatTime(seconds) {
  const whole = Math.floor(seconds + 1e-7);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
