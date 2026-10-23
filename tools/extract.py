"""Extract art, audio, tilemap collision and scene objects from the Unity build.

Usage: python -I tools/extract.py <game_dir> <out_assets_dir>
Requires: UnityPy, TypeTreeGeneratorAPI (typetrees are stripped in the build).
"""
import json
import os
import struct
import subprocess
import sys

import UnityPy
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator

GAME, OUT = sys.argv[1], sys.argv[2]
os.makedirs(os.path.join(OUT, "img"), exist_ok=True)
os.makedirs(os.path.join(OUT, "audio"), exist_ok=True)

env = UnityPy.load(os.path.join(GAME, "Contra_Data"))
gen = TypeTreeGenerator("2021.2.10f1")
gen.load_local_game(GAME)
env.typetree_generator = gen

# Index every object by "file:pathid" so PPtrs can be resolved across files.
objs = {}
for o in env.objects:
    objs[f"{o.assets_file.name}:{o.path_id}"] = o


def key_of(pptr, af):
    """Resolve a typetree PPtr dict to a 'file:pathid' key."""
    if not pptr or pptr.get("m_PathID", 0) == 0:
        return None
    fid = pptr["m_FileID"]
    if fid == 0:
        return f"{af.name}:{pptr['m_PathID']}"
    if fid - 1 >= len(af.externals):
        return None
    return f"{af.externals[fid - 1].path.split('/')[-1]}:{pptr['m_PathID']}"


script_names = {}
for k, o in objs.items():
    if o.type.name == "MonoScript":
        d = o.read()
        script_names[k] = (d.m_Namespace + "." if d.m_Namespace else "") + d.m_ClassName


def script_of(o):
    # Generated typetrees mis-align m_Script, so read it from raw bytes:
    # m_GameObject(12) + m_Enabled(1, aligned to 4) => m_Script at offset 16.
    fid, pid = struct.unpack_from("<iq", o.get_raw_data(), 16)
    af = o.assets_file
    ext = af.name if fid == 0 else af.externals[fid - 1].path.split("/")[-1]
    return script_names.get(f"{ext}:{pid}", "?")


# ---------------------------------------------------------------- textures
GAME_TEXTURES = {
    "ContraMapStage1BG", "ContraMapStage1", "ContraSheet3", "ContraSheet4",
    "ContraSheet6", "ContraSheet8", "NES - Contra - Bill Rizer & Lance Bean",
    "Tiles", "Untitled-1", "pngaaa.com-3708045", "Background", "Cursor",
}
tex_file = {}
for k, o in objs.items():
    if o.type.name == "Texture2D":
        t = o.read()
        if t.m_Name in GAME_TEXTURES and t.m_Width > 0:
            fn = t.m_Name.replace(" ", "_").replace("&", "and") + ".png"
            t.image.save(os.path.join(OUT, "img", fn))
            tex_file[k] = (fn, t.m_Height)

# ---------------------------------------------------------------- sprites
sprites = {}
for k, o in objs.items():
    if o.type.name != "Sprite":
        continue
    s = o.read_typetree()
    tk = key_of(s["m_RD"]["texture"], o.assets_file)
    if tk not in tex_file:
        continue
    fn, th = tex_file[tk]
    r = s["m_RD"]["textureRect"]
    rect = s["m_Rect"]
    piv = s["m_Pivot"]
    entry = {
        "tex": fn,
        # Unity textures are bottom-up; convert to top-left image coords.
        "x": round(r["x"]), "y": round(th - r["y"] - r["height"]),
        "w": round(r["width"]), "h": round(r["height"]),
        # pivot in pixels from the sprite's top-left corner
        "px": piv["x"] * rect["width"], "py": (1 - piv["y"]) * rect["height"],
        "ppu": s["m_PixelsToUnits"],
    }
    name = s["m_Name"]
    if name in sprites and sprites[name] != entry:
        name = f"{name}#{o.path_id}"
    sprites[name] = entry
    sprites.setdefault("$bykey", {})[k] = name
with open(os.path.join(OUT, "sprites.json"), "w") as f:
    json.dump(sprites, f, indent=0)

# ---------------------------------------------------------------- audio
audio_index = {}
for k, o in objs.items():
    if o.type.name != "AudioClip":
        continue
    clip = o.read()
    try:
        for name, data in clip.samples.items():
            base = clip.m_Name.replace(" ", "_").replace("%", "and")
            wav = os.path.join(OUT, "audio", base + ".wav")
            with open(wav, "wb") as f:
                f.write(data)
            # WAVs are huge (stage music ~21MB); ship 128k MP3 instead.
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-b:a", "128k",
                            os.path.join(OUT, "audio", base + ".mp3")], check=True)
            os.remove(wav)
            audio_index[clip.m_Name] = base + ".mp3"
            break
    except Exception as e:  # FMOD decode failures are reported, not fatal
        print("audio fail", clip.m_Name, e)
with open(os.path.join(OUT, "audio.json"), "w") as f:
    json.dump(audio_index, f, indent=1)

# ---------------------------------------------------------------- scene graph
def plain(v, af):
    """Convert typetree values to JSON; PPtrs become {'ref': 'file:id', 'name': ...}."""
    if isinstance(v, dict):
        if set(v) == {"m_FileID", "m_PathID"}:
            k = key_of(v, af)
            if k is None:
                return None
            o = objs.get(k)
            nm = None
            if o is not None:
                try:
                    if o.type.name in ("Sprite",):
                        nm = sprites["$bykey"].get(k)
                    elif o.type.name in ("Transform", "GameObject", "MonoBehaviour", "AudioClip",
                                         "Texture2D", "Material"):
                        nm = o.peek_name()
                except Exception:
                    nm = None
            return {"ref": k, "name": nm}
        return {kk: plain(x, af) for kk, x in v.items()}
    if isinstance(v, list):
        return [plain(x, af) for x in v]
    if isinstance(v, bytes):
        return None
    return v


SKIP_COMPONENT_FIELDS = {"m_GameObject", "m_Enabled", "m_Script", "m_Name", "m_EditorHideFlags",
                         "m_EditorClassIdentifier", "m_ObjectHideFlags"}


def export_scene(file_name):
    roots, nodes = [], {}
    for k, o in objs.items():
        if o.assets_file.name != file_name or o.type.name not in ("Transform",):
            continue
        tr = o.read_typetree()
        go_key = key_of(tr["m_GameObject"], o.assets_file)
        go = objs[go_key].read_typetree()
        comps = []
        for c in go["m_Component"]:
            ck = key_of(c["component"], o.assets_file)
            co = objs.get(ck)
            if co is None or co.type.name in ("Transform",):
                continue
            try:
                tree = co.read_typetree()
            except Exception:
                tree = {}
            entry = {"type": co.type.name, "key": ck}
            if co.type.name == "MonoBehaviour":
                entry["type"] = script_of(co)
                entry["enabled"] = tree.get("m_Enabled", 1)
            fields = {kk: plain(vv, co.assets_file) for kk, vv in tree.items()
                      if kk not in SKIP_COMPONENT_FIELDS and not kk.startswith("m_Tile")}
            if co.type.name == "Tilemap":
                fields = {}
            entry["fields"] = fields
            comps.append(entry)
        nodes[k] = {
            "name": go["m_Name"], "active": go["m_IsActive"], "layer": go["m_Layer"],
            "lp": [tr["m_LocalPosition"]["x"], tr["m_LocalPosition"]["y"]],
            "ls": [tr["m_LocalScale"]["x"], tr["m_LocalScale"]["y"]],
            "father": key_of(tr["m_Father"], o.assets_file),
            "children": [key_of(c, o.assets_file) for c in tr["m_Children"]],
            "components": comps, "key": go_key,
        }

    def build(k, wx, wy, sx, sy):
        n = nodes[k]
        x, y = wx + n["lp"][0] * sx, wy + n["lp"][1] * sy
        nsx, nsy = sx * n["ls"][0], sy * n["ls"][1]
        out = {kk: n[kk] for kk in ("name", "active", "layer", "components", "key")}
        out.update(x=round(x, 4), y=round(y, 4), lx=n["lp"][0], ly=n["lp"][1], sx=nsx, sy=nsy,
                   tkey=k)
        out["children"] = [build(c, x, y, nsx, nsy) for c in n["children"] if c in nodes]
        return out

    for k, n in nodes.items():
        if n["father"] is None:
            roots.append(build(k, 0, 0, 1, 1))
    return roots


level = export_scene("level3")
prefabs = export_scene("sharedassets0.assets")

# ---------------------------------------------------------------- tilemaps
tilemaps = {}
for k, o in objs.items():
    if o.assets_file.name != "level3" or o.type.name != "Tilemap":
        continue
    tm = o.read_typetree()
    go = objs[key_of(tm["m_GameObject"], o.assets_file)].read_typetree()
    shapes = []
    for sp in tm["m_TileSpriteArray"]:
        sk = key_of(sp["m_Data"], o.assets_file) if sp["m_Data"] else None
        if sk is None:
            shapes.append(None)
            continue
        s = objs[sk].read_typetree()
        shapes.append({"sprite": s["m_Name"],
                       "shape": [[[p["x"], p["y"]] for p in poly] for poly in s["m_PhysicsShape"]]})
    cells = [[pos["x"], pos["y"], data["m_TileSpriteIndex"]] for pos, data in tm["m_Tiles"]]
    tilemaps[go["m_Name"]] = {"layer": go["m_Layer"], "cells": cells, "sprites": shapes}

with open(os.path.join(OUT, "level.json"), "w") as f:
    json.dump({"tilemaps": tilemaps, "scene": level}, f)
with open(os.path.join(OUT, "prefabs.json"), "w") as f:
    json.dump(prefabs, f)
print("sprites", len(sprites) - 1, "audio", len(audio_index), "tilemaps", list(tilemaps),
      "roots", len(level), "prefabs", len(prefabs))
