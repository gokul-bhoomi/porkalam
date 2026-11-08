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
- No cooldowns.
- A move can bring its own user to 0 health only if that move explicitly says so.
- Attacks automatically turn toward the opponent. Projectiles fly in a straight line and can be dodged by moving.
- Power moves get a short dramatic scene. The game pauses for both players while it plays.

## 5. Defence
- Block: hold it to reduce damage.
- Holding block longer while the opponent prepares an attack makes the block stronger.
- Block builds a wall in front of the fighter, who stands still while building (at most 3 seconds). When block is let go, the wall stays where it is, at the size it reached, for 3 seconds, then disappears. The fighter can move away. The wall only protects what's behind it. Several walls can stand at once (up to 3); each stays for its own 3 seconds, and placing a new one elsewhere doesn't remove the others. (Owner, 2026-11-07; several walls 2026-11-08.)
- Each character has a defence strength and a defence type. Barriers, such as a wall of arrows that absorbs a set amount of damage, are a defence type.

## 6. Clashes
- Moves collide only when they touch on screen.
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
- Meditation fills a **devotion bar of 10 segments**, wherever the opponent is (owner, 2026-11-08: a nearby opponent can't stall it; they have to break the barrier). **Only full segments count**: stopping, or having the barrier broken, loses the part-filled segment. Full segments are kept.
- While meditating, a **barrier** goes up around the fighter automatically. Ordinary hits drain the barrier instead of health and don't interrupt. If the barrier breaks, meditation ends, and what the barrier couldn't hold gets through.
- **Divine weapons** (the top boons, such as Pashupatastra) go straight through a barrier and break the meditation.
- Devotion is spent by pressing **two special move buttons together**. There is no separate boon button. It buys the biggest boon it pays for: **3 segments = a small boon, 6 = a medium boon, 10 = a divine weapon**, from a **random god**. The boon goes off straight away. Brahmastra (which ends the match in a draw) is rare at good health and much more likely when the caster's health is near the end.
- When a boon is invoked, both players see which one it was and which god gave it.

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
