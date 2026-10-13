# Organisation audit — 2026-10-11

Is every page and element in its best spot? Walked on the local build (uncommitted tree included)
at 1440×900 and 375×812 (phone), Champion as the main sample, plus Scrims, All divisions and the
home picker. Method: the Design plugin's critique framework (first impression, usability,
hierarchy, consistency; findings rated by severity) and the Site Architecture Kit's page-tree
checks (one home per thing, nav labels, depth). The critique skill's source was read from
Anthropic's repo; the Site Architecture Kit only from its directory description. Nothing installed.

Pixel positions are where an element's top sits on the page (the first screen ends at 900 on
desktop, 812 on a phone). Status: decided 2026-10-12 (see Decisions); built 2026-10-12, not yet
committed (each decision below is marked BUILT, or left as is where decided so).

## Verdict

The top level is right: league → Teams / Content / Players / Heroes / Predict / Drafter / Upload,
and team, player, hero and game pages with tabs from one list (`lib/pagetabs.js`). What's off
sits one level down: a few tabs hold things that belong in another tab, the game page puts its
tabs below two screens of summary, and some things live in the settings cog that aren't
settings.

## High

1. **Game page: the tabs start below the first screen.** Banner, series strip, casts, facts,
   draft strip and the 680px gold chart come first, so the tab bar sits at **1,513px** on desktop
   and **1,916px** on a phone. Clicking a tab changes nothing you can see. Fix: put the tab bar
   straight under the banner + facts (≈ 500px). Move the gold chart into a **Graphs** tab, or make
   it the first thing in Scoreboard. Keep the draft strip on top, since it's small.
2. **Player and hero Games tab: the list is at the bottom.** "Game analysis" (one game in depth,
   ~2,700px) comes first, and "Every game" starts at **3,132px** (player) / **2,551px** (hero).
   Someone opening Games wants the list. Fix: list first, and each row opens its analysis
   (a row click, or an **Analysis** tab that the row links to).
3. **Phone nav hides Predict, Drafter and Upload.** The nav scrolls sideways (586px in 375px),
   so the gold Upload button is off-screen with no hint. Fix: wrap to two rows, or put the last
   three behind a "More" item. Upload stays visible as the call to action.
4. **Phone Content: the week strip opens on week 1.** Viewing week 7, the current chip sits at
   x = 638 in a 375px screen. Fix: scroll the active chip into view on load.

## Medium: things in the wrong tab

| # | Element | Now | Better spot | Why |
|---|---|---|---|---|
| 5 | Gold lead curve | Team **Map** tab ("Gold") | Team Overview, or a Games/Series graph | Gold isn't a map. Objectives and vision on Map are fine. |
| 6 | Farm & vision tab headings | Game tab "Farm & vision" holds "Map & objectives" and "Fighting & laning" | Stuns, damage taken → Combat; lane efficiency, XP@10 → Laning; rename the rest **Farm & objectives** | The headings don't match the tab, and "Map & objectives" sits next to a Map tab. |
| 7 | Draft content spread three ways | Team: side/pick order and draft by phase under **Heroes**; model drafts under **Series**. Player: "By draft pick" under **Heroes**. Hero: its own **Draft** tab | A **Draft** tab on team pages (phases, side and pick order, model drafts), matching the hero page. Player keeps it under Heroes (small). | Same kind of thing, same place on every page. |
| 8 | Hero grid (the prep sheet) | Team **Heroes** tab at 1,533px, under the hero pool table | Top of team Heroes, or its own **Prep** tab. Pairs with the planned "Prep for my next opponent" nav link. | It's the most-used tool on a team page for a captain, and it's two screens down. |
| 9 | Pubs | Player **Heroes** tab: Recent pubs, pub form, Pub practice. Also on All stats (recent pubs column) | A **Pubs** section in player Stats, or its own tab when there are pubs | Pubs are about practice, not the league hero pool. |
| 10 | Hero "Teams" table | Hero **Players** tab, bottom (1,611px) | Hero Stats (next to "Best team on it"), or label the tab **Players & teams** | Not findable from the tab name. |
| 11 | Skill build and neutral items | Hero **Items** tab | Rename **Items & skills**, or a **Build** tab. Talents (planned) go in it too. | Skill build isn't an item; the talent tree will make this worse. |
| 12 | Team Overview "Recent series" | Overview, a 2,467px column with drafts open, repeating the Series tab | Last 3 series, collapsed, plus "All 7 series →" | It pushes Most played, Game length and Head to head down to 4,364–4,745px. |
| 13 | Settings cog holds tools | Table builder link, My team, Time machine sit with theme and colour-blind mode | Time machine on the pages it filters, as a chip by the title ("All weeks ▾"). Table builder next to Search. My team stays (it is a setting). | Things that change the data on screen shouldn't hide behind a cog. |

## Medium: consistency between leagues

14. **Scrim nav has Standings and Teams; AD2L folds them into Teams.** Scrims: Standings |
    Content | Teams | Players | Heroes | Predict | Upload. AD2L: Teams (standings) | Content |
    Players | Heroes | Predict | Drafter | Upload. Fix: scrims get one **Teams** item opening on
    standings (the team grid as a second tab). Then both navs start with the same five.
15. **Scrim addresses have no league in them.** Scrim standings are `/scrims/`, but its other
    pages are `/#/teams`, `/#/week`, `/#/players` (no `scrims`). So `/scrims/teams` is "Page not
    found". AD2L is `/champion/teams/` etc. Fix: `/scrims/<page>`, with old addresses forwarded.
16. **All divisions Content: 34 series chips before any series** (619px of chips). Fix: group
    the chips by division, collapsed, or show one division's chips at a time with a division
    switch.

## Low

17. **Teams opens on the last tab used.** `/champion/` opened on Race after a visit, and All
    divisions opened on Crosstable (8 tables, 4,785px). A league's front door should open on
    Table. Keep remembering tabs on detail pages only.
18. **Breadcrumb on a game always says Content** (`Champion › Content › game`), even when you
    came from a team or player. Minor; Back works.
19. **Predict Leaderboard opens the viewer's own pick history and bracket** (1,900px) under the
    table. Fine for regulars, long for a first visit; a collapsed "Your picks" would keep the
    board short.

## Already in the right place

- League switcher keeps the tab you're on. Search finds pages and sections, not just names.
- One tab list per page type (`lib/pagetabs.js`); nav dropdowns read the same lists.
- Player, hero and team tab orders match where they overlap (Stats/Overview → … → Map → Games).
- Footer holds data sources, sync time, tour and Discord. Header kept to nav, search, league,
  feedback and settings.
- Up next on Content (moved from Teams) and Outcomes on the team page are where people look.

## Suggested order

1–4 first (largest effect, small edits: reorder blocks, scroll a strip, wrap the nav). Then 8
with the planned prep link, 7 (Draft tab), 2's sibling 12, and 13. 14–15 together (scrim nav and
addresses), since 15 needs forwarding for old links.

## Decisions (2026-10-12, walked through one by one)

1. **BUILT.** Game page: tabs move up under banner → series → casts → facts; the draft strip stays above
   the tabs; the gold chart becomes its own **Graphs** tab (second, after Scoreboard). Tab bar now
   at 805px on desktop (was 1,513) and 1,245px on a phone (was 1,916).
2. **BUILT.** Player and hero pages: **Games** tab = the list only; a new **Analysis** tab (after Games)
   holds the game picker and the deep look; ANALYZE on a row opens Analysis on that game.
3. **BUILT.** Phone nav: Teams, Content, Players, Heroes + **More ▾** (Predict, Drafter, Upload).
4. **BUILT.** Content week strip: **newest week first** (latest on the left, week 1 at the end).
   Earlier / Later week buttons swapped to match.
5. **BUILT.** Team page: a new **Resources** tab (between Laning and Map) takes the Gold block (curve,
   gold at 10'/20', record ahead/behind, comebacks, throws). Map keeps strengths, objectives,
   vision and the maps. Natural home for the planned gold/XP sources too.
6. **BUILT.** Game page: "Farm & vision" becomes **Resources** (lane creeps, neutrals, ancients, stacks;
   gold/XP sources later). Obs, new vision, sentries, dewards, smokes, dust, Roshan, Tormentor
   and building damage → a table on top of the **Map** tab. Stuns, damage taken, time dead →
   **Combat**. Lane efficiency, XP@10' → **Laning** (lane efficiency was already in its lane
   table, so only XP@10' is added there).
7. **BUILT.** Team page: a new **Draft** tab after Heroes holds side and pick order, draft by phase (from
   Heroes) and the model's per-series drafts (from Series). Player's "By draft pick" stays
   under Heroes.
8. **BUILT.** Hero grid (prep sheet) moves to the **top of the new team Draft tab**; side/pick order,
   phases and model drafts follow under it. The "Prep for my next opponent" nav link and
   Overview's hero-grid link open it. (The prep nav link isn't built yet; Overview's link and
   site search's "hero grid" open Draft.)
9. **BUILT.** Player Heroes tab: pubs stay there, **collapsed** under one "Pubs and other leagues ▾"
   header (recent pubs, pub practice, all time pubs + esports). Hero pool and by draft pick
   stay open on top.
11. **BUILT.** Hero Items tab renamed **Items & skills** (core items, neutral items, skill build, and the
    planned talent tree).
10. Hero Teams table: **leave as is**.
12. **BUILT.** Team Overview: **drop Recent series** (the Series tab has it; the Form card shows recent
    results). The Roster box that sat beside it stays, next to Most played. Head to head moved
    up from 4,745px to about 2,460px.
13. **BUILT.** Time machine: **stays in the cog**. Table builder: a table-icon button **next to the search
    box**, removed from the cog.
14. **BUILT.** Scrim nav: one **Teams** item like AD2L (Teams | Content | Players | Heroes | Predict |
    Upload); the Teams page has tabs Table | Matches | Teams (the card grid).
15. **BUILT.** Scrim pages move under **/scrims/<page>/**; old `/#/week`, `/#/teams`… forward
    (in the app, and the deploy writes forward pages at the old /week/, /teams/… paths).
16. **BUILT.** All divisions Content: keep the layout; **colour each series chip by its division** (the
    division's menu colour). Low use, so nothing bigger.
17. **BUILT.** The league **Teams** page always opens on **Table**; a **team page** always opens on
    **Overview**, except when switching straight from one team to another (the team picker on a
    team page), which keeps the tab you're on. A `?tab=` link still wins.
18. Game breadcrumb: **leave as is**.
19. **BUILT.** Predict Leaderboard: your pick history and bracket fold under a closed **Your picks ▾**
    (it names the person shown when the viewer isn't on the board). Board tab 578px tall.

### Spotted in passing (bugs, not placement)

- **FIXED.** Game Laning tab: the first-blood note box overlaps the top-left lane card (seen at
  1440 wide). Cause: its class `fb-note` is also the feedback tool's fixed popover; renamed
  `lane-fb-note`.
- **FIXED.** Settings › My team lists the PlayOn bye placeholders ("Challenger Bye Week", "Heroic Bye
  Week"…) as teams. `myTeamOptions` drops them (`lib/playoffs.js` isBye).

### Build order

Small and self-contained first: 4 (week strip order), 16 (chip colours), 17 (opening tabs),
19 (fold), 13 (table-builder button), 3 (phone More menu), 12 (drop Recent series), 11
(rename). Then the tab moves: 1 (game tabs up + Graphs), 2 (Games / Analysis split, player
and hero), 6 (game Resources split), 5 + 7 + 8 (team Resources and Draft tabs, hero grid on
Draft; `lib/pagetabs.js` first), 9 (fold pubs). Last 14 + 15 (scrim nav and addresses, with
forwarding and share pages).
