# Myth Fighter: build plan

"Myth Fighter" is a working title, and the final name comes later. This file is the handover for a new session. Read it first, then the three rule files.

## The game in one paragraph
A 1v1 fighting game inspired by Tamil and Indian mythology. Fighters belong to classes: **Gods** (strong magic, slow body), **Kings** (fast warriors with one weapon who meditate for boons from gods), and later **Monsters** (both magic and body; not in this version). The view is a top-down / 3/4 pixel-art round floating arena on **one shared screen**. The visual reference is an isometric arena brawler screenshot: a round stone arena floating in the clouds, with a waterfall and chains. It's played as couch 2-player on a TV with controllers, and online play may come later. Matches are tactical, 5 minutes by default (adjustable up to 10).

**First matchup: Krishna (God) vs Raja Raja Chola (King, bow).**

## Source of truth (read these)
- [GROUND-RULES.md](GROUND-RULES.md): **locked** fundamentals for every fighter. Never change them without the owner's OK.
- [CLASS-RULES.md](CLASS-RULES.md): the God and King class rules.
- [CHARACTERS.md](CHARACTERS.md): Krishna and Raja Raja Chola. Moves, blocks, boons.

## Decisions to respect
- **Units:** every damage, cost, heal and amount is a **percentage** of the 100% health or power bar. Every time is in **seconds**.
- **Intent tests:** every ground rule (and the agreed class and character rules) gets an intent test, like Euro Rush's `tests/intent.test.js`. If a change makes an intent test fail, stop and ask the owner. Don't edit the test to make it pass.
- **Signature moves** have a ~4 s cast. The fighter can't move or block, any hit breaks it, and the cost is still spent. Brahmastra has a ~5 s chant.
- **Out of this version on purpose:** Monster class, Krishna's arena changes (Yamuna flood, Maya), Call a King, praying to Krishna, Kotravai. The class rules still allow these later.
- **Names:** English names for now (God, King, power, boon). The owner prefers Tamil-origin names, but they're decided later.
- **Working style:** discuss design first and build only after the owner says go. Show things in the browser early. The owner gives short typed feedback that sometimes arrives cut off, so ask for the missing part.

## Tech
Same base as Euro Rush (`../euro-rush`), so reuse its patterns:
- Plain browser ES modules, 2D canvas, **no build step**. Gamepad API plus keyboard. WebAudio for sound later.
- **Fight logic is separate from drawing.**
  - `src/sim.js` is pure and deterministic, with a fixed 1/60 s step. Its input is both players' button states, and its output is the game state.
  - Rendering only reads the state.
  - This makes intent tests easy, makes online play possible later (by sending only inputs), and lets the renderer be swapped (for example to PixiJS) without touching the rules.
- **Data-driven characters.** Each character is a data file:
  - character sheet: power size, refill speed, movement speed, defence strength and type
  - basic moves and special moves
  - every move: cost, requirements, range, cast time, damage, knockback
- Gods' boon lists are data too. Adding a character should mean adding a data file plus art.
- **Low-resolution canvas** (like Euro Rush's 480x270), scaled up crisply.
- **Tests:**
  - `node --test` for the fight logic and intent tests
  - a headless-browser smoke test (Euro Rush uses playwright-core)
  - `npm run verify` runs both
- **Controller layout,** the same for every fighter:
  - stick to move
  - basic attack 1, basic attack 2, block
  - hold a trigger during the close basic attack to set a trap
  - special move buttons
  - signature move
  - class button (meditate for a King, Brahmastra for a God)
  - use boon

## Build order
1. **Grey-box prototype (start here).** A "grey-box" is the game played with plain shapes and no art:
   - coloured circles for the fighters on a round arena
   - simple shapes for arrows, the chakra, traps and blocks
   - text labels for casts
   - the HUD (health, power, timer, boons)

   Every ground rule, class rule and move works, so you can play a full match and tune the numbers before spending any time on art. Done when two people can play a full Krishna vs Raja Raja Chola match on one screen with controllers or keyboard, and `npm run verify` passes, intent tests included.
2. **Tune the numbers with the owner** by playing. Watch for: running away being too strong, trap hiding working (floor scuffs often enough), and signature and meditation timings.
3. **Art test, alongside or right after the grey-box:** one arena, plus Krishna idle and walk in one direction, to check whether the reference quality is reachable.
   - Codex image generation is good for arenas, portraits and illustrations.
   - In-fight animation frames need consistency, so try pixel-art animation tools (e.g. PixelLab), AI frames cleaned up in Aseprite, or body-part animation in code.
4. **Art pass:**
   - pixel sprites about 40–48 px tall
   - 4 directions with left and right mirrored
   - 2–4 frames per action (idle, walk, attack 1, attack 2, block, cast, hit, meditate)
   - code-driven feel: hit flashes, squash and stretch, screen shake, freeze-frames, particles, the growing Govardhana hill and arrow wall
5. **Dramatic power-move scenes (cut-ins)** for Vishwaroopam, Tiger Arrow and Brahmastra:
   - 3–4 Codex illustrations per move, all made from one character reference image, and split into layers (character and background) for depth
   - put together with code-driven zooms, pans, flashes, shake and particles, like a motion comic
   - the game pauses for both players while a scene plays
   - no frame-by-frame animation needed
6. **Sound and music.**

## Later (not now)
Monster class, more gods and kings, arena changes and Call a King for Krishna, final Tamil names, online play.
