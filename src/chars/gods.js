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
      [{ id: 'vishwaroopam', name: 'Vishwaroopam', short: '40% DAMAGE, WHOLE ARENA', desc: '40% DAMAGE ACROSS THE WHOLE ARENA', kind: 'global', divine: true, scene: true, range: 'anywhere', cost: { power: 0 }, req: {}, cast: 1, damage: 40, knockback: 60, strikeDelay: 0.4 },
        // Samudra Manthan (owner, 2026-11-22): the churning of the ocean. An arena change (ground rule 12) that works on
        // any arena: it turns into the milky ocean for `time` s, then the same arena comes back. Vishnu (as the turtle
        // Kurma) holds Mount Mandara up in the middle (solid), and gods and asuras pull the serpent Vasuki round it:
        // - the island spins (`spin`), switching direction every `flip` s; everyone slides with it, the caster too,
        //   and jumping or flying is no escape (owner 2026-11-22: a power on the scale of Brahmastra)
        // - Halahala poison bubbles drift in straight lines at the opponent (`bubbles`): shoot them or dodge them
        //   (they reach any height); each that hits leaves a poison mark
        // - one random treasure rises (`treasure`); the first fighter to touch it gets it: Kamadhenu heals, Airavata
        //   charges the other fighter, the Amrit pot cancels the next hit
        // - at the end Shiva rises and drinks the poison: the game pauses for his scene (`drink` s, ground rule 4),
        //   then the Halahala burns the opponent for a sure `burst.sure` (through any barrier or wall, at any
        //   height) and every mark bursts for `burst.per` more (owner 2026-11-22: a Brahmastra-scale power should
        //   hit hard: about 45% against a good dodger, 65% against one who stands still)
        { id: 'manthan', name: 'Samudra Manthan', short: '30%+ DAMAGE: THE OCEAN CHURNS', desc: 'THE OCEAN IS CHURNED: THE ISLAND SPINS, POISON DRIFTS AT THE OPPONENT (4% AND A MARK EACH: SHOOT OR DODGE IT), A TREASURE RISES FOR WHOEVER TOUCHES IT FIRST, THEN SHIVA DRINKS THE POISON: 30% TO THE OPPONENT AND 4% MORE FOR EVERY MARK', kind: 'manthan', divine: true, scene: true, range: 'anywhere', cost: { power: 0 }, req: {}, cast: 1, damage: 4, knockback: 0,
          time: 12.5, mountain: 16, spin: { from: 1.6, to: 8, speed: 0.4, flip: 2.1 },
          bubbles: { from: 2.4, to: 7.4, every: 0.85, speed: 50, radius: 6, life: 7 },
          treasure: { at: 4.2, until: 8, grab: 14, heal: 15, charge: 12, chargeKb: 220, amrit: 10 },
          shiva: 9, drink: 3.5, burst: { per: 4, sure: 30, pour: 1.3, gap: 0.35 } }],
          // the beats (fight time): 0-1.6 the ocean rises and Mandara crashes down; 1.6 the pull begins; 2.4 the
          // poison erupts; 4.2 the treasure; 8-9 the churning stops and the storm gathers; 9 Shiva rises and drinks
          // (his scene, `drink` s, game paused); then he pours the poison down (`pour` s), the sure hit lands and the
          // marks burst `gap` s apart; the arena comes back at `time`
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
