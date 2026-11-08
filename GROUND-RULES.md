# Ground rules (locked 2026-11-07)

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
  - a range requirement: close, mid/long, or anywhere. Long-distance special moves have no distance requirement.
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
- A defence lasts at most 3 seconds, then it disappears. Release block and press it again to raise a new one. (Added by the owner on 2026-11-07.)
- Each character has a defence strength and a defence type. Barriers, such as a wall of arrows that absorbs a set amount of damage, are a defence type.

## 6. Clashes
- Moves collide only when they touch on screen.
- Higher damage wins and still hits, reduced by the weaker move's damage.
- Equal damage: both moves are cancelled.
- Both fighters always pay their full cost.

## 7. Interruption
- Casting and meditation must be continuous. Any hit breaks them, and the cost is still spent.

## 8. Order within one instant
1. Movement.
2. New moves start.
3. Clashes are decided.
4. All damage and healing apply together.
5. Check for 0 health.

## 9. Temporary effects
- Slows, stuns and similar effects have a set duration and are visible on the fighter.
- The same kind doesn't stack. The strongest one counts.

## 10. Traps
- Traps are a basic move. Each fighter can have up to 3 active at the same time, and one comes back when one goes off.
- Planted trap: can only be set when close to the opponent. Explodes and deals damage.
- Water trap: a patch of ground turns to water and slows anyone in it.
- Each trap goes off after a random 5–30 seconds.
- Traps hurt anyone on them, including the fighter who set them.
- The cost is paid normally, when the trap is set.
- Not obvious: a trap is set during a normal close-range attack with the same animation, and floor scuffs from fighting look identical to traps.
- No controller vibration.

## 11. Boons
- A fighter can hold 1 boon at a time. (Changed from 3 by the owner on 2026-11-07.)
- A boon is used by pressing two special move buttons together. There is no separate boon button.
- When a boon is granted, both players see which one it was.

## 12. Extra units and arena changes
- Summoned helpers and copies have their own health, can be hit, and disappear when their timer ends.
- Only one arena change can be active at a time. It looks the same to both players and always has an end time.

## 13. Arena
- One round arena that fits on one screen and is always fully visible to both players.
- Nobody can fall off. The edge is an invisible wall, and getting knocked into it costs health.
- The arena never grows.

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
