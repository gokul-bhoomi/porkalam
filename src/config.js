// Every amount is a percentage of a 100% bar. Every time is in seconds.
// World units: the arena is a circle of radius ARENA.r around (0, 0). The renderer squashes y for a 3/4 view.
export const W = 480, H = 270;   // game layout units
export const RES = 4;             // the canvas is W*RES x H*RES (1920x1080) so the art stays sharp
export const STEP = 1 / 60;

// Arena radius: 110 -> 121, 10% larger (owner, 2026-11-08): more room to move and plan. Per arena (owner, 2026-11-16):
// the river island stays 121, the battlefield is 15% larger (139) and drawn bigger on screen (render.js fitView) so
// fighters keep their size. ARENA.r is set for the arena being played (art.js loadArt); 121 is the default.
export const ARENA = { r: 121, sizes: { river: 121, battlefield: 139 } };

// Class rule: power bar size and refill speed are the same for every class.
export const POWER = { size: 100, refill: 3.4 }; // % of the bar, % per second (4 -> 3.4, owner 2026-11-08: slower pace)

// Range requirements, as [min, max] distance between the two fighters (world units).
export const RANGES = {
  close: [0, 40],
  mid: [30, 150],
  midlong: [30, Infinity],
  long: [30, Infinity],
  anywhere: [0, Infinity],
};

export const TUNE = {
  // Overall pace (owner, 2026-11-08: the game felt rushed): fighters walk and every shot flies at this share of
  // the speed in the character sheets.
  pace: { move: 0.85, shot: 0.85 },
  match: { default: 300, min: 60, max: 600 },
  fighterR: 8,
  startX: 82,           // fighters start this far left/right of the centre (scaled with the arena)
  startPower: 0.5,      // half power at the start
  kbFriction: 6,        // knockback speed fades by e^-6 per second
  wallKb: 60,           // knocked into the wall faster than this = wall damage
  wallDmg: 4,
  // Block builds a wall in front of the fighter. It grows while block is held (prepMult x faster while the
  // opponent prepares an attack), for at most buildTime s. When block is let go, the wall stays where it is,
  // at the size it reached, for standTime s.
  block: { prepMult: 2, buildTime: 3, standTime: 3, gap: 14, halfWidth: [8, 20], maxWalls: 3 }, // up to 3 walls standing at once
  quickShot: 0.5,       // a basic shot charged less than this (0-1) is 'quick': two quick shots pass each other (rule 6)
  chord: 0.08,          // special buttons pressed within this time count as one combo (boon / signature)
  // Meditation (ground rule 11, owner 2026-11-08): fills a devotion bar of `segments` parts, segTime s each,
  // wherever the opponent is (`dist` is only how far the computer likes to be before it starts). Only full segments count. A barrier of `barrier` strength
  // goes up around the meditating fighter each sitting. It soaks only part of each hit: `leak` of it still reaches health
  // (owner, 2026-11-14: the barrier worked as extra health, so sitting far away won). Boons cost `tiers` segments: small, divine weapon (owner, 2026-11-14: two levels, 8 segments).
  meditate: { dist: 90, cost: 2, segments: 8, segTime: 2.5, barrier: 25, leak: 0.5, tiers: [4, 8] },
  // Brahmastra (a draw) is rare unless the caster is near the end of their health (owner, 2026-11-08):
  // its weight against the other divine weapons (weight 1 each) by the caster's health.
  // (weights against 3 other divine weapons: about 5% above 35% health, 20% at 15-35%, 50% at 15% or less)
  brahmastraOdds: [{ hp: 15, w: 3 }, { hp: 35, w: 0.75 }, { hp: 100, w: 0.16 }],
  // A Brahmastra hangs in the sky this long before its sun lands; both fighters are held. If the other fighter's
  // Brahmastra was already being cast when the first finished casting, it still goes off, and Shiva takes both back (owner, 2026-11-15).
  brahmastraFall: 6.6,
  // Recovery (ground rule 16, owner 2026-11-13: no spamming): after an attack goes off, its user can't start
  // another move for this many seconds. Not a cooldown: no move is locked, the fighter is briefly busy.
  // They can still walk and block. Blink and meditation are not attacks and have none.
  recover: { basic: 0.35, special: 0.6 },
  // Height (ground rule 17, owner 2026-11-14): jumping is a short low hop, flying is held until landing.
  // land: the pause after touching down; jump/fly specifics live on the moves themselves.
  air: { land: 0.2, chasmPush: 120 },
  scene: 2.5,           // dramatic scene length for power moves; the whole game pauses
  // Rough ground (ground rule 13, owner 2026-11-15): a heavy hit leaves a crater, a power move a big crater, being
  // knocked into the edge a wet patch. Walking through one is `slow` slower while it lasts (`life` s); jumping,
  // flying and knockback aren't slowed. r = its radius in world units; a fighter is in it once their feet (`feet`) touch it.
  rough: {
    slow: 0.3, feet: 3, max: 30,
    crater: { minDmg: 8, r: 8, perDmg: 0.15, maxR: 12, life: 60 },
    impact: { r: 19, life: 90, moves: ['Gaja Arrow', 'Pashupatastra', 'Shakti Vel', 'Vishwaroopam'] },
    wet: { r: 8, life: 20 },
  },
};
