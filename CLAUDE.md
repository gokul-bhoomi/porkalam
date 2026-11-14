# Porkalam (போர்க்களம், "the battlefield"; formerly the working title Myth Fighter)

1v1 mythology fighting game: Krishna (God) vs Raja Raja Chola (King). Start with [PLAN.md](PLAN.md), then read [GROUND-RULES.md](GROUND-RULES.md), [CLASS-RULES.md](CLASS-RULES.md) and [CHARACTERS.md](CHARACTERS.md).

- The ground rules are **locked**. Never change a rule or its intent test without the owner's OK. If an intent test fails, your change goes against a design decision, so stop and ask.
- All amounts are percentages of the 100% bars. All times are in seconds.
- The tech mirrors `../euro-rush`: plain ES modules, canvas, deterministic `src/sim.js` with a fixed 1/60 s step, and `npm run verify`.
- Discuss design changes with the owner before building them.
- Balance (ground rule 16): after changing a move, a fighter or the computer player, run `npm run hunt` (exploit hunter: simple plans and a random search against the computer; `-- --quick` for a fast pass) and `npm run balance`. Neither is in `verify` yet because both still report known problems.
