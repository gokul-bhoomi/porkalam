# Porkalam (போர்க்களம்)

**Play it:** https://gokul-bhoomi.github.io/porkalam/ (GitHub Pages, served from `main`).

Siddhan (Mage) vs Veeran (Warrior), inspired by Indian mythology: one player against the computer or two players on one screen. Every ground rule, class rule and move from the docs works, drawn with the Codex art (or the grey-box shapes with `?grey=1`).

## Run it

```bash
npm run serve
```

Then open http://127.0.0.1:5174. Backquote (`) toggles fullscreen. Controllers: press any button to connect; pad 1 is P1 (Siddhan), pad 2 is P2 (Veeran). The title screen lists every control.

The title screen has **Play**, **Tutorial** and **Controls**. The **tutorial** is a practice fight against a training dummy, in 12 lessons that explain the screen and every move (walk, both attacks, block, the three specials, the signature, meditation, boons); the clock is stopped, nobody can be knocked out and your power is topped up, and the lessons that ask you to do something move on once you've done it. Afterwards you can keep practising. **Controls** (also in the pause menu) lets each player remap their keys and the pad buttons: pick a cell, press Enter, then the new key. A key that is already used swaps with the old one; Esc, M, 0 and ` are kept by the game. The bindings are saved in the browser (`localStorage`), and Reset to defaults puts them back. The table below shows the defaults.

On the setup screen pick **1 player vs CPU** (and the CPU level) or **2 players**, and the match length. Then the **character select** screen shows each fighter's card (painted by Codex, `art/card_<id>.png`) with every move, its buttons, cost and what it does; each player picks a fighter (in 1-player mode the CPU takes the other one, in 2-player mode both may pick the same). Press **down** there for the **Boons of the Gods** page. During a fight, the pause menu has **Moves & Boons**. In 1-player mode either key set, or pad 1, controls your fighter. The fight pauses itself if the window loses focus or goes into the background.

| Action | P1 keys | P2 keys | Pad |
|---|---|---|---|
| Move | WASD | Arrows | Left stick |
| Basic attack 1 (hold to charge the shot) | F | K | A |
| Basic attack 2 (close) | G | L | X |
| Block (hold, lasts up to 3 s) | H | ; | RB |
| Special 1 / 2 / 3 | R / T / Y | I / O / P | B / Y / LB |
| Signature (all three specials together) | R+T+Y | I+O+P | B+Y+LB |
| Meditate (down + special 1): fills devotion behind a barrier | S+R | ↓+I | Stick down + B |
| Two specials together: ask a god for a boon with devotion (4 = small, 8 = divine); it's revealed and held. Two specials again use the held boon | R+T (any two of R/T/Y) | I+O (any two of I/O/P) | B+Y (any two of B/Y/LB) |
| Pause | Esc | Esc | Start |
| Sound on/off | M | M | |

## Art

`art/` holds the art made with Codex image generation: `arena.png` (a sandbank on the Kaveri river at dusk) and two sprite sheets per fighter (`siddhan_*`, `veeran_*`), each 8 frames in a row on flat magenta: `*_sheet.png` (1-4 idle, 5-8 walk) and `*_actions.png` (ranged wind-up and release, close wind-up and strike, block, cast, hit, meditate; see `POSES` in `src/art.js`). `god_<name>.png` (and `_fg` figure layers) are the four boon gods, blessing; one appears over the arena when a small or medium boon is invoked. The `scene_<name>.png` paintings are the power-ups: the two signatures (with `_bg` backdrop and `_fg` figure layers) and the gods' divine weapons. During a power-up the game stays on screen, the camera closes in on the caster, and the painting replaces the world around the sand island (`sceneSky`, `sceneAura` and `sceneTitle` in `src/render.js`). `fx_sheet.png`, `fx2_sheet.png` and `fx_elephant.png` hold the effects: walls, every kind of shot, the Gaja Arrow's war elephant, bursts, sparks, arrow rain and the danger circle. `src/art.js` removes the magenta, finds the frames and lines up their feet. `art/arena.json` says where the arena floor is in `arena.png`, so the game lines up with the picture. If a file is missing, the game draws its grey-box shapes instead. Press `0` in game, or open `?grey=1`, to switch to the grey-box. The art for the earlier Krishna / Raja Raja Chola version is kept in `art/archive_v1/` and isn't used.

## Tests

```bash
npm run verify
```

`tests/intent.test.js` has one test per ground rule, class rule and agreed character rule. If one fails, the change goes against a design decision: ask the owner, don't edit the test. `tests/sim.test.js` checks each move's mechanics. `tests/ai.test.js` plays computer-vs-computer matches. `tests/smoke.mjs` plays the game in headless Chrome. It also renders every menu page and fails if any two pieces of text overlap or run off screen (every `txt` call is recorded when `window.__textLog` is set), and checks that a special or signature never shows the hurt pose.

## Layout

- `src/sim.js`: fight rules. Pure and deterministic, fixed 1/60 s step. Input = button states, output = match state.
- `src/chars/`: character sheets and moves (`siddhan.js`, `veeran.js`) and the gods' boon lists (`gods.js`). All numbers live here and in `src/config.js`.
- `src/render.js`: drawing on a 480x270 layout (canvas 1920x1080), with the art from `src/art.js` or grey-box shapes. Only reads the state.
- `src/ai.js`: the computer opponent. It only returns button states, so it plays by the same rules; it has its own random numbers so matches stay deterministic. Each level is a skill value (easy 0.15, normal 0.6, hard 0.9) blended between a novice and an expert, plus a per-fighter adjustment (`SKILL_ADJUST`) measured so the computer Mage and the computer Warrior are equally strong at each level.
- `src/audio.js`: music and sound, synthesized with Web Audio (no files; the owner chose not to download any): slow cinematic music (string pads in D minor, a bansuri-like flute, and in fights a heartbeat pulse with war drums every four bars), punchy low effects, and a great gong, deep choir and horns for boons and power-ups. It starts on the first key press.
- `src/input.js`: keyboard and gamepads. `src/main.js`: screens, loop and the `window.__game.debug` API.
