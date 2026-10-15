# What the site does

A page-by-page guide to https://dota2scrimcircuittracker.github.io/. How to run, sync, deploy
and change it: [maintaining.md](maintaining.md).

## Leagues and getting around

- **Home page** — `/` (also `/ad2l/`) is a league picker: Scrim League and every AD2L division,
  in the menu's order and colours.
- **Scrim League** — our scrims: paste two post-game screenshots, the stats are read in your
  browser (Tesseract OCR, no AI, no API keys), you check them, and the game is saved. Every scrim
  page lives under `/scrims/` (`/scrims/week/`, `/scrims/players/`, `/scrims/teams/<team>`…),
  like a division's; the old `/week/`, `/teams/`, `/#/match/…` addresses forward. The nav
  matches AD2L's: Teams | Content | Players | Heroes | Predict | Upload. **Teams** (`/scrims/`)
  opens on **Table**: every team by game wins (then fewest losses), with win %, average kill
  difference, last-five form and streak; **Matches** lists every game; **Teams** shows the team
  cards. Private scrims count.
- **AD2L S48 divisions** — Explorer, Voyager, Challenger, Warrior, Conqueror, Champion and
  Heroic/Aegis (the list lives in `public/lib/divisions.js`). Each has standings, every ticketed
  game with full stats, players, heroes, teams, predictions and unticketed uploads, pulled from
  PlayOn + OpenDota. The league menu (top left) runs lowest to highest: Scrim, Explorer, Voyager,
  Challenger, Warrior, Conqueror, Champion, Heroic/Aegis. Champion lives at `/champion/` but is
  keyed `ad2l` in data files, Firestore and predictions; old `/ad2l/<page>` links forward to
  `/champion/<page>`.
- **Heroic/Aegis** — PlayOn runs Heroic and Aegis as one season, played in two divisions (A and
  B, read from PlayOn's Participants tables; the "Refund" table holds bye placeholders and is
  dropped). A switch under the header picks Division A (`/heroic/a/`), Division B (`/heroic/b/`)
  or Combined (`/heroic/`); each shows only that division's teams, series and games on every
  tab. Forfeits against PlayOn's "Heroic Bye Week" placeholder aren't uploadable games.
- **All divisions** (`/all/`, under the picker and last in the league menu) — every division's
  files merged: Teams (one table with a Division column; Matches and Crosstable boxed per
  division, Heroic/Aegis per sub-division; no Race), Content, Players (one tier list, everyone
  rated against the whole field) and Heroes. Read-only: no Predict or Upload, and a game opens
  in its own division.
- **League switching** keeps the tab you're on: Players in Champion → Warrior opens Warrior's
  Players. A team, game or player page opens that tab's list.
- **Search** (top bar, or press `/`) — as you type, any player or team in any league: every
  division's rosters, stand-ins seen in its games (by the team they last played for), and scrim
  players and teams, each with its league and, for players, their team and captain/stand-in
  status; in-game names find the rostered player. Arrow to a suggestion and Enter opens it;
  Enter on its own (or "See all results") opens the **results page** (`<league>/search?q=…`):
  a name plus a stat ("No Immortals radiant") links straight to that section, which flashes; a
  stat with no name ("radiant win rate") gets a card to pick a league, team, player or hero;
  names list their pages' tabs; league pages match by name. Filters: Teams / Players / Heroes /
  Pages and one league. Keyword-based with synonyms and hero shorthand ("am", "wk"); typos are
  corrected (none up to 3 letters, 1 up to 6, 2 beyond) with a "Showing results for…" line and a
  link to search the exact words. Questions it can't place get an empty page with examples.
  The words each section answers to are in `lib/topics.js`; a search that comes back empty is
  fixed by adding words there. Spec: `docs/superpowers/specs/2026-10-06-site-search-design.md`.
  **Tables:** a search that asks for every team, player or hero ("compare first blood",
  "radiant win rate all teams", "compare kda", "ban rate table") leads with a table of every one
  in the league. "Per minute" ("kills per minute", "kills a minute", "kpm") swaps a stat's columns for
  their per-minute ones (kills, deaths, kill diff and assists over game time, with the team's average
  game length); a phrase a topic owns ("gold per minute") stays that topic's. Any other stat with no name ("radiant win rate", "kda", "ban rate") opens its
  card on **All teams / All players / All heroes** with the table already drawn (League and the
  single Team / Player / Hero pickers stay a click away), with the rest of the results below.
  Every table search builds has **Edit this table** (it in the builder) and **Build my own
  table**; the second also sits next to the filters and as the table icon next to the search
  box in the top bar (for the league being viewed). The builder (`&table=team|player|hero`) has rows (teams,
  players, heroes), league (**All AD2L**, a division, Heroic A or B, Scrims), period (whole
  season or the last 2, 4 or 8 weeks), a player table's team, minimum games (values from fewer
  games show greyed and sort last), presets, column sets saved in this browser, and columns in
  groups. Everything is in the address (`&cols=…&sort=…&dir=…&min=…&weeks=…&team=…&league=…`),
  so a table can be shared. Values come from the team, Players and Heroes pages' own functions
  (`lib/tables.js`); an AD2L team's win % is PlayOn's record (`lib/teams.js` `seriesRecords`).
  Spec: `docs/superpowers/specs/2026-10-06-team-tables-design.md`.
- **Shareable addresses** — the address bar shows real paths (`/warrior/players/`), so a link
  pasted into Discord previews as that page (its title, description and a card in the league's
  colours). Pages without a preview (player pages, older weeks, uploaded games) keep `/#/…`
  addresses, and any other address still opens the app. Page tabs (a team's Overview / Roster /
  Games…, a player's, hero's or game's) add `?tab=<id>` and a history step, so Back returns to
  the previous tab and a copied link opens on that tab.
- **Breadcrumbs and titles** — player, hero, team and game pages show league › list › page; the
  browser tab names the page first ("Players · AD2L S48 Warrior").
- **Guided tour** ("New here?" in the footer) — tours AD2L divisions only: its first stop waits
  for you to pick one (Scrim League is hidden). Pause it and the button reads Resume. Spec:
  `docs/superpowers/specs/2026-09-29-guided-tour-design.md`.
- **Feedback** (top bar) — anyone can mark up the site and say what they'd change: Snip (drag a
  box), Click (pick an element), Draw, and Use site (browse to another page). Every mark asks for
  a note; Submit sends them all as one ticket with the sender's name, at most 5 per browser per
  hour. Tickets can't be read back from the site. Screenshots are drawn from the page, so hero
  art (Steam's CDN won't share it) shows as grey boxes and the display font falls back. Spec:
  `docs/superpowers/specs/2026-09-30-feedback-design.md`.
- **Footer** — where the data comes from and, on an AD2L page, when that division last synced;
  the tour and the Discord invite.
- **Settings** (cog) — dark, grey or light theme, colour-blind mode, My team, and the **time machine**
  (pick weeks: standings, the Players and Heroes tabs, and team, player and hero pages are
  recomputed over just those weeks; a short pick lowers the 3-game floor to the weeks picked).
- **Nav dropdowns** — hovering a nav tab (or Arrow Down on it) opens a short list: Teams lists
  the team names, Content the weeks, and Players, Heroes, Predict (AD2L) and Drafter their page's
  own tabs (from `public/lib/pagetabs.js`).
- **Phone nav** — Teams, Content, Players and Heroes, then **More ▾** (Predict, Drafter, Upload),
  on one line with no sideways scroll. More opens on a tap. The league name drops the season and
  shortens ("Champion", "All", "Heroic" with an "A" badge) so it fits beside the header buttons.
- **Opening tab** — a league's Teams page always opens on Table, and a team page on Overview,
  except when the team picker on a team page switches straight to another team (it keeps the tab).
  A `?tab=` link still wins. Player, hero, game and Predict pages remember the last tab.
- **Page tabs on the title line** — Teams, Players, Heroes and Predict show their tabs to the
  right of the title, like team, player and hero pages.
- **No explainer notes** — grey notes, intro lines, map notes and "How it works" sections are
  hidden site-wide by one CSS rule in `style.css`; the (i) bubbles carry the explanations (see
  maintaining.md, "Page text").
- **Accessibility** — a skip link, focus moves to the new page's heading on navigation, the
  current tab is marked for screen readers, and every table header is scoped.
- Every table sorts: click a column header (↕), or use the "Sort by" menu on player tables.

## Teams tab (AD2L) and team pages

- **Table** — standings from PlayOn's series scores, with form. **Strength of schedule** (SOS):
  AD2L's own tiebreaker (rules §7), the total game wins of every opponent played (a team met
  twice counts twice, a bye counts 0). Still to play: the same total for the posted opponents
  still to come (a coming bye week doesn't count).
- **Matches** — every series, one box per week (per division in Combined Heroic), like a
  Liquipedia group stage: winner green, loser red, a tie gold; upcoming pairings with the model's
  odds on hover; G1/G2 links to each ticketed game. PlayOn posts pairings about a week ahead, so
  the last box is as far as it goes.
- **Crosstable** — every team against every other in standings order: the row team's score and
  week in each cell, "vs" for the coming week, empty where two teams haven't met (AD2L isn't a
  round robin); one table per division in Combined Heroic.
- **Team pages** — record, series and game results, roster, hero pool (W–L per hero), what they
  ban and what's banned against them, split by draft phase, how often they play Radiant and
  pick first (with the record each way and the side/pick mix; scrims show pick order only), and
  player stats for that team. The Overview opens like a player's Stats tab: head cards (record,
  form, team GPM, damage, vision, objectives, sides, first blood, fights) and three best games
  (biggest win, fastest win, biggest comeback or most kills), then **Team ranks**: the team's
  place on each stat (the five players added up, a game) in its division and across all seven
  leagues, coloured like Stat ranks. Then Most played beside the Roster box, game length and
  head to head (recent results are on the Series tab and the Form card). On the Series tab,
  every drafted series shows each game's full pick/ban draft under its row.
  Tabs: Overview | Roster | Series (Games for scrims) | Heroes | **Draft** | Outcomes | Laning |
  **Resources** | Map. Heroes: the hero pool. Draft: the hero grid on top, then side and pick
  order, draft by phase, and the draft model's read of each series' drafts. Resources: the gold
  block (average lead curve, gold at 10' and 20', record ahead and behind at 10', 20' and 30',
  comebacks and throws). Map: strengths and weak spots, objectives, vision, and the maps.
  **Hero grid for Dota** (top of the Draft tab, linked from the overview): three columns, as in a matchup:
  the enemy (this team) left, bans middle, you right. "You" is **My team**, set beside the grid or
  under the settings cog (the same setting, `core.js` myTeam, kept in localStorage; either one
  updates the other and open grids). Templates: by position, by player (the five with the most
  games), picks and bans (model's likely picks, picks most; bans: the model's ban-against-them,
  banned against them, what they ban), recent pubs (each player's last 30 days), draft model
  threats per position. **Depth** (built-ins; remembered): Quick (the enemy's five boxes, top 5
  heroes each, and one ban-against-them box of 8), Standard (as built), Deep (no caps, plus real
  drafts' "banned against them" and "they ban" by phase); customising keeps the depth's boxes.
  Every built-in puts the model's bans in the middle, split by Captains Mode ban
  phase (phase 1 before any pick, 2 after two picks, 3 after eight: scored at the start of each
  phase after the model's own draft to there, both first-pick orders averaged, heroes already
  taken left out; `parts/cmdraft.js` phaseBans). Real drafts split the same way: "banned against
  them" and "they ban" per phase. Your team gets the same boxes on the right. The draft model's boxes read the team against my team (or, without one,
  average players; in the Drafter, the other team in the draft): likely picks are the model's
  propensity (weighted games plus position prior), bans are the points a hero adds to them if left
  open (`parts/cmdraft.js` heroGridModelFor). Heroes played in pubs in the last 30 days get a green
  outline and their pub count. **Customise** / **New template…**: drag heroes off a box (or click
  them) to take them out; drag them in from the grid, the Drafter's heroes and suggestions, or any
  hero picture or name on the page; drop one on another hero to put it there. **Right-click any hero
  picture** on the site (Shift + right-click keeps the browser's menu): "Add to a hero grid", step 1
  the grid (yours, a new one with just that hero, or a built-in, which saves your own copy), step 2
  the section; open grids switch to it and team pages open on it. The grid is drawn
  as Dota's canvas (1100 units wide, the export's own x/y/width/height; heroes shrink to fit a box
  as Dota does). Built-ins lay boxes out in the three columns; customising freezes every box's
  place so it can be dragged by its name bar and resized from the corner (snaps to 10, Alt for
  free; arrow keys nudge the selected box, Shift+arrows resize, Delete removes). Click a box to
  rename it, change its source, side (enemy, bans, you) or cap, add a hero, duplicate, empty or
  delete it; "Tidy into columns" resets the layout. Edits are kept as add/remove/order lists so
  a template fits every team. Templates are saved in localStorage only. Saved into the visitor's own `hero_grid_config.json` (every
  grid already in it is kept; the file stays in the browser) so it shows in Dota's pick-screen
  Sort menu as "vs <team>", with step-by-step instructions (`parts/herogrid.js`,
  `lib/herogrid.js`).
  Splits: record as Radiant / Dire, with and without stand-ins, first-blood rate, teamfight win
  %, aegis steals, win % by game length, record when ahead / behind at 10', 20' and 30', every
  pair and five-player lineup, average gold lead curve, comebacks and throws (5k+ leads),
  Roshans and Tormentors taken vs given up, first-Roshan rate, and wards / dewards / stacks per
  game. Team names link to team pages everywhere on the site.

## Content (was Weekly)

The week strip runs newest first: the latest week on the left, week 1 at the end. On All
divisions each series chip wears its division's menu colour and names it.
One week at a time, in this order: the week's series (or games) first, then (AD2L, latest
week) **Up next**: the series still to play, each with the model's odds as on Predict (it used
to be a Teams tab), then highlights (player of the week, biggest damage, best KDA, top GPM, most
kills, fastest core item, best laner, biggest comeback, most wards / stacks / dewards, fastest
first blood, longest streak, rampages, biggest hit, highest APM, aegis steals, most paused game)
and every game with lineups and MVP. AD2L games also show the full Captains Mode draft in pick/ban
order, grouped by series. (Scrims have no draft: it isn't on the post-game screen.)

## Players tab

One tab per section (Laning and Medal vs rating are AD2L only):

- **Tier list** — every player with 3+ games, ranked S–D (see "Tier list scoring" below). One list per
  position, Pos 1–5 (opens on Pos 1; there's no all-players list): a player is on the list of the position
  they played most, with all their games counting. Each game is scored against the position played in
  it (that position's anchors; `lib/tiers.js` tierModels/tierList `pos`), and the list's consistency and
  rating curve come from that position's games, so only players who swap positions score differently
  from a list of one position's games alone. A swapper's breakdown has a "By position" block with
  the score from their games at each (rated on that position's curve). Each chip says the position
  played most; its tooltip lists games at each.
  A breakdown has a × in its top-right corner, and its stat table sorts by Stat, 0–100 or Points
  (the order holds for every breakdown while the page is open).
- **Stat leaders** — top and bottom 3 on any stat, with "1st overall" badges across every division.
  A role filter (cores, supports or one position) ranks players by the position they play most.
- **Laning** — laning ranked by position (safe, mid, off, supports; 3+ lanes), with best-laner
  cards for the latest week and the season.
- **Medal vs rating** — a scatter of PlayOn medal against tier rating, with who plays furthest
  above and below their medal.
- **All stats** — the full table, with a stand-in filter; per-game map averages, combat columns
  (APM, fights, first blood %, best streak, rampages, ultras, runes, couriers, pings) and
  **recent pubs** (AD2L: each rostered player's public/ranked games since the last league night,
  smurfs included, from OpenDota at sync time).

### Tier list scoring

`public/lib/tiers.js`, the same for both leagues:

    score = stat points (out of 100) × survival × consistency × opponents × winning

Every point is shown: click a player on the tier list, or open their page. The stat rows add up
to the stat points and each multiplier shows the points it adds or removes.

- **Role** from the replay's position (1–3 core, 4–5 support); games without one (screenshot
  uploads, scrims) use net worth rank in the team. Each game is scored in the role played.
- **Stats** — each game, each stat is a z-score against the same position (capped at ±2.5).
  Farm, hero damage, building damage, kills and assists are shares of the team's total, so
  long games don't inflate them. GPM, XPM, net worth and support stacks (per game) are compared with
  the position's straight-line fit on game length. Lane result (supports only) = their lane's
  gold + XP lead at 10 min over the enemy lane, from the replay's lanes (jungling: none). Cores
  get laning instead, so the lane isn't counted twice. Each stat is then on its own 0–100
  per role: a player's average, padded with 3 games at the position average; 100 = the league's
  best such average (players with 3+ games in the role), 0 = the worst (but no closer to the
  position average than the best is, so a small pool's worst isn't a flat 0). Support stacks are
  easier: 100 sits 70% of the way from the worst stacker to the best.
- **Stat points** out of 100 — cores: damage share 16, farm share 15, kill share 15, GPM 14, net
  worth 10, XPM 8, assist share 8, building share 5, laning 5, stun time 4.
  Supports: new vision 16 (replaced ward uptime; see Vision), dewards 13, assist share 13, stun
  time 8, kill share 8, lane result 7, healing 7, stacks 7, smokes 5, damage share 3, GPM 3, dust
  2, sentries 2, farm share 2, net worth 2, building share 2.
- **Survival** ×0.85–1.00: deaths 40%, time dead 35%, hero damage taken per life 25%, each on its
  own 0–100.
- **Consistency** ×0.90–1.00: the spread of the player's series stat points, pulled toward the
  league's typical spread by 2 series; steadiest player 1.00, streakiest 0.90.
- **Opponents** ×0.90–1.10: each opponent's game win % outside games against this team, padded
  with 6 even games (25% → 0.90, 75% → 1.10); each series takes its opponent's factor and the
  season multiplier weights series by their stat points.
- **Series**: each series shows its stat points (same padding as the season, uncapped) and score
  (× its opponent factor and the season's other multipliers); weighted by games they average to
  the season's stat points and score exactly.
- **Winning** ×0.70–1.30: two parts win rate (padded with 6 even games; 25% → 0, 75% → 100) to
  one part win speed (share of the league's wins that took longer, padded with 3 average wins).
- **Rating** = the score on a normal curve fitted to the league: the median player rates 50,
  width 1.5 × the spread of scores. The breakdown shows it as a "Rating curve" row (rating −
  score), the one step that compares a player with the rest of their league.
- **Each league is scored on its own**: every AD2L division and the scrim ledger has its own
  position averages, 100s and 0s, and curve, so a rating ranks a player within their league.
  The Heroic A/B views use the whole Heroic/Aegis division's reference.
- **Tiers** by fixed rating: S 85+, A 65+, B 45+, C 30+, D below (roughly 10/15/35/25/15% per
  division). Needs 3+ games. PlayOn medal badges are shown, not scored.

## Player pages

Click any player name: record, KDA, GPM, damage, kill participation, tier (with the full
breakdown), best games, stat ranks in the league and overall, hero pool (W–L per hero) and every
game they played (sortable). Tabs: Stats, Compare, Heroes, Combat, Laning, Items, Map, Games.
Also: the average gold curve against the division's core and support averages, record
by the team's pick number (1st … last pick) with a flag for a big last-pick gap. Games is the
list; game analysis (one game against their usual) sits at the bottom of Stats, and a row's
Analyze opens it on that game. On
Heroes, the hero pool and by draft pick stay open; recent pubs, pub practice (league record on
heroes played in pubs the week before, against the rest) and all-time pubs and esports fold
under one closed **Pubs and other leagues ▾**.

**Dota Plus hero levels** (AD2L, from STRATZ through the sync): the in-game badge (tier colour,
level on it) on the hero wherever a league player shows on one: game scoreboards, MVP and
standouts, ratings, combat, laning, game analysis, week lineups and the player's Games table show
the level they had in that game; hero cards, pubs, all-time heroes and a hero page's players show
the current one. Heroes has a **Dota Plus hero levels** list of every hero with a level, highest
first. STRATZ lists levels from 11 up; lower ones and private profiles show none.

## Heroes tab and hero pages

The Heroes tab has three sub-tabs (`?tab=tiers|players|table`):

- **Hero tiers** — the heroes themselves, ranked S–D by how well players do on them: the
  games-weighted average hero rating of everyone who played it, padded with 3 games at 50 (the
  median player), then put on a curve fitted to the heroes with 2+ games (median 50, 1.5 × their
  spread), same cutoffs as the tier list. Each card: rating, best player on it, W–L, games,
  players. Games floor default 3 (drops when nothing reaches it). Not a win-rate ranking.
- **Players on heroes** — every player on every hero, ranked S–D by hero rating (the tier rating
  from just their games on that hero; same cutoffs as the tier list). Filters: Everyone / Cores /
  Supports, one hero, and a games floor (default 2; drops to 1 when nobody has 2).
- Both boards show 24 cards per tier, then "+N more". Click a card for its breakdown. A hero:
  every player on it with W–L, hero rating and the points their games add (games × hero rating ÷
  (games + 3)), the padding, the average, the hero-curve step and the rating, with a short
  plain-language summary; the rows add up to the rating. A player on a hero: the same breakdown
  as the Players tier list (stats, multipliers, series, curve), from just those games.
- **All heroes** — the draft cards and the table below:
- **Heroes** — every hero picked: picks, bans, contest rate (picked or banned per drafted
  game), win rate, Radiant's win rate, the division's "team that drew first blood won X%".
  Bans and picks split by Captains Mode phase (phase 1 = opening 7 bans + first 2 picks, phase 2
  = 3 bans + 6 picks, phase 3 = last 4 bans + last 2 picks; read from each draft, not
  hard-coded), win % per pick phase and first-pick win rate. Heroes under a minimum number of
  games (default 3, changeable) are hidden so one-off 100% heroes don't top the list.
- **Hero pages** — record, pick and ban rates, average draft slot (AD2L), the same by phase,
  record by pick number, best team and player on it, biggest games, a teams table (picks, W–L,
  win % on the hero, who played it, bans for and against), a players table, Matchups (record
  with and against every hero), Combat, Laning, **Items & skills** (core items, neutral items
  held at the end, skill build; the talent tree will go here), Map, Games (every game it was in)
  and Analysis (one game in depth; a row's Analyze opens it).

## Game pages

- **Game tags** (`lib/gametags.js`) — chips on the game page banner and on every game list
  (Content, scrim matches, team series rows, player and hero Every game tables, with a sortable
  Tags column). **Stomp**: the winner led by 20k+ and the loser was never ahead at any minute
  (17% of S48 games). **Comeback** / **Throw**: a 5k+ lead lost (the same rule as the team page);
  from a team's, player's or hero's side the loser's game reads Throw, elsewhere Comeback.
  **Rampage**, else **Ultra kill**: anyone got one (hover for who). **Long** / **Short game**:
  the league's longest and shortest tenth (needs 10+ games). Stomp, Comeback and Throw need the
  gold graph and multi-kills the parsed replay, so screenshot uploads get only length tags.
- **Scoreboard** with standouts (damage per net worth, kill participation, damage share), MVP,
  FB / "died first" tags, and links to OpenDota and Dotabuff (ticketed games).
- **Casts** — a strip under the score on every game page: anyone pastes a link (YouTube, Twitch,
  any https page) and the caster's name, and it's there for everyone. Whoever added a cast can
  remove it from that browser; anyone else needs the league password. Up to 20 per game.
- **Layout** — banner, series strip, casts, key facts and the draft strip, then the tabs (about
  800px down on a laptop): Scoreboard | Graphs | Draft | Ratings | Laning | Resources | Combat |
  Items | Map.
- **Graphs** tab (AD2L): gold lead minute by minute with each side's biggest lead marked, XP
  lead, and every player's gold (OpenDota's parsed-replay gold: total gold earned, like
  OpenDota's own graph). "Items & fights": the gold lead with every teamfight (sized by deaths,
  coloured by who lost fewer) and each team's core items on one clock. Roshan, Tormentor and
  first blood are marked on the chart.
- **Draft**, **Ratings**, **Laning**, **Resources**, **Combat**, **Items**, **Map** tabs, below.
- **Draft** (AD2L games with a Captains Mode draft) — the draft model's read of the draft (see
  "Draft model" below), with each player read only from games before this one: each team's
  chance to win before the draft and after every step (a chart), and a row per step with where
  the model ranked the actual pick or ban among the heroes left, its value (the team's chance with
  that pick; for a ban, the points that hero would have added to the other team), the model's top
  3 at that step, and the chance after it. Then who the model thought would play each hero
  against who did, and how each player was read (games found, rank).
- **Laning** (AD2L, parsed replays) — each lane (top, middle, bottom) called won, even or lost at
  10:00 on the whole lane's gold + XP lead, with each side's heroes, then every player's last
  hits, denies, lane efficiency, kills and deaths before 10:00. Lanes are the replay's own, so
  swaps and tri-lanes count as played. Roamers (OpenDota's flag) don't count in the lane they left;
  they're listed on their own with how that lane did. A lane with more heroes on one side (1v2,
  3v2) compares the cores' gold + XP (per hero without a core on both sides), scaled to the
  lane's average size, so neither the extra hero nor a support's low farm decides it. Won/lost cut-offs are fitted per division, a third of
  lanes each way, side lanes and mid separately (S48 Champion: ~1,000 side, ~850 mid). Player and
  hero pages get a Laning tab (record, averages, by lane, every lane with who they laned with and
  against). Team pages get one too: each lane's won–even–lost record with who played it, then
  every game lane by lane (heroes on both sides, verdict, lead). Lane score = average lead ÷ the
  won cut-off, padded with 2 even lanes. The game's Laning tab ends with each player's XP at 10'.
- **Resources** (AD2L, parsed replays) — lane / neutral / ancient creep kills and camps stacked
  per player, with team totals (gold and XP sources to come).
- **Vision & objectives** (top of the game's Map tab, parsed replays) — a timeline of who took
  each Roshan and Tormentor, then per player observers, new vision, sentries, dewards, smokes,
  dust, Roshan and Tormentor last hits and building damage, with team totals. The Combat tab
  ends with each player's stuns, damage taken and time dead.
- **Combat** (AD2L, parsed replays) — a kill-streak chart (each run of kills without dying climbs
  a step per kill and drops at the death that ended it, with the hero and the announcer's name at
  each 3+ streak and who ended it; toggles for the streak lines and each kind of multi-kill), then
  each player's APM, teamfight share, longest streak, multi-kills, first blood, runes, courier
  kills, biggest single hit and pings, their public benchmarks (OpenDota's percentile against
  public games on the same hero) and pauses. On players and heroes: totals and averages, streak
  levels and multi-kills, deaths by source (hero, tower, creeps, neutrals, Roshan; only games
  whose log has every death) against the league, and benchmarks against the league's same-role
  average. Streaks: OpenDota's counts are the headline; the chart rebuilds runs from kill and
  death times, which matches those counts for 97% of players in games with full death logs.
- **First blood** — a game fact, a gold-chart layer, tags on the scoreboard, Combat table and
  weekly lineups, a line on the Laning tab, a column on player and hero game lists, first blood %
  and died first % on the Players table and stat ranks, team cards (rate, record with and without
  it, usual time, league rank), and the week's fastest.
- **Items** (AD2L only; OCR can't read item icons) — final items and when each core item was
  finished, and the Build order (purchases and skill build). Hero pages: most-built items, average
  and fastest time, win % built. Player pages: their timings against the league's on the same
  hero. Item tables show a "Lead swing": the team's lead change in the 3 minutes after finishing
  the item minus the 3 minutes before (timing, not cause: teams already ahead finish items
  sooner); greyed under 3 games. Core = built from parts for 1,000+ gold, or Blink / Aghanim's
  Shard; a part later upgraded (Yasha → Manta) counts as the upgrade.
- **Ward maps** (AD2L) — every observer and sentry from the replay, as the ward's icon in a
  team-coloured ring, greyed when dewarded (hover for time placed, how long it lasted, dewarded or
  not). Player, hero and team pages show all their wards with a side switch: Both sides (Dire
  games mirrored so it's always "own base bottom left"), or As Radiant / As Dire. Filter by ward
  type and game phase (0–10', 10–20', 20–35', 35'+).
- **Map tab** (game, player, hero, team) — one map at a time with buttons to switch between
  wards, towers, deaths, team fights, smokes and vision; the last pick is remembered from page to page.
  A game's maps share overlay checkboxes (off at first, remembered): Kills (the dead hero's
  portrait; teamfight kills only, since OpenDota records no spot for the rest), Teamfights,
  Objectives (buildings; Roshan and Tormentor at the pit / spot for that time of day) and Wards
  (placed, crossed when dewarded). Each map draws them over its own window and counts what's in
  it, including kills with no recorded spot (about 46% of deaths across S48: lane kills and
  pickoffs).
- **Smokes** (AD2L game and team Map tabs) — kills OpenDota flags as made out of Smoke of Deceit.
  OpenDota keeps no time or place for when a smoke was used, so the map shows where each gank
  ended (the victim's spot, only for deaths inside a teamfight; about 55% of smoked kills) and the
  chart shows when. Game: a timeline with a row per team, shaded where a team used a smoke inside a
  teamfight, and smokes used per team. Team: their smoke kills and the ones on them (Dire games
  mirrored, or one side), kills out of smoke by game minute, and per game smokes used, kills out
  of smoke and their share of all kills, against the opponents'.
- **Tower maps** (AD2L) — every tower, barracks and Ancient by game phase: what's standing at the
  end of the phase, what fell in it (with the time) and what fell earlier (faded). Hover for who
  took it, creeps, or a deny. Building spots are hand-placed along the lanes, so they can be a
  map unit or two off.
- **Vision** (AD2L) — what each observer ward could really see on the patch's map (elevation,
  trees, walkable ground and blockers; line of sight follows devilesk's vision simulator: higher
  ground blocks sight from below, a tree blocks a viewer below its top). Each team's observer
  coverage at each minute as % of the walkable map outside its own base (a Vision view on the
  Graphs tab); per player, `new_vision` = the share of their wards' ground they were first on
  the team to light (a column in the Map tab's Vision & objectives, and the support "New vision" tier metric);
  `ward_vision` = the same, less ground the team's standing towers saw (tower sight shrinks at
  night; a fallen tower sees nothing) — the playoff model's "Vision %", which replaced its new
  vision and ward uptime (pos 4: 11, pos 5: 22, their points added). The
  Vision map has two modes. Moment: a time slider and play button showing each team's lit ground
  and the observers up, with overlays for Towers (standing then, with their sight), Sentries
  (1050 true-sight rings) and Night (night is 5:00–10:00, 15:00–20:00…; towers drop from 1900 to
  800 at tier 1 or 1100 above; observers see 1600 day and night). Range: everywhere lit at some
  point between two times, stronger the longer it stayed lit. Trees cut during the game aren't
  in OpenDota's data, so all trees count as standing.

## Uploading games (scrims and unticketed AD2L)

1. After the game, on the post-game screen, snip the **overview** (hero cards with K/D/A and net
   worth) with Win+Shift+S and press Ctrl+V on the Upload page.
2. Open the **Scoreboard** tab, snip it, Ctrl+V again. Don't hover over anything: tooltips cover
   numbers.
3. Click **Read screenshots**, fix anything red or flagged, **Save to league**.

Player names are checked against every name the site knows: the division's rosters (Champion's
for scrims, since scrim teams are the Champion teams), stand-ins from its games and names from
earlier scrims. Close misreads are fixed automatically ("Icarus<" → Icarus, "MERCURY" → Merc-Ury)
and listed so you can see what changed; looser resemblances ("Daddy Kaleb" ~ Kaleb) are offered
as a one-click suggestion, since an in-game name can differ from a roster name on purpose. A name
that isn't on the team's roster asks: same player or a stand-in? The same game uploaded by both
teams is detected and saved once.

- **Private scrims** — tick "Private" to post the result only (teams, winner, kill score,
  duration). Heroes, players and stats never leave the browser. Private games count toward team
  records but not the tier list, player or hero tables. The game ID is built from teams + kill
  score + duration only, so it can't be used to guess a private game's heroes.
- **Unticketed AD2L games** (AD2L → Upload) — division games played without a league ticket (so
  OpenDota's league list never has them), uploaded like a scrim. Team names must be division
  teams (picked from a list, or filled in from whose roster most players are on), and you pick
  which missing game it is. They show as "Unticketed" and count on team, player, hero, weekly
  and tier pages; standings stay PlayOn's series scores. No draft, gold or ward data (those come
  from replays).
- **Editing and deleting** — open the game. Whoever uploaded it (from the same browser) sees
  **Edit** and **Delete** straight away; anyone else opens **Edit or delete this scrim** and types
  the league password. Edit loads the game into the review form: fix names, heroes, stats, teams,
  score or winner and press **Save changes**. The game keeps its ID, upload date (so its week),
  uploader, private flag and AD2L series, and the rules check the same shape as a new upload. The ID is still the one from the original teams and
  score, so a later upload of the same game with the corrected values won't be caught as a
  duplicate. Delete removes it for everyone. The password is a speed bump, not security.

### What's read, and how well

Hero, level, K/D/A, net worth, LH/DN, GPM, XPM, heal, hero damage, team names, score, duration,
winner. Clan tags aren't read (the tag font defeats OCR); type them if you want them.

Measured on one real game: 99% of fields exact on the original, 96–99% for 4K-size,
tighter/looser crops and JPEG, ~83% when the screenshot has been shrunk to 1440p-size (real 1440p
captures are sharper than that test). One game is a small sample: the review step is there for
the misses.

Wider screenshots (the whole monitor, the Dota menu bar, a browser or Discord window beside the
game): when the first reading fails or finds fewer than 8 players, a second pass
(`public/lib/ocr/locate.js`) cuts away bright windows, finds the hero cards or the scoreboard
headers anywhere in the image, crops to the framing the first pass was tuned on and reads the
crop. It's used only if it reads more (and at least 5 players), so a good first reading is never
replaced. It also rescues a screenshot taken of the wrong screen because the words GPM/XPM were
visible in another window. On the test screenshots pasted into wider frames, every frame reads
as well as the original; the one miss left is a full-monitor capture at 1920 wide, which is the
shrunk-resolution problem above, not a finding problem.

## Draft model and Drafter

- **The model** (`public/lib/cmdraft.js`) is Project Sybil's Captains Mode draft model (by
  ybabts and Fav; [muelltyl.dev](https://muelltyl.dev/)), ported to the site, with Sybil's fitted
  weights (`public/lib/sybil-fitted.js`): fitted on 10,461 AD2L games, S31–S48; held out on patch
  7.41 its favourite won 64% (AUC 0.70). It reads each picked hero as the player most likely to
  play it (worked out from every player's recent heroes and positions, over every way to give the
  side's heroes to different players), and that player's record on it, shrunk toward the hero's
  win rate at the game's rank. A pick moves the chance only by how much better or worse the hero
  is for that player than their usual heroes; a hero nobody on the team plays costs. The rank gap
  counts too. Not in yet: counters and synergy (Sybil's tables per patch), and how the teams have
  done this season (the rating is 0, as in Sybil's own sandbox). So bans never move the chance:
  a ban only denies.
- **Team drafts** (AD2L teams, under the Series tab) — every drafted series, newest first, with each game's draft
  chart drawn from the team's side (their chance to win before the draft and after every step),
  how far the draft moved it, and a link to the game's step-by-step Draft tab. A line on top says
  in how many drafts the model moved the team's chance up, and by how much on average.
- **Drafter** (AD2L, its own tab) — draft for any two teams. Start from an upcoming series in the
  division, any two teams from any division, or a past game (its draft loads in full; click any
  step to rewind and branch, and "In the game" shows what was actually picked there; links to the
  game page and, for ticketed games, OpenDota, Dotabuff and Stratz by match id sit above the board). Pick who
  has first pick and who is Radiant, and which five play (default: the five with the most league
  games for the team). On a pick, **Picking for** says which player the pick is for (default: the player with no hero yet) and at which open position (default: the open one they play most); the list then shows heroes for that player at that position, scored with the hero as theirs, and the pick is recorded as theirs. A past game's picks are pinned to who actually played them. Every step lists the model's best 8 (picks: the team's chance to win with
  the hero and who would play it; bans: points the hero would add to the other team and who on
  it would play it), and every hero in the grid shows its value. Undo, reset, or click a filled
  slot to rewind. **Positions:** the model has no rule against a third carry (Sybil measured a
  doubled-position penalty as worth nothing), so, as on Sybil's own drafter, the list only offers
  a pick for a position the team hasn't filled, and a ban for one the other team hasn't. A hero
  fits a position when ranked pubs play it there 8%+ of the time (Sybil's lane-parsed table) or a
  player on the team has played it there in 2+ lane-parsed games. Each suggestion and pick slot
  shows its position; "Only open positions" turns the filter off. Any of the five positions can
  be picked for; one an earlier pick holds moves that pick. On a ban, **Ban for** narrows the list
  to one of the other team's positions. A pick plays where its player plays (a mid player's Earth
  Spirit is a 2), with the hero's pub positions only breaking ties; a position you chose for a
  pick is kept. **Flex** heroes (two or more roles, 4 and 5 counting as one: 20%+ of pub games
  there, or 4+ lane-parsed games there by someone in the game) are marked in the list, the grid
  (gold corner) and the board. A player with no history (a stand-in, a private profile, or a division not yet
  synced) reads as an average player at the game's rank. The rosters list each player's Stratz,
  OpenDota and Dotabuff pages (by account ID) and PlayOn page (by the PlayOn player id the sync
  reads off the team page; missing until a team is re-synced). The hero picker is the **Hero
  grid** by default (toggle to **All heroes** for every hero by attribute; the choice is
  remembered): either team's Hero grid for Dota (the team page's, any template), opening on the
  team that isn't mine; "you" is my team, or else the other team in the draft. It follows the
  draft: heroes gone are greyed, ones with no open position faded, and each shows the model's value
  for the step in play; a click picks or bans it. Find a hero lists matches from every hero, to
  play or drag in. Customise the grid mid-draft: drag heroes in from the suggestions or the
  search, or press + on a suggestion to add it to the selected box (else the first of yours);
  save the template to keep it. Saving into Dota folds away under the grid.

## Predictions

- **AD2L** (Predict) — type your name and call each series this week: a 2–0 either way or 1–1.
  One point per correct call; picks lock at the series start (the database stamps each pick with
  server time, and scoring ignores anything stamped after the start). Standings group by the
  typed name, and "The model" competes using what it would have predicted each week from earlier
  weeks only. The model: team ratings fitted to every game result (PlayOn scores), pulled toward a
  roster-medal starting point, with the pull and medal weight tuned by replaying the season;
  games treated as independent (2–0 = p²). Its call never hedges: it takes the favourite 2–0 (the
  odds bar stays honest). Each series has the model's full draft: all 24 steps in S48's Captains
  Mode order (first-pick team bans 3/2/2, the other 4/1/2), with a toggle for who has first pick.
  Bans weigh the team's recency-weighted ban habit in that phase, what the opponents still to pick
  have been playing (league games with a two-week half-life, pubs since the last league night),
  and the division's usual bans; picks give each player the best hero left in their pool.
  Each card also carries the **draft model** (separate from the ratings, which it doesn't
  change): its chance for one game before the draft, from the ten likely players alone (each
  team's five with the most league games, averaged over who takes Radiant), and, at the top of
  the card's one **Model's draft** expander ("Best draft, and the odds after it", above the
  likely draft; one First pick switch drives both), a full draft it builds for both teams with
  the Drafter's rules (first-pick team on Radiant), with the chance before and after it, the
  step chart, and each team's heroes, players and bans. Measured on this
  season's games read before they were played (`scripts/measure/draft-model.js`): before
  the draft it was no better than the ratings, which is why the ratings stay as they are.
- **Playoff picture** (`lib/playoffs.js`, `parts/playoffs.js`) — Predict has four tabs, each
  its own link (`?tab=calls|board|bracket|odds`, Back works, the last one remembered): **Predictions**
  (this week's cards, then **Latest results**: the last played night's series with the model's,
  the crowd's and your call, that night's top scorers, the model's and your score; a name opens
  their history), **Leaderboard** (standings, each row with last week's right/called and how its % moved since, past weeks; the pick history and bracket fold under a closed **Your picks ▾**
  (another name's picks when you're not on the board), so the board stays short; click a name to open it on their pick history —
  every counting call, newest night first, with the result, a ✓/✗ and each night's score; the
  model's is its replayed calls plus this week's — then the bracket and
  final table their series calls lead to, read-only; only series calls are saved, so their
  tiebreakers and bracket go the model's way), **Bracket** (a Your picks / Model's picks toggle)
  and **Seeding** (worked out the first time its tab opens). The name bar sits above them.
  - **Your picks** (Bracket's default): unreported series go the way the viewer called them on the cards
    above (uncalled ones, and unposted weeks, take the model's call and say so). The table and
    tiebreakers follow from that; the viewer then clicks winners in the tiebreakers and the
    bracket, and picks seed 1's opponent. An unclicked tiebreaker shows the model's pick
    (dashed); the bracket has no winners until clicked: week 1 comes from the seeds, and every
    later slot reads TBD until the match feeding it is picked. Clicking your own pick again
    clears it. A progress strip counts series, tiebreakers and bracket matches picked. Saved in localStorage per division, keyed by
    the two teams, so a pick sticks while that pairing exists.
  - **Model's picks** (Bracket's other side): everything below.
  - **Seeding**: every way the open series go (3 results each, so 3^n outcomes), and in
    each every way its week 8 tiebreakers go; a grid of each team's share of each place plus
    summary columns: upper bracket and playoffs (running totals), or for Heroic/Aegis the four
    brackets on their own (Aegis upper 1–2, Aegis lower 3–4, Heroic upper 5–6, Heroic lower
    7–8). Counted equally (a tiebreaker splits its outcome in half) or by the model's odds.
    Ties on wins follow the rules on each outcome's own final table (SoS from those results):
    across a line, week 8 both ways; teams are ranked (for the week 8 table and for seed order)
    by SoS → head to head → highest common opponent → a 1v1 solo mid (only for 1st or a line;
    any other seed order is a coin flip), both counted 50/50
    (every order the same for 3+ teams) whatever the weighting, one result per group of teams.
    "How the tiebreakers work" sits under the grid too. Under it, per division, two tables:
    **Possible week 8 tiebreakers** (chance, line, teams level, wins, places, the rules' format
    for that case) and **Possible 1v1 mids** (chance, teams, wins, what they're still level on in
    the likeliest way there: SoS, head to head, record v the highest common opponent; what it
    decides: seed order, or their order in a line's tiebreaker). Top 10 each, "Show all" for the rest; "What leads to it"
    lists the ways there, like a place's (`lib/playoffs.js` `pathsToEvent`). Random runs give the
    chances only.
    Click a cell for what it takes to finish there, or a team for every place: the ways, each a
    collapsible card side by side (share, the team's own result, "+ N more results"; all open) listing
    every result it needs in full. Any one way gets them there. Each place is its own collapsible
    box (closed unless it's the place picked), coloured best first: gold, green, teal, sky, blue,
    indigo, violet, magenta through the playoff places, red for any place out of them; the place
    bars on the team page match. The team's own series is worded from its side ("beat X 2–0") and
    in gold; others plainly ("A beats B 2–0", "A wins or 1–1 v B"); week 8 names the games
    ("Week 8: beat X, then lose to Y"), or "the other week 8 tiebreakers" when it rests on
    games it isn't in. Over 3^9 outcomes, or while weeks are unposted, it runs
    4000 random runs instead and lists no paths. Each division is worked out on its own (its
    results can't move the other's table), so Heroic is 3^6 and 3^5, not 3^11.
  - **Team page → Outcomes** (AD2L teams): the same for one team, worked out when the tab opens:
    likeliest place, the summary columns as cards, a bar per place (click one for what it
    takes; every place shown by default), and a link to Predict's Seeding. A 1v1 mid counts 50/50, as
    on Seeding; a line under the bars says how ties go.

  The model's picks: the playoffs if every remaining call goes the model's way. Unreported series get the model's
  call; weeks PlayOn hasn't posted (up to 7) are paired swiss-style as a labelled stand-in (table
  order, nearest team not yet met). Then the final table (wins, SoS, where each place goes), the
  week 8 tiebreakers by the rules' table (ties across the 4th/5th and 8th/9th lines are played,
  with the predicted winners; seed-only ties go SoS → head to head → highest common opponent →
  1v1 solo mid, the model's stronger team) and the double-elim bracket to a champion. Bracket shape from S47 on PlayOn: seed 1
  takes the weaker of 3 and 4, lower round 1 is 5v8 and 6v7, the loser of seed 1's match meets
  the 6v7 winner. Under 8 teams everyone's in (4: all upper; 5–6: 5v6 lower), the site's
  assumption. Heroic/Aegis (admin on Discord, 2026-10-05): top 8 of each division make it; 1st–2nd
  start Aegis's upper bracket, 3rd–4th its lower, 5th–6th Heroic's upper, 7th–8th Heroic's lower,
  so the tables have lines after 2, 4, 6 and 8 and ties across any of them are played. The
  crossover isn't stated: the site seeds A1, B1, A2, B2, A3, B3, A4, B4 (Heroic: 5th–8th), giving
  A1 v B2 and B1 v A2 upper, A3 v B4 and B3 v A4 lower, no seed-1 choice. The A and B views show
  both divisions and both brackets (the picture loads the whole league). Every Bo3/Bo5 (tiebreakers, bracket; the grand
  final as a Bo5) shows the model's score and the chance of every score (`bestOfScores`, games
  independent). The winner's likeliest Bo3 score is always 2–0, since 2–1 needs a dropped game;
  a Bo5 is 3–1 until the favourite wins over 2 games in 3, then 3–0.
- **Scrims** (Scrims → Predict) — anyone adds an upcoming scrim (two teams, start time,
  Bo1/Bo2/Bo3); everyone calls it until it starts, same name-based leaderboard. Each card has
  **Upload game N** and **Private result** buttons that open the upload page with the scrim's
  team names filled in (and a one-click fix if the in-game names differ). A game counts toward a
  scrim when it's between the same two teams and was uploaded from 2 hours before the start to 3
  days after. Odds come from a rating per team fitted to every scrim result, pulled toward even. A Bo3
  card also shows the model's score and each score's chance (picks are still just the winner).

## Fantasy (AD2L divisions)

The tier list and Fantasy share player cards (`parts/player-card.js`), including saved hero
and role choices. Every card front shows the player’s win-loss record; tier cards keep their
selected tier model’s rating and a separate Breakdown button. The tier list uses compact
portrait trading cards with text and controls on the cards, one row per tier; crowded rows scroll sideways. Fantasy keeps full-size cards.

A card's owner can turn on its **Dota Plus hero level** (Card layout → Front): the in-game badge
for the card's hero, under the tier shield, and beside each of the back's top heroes. Off by default.

Team logos appear beside the team name on both card faces and beside each team-page title.
The 74 playing teams use local 128px images, matched by PlayOn and in-game Dota IDs;
source records are in `scripts/gen/team-logo-sources.json`. Bye-week placeholders have no logo.

Predict's **Fantasy** tab (`<league>/predict?tab=fantasy`; `pages/fantasy.js`, loaded when the
tab first opens; rules and scoring in `lib/fantasy.js`). One game per division after the shared tiebreaker test; Heroic A/B views
play the whole Heroic/Aegis game. Predict's "Your name" bar hides on this tab (Fantasy has its own).

- **Sign in with Steam** — **Sign in** in the top bar (left of the settings cog) or on the tab.
  Signed in, the top bar shows your Steam avatar (from OpenDota's public profile, kept a day);
  it opens your player page in the first league whose roster has you (the one you're viewing
  first), else your page in the league you're viewing (`parts/me.js`).
- **Profiles for everyone on Steam** — every player who has signed in with Steam has a player
  page, on a roster or not. For one on no roster (`parts/scouted.js`) their visit signed in
  scouts their public OpenDota history (rank, last 30 days of pubs, all-time heroes in pubs and
  practice lobbies) and saves it, again at most every 6 hours; the page shows Recent pubs and All time, plus the card collection, tickets and gift box
  every profile has. A private match history gets a note saying so. Their sign-in registers their
  Steam name, which names them in the Gallery and Feed and puts them in search ("Not in a
  league"); a name not registered yet is read from OpenDota. Sign out is on the Fantasy tab. The sign-in
  sends you to Steam's own page; the Worker
  (`workers/steam-auth`, https://steam-auth.ad2lstats.workers.dev) checks Steam's reply and returns
  a Firebase sign-in for `steam:<account id>`. It runs on its own Firebase session, so the
  anonymous one that owns this browser's uploads is untouched. Only the Steam ID is shared.
- **Each week** — five picks, one per position (Pos 1 Carry … Pos 5 Hard support), from rostered
  players of teams with a series that week (no byes, no stand-ins); never yourself, teammates
  fine. "Your picks", a dark display case, stands each pick's card face up on a lit
  pedestal engraved with its position (click the card to turn it over; the pedestal is the tab
  for that position; a back under 200px wide uses a compact layout; on a phone the case scrolls
  sideways). It sits over a deck of player cards
  for the open position: tier and rating (playoff model), top hero's art filling the card in that
  hero's style. Fav picked one image and one style per hero (`scripts/gen/hero-art-picks.json`:
  loading screens, arcana and release art from the Dota 2 wiki, Valve's site and the Steam
  market); `node scripts/gen/gen-hero-art.js` self-hosts them as `img/hero-art/<slug>.webp` and
  writes `lib/hero-art.js`. Styles (style.css `.ft-card[data-style]`, SVG filters in
  parts/player-card.js): stencil, the default worn print to match the display type (posterize
  `#ft-paint`, speckle mask `img/grit.png` from `scripts/gen/gen-grit.js`), clean, cinematic,
  ember, frost, ink and noir. A hero without a pick (a new one) gets Valve's `_vert.jpg` as
  stencil; art that fails to load falls back to the wide image. Each card is a trading card (5:7)
  in a metal frame of its tier's colour: the front shows the art, tier shield, main position and a
  nameplate (name, player win-loss record, team, card hero) with a Pick button; clicking the card anywhere else (or its
  turn button, from the keyboard) turns it to the back: games, win %, average
  K/D/A, then GPM, XPM, hero damage and last hits for a core (pos 1–3) or observer/sentry wards
  placed, camps stacked and healing for a support (pos 4–5); latest medal with Core or Support,
  games per position, and the three most-played heroes with games and win %, plus a Pick button. On a mouse the card tilts toward
  the pointer with a foil shine; picking lifts it (gold frame, the button reads "Picked") and drops it onto its
  pedestal before moving on. Reduced motion turns the animations off. Cards of players whose role is
  that slot come first, best rated first; the rest fold under "Everyone
  else". Picking a card moves on to the next empty slot; picking it again clears it; a player
  picked elsewhere is dimmed with "In pos N · move here" on its button, and picking them moves
  them. Signed out, the buttons read "Sign in to pick" and start the Steam sign-in. Picks can be
  changed until the week's first series starts (weeks run Monday to Monday UTC). The database
  stamps each save with server time; a save after the lock never counts.
- **Card customization**: the Fantasy tab links to Collection customization. Hero, role,
  artwork, filters, framing, borders and signatures are managed there with three saved designs,
  a primary card and optional shuffle. Fantasy uses the shared card renderer. Layout settings:
  your own card name and its size; each front part shown or hidden, sized, and dragged anywhere;
  up to eight back stats in any order; the back's position bars and top heroes on or off.
- **Full-size cards**: every card has an expand button under its flip button that opens it
  filling the screen; it still flips.
- **Feedback on profiles**: a player's open feedback tickets show on their profile, and ones
  Fav has implemented show "Implemented" for a week.
- **Profile Feed**: a **Feed** tab on every player profile (a Feed section on the page of a Steam
  player on no roster) shows only that player's posts, saved cards and pulls, with the same
  reactions and comments. No post box there; a link goes to Gallery › Feed. On your own profile,
  **Auto-post to my feed** chooses what the site posts for you: new card designs (on to start),
  pack pulls by rarity (common, rare, epic, legendary; epic and legendary to start) and loading
  screens (off to start). Changes apply to new posts; old ones stay until you delete them, and
  you can delete any of your own there.
- **Card ratings**: on a profile, each saved design shows how players rated it (common, rare,
  epic, legendary) and the community's pick. Signed in, you get one vote per card (changeable),
  never on your own. Votes belong to the design: changing the card starts it at none, and
  changing it back restores them. Your votes are kept by the Worker, so the button you pressed
  shows on any device.
- **Nickname**: signed in, set a nickname and pick which name shows, it or your in-game name, in
  Gallery › Customize or on your own profile (the Worker keeps it). Shown, it's the name on all
  your cards and signatures (a card's own name from its layout still wins on that card), on
  Gallery captions, and your profile title reads "Nickname (in-game name)". Plain text, up to 24.
- **Gallery** (nav tab in every league, `#/<league>/gallery`; `/cards` still works):
  opens on the **Feed**: player posts, newly saved cards and pack pulls (what each player
  auto-posts; see Profile Feed), newest first. **Show** filters to one kind (posts, clips, games, screenshots, polls, card designs, pack pulls) and **Newest / Trending / Top** sorts: Top by score (one point per player who reacted, two per comment), Trending by that score fading with age (lib/feed.js sortFeed; the Worker sorts before paging). Profile Feeds have the same bar. Signed in, the post box takes text (Dota emoticon codes work), up to 4 images (pick,
  paste or drop; shrunk in the browser), a clip link (YouTube, Twitch and Streamable play in the
  post behind a play button; Medal and Allstar show as a link) and **Highlight a game**: one of
  your league games, shown with hero, K/D/A, result and badges worked out from the season's data
  (Rampage, Ultra kill, League-best and Career-high kills/KDA/GPM/damage/last hits, Deathless).
  **Poll** turns the post into a question with 2 to 6 choices and a time limit (1 hour, 6 hours, 1 day, 3 days or 1 week). Signed-in players pick one choice and can change or take back their vote until it ends; the bars and percentages show once you've voted or it has ended (hover a choice for who picked it). Polls take reactions and comments like any post, and each vote counts a point toward Top and Trending. Delete any of your own posts, saved cards and pulls included. React to a post with a tap (hold for all the Dota emoticons) and
  comment under it. **Comment threads**: **Reply** under any comment (one level; replying to a
  reply joins its thread), and each comment has a small reaction button that works the same
  way. A comment's writer hears about replies, a post's owner about new comments. **Mentions**: type **@** in the post box or a comment
  box and part of a name to pick a roster player or a team (Enter, Tab or click). It shows as a
  gold link to their page, highlighted when it reaches you. A mentioned player gets a "mentioned
  you" notice; a team mention reaches everyone on its roster (up to 25 pings). Stored as
  `@[Name](p:<account>)` / `@[Team](t:<league>:<id>)` (lib/mentions.js). The writer,
  the post's owner or Fav can **Remove** a comment; one with replies shows "Comment removed"
  and goes once its last reply does. **Unfollow** on anyone's post hides all their posts from your Feed;
  the "unfollowed players" list above the feed follows them again. Moderation: posts and
  comments go through a word filter (slurs and explicit terms, disguises undone; ordinary
  swearing passes), images through an AI check (nudity, real gore, hate symbols), and Fav can
  delete any post and **Ban** a player (on their post or comment) from posting, commenting or
  reacting, any mix of the three, for some days or until lifted (list with what each ban covers,
  Change and Unban above the feed). **Gallery** sub-tab (`#/<league>/gallery/gallery`) is every saved card
  anyone in the league has changed from the default, each with its ratings and the same vote
  buttons as the profile. The other sub-tabs (Packs, Collection, Customize, Recycle;
  `#/<league>/gallery/<tab>`) are your own collection on a full page, the same as the collection
  dialog; the top bar's gift button opens Gallery › Packs. The dialog still opens from Fantasy and
  profiles, with the same tab order. Three rows of cards a page, with page buttons under
  them (columns follow the screen width). Sort by newest (the default), voted rarity
  (legendary first; among equals, the clearer verdict, then more votes), most votes, or player
  name; the sort you pick is remembered in that browser. Signed in, "Not rated by me" leaves the cards you can still rate. Names link to profiles.
- **Loading screen packs**: each contains five unowned screens and no card items. All 443 screens
  have equal drop chances. Every Steam player receives three packs once on their next visit,
  including new sign-ups, with a "Fav sent you" notice. Normal card packs also include two
  unowned screens while any remain. Screens appear in Collection with hero and ownership filters,
  can be previewed before collecting, and become card backgrounds in Customize. Hero-specific
  screens fit their hero; event and team screens fit any hero. Near completion, a pack contains
  the remaining screens; when none remain, it stays unopened.
  Images ship as `public/img/loading-screens/*.webp`; regenerate with
  `node scripts/gen/cache-screen-art.js` after updating the catalog. The October image fix restores
  every earlier screen-only opening with a replacement pack on the player's next Steam session,
  once per account. It preserves discoveries, pending packs and the refill timer.
- **Gifts from Fav**: the profile gift box sends any pack type, copies of any card item (border,
  finish, signature or name rendering), or a specific unowned screen. The Worker verifies the
  sender's Steam account and makes retries safe. Notices name the actual gifts and include an
  optional note. Dismissing a notice never removes the gifts.
- **Captain**: choose one of your five picks as captain before saving. Their weekly points are
  doubled after selecting their best two games. Captain choices lock with the lineup and are
  stored as an account ID in the entry. Older entries without a captain retain their base score.
- **Announced series** — series the admins announce before PlayOn posts them
  (`lib/divisions.js` ANNOUNCED) count as that week's series, so the week opens on time; PlayOn's
  own series replace them when the sync brings them, and their games count by teams and week.
  S48 week 8 tiebreakers (Thu Oct 15, start assumed at the usual league night): Challenger
  Castaway Baes v Get Ganked Challenger 2 (Bo3, 4th seed), Champion WIMCC v SWM.Twinks (Bo3, 8th
  seed), Heroic Josh A. Suicidal Thoughts v A femboy + 4 Mejicanos (Bo1), the winner v Team
  Awesome (Bo1, 8th seed). This first test week pools these divisions into one shared game available from every division. Afterward, only the selected division’s playoff bracket is eligible. The shared test remains available for review.
- **Scoring**: raw stats multiplied by fixed fantasy weights, with no curve or comparison
  against other players. Best two games per pick count; a pick who does not play scores 0.
  The scoring and rules info bubble lists every weight. Missing stats count as zero.
- **Player lineups**: open any saved entrant and week to see their five player cards, points
  per pick, and weekly score breakdown. The breakdown lists each game's stat contributions,
  counted or dropped status, and a link to the game. Unlocked weeks display pending scores.
- **Leaderboards**: playoff totals and weekly boards below the lineups. The cross-division
  tiebreaker test has a separate leaderboard and does not add to division playoff totals.
- Local preview only: `?fantasy_now=<unix seconds>` sets the clock, to see an open week out of
  season; `?fantasy_me=<account id>` shows the tab as that player (their own card), display only.
