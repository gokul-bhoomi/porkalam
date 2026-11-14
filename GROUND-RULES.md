# Ground rules (locked 2026-11-07, owner changes 2026-11-08)

These rules apply to every fighter, whatever their class. They are fixed. When code exists, each rule gets an intent test (like Euro Rush's `tests/intent.test.js`). If a change breaks one of these rules, stop and ask the owner. Don't change the rule or its test without the owner's agreement.

## 1. Health
- Starts at 100%, which is also the maximum. Healing can never go above it.
- Never refills on its own. Only certain moves restore it.
- 0 health = loss.

## 2. Power
- Refills over time at a constant rate, the same at any health level.

## 3. Match
- 5 minutes by default, adjustable up to 10.
- At time-up, higher health wins. Equal health = draw.
- Both fighters reach 0 at the same moment = draw.
- Start: opposite sides of the arena, full health, half power.

## 4. Moves
- Every move has:
  - a cost: power only, or power + health. Basic moves cost very little power.
  - requirements: minimum health and/or power.
  - a range requirement: close, mid/long, or anywhere. Long-distance special moves have no distance requirement. Basic attacks always go off: their range is how far they reach, so out of range they just fall short (owner, 2026-11-08).
  - a cast time.
  - damage. Damage is also the move's strength in a clash.
  - knockback.
- No cooldowns. (The short recovery after an attack, rule 16, is not a cooldown: no move is locked, the fighter is briefly busy.)
- A move can bring its own user to 0 health only if that move explicitly says so.
- Attacks automatically turn toward the opponent. Projectiles fly in a straight line and can be dodged by moving. Exception (owner, 2026-11-08): a boon's attack always finds the opponent. It homes in, can be used from any distance, and walls don't stop it; only another attack or boon meeting it can weaken or cancel it (rule 6).
- Every shot has a full-strength distance and does its full damage within it. Past that distance it weakens, down to half (it keeps its own reach and life). Boons always hit at full strength. (Owner, 2026-11-14: arrows from the far edge hit as hard as from close up, so a fast fighter could win by poking from far away. Owner, 2026-11-14: the mantra bolt weakens too, past 80 to half by 150; at full damage to its reach it out-traded the arrow at long range.)
- Power moves get a short dramatic scene. The game pauses for both players while it plays.

## 5. Defence
- Block: hold it to reduce damage.
- Holding block longer while the opponent prepares an attack makes the block stronger.
- Block builds a wall in front of the fighter, who stands still while building (at most 3 seconds). When block is let go, the wall stays where it is, at the size it reached, for 3 seconds, then disappears. The fighter can move away. The wall only protects what's behind it. Several walls can stand at once (up to 3); each stays for its own 3 seconds, and placing a new one elsewhere doesn't remove the others. (Owner, 2026-11-07; several walls 2026-11-08.)
- Each character has a defence strength and a defence type. Barriers, such as a wall of arrows that absorbs a set amount of damage, are a defence type.

## 6. Clashes
- Moves collide only when they touch on screen.
- Two **quick basic shots** (tapped, or charged less than halfway) fly past each other. A charged shot, a special or a boon still meets whatever it touches. (Owner, 2026-11-14: otherwise a stream of quick shots cancelled every shot coming the other way, so whoever fired more often won a shooting duel, which rewards spamming, rule 16.)
- Higher damage wins and still hits, reduced by the weaker move's damage.
- Equal damage: both moves are cancelled.
- Both fighters always pay their full cost.

## 7. Interruption
- Casting must be continuous. Any hit breaks it, and the cost is still spent.
- Meditation is protected by its barrier (rule 11): ordinary hits land on the barrier and don't break it. A divine weapon, or breaking the barrier, ends it. (Owner, 2026-11-08.)

## 8. Order within one instant
1. Movement.
2. New moves start.
3. Clashes are decided.
4. All damage and healing apply together.
5. Check for 0 health.

## 9. Temporary effects
- Slows, stuns and similar effects have a set duration and are visible on the fighter.
- The same kind doesn't stack. The strongest one counts.

## 10. Traps (removed)
- There are no traps: no trap buttons, no hidden traps, floor scuffs or water patches. (Removed by the owner on 2026-11-08 to keep the game simple.)

## 11. Meditation, devotion and boons (owner, 2026-11-08)
- Every fighter, of any class, can meditate (down + special 1). They can't move while meditating.
- Meditation fills a **devotion bar of 8 segments** (10 until owner, 2026-11-14), wherever the opponent is (owner, 2026-11-08: a nearby opponent can't stall it; they have to break the barrier). **Only full segments count**: stopping, or having the barrier broken, loses the part-filled segment. Full segments are kept.
- While meditating, a **barrier** goes up around the fighter automatically, fresh each sitting. Ordinary hits drain the barrier and don't interrupt, but the barrier only soaks **half** of each hit: the other half still reaches health. (Owner, 2026-11-14: a barrier that soaked whole hits worked as extra health, so sitting far away and meditating won; the earlier carry-over between sittings is no longer needed, because sitting again under fire now costs health.) If the barrier breaks, meditation ends, and what the barrier couldn't hold gets through.
- A wall the fighter built stays standing for as long as they meditate (owner, 2026-11-14); hits still wear it down. Sitting behind a wall is how to meditate against a fast opponent; ground attacks, going round the wall and piercing moves are the answers.
- **Divine weapons** (the top boons, such as Pashupatastra) go straight through a barrier and break the meditation.
- Devotion is spent by pressing **two special move buttons together**. There is no separate boon button. It asks for the biggest boon it pays for: **4 segments = a small boon, 8 = a divine weapon** (owner, 2026-11-14: two levels, each worth the health lost sitting for it; there was a medium level), from a **random god**. The god appears and **reveals the boon, which is then held**. Two specials again **use it, now or any time later**. A fighter holds **one boon at a time**; while holding one, two specials use it rather than asking for another, and devotion keeps banking. (Owner, 2026-11-08.) Brahmastra (which ends the match in a draw) is rare at good health and much more likely when the caster's health is near the end.
- When a boon is offered, and again when it is used, both players see which one it is and which god gave it.

## 12. Extra units and arena changes
- Summoned helpers and copies have their own health, can be hit, and disappear when their timer ends.
- Only one arena change can be active at a time. It looks the same to both players and always has an end time.

## 13. Arena
- One round arena that fits on one screen and is always fully visible to both players.
- Nobody can fall off. The edge is an invisible wall, and getting knocked into it costs health.
- The arena never grows. (Its size was set 10% larger by the owner on 2026-11-08, for more room to move and plan.)

## 14. Screen and controls
- One shared screen, and nothing is hidden by the screen. Both power bars are visible.
- Must be fully playable on a controller. Every fighter uses the same button layout.

## 15. Character sheet
Every fighter is defined by:
- health (always 100%)
- power bar size
- power refill speed
- movement speed
- defence strength
- defence type
- basic moves, each with a range
- special moves, a signature move, and a class ability

## 16. Balance (owner, 2026-11-13)
Every fighter is about equally strong. There are no weak characters. You win with anyone by using the opponent's weakness, with the right combination of moves and timing. This holds however big powers get later (splitting or lifting the arena included).
- **Same budget.** Every fighter spends the same budget across the same traits: range, speed, defence, control and burst damage. A strength in one is paid for in another. A slow fighter blocks better, and a fast fighter hits lighter.
- **No spamming.** After an attack goes off, its user recovers before they can start another move: 0.35 s after a basic attack, 0.6 s after a special. They can still walk and block. Blink and meditation are not attacks and have no recovery.
- **No one-button win.** Pressing one move over and over must lose to a player who uses the whole move set.
- **The harder a move is to avoid, the weaker it is.** A slow, dodgeable shot can hit hard; a close hit you can't escape once caught should be a "get off me" tool.
- **Survival checklist.** Every fighter has at least one answer to: being rushed up close, being shot at from range, a slow cast or hold coming, the opponent meditating, and a big power coming at them.
- **Measured, not guessed.** Computer players play every pair of fighters at equal skill. Outside 45–55% wins the pair fails; outside 47–53% it gets a warning. Final tuning comes from real players.

## 17. Height (owner, 2026-11-14)
A fighter is on the ground, **jumping** (a short, low hop) or **flying** (high, until they land). What reaches them:

| Attack | On the ground | Jumping | Flying |
|---|---|---|---|
| Melee | hits | misses | misses |
| Ground attacks (arrow rain) | hit | miss | miss |
| Shots | hit | miss (they pass under) | hit, weakening with distance as usual (rule 4) |
| Homing moves and boons | hit | hit (a homing shot turns and finds you after you land) | hit |
| Whole-arena moves | hit | hit | hit |

- Nobody can block or meditate off the ground.
- Touching down after a jump or a flight gives a short landing pause, like the recovery after an attack (rule 16).
- Flying costs power every second it lasts; with no power left, the fighter lands.
- A chasm or other ground-only arena change (rule 12) stops fighters on the ground; jumping or flying crosses it.

