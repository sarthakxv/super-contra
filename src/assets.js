// Loads the data extracted from the Unity build by tools/extract.py.

const BASE = "assets/";

/**
 * fetch() with retries. Simple static servers (python -m http.server has a listen backlog
 * of 5) reset connections when the page requests every asset at once.
 */
export async function fetchRetry(url, tries = 4) {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
      throw new Error(`HTTP ${res.status} for ${url}`);
    } catch (e) {
      if (i >= tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 150 * (i + 1)));
    }
  }
}

/** Run async jobs with at most `limit` in flight. */
export async function pooled(items, limit, job) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) await job(queue.shift());
  });
  await Promise.all(workers);
}

async function loadImage(src) {
  const blob = await (await fetchRetry(src)).blob();
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to decode ${src}`));
    img.src = url;
  });
}

async function loadJSON(name) {
  return (await fetchRetry(BASE + name)).json();
}

export const assets = {
  sprites: null,   // name -> {tex, x, y, w, h, px, py, ppu}
  images: {},      // texture file -> HTMLImageElement
  level: null,     // {tilemaps, scene}
  prefabs: null,   // prefab hierarchies (same shape as scene roots)
  anims: null,     // animation clips + controllers
  audio: null,     // clip name -> file
};

export async function loadAssets() {
  const [sprites, level, prefabs, anims, audio] = await Promise.all([
    loadJSON("sprites.json"), loadJSON("level.json"), loadJSON("prefabs.json"),
    loadJSON("anims.json").catch(() => ({})), loadJSON("audio.json"),
  ]);
  Object.assign(assets, { sprites, level, prefabs, anims, audio });
  const files = new Set(Object.values(sprites).filter((s) => s && s.tex).map((s) => s.tex));
  await pooled([...files], 4, async (f) => {
    assets.images[f] = await loadImage(BASE + "img/" + encodeURIComponent(f));
  });
  return assets;
}

/** Find a prefab root by GameObject name. */
export function prefab(name) {
  const p = assets.prefabs.find((r) => r.name === name);
  if (!p) throw new Error(`unknown prefab ${name}`);
  return p;
}

/** First component of a given type on a scene/prefab node. */
export function comp(node, type) {
  return node.components.find((c) => c.type === type);
}

/** Depth-first search for a child node by name. */
export function child(node, name) {
  for (const c of node.children) {
    if (c.name === name) return c;
    const hit = child(c, name);
    if (hit) return hit;
  }
  return null;
}
