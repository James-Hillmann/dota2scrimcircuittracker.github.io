// AD2L Teams tab: standings, Matches (series by week) and Crosstable.
import { lineChart, wireCharts } from "../lib/charts.js";
import { isPlayed, seriesOdds, postOdds, tune, fitRatings } from "../lib/predict.js";
import { strengthOfSchedule, gameWins } from "../lib/schedule.js";
import { info } from "../lib/glossary.js";
import { weekStart, DIVISIONS, teamLink, pct, esc, app, pageHead, playerTabs, sortableTable, SOURCES, wirePlayerTabs } from "../core.js";
import { groupStage, isPostseason } from "../lib/divisions.js";
import { postseason } from "../lib/playoffs.js";
import { pageTabs, STANDINGS_TABS } from "../lib/pagetabs.js";
import { loading, errorBox } from "../parts/lanes.js";

// ---------- AD2L matches and crosstable (tabs on the Teams page) ----------

// What both views need: series with a date (oldest first), teams by id, bye placeholders,
// each series' ticketed games, and week numbers counted from the first scheduled week (the
// same numbers Weekly uses). Split = Combined Heroic or All, where each division gets its own box
// (only leagues with sub-divisions: elsewhere `division` can hold PlayOn sign-up table names).
function seriesContext(src, d) {
  const series = d.series.filter((s) => s.time).sort((a, b) => a.time - b.time || a.id - b.id);
  const team = Object.fromEntries(d.teams.map((t) => [t.id, t]));
  const bye = (id) => /\bbye week\b/i.test(team[id]?.name ?? "");
  const gamesOf = new Map();
  for (const g of [...d.games].sort((a, b) => (a.start_time ?? 0) - (b.start_time ?? 0))) (gamesOf.get(g.series_id) ?? gamesOf.set(g.series_id, []).get(g.series_id)).push(g);
  const wk = (s) => weekStart(new Date(s.time * 1000)).getTime(), first = series.length ? wk(series[0]) : 0;
  const weekNo = (s) => Math.round((wk(s) - first) / (7 * 864e5)) + 1;
  const split = (!!DIVISIONS[src.key]?.views && !src.view) || !!src.all;
  const divOf = (s) => (split ? team[s.home]?.division ?? team[s.away]?.division ?? "" : "");
  return { series, team, bye, gamesOf, wk, weekNo, split, divOf };
}
const dayTime = (t) => new Date(t * 1000).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const dayOnly = (t) => new Date(t * 1000).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const soon = (s) => !isPlayed(s) && s.time * 1000 > Date.now() - 6 * 3600e3;
const teamInitials = (n) => { const w = n.split(/[\s-]+/).filter(Boolean); return (w.length > 1 ? w.map((x) => x[0]).join("") : n).slice(0, 3).toUpperCase(); };

// Matches: every series, played and upcoming, one box per week (per division in Combined
// Heroic), laid out like a Liquipedia group stage. PlayOn only publishes the next week's
// pairings, so the last box is as far ahead as anyone knows. "" when nothing is scheduled.
function matchesHtml(src, d, ratings) {
  const { series, team, bye, gamesOf, wk, weekNo, split, divOf } = seriesContext(src, d);
  if (!series.length) return "";
  const boxes = new Map();
  for (const s of series) {
    const key = `${wk(s)}|${divOf(s)}`;
    if (!boxes.has(key)) boxes.set(key, { n: weekNo(s), div: divOf(s), list: [] });
    boxes.get(key).list.push(s);
  }
  const name = (id) => team[id] ? teamLink(src, team[id].name, id) : "TBD";
  const row = (s, night) => {
    const done = isPlayed(s), [h, a] = [s.home_score, s.away_score];
    const cls = (us, them) => !done ? "" : us > them ? " w" : us < them ? " l" : " t";
    const gs = gamesOf.get(s.id) ?? [];
    const o = !done && team[s.home] && team[s.away] && !bye(s.home) && !bye(s.away) && seriesOdds(ratings.get(s.home) ?? 0, ratings.get(s.away) ?? 0);
    const title = o ? ` title="Model: 2–0 ${pct(o.home)} · 1–1 ${pct(o.tie)} · 0–2 ${pct(o.away)}"` : "";
    const isBye = bye(s.home) || bye(s.away);
    // A bye has no games, so it gets a ⦻ where G1, G2 would sit and keeps the row height.
    const extra = [s.time !== night ? `<span class="mx-when">${done ? dayOnly(s.time) : dayTime(s.time)}</span>` : "",
      isBye && !gs.length ? `<span class="mx-g mx-nog" title="Bye week: no games played">⦻ Bye · no games</span>` : "",
      ...gs.map((g, i) => `<a class="mx-g" href="${src.link(g)}" title="Game ${i + 1}: ${esc(g.winner === "a" ? g.team_a : g.team_b)} won">G${i + 1}</a>`)].join("");
    return `<div class="mx-row${done ? "" : " up"}${isBye ? " bye" : ""}"${title}>
      <span class="mx-t h${cls(h, a)}">${name(s.home)}</span>
      ${done ? `<span class="mx-s${cls(h, a)}">${h}</span><span class="mx-s${cls(a, h)}">${a}</span>` : `<span class="mx-vs">vs</span>`}
      <span class="mx-t a${cls(a, h)}">${name(s.away)}</span>
      ${extra ? `<span class="mx-x">${extra}</span>` : ""}
    </div>`;
  };
  // The next box with anything left to play, so the tab can point at it.
  const all = [...boxes.values()];
  const next = all.find((b) => b.list.some(soon));
  const left = series.filter(soon).length;
  const html = all.map((b, i) => {
    // The week's league night: the time most of its series share.
    const counts = new Map();
    for (const s of b.list) counts.set(s.time, (counts.get(s.time) ?? 0) + 1);
    const night = [...counts].sort((x, y) => y[1] - x[1] || x[0] - y[0])[0][0];
    const played = b.list.filter(isPlayed).length, state = played === b.list.length ? "done" : played ? "live" : "up";
    return `<section class="mx-box ${state}${b === next ? " next" : ""}" style="--i:${Math.min(i, 12)}"${b === next ? ' id="mx-next"' : ""}>
      <header class="mx-head"><span class="mx-wk">Week ${b.n}${b.div ? ` · ${src.all ? "" : "Division "}${esc(b.div)}` : ""}</span>
        <span class="mx-date">${state === "done" ? dayOnly(night) : dayTime(night)}</span>
        ${state !== "done" ? `<span class="mx-tag">${state === "live" ? `${played}/${b.list.length} played` : "Upcoming"}</span>` : ""}</header>
      ${b.list.map((s) => row(s, night)).join("")}
    </section>`;
  }).join("");
  return `<p class="table-note keep mx-lead">${series.filter(isPlayed).length} series played${left ? ` · ${left} to come` : ""}. Green won, red lost, gold tied.
      PlayOn posts pairings about a week ahead.
      ${next ? `<button type="button" class="week-btn mx-jump">Jump to the next week ↓</button>` : ""}</p>
    <div class="mx-grid${split ? " split" : ""} reveal">${html}</div>`;
}

// Crosstable: every team against every other, like a Liquipedia group table. Teams run in
// standings order (`order`: team ids) down the side and across the top; a cell is the row
// team's score against the column team with the week it was played, or "vs" and the week
// when it's coming up. AD2L isn't a round robin, so most pairs haven't met and their cell is
// empty. Combined Heroic gets one table per division (they never play each other). "" before
// any series is played.
function crossTableHtml(src, d, order) {
  // The group stage only: a playoff rematch isn't a crosstable meeting.
  const { series, team, bye, gamesOf, weekNo, split } = seriesContext(src, { ...d, series: groupStage(d.series) });
  if (!series.some(isPlayed)) return "";
  const meet = new Map();
  for (const s of series) {
    if (bye(s.home) || bye(s.away) || !(isPlayed(s) || soon(s))) continue;
    for (const [us, them] of [[s.home, s.away], [s.away, s.home]]) {
      const k = `${us}|${them}`;
      (meet.get(k) ?? meet.set(k, []).get(k)).push(s);
    }
  }
  const cell = (us, them) => {
    if (us === them) return `<td class="ct-self"></td>`;
    const list = meet.get(`${us}|${them}`) ?? [];
    if (!list.length) return `<td class="ct-none"></td>`;
    return `<td class="ct-c">${list.map((s) => {
      if (!isPlayed(s)) return `<span class="ct-m up" title="${esc(team[us].name)} vs ${esc(team[them].name)}: ${dayTime(s.time)}">vs<small>Wk ${weekNo(s)}</small></span>`;
      const [a, b] = s.home === us ? [s.home_score, s.away_score] : [s.away_score, s.home_score];
      const res = a > b ? "w" : a < b ? "l" : "t", g = gamesOf.get(s.id)?.[0];
      const tip = `${esc(team[us].name)} ${a}–${b} ${esc(team[them].name)} · week ${weekNo(s)}, ${dayOnly(s.time)}${g ? " · click for game 1" : ""}`;
      const inner = `${a}–${b}<small>Wk ${weekNo(s)}</small>`;
      return g ? `<a class="ct-m ${res}" href="${src.link(g)}" title="${tip}">${inner}</a>` : `<span class="ct-m ${res}" title="${tip}">${inner}</span>`;
    }).join("")}</td>`;
  };
  const table = (ids, div) => `<div class="ct-wrap reveal">${div ? `<h3 class="ct-div">${src.all ? "" : "Division "}${esc(div)}</h3>` : ""}<table class="ct">
    <thead><tr><th scope="col" class="ct-corner"></th>${ids.map((id) => `<th scope="col" class="ct-col" title="${esc(team[id].name)}"><a href="${src.root}/teams/${id}">${esc(teamInitials(team[id].name))}</a></th>`).join("")}</tr></thead>
    <tbody>${ids.map((id, i) => `<tr><th scope="row" class="ct-row"><span class="ct-rank">${i + 1}</span>${teamLink(src, team[id].name, id)}<span class="ct-ab">${esc(teamInitials(team[id].name))}</span></th>${ids.map((o) => cell(id, o)).join("")}</tr>`).join("")}</tbody>
  </table></div>`;
  const ids = order.filter((id) => team[id] && !bye(id));
  const groups = split
    ? [...new Set((src.all ? d.teams.map((t) => t.id).filter((id) => ids.includes(id)) : ids).map((id) => team[id].division ?? ""))].sort(src.all ? () => 0 : undefined).map((div) => [ids.filter((id) => (team[id].division ?? "") === div), div])
    : [[ids, ""]];
  return `${groups.map(([g, div]) => table(g, div)).join("")}
    <p class="table-note">Each cell is the row team's series score against the column team, with the week. Green won, red lost, gold tied; "vs" is upcoming.
      Rows follow the Table tab (game wins). Empty cells: those teams haven't met (AD2L isn't a round robin). Click a score for game 1.</p>`;
}

// ---------- up next (the Content page shows it) ----------

// The series still to play (from 6 hours ago on), each with the model's odds, as on Predict.
// "" when there are none.
export function upNextHtml(src, d) {
  const played = (s) => s.home_score != null && s.away_score != null && s.home_score + s.away_score > 0;
  const upcoming = d.series.filter((s) => !played(s) && s.time && s.time * 1000 > Date.now() - 6 * 3600e3).sort((a, b) => a.time - b.time);
  if (!upcoming.length) return "";
  const bye = new Set(d.teams.filter((t) => /\bbye week\b/i.test(t.name)).map((t) => t.id));
  const name = Object.fromEntries(d.teams.map((t) => [t.id, t.name]));
  const ratings = fitRatings(d.teams, d.series, tune(d.teams, d.series));
  // Postseason series: their round and best-of (lib/playoffs.js postseason), a win bar (no tie).
  const post = upcoming.some(isPostseason) && !src.all ? postseason(d.teams, d.series, ratings, { split: !!DIVISIONS[src.key]?.views && !src.view }) : null;
  const roleOf = (s) => post?.roles.get(s.id) ?? { label: "Playoffs", bestOf: 3 };
  const date = (s) => new Date(s * 1000).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const oddsBar = (o) => `<div class="st-odds" title="Model: 2–0 ${pct(o.home)} · 1–1 ${pct(o.tie)} · 0–2 ${pct(o.away)}">${
    [["home", "2–0", "h"], ["tie", "1–1", "t"], ["away", "0–2", "a"]].map(([k, lbl, c]) => `<span class="${c}" style="flex:${o[k].toFixed(3)}">${o[k] >= 0.14 ? `${lbl} ${pct(o[k])}` : ""}</span>`).join("")}</div>`;
  const winBar = (o, s) => `<div class="st-odds" title="Model: ${esc(name[s.home])} ${pct(o.home)} · ${esc(name[s.away])} ${pct(o.away)}">${
    [["home", "h"], ["away", "a"]].map(([k, c]) => `<span class="${c}" style="flex:${o[k].toFixed(3)}">${o[k] >= 0.14 ? pct(o[k]) : ""}</span>`).join("")}</div>`;
  const anyPost = upcoming.slice(0, 10).some(isPostseason), anyGroup = upcoming.slice(0, 10).some((s) => !isPostseason(s));
  return `<div class="fixtures reveal">${upcoming.slice(0, 10).map((s, i) => {
      const real = name[s.home] && name[s.away] && !bye.has(s.home) && !bye.has(s.away);
      const ps = isPostseason(s), role = ps ? roleOf(s) : null;
      const o = real && (ps ? postOdds(ratings.get(s.home) ?? 0, ratings.get(s.away) ?? 0, role.bestOf) : seriesOdds(ratings.get(s.home) ?? 0, ratings.get(s.away) ?? 0));
      return `<div class="fixture st-next${ps ? " st-post" : ""}" style="--i:${i}">
        <div class="fx-team a">${name[s.home] ? teamLink(src, name[s.home], s.home) : "TBD"}</div>
        <div class="fx-score"><div class="meta">${ps ? `<b class="st-round">${esc(role.label)}${role.bestOf > 1 ? ` · Bo${role.bestOf}` : ""}</b> · ` : ""}${date(s.time)}</div>
          ${real ? `${ps ? winBar(o, s) : oddsBar(o)}<div class="meta">Model leans ${esc(name[o.home >= o.away ? s.home : s.away])}${src.all ? "" : ` · <a href="${src.root}/predict">draft read on Predict</a>`}</div>` : `<div class="n" style="font-size:22px">VS</div>`}</div>
        <div class="fx-team b">${name[s.away] ? teamLink(src, name[s.away], s.away) : "TBD"}</div>
      </div>`;
    }).join("")}</div>
    <p class="table-note">The model's odds, as on Predict.${anyGroup ? " Green = the left team wins 2–0, gold = 1–1, red = the right team wins 2–0." : ""}${anyPost ? " Playoff series: each team's chance to win it." : ""}</p>`;
}

// ---------- AD2L standings ----------

export async function renderStandings(src) {
  const kicker = src.kicker;
  app.innerHTML = loading(kicker, "Teams");
  let d;
  try { d = await src.data(); } catch (e) { app.innerHTML = `${pageHead(kicker, "Teams")}${errorBox(e)}`; return; }

  // The table, SoS and records are the group stage's (postseason series: lib/divisions.js).
  const played = groupStage(d.series).filter((s) => s.home_score != null && s.away_score != null && s.home_score + s.away_score > 0).sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
  const bye = new Set(d.teams.filter((t) => /\bbye week\b/i.test(t.name)).map((t) => t.id));
  const name = Object.fromEntries(d.teams.map((t) => [t.id, t.name]));
  // The model behind Predict, so Rating matches that page.
  const params = tune(d.teams, d.series);
  const ratings = fitRatings(d.teams, d.series, params);
  const rows = d.teams.map((t) => {
    const mine = played.filter((s) => s.home === t.id || s.away === t.id).map((s) => {
      const [us, them] = s.home === t.id ? [s.home_score, s.away_score] : [s.away_score, s.home_score];
      return { us, them, opp: s.home === t.id ? s.away : s.home, result: us > them ? "w" : us < them ? "l" : "t" };
    });
    let w = 0, tie = 0, l = 0, gw = 0, gl = 0;
    for (const x of mine) { gw += x.us; gl += x.them; if (x.result === "w") w++; else if (x.result === "l") l++; else tie++; }
    let streak = 0;
    for (let i = mine.length - 1; i >= 0 && mine[i].result === "w"; i--) streak++;
    const last5 = mine.slice(-5);
    const tracked = d.games.filter((g) => g.team_a_id === t.id || g.team_b_id === t.id).length;
    return { team: t.name, id: t.id, division: t.division, series: mine.length, w, tie, l, gw, gl, game_rate: gw + gl ? gw / (gw + gl) : null, tracked,
      form: last5, series_form: last5.reduce((a, x) => a + (x.result === "w" ? 1 : x.result === "l" ? -1 : 0), 0), streak,
      model_rating: ratings.get(t.id) ?? null };
  });
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  const teamById = new Map(d.teams.map((t) => [t.id, t]));
  // A coming bye week isn't an opponent: keep it out of "Still to play".
  const sos = strengthOfSchedule(d.teams.map((t) => t.id), groupStage(d.series).filter((s) => isPlayed(s) || (!bye.has(s.home) && !bye.has(s.away))));

  // Highlight cards. Biggest upset: the decided series whose result the model, fitted only on
  // the nights before it, thought least likely.
  const leader = [...rows].sort((a, b) => b.gw - a.gw || (b.game_rate ?? 0) - (a.game_rate ?? 0))[0];
  const hot = [...rows].sort((a, b) => b.streak - a.streak)[0];
  const tough = sos.filter((x) => x.sos != null && byId[x.id]?.series).sort((a, b) => b.sos - a.sos)[0];
  const upset = played.filter((s) => s.home_score !== s.away_score && !bye.has(s.home) && !bye.has(s.away)).map((s) => {
    const r = fitRatings(d.teams, d.series, { ...params, before: s.time ?? 0 });
    const o = seriesOdds(r.get(s.home) ?? 0, r.get(s.away) ?? 0), won = s.home_score > s.away_score ? "home" : "away";
    return { s, p: o[won], w: won === "home" ? s.home : s.away, l: won === "home" ? s.away : s.home };
  }).sort((a, b) => a.p - b.p)[0];
  const score = (s) => `${Math.max(s.home_score, s.away_score)}–${Math.min(s.home_score, s.away_score)}`;
  const cards = [
    leader?.series && ["League leader", teamLink(src, leader.team, leader.id), `<b>${leader.gw}–${leader.gl}</b> in games · ${leader.w}–${leader.tie}–${leader.l} in series`, "standings_leader"],
    hot?.streak >= 2 && ["Hottest team", teamLink(src, hot.team, hot.id), `<b>${hot.streak} series</b> won in a row`, "standings_streak"],
    tough && ["Toughest schedule so far", teamLink(src, name[tough.id], tough.id), `Opponents have won <b>${tough.sos}</b> games`, "sos"],
    upset && upset.p < 0.4 && ["Biggest upset", teamLink(src, name[upset.w], upset.w),
      `beat <b>${esc(name[upset.l])}</b> ${score(upset.s)}; the model gave that <b>${pct(upset.p)}</b>`, "standings_upset"],
  ].filter(Boolean);

  // Race: each team's game wins after each league night.
  const nights = [...new Set(played.map((s) => s.time).filter(Boolean))];
  const race = d.teams.filter((t) => !bye.has(t.id)).map((t) => {
    let acc = 0;
    return { t, values: nights.map((n) => {
      for (const s of played) if (s.time === n) acc += s.home === t.id ? s.home_score : s.away === t.id ? s.away_score : 0;
      return acc;
    }) };
  }).sort((a, b) => b.values.at(-1) - a.values.at(-1));
  const top = Math.max(0, ...race.map((r) => r.values.at(-1) ?? 0));
  // Drawn at the panel's real width (not scaled from 800), so it spans the page with normal-size
  // text; the height grows with the team count so every end label gets its own row.
  const raceChart = (width) => {
    const gap = race.length > 12 ? 16 : 23;
    return lineChart(race.map((r, i) => ({ label: r.t.name, values: r.values, cls: `s-c${(i % 10) + 1}`, end: `${r.values.at(-1)} · ${r.t.name}` })),
      { endLabels: true, width, gap, height: Math.max(280, 16 + 28 + 18 + (race.length - 1) * gap), xLabels: nights.map((_, i) => `Wk ${i + 1}`), step: top > 12 ? 4 : 2,
        caption: "Game wins after each league night. Hover for every team's total that week; hover a name to pick out one team." });
  };
  // Not in All: sixty lines on one chart is noise. Before the second league night there's no
  // race yet, but the tab stays (the nav menu lists it) and says so.
  const raceHtml = src.all ? "" : nights.length >= 2 ? `<div class="race"></div>` : `<div class="panel empty">The race starts after the second league night.</div>`;

  const updated = new Date(d.updated).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const tabs = playerTabs(pageTabs(STANDINGS_TABS, src, [
    ["table", `${cards.length ? `<div class="cards reveal st-cards">${cards.map(([k, v, sub, tip], i) => `<div class="card" style="--i:${i}"><div class="k">${k}${info(tip)}</div><div class="v small">${v}</div><div class="s">${sub}</div></div>`).join("")}</div>` : ""}
      <div id="t" class="reveal"></div>
      <p class="table-note">${src.all ? "All divisions in one table, sorted by game wins. Teams only play within their division, so compare across divisions with care. Official standings are on PlayOn."
        : `Sorted by game wins; official standings and tiebreakers live on
        <a href="https://dota.playon.gg/seasons/${d.playon_season_id}" target="_blank" rel="noopener">PlayOn</a>.`}</p>`],
    ["matches", matchesHtml(src, d, ratings)],
    ["cross", crossTableHtml(src, d, [...rows].sort((a, b) => b.gw - a.gw || a.gl - b.gl).map((r) => r.id))],
    ["race", raceHtml],
  ]), { store: "standingsTab", label: "Standings sections" });
  app.innerHTML = `
    ${pageHead(kicker, "Teams", `${d.games.length} ticketed games · updated ${updated}.`, tabs.bar)}
    ${tabs.panels}`;

  // A bye is a forfeit win with no games behind it: its own muted square, not a real W.
  const oppWins = gameWins(groupStage(d.series));
  const squares = (fs) => fs.map((f) => bye.has(f.opp)
    ? `<span class="sos-sq ${f.result} bye" title="Bye week: ${f.us}–${f.them} forfeit, no games played">BYE</span>`
    : `<a class="sos-sq ${f.result}" href="${src.root}/teams/${f.opp}"
      title="${f.result === "w" ? "Won" : f.result === "l" ? "Lost" : "Tied"} ${f.us}–${f.them} vs ${esc(name[f.opp])}${bye.has(f.opp) ? "" : ` (${oppWins.get(f.opp) ?? 0} wins)`}">${esc(teamInitials(name[f.opp] ?? "?"))}</a>`).join("");
  // Form: five slots, empty ones first, so the newest series always sits in the last column.
  const form = (fs) => `<span class="sos-faced st-form">${'<span class="sos-sq e"></span>'.repeat(5 - fs.length)}${squares(fs)}</span>`;
  const rmax = Math.max(0.01, ...rows.map((r) => Math.abs(r.model_rating ?? 0)));
  const rating = (v) => v == null ? "—" : `<span class="st-rating"><span class="st-track"><i class="${v >= 0 ? "up" : "down"}" style="width:${(Math.min(1, Math.abs(v) / rmax) * 50).toFixed(1)}%"></i></span>${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}</span>`;

  // Strength of schedule (lib/schedule.js, AD2L's own tiebreaker) rides along on each team's row.
  const sosOf = new Map(sos.map((x) => [x.id, x]));
  sortableTable(document.getElementById("t"), [
    ["team", "Team", (v, r) => teamLink(src, v, r.id), "l"], ...(src.all ? [["division", "Division", (v, r) => `<a href="${SOURCES[teamById.get(r.id)?.league]?.root ?? ""}/">${esc(v)}</a>`, "l", null, false]] : []), ["series", "Series"], ["w", "W"], ["tie", "T"], ["l", "L"],
    ["gw", "Games won", null, "", "jade"], ["gl", "Games lost"], ["game_rate", "Game win %", pct, "", "jade"],
    ["series_form", "Form", (v, r) => form(r.form), "l"], ["model_rating", "Rating", rating],
    ["sos", "SOS", (v) => v ?? "—", "", "gold"],
    ["remaining_sos", "Still to play", (v, r) => r.remaining.length && v != null ? `${v} <span class="muted">· ${r.remaining.length} left</span>` : "—", "", "ember"],
    ["tracked", "Stats"],
  ], rows.map((r) => ({ ...r, sos: sosOf.get(r.id)?.sos ?? null, remaining_sos: sosOf.get(r.id)?.remaining_sos ?? null, remaining: sosOf.get(r.id)?.remaining ?? [] })), "gw");

  wirePlayerTabs();
  wireCharts(app);
  // The race panel may be hidden, so measure the page header (same width); the figure's padding
  // and border take 30px of it.
  const raceBox = app.querySelector(".race"), bar = app.querySelector(".page-head");
  if (raceBox && bar) {
    let drawn = 0;
    const draw = () => {
      const w = Math.max(320, Math.round(bar.clientWidth - 30));
      if (w === drawn) return;
      drawn = w;
      raceBox.innerHTML = raceChart(w);
      wireCharts(raceBox);
    };
    draw();
    if ("ResizeObserver" in window) {
      let timer;
      // Kept on the element: an observer nothing references can be collected and stop firing.
      raceBox._ro = new ResizeObserver(() => { clearTimeout(timer); timer = setTimeout(draw, 120); });
      raceBox._ro.observe(bar);
    }
  }
  app.querySelector(".mx-jump")?.addEventListener("click", () => document.getElementById("mx-next")?.scrollIntoView({ block: "center" }));
}