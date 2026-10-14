// The player page for a Steam player on no league roster: their scout report (lib/scout.js) in
// place of league stats — rank, recent pubs and all-time heroes — plus the card collection,
// tickets and gift box every profile has. Every account that has signed in gets this page, even
// before (or without) a scout.
import { app, esc, crumbs, profileLinks, when, here } from "../core.js";
import { rankLabel } from "../lib/tiers.js";
import { HERO_META } from "../lib/hero-meta.js";
import { decodeTotals } from "../lib/herogrid.js";
import { steamAccount } from "../lib/store.js";
import { scoutReport, scoutMe } from "../lib/scout.js";
import { publicCollection } from "../lib/cosmetics.js";
import { pubSection, allTimeSection } from "./ranks.js";
import { mountProfileCollection } from "./collection.js";
import { mountProfileTickets } from "./profile-tickets.js";
import { mountGiftPanel } from "./pack-gifts.js";

const HERO_NAMES = Object.fromEntries(HERO_META.map(([id, name]) => [id, name]));

// An account that has used the site with Steam: the Worker keeps something for it.
const signedIn = (c) => !!(c && (c.equipment || c.nickname || c.background || c.screens?.length || Object.keys(c.inventory ?? {}).length));
async function steamProfileName(account) {
  try { const r = await fetch(`https://api.opendota.com/api/players/${account}`); return r.ok ? (await r.json())?.profile?.personaname ?? null : null; } catch { return null; }
}

// Renders the page and returns true, or false for an account that never signed in and was never
// scouted (the caller says no games found).
export async function renderScoutedPlayer(src, key) {
  const route = here(), stillHere = () => here() === route;
  const [found, viewer, collection] = await Promise.all([scoutReport(key).catch(() => null), steamAccount().catch(() => null), publicCollection(key).catch(() => null)]);
  let report = found;
  const own = String(viewer) === key;
  if (!report && own) {
    app.innerHTML = `<div class="panel empty"><strong>Scouting your profile…</strong>Reading your public match history from OpenDota.</div>`;
    report = await scoutMe().catch((e) => (console.warn("scout", e), null));
  }
  if (!stillHere()) return true;
  if (!report && !own && !signedIn(collection)) return false;

  const name = report?.name ?? (await steamProfileName(key)) ?? `Player ${key}`, rank = rankLabel(report?.rank_tier);
  if (!stillHere()) return true;
  const sub = ["Not on a league roster", rank ? esc(rank) : "", report ? `scouted ${when(new Date(report.at))}` : "", profileLinks(key)].filter(Boolean).join(" · ");
  // pubSection reads a division file's shape: the report has the same `pubs` rows.
  const d = report && { pubs: { [key]: report.pubs }, updated: new Date(report.at).toISOString() };
  app.innerHTML = `
    <header class="page-head pp-head reveal">
      <div class="kicker" style="--i:0">${crumbs(src, ["Players", `${src.root}/players`], name)}</div>
      <div class="pp-row" style="--i:1">
        <h1><span class="h1-name">${esc(name)}</span></h1>
        <p class="pp-sub">${sub}</p>
      </div>
    </header>
    ${report?.private ? `<p class="table-note keep">OpenDota shows no games for this account: their match history may be private (Dota 2 › Settings › Options › Social › Expose Public Match Data).</p>` : ""}
    ${report ? `<section class="scouted">
      ${pubSection(src, key, d)}
      ${allTimeSection(src, decodeTotals(report.totals, HERO_NAMES))}
    </section>` : `<p class="table-note keep">Not scouted yet: their match history shows here after their next visit signed in with Steam.</p>`}`;
  mountProfileCollection(app, { account: Number(key), name, matches: [], team: null, tier: null }).catch(() => {});
  mountProfileTickets(app, key).catch(() => {});
  mountGiftPanel(app, key, name).catch(() => {});
  return true;
}
