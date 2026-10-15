// Heroes tab: three sub-tabs. Hero tiers (the heroes, by how well players do on them), Players on
// heroes (every player-hero pair) and All heroes (every hero picked, with pick, ban and win rates).
import { hasDetails, heroStats } from "../lib/stats.js";
import { byHero } from "../lib/timeline.js";
import { draftAnalysis } from "../lib/draft.js";
import { info } from "../lib/glossary.js";
import { firstBloodRecord, sideRecord } from "../lib/combat.js";
import { app, pageHead, pct, heroLink, minBar, MIN_DEFAULT, wireMinBar, sortableTable, portrait, fmt, esc, playerTabs, wirePlayerTabs } from "../core.js";
import { pageTabs, HEROES_PAGE_TABS } from "../lib/pagetabs.js";
import { loading, errorBox } from "../parts/lanes.js";
import { heroRanks } from "../parts/ranks.js";
import { tierRef } from "../parts/tiers.js";
import { heroRatings } from "../lib/tiers.js";
import { heroTierSection, heroPowerSection } from "../parts/herotiers.js";

export async function renderHeroes(src) {
  app.innerHTML = loading(src.kicker, "Heroes");
  let all;
  try { all = await src.load(); } catch (e) { app.innerHTML = `${pageHead(src.kicker, "Heroes")}${errorBox(e)}`; return; }
  const matches = all.filter(hasDetails);
  const rows = heroStats(matches);
  const ratings = matches.length ? heroRanks(matches, await tierRef(src)) : null;
  const ht = ratings && heroTierSection(src, ratings);
  const model = ratings && await tierRef(src), byPos = new Map();
  const ratingsAt = (n) => byPos.get(n) ?? byPos.set(n, heroRatings(matches, { model, pos: n })).get(n);
  const hp = ratings && heroPowerSection(src, ratings, ratingsAt);
  // Captains Mode drafts (AD2L replays) add the by-phase columns and the highlight cards.
  const a = draftAnalysis(all);
  const byHero = new Map(a.games ? a.heroes.map((h) => [h.hero, h]) : []);
  const card = (k, v, t, i, small = false, tip = null) => `<div class="card" style="--i:${i}"><div class="k">${k}${info(tip)}</div><div class="v${small ? " small" : ""}">${v}</div><div class="s">${t}</div></div>`;
  let cards = "";
  if (a.games) {
    const H = a.heroes;
    const most = (f) => [...H].sort((x, y) => f(y) - f(x) || y.contested - x.contested)[0];
    const b1 = most((h) => h.bans[0]), p1 = most((h) => h.picks[0]), lp = most((h) => h.last_picks);
    const bestLast = H.filter((h) => h.last_picks >= 3).sort((x, y) => y.last_pick_wins / y.last_picks - x.last_pick_wins / x.last_picks || y.last_picks - x.last_picks)[0];
    cards = `<div class="cards reveal">
      ${card("First pick", `${a.first_pick.wins}–${a.first_pick.games - a.first_pick.wins}`, `team with first pick won ${pct(a.first_pick.win_rate)} of games`, 0, false, "first_pick")}
      ${(() => { const r = firstBloodRecord(all); return r.games ? card("First blood", pct(r.win_rate), `the team that drew it won ${r.wins} of ${r.games} games`, 0, false, "fb_win_rate") : ""; })()}
      ${(() => { const r = sideRecord(all); return r.games ? card("Radiant", pct(r.win_rate), `Radiant won ${r.wins} of ${r.games} games · Dire ${r.games - r.wins}`, 0, false, "radiant_rate") : ""; })()}
      ${card("Top phase 1 ban", heroLink(src, b1.hero), `${b1.bans[0]} first-phase bans · ${pct(b1.p1_ban_share)} of its bans`, 1, true, "top_p1_ban")}
      ${card("Top phase 1 pick", heroLink(src, p1.hero), `${p1.picks[0]} first-phase picks · ${p1.pick_wins[0]}–${p1.picks[0] - p1.pick_wins[0]}`, 2, true, "top_p1_pick")}
      ${card("Most last-picked", heroLink(src, lp.hero), `${lp.last_picks} last picks · ${lp.last_pick_wins}–${lp.last_picks - lp.last_pick_wins}`, 3, true, "last_pick")}
      ${bestLast ? card("Best last pick", heroLink(src, bestLast.hero), `${bestLast.last_pick_wins}–${bestLast.last_picks - bestLast.last_pick_wins} as a last pick (3+ games)`, 4, true, "best_last_pick") : ""}
    </div>`;
  }
  const merged = rows.map((r) => {
    const h = byHero.get(r.hero);
    return h ? { ...r, b1: h.bans[0], b2: h.bans[1], b3: h.bans[2], p1_ban_share: h.p1_ban_share, p1: h.picks[0], p2: h.picks[1], p3: h.picks[2], w1: h.pick_win_rate[0], w2: h.pick_win_rate[1], w3: h.pick_win_rate[2] } : r;
  });
  // Heroes only ever banned (never picked) still belong in the draft view.
  if (a.games) for (const h of a.heroes) if (!rows.some((r) => r.hero === h.hero) && h.ban_total) {
    merged.push({ hero: h.hero, picks: 0, pick_rate: 0, wins: 0, win_rate: null, bans: h.ban_total, ban_rate: h.ban_total / matches.length, contest_rate: h.contest_rate,
      b1: h.bans[0], b2: h.bans[1], b3: h.bans[2], p1_ban_share: h.p1_ban_share, p1: 0, p2: 0, p3: 0, w1: null, w2: null, w3: null, avg_damage: null, avg_kda: null });
  }
  const tabs = merged.length && playerTabs(pageTabs(HEROES_PAGE_TABS, src, [
    ["tiers", hp?.html ?? ""],
    ["players", ht?.html ?? ""],
    ["table", `${cards}${minBar(a.games ? "Show heroes picked or banned at least" : "Show heroes picked at least", "times", MIN_DEFAULT(matches))}<div id="t" class="reveal"></div>
      ${a.games ? `<p class="table-note">B1–B3 = bans in draft phase 1–3; P1–P3 = picks, with the win % when picked in that phase (P3 = last picks).</p>` : ""}`],
  ]), { store: "heroesTab", label: "Heroes sections" });
  app.innerHTML = `${pageHead(src.kicker, "Heroes", merged.length ? `${rows.length} heroes picked across ${matches.length} ${matches.length === 1 ? "game" : "games"}${a.games ? `, with bans and picks by draft phase from ${a.games} Captains Mode drafts` : ""}.` : "", tabs?.bar)}
    ${merged.length ? tabs.panels : `<div class="panel empty"><strong>No picks yet</strong>${src.empty}</div>`}`;
  if (!merged.length) return;
  wirePlayerTabs();
  hp?.draw();
  ht?.draw();
  wireMinBar(merged, (r) => (r.picks ?? 0) + (a.games ? r.bans ?? 0 : 0), (shown) => sortableTable(document.getElementById("t"), [
    ["hero", "Hero", (v) => `<span class="hero-cell">${portrait(v)}${heroLink(src, v)}</span>`, "l"], ["picks", "Picks", null, "", "gold"], ["pick_rate", "Pick rate", pct], ["wins", "Wins"],
    ["win_rate", "Win %", pct, "", "jade"],
    ...(merged.some((r) => r.contest_rate != null) ? [["bans", "Bans"], ["ban_rate", "Ban %", pct], ["contest_rate", "Contest %", pct, "", "gold"]] : []),
    ...(a.games ? [
      ["b1", "B1", null, "", "ember"], ["b2", "B2"], ["b3", "B3"], ["p1_ban_share", "1st-phase ban share", pct],
      ["p1", "P1", null, "", "jade"], ["w1", "P1 win %", pct], ["p2", "P2"], ["w2", "P2 win %", pct], ["p3", "P3 (last)"], ["w3", "P3 win %", pct],
    ] : []),
    ["avg_damage", "Avg hero dmg", fmt, "", "ember"], ["avg_kda", "Avg KDA", (v) => (v == null ? "—" : esc(v))],
  ], shown, "picks", { toolbar: true }));
}