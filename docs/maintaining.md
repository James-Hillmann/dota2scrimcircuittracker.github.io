# Maintaining the site

How it's built, synced, deployed and changed. What it does for visitors: [features.md](features.md).

## Run it

```
npm install
npm start               # http://localhost:3000 — serves public/ like GitHub Pages does
npm test                # logic tests; the OCR tests run only if test-screenshots/ exists
npm run ocr:check       # OCR accuracy on the local test screenshots
npm run ocr:robustness  # the same game at other sizes, crops and JPEG
npm run ocr:wide        # the test screenshots inside wider captures (the second OCR pass)
npm run rules:test      # evaluate the Firestore rules against sample requests (no deploy)
```

The deploy build (preview pages, sitemap, trimmed data files, `404.html`) locally:

```
cp -r public _site && node scripts/deploy/share-pages.js _site && node scripts/deploy/lite-data.js _site && cp _site/index.html _site/404.html
node server.js _site    # serves it like GitHub Pages (PORT=3001 to run beside npm start)
```

`public/firebase-config.js` isn't committed: run `FIREBASE_WEB_API_KEY=... npm run config:write`
once (see "Firebase key").

## Code layout

- `public/index.html`, `public/style.css`, `public/app.js` — the page, the styles, and the router
  and startup (league menu, time machine bar, search box, settings, footer sync time).
- `public/core.js` — what every page uses: escaping and formatting, page headers and breadcrumbs,
  the divisions' data (loading, caches, trimmed copies, the time machine), the scrim list, page
  tabs, sortable tables, the upload/edit lock. It imports no page, so it runs first.
- `public/parts/` — pieces several pages share: lanes, items, combat, draft, tiers, analysis,
  ranks.
- `public/pages/` — one file per page: games (scrim standings and the game page), standings
  (AD2L Teams tab), players, player, heroes, hero, week, teams, and upload, predict and drafter, which load
  on first visit.
- `public/lib/` — logic with no page code, most of it tested in `test/`: `stats.js`
  (leaderboards), `tiers.js` (tier list), `store.js` (Firestore), `divisions.js` (the divisions
  table), `share.js` (shareable paths), `pagetabs.js` (the team, player, hero and standings
  tabs: the one list both the page's tab bar and the nav dropdowns read, so add a tab there),
  `ocr/` (the screenshot reader, shared by the site and the
  Node tests; only `engine-browser.js` / `lib/ocr-node.js` differ), and the rest.
- `scripts/` — `sync/` (the AD2L sync and its helpers), `deploy/` (build steps the Pages workflow
  runs), `gen/` (regenerate data files, preview cards, CDN hashes), `backfill/` (refill fields
  from the sync cache), `rules/` (Firestore rules tools), `firebase/` (one-off project setup),
  `ocr/` (OCR dev tools); `feedback.cjs` (feedback tickets) stays at the top.

Where features live in `public/lib/`: search `search.js` (pop-up), `sitesearch.js` + `topics.js` (results page), `tables.js` (its tables; UI in `parts/tables.js`); feedback `feedback.js` (review:
`feedback-review.js`); tour `tour.js`; scrim schedule `fixtures.js`; predictions and the model
`predict.js`; strength of schedule `schedule.js` (AD2L's definition); the playoff picture
`playoffs.js` (its page part `parts/playoffs.js`; the AD2L rules it follows are in its header,
re-check them each season); the draft model `cmdraft.js` (its page part `parts/cmdraft.js`); laning `lanes.js`; combat `combat.js` (charts `combat-charts.js`); items `items.js`,
the "Items & fights" chart `itemlead.js`; gold `timeline.js`, charts `charts.js`; maps `wardmap.js`,
`deathmap.js`, `towermap.js`, `fightmap.js`, the shared overlays `maplayers.js`; vision `vision.js`
(the line of sight, shared with the sync) and `visionmap.js`; unticketed uploads `unticketed.js`;
visitor counts `visits.js`; trimmed files `lite.js`. The player page's Compare tab is
`parts/compare.js` (picks in the address as `?vs=key,key`).

Tier scoring versions (`lib/tiers.js`, `VERSIONS`): every tunable number (points, multiplier
ranges, padding, curve width) lives in a version. `LIVE` is what the whole site uses and the
tier list selects by default (currently `playoff`). The Model selector also offers `pre`, the
previous pre-playoff model, with its own (i) bubbles and "How it's scored". Add experimental
models as separate versions; switching the default means setting `LIVE` to that version.

Page text: no explainer prose on the pages. Explanations go in the (i) bubbles
(`lib/glossary.js`). One rule in `style.css` hides `.table-note`, `.wm-intro`, `.wm-note`,
`.po-lead`, `.sort-hint` and `.explain` (the "How it works" sections). A note that holds data,
an empty state or a warning gets the `keep` class to stay visible, and a grey note holding a
button (a "→" link to another tab) stays too.

Loading: the first page waits only for what it draws. Upload and Predict load on first visit;
the screenshot reader (and Tesseract) on the first upload; the guided tour and Feedback after
the first page; the known player names for the review form on the upload page. A page loads its
own division in full and every other division as a trimmed copy (below).

## Deploy

Every push to `main` deploys to GitHub Pages (`.github/workflows/pages.yml`). It copies `public/`
to `_site/` and adds:

- **Page copies** (`scripts/deploy/share-pages.js`) at each shareable path (`/warrior/players/`
  …): the app's index.html with that page's title, description, canonical and preview card, so
  search engines index each page (they ignore `#/…`) and Discord shows a preview. Old `/ad2l/…`
  paths forward to `/champion/…`.
  Pages without one (player pages, a week other than the latest, uploaded games) keep `/#/…`.
- **`sitemap.xml`** (same script), named in `public/robots.txt`.
- **Trimmed division files**, `data/<division>-lite.json` (`scripts/deploy/lite-data.js`,
  `public/lib/lite.js`): the division file without timelines, ward and building maps, items or
  pubs, about a third of the download, for the "overall" ranks and search on other divisions'
  pages. `test/lite.test.js` checks the ranks and search come out the same from both; if a stat
  starts reading a dropped field, it fails. Without them (`npm start`), the full files load.
- **`404.html`**, a copy of the app: GitHub Pages serves it for any other address, and the app
  opens that route.

After a push deploys, `scripts/deploy/discord-updates.cjs` posts the commit subjects that change
the site to the Discord updates channel (`DISCORD_UPDATES_WEBHOOK` secret; sync commits are
skipped; `[skip announce]` in a message skips it).

The post only goes up after the deploy job succeeds (the `announce` job `needs: deploy`). Every bullet should link to the page it is about: in a `Discord:` line write `[label](/champion/predict/?tab=board)`, a path starting with `/` is that page on the site, and a line can have several links. A bullet with no link gets one to the home page and a warning in the job log. Check with `node scripts/deploy/discord-updates.cjs --dry-run origin/main HEAD`.

**Link previews:** every page has a 1200×630 card, `public/img/og/<league>.png` (`site.png` for
the home page): the brand mark in the league's colours and the league name in the site font.
Committed; `python scripts/gen/gen-og-images.py` redraws them after a league or colour changes
(Pillow, and the site's fonts in `.cache/fonts`: the script says where to get them). The tab icon
is `public/favicon.svg`, the header's brand mark.

**Third-party scripts** carry integrity hashes: an import map in `public/index.html` for the ES
modules (Firebase, Tesseract, modern-screenshot) and `COUNT_JS_INTEGRITY` in `public/lib/visits.js`
for GoatCounter. The browser refuses a file that doesn't match. After changing a CDN URL or
version, run `node scripts/gen/cdn-integrity.js` (`--check` only reports);
`test/integrity.test.js` fails if a CDN URL in the code has no hash. Tesseract's worker, WASM and
language files load on its own defaults, without hashes.

## AD2L data and the sync

Each division is a static file, `public/data/<division>.json`, built from public data (no keys):

```
npm run sync -- warrior   # one division (a key from public/lib/divisions.js); ~3 min first run, cached after
npm run sync:all          # every division, one after another (scripts/sync/sync-all.js)
git commit -am "Update AD2L data" && git push   # by hand only; the auto sync does this itself
```

**Auto sync:** `.github/workflows/sync.yml` runs `sync-all.js` twice a day (midnight and noon
Pacific) plus Thursday 9pm Pacific after league night (run it by hand from the Actions tab too), commits `public/data/` when anything but the
timestamp changed, and starts the Pages deploy. That picks up new schedules for predictions,
results, newly parsed replays and pubs. A division that fails (PlayOn down, OpenDota rate limit)
doesn't stop the others; the run shows red. The sync caches (`.cache/`) carry over between runs.

**How it finds games:** PlayOn gives the division's teams, rosters (account ids + smurfs) and
series scores; OpenDota has no match list for this amateur league, so the sync walks every
rostered account's practice-lobby games since the season started and keeps the ones tagged with
the season's Dota league id (S48: 20077) where both sides are the division's rosters (3+ of 5 players, which
also drops cross-division games). Stand-ins are kept and labelled. Coverage on the first run: 38
of the 40 games the series scores said were played (a game is missed if nobody on either side has
public match history for it). `--season`, `--league` and `--out` override the table's values.

**Divisions and seasons** are one table, `public/lib/divisions.js`: key, address, name, PlayOn
season id, menu order, colours, sub-divisions, and the season name and Dota league id. The menu,
routes, share paths, colours, Firestore collections, sync, preview pages and preview cards all
read it. A new division or season:

1. Edit `public/lib/divisions.js` (PlayOn ids are on dota.playon.gg/seasons; the Dota league id
   is on OpenDota's league list).
2. `npm run sync -- <key>` for each new or changed division.
3. Redraw the preview cards: `python scripts/gen/gen-og-images.py`.
4. Add the division to the Firestore rules by hand (`knownColl()` regex and the two league
   lists; see "Firestore rules"). `test/divisions.test.js` fails until the repo copy has it.
5. A new patch for vision: add its map dump to `VISION_MAPS` (`public/lib/vision.js`, keyed by
   OpenDota patch id); until then its games get no vision numbers.
6. Season phase (`SEASON` in the same file): a new season starts `phase: "regular"`,
   `regularEnd: null`, `regularIds: []`.

**Playoffs.** When the group stage ends, set `phase: "playoffs"` and `regularEnd` (unix seconds,
after the last group-stage night). Series PlayOn posts after `regularEnd` are the postseason:
- The table, SoS, crosstable and team records ignore them (`groupStage`).
- Up next and Predict read them as best-of with no tie. Predict cards take a winner only, which
  the existing Firestore rules already allow.
- Each one is matched to its week 8 tiebreaker or bracket match by its two teams
  (`postseason` in `lib/playoffs.js`). Played ones settle that match on the Bracket tab.
- The bracket locks at the first bracket series' start. Each decided bracket match whose winner
  a person picked in a bracket saved before then scores 1 on the Leaderboard (Bracket and Total
  columns).
- Every AD2L league gets a Playoffs stamp in the top bar.

A group-stage make-up played after `regularEnd` would read as postseason: add its series id to
`regularIds`. The bracket shape, Bo3/Bo5 and the S47 lower-bracket crossover are the site's
reading of the rules (`lib/playoffs.js` header). Check them against PlayOn's bracket when it's
posted.

### Fields the sync writes, and backfills

Backfills refill a field for games already synced, from the cached OpenDota matches
(`.cache/opendota`) with no network calls; the sync writes the field for new games either way.

- **Items** — `items` and `item_times` per player (`public/lib/items.js`):
  `node scripts/backfill/items-backfill.js`. After a patch adds items:
  `node scripts/gen/gen-item-meta.js` regenerates `public/lib/items-data.js`.
- **Fantasy card art** — one image and style per hero in `scripts/gen/hero-art-picks.json`
  (Fav's picks; `src` is the original URL). After editing it or when a new hero needs art:
  `node scripts/gen/gen-hero-art.js` rewrites `public/img/hero-art/` and `public/lib/hero-art.js`.
- **Laning** — `lane_role` (OpenDota's own lanes; older games fall back to positions: 1+5 safe,
  2 mid, 3+4 off), `roaming`, `lh10`, `dn10`: `node scripts/backfill/lanes-backfill.js`.
- **Combat** — per player `apm`, `tf_part`, `first_blood`, `multi`, `streaks`, `kill_t`,
  `runes`, `courier_kills`, `max_hit`, `pings`, `bench`, `smoke_kill_t` (seconds of kills
  OpenDota flags as out of smoke); per game `pauses`, `fight_smokes` (smokes each side used in
  each teamfight; both read by `public/lib/smokemap.js`) (`scripts/sync/combat-fields.js`): `node scripts/backfill/combat-backfill.js`.
- **First blood** — per game `first_blood_at` [second, killer, victim] (player indexes;
  OpenDota's flagged killer at their first kill; its own `first_blood_time` reads 0 for kills
  before the horn, so it isn't used) and per player `first_blood` / `first_death`.
- **Buybacks** — `buybacks` (seconds of each): `node scripts/backfill/buybacks-backfill.js`.
- **Vision** — per game `vision` (each team's observer coverage per minute), per player
  `new_vision` (`scripts/sync/vision.js`, sharing `public/lib/vision.js` with the browser):
  `node scripts/backfill/vision-backfill.js`. Coverage counts the walkable map outside each
  team's base (2,600 units round its Ancient). The Vision map's Range mode works out what's lit
  once per stretch between ward, tower and day/night changes (`litOver` in `lib/vision.js`; a
  whole game ≈ 0.2 s). The map dumps (64-unit tiles of elevation, trees,
  walkable ground and blockers) come from
  [leamare/dota-map-coordinates](https://github.com/leamare/dota-map-coordinates), downloaded into
  `.cache/vision/` on first use and not committed (the repo has no licence); the site's Vision map
  fetches them straight from GitHub, so the site never serves them.
- **Draft files** — `public/data/<division>-draft.json`, loaded only by the game page's Draft
  tab and the Drafter: hero names, each hero's ranked picks and wins per bracket (OpenDota
  `/heroStats`, one call per division), and every rostered player's games in the last 390 days
  (main account, smurfs merged), one player per line so the auto sync's timestamp-only check sees
  real changes. They come from the same `/players/{id}/matches` call the sync already makes, with
  `project=` adding last hits, GPM, healing, lane and lobby rank, so the draft model costs one
  extra OpenDota call per division per run. The deploy's trimmed copies skip them.
- **Draft model** — `public/lib/cmdraft.js` is a port of Project Sybil's model
  (`packages/sybil/{cmDraft,cmPlayers,leagueReading,math}.ts`, ybabts/Project-Sybil; ideas are
  shared both ways). It was checked against Sybil's TypeScript, run through Node's
  `--experimental-strip-types`, on random histories: largest difference 0. `test/cmdraft.test.js`
  holds its pieces. The weights and the hero-by-position shares are Sybil's fit:
  after Sybil refits, `node scripts/gen/gen-sybil-fitted.js <Project-Sybil checkout>` rewrites
  `public/lib/sybil-fitted.js`. Counter/synergy tables would plug into `stateFeatures`
  (`counters`/`synergy`, 0 for now).
- **Detail files** — `public/data/<division>-detail.json`: every player's purchases and skill
  build per game, loaded only by game pages (Build order) and hero pages (Skill build). Ability
  names: `public/lib/abilities-data.js`, regenerated by `node scripts/gen/gen-ability-meta.js`
  after a patch (`gen-hero-meta.js` does the same for heroes).
- **Towers** — `buildings` from OpenDota's building kills; the map spots are hand-placed.
- **Ward maps** are drawn on `public/img/minimap.webp`, lined up by its two fountains against where
  players stand before the horn (both axes 4.25 px per map unit).

## STRATZ (Dota Plus hero levels)

OpenDota and the Steam Web API have no Dota Plus hero levels; STRATZ's GraphQL API does
(`scripts/stratz/stratz.js`, `player.dotaPlus`: one dated row per level reached on a hero). It
needs a token from stratz.com/api: the `STRATZ_API_KEY` repository secret in Actions, or
`STRATZ_API_KEY=... node ...` locally. A key may be used from 2 IP addresses per 15 minutes and
every Actions run is a new one, so the client waits for a slot when STRATZ says it's full.

- **The sync** runs `scripts/stratz/hero-levels.js` after the divisions: every rostered account,
  every account in a league game and every account with pubs, written to
  `public/data/hero-levels.json` (`accounts[id][heroId] = [level, unix hour, ...]`, one line
  per account so the timestamp-only check still works). STRATZ failing keeps the last levels.
- **STRATZ lists levels from 11 up** (almost every hero's first row is 11), so lower levels show
  no badge; private or anonymous profiles neither.
- **The site** (`public/lib/hero-levels.js`): pages write an empty `plusSlot(account, hero, time)`
  and the file, loaded once after startup, fills every slot with the badge. With a game's start
  time it's the level the player had then. Tiers: Bronze 1, Silver 6, Gold 12, Platinum 18,
  Master 25, Grandmaster 30 (the game's, and STRATZ's `HERO_LEVEL_STEPS`). The art is Valve's
  badges as STRATZ serves them (`cdn.stratz.com/images/dota2/plus/hero_badge_<1-6>.png`), saved
  as 96px WebP in `public/img/hero-badges/<tier>.webp`, with the level drawn on top.
- **Cards**: the badge is the layout part `plus`, off until the owner turns it on in Card
  layout (`lib/card-layout.js`). The collection Worker checks layouts with the same file, so
  **redeploy the Worker** (`cd workers/steam-auth && npx wrangler deploy`) after changing it, or
  it drops the setting when a card is saved.
- `scripts/stratz/stratz-probe.js` (the **STRATZ probe** workflow) lists the schema's Dota Plus
  fields and checks the key; on a `claude/` branch it also refreshes `hero-levels.json` there.

## Firebase key

`public/firebase-config.js` is not committed. The Pages workflow writes it from the
`FIREBASE_WEB_API_KEY` repository secret; locally, run `FIREBASE_WEB_API_KEY=... npm run
config:write` once. It's a public web key by design (the browser receives it), so what actually
protects the project is the key's website restriction (only our GitHub Pages sites and localhost:
`scripts/firebase/restrict-api-key.cjs`; `check-api-key.cjs` shows it) and the Firestore rules.

Scrim data lives in Firestore (the shared `pistachio-kitchen` Firebase project, under
`scrimLeague/`): scrims in `matches`, unticketed AD2L games in `<division>_unticketed`, AD2L and
scrim picks in `predictions` (`league` says which), the scrim schedule in `scrim_fixtures`, casts
in `casts` (`league`, `game` = the page's game ID, `url`, `caster`; up to 20 per game), feedback
in `feedback/{id}` (items in `…/items/{n}`, limits in `feedback_limits/{uid}`).

## Steam sign-in Worker (fantasy)

`workers/steam-auth/` is a Cloudflare Worker (account jonahbyu@gmail.com, subdomain
`ad2lstats.workers.dev`). `/login?return=<page>` sends the visitor to Steam; `/callback` confirms
the reply with Steam and redirects back with `#fantasy-token=<Firebase custom token>` (app.js
signs in with it). Only the site and the two localhost previews may receive a token
(`ALLOWED_ORIGINS`). The signing key is the Worker secret `FIREBASE_SA` (a service-account JSON
key, firebase-adminsdk, set in the Cloudflare dashboard; never in the repo). Tests:
`test/steam-auth.test.js`.

Scouting (`src/scout.js`, Durable Object `ScoutStore`): `POST /scout` with the Steam session's
Firebase ID token scouts that account from OpenDota (asks OpenDota to refresh it first; reuses a
report under 6 hours old); `GET /scout/<account>` returns the report or 404. The site asks for it
only for players on no roster (`parts/me.js`). Reports use the sync's `pubs` and `totals`
formats. Tests: `test/scout.test.js`.

```bash
cd workers/steam-auth && npx wrangler deploy     # after changing src/index.js
npx wrangler secret list                          # FIREBASE_SA should be listed
```

## Firestore rules

The project has one ruleset shared with Cookbook and Maze Racer, deployed from the Cookbook repo.
This app's block lives in `firebase/scrimleague.rules`. To change it:

```
# edit firebase/scrimleague.rules, then:
node scripts/rules/fetch-live-rules.cjs                  # does the Cookbook copy match what's live?
node scripts/rules/merge-rules.cjs ../Cookbook/firestore.rules
npm run rules:test -- ../Cookbook/firestore.rules         # must all PASS
cd ../Cookbook && npx firebase deploy --only firestore:rules --project pistachio-kitchen
```

Rules are limited to 1000 evaluated expressions per request; per-player checks are packed tight to
fit (see the comment in the rules file). Re-run the dry test after any change. `RULES_DEBUG=1`
prints the source of the expressions that failed. Feedback tickets are batched writes, so their
tests mock the other documents in the batch (`functionMocks`); the test API reads strings starting
with `/` as paths, and a null field in a mocked stored document didn't compare equal to null
there. That's why items store the full `page` URL and empty rate-limit slots hold the 1970 epoch.
`scripts/rules/rules-live-test.js` tests against the live database and writes one fake match; its
header says how to delete it.

## Feedback tickets

Reviewing (your Firebase login): `node scripts/feedback.cjs list`, `show FB-XXXXXX` (saves the
screenshots and a replay file in gitignored `public/_dev/feedback/`), `done FB-XXXXXX "summary"`
(deletes it and its Discord post, reposts today's digest without it, logs it in
`docs/feedback-log.md`). With `npm start` running,
`http://localhost:3000/?fbreview=FB-XXXXXX` replays a shown ticket on the real pages: its marks,
pins and notes drawn where the visitor made them, a clicked element found again by its selector,
and a panel to step through the notes (`public/lib/feedback-review.js`, loaded on localhost only).
A scheduled task on Jonah's PC (`check` / `emailed`) emails each new ticket and a daily digest.

Tickets on profiles: `link FB-XXXXXX <account>` (or `none`) shows a ticket on that player's profile
(`public/parts/profile-tickets.js`) as open; check the name on the ticket against the profile
first. Tickets sent while signed in with Steam link themselves on the next `discord` run. `done`
turns a linked ticket to implemented, which profiles show for a week. Profiles read the public
`feedback_status` collection (ID, first note trimmed, status), which only this script writes.

## Editing and deleting uploads

The league password (in `public/core.js`) is a speed bump, not security: the rules let any
signed-in visitor edit or delete an upload. The admin can also delete from the command line:

```
npx firebase firestore:delete scrimLeague/data/matches/<id> --project pistachio-kitchen
```

## Visitor counts

GoatCounter (`public/lib/visits.js`), off until `SITE_CODE` is set: no cookies, no personal data,
each page change one view (path + route). GoatCounter ignores localhost; open the site once with
`#toggle-goatcounter` on the end of the address to stop counting your own browser.

## OCR test material

`test-screenshots/` and `data/sample-game1.json` (real screenshots and their hand-checked
transcription, with other players' gamertags) stay local and gitignored; tests that need them skip
when they're missing. `npm run ocr:robustness` and `npm run ocr:wide` score the reader on them
(results in [features.md](features.md#whats-read-and-how-well)).
