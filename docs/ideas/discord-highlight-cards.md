# Parked: Discord highlight cards

Liked, not started. Resume only when the user says so.

- **Stage 1, webhook (no bot).** A step at the end of `.github/workflows/sync.yml` runs
  `scripts/discord-post.js`, which posts to `DISCORD_WEBHOOK_URL` (repo secret).
- **Posts:**
  - Tier list image per division, only when tiers changed. Lead with movers.
  - Series highlight image when a series is complete: score, drafts, gold lines, MVP, link.
  - Weekly recap. Upset alert (winner under ~30% by the model).
- **Images:** attach a PNG to the webhook and show it with `attachment://card.png`. Render it
  with satori + resvg, using the site fonts. `public/lib/tiers.js` already runs in Node.
- **No double posts:** keep a posted-log file committed by the sync.
- **Test mode:** post to a private channel first. Live posts are public, so the user turns them on.
- **Stage 2, optional:** slash commands on a serverless interactions endpoint (e.g. a
  Cloudflare Worker) that reads the published JSON.
- **Open questions:**
  - Should the images count unticketed/scrim games? Those live in Firestore, not the synced
    JSON, and the site's tier list counts them.
  - Tier posts on every change or weekly? Scrim cards too?
  - One channel for everything or one per division?
  - Game pages have no share pages, so their links show no Discord preview.
