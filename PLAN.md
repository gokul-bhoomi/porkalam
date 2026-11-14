# Porkalam (போர்க்களம்)

Porkalam is a 1v1 browser fighting game inspired by Tamil and Indian mythology. Play solo against the computer or with a second player on the same screen. Matches take place on a sandbank in the Kaveri River and default to five minutes.

The two original fighters are **Mangulan (Mage)**, who controls space with magic and can take flight, and **Kanalan (Warrior)**, a fast archer who can jump over attacks. Either fighter can meditate to earn devotion and call on the gods for boons. Small boons cost four segments of devotion, and divine weapons cost eight.

## Design references

- [Ground rules](GROUND-RULES.md) define the shared mechanics and are locked.
- [Class rules](CLASS-RULES.md) describe Mages and Warriors.
- [Characters and boons](CHARACTERS.md) describe the fighters, their moves, and the gods' gifts.
- [README](README.md) links to the playable game and explains how to run it locally.

## Implementation

- The browser loads JavaScript modules directly and draws the game with Canvas.
- The deterministic simulation in `src/sim.js` advances in fixed 1/60-second steps. The renderer reads the simulation state.
- Character and boon definitions live in `src/chars/`. Shared tuning lives in `src/config.js`.
- Keyboard and gamepad input go through the same simulation. The computer opponent also produces input through those rules.
- `npm run verify` runs simulation and browser checks. The balance report and exploit hunter are available through `npm run balance` and `npm run hunt`.
