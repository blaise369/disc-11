# Monster Brawl Club

A browser game where players grow collectible monster cards, then risk them in short fights: secret strategy rounds tilt a two-colour wheel, and one spin decides the winner. It's inspired by the mechanics of an old Flash game, with an original name, original art and original text. The design is in [`docs/build-spec.pdf`](docs/build-spec.pdf).

All six milestones of the spec are built. The spec's parent accounts and parental controls were later removed: players sign up for themselves, and Collect/Eat stakes and trading are open to everyone.

| Milestone | What's in it |
| --- | --- |
| 1. Fight maths | `packages/shared`: strategy cycle, wheel split, round shifts, caps, spin, stakes, rewards, levels, growing, energy (Vitest, 100% coverage) |
| 2. Single-player fight | Practice fights against bots: four strategy buttons, 10-second timer, PixiJS wheel and spin |
| 3. Monsters and accounts | Postgres via Prisma, player sign-up, Monster Builder with ~60 layered SVG parts, Standard/Super/Xtreme tiers, collection |
| 4. Live PvP | Socket.IO challenges, simultaneous secret picks, committed seed hash and server-side roll, Bite/Collect/Eat stakes, graveyard, fight history |
| 5. Village and economy | Nugget ledger, potion shop, dojo timers, market, trader, Maths Sprint arcade, energy, daily missions, 10-region map ladder with boss bots |
| 6. Safety and polish | Phrase-only chat, block and report, sound, a finishing move for every body type, mobile layout |

## Running it

You need Node 20+, pnpm, PostgreSQL and Redis.

```sh
pnpm install
cp apps/server/.env.example apps/server/.env   # edit DATABASE_URL / REDIS_URL if needed
pnpm db:push                                     # create the tables
pnpm dev                                         # server on :3001, web on http://localhost:5173
```

Then open http://localhost:5173 and sign up.

Two pages outside the game are handy while developing: `/gallery` shows every monster part, and `/finishers` plays every finishing move.

For production: `pnpm build && pnpm start` serves the built web app from the game server on one port.

## Tests

```sh
pnpm --filter @mbc/shared coverage   # fight maths and rules: 100% coverage required
pnpm --filter @mbc/server test       # server integration tests (real Postgres + Redis, database mbc_test)
pnpm e2e                             # Playwright: a full PvP fight between two browsers
pnpm typecheck
```

The server tests and the e2e test use the `mbc_test` database (create it once: `createdb -O mbc mbc_test`). They create uniquely named players, so they don't need an empty database.

## Layout

```
apps/server        Fastify REST + Socket.IO, Prisma (prisma/schema.prisma), Redis
  src/realtime/      fight state machine (engine.ts) and socket handlers
  src/services/      fight resolution transaction, ledger, bots, monsters, energy
  src/routes/        auth, game, village, social
apps/web           React + Vite + Tailwind; PixiJS for the wheel and defeat animation
  src/art/           MonsterArt: layered SVG parts recoloured from the palette
  src/pages/         every screen; /gallery shows all parts
packages/shared    rules shared by client and server; every tunable number is in balance.ts
e2e/               Playwright two-browser fight
```

## Rare variants

Every grown monster rolls a variant. Variants give a permanent strength boost on the wheel at every level, on top of rarity: a shiny is always 1.5x the same monster without the shine.

| Variant | Chance | Boost | Look |
| --- | --- | --- | --- |
| ✨ Shiny | 1 in 200 | ×1.5 | Saturated, with twinkling sparkles |
| ☢️ Radioactive | 1 in 1,000 | ×2 | Pulsing green glow and rising particles |
| 🕳️ Void | 1 in 10,000 | ×3 | Swirling dark vortex and stars |
| 🌟 Celestial | 1 in 100,000 | ×5 | Colour-cycling body and a golden halo |

The base strength is what stakes, levels and the dojo change. The card shows the boosted strength. Market stock can roll variants too and is priced by boosted strength. Chances and boosts live in `balance.ts`.

## Finishing moves

After the spin, the winner's body type decides how the loser goes out (all cartoon). They're in `apps/web/src/components/finishers/`:

| Body | Move |
| --- | --- |
| Slime | Gloop Engulf: oozes over the loser, who dissolves in bubbles |
| Mechanoid | Grabber Arm: a telescopic arm clamps the loser, crushes them into a cube and flings it |
| Furball | Hairball Steamroller: rolls over the loser and flattens them like a pancake |
| Mutant | Toxic Burp: the loser turns green, shrinks and hops away |
| Beast | Ground Pound: leaps on the loser, shakes the arena, leaves dizzy stars |
| Bug | Swarm Lift: a swarm covers the loser and carries them off |
| Ghoul | Spooky Possession: a ghost flies in and the loser floats away |
| Rockling | Rockslide: a pile of rocks buries the loser |
| Sprout | Overgrowth: vines drag the loser underground and a flower blooms |
| Fishling | Tidal Wave: washes the loser away and leaves a flopping fish |
| Drake | Dragon Breath: the loser is toasted to an ash pile with blinking eyes |
| Cosmo | UFO Abduction: a tractor beam lifts the loser away |

## How a fight works

1. The challenger picks their monster, one of the opponent's monsters, a stake and 0 to 3 skill rounds.
2. The defender has 60 seconds to accept and pick their own stake. Bite only happens if both pick it; Collect and Eat can mix.
3. On accept, both monsters are locked, each player spends 1 energy, and the server publishes the SHA-256 hash of a secret seed.
4. Each round, both players pick Attack, Defense, Tricks or Brains in secret (10 seconds, or a random pick). Each strategy beats the next one in that order (Brains beats Attack); opposite pairs and mirrors go to the higher skill. The round winner gains wheel share.
5. The wheel spins using a roll derived from the seed. The seed is revealed afterwards, so anyone can check it against the hash (there's a "Verify now" button on the result screen).
6. Stakes, XP, nuggets, level-ups, potions used, mission progress and boss progress all commit in one database transaction.

## Where this differs from the spec, or fills a gap

- **Socket events**: instead of separate `fight:start`, `round:reveal`, `fight:spin` and `fight:result` events, the server sends one `fight:state` event with the whole fight view at every transition. The client still only ever sends picks, accept/decline and phrase ids.
- **Matchmaking**: there's no queue. The fight lobby lists online players in your region or one either side, plus online friends, and you challenge one directly.
- **Membership**: bought once with nuggets in the village (no real money). It gives a bigger collection and graveyard, 2 dojo slots and member-only parts, never fight power.
- **No parent accounts**: the spec's parent centre, play-time limits and parent approvals were removed.
- **Server restarts**: live fights are held in memory (with snapshots in Redis). On restart, unfinished fights are voided: monsters unlock and nobody loses anything.
- **Leaving a fight** after accepting counts as a loss with the stake applied, and the leaver gets no XP or nuggets.
- **Profile badges**: profile levels unlock the trader and dojo as specified; the cosmetic badges are not built yet.
- **Library versions**: pinned to Prisma 6, Vite 6 and Zod 3 (stable majors) rather than the newest ones.
- The other gaps (Bite floor, shift cap, bot picks) are listed in the code comments in `packages/shared`.
