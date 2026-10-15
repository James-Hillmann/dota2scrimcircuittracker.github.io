# Dota 2 Scrim Circuit Tracker

Static site (GitHub Pages) + Firestore + one Cloudflare Worker. No framework, no bundler.
Vanilla ES modules under `public/`. Tests in `test/` (`npm test`). Dev server: `node server.js` (port 3000).

## Read less (usage)

- Docs are big. Never read them whole. `grep -n "^## " docs/features.md` for the heading, then read that section only.
  - `docs/features.md` (68 KB): what each page does. `docs/maintaining.md` (27 KB): layout, sync, deploy, rules.
  - Ideas and audits are in `docs/ideas/`. Open one only when the task names it.
- Grep first, read a range second. Don't open a file over ~500 lines in full.
- Never open (grep only if you must): `public/style.css` (377 KB), `public/lib/abilities-data.js`,
  `card-art-data.js`, `screen-art-data.js`, `heroes-data.js`, `items-data.js`, `team-logo-data.js` (generated),
  `public/data/*.json` (synced data), `package-lock.json`. Denied in `.claude/settings.json`: logs, `_site`, `.wrangler`, `_dev`, screenshots.
- Don't re-explore. Use the map below to go straight to the file.
- Small edits: no subagents. Use one only for a sweep across many files.
- Every turn re-sends the whole conversation, so keep threads short. When a request is unrelated to the
  current thread, say so in one line and suggest a new session instead of continuing here.
- Small edits (a text change, a CSS tweak, a one-line fix) don't need high effort or a large model.
  Say so if the session is set higher than the task needs.
- Skip the preview, screenshot and browser loop when a change isn't visual (logic, data, workers, docs, tests).
  Run `npm test` or the relevant script instead.

## Testing

- Keep the dev server (`scrim-league`, localhost:3000) running at all times. Start it at the beginning of work if it's down. Never stop it.
- After any change the user can see, end with clickable localhost links to the exact pages to test, e.g. http://localhost:3000/#/all/heroes?tab=tiers.

## Site map

Router: `route()` in `public/app.js`. Hash URLs. `core.js` is shared helpers and loads first.

| URL | Page file | Notes |
|---|---|---|
| `#/` | `app.js` routeHub | league hub |
| `#/<division>` (champion, heroic, conqueror, warrior, challenger, voyager, explorer) | `pages/standings.js`, `pages/teams.js` | standings, matches, teams grid |
| `#/<division>/players`, `/player/<id>` | `pages/players.js`, `pages/player.js` | tabs list: `lib/pagetabs.js` |
| `#/<division>/heroes`, `/hero/<id>` | `pages/heroes.js`, `pages/hero.js` | |
| `#/<division>/content` (old `/week`) | `pages/week.js` | the Content tab |
| `#/<division>/game/<id>` | `pages/games.js` | game page |
| `#/<division>/cards`, `/gallery` | `pages/gallery.js` | |
| `#/<division>/predict`, `/drafter`, `/upload`, `/edit/<id>` | `pages/predict.js`, `drafter.js`, `upload.js` | load on first visit |
| fantasy: opened from `pages/predict.js`, not routed in `app.js` | `pages/fantasy.js` | Steam sign-in via Worker |
| `#/scrims/...` | `pages/games.js` + same pages | scrims, `/match/<id>` |
| `#/stats`, `#/privacy`, `/<division>/search` | `pages/stats.js`, `privacy.js`, `search.js` | |

Where logic lives:
- `public/parts/` page pieces shared by pages (feed, tiers, combat, lanes, items, draft, collection, me).
- `public/lib/` logic with no page code, tested in `test/`. Features by name: see "Where features live" in `docs/maintaining.md` (Code layout).
- `public/style.css` all styles. Search it with grep for the class name.
- `workers/steam-auth/src/`: `index.js` (routes), `stats.js`, `scout.js`, `cosmetics.js`, `image-check.js` (Workers AI). Deploy: `npx wrangler deploy` from that folder.
- `scripts/sync/` AD2L sync. `scripts/deploy/` Pages build. `scripts/feedback.cjs` tickets.
- `firebase/scrimleague.rules` Firestore rules (see memory: live rules may differ from git).
- `.github/workflows/`: `sync.yml`, `pages.yml`.

## Docs

What the site does: `docs/features.md`. How it's built, synced, deployed and changed (adding a division or
season, Firestore rules, feedback tickets): `docs/maintaining.md`. Cosmetics: `docs/cosmetics.md`.
Ideas: `docs/ideas/2026-09-28-feature-ideas.md`, site audit `2026-09-30-site-audit.md`, competitor gaps and
fantasy `2026-10-11-competitor-gaps.md`, page placement `2026-10-11-organisation-audit.md`.
Parked, resume only when the user says so: `docs/ideas/discord-highlight-cards.md`.
