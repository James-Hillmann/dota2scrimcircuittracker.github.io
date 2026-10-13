// Players tab: tier list, stat leaders, laning, medal vs rating and the full stats table, one
// tab each (lib/pagetabs.js PLAYERS_PAGE_TABS, which the nav dropdown lists too).
import { hasDetails, playerLeaderboard } from "../lib/stats.js";
import { tierList, rankLabel } from "../lib/tiers.js";
import { pubSummary, pubsSince } from "../lib/predict.js";
import { info } from "../lib/glossary.js";
import { RANK_STATS, rankStat, ends, placeOf, ordinal, formatStat } from "../lib/ranks.js";
import { medalValue } from "../lib/combat.js";
import { medalScatterHtml } from "../lib/combat-charts.js";
import { floorOf, inLeague, portrait, overallBadge, playerLink, teamLink, esc, LEAGUE_COUNT, app, pageHead, playerTabs, wirePlayerTabs, playerHref, pubStart, sortableTable, pct, fmt, dec, PUB_DAYS, heroStrip } from "../core.js";
import { loading, errorBox, weekOfFn, lanesSection, laneCutsOf } from "../parts/lanes.js";
import { overallStats, statRows } from "../parts/ranks.js";
import { meter, tierSection, tierRef } from "../parts/tiers.js";
import { pageTabs, PLAYERS_PAGE_TABS } from "../lib/pagetabs.js";
import { POS_NAMES } from "../lib/herogrid.js";

const LEADER_KEY = "scrim-leader-stat";
let leaderStat = (() => { try { return localStorage.getItem(LEADER_KEY) ?? "kda"; } catch { return "kda"; } })();
// Role filter: everyone, cores (pos 1–3), supports (4–5) or one position, by main position.
const LEADER_ROLES = [["all", "Everyone", () => true], ["core", "Cores", (n) => n <= 3], ["support", "Supports", (n) => n >= 4],
  ...[1, 2, 3, 4, 5].map((n) => [String(n), `Pos ${n} · ${POS_NAMES[n]}`, (x) => x === n])];
let leaderRole = "all";

// Players page: pick a stat, see the league's top and bottom 3 on it.
function leadersSection(src, allRows) {
  const hasPos = allRows.some((r) => r.main_pos);
  const stats = RANK_STATS.filter((s) => allRows.some((r) => r[s.key] != null));
  let overall = null;
  const draw = () => {
    const el = document.getElementById("leaders");
    if (!el) return;
    const stat = stats.find((s) => s.key === leaderStat) ?? stats.find((s) => s.key === "kda");
    const val = (r) => r[stat.key];
    const role = LEADER_ROLES.find(([id]) => id === leaderRole) ?? LEADER_ROLES[0];
    const inRole = (r) => role[0] === "all" || (r.main_pos != null && role[2](r.main_pos));
    const rows = allRows.filter(inRole);
    const ranked = rankStat(rows, stat, floorOf(src)), { top, bottom, top_spill, bottom_spill } = ends(ranked, val);
    const pool = overall && rankStat(overall.filter(inRole), stat, floorOf(src));
    // Meter: where the value sits between the league's worst (0) and best (full).
    const best = ranked.length ? val(ranked[0]) : 0, worst = ranked.length ? val(ranked.at(-1)) : 0;
    const meter = (v) => (best === worst ? 1 : (v - worst) / (best - worst));
    const plate = (r, i, end) => {
      const pl = pool && placeOf(pool, inLeague(src, r.key), val);
      const mine = placeOf(ranked, (x) => x.key === r.key, val);
      const hero = r.hero_list?.[0]?.hero;
      return `<div class="ld-plate ld-${end}${end === "top" ? ` ld-p${mine.rank}` : ""}${pl?.end ? " ov" : ""}" style="--i:${i}; --m:${meter(val(r)).toFixed(3)}">
        ${hero ? portrait(hero, "ld-art") : ""}
        <span class="ld-num" aria-hidden="true">${mine.rank}</span>
        <div class="ld-head"><span class="ld-place">${mine.tied > 1 ? "Tied " : ""}${ordinal(mine.rank)}${end === "bottom" ? ` of ${ranked.length}` : ""}</span>${overallBadge(pl)}</div>
        <div class="ld-name">${playerLink(src, r)}</div>
        <div class="ld-meta">${r.team ? `${teamLink(src, r.team)} · ` : ""}${r.games} games</div>
        <div class="ld-val">${formatStat(stat, val(r))}<small>${esc(stat.label)}</small></div>
        <div class="ld-meter"><i></i></div>
      </div>`;
    };
    // A tie that runs past the 3 is named as a group instead of picking three of it.
    const spill = (sp, end, i) => (sp ? `<div class="ld-plate ld-${end} ld-spill" style="--i:${i}; --m:${meter(val(sp.sample)).toFixed(3)}">
        <div class="ld-head"><span class="ld-place">Tied ${ordinal(placeOf(ranked, (x) => x === sp.sample, val).rank)}</span></div>
        <div class="ld-name">${sp.count} players</div><div class="ld-meta">all on the same number</div>
        <div class="ld-val">${formatStat(stat, val(sp.sample))}<small>${esc(stat.label)}</small></div>
        <div class="ld-meter"><i></i></div>
      </div>` : "");
    const band = (end, label, xs, sp) => `<div class="ld-band ld-band-${end}">
        <div class="ld-tag"><span class="ld-arrow">${end === "top" ? "▲" : "▼"}</span><span>${label}</span></div>
        <div class="ld-plates reveal">${xs.length || sp ? `${xs.map((r, i) => plate(r, i, end)).join("")}${spill(sp, end, xs.length)}` : `<div class="tier-empty">Nobody with ${floorOf(src)}+ games yet</div>`}</div>
      </div>`;
    el.querySelector(".ld-lists").innerHTML = `${band("top", stat.low ? "Top 3 · fewest" : "Top 3", top, top_spill)}${band("bottom", stat.low ? "Bottom 3 · most" : "Bottom 3", bottom, bottom_spill)}`;
    el.querySelector(".ld-note").textContent = `${ranked.length} ${{ all: "players", core: "cores", support: "supports" }[role[0]] ?? `pos ${role[0]} players`} with ${floorOf(src)}+ games${stat.map ? " and replays" : ""}${role[0] === "all" ? "" : ", by the position each plays most"}.${src.ad2l ? overall ? ` Badges: top or bottom 3 across all ${LEAGUE_COUNT} AD2L leagues (${pool.length} players).` : " Loading the other leagues…" : ""}`;
  };
  const html = `<h2 id="stat-leaders">Stat leaders${info("stat_leaders")}</h2>
    <div id="leaders">
      <div class="sort-bar"><label>Stat <select id="ld-stat">${stats.map((s) => `<option value="${s.key}" ${s.key === leaderStat ? "selected" : ""}>${esc(s.label)}</option>`).join("")}</select></label>${hasPos ? `<label>Role <select id="ld-role">${LEADER_ROLES.map(([id, label]) => `<option value="${id}" ${id === leaderRole ? "selected" : ""}>${esc(label)}</option>`).join("")}</select></label>` : ""}</div>
      <div class="ld-lists"></div>
      <p class="table-note ld-note"></p>
    </div>`;
  const wire = () => {
    const sel = document.getElementById("ld-stat");
    if (sel) sel.onchange = () => { leaderStat = sel.value; try { localStorage.setItem(LEADER_KEY, leaderStat); } catch { /* not remembered */ } draw(); };
    const role = document.getElementById("ld-role");
    if (role) role.onchange = () => { leaderRole = role.value; draw(); };
    draw();
    overallStats(src).then((o) => { overall = o; if (o) draw(); else if (src.ad2l) { const n = document.querySelector("#leaders .ld-note"); if (n) n.textContent += " (the other leagues couldn't be loaded)"; } });
  };
  return { html, draw: wire };
}

export async function renderPlayers(src) {
  app.innerHTML = loading(src.kicker, "Players");
  let matches;
  try { matches = (await src.load()).filter(hasDetails); } catch (e) { app.innerHTML = `${pageHead(src.kicker, "Players")}${errorBox(e)}`; return; }
  const data = playerLeaderboard(matches);
  const tiers = data.length ? tierSection(src, matches, await tierRef(src)) : null;
  const leaders = data.length ? leadersSection(src, statRows(matches)) : null;
  let lanes = null;
  if (data.length && src.ad2l) {
    const weekOf = weekOfFn(await src.data()), latest = Math.max(...matches.map(weekOf));
    lanes = lanesSection(src, matches, await laneCutsOf(src), matches.filter((m) => weekOf(m) === latest));
  }
  // Medal against tier rating (AD2L: PlayOn medals), for everyone on the tier list.
  let scatter = "";
  if (data.length && src.ad2l) {
    const tl = tierList(matches, { model: await tierRef(src), minGames: floorOf(src) });
    const pts = tl.tiers.flatMap(({ tier, players }) => players.map((p) => ({ key: p.key, name: p.name, medal: medalValue(p.rank_tier), rank: rankLabel(p.rank_tier), rating: p.rating, tier, href: playerHref(src, p.key) })));
    const fig = medalScatterHtml(pts, { id: `medal-${src.key}` });
    if (fig) scatter = `<h2 id="medal-rating">Medal vs rating${info("medal_rating")}</h2>${fig}`;
  }
  const hasStandins = src.ad2l && data.some((r) => r.standin || r.standin_games);
  const tabs = data.length && playerTabs(pageTabs(PLAYERS_PAGE_TABS, src, [
    ["tiers", tiers.html], ["leaders", leaders.html], ["lanes", lanes?.html ?? ""], ["medal", scatter],
    ["stats", `<h2 id="player-stats">All stats</h2>
    ${hasStandins ? `<div class="row segs pl-filter" role="group" aria-label="Players shown">${[["all", "Everyone"], ["standin", "Played as a stand-in"]].map(([id, label]) => `<button type="button" class="seg${id === "all" ? " on" : ""}" data-pl-filter="${id}" aria-pressed="${id === "all"}">${label}</button>`).join("")}</div>` : ""}
    <div id="t" class="reveal"></div>
    ${src.ad2l ? `<p class="table-note">Players are matched by their PlayOn name (smurfs included).</p>` : ""}`],
  ]), { store: "playersTab", label: "Players sections" });
  app.innerHTML = `${pageHead(src.kicker, "Players", data.length ? `${data.length} players across ${matches.length} ${matches.length === 1 ? "game" : "games"}.` : "", tabs?.bar)}
    ${data.length ? tabs.panels : `<div class="panel empty"><strong>No players yet</strong>${src.empty}</div>`}`;
  if (!data.length) return;
  wirePlayerTabs();
  tiers.draw();
  leaders.draw();
  lanes?.draw();
  const teamCol = src.ad2l
    ? [["team", "Team", (v, r) => `${v ? teamLink(src, v) : ""}${r.standin ? ' <span class="tag">stand-in</span>' : r.standin_games ? ` <span class="tag">+${r.standin_games} as stand-in</span>` : ""}`, "l name"]] : [];
  const tableRows = src.ad2l && src.cache()?.pubs ? data.map((r) => {
    const ps = r.account_id ? pubSummary(pubsSince(src.cache(), r.account_id, pubStart(src.cache()))) : null;
    return { ...r, pub_games: ps?.games ?? 0, pub_win_rate: ps?.win_rate ?? null, pub_kda: ps?.kda ?? null, pub_heroes: ps ? ps.heroes.map((h) => h.hero).join(", ") : "", pub_list: ps ? ps.heroes.slice(0, 10).map((h) => ({ hero: h.hero, n: h.games })) : [] };
  }) : data;
  const drawTable = (rows) => sortableTable(document.getElementById("t"), [
    ["name", "Player", (v, r) => playerLink(src, r), "l name"], ...teamCol, ["games", "Games"], ["win_rate", "Win %", pct, "", "jade"],
    ["kills", "K"], ["deaths", "D"], ["assists", "A"], ["kda", "KDA", (v) => v.toFixed(2), "", "jade"],
    ["avg_gpm", "GPM", null, "", "gold"], ["avg_xpm", "XPM"], ["dmg_per_min", "Dmg/min", fmt, "", "ember"], ["dmg_per_1k_nw", "Dmg per 1k NW", fmt, "", "ember"],
    ...(data.some((r) => r.dmg_taken_pg != null) ? [["dmg_taken_pg", "Dmg taken/g", (v) => fmt(v == null ? null : Math.round(v)), "", "ember"]] : []),
    ["avg_kp", "Avg KP", pct],
    ...(data.some((r) => r.map_games) ? [
      ["stacks_pg", "Stacks/g", dec], ["obs_pg", "Obs/g", dec, "", "jade"], ["sen_pg", "Sentries/g", dec], ["dewards_pg", "Dewards/g", dec, "", "ember"],
      ["lane_pg", "Lane creeps/g", dec], ["neutral_pg", "Neutrals/g", dec], ["neutral_share", "Neutral %", pct], ["roshans", "Roshans"], ["tormentors", "Tormentors"],
      ["buybacks_pg", "Buybacks/g", dec],
    ] : []),
    ...(data.some((r) => r.combat_games) ? [
      ["apm", "APM", (v) => (v == null ? "—" : Math.round(v)), "", "gold"], ["tf_part", "Fights", pct], ["fb_rate", "First blood %", pct], ["fb_death_rate", "Died first %", pct, "", "ember"],
      ["best_streak", "Best streak", (v) => (v == null ? "—" : v >= 10 ? "10+" : v), "", "ember"], ["rampages", "Rampages"], ["ultras", "Ultras"],
      ["runes_pg", "Runes/g", dec], ["courier_kills", "Couriers"], ["pings_pg", "Pings/g", dec],
    ] : []),
    ...(src.ad2l && src.cache()?.pubs ? [
      ["pub_games", `Pubs (${PUB_DAYS} days)`, null, "", "gold"], ["pub_win_rate", "Pub win %", pct, "", "jade"], ["pub_kda", "Pub KDA", dec],
      ["pub_heroes", "Pub heroes", (v, r) => heroStrip(src, r.pub_list), "l strip"],
    ] : []),
    ["heroes", "Heroes", (v, r) => heroStrip(src, r.hero_list), "l strip"],
  ], rows, "games", { toolbar: true });
  drawTable(tableRows);
  // Everyone, or only players who filled in for a team they're not rostered on.
  app.querySelectorAll("[data-pl-filter]").forEach((b) => (b.onclick = () => {
    for (const x of app.querySelectorAll("[data-pl-filter]")) { const on = x === b; x.classList.toggle("on", on); x.setAttribute("aria-pressed", String(on)); }
    drawTable(b.dataset.plFilter === "standin" ? tableRows.filter((r) => r.standin || r.standin_games) : tableRows);
  }));
}