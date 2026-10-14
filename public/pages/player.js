// Player page.
import { playerHistory, hasDetails, draftSlotRecord, playerLeaderboard } from "../lib/stats.js";
import { tierList, gameRatings, rankLabel } from "../lib/tiers.js";
import { byPlayer } from "../lib/timeline.js";
import { wireCharts } from "../lib/charts.js";
import { collectWards, wireWardMaps } from "../lib/wardmap.js";
import { playerDeathsHtml, wireDeathMaps } from "../lib/deathmap.js";
import { towerSummaryHtml, wireTowerMaps } from "../lib/towermap.js";
import { info } from "../lib/glossary.js";
import { app, pageHead, floorOf, teamLink, profileLinks, esc, pct, fmt, dec, portrait, playerTabs, mapCard, wardView, crumbs, wirePlayerTabs, wireMapCards, sortableTable, when, heroLink } from "../core.js";
import { pageTabs, PLAYER_TABS } from "../lib/pagetabs.js";
import { gameAnalysisHtml, wireGameAnalysis } from "../parts/analysis.js";
import { combatTabHtml, fbCell, fbRole } from "../parts/combat.js";
import { draftSlotHtml, rateOf } from "../parts/draft.js";
import { playerItemsHtml, wireItemHeroes } from "../parts/items.js";
import { loading, errorBox, laneCutsOf, lanesPageHtml } from "../parts/lanes.js";
import { statRows, heroRanks, statRanksHtml, heroRanksHtml, pubSection, pubPrepHtml, allTimeSection, overallStats, overallHeroes, plusHeroesHtml } from "../parts/ranks.js";
import { tierRef, tierBreakdown } from "../parts/tiers.js";
import { compareHtml, wireCompare } from "../parts/compare.js";
import { radarSvg, roleScores } from "../parts/radar.js";
import { tagContext, gameTags, tagsHtml, tagCells } from "../lib/gametags.js";
import { mountProfileCollection } from '../parts/collection.js';
import { mountProfileTickets } from '../parts/profile-tickets.js';
import { mountGiftPanel } from '../parts/pack-gifts.js';
import { plusSlot, startPlusLevels } from "../lib/hero-levels.js";

// ---------- Player page ----------

// Player page tier breakdown: a modal over the page. The page can't scroll while it's open
// (the dialog's own body scrolls); Escape, the ×, a click on the backdrop or leaving the page
// closes it.
function wireTierModal() {
  const dlg = document.getElementById("tier-modal"), open = document.getElementById("tier-open");
  if (!dlg || !open) return;
  // The lock follows the dialog's `open` attribute, however it closes (the close event can
  // wait for a repaint, so it isn't relied on).
  const lock = () => document.documentElement.classList.toggle("modal-open", dlg.open);
  new MutationObserver(lock).observe(dlg, { attributes: true, attributeFilter: ["open"] });
  open.onclick = () => { dlg.showModal(); dlg.querySelector(".tm-body").scrollTop = 0; };
  document.querySelectorAll("[data-open-tier]").forEach((b) => (b.onclick = open.onclick));
  dlg.querySelector(".tm-close").onclick = () => dlg.close();
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  dlg.querySelectorAll("a[href^='#']").forEach((a) => a.addEventListener("click", () => dlg.close()));
}
window.addEventListener("hashchange", () => document.documentElement.classList.remove("modal-open"));

export async function renderPlayer(src, key) {
  app.innerHTML = loading(src.kicker, "Player");
  let matches;
  try { matches = await src.load(); if (src.ad2l) await src.data(); } catch (e) { app.innerHTML = `${pageHead(src.kicker, "Player")}${errorBox(e)}`; return; }
  const h = playerHistory(matches, key);
  const back = `<div class="kicker" style="margin-bottom:16px"><a href="${src.root}/players">← All players</a></div>`;
  if (!h) { app.innerHTML = `${back}<div class="panel empty"><strong>No games found for this player</strong>Private scrims don't include players.</div>`; return; }
  const s = h.summary;

  // Tier-list line, if they have enough games.
  const detailed = matches.filter(hasDetails), model = await tierRef(src);
  const laneCuts_ = await laneCutsOf(src);
  const tl = tierList(detailed, { model, minGames: floorOf(src) });
  const rows = statRows(detailed), ratings = heroRanks(detailed, model);
  const gameRated = h.games.map((g) => gameRatings(g.m, detailed, { model }));
  const tierOf = tl.tiers.flatMap(({ tier, players }) => players.map((p) => ({ ...p, tier }))).find((p) => p.key === key);
  const roster = src.ad2l ? src.cache().teams.flatMap((t) => t.players.map((p) => ({ ...p, team: t }))).find((p) => String(p.account_id) === key) : null;
  const rank = rankLabel(roster?.rank_tier ?? tierOf?.rank_tier);
  const sub = [
    s.team ? `${teamLink(src, s.team, roster?.team.id ?? null)}${s.standin ? " · stand-in" : ""}` : "",
    roster?.captain ? "Captain" : "",
    rank ? esc(rank) : "",
    src.ad2l ? profileLinks(key, roster?.playon_id) : "",
  ].filter(Boolean).join(" · ");

  const cards = [
    ["Record", `${s.wins}–${s.games - s.wins}`, `${pct(s.win_rate)} win rate · ${s.games} game${s.games === 1 ? "" : "s"}`],
    ["KDA", s.kda.toFixed(2), `${(s.kills / s.games).toFixed(1)} / ${(s.deaths / s.games).toFixed(1)} / ${(s.assists / s.games).toFixed(1)} per game`, "kda"],
    ["GPM", fmt(s.avg_gpm), `${fmt(s.avg_xpm)} XPM`, "avg_gpm"],
    ["Damage / min", fmt(s.dmg_per_min), `${fmt(s.dmg_per_1k_nw)} per 1k net worth`, "dmg_per_min"],
    ["Kill participation", pct(s.avg_kp), "average per game", "avg_kp"],
    // Building damage: per game, and their share of what their team did to buildings in those games.
    (() => {
      const gs = h.games.filter((g) => g.p.tower_damage != null);
      if (!gs.length) return ["Building damage", "—", "not recorded in these games", "building_dmg"];
      const mine = gs.reduce((a, g) => a + g.p.tower_damage, 0);
      const team = gs.reduce((a, g) => a + g.m.players.filter((q) => q.team === g.p.team).reduce((b, q) => b + (q.tower_damage ?? 0), 0), 0);
      return ["Building damage", fmt(Math.round(mine / gs.length)), `per game · ${team ? pct(mine / team) : "—"} of their team's`, "building_dmg"];
    })(),
    ...(s.map_games ? [
      ["Vision", `${dec(s.obs_pg)} / ${dec(s.sen_pg)} / ${dec(s.dewards_pg)}`, "observers / sentries placed / enemy wards killed per game", "vision"],
      ["Stacks", dec(s.stacks_pg), "camps stacked per game", "stacks_pg"],
      ["Creeps", `${Math.round(s.lane_pg)} / ${Math.round(s.neutral_pg)}`, `lane / neutral per game · ${pct(s.neutral_share)} neutral`, "creeps"],
    ] : []),
  ];
  const vsOf = ({ m, p }) => (p.team === "a" ? { name: m.team_b, id: m.team_b_id } : { name: m.team_a, id: m.team_a_id });
  const bestCard = (label, g, value, i) => `<a class="card hl best-game" style="--i:${i}" href="${src.link(g.m)}" title="Open the game">${portrait(g.p.hero, "card-hero")}${plusSlot(g.p.account_id, g.p.hero, g.m.start_time)}
    <div class="k">Best game · ${label}</div><div class="v">${value}</div>
    <div class="s">${esc(g.p.hero)} · vs ${esc(vsOf(g).name)} · ${g.won ? "Won" : "Lost"}</div></a>`;

  // Tier profile: the radar of their main-role stats, first in the cards (two rows tall).
  const mainStats = tierOf?.roles?.[0]?.stats ?? [];
  const radar = mainStats.length >= 3 ? `<button type="button" class="card radar-card t-${tierOf.tier}" data-open-tier title="Open the tier breakdown">
      <div class="k">Tier profile · 0–100 <span class="rc-go" aria-hidden="true">↗</span></div>
      ${radarSvg([{ name: s.name, cls: "rc-shape", scores: roleScores(tierOf) }], mainStats.map((x) => x.metric), `${s.name}'s tier stats, 0 to 100`)}</button>` : "";
  const tabs = playerTabs(pageTabs(PLAYER_TABS, src, [
      ["stats", `<div class="cards player-cards reveal${radar ? " has-radar" : ""}" style="--cols:${Math.ceil((cards.length + 3) / 2)}">${radar}${cards.map(([k, v, t, tip], i) => `<div class="card" style="--i:${i}"><div class="k">${k}${info(tip)}</div><div class="v">${v}</div><div class="s">${t}</div></div>`).join("")}
          ${bestCard("Most damage", h.best.damage, fmt(h.best.damage.p.hero_damage), cards.length)}
          ${bestCard("Best KDA", h.best.kda, `${h.best.kda.p.kills}/${h.best.kda.p.deaths}/${h.best.kda.p.assists}`, cards.length + 1)}
          ${bestCard("Top GPM", h.best.gpm, fmt(h.best.gpm.p.gpm), cards.length + 2)}
        </div>
        <div id="stat-ranks-box" data-key="${esc(key)}">${statRanksHtml(src, key, rows, null)}</div>
        <h2 id="game-analysis">Game analysis${info("game_analysis")}</h2>
        <div id="game-box" data-key="${esc(key)}">${gameAnalysisHtml(src, "player", h.games, 0, gameRated)}</div>`],
      ["compare", compareHtml(key)],
      ["heroes", `<div id="hero-ranks-box" data-key="${esc(key)}">${heroRanksHtml(src, key, h, ratings, null)}</div>
        ${src.ad2l ? `<div id="plus-box" data-key="${esc(key)}"></div>` : ""}
        ${draftSlotHtml(draftSlotRecord(matches, byPlayer(key)), src, s.name, rateOf(h.games, gameRated))}
        ${src.ad2l ? `<details class="how pubs-fold"><summary>Pubs and other leagues</summary>
          ${pubSection(src, key)}${pubPrepHtml(src, key, h.games)}<div id="alltime-box" data-key="${esc(key)}"></div></details>` : ""}`],
      ["combat", combatTabHtml(src, matches, byPlayer(key), s.name)],
      ["lanes", lanesPageHtml(src, matches, byPlayer(key), laneCuts_, { name: s.name })],
      ["items", playerItemsHtml(src, matches, h.games)],
      ["map", mapCard([
        ["wards", "Wards", "ward_map", wardView(collectWards(matches, byPlayer(key)), s.name)],
        ["deaths", "Deaths", "player_deaths", playerDeathsHtml(matches, byPlayer(key), { name: s.name })],
        ["towers", "Towers", "player_towers", towerSummaryHtml(matches, byPlayer(key), { name: s.name })],
      ])],
      ["games", `<h2>Every game</h2><p class="table-note">Analyze opens a game in depth on the Stats tab.</p>
        <div id="t"></div>
`],
  ]));

  // One compact header: back link and league on one line, then name, tier, team line and the
  // tabs on a single row (the tabs wrap under it on narrow screens).
  app.innerHTML = `
    <header class="page-head pp-head reveal">
      <div class="kicker" style="--i:0">${crumbs(src, ["Players", `${src.root}/players`], s.name)}</div>
      <div class="pp-row" style="--i:1">
        <h1><span class="h1-name">${esc(s.name)}</span>${tierOf ? `<button type="button" class="tier-badge t-${tierOf.tier}" id="tier-open" aria-haspopup="dialog"
          aria-label="${tierOf.tier} tier, rating ${tierOf.rating}. Open the breakdown" title="${tierOf.tier} tier · ${tierOf.rating} rating · click for the breakdown">
          <span class="tb-letter">${tierOf.tier}</span><span class="tb-pop" aria-hidden="true">↗</span></button>` : ""}</h1>
        ${sub ? `<p class="pp-sub">${sub}</p>` : ""}
        ${tabs.bar}
      </div>
    </header>
    ${tabs.panels}
    ${tierOf ? `<dialog class="tier-modal t-${tierOf.tier} ${tierOf.role}" id="tier-modal" aria-labelledby="tier-modal-title">
      <div class="tm-head">
        <span class="tier-detail-letter">${tierOf.tier}</span>
        <div class="tm-title"><h3 id="tier-modal-title">${esc(s.name)} · tier rating${info("tier")}</h3>
          <small>${tierOf.role === "core" ? "Core" : "Support"} · ${tierOf.games} games · ${tierOf.wins}–${tierOf.games - tierOf.wins} · <a href="${src.root}/players">full method on the Players page</a></small></div>
        <button type="button" class="tm-close" aria-label="Close">×</button>
      </div>
      <div class="tm-body">${tierBreakdown(src, tierOf)}</div>
    </dialog>` : ""}`;
  wirePlayerTabs();
  const inGameName=h.games[0]?.p.inGameName??roster?.inGameName??s.name;
  if(/^\d+$/.test(key)) mountProfileCollection(app,{account:Number(key),name:inGameName,matches,team:roster?.team?.name??s.team,tier:tierOf}).catch(()=>{});
  if(/^\d+$/.test(key)) mountProfileTickets(app,key).catch(()=>{});
  if(/^\d+$/.test(key)) mountGiftPanel(app,key,s.name).catch(()=>{});
  wireItemHeroes();
  wireCharts(app);
  wireTierModal();
  wireMapCards(app);
  wireWardMaps(app);
  wireDeathMaps(app);
  wireTowerMaps(app);
  wireCompare(src, key, playerLeaderboard(detailed), new Map([...tl.tiers.flatMap(({ tier, players }) => players.map((p) => ({ ...p, tier }))), ...tl.unranked].map((p) => [p.key, p])), { matches: detailed, cuts: laneCuts_ });
  // Overall places fill in once every league has loaded (still this player's page?).
  if (src.ad2l) Promise.all([overallStats(src), overallHeroes(src)]).then(([os, oh]) => {
    const box = (id) => { const el = document.getElementById(id); return el?.dataset.key === key ? el : null; };
    const sb = box("stat-ranks-box"), hb = box("hero-ranks-box");
    if (sb) sb.innerHTML = statRanksHtml(src, key, rows, os ?? []);
    if (hb) hb.innerHTML = heroRanksHtml(src, key, h, ratings, oh ?? (() => []));
  });

  // Dota Plus hero levels arrive on their own (lib/hero-levels.js).
  if (src.ad2l) startPlusLevels().then((data) => {
    const el = document.getElementById("plus-box");
    if (el?.dataset.key === key && data) el.innerHTML = plusHeroesHtml(src, data, key);
  });

  // All-time totals load from the division's draft file (not part of the main data).
  if (src.ad2l) {
    const league = roster?.team?.league ?? src.key;
    Promise.all([import("../parts/cmdraft.js"), import("../lib/herogrid.js")]).then(async ([cm, hg]) => [hg, await cm.draftData(league)]).then(([hg, data]) => {
      const el = document.getElementById("alltime-box");
      if (el?.dataset.key !== key || !data?.totals || !data.heroes) return;
      const list = hg.decodeTotals(data.totals[key], data.heroes);
      if (list.pubs.length || list.lobby.length) el.innerHTML = allTimeSection(src, list, key);
    }).catch(() => {});
  }

  sortableTable(document.getElementById("t"), [
    ["date", "Date", (v, r) => `${when(new Date(v))} <button type="button" class="ga-go" data-analyze="${r.gi}" title="Analyze this game">Analyze</button>`, "l"],
    ["hero", "Hero", (v, r) => `<span class="hero-cell">${portrait(v)}${plusSlot(r.acct, v, r.at)}${heroLink(src, v)}</span>`, "l"],
    ["won", "Result", (v) => `<span class="res ${v ? "w" : "l"}">${v ? "Win" : "Loss"}</span>`],
    ["tags", "Tags", (v, r) => tagsHtml(r.tag_list), "l"],
    ["vs", "Opponent", (v, r) => teamLink(src, v, r.vs_id), "l"],
    ["kills", "K"], ["deaths", "D"], ["assists", "A"],
    ["net_worth", "Net worth", fmt, "", "gold"], ["gpm", "GPM"], ["xpm", "XPM"],
    ["hero_damage", "Hero dmg", fmt, "", "ember"], ["kill_participation", "KP", pct],
    ...(s.combat_games ? [["fb", "First blood", fbCell, "", null, "first_blood"]] : []),
    ...(s.map_games ? [["obs", "Obs"], ["sen", "Sentries"], ["dewards", "Dewards"], ["stacks", "Stacks"]] : []),
    ["link", "", (v) => `<a href="${v}" title="Open game">→</a>`],
  ], h.games.map((g, gi) => ({
    ...tagCells(gameTags(g.m, tagContext(matches), g.p.team)),
    gi, obs: g.p.obs_placed ?? null, sen: g.p.sen_placed ?? null, stacks: g.p.camps_stacked ?? null, fb: fbRole(g.m, g.p),
    dewards: g.p.obs_killed == null ? null : g.p.obs_killed + g.p.sen_killed,
    date: g.m.createdAt ? +g.m.createdAt : 0, hero: g.p.hero, acct: g.p.account_id, at: g.m.start_time, won: g.won ? 1 : 0, vs: vsOf(g).name, vs_id: vsOf(g).id ?? null,
    kills: g.p.kills, deaths: g.p.deaths, assists: g.p.assists, net_worth: g.p.net_worth, gpm: g.p.gpm, xpm: g.p.xpm,
    hero_damage: g.p.hero_damage, kill_participation: g.p.kill_participation ?? null, link: src.link(g.m),
  })), "date", { toolbar: true });
  wireGameAnalysis(src, "player", h.games, gameRated, matches);
}
