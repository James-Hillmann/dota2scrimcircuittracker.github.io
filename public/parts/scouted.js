// The player page for a Steam player on no league roster: their scout report (lib/scout.js) in
// place of league stats — rank, recent pubs and all-time heroes — plus the card collection,
// tickets and gift box every profile has.
import { app, esc, crumbs, profileLinks, when, here } from "../core.js";
import { rankLabel } from "../lib/tiers.js";
import { HERO_META } from "../lib/hero-meta.js";
import { decodeTotals } from "../lib/herogrid.js";
import { steamAccount } from "../lib/store.js";
import { scoutReport, scoutMe } from "../lib/scout.js";
import { pubSection, allTimeSection } from "./ranks.js";
import { mountProfileCollection } from "./collection.js";
import { mountProfileTickets } from "./profile-tickets.js";
import { mountGiftPanel } from "./pack-gifts.js";

const HERO_NAMES = Object.fromEntries(HERO_META.map(([id, name]) => [id, name]));

// Renders the page and returns true, or false when there's no report (the caller says so).
export async function renderScoutedPlayer(src, key) {
  const route = here(), stillHere = () => here() === route;
  let report = await scoutReport(key).catch(() => null);
  const viewer = await steamAccount().catch(() => null);
  if (!report && String(viewer) === key) {
    app.innerHTML = `<div class="panel empty"><strong>Scouting your profile…</strong>Reading your public match history from OpenDota.</div>`;
    report = await scoutMe().catch(() => null);
  }
  if (!stillHere()) return true;
  if (!report) return false;

  const name = report.name ?? `Account ${key}`, rank = rankLabel(report.rank_tier);
  const sub = ["Not on a league roster", rank ? esc(rank) : "", `scouted ${when(new Date(report.at))}`, profileLinks(key)].filter(Boolean).join(" · ");
  // pubSection reads a division file's shape: the report has the same `pubs` rows.
  const d = { pubs: { [key]: report.pubs }, updated: new Date(report.at).toISOString() };
  app.innerHTML = `
    <header class="page-head pp-head reveal">
      <div class="kicker" style="--i:0">${crumbs(src, ["Players", `${src.root}/players`], name)}</div>
      <div class="pp-row" style="--i:1">
        <h1><span class="h1-name">${esc(name)}</span></h1>
        <p class="pp-sub">${sub}</p>
      </div>
    </header>
    ${report.private ? `<p class="table-note keep">OpenDota shows no games for this account: their match history may be private (Dota 2 › Settings › Options › Social › Expose Public Match Data).</p>` : ""}
    <section class="scouted">
      ${pubSection(src, key, d)}
      ${allTimeSection(src, decodeTotals(report.totals, HERO_NAMES))}
    </section>`;
  mountProfileCollection(app, { account: Number(key), name, matches: [], team: null, tier: null }).catch(() => {});
  mountProfileTickets(app, key).catch(() => {});
  mountGiftPanel(app, key, name).catch(() => {});
  return true;
}
