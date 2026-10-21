# Monster Brawl Club

A monster-card strategy battler: grow monsters, risk them in short fights where strategy rounds tilt a final spinning wheel, and spend nuggets to make them stronger. It's inspired by the mechanics of an old Flash game but uses only original names and art. The full design is in [`docs/build-spec.pdf`](docs/build-spec.pdf).

## Status

| Milestone | State |
| --- | --- |
| 1. Fight maths, no UI | ✅ done (`packages/shared`, 100% test coverage) |
| 2. Single-player fight vs a bot | next |
| 3. Monsters and accounts | |
| 4. Live PvP | |
| 5. Village and economy | |
| 6. Safety and polish | |

## Layout

```
apps/web          React client (placeholder until Milestone 2)
apps/server       Fastify + Socket.IO server (placeholder until Milestone 4)
packages/shared   fight maths shared by client and server
  src/balance.ts    every tunable number in the game
  src/strategy.ts   Attack > Defense > Tricks > Brains > Attack cycle, round resolution
  src/wheel.ts      starting split, round shifts with caps, the spin
  src/fight.ts      resolveFight: one call for a whole fight
  src/stakes.ts     Bite / Collect / Eat outcomes, XP and nugget rewards
  src/ai.ts         bot strategy picks
  src/fairness.ts   seed, commitment hash and roll for a verifiable spin
```

## Commands

```sh
pnpm install
pnpm test        # run all tests
pnpm coverage    # tests + coverage (shared package must stay at 100%)
pnpm typecheck
```

## Spec interpretations

Where the spec left a detail open, the code does this (all numbers are in `balance.ts`):

- **Shift cap**: the 0.30 cap applies to the running total after every round, so the wheel never shows more movement mid-fight than the cap allows. With at most 3 rounds this gives the same final share as capping only at the end.
- **Bite needs both players**: a stake pairing is valid when both pick Bite or neither does (`stakesAreValid`). Collect and Eat mix freely.
- **Bite floor**: a Bite never drops the loser below strength 1. Strength changes are rounded to whole numbers.
- **Eaten or collected monsters** keep their strength: the graveyard and resurrection rules use it later.
- **Equal strengths of 0** start the wheel at 0.5.
- **Verifiable spin**: the roll is SHA-256 of `"roll:" + seed`, while the published commitment is SHA-256 of the seed alone, so the commitment gives nothing away. The first 48 bits of the roll hash are divided by 2^48 to get a number in [0, 1).
- **Bots** usually pick between their two highest skills, weighted by skill value (ties broken in cycle order). 25% of picks are fully random.
