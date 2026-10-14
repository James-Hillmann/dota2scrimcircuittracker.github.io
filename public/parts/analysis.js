// Game analysis: one player's (or hero's) game against their usual, on player and hero pages.
import { playerKey } from "../lib/stats.js";
import { METRICS } from "../lib/tiers.js";
import { wardMapHtml, wardsOf, wireWardMaps } from "../lib/wardmap.js";
import { gameGoldHtml, wireGameGold } from "../lib/gamegold.js";
import { info } from "../lib/glossary.js";
import { ordinal } from "../lib/ranks.js";
import { pct, fmt, kg, dur, esc, portrait, shortDate, playerLink, heroLink, teamLink, when, leagueShort, allLeagues } from "../core.js";
import { rateOf } from "./draft.js";
import { plusSlot } from "../lib/hero-levels.js";

// ---------- Game analysis (player page) ----------
// One of the player's games in depth: a picker (every game, newest first, with its game
// rating), then that game's rating and what built it, where they finished among the ten,
// their full stat line with each number's place in the game, and the map of their wards,
// kills and deaths.

const per10 = (v) => `${v.toFixed(1)}/10m`;
const GA_METRIC_FMT = {
  farm: pct, dmg: pct, tower: pct, kills: pct, assists: pct, dead: pct,
  gpm: (v) => fmt(Math.round(v)), xpm: (v) => fmt(Math.round(v)), nw: kg, tanked: kg, stacks: (v) => v.toFixed(1),
  lanewin: (v) => `${v >= 0 ? "+" : "−"}${kg(Math.abs(v))}`, lane: (v) => `${Math.round(v)}%`,
  stuns: (v) => `${v.toFixed(1)}s/min`, vision: (v) => `${v.toFixed(1)}% of map`, heal: (v) => `${Math.round(v)}/min`,
  dewards: per10, sentries: per10, dust: per10, smokes: per10, deaths: per10,
};
const deathGold = (p) => {
  const a = p.death_log;
  if (!Array.isArray(a) || !a.length) return Array.isArray(a) ? 0 : null;
  let t = 0;
  for (let j = 2; j < a.length; j += 6) { if (a[j] < 0) return null; t += a[j]; }
  return t;
};
// Stat tiles: [label, value(p) for ranking, shown(p), sub(p, m), direction] — direction 1 =
// higher is better, -1 = lower is better, 0 = no better or worse (only its place is shown).
const GA_STATS = [
  ["Combat", [
    ["K / D / A", (p) => (p.kills + p.assists) / Math.max(1, p.deaths), (p) => `${p.kills}/${p.deaths}/${p.assists}`, (p) => `KDA ${((p.kills + p.assists) / Math.max(1, p.deaths)).toFixed(2)}`, 1],
    ["Kill participation", (p) => p.kill_participation, (p) => pct(p.kill_participation), () => "kills + assists ÷ team kills", 1],
    ["Hero damage", (p) => p.hero_damage, (p) => fmt(p.hero_damage), (p) => `${fmt(p.dmg_per_min)} per min`, 1],
    ["Damage share", (p) => p.dmg_share, (p) => pct(p.dmg_share), () => "of the team's hero damage", 1],
    ["Damage taken", (p) => p.dmg_taken, (p) => fmt(p.dmg_taken), (p) => (p.dmg_taken != null ? `${kg(p.dmg_taken / (p.deaths + 1))} per life` : ""), 0],
    ["Stun time", (p) => p.stuns, (p) => (p.stuns == null ? "—" : `${p.stuns.toFixed(1)}s`), () => "disables on enemy heroes", 1],
    ["Healing", (p) => p.hero_healing, (p) => fmt(p.hero_healing), () => "to allied heroes", 1],
  ]],
  ["Economy", [
    ["Net worth", (p) => p.net_worth, (p) => fmt(p.net_worth), () => "at the end", 1],
    ["GPM", (p) => p.gpm, (p) => fmt(p.gpm), () => "gold per minute", 1],
    ["XPM", (p) => p.xpm, (p) => fmt(p.xpm), (p) => `level ${p.level ?? "—"}`, 1],
    ["Last hits", (p) => p.last_hits, (p) => fmt(p.last_hits), (p) => `${fmt(p.denies)} denies`, 1],
    ["Creeps", (p) => (p.lane_kills == null ? null : p.lane_kills + p.neutral_kills), (p) => (p.lane_kills == null ? "—" : `${p.lane_kills} / ${p.neutral_kills}`), (p) => (p.ancient_kills != null ? `lane / neutral · ${p.ancient_kills} ancients` : "lane / neutral"), 1],
    ["Lane efficiency", (p) => p.lane_eff, (p) => (p.lane_eff == null ? "—" : `${p.lane_eff}%`), () => "of the gold a lane gives, first 10 min", 1],
  ]],
  ["Map & vision", [
    ["Observers", (p) => p.obs_placed, (p) => fmt(p.obs_placed), () => "placed", 1],
    ["Sentries", (p) => p.sen_placed, (p) => fmt(p.sen_placed), () => "placed", 1],
    ["Dewards", (p) => (p.obs_killed == null ? null : p.obs_killed + p.sen_killed), (p) => (p.obs_killed == null ? "—" : String(p.obs_killed + p.sen_killed)), (p) => (p.obs_killed == null ? "" : `${p.obs_killed} obs · ${p.sen_killed} sen`), 1],
    ["Stacks", (p) => p.camps_stacked, (p) => fmt(p.camps_stacked), () => "camps stacked", 1],
    ["Building damage", (p) => p.tower_damage, (p) => fmt(p.tower_damage), () => "towers, barracks, Ancient", 1],
    ["Roshan / Tormentor", (p) => (p.roshan_kills == null ? null : p.roshan_kills + p.tormentor_kills), (p) => (p.roshan_kills == null ? "—" : `${p.roshan_kills} / ${p.tormentor_kills}`), () => "last hits", 1],
    ["Smoke / Dust", (p) => (p.smoke_used == null ? null : p.smoke_used + p.dust_used), (p) => (p.smoke_used == null ? "—" : `${p.smoke_used} / ${p.dust_used}`), () => "used", 0],
  ]],
  ["Survival", [
    ["Deaths", (p) => p.deaths, (p) => String(p.deaths), (p, m) => `${((p.deaths / m.duration_sec) * 600).toFixed(1)} per 10 min`, -1],
    ["Time dead", (p) => p.time_dead, (p) => (p.time_dead == null ? "—" : dur(p.time_dead)), (p, m) => (p.time_dead == null ? "" : `${pct(p.time_dead / m.duration_sec)} of the game`), -1],
    ["Gold lost", deathGold, (p) => fmt(deathGold(p)), () => "to deaths", -1],
  ]],
];

// Place among `players` for one stat: { rank, of, tied } (null when this player lacks it).
function placeAmong(players, p, val, dir) {
  const mine = val(p);
  if (mine == null) return null;
  const vs = players.map(val).filter((v) => v != null);
  const better = vs.filter((v) => (dir < 0 ? v < mine : v > mine)).length;
  return { rank: better + 1, of: vs.length, tied: vs.filter((v) => v === mine).length };
}

// What the stat line ranks against, kept while the page is open: `pool` "game" (the ten in
// the game), "pos" (every game at their position) or "all" (every player-game, any role);
// `leagues` adds every other league's games to the last two.
const cmp = { pool: "game", leagues: false };
// ctx: { matches: the page league's games, others: every other league's (null until loaded) }.
const poolMemo = new Map();
function poolOf(src, ctx, p) {
  const pos = cmp.pool === "pos" && p.position != null ? p.position : null;
  const lists = cmp.leagues && ctx.others ? [ctx.matches, ...ctx.others] : [ctx.matches];
  const k = `${pos}|${lists.length}`;
  let byKey = poolMemo.get(ctx);
  if (!byKey) poolMemo.set(ctx, (byKey = new Map()));
  if (!byKey.has(k)) byKey.set(k, lists.flatMap((ms) => ms.flatMap((m) => m.players ?? [])).filter((q) => pos == null || q.position === pos));
  return byKey.get(k);
}
const showLeagues = (src) => !src.all;

function statLineHtml(src, m, p, ctx) {
  const inGame = cmp.pool === "game" || !ctx;
  const players = inGame ? m.players : poolOf(src, ctx, p);
  const wide = cmp.leagues && !inGame && showLeagues(src);
  const loadingOthers = wide && !ctx.others;
  const where = wide ? "every league" : leagueShort(src);
  const what = inGame ? `the ${m.players.length} players in the game`
    : cmp.pool === "pos" && p.position != null ? `every pos ${p.position} game in ${where}` : `every player's games in ${where}, any role`;
  const tile = ([label, val, shown, sub, dir], k) => {
    const q = placeAmong(players, p, val, dir || 1);
    // In a pool bigger than a game, green / red are the top / bottom tenth.
    const cut = inGame ? 3 : Math.max(1, Math.round((q?.of ?? 0) / 10));
    const tone = !q || !dir ? "" : q.rank === 1 && q.tied === 1 ? " best" : q.rank <= cut ? " good" : q.rank > q.of - cut ? " bad" : "";
    return `<div class="ga-stat${tone}" style="--i:${k}"><div class="ga-top"><div class="k">${label}</div>${q ? `<div class="ga-rk">${q.tied > 1 ? "=" : ""}${ordinal(q.rank)}<small>/${q.of}</small></div>` : ""}</div>
      <div class="v">${shown(p)}</div><div class="s">${sub(p, m) || "&nbsp;"}</div></div>`;
  };
  const groups = GA_STATS.map(([name, stats]) => {
    const have = stats.filter(([, val]) => val(p) != null);
    return have.length ? `<div class="ga-group"><div class="ga-group-h">${name}</div><div class="ga-stats">${have.map(tile).join("")}</div></div>` : "";
  }).join("");
  const seg = (v, label) => `<button type="button" class="seg${cmp.pool === v ? " on" : ""}" data-cmp="${v}" aria-pressed="${cmp.pool === v}">${label}</button>`;
  const bar = ctx ? `<div class="ga-cmp" role="group" aria-label="Rank against"><span class="ga-cmp-l">Rank against</span>
      <span class="segs">${seg("game", "This game")}${p.position != null ? seg("pos", `Pos ${p.position}`) : ""}${seg("all", "All roles")}</span>
      ${showLeagues(src) ? `<button type="button" class="seg ga-cmp-x${cmp.leagues ? " on" : ""}" data-cmp-leagues aria-pressed="${cmp.leagues}"${inGame ? " disabled title=\"Pick a position or All roles first\"" : ""}>+ Other leagues</button>` : ""}
    </div>` : "";
  const tones = inGame ? "gold = best in the game, green = top 3, red = bottom 3" : "gold = the best of all, green = top tenth, red = bottom tenth";
  return `<h3 class="ga-h3">Stat line <small>place in brackets, among ${what}: ${tones}${loadingOthers ? " · loading the other leagues…" : ""}</small></h3>
    ${bar}${groups}`;
}

// The game picker, GA_PAGE games a page, newest first; `page` defaults to the selected game's.
const GA_PAGE = 8;
// `mode`: "player" (one player's games) or "hero" (everyone's games on one hero: tiles name
// the player instead of the hero).
function gamePickerHtml(src, mode, games, gi, rated, page = Math.floor(gi / GA_PAGE)) {
  const rateOf = (k) => rated[k].find((r) => r.key === playerKey(games[k].p));
  const ratings = games.map((_, k) => rateOf(k)?.rating ?? null).filter((r) => r != null);
  const hi = Math.max(...ratings);
  const pages = Math.ceil(games.length / GA_PAGE), from = page * GA_PAGE;
  const tiles = games.slice(from, from + GA_PAGE).map((x, n) => {
    const k = from + n, r = rateOf(k), them = x.p.team === "a" ? x.m.team_b : x.m.team_a;
    const flag = games.length > 2 && r && r.rating === hi ? "Best" : "";
    return `<button type="button" class="ga-g ${x.won ? "ga-w" : "ga-l"}${r ? ` t-${r.tier}` : ""}" data-gi="${k}" aria-pressed="${k === gi}" style="--i:${n}"
        title="${esc(mode === "hero" ? x.p.name : x.p.hero)} vs ${esc(them)} · ${x.won ? "Won" : "Lost"} · ${x.p.kills}/${x.p.deaths}/${x.p.assists}">
      ${portrait(x.p.hero, "ga-g-img")}
      <span class="ga-g-body">${plusSlot(x.p.account_id, x.p.hero, x.m.start_time)}${mode === "hero" ? `<span class="ga-g-who">${esc(x.p.name)}</span>` : ""}<span class="ga-g-vs">vs ${esc(them)}</span>
        <span class="ga-g-date">${x.m.createdAt ? shortDate(new Date(x.m.createdAt)) : ""} · <b class="res ${x.won ? "w" : "l"}">${x.won ? "W" : "L"}</b></span>
        <span class="ga-g-kda">${x.p.kills}/${x.p.deaths}/${x.p.assists}</span></span>
      ${r ? `<span class="ga-g-r"><b>${r.rating}</b><small>${r.tier}</small></span>` : ""}${flag ? `<span class="ga-g-flag">${flag}</span>` : ""}
    </button>`;
  }).join("");
  const pager = pages > 1 ? `<div class="ga-pager">
      <button type="button" class="ga-pg" data-page="${page - 1}" ${page === 0 ? "disabled" : ""} aria-label="Newer games">‹ Newer</button>
      <span>${from + 1}–${Math.min(from + GA_PAGE, games.length)} <small>of ${games.length} games</small></span>
      <button type="button" class="ga-pg" data-page="${page + 1}" ${page === pages - 1 ? "disabled" : ""} aria-label="Older games">Older ›</button>
    </div>` : "";
  return `<div class="ga-pick" role="group" aria-label="Pick a game">${tiles}</div>${pager}`;
}

export function gameAnalysisHtml(src, mode, games, gi, rated, ctx = null) {
  const g = games[gi], m = g.m, p = g.p, i = m.players.indexOf(p);
  const list = rated[gi], me = list.find((r) => r.key === playerKey(p));
  const sideOfKey = Object.fromEntries(m.players.map((q) => [playerKey(q), q.team]));
  const vs = p.team === "a" ? { name: m.team_b, id: m.team_b_id } : { name: m.team_a, id: m.team_a_id };
  const us = p.team === "a" ? m.team_a : m.team_b;
  const ad2lSides = src.ad2l && !m.unticketed;

  const head = `<div class="ga-head ${g.won ? "ga-w" : "ga-l"}">
    <div class="ga-art">${portrait(p.hero, "ga-art-img")}${plusSlot(p.account_id, p.hero, m.start_time)}</div>
    <div class="ga-head-body">
      <div class="ga-result">${g.won ? "Victory" : "Defeat"}</div>
      <div class="ga-title">${mode === "hero" ? playerLink(src, p) : heroLink(src, p.hero)} <span class="muted">vs</span> ${teamLink(src, vs.name, vs.id ?? null)}</div>
      <div class="ga-meta">${m.createdAt ? when(new Date(m.createdAt)) : ""} · ${dur(m.duration_sec)} · ${ad2lSides ? (p.team === "a" ? "Radiant" : "Dire") : esc(us)}${me ? ` · pos ${p.position ?? "?"} ${me.role}` : ""} · ${esc(m.team_a)} ${m.score_a}–${m.score_b} ${esc(m.team_b)}</div>
    </div>
    <div class="ga-kda"><b>${p.kills}</b><i>/</i><b class="d">${p.deaths}</b><i>/</i><b>${p.assists}</b><small>K / D / A</small></div>
    <a class="ga-open" href="${src.link(m)}">Full game →</a>
  </div>`;

  // Impact: the game rating, their place among the ten, and what built it.
  let impact = "";
  if (me) {
    const place = list.indexOf(me) + 1;
    const team = list.filter((r) => sideOfKey[r.key] === p.team), tplace = team.indexOf(me) + 1;
    const role = me.roles[0];
    const parts = [...role.stats, ...role.survival.map((x) => ({ ...x, surv: true }))];
    const lean = (x) => (x.score - 50) * x.share * (x.surv ? 0.5 : 1);
    const up = parts.filter((x) => lean(x) > 1.5).sort((a, b) => lean(b) - lean(a)).slice(0, 3);
    const down = parts.filter((x) => lean(x) < -1.5).sort((a, b) => lean(a) - lean(b)).slice(0, 3);
    const valOf = (x) => (GA_METRIC_FMT[x.metric] ?? ((v) => v.toFixed(2)))(x.value);
    const avgOf = (x) => (GA_METRIC_FMT[x.metric] ?? ((v) => v.toFixed(2)))(x.avg);
    const why = (x) => `<li><b>${esc(METRICS[x.metric].label)}</b><span>${valOf(x)} <small>vs ${avgOf(x)} for pos ${p.position ?? "?"}</small></span></li>`;
    const bar = (x) => `<div class="ga-bar${x.score >= 65 ? " up" : x.score <= 35 ? " down" : ""}" style="--m:${(x.score / 100).toFixed(3)}">
        <span class="ga-bar-l">${esc(METRICS[x.metric].label)}${info(`tm_${x.metric}`)}</span>
        <span class="ga-bar-t"><i></i></span>
        <span class="ga-bar-v">${valOf(x)} <small>avg ${avgOf(x)}</small></span>
        <span class="ga-bar-p">${x.surv ? `${Math.round(x.score)}` : `${x.points.toFixed(1)}<small>/${x.max.toFixed(0)}</small>`}</span>
      </div>`;
    const mult = (label, v, note) => `<div class="ga-mult${v > 1.001 ? " up" : v < 0.999 ? " down" : ""}"><b>×${v.toFixed(2)}</b><small>${label}</small><em>${note}</em></div>`;
    const ten = list.map((r, k) => {
      const q = m.players.find((x) => playerKey(x) === r.key);
      return `<li class="${r === me ? "me" : ""} s-${sideOfKey[r.key]}"><span class="ga-ten-n">${k + 1}</span>${q ? portrait(q.hero) : ""}
        <span class="ga-ten-name">${q ? plusSlot(q.account_id, q.hero, m.start_time) + playerLink(src, q) : esc(r.name)}</span><span class="ga-ten-r t-${r.tier}">${r.rating}</span></li>`;
    }).join("");
    impact = `<div class="ga-impact">
      <div class="ga-score t-${me.tier}">
        <div class="ga-rating"><span class="ga-letter">${me.tier}</span><b>${me.rating}</b><small>game<br>rating${info("game_rating")}</small></div>
        <div class="ga-places">
          <div><b>${ordinal(place)}</b><small>of ${list.length} in the game</small></div>
          <div><b>${ordinal(tplace)}</b><small>of ${team.length} on ${esc(us)}</small></div>
        </div>
        <div class="ga-mults">
          <div class="ga-mult"><b>${Math.round(me.stat_points)}</b><small>stat points</small><em>/100 ${me.role}</em></div>
          ${mult("survival", me.mult.survival, `${Math.round(me.survival)}/100`)}
          ${mult("result", me.mult.winning, g.won ? `won in ${dur(m.duration_sec)}` : "lost")}
          ${mult("opponent", me.mult.opponents, esc(vs.name))}
        </div>
      </div>
      <div class="ga-why">
        <div class="ga-why-col up"><h3>Won it with</h3><ul>${up.map(why).join("") || "<li class='muted'>Nothing well above the position's average.</li>"}</ul></div>
        <div class="ga-why-col down"><h3>Held back by</h3><ul>${down.map(why).join("") || "<li class='muted'>Nothing well below the position's average.</li>"}</ul></div>
      </div>
      <ol class="ga-ten">${ten}</ol>
    </div>
    <details class="ga-more"><summary>Every part of the rating</summary>
      <div class="ga-bars">${role.stats.map(bar).join("")}<div class="ga-bars-h">Survival</div>${role.survival.map((x) => bar({ ...x, surv: true })).join("")}</div>
      <p class="table-note">Each stat scored 0–100 against what position ${p.position ?? "?"} does in ${leagueShort(src)} (50 = average), weighted like the tier list.</p>
    </details>`;
  }

  // Wards only: kills and deaths are on the gold chart and the page's own deaths map.
  const map = i >= 0 ? wardMapHtml([{ label: p.hero, cls: "s-mine", wards: wardsOf(p) }], { id: "ga-map" }) : "";
  const gold = i >= 0 ? gameGoldHtml(m, i, { id: "ga-gold" }) : "";
  return `<div class="ga-picker reveal" data-gi="${gi}">${gamePickerHtml(src, mode, games, gi, rated)}</div>
    ${head}
    ${impact}
    <div class="ga-statline">${statLineHtml(src, m, p, ctx)}</div>
    ${gold ? `<h3 class="ga-h3">Gold &amp; events${info("game_gold")}<small>Their gold against the enemy at the same position, their team's lead underneath, and what happened when. Hover for any minute.</small></h3>${gold}` : ""}
    ${map ? `<h3 class="ga-h3">Wards</h3>${map}` : `<p class="table-note keep">No wards on record for this game${src.ad2l ? "" : " (screenshot uploads don't have them)"}.</p>`}`;
}

// `matches`: the page league's games, which the stat line can rank against.
export function wireGameAnalysis(src, mode, games, rated, matches) {
  const box = document.getElementById("game-box");
  if (!box) return;
  const ctx = { matches, others: null };
  let othersReady = null;
  const statLine = () => {
    const wrap = box.querySelector(".ga-statline"), gi = +box.querySelector(".ga-picker")?.dataset.gi;
    if (wrap && games[gi]) wrap.innerHTML = statLineHtml(src, games[gi].m, games[gi].p, ctx);
  };
  const loadOthers = () => (othersReady ??= allLeagues(src).then((all) => {
    ctx.others = all.filter((x) => x.key !== src.key).map((x) => x.matches);
    statLine();
  }).catch(() => { othersReady = null; }));
  if (cmp.leagues && cmp.pool !== "game" && showLeagues(src)) loadOthers();
  statLine();
  const show = (gi) => {
    box.innerHTML = gameAnalysisHtml(src, mode, games, gi, rated, ctx);
    wireWardMaps(box);
    wireGameGold(box);
  };
  box.addEventListener("click", (e) => {
    const c = e.target.closest("button[data-cmp], button[data-cmp-leagues]");
    if (c) {
      if (c.dataset.cmp) cmp.pool = c.dataset.cmp;
      else cmp.leagues = !cmp.leagues;
      if (cmp.leagues && cmp.pool !== "game" && showLeagues(src)) loadOthers();
      return statLine();
    }
    const b = e.target.closest("button.ga-g");
    if (b) return show(+b.dataset.gi);
    // Paging only swaps the tiles; the game shown stays.
    const pg = e.target.closest("button.ga-pg");
    const wrap = box.querySelector(".ga-picker");
    if (pg && wrap) wrap.innerHTML = gamePickerHtml(src, mode, games, +wrap.dataset.gi, rated, +pg.dataset.page);
  });
  // Analyze on a row of the Games list: that game, on whichever tab holds the analysis, scrolled
  // to it just under the sticky header.
  document.getElementById("t")?.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-analyze]");
    if (!b) return;
    show(+b.dataset.analyze);
    const panel = box.closest(".pp-panel");
    if (panel?.hidden) document.getElementById(panel.id.replace("pp-panel-", "pp-tab-"))?.click();
    const h2 = document.getElementById("game-analysis");
    const head = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--head-h")) || 0;
    if (h2) scrollTo({ top: scrollY + h2.getBoundingClientRect().top - head - 12 });
  });
  wireWardMaps(box);
  wireGameGold(box);
}