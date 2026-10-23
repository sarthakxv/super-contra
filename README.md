# Super Contra for Browser

A JavaScript/Canvas port of Contra's Windows Unity build (Unity 2021.2 remake of NES Contra stage 1). Currently no co-op is there.

## Run locally

```bash
python3 serve.py
```

Open http://127.0.0.1:8737. Serve it over HTTP, because `file://` blocks the JSON and audio
fetches. `tools/serve.py` is a small no-cache static server. `python -m http.server` also works,
but it can drop connections during the initial asset burst and serve stale modules after edits.

| | Player 1 | Player 2 |
|---|---|---|
| Move / aim | Arrow keys | WASD |
| Fire (B) | Z | F |
| Jump (A) | X | G |

Gamepads 1 and 2 map to the players (south = jump, east/west = fire). Enter or Esc starts and
pauses, F2 toggles the collider overlay, and M mutes. Prone + jump drops through ledges.

## How it was ported for browser

- `tools/extract.py` reads `Contra_Data` with UnityPy. The build's typetrees are stripped, so the
  script regenerates them from `Managed/*.dll` with TypeTreeGeneratorAPI. It writes `assets/`:
  sprite atlases and rects/pivots, MP3 audio, tilemap collision, and the full level3 scene and
  prefab hierarchies with every serialized field.
- `assets/anims.json` holds the `Animation2D`/`AnimatorController2D` clips exported from the same
  dumps.
- I ported the game logic from `Assembly-CSharp.dll`, disassembled to CIL with dnfile/dncil and
  hand-decompiled per class. Each class in `src/` names the Unity class it ports. The game reads
  tuning values (speeds, HP, fire rates, timers) from the extracted prefab and scene data at
  runtime.


## Differences from the Unity build

- **Co-op is local** (same keyboard or gamepads) instead of Mirror networking. The camera follows
  the midpoint of the living players and keeps both on screen.
- **Rendering:** player 2 is hue-shifted, the HUD draws life medals as simple shapes, and a 1P/2P
  select on the title screen replaces the menu scenes (customize, online lobby).
- **Victory and defeat** wait for Enter instead of returning to the menu after 5 s.

