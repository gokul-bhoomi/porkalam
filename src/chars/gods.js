// Boon lists per god. The game is inspired by Indian mythology: the real gods appear only as givers of boons.
// A fighter spends devotion (earned by meditating) on a boon from a random god: tiers[0] = small (4 segments),
// tiers[1] = divine weapon (8). Two levels, each worth the health lost sitting for it (owner, 2026-11-14: the
// medium level, Third-eye spark, Sudarshana Chakra and Lotus seat were removed). Divine weapons go through a meditation barrier.
// Each boon is a single-use move with the same fields as any other move.
export const GODS = {
  shiva: {
    name: 'Shiva',
    tiers: [
      // Tandava replaced the Damaru (owner, 2026-11-14): something more dramatic. An arena change (ground rule 12).
      // The opponent's half sinks and fills with lava: 2% a second on the ground there, until they jump or fly across.
      [{ id: 'tandava', name: "Shiva's Tandava", short: 'SPLITS THE ISLAND, LAVA ON THEIR HALF', desc: 'THE ISLAND SPLITS FOR 8 S: 10% DAMAGE, THEN THEIR HALF SINKS INTO LAVA (2% A SECOND UNTIL THEY JUMP OR FLY ACROSS)', kind: 'tandava', scene: true, range: 'anywhere', cost: { power: 0 }, req: {}, cast: 0.6, damage: 10, knockback: 0, time: 8, width: 14, lava: 2 }],
      [{ id: 'pashupatastra', name: 'Pashupatastra', short: '45% DAMAGE, THROUGH ANY BARRIER', desc: '45% DAMAGE FROM ANYWHERE, THROUGH ANY BARRIER', kind: 'projectile', divine: true, scene: true, range: 'anywhere', cost: { power: 0 }, req: {}, cast: 1, damage: 45, knockback: 160, speed: 300, radius: 7, life: 2, shape: 'fire' }],
    ],
  },
  murugan: {
    name: 'Murugan',
    tiers: [
      // Vel throw removed and Peacock Ride added (owner, 2026-11-21): Murugan's peacock carries the fighter through
      // the air for `time` s, fast, still attacking (ground rule 17: flying). No power drain; it lands when time is up.
      [{ id: 'peacock', name: 'Peacock Ride', short: 'FLY FAST FOR 5 S, STILL ATTACKING', desc: 'MURUGAN\'S PEACOCK CARRIES YOU THROUGH THE AIR FOR 5 S: FAST, AND YOU CAN STILL ATTACK', kind: 'ride', range: 'anywhere', cost: { power: 0 }, req: {}, cast: 0.3, damage: 0, knockback: 0, time: 5, lift: 0.3, speed: 115 }],
      [{ id: 'shakti', name: 'Shakti Vel', short: '40% DAMAGE, PIERCES ANY BLOCK', desc: '40% DAMAGE, PIERCES ANY BLOCK', kind: 'projectile', divine: true, scene: true, range: 'anywhere', cost: { power: 0 }, req: {}, cast: 0.6, damage: 40, knockback: 140, speed: 260, radius: 5, life: 2, pierceBlock: true, shape: 'spear' }],
    ],
  },
  brahma: {
    name: 'Brahma',
    tiers: [
      [{ id: 'kamandalu', name: 'Kamandalu', short: 'HEALS 18% HEALTH', desc: 'HEALS 18% HEALTH', kind: 'heal', range: 'anywhere', cost: { power: 0 }, req: {}, cast: 0.5, damage: 0, knockback: 0, heal: 18 }],
      // cast 5 -> 1.5 s (owner, 2026-11-15): only a little slower than the other divine weapons
      [{ id: 'brahmastra', name: 'Brahmastra', short: 'BOTH FIGHTERS FALL: A DRAW', desc: 'BOTH FIGHTERS FALL: THE MATCH IS A DRAW', kind: 'brahmastra', divine: true, scene: true, selfKO: true, range: 'anywhere', cost: { power: 0 }, req: {}, cast: 1.5, damage: Infinity, knockback: 0 }],
    ],
  },
  // Krishna joined as a boon god on 2026-11-08 (owner).
  krishna: {
    name: 'Krishna',
    tiers: [
      [], // Flute charm (2026-11-08) and Sudarshana Chakra (2026-11-14: Mangulan already has a chakra) removed
      [{ id: 'vishwaroopam', name: 'Vishwaroopam', short: '40% DAMAGE, WHOLE ARENA', desc: '40% DAMAGE ACROSS THE WHOLE ARENA', kind: 'global', divine: true, scene: true, range: 'anywhere', cost: { power: 0 }, req: {}, cast: 1, damage: 40, knockback: 60, strikeDelay: 0.4 }],
    ],
  },
  // Narada joined as a boon giver (owner, 2026-11-21): the travelling sage who stirs up mischief. His boon scrambles
  // all the opponent's controls at random (owner, 2026-11-21) for `time` s (a visible timed effect, ground rule 9); a hit that gets through ends it early.
  narada: {
    name: 'Narada',
    tiers: [
      [{ id: 'narada', name: "Narada's Mischief", short: 'SCRAMBLES ALL THEIR CONTROLS FOR 4 S', desc: 'EVERY CONTROL OF THE OPPONENT IS SCRAMBLED AT RANDOM FOR 4 S: BUTTONS SHUFFLED, STICK FLIPPED OR TURNED. A HIT ON THEM ENDS IT EARLY', kind: 'confuse', range: 'anywhere', cost: { power: 0 }, req: {}, cast: 0.3, damage: 0, knockback: 0, time: 4 }],
      [],
    ],
  },
};

export const findBoon = (id) => {
  for (const g of Object.values(GODS)) for (const t of g.tiers) for (const b of t) if (b.id === id) return b;
  return null;
};
