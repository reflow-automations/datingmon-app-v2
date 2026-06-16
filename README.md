# A WILD DATE?! 💘

A self-contained retro (GBA / Pokémon Gen-3 style) mini-game, made as a playful
warm-up for an upcoming date. Pure HTML/CSS/JS, no build step, no dependencies,
no external or copyrighted assets.

This is the "date edition": the two of you already have plans, so it is not about
matching. It is a fun hype piece that ends on the actual date plan.

## Make it for someone else (one place to edit)

Open `game.js` and edit the `CONFIG` block at the very top:

```js
const CONFIG = {
  player:     "Noon",
  day:        "Thursday",
  time:       "2 PM",
  venue:      "O'Leary's",
  place:      "Mall of the Netherlands",
  address:    "Kornoelje 114, Leidschendam",
  activities: ["a game of pool", "a drink", "maybe the arcade"],
};
```

The intro, the dialogue, the win screen and the date plan are all built from
those values, so changing the person, the place and the activity is a single edit.
The name also works from the URL if you want to override it: `/?name=Sophie`.

## The game

- **MATCH** lands the first hit and evolves into **FLIRT**; 3 hits win.
- **OVERTHINK / COLD FEET / CANCEL** never work. They only chip away at her nerves
  while ROGIER answers with charm. If her HP hits 0 it is GAME OVER (RETRY only,
  the PASS button runs away). Winning leads to a level-up and the date plan.

## Run locally

```bash
python -m http.server 8080
# open http://localhost:8080/
```

## Deploy (Vercel)

Framework preset **Other**, no build command. The included `vercel.json` rewrites
everything to `index.html`, so clean links work.

## Files
- `index.html` / `style.css` / `game.js` - the whole game (five states)
- `rogier.png` / `trainer.png` - character sprites (original art, transparent)
- `vercel.json` - SPA-style rewrite for clean URLs
