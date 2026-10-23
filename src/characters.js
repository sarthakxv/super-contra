import { assets, fetchRetry } from "./assets.js";

export const CHARACTERS = [
  { id: "commando", name: "Commando", detail: "The original jungle fighter.", color: "#7ca6ff" },
  { id: "viper", name: "Viper", detail: "Green beret. Jungle fatigues.", color: "#b6ce7a" },
  { id: "ember", name: "Ember", detail: "Cropped hair. Burnt-orange kit.", color: "#f9a743" },
  { id: "ghost", name: "Ghost", detail: "Pale helmet. Slate field gear.", color: "#c5d8d2" },
];

// Headgear anchors follow the source poses, including rotated jump/death frames.
const HEADS = {
  "Aim Straight": [6, 8], "Shoot Straight": [6, 9], "Aim Up": [1, 11, -45], "Shoot Up": [1, 12, -45],
  "Aim High": [2, 2, -20], "Shoot High": [2, 2, -20], "Aim Low": [4, 1, 25], "Shoot Low": [4, 1, 25],
  "Body Run 1": [5, 1], "Body Run 2": [7, 1], "Body Run 3": [7, 2],
  "Body Run 4": [5, 1], "Body Run 5": [7, 1], "Body Run 6": [7, 2],
  "Aim Down": [17, 3], "Shoot Down": [17, 3],
  "Jump 1": [10, 1, 20], "Jump 2": [14, 10, 90], "Jump 3": [5, 15, 180], "Jump 4": [1, 5, -90],
  "Dead 1": [4, 12, -90], "Dead 2": [11, 14, 180], "Dead 3": [11, 5, 90], "Dead 4": [3, 7, 180], "Dead 5": [3, 17, -90],
  "Water Idle 1": [9, 0], "Water Idle 2": [9, 0],
  "Water Aim Straight": [7, 0], "Water Shooting Straight 1": [7, 0],
  "Water Aim High": [4, 2, -20], "Water Aim High 2": [4, 2, -20], "Water Shooting High 1": [4, 2, -20],
  "Water Aim Up": [3, 14, -45], "Water Aim Up 2": [3, 14, -45], "Water Shooting Up 1": [3, 14, -45],
};

export function characterSprite(id, sprite, alternate = false) {
  if (!sprite || id === "commando") return sprite;
  return `character:${id}:${alternate ? "alt:" : ""}${sprite}`;
}

function drawHeadgear(ctx, anchor, costume) {
  if (!anchor) return;
  ctx.save();
  ctx.translate(anchor[0] + 3, anchor[1] + 2);
  ctx.rotate((anchor[2] || 0) * Math.PI / 180);
  ctx.fillStyle = "#101714";
  if (costume.headgear === "helmet") {
    ctx.fillRect(-3, -2, 7, 5);
    ctx.fillStyle = costume.hat; ctx.fillRect(-2, -2, 5, 3); ctx.fillRect(-3, -1, 7, 2);
    ctx.fillStyle = costume.highlight; ctx.fillRect(-1, -2, 3, 1);
    ctx.fillStyle = "#355b62"; ctx.fillRect(0, 1, 3, 1);
  } else if (costume.headgear === "beret") {
    ctx.fillRect(-3, -2, 7, 4);
    ctx.fillStyle = costume.hat; ctx.fillRect(-3, -1, 7, 2); ctx.fillRect(-2, -2, 5, 1);
    ctx.fillStyle = costume.highlight; ctx.fillRect(1, -1, 1, 1);
  } else {
    ctx.fillRect(-3, -2, 6, 4);
    ctx.fillStyle = costume.hat; ctx.fillRect(-2, -2, 4, 2); ctx.fillRect(-3, -1, 3, 3);
    ctx.fillStyle = costume.highlight; ctx.fillRect(-2, -2, 3, 1);
  }
  ctx.restore();
}

export async function loadCharacters() {
  const costumes = await (await fetchRetry("assets/characters/costumes.json")).json();
  const frames = new Set();
  for (const name of ["Controller Body", "Controller Legs"]) {
    for (const clip of assets.anims.controllers[name].animations) {
      for (const frame of assets.anims.animations[clip].frames) if (frame) frames.add(frame);
    }
  }
  for (const { id } of CHARACTERS.slice(1)) {
    for (const alternate of [false, true]) {
      const atlas = document.createElement("canvas");
      atlas.width = 512; atlas.height = Math.ceil(frames.size / 8) * 48;
      const ctx = atlas.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      let index = 0;
      for (const frame of frames) {
        const s = assets.sprites[frame];
        const x = index % 8 * 64 + 4, y = Math.floor(index / 8) * 48 + 4;
        ctx.drawImage(assets.images[s.tex], s.x, s.y, s.w, s.h, x, y, s.w, s.h);
        const pixels = ctx.getImageData(x, y, s.w, s.h), data = pixels.data, costume = costumes[id];
        for (let i = 0; i < data.length; i += 4) {
          if (!data[i + 3]) continue;
          let color;
          if (data[i] === 32 && data[i + 1] === 56 && data[i + 2] === 236) color = alternate ? costume.trim : costume.pants;
          else if (data[i] === 252 && data[i + 1] === 216 && data[i + 2] === 168) color = alternate ? costume.pants : costume.trim;
          else if (data[i] === 216 && data[i + 1] === 40 && data[i + 2] === 0) color = costume.shade;
          else if (data[i] === 252 && data[i + 1] === 188 && data[i + 2] === 176) color = costume.skin;
          if (color) data.set(color, i);
        }
        ctx.putImageData(pixels, x, y);
        // Draw on integer sprite pixels so rotations do not introduce antialiasing.
        const gear = document.createElement("canvas"); gear.width = s.w; gear.height = s.h;
        const gearCtx = gear.getContext("2d");
        drawHeadgear(gearCtx, HEADS[frame], costume);
        const gearPixels = gearCtx.getImageData(0, 0, s.w, s.h);
        for (let i = 0; i < gearPixels.data.length; i += 4) gearPixels.data[i + 3] = gearPixels.data[i + 3] > 127 ? 255 : 0;
        gearCtx.putImageData(gearPixels, 0, 0);
        ctx.drawImage(gear, x, y);
        const key = characterSprite(id, frame, alternate);
        const texture = `character:${id}:${alternate}`;
        assets.sprites[key] = { ...s, x, y, tex: texture };
        assets.images[texture] = atlas;
        index++;
      }
    }
  }
}
