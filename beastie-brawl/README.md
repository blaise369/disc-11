# Beastie Brawl

A browser monster-fighting game in the spirit of the old 2010s monster-battler web games, with its own name, art and rules.

**To play, open `index.html` in any modern browser.** There's no install or build step and no server needed.

## How it plays

- **Hatch** a beastie. Every egg is a randomly generated monster (body, eyes, mouth, horns, pattern and colours). Re-roll until you love one, then name it.
- **Fight**: pick an Easy, Fair or Tough opponent. Battles are turn-based:
  - Choose a move. Moves cost ⚡ energy, which refills 15 per turn. Jab is free and gives energy back.
  - **Power up**: stop the needle in the green zone. Hitting the zone exactly is a *Crushing Blow*.
  - **Block**: when the foe attacks, stop the needle in the green to cut the damage by up to 60%.
  - Use 🍖 Swamp Snacks or 🧃 Zap Juice from your bag (this takes your turn).
- **Level up**: wins give XP and 🦷 fangs (the in-game money). Win streaks give bonus fangs. Every level gives you 3 stat points.
- **Train** in three mini-games: Boulder Bash (button mashing) for Strength, Fly Swatter (fast clicking) for Agility, and Rock Catch (timing) for Toughness.
- **Shop**: learn new moves (stun, life-drain, multi-hit, energy-sapping), buy items and buy hats for your beastie.
- Equip up to 4 moves and swap hats in your **Lair**.

## Stats

| Stat | Effect |
| --- | --- |
| 💪 Strength | +7% damage per point |
| ⚡ Agility | Better hit/dodge odds and a wider green zone on the meters |
| 🛡️ Toughness | +6 max HP and 2.5% damage reduction per point (up to 55%) |

## Tech

Plain HTML, CSS and JavaScript with no dependencies. Monster art is drawn as SVG in code (`js/art.js`), sound effects are synthesized with WebAudio, and progress saves to `localStorage`.

```
index.html      screens and layout
css/style.css   all styling and animations
js/data.js      moves, items, hats, names (tweak balance here)
js/art.js       procedural monster + hat renderer
js/game.js      game logic: save, battle engine, training, shop
```
