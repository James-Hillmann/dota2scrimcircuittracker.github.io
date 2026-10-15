# Profile Feed tab and auto-post settings

Approved 2026-10-14.

## What

- Player profiles get a **Feed** tab: that player's posts only (their own posts, card saves,
  pulls), newest first, with reactions, comments and Delete as on Cards › Feed. Also on the page
  of a Steam player on no roster. No post box there; a link goes to Cards › Feed.
- On your own profile the tab starts with **Auto-post to my feed** settings:
  - Card designs: on/off (default on).
  - Pack pulls by rarity: common, rare, epic, legendary (default epic + legendary).
  - Loading screens: on/off (default off). Screen packs and normal packs' bonus screens.
- Settings decide future posts only. Old posts stay until deleted.
- Owners can delete any of their own posts, card saves and pulls included. Fav any post.
- Game highlights do not auto-post (dropped).

## How

- `lib/feed.js`: `FEED_AUTO_DEFAULT`, `feedAutoOf(state)`, `setFeedAuto(state, body)`,
  `pullPostItems(rewards, screens, auto)`; `canRemovePost` lets owners remove any own post.
- Worker `cosmetics.js`: action `feed-auto`; equip posts only if `cards` is on; the pull row keeps
  only enabled rarities plus `screens` when on; `/feed?account=N` filters to one player.
- `parts/feed.js`: `drawFeed` takes `account` (profile mode: no composer, filtered feed,
  settings panel for the owner); pull posts draw any rarity and loading screens.
- `pages/player.js` + `parts/scouted.js`: Feed tab mounts it.

## Tests

`test/feed.test.js`: defaults, validation, pull filtering, owner delete rules.
