# Contra Stage 1 — browser port

A JavaScript/Canvas port of the Windows Unity build in `../Contra.exe` (a Unity 2021.2 remake of
NES Contra stage 1 with Mirror online co-op, by Amr Zewail). No build step, no dependencies.

## Run

```bash
python3 "/Users/sarthak/Downloads/Contra Multiplayer/web/tools/serve.py"
```

Then open http://127.0.0.1:8737. It must be served over HTTP, because `file://` blocks the JSON and
audio fetches. `tools/serve.py` is a small no-cache static server. Plain `python -m http.server`
also works, but it can drop connections during the initial asset burst and serve stale modules
after edits.

| | Player 1 | Player 2 |
|---|---|---|
| Move / aim | Arrow keys | WASD |
| Fire (B) | Z | F |
| Jump (A) | X | G |

Gamepads 1 and 2 map to the players (south = jump, east/west = fire). Enter/Esc starts and pauses,
F2 toggles the collider overlay and M mutes. Prone + jump drops through ledges.

## How it was made

- `tools/extract.py` reads `Contra_Data` with UnityPy. The build's typetrees are stripped, so it
  regenerates them from `Managed/*.dll` with TypeTreeGeneratorAPI. It writes `assets/`: sprite
  atlases and rects/pivots, MP3 audio, tilemap collision, and the full level3 scene and prefab
  hierarchies with every serialized field.
- `assets/anims.json` holds the `Animation2D`/`AnimatorController2D` clips exported from the same
  dumps.
- Game logic was ported from `Assembly-CSharp.dll`, disassembled to CIL with dnfile/dncil and
  hand-decompiled per class. Every class in `src/` names the Unity class it ports. Tuning values
  (speeds, HP, fire rates, timers) are read from the extracted prefab and scene data at runtime,
  not hardcoded.

Re-extract (needs `pip install UnityPy TypeTreeGeneratorAPI` and ffmpeg):

```bash
python3 -I tools/extract.py "/Users/sarthak/Downloads/Contra Multiplayer" assets
```

## Differences from the Unity build

- **Co-op is local** (same keyboard or gamepads) instead of Mirror networking. The camera follows
  the midpoint of the living players and keeps both on screen.
- **Rendering differences:** player 2 is hue-shifted, the HUD draws life medals as simple shapes,
  and the menu scenes (customize, online lobby) are replaced by a 1P/2P select on the title screen.
- **Victory/defeat** waits for Enter instead of returning to the menu after 5 s.

The art and music are Konami's. Keep this local.
