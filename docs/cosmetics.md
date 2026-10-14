# Card collection

The approved launch catalog is `public/lib/cosmetics-catalog.js`, taken from
`cosmetics-review (3).json`: 33 borders, 14 finishes, 21 autograph effects, plus
one legendary Japanese katakana name-rendering unlock. Edit catalog rarity to
change future rolls; existing quantities remain owned. Removed designs do not drop.
Default grey, no finish, no autograph and original lettering are always free.

The actual shared player card defines geometry, artwork and crop. Cosmetics decorate
that card without changing its format. Signatures always use the player's displayed
name; custom signature text is ignored by the server and renderer. The editor saves
percentage coordinates, size and rotation. Signatures
can be dragged, moved with arrow keys, or positioned with sliders. A collected
language unlock combines with any collected autograph style. Katakana uses a local
phonetic syllable renderer; unusual English pronunciations can be approximate.
Collection's editor groups text and image controls into collapsible sections.
Hero, background artwork, filter, crop and hue are saved alongside cosmetics in
the collection service. Those base-card choices override older Firestore artwork
preferences in the shared renderer; no additional Firestore write rules are needed.
Each player can save three independent designs using the same owned cosmetics.
The existing card becomes Card 1. One saved slot is primary; owners see their
primary card in normal site views. Optional shuffle chooses among saved slots
for other viewers, consistently per player for that viewer's browser session.
Profiles show all saved designs and identify the primary. Empty slots are never
chosen by shuffle. Saving a design and changing primary/shuffle are authenticated,
transactional, replay-safe operations; inventories and pack counts are unchanged.

Each normal pack independently rolls three items: 69% common, 17% rare, 10% epic,
4% legendary. Any item category can occupy any slot if that category contains an
item in the rolled tier. Duplicates are allowed. Five extra copies of one rarity
recycle into a three-item pack with the next rarity as the minimum; the last copy
is protected. Higher-tier odds are the normal weights conditioned on that minimum:
rare packs 54.8387% rare / 32.2581% epic / 12.9032% legendary;
epic packs 71.4286% epic / 28.5714% legendary; legendary packs 100% legendary.
Legendary cards cannot be recycled. Packs may contain any combination of item types.

The first account session grants three welcome packs. Normal packs refill every
eight hours, accruing offline up to three stored normal packs. At capacity the
timer pauses; opening a normal pack starts a fresh eight-hour countdown. Recycled
upgrade packs do not occupy normal storage. Each account stores its next refill
timestamp, evaluated on demand without scheduled jobs. Existing inventories are
migrated without removing packs. Authenticated collection requests use the existing Firebase
Steam ID token. The Worker verifies it with Firebase, derives account identity
from the verified UID, and rolls using server-side cryptographic randomness.

`CosmeticsVault` holds account inventories, pack queues, appearance records and
idempotency receipts in transactional Durable Object storage. The browser cannot
grant packs, choose odds or equip unowned items. Public endpoints expose collection
quantities and appearance, never pack queues or grant history. The gift button,
collection index, editor and profile card use the same inventory service.

## Layout and ratings

Each saved design can carry a layout (`public/lib/card-layout.js`, saved as `equipment.layout`):
the owner's own card name (plain text, at most 24 characters) and its size, each front part
(tier, position, name, record, team, hero line) shown or hidden, sized, and dragged anywhere on
the face, and the back's stats (up to eight, in order) and its position-bar and top-hero sections.
`validLayout` is the only check, and the Worker runs it through `equipCosmetics`. The free-text
name is a moderation risk: it shows on public cards, so offensive names need removing by hand.

Every card has a full-size button (`showBigCard` in `public/parts/player-card.js`).

Signed-in players rate other players' saved designs common, rare, epic or legendary
(`public/lib/card-ratings.js`). Votes belong to a design's fingerprint (`designKey`), not its
slot: changing a card starts it at no votes, and changing it back restores them. The Worker
keeps one vote per voter per design (`rate` action, never your own card) under
`votes:<owner>:<key>`, and `GET /cosmetics/ratings/<account>` returns each saved design's counts.
Profiles show them under each saved design. Your own vote is remembered in your browser only.

## Launch

1. In `workers/steam-auth`, configure `FIREBASE_WEB_API_KEY` for the same Firebase
   project used by the site: `npx wrangler secret put FIREBASE_WEB_API_KEY`.
   The existing `FIREBASE_SA` secret used by Steam sign-in stays configured.
2. Run `npx wrangler deploy` from that folder. `wrangler.toml` adds the
   `COSMETICS` binding and SQLite migration. The Worker must deploy before the site
   is published. No new Firestore permissions or IAM roles are required.
3. Publish the site through its existing GitHub Pages deployment.
4. Sign in with Steam; confirm three initial packs, open one, save a cosmetic,
   and verify it appears on your profile and Fantasy card on another browser.

The browser implementation points at `https://steam-auth.ad2lstats.workers.dev/cosmetics`.
Before the Worker deploys, existing cards still load and the gift dialog can show
the collection catalog, while account collection operations report unavailable.
The collection Worker was deployed on October 13, 2026 (version
`038d9d4d-8bb0-4448-a634-ec77289e1d5c`; layouts and ratings in
`ea2e17e3-bd2e-424d-a7e4-72eb3055ce53`, October 13), with `FIREBASE_WEB_API_KEY`
configured and the `COSMETICS` migration applied. Public appearance reads and
localhost CORS preflight passed against the deployed service. The frontend remains
an unpushed local preview at `http://localhost:3000/`; Steam-authenticated pack
testing there uses real account inventory. GitHub Pages has not been updated.
The verification request supplies the validated site origin as its HTTP referrer
to satisfy the Firebase web key's website restriction. Authentication service
failures are reported separately from expired or invalid user sessions.

## Validation

`npm test` covers exact roll thresholds, three-item packs, refill timing and caps, ownership,
recycling minimums, replay-safe opens, authentication rejection and signature bounds.
`public/_dev/collection.html` is a local playtest using the actual production UI
and renderer with a separate browser-only inventory. It is ignored and not deployed.
Reset test inventory restores three packs, five extra Copper copies, Gold Foil and
the katakana unlock, so pack opening, recycling and signature placement can be tested.
