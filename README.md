# Super Contra for Browser

A JavaScript/Canvas port of Contra's Windows Unity build (Unity 2021.2 remake of NES Contra stage 1). Currently no co-op is there.

## Run locally

```bash
python3 tools/serve.py
```

Open http://127.0.0.1:8737. Serve it over HTTP, because `file://` blocks the JSON and audio
fetches. `tools/serve.py` is a small no-cache static server. `python -m http.server` also works,
but it can drop connections during the initial asset burst and serve stale modules after edits.

| | Keys |
|---|---|
| Move / aim | Arrow keys |
| Fire (B) | Z |
| Jump (A) | X |

The first gamepad also works (south = jump, east/west = fire). Enter or Esc starts and pauses,
F2 toggles the collider overlay, and M mutes. Prone + jump drops through ledges.

Phones and tablets show touch controls automatically. Play in landscape: drag the left
stick to move/aim/duck, hold **Fire** to shoot, and tap **Jump**. Movement, shooting, and
jumping work together. **Start / Pause / Resume** is at the top right; customization
stays available on the title screen and while paused. Turning to portrait or switching
away from the browser pauses a run; tap Resume after returning.

Starting requests fullscreen and a landscape orientation lock where the browser permits
it. Browsers that cannot lock orientation show a rotate prompt in portrait; turn the
device sideways. No installation is required. The game fits the visible browser height,
including browser bars and safe areas. To test from a phone on the same Wi-Fi, serve with
`python3 -m http.server 8737 --bind 0.0.0.0` and open the computer's LAN IP on port 8737.

Open **Customize** on the title screen or while paused to rebind the keyboard controls and
choose Commando, Viper, Ember, or Ghost. All characters share the same
abilities. Save applies keyboard changes immediately; character changes apply to the
next run. Choices are remembered in this browser. Restore defaults resets the current
tab; Cancel discards unsaved changes. Gamepad mappings stay fixed.

## Scoring

Each new 1% of forward progress earns 50 points, up to 5,000. Backtracking and
respawning never repeat progress points; winning completes any remaining progress.
Rifle soldiers earn 100 points, hiding rifle soldiers 200, and either turret 500.
Unarmed runners always earn **zero**, including endlessly spawned reinforcements.
Each boss gun destroyed directly earns 1,000; the core earns 5,000. Guns destroyed
automatically with the core do not count.

Victory adds a survival bonus of 3,000 / 2,000 / 1,000 for zero / one / two deaths.
The speed bonus is 2,000 for finishing within 120 seconds, then decreases by 20 per
additional whole second, reaching zero at 220 seconds. Pausing, customization,
loading, and result screens do not count toward gameplay time. Death keeps earned
points; defeat gives no survival or speed bonus. Points do not grant extra lives.

The HUD shows SCORE and HI; results show the breakdown, enemy kills (including
zero-point runners, excluding boss parts), deaths, and gameplay time. Personal bests
save immediately, even during losing runs, in this site's browser storage under
`contra.highscore.v1`. All characters share one record. Clearing site data removes
it; unavailable storage keeps the best for the current session only. Future scoring
rules use a new storage key so incompatible records are not compared.

Run the regression tests with `node --test tests/*.test.mjs`.

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

- **Single player only** for now. The Unity build's Mirror co-op will come back as online co-op;
  the game loop already keeps players in a list, so a second player only needs an input source.
- **Rendering:** the HUD draws life medals as simple shapes, and the title screen starts the game
  directly instead of going through the menu scenes (customize, online lobby).
- **Victory and defeat** wait for Enter instead of returning to the menu after 5 s.

