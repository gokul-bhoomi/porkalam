# Myth Fighter: grey-box

Krishna (God) vs Raja Raja Chola (King) with plain shapes and no art. Every ground rule, class rule and move from the docs works, so a full match can be played and tuned.

## Run it

```bash
npm run serve
```

Then open http://127.0.0.1:5174. Backquote (`) toggles fullscreen. Controllers: press any button to connect; pad 1 is P1 (Krishna), pad 2 is P2 (Raja Raja Chola). The title screen lists every control.

| Action | P1 keys | P2 keys | Pad |
|---|---|---|---|
| Move | WASD | Arrows | Left stick |
| Basic attack 1 (hold to charge the shot) | F | K | A |
| Basic attack 2 (close) | G | L | X |
| Block (hold, lasts up to 3 s) | H | ; | RB |
| Hold + basic 2: planted trap | Q | U | RT |
| Hold + basic 2: water trap | E | J | LT |
| Special 1 / 2 / 3 | R / T / Y | I / O / P | B / Y / LB |
| Signature | V | M | D-pad up |
| Class (Meditate / Brahmastra) | B | , | D-pad left |
| Use boon (two specials together) | R+T (any two of R/T/Y) | I+O (any two of I/O/P) | B+Y (any two of B/Y/LB) |
| Pause | Esc | Esc | Start |

## Tests

```bash
npm run verify
```

`tests/intent.test.js` has one test per ground rule, class rule and agreed character rule. If one fails, the change goes against a design decision: ask the owner, don't edit the test. `tests/sim.test.js` checks each move's mechanics. `tests/smoke.mjs` plays the game in headless Chrome.

## Layout

- `src/sim.js`: fight rules. Pure and deterministic, fixed 1/60 s step. Input = button states, output = match state.
- `src/chars/`: character sheets and moves (`krishna.js`, `rajaraja.js`) and the gods' boon lists (`gods.js`). All numbers live here and in `src/config.js`.
- `src/render.js`: grey-box drawing on a 480x270 canvas. Only reads the state.
- `src/input.js`: keyboard and gamepads. `src/main.js`: screens, loop and the `window.__game.debug` API.
