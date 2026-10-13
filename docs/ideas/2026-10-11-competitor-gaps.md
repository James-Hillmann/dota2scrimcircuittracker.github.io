# Competitor gaps — 2026-10-11

Compared with Dotabuff, OpenDota, Stratz, Project Sybil and the in-game client. Status: decided,
nothing built. Build order at the bottom.

Data checked 2026-10-11 against `.cache/opendota` (1,031 matches; 446 of the 459 league games
cached). Items 1–4 and 9 need parsed replays, so screenshot uploads and scrims don't get them.
Facets dropped: `hero_variant` is empty in all 1,999 player rows sampled.

## The ten

1. **Damage breakdown** — game page Combat tab first: per player, damage by source (ability,
   item, right-click) and by target, damage taken by source. Player and hero pages after review.
   Cached: `damage_inflictor`, `damage_targets`, `damage_inflictor_received` (~1.6 KB raw per
   player, so its own per-division file loaded on demand, as decided 2026-09-28).
2. **Gold and XP sources** — stacked bar per player on the game Farm & vision tab, and a season
   bar on the player Stats tab against the position average. `gold_reasons` / `xp_reasons`, in
   every cached player.
3. **Laning positions heatmap** — a Map tab view on game, player, hero and team pages (team:
   all five, coloured by position; Dire mirrored like ward maps). `lane_pos` covers only ~11
   minutes (~690 one-second samples), so it's named "Laning positions".
4. **Talent win rates** — full 10/15/20/25 tree on the hero Skill build tab, pick % and win %
   each side. Needs `scripts/gen/gen-ability-meta.js` to keep talent levels and values from
   OpenDota's constants (today names lack numbers and levels aren't kept).
5. **Peers** — player page tab: teammates and opponents with games and W–L, stand-ins marked,
   within the league viewed.
6. **Season records** — a "Season records" tab on Content (also the home for the declutter
   plan's fluff stats) and Personal bests on the player Stats tab.
7. **Trends by week** — all four: player stat by week (Overview, with position average line),
   team stat by week, hero pick/ban rate by week (Heroes tab), tier rating sparkline on tier
   list cards.
8. **Game tags** — BUILT 2026-10-11 (uncommitted; Stomp tuned to 20k + loser never ahead). chips on every game list: Stomp / Comeback / Throw, Rampage / Ultra kill,
   Long / Short game (division's top/bottom 10%). Not Upset.
9. **Event log** — new Log tab on the game page: kills, runes, buybacks, Roshan, Tormentor,
   buildings, filterable by type and team. Add `runes_log` to the sync.
10. **Public item timings** — hero Items tab, public win % by timing next to league timings.
    `/scenarios/itemTimings?hero_id=` (tested: Anti-Mage 217 rows, ~1,000 games per top item),
    ~127 calls, refreshed weekly in the sync. Unchecked: OpenDota's sample window.

## New ideas

- **Fantasy league** — BUILT 2026-10-12 (site code uncommitted; Firestore rules deployed 2026-10-12, dry test 213/213,
  live save/read/delete tested). **One game per league** (each division its own; changed 2026-10-12 from
  one cross-division game). **New picks every week**: 5 players from that league, one per
  position, locked at the week's first series start. Scoring: each game's points under the
  **playoff tier model** (`lib/tiers.js` NEXT version: per-position stat points, flat winning
  −15..+15, consistency, podium). A pick is scored **against the slot's position**, even in a
  game they played another role. **Only their best 2 games of the week count** (a Bo3: best 2 of
  3). **Only players whose team plays that week can be picked** (no byes). **Your own teammates
  are fine.** **Leaderboard: season-long, counting from launch on** (no back-scoring of earlier
  weeks). Unconfirmed default: a pick who sits out scores only the games they played (0 if none).
  Worker: `workers/steam-auth/`, live at https://steam-auth.ad2lstats.workers.dev (2026-10-12;
  signs with the firebase-adminsdk key, secret FIREBASE_SA; end-to-end sign-in verified for
  account 173365627; site side: `lib/store.js` steamSignIn / steamAccount on a separate "fantasy"
  Firebase app so the anonymous upload session is untouched; tests in
  `test/steam-auth.test.js`). **A player can't pick
  themselves** (the Steam sign-in gives the
  account id, matched to rostered accounts). Sign-in: **Steam**, verified by a **Cloudflare
  Worker** that checks Steam's OpenID reply and mints a Firebase custom token (service-account key
  as a Worker secret; Fav creates the Cloudflare account). Rules edit goes in the Cookbook live
  rules.
- **Prep link** — the hero grid is the prep sheet; make it findable: "Prep for my next opponent"
  at the top of the Teams nav dropdown, using My team.
- **Counters and synergy** in the draft model — Fav gets Sybil's fitted per-patch tables; port
  like `sybil-fitted.js`, measure on this season before switching on.
- Live league night: no. Season badges: later.

## Order

Quick wins first: tags, peers, records, prep link, gold sources, event log, talents, trends,
heatmap, damage, item timings. Then fantasy (Steam + Worker) and counters once Sybil's tables
arrive.
