// WebAudio playback of the extracted clips. Mirrors SoundManager: one music source
// ("Background" AudioSource) plus one-shot SFX by clip name.

import { assets, fetchRetry, pooled } from "./assets.js";

let ctx = null;
let master = null;
const buffers = {};
let music = null;
let muted = false;

export async function initAudio() {
  if (ctx) return;
  ctx = new AudioContext();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  await pooled(Object.entries(assets.audio), 3, async ([name, file]) => {
    try {
      const res = await fetchRetry("assets/audio/" + encodeURIComponent(file));
      buffers[name] = await ctx.decodeAudioData(await res.arrayBuffer());
    } catch (e) { console.warn("audio", name, e); }
  });
}

/** Browsers only allow audio after a user gesture; call from a key/click handler. */
export function resumeAudio() { if (ctx && ctx.state === "suspended") ctx.resume(); }

export function playSfx(name, volume = 1) {
  if (!ctx || muted || !buffers[name]) return;
  const src = ctx.createBufferSource();
  src.buffer = buffers[name];
  const g = ctx.createGain();
  g.gain.value = volume;
  src.connect(g).connect(master);
  src.start();
}

export function playMusic(name, loop = true) {
  stopMusic();
  if (!ctx || !buffers[name]) return;
  const src = ctx.createBufferSource();
  src.buffer = buffers[name];
  src.loop = loop;
  src.connect(master);
  src.start();
  music = src;
}

export function stopMusic() {
  if (music) { try { music.stop(); } catch { /* already stopped */ } music = null; }
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.5;
  return muted;
}
