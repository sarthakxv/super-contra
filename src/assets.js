// Loads the data extracted from the Unity build by tools/extract.py.

const BASE = "assets/";

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });
}

async function loadJSON(name) {
  const res = await fetch(BASE + name);
  if (!res.ok) throw new Error(`failed to load ${name}`);
  return res.json();
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
  await Promise.all([...files].map(async (f) => {
    assets.images[f] = await loadImage(BASE + "img/" + encodeURIComponent(f));
  }));
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
