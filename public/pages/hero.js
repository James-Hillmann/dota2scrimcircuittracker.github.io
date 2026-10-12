// Hero page.
import { HEROES } from "../lib/heroes.js";
import { heroSlug, heroHistory, hasDetails, draftSlotRecord, playerKey } from "../lib/stats.js";
import { gameRatings } from "../lib/tiers.js";
import { heroImg } from "../lib/hero-meta.js";
import { byHero } from "../lib/timeline.js";
import { wireCharts } from "../lib/charts.js";
import { collectWards, wireWardMaps } from "../lib/wardmap.js";
import { playerDeathsHtml, wireDeathMaps } from "../lib/deathmap.js";
import { towerSummaryHtml, wireTowerMaps } from "../lib/towermap.js";
import { draftAnalysis } from "../lib/draft.js";
import { info } from "../lib/glossary.js";
import { itemIcon, itemName } from "../lib/items.js";
import { skillGrid, heroPairs, heroNeutrals } from "../lib/combat.js";
import { skillGridHtml } from "../lib/combat-charts.js";
import { app, esc, pageHead, crumbs, pct, fmt, teamLink, portrait, playerTabs, goldCurveSection, mapCard, wardView, wirePlayerTabs, wireMapCards, sortableTable, playerLink, when, heroLink } from "../core.js";
import { pageTabs, HERO_TABS } from "../lib/pagetabs.js";
import { gameAnalysisHtml, wireGameAnalysis } from "../parts/analysis.js";
import { combatTabHtml, detailsFor, loadAbilities, fbOf, fbCell, fbRole } from "../parts/combat.js";
import { heroPhaseHtml, draftSlotHtml, rateOf } from "../parts/draft.js";
import { heroItemsHtml } from "../parts/items.js";
import { loading, errorBox, laneCutsOf, lanesPageHtml } from "../parts/lanes.js";
import { heroRanks, heroRows, heroKey, statRows, statRanksHtml, HERO_RANKS, heroPlayersHtml, heroPubSection, overallHeroes, overallHeroRows } from "../parts/ranks.js";
import { tierRef } from "../parts/tiers.js";

// ---------- Hero page ----------

export async function renderHero(src, slug) {
  const hero = HEROES.find((x) => heroSlug(x) === slug);
  const back = `<div class="kicker" style="margin-bottom:16px"><a href="${src.ad2l ? `${src.root}/heroes` : "#/heroes"}">← All heroes</a></div>`;
  if (!hero) { app.innerHTML = `${back}<div class="notice err">No such hero.</div>`; return; }
  app.innerHTML = loading(src.kicker, esc(hero));
  let matches;
  try { matches = await src.load(); } catch (e) { app.innerHTML = `${pageHead(src.kicker, esc(hero))}${errorBox(e)}`; return; }
  const h = heroHistory(matches, hero);
  const S = h.summary;
  const detailed = matches.filter(hasDetails), model = await tierRef(src);
  const laneCuts_ = await laneCutsOf(src);
  const rated = heroRanks(detailed, model).get(hero) ?? [];
  const ratingOfKey = new Map(rated.map((p) => [p.key, p.rating]));
  const lines = new Map(h.players.map((p) => [p.key, p]));
  const rows = heroRows(detailed), hkey = heroKey(hero);
  const gameRated = h.games.map((g) => gameRatings(g.m, detailed, { model }));
  const img = heroImg(hero);
  const sub = `${S.picks ? `Picked ${S.picks} time${S.picks === 1 ? "" : "s"} by ${h.teams.filter((t) => t.picks).length} team${h.teams.filter((t) => t.picks).length === 1 ? "" : "s"}` : "Not picked yet"}${S.drafted ? ` · banned in ${S.bans} of ${S.drafted} drafted games` : ""}`;
  // Same compact header as the player page: back link and league, then art, name, the pick line
  // and the tabs on one row.
  const header = (bar = "") => `<header class="page-head pp-head reveal">
      <div class="kicker" style="--i:0">${crumbs(src, ["Heroes", src.ad2l ? `${src.root}/heroes` : "#/heroes"], hero)}</div>
      <div class="pp-row" style="--i:1">
        ${img ? `<img class="pp-hero-img" src="${img}" alt="">` : ""}
        <h1><span class="h1-name">${esc(hero)}</span></h1>
        <p class="pp-sub">${sub}.</p>
        ${bar}
      </div>
    </header>`;
  if (!S.picks && !S.bans) { app.innerHTML = `${header()}<div class="panel empty"><strong>No games with ${esc(hero)} yet</strong>Nobody has picked${src.ad2l ? " or banned" : ""} it in ${src.ad2l ? "this division" : "a saved scrim"}.</div>`; return; }

  const cards = [
    ["Record", S.picks ? `${S.wins}–${S.picks - S.wins}` : "—", S.picks ? `${pct(S.win_rate)} win rate` : "never picked"],
    ["Pick rate", pct(S.pick_rate), "of games with stats", "pick_rate"],
    ...(S.drafted ? [["Contest rate", pct(S.contest_rate), `picked or banned in ${Math.round(S.contest_rate * S.drafted)} of ${S.drafted} drafts`, "contest_rate"],
      ["Ban rate", pct(S.ban_rate), `${S.bans} ban${S.bans === 1 ? "" : "s"}`, "ban_rate"],
      ["Draft slot", S.avg_pick_step ? `#${S.avg_pick_step.toFixed(1)}` : "—", "average pick position (of 24)", "draft_slot"]] : []),
    ["KDA", S.kda == null ? "—" : S.kda.toFixed(2), "all players on it", "kda"],
    ["GPM", fmt(S.avg_gpm), `${fmt(S.dmg_per_min)} damage / min`, "avg_gpm"],
  ];

  // Highlights: best team on it (wins first, then win rate, then games) and who bans it most.
  // The best players have their own section (Players on it, by hero rating); the best games
  // sit with the stat cards.
  // One game isn't a track record: skip single-game samples when anyone has two or more.
  const rank = (xs, games) => [...xs].filter((x) => x[games] >= (xs.some((y) => y[games] >= 2) ? 2 : 1)).sort((a, b) => b.wins - a.wins || b.wins / b[games] - a.wins / a[games] || b[games] - a[games])[0];
  const topTeam = rank(h.teams, "picks");
  const banner = [...h.teams].sort((a, b) => b.bans - a.bans)[0];
  const vsOf = ({ m, p }) => (p.team === "a" ? { name: m.team_b, id: m.team_b_id } : { name: m.team_a, id: m.team_a_id });
  const usOf = ({ m, p }) => (p.team === "a" ? { name: m.team_a, id: m.team_a_id } : { name: m.team_b, id: m.team_b_id });
  const hl = [
    topTeam && ["Best team on it", teamLink(src, topTeam.name, topTeam.id), `${topTeam.wins}–${topTeam.picks - topTeam.wins} · ${pct(topTeam.win_rate)} · ${topTeam.players.map(esc).join(", ")}`],
    banner?.bans && ["Bans it most", teamLink(src, banner.name, banner.id), `${banner.bans} ban${banner.bans === 1 ? "" : "s"}`],
  ].filter(Boolean);
  const bestCard = (label, g, value, i) => `<a class="card hl best-game" style="--i:${i}" href="${src.link(g.m)}" title="Open the game">${portrait(hero, "card-hero")}
    <div class="k">Best game · ${label}</div><div class="v">${value}</div>
    <div class="s">${esc(g.p.name)} · vs ${esc(vsOf(g).name)} · ${g.won ? "Won" : "Lost"}</div></a>`;
  const best = h.games.length ? [
    bestCard("Most damage", h.best.damage, fmt(h.best.damage.p.hero_damage), cards.length),
    bestCard("Best KDA", h.best.kda, `${h.best.kda.p.kills}/${h.best.kda.p.deaths}/${h.best.kda.p.assists}`, cards.length + 1),
    bestCard("Top GPM", h.best.gpm, fmt(h.best.gpm.p.gpm), cards.length + 2),
  ] : [];
  const known = new Set(statRows(detailed).map((r) => r.key));

  const tabs = playerTabs(pageTabs(HERO_TABS, src, [
    ["stats", `<div class="cards player-cards reveal" style="--cols:${Math.ceil((cards.length + best.length) / 2)}">${cards.map(([k, v, t, tip], i) => `<div class="card" style="--i:${i}"><div class="k">${k}${info(tip)}</div><div class="v">${v}</div><div class="s">${t}</div></div>`).join("")}${best.join("")}</div>
      ${hl.length ? `<div class="cards reveal">${hl.map(([k, v, t], i) => `<div class="card hl" style="--i:${i}"><div class="k">${k}</div><div class="v small">${v}</div><div class="s">${t}</div></div>`).join("")}</div>` : ""}
      <div id="hero-ranks-box" data-hero="${esc(hero)}">${statRanksHtml(src, hkey, rows, null, HERO_RANKS)}</div>
      ${goldCurveSection(matches, byHero(hero), hero)}`],
    ["players", `<div id="hero-players-box" data-hero="${esc(hero)}">${heroPlayersHtml(src, hero, rated, lines, null)}</div>
      ${src.ad2l ? heroPubSection(src, hero, known) : ""}
      ${h.players.length ? `<h2>Every player</h2><div id="players"></div>` : ""}
      <h2>Teams</h2>
      <div id="teams"></div>
      <p class="table-note">Win % is that team's record when they picked ${esc(hero)}.${S.drafted ? " Bans are Captains Mode drafts only; “Banned vs them” = opponents banned it against that team." : ""}</p>`],
    ["draft", `${(() => { const da = draftAnalysis(matches); return heroPhaseHtml(da.heroes.find((x) => x.hero === hero), da.games); })()}
      ${draftSlotHtml(draftSlotRecord(matches, byHero(hero)), src, hero, rateOf(h.games, gameRated))}`],
    ["matchups", heroMatchupsHtml(src, matches, hero)],
    ["combat", combatTabHtml(src, matches, byHero(hero), hero, { hero: true })],
    ["lanes", lanesPageHtml(src, matches, byHero(hero), laneCuts_, { name: hero, hero: true })],
    ["items", heroItemsHtml(src, h.games, hero) + heroNeutralsHtml(src, matches, hero) + (src.ad2l && h.games.length ? `<div id="sg-box" data-hero="${esc(hero)}"></div>` : "")],
    ["map", mapCard([
      ["wards", "Wards", "ward_map", wardView(collectWards(matches, byHero(hero)), hero)],
      ["deaths", "Deaths", "hero_deaths", playerDeathsHtml(matches, byHero(hero), { id: "hero-deaths", name: hero })],
      ["towers", "Towers", "hero_towers", towerSummaryHtml(matches, byHero(hero), { id: "hero-towers", name: hero })],
    ])],
    ["games", h.games.length ? `<h2 id="game-analysis">Game analysis${info("game_analysis")}</h2>
      <div id="game-box" data-hero="${esc(hero)}">${gameAnalysisHtml(src, "hero", h.games, 0, gameRated)}</div>
      <h2>Every game</h2><div id="t"></div>` : ""],
  ]), { store: "heroTab", label: "Hero sections" });

  app.innerHTML = `${header(tabs.bar)}${tabs.panels}`;
  wirePlayerTabs();
  wireMatchupTables(src, matches, hero);
  // Skill builds from the detail files, once they and the ability names load.
  if (app.querySelector("#sg-box")) Promise.all([detailsFor(src), loadAbilities()]).then(([det, named]) => {
    const box = document.getElementById("sg-box");
    if (box?.dataset.hero !== hero) return;
    const builds = h.games.filter((g) => g.m.match_id && det[g.m.match_id]).map((g) => det[g.m.match_id][g.m.players.indexOf(g.p)]?.skills);
    const html = skillGridHtml(skillGrid(builds, named), named);
    if (html) box.innerHTML = `<h2>Skill build${info("skill_build")}</h2>${html}`;
  });
  wireTowerMaps(app);
  wireCharts(app);
  wireMapCards(app);
  wireWardMaps(app);
  wireDeathMaps(app);
  sortableTable(document.getElementById("teams"), [
    ["name", "Team", (v, r) => teamLink(src, v, r.id), "l"],
    ["picks", "Picks", null, "", "gold"], ["wins", "Wins"],
    ["win_rate", "Win %", (v, r) => (r.picks ? pct(v) : "—"), "", "jade", "team_hero_wr"],
    ...(S.drafted ? [["bans", "Bans", null, "", "ember", "team_bans"], ["banned_against", "Banned vs them"]] : []),
    ["players", "Played by", (v) => v.map(esc).join(", ") || "—", "l"],
  ], h.teams, "picks", { toolbar: true });
  if (h.players.length) sortableTable(document.getElementById("players"), [
    ["name", "Player", (v, r) => playerLink(src, r), "l"],
    ["team", "Team", (v) => (v ? teamLink(src, v) : "—"), "l"],
    ["games", "Games", null, "", "gold"], ["wins", "Wins"], ["win_rate", "Win %", pct, "", "jade"],
    ["rating", "Hero rating", (v) => (v == null ? "—" : v), "", "gold", "hero_rating"],
    ["kda", "KDA", (v) => v.toFixed(2), "", "jade"], ["avg_gpm", "GPM"], ["dmg_per_min", "Dmg/min", fmt, "", "ember"], ["avg_kp", "KP", pct],
  ], h.players.map((p) => ({ ...p, rating: ratingOfKey.get(p.key) ?? null })), "rating", { toolbar: true });
  // Overall places fill in once every league has loaded (still this hero's page?).
  if (src.ad2l) Promise.all([overallHeroes(src), overallHeroRows(src)]).then(([oh, orows]) => {
    const box = (id) => { const el = document.getElementById(id); return el?.dataset.hero === hero ? el : null; };
    const pb = box("hero-players-box"), rb = box("hero-ranks-box");
    if (pb && rated.length) pb.innerHTML = heroPlayersHtml(src, hero, rated, lines, oh ? oh(hero) : []);
    if (rb) rb.innerHTML = statRanksHtml(src, hkey, rows, orows ?? [], HERO_RANKS);
  });
  if (h.games.length) sortableTable(document.getElementById("t"), [
    ["date", "Date", (v, r) => `${when(new Date(v))} <button type="button" class="ga-go" data-analyze="${r.gi}" title="Analyze this game">Analyze</button>`, "l"],
    ["player", "Player", (v, r) => playerLink(src, r.p), "l"],
    ["us", "Team", (v, r) => teamLink(src, v, r.us_id), "l"],
    ["won", "Result", (v) => `<span class="res ${v ? "w" : "l"}">${v ? "Win" : "Loss"}</span>`],
    ["vs", "Opponent", (v, r) => teamLink(src, v, r.vs_id), "l"],
    ["rating", "Game rating", (v) => (v == null ? "—" : v), "", "gold", "game_rating"],
    ["kills", "K"], ["deaths", "D"], ["assists", "A"],
    ["net_worth", "Net worth", fmt, "", "gold"], ["gpm", "GPM"], ["hero_damage", "Hero dmg", fmt, "", "ember"],
    ...(h.games.some((g) => fbOf(g.m)) ? [["fb", "First blood", fbCell, "", null, "first_blood"]] : []),
    ["link", "", (v) => `<a href="${v}" title="Open game">→</a>`],
  ], h.games.map((g, gi) => ({
    gi, rating: gameRated[gi].find((r) => r.key === playerKey(g.p))?.rating ?? null, fb: fbRole(g.m, g.p),
    date: g.m.createdAt ? +g.m.createdAt : 0, p: g.p, player: g.p.name, us: usOf(g).name, us_id: usOf(g).id ?? null,
    won: g.won ? 1 : 0, vs: vsOf(g).name, vs_id: vsOf(g).id ?? null,
    kills: g.p.kills, deaths: g.p.deaths, assists: g.p.assists, net_worth: g.p.net_worth, gpm: g.p.gpm, hero_damage: g.p.hero_damage, link: src.link(g.m),
  })), "date", { toolbar: true });
  if (h.games.length) wireGameAnalysis(src, "hero", h.games, gameRated, matches);
}

// Hero page Matchups tab: every hero seen with it and against it, with its record in those
// games. Small samples hide under a games floor (default 2, the select changes it).
function heroMatchupsHtml(src, matches, hero) {
  const { allies, enemies } = heroPairs(matches, hero);
  if (!allies.length) return "";
  const def = Math.max(...allies.map((a) => a.games)) >= 4 ? 2 : 1;
  return `<p class="table-note wm-intro">${esc(hero)}'s record with each hero on its side (With) and on the other side (Against). The minimum below hides small samples.</p>
    <div class="min-bar"><label>Show heroes met at least <select id="mu-min">${[1, 2, 3, 5].map((n) => `<option value="${n}" ${n === def ? "selected" : ""}>${n}</option>`).join("")}</select> times</label></div>
    <div class="team-cols"><section><h2>With${info("hero_with")}</h2><div id="mu-with"></div></section>
      <section><h2>Against${info("hero_against")}</h2><div id="mu-against"></div></section></div>`;
}
function wireMatchupTables(src, matches, hero) {
  const sel = document.getElementById("mu-min");
  if (!sel) return;
  const { allies, enemies } = heroPairs(matches, hero);
  const draw = () => {
    const min = +sel.value;
    for (const [id, list, label] of [["mu-with", allies, "Win % with"], ["mu-against", enemies, "Win % against"]]) {
      const rows = list.filter((r) => r.games >= min);
      sortableTable(document.getElementById(id), [
        ["hero", "Hero", (v) => `<span class="hero-cell">${portrait(v)}${heroLink(src, v)}</span>`, "l"],
        ["games", "Games", null, "", "gold"], ["wins", "Wins"], ["win_rate", label, pct, "", "jade", false],
      ], rows, "games");
    }
  };
  sel.onchange = draw;
  draw();
}

// Hero page: neutral items held at the end of its games, with the record when held.
function heroNeutralsHtml(src, matches, hero) {
  const rows = heroNeutrals(matches, hero);
  if (!rows.length) return "";
  return `<h2>Neutral items${info("hero_neutrals")}</h2>
    <div class="table-wrap"><table><thead><tr><th scope="col" class="l">Neutral item</th><th scope="col">Games</th><th scope="col">Record</th><th scope="col">Win %</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td class="l">${itemIcon(r.key)} ${esc(itemName(r.key))}</td><td>${r.games}</td><td>${r.wins}–${r.games - r.wins}</td><td>${pct(r.win_rate)}</td></tr>`).join("")}
    </tbody></table></div><p class="table-note">The neutral item in its slot when the game ended.</p>`;
}