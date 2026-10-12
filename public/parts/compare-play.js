// Compare tab, from the games themselves (parsed replays): each player's laning, their average
// game minute by minute, their wards and where they die and kill. Every player keeps their
// column colour (cmp-c1…4 in CSS, the same as the charts' s-c1…4).
import { byPlayer } from "../lib/timeline.js";
import { lineChart, wireCharts } from "../lib/charts.js";
import { collectWards, wardMapHtml, wireWardMaps, IMG, VB, Y, CX, CY } from "../lib/wardmap.js";
import { deathsOf, hasDeaths } from "../lib/deathmap.js";
import { playerLane, laneSummary } from "../lib/lanes.js";
import { esc } from "../core.js";

const WIN = 5; // minutes per window on the teamfight damage chart
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s) % 60).padStart(2, "0")}`;

// Mean of per-minute series, with decimals, stopping once fewer than half the games lasted
// that long (the tail of one long game isn't their usual game). carry: a game that's over
// keeps its last value (a running count stays at its final number), so the line doesn't dip
// as short games drop out.
function meanCurve(series, carry = false) {
  const need = Math.max(1, Math.ceil(series.length / 2)), out = [];
  for (let i = 0; ; i++) {
    if (series.filter((s) => s.length > i).length < need || !series.length) return out;
    const v = series.map((s) => (s.length > i ? s[i] : carry && s.length ? s[s.length - 1] : null)).filter((x) => x != null);
    out.push(v.reduce((a, b) => a + b, 0) / v.length);
  }
}
// Running count of events (seconds) at each minute of a game `mins` long.
const running = (times, mins) => Array.from({ length: mins + 1 }, (_, i) => times.filter((t) => t <= i * 60).length);

// Everything the sections need for one player, from `matches` (games with details).
export function playOf(matches, key, cuts) {
  const is = byPlayer(key);
  const games = matches.flatMap((m) => m.players.filter((p) => is(p, m)).map((p) => ({ m, p })));
  const lanes = cuts ? games.map(({ m, p }) => playerLane(m, p, cuts)).filter(Boolean) : [];
  const timed = games.filter(({ p }) => Array.isArray(p.networth_t));
  const withDeaths = games.filter(({ m }) => hasDeaths(m));
  const deaths = [], kills = [];
  for (const { m, p } of withDeaths) {
    const i = m.players.indexOf(p), all = deathsOf(m);
    const flip = p.team === "b";
    const spot = (d) => (d.x > 0 ? (flip ? [2 * CX - d.x, 2 * CY - d.y] : [d.x, d.y]) : null);
    const opp = p.team === "a" ? m.team_b : m.team_a;
    for (const d of all.filter((d) => d.i === i)) deaths.push({ t: d.t, kind: d.kind, at: spot(d), tip: `died ${clock(d.t)} · ${p.hero} vs ${opp}` });
    for (const d of all.filter((d) => d.killer === i && d.team !== p.team)) kills.push({ t: d.t, kind: d.kind, at: spot(d), tip: `killed ${m.players[d.i].hero} ${clock(d.t)} · ${p.hero} vs ${opp}` });
  }
  const mins = ({ m }) => Math.floor(m.duration_sec / 60);
  // Teamfight damage in each 5-minute window (a fight counts in the window of its midpoint),
  // averaged over the games still going in that window.
  const tf = games.filter(({ p }) => Array.isArray(p.tf_dmg)), dmgWin = [];
  for (let w = 0; tf.length; w++) {
    const live = tf.filter((g) => mins(g) >= w * WIN);
    if (live.length < Math.ceil(tf.length / 2) || !live.length) break;
    dmgWin.push(live.reduce((t, { p }) => {
      for (let j = 0; j + 2 < p.tf_dmg.length; j += 3) { const mid = (p.tf_dmg[j] + p.tf_dmg[j + 1]) / 2; if (mid >= w * WIN * 60 && mid < (w + 1) * WIN * 60) t += p.tf_dmg[j + 2]; }
      return t;
    }, 0) / live.length);
  }
  return {
    games: games.length,
    lane: lanes.length ? { ...laneSummary(lanes), gold10: avg(lanes.map((r) => r.gold10)), xp10: avg(lanes.map((r) => r.xp10)), nw10: avg(timed.map(({ p }) => p.networth_t[10])) } : null,
    nw: meanCurve(timed.map(({ p }) => p.networth_t)),
    xp: meanCurve(games.filter(({ p }) => Array.isArray(p.xp_t)).map(({ p }) => p.xp_t)),
    dmgWin,
    kills: meanCurve(games.filter(({ p }) => Array.isArray(p.kill_t)).map((g) => running(g.p.kill_t, mins(g))), true),
    deathCurve: meanCurve(withDeaths.map((g) => running(deathsOf(g.m).filter((d) => d.i === g.m.players.indexOf(g.p)).map((d) => d.t), mins(g))), true),
    map: { games: withDeaths.length, deaths, kills },
    wards: collectWards(matches, is),
  };
}
const avg = (v) => { const x = v.filter((n) => n != null); return x.length ? x.reduce((a, b) => a + b, 0) / x.length : null; };

// Laning rows for the head-to-head table (compare.js's row format; `ex` is playOf()).
const signed = (v) => `${v >= 0 ? "+" : "−"}${Math.abs(Math.round(v)).toLocaleString("en-US")}`;
export const LANE_ROWS = [
  ["Lanes won–draw–lost", (lb, tp, ex) => ex?.lane?.lane_rate ?? null, (v, lb, tp, ex) => `${ex.lane.won}–${ex.lane.even}–${ex.lane.lost} <small>${Math.round(v * 100)}%</small>`, 1, 1],
  ["Lane lead at 10'", (lb, tp, ex) => ex?.lane?.margin ?? null, signed, 1, 0],
  ["Last hits at 10'", (lb, tp, ex) => ex?.lane?.lh10 ?? null, (v) => v.toFixed(1), 1, "max"],
  ["Denies at 10'", (lb, tp, ex) => ex?.lane?.dn10 ?? null, (v) => v.toFixed(1), 1, "max"],
  ["Net worth at 10'", (lb, tp, ex) => ex?.lane?.nw10 ?? null, (v) => Math.round(v).toLocaleString("en-US"), 1, "max"],
  ["XP at 10'", (lb, tp, ex) => ex?.lane?.xp10 ?? null, (v) => Math.round(v).toLocaleString("en-US"), 1, "max"],
  ["Kills before 10'", (lb, tp, ex) => ex?.lane?.kills10 ?? null, (v) => v.toFixed(2), 1, "max"],
  ["Deaths before 10'", (lb, tp, ex) => ex?.lane?.deaths10 ?? null, (v) => v.toFixed(2), -1, "max"],
  ["Win % after winning lane", (lb, tp, ex) => ex?.lane?.win_when_won ?? null, (v) => `${Math.round(v * 100)}%`, 1, 1],
];

// "Over a game": average net worth, XP, teamfight damage, kills and deaths, one line per player.
export function overTimeHtml(cols) {
  const lines = (f) => cols.map(({ lb, ex }, i) => ({ label: lb.name, values: ex[f], cls: `s-c${i + 1}` })).filter((s) => s.values.length > 1);
  const nw = lines("nw"), xp = lines("xp"), dmg = lines("dmgWin"), kills = lines("kills"), deaths = lines("deathCurve");
  if (!nw.length && !kills.length) return "";
  const card = (title, series, opts, wide = false) => (series.length ? `<div class="cmp-chart${wide ? " wide" : ""}"><h3>${title}</h3>${lineChart(series, { width: wide ? 1080 : 530, ...opts })}</div>` : "");
  const n = Math.max(0, ...dmg.map((s) => s.values.length));
  const windows = Array.from({ length: n }, (_, w) => `${w * WIN}–${(w + 1) * WIN}'`);
  return `<h2>Over a game</h2>
    <div class="cmp-charts">
      ${card("Net worth", nw, { id: "cmp-nw", step: 5000, caption: "Average net worth at each minute." })}
      ${card("XP", xp, { id: "cmp-xp", step: 5000, caption: "Average XP at each minute." })}
      ${card("Teamfight damage, when", dmg.map((s) => ({ ...s, values: s.values.map(Math.round) })), { id: "cmp-dmg", height: 260, step: 2500, xLabels: windows, caption: "Average hero damage in teamfights in each 5 minutes of a game. OpenDota only times damage inside teamfights (about half of all hero damage); lane harass and solo pickoffs aren't in it." }, true)}
      ${card("Kills so far", kills, { id: "cmp-kills", step: 2, dp: 1, caption: "Average kills by each minute." })}
      ${card("Deaths so far", deaths, { id: "cmp-deaths", step: 2, dp: 1, caption: "Average deaths by each minute." })}
    </div>
    <p class="table-note keep">Each line stops once fewer than half of that player's games lasted that long.</p>`;
}

// Wards: every player's wards on one map, mirrored to their own side, in their colour.
export function wardsHtml(cols) {
  const layers = cols.map(({ lb, ex }, i) => ({ label: lb.name, cls: `cmp-c${i + 1}`, wards: ex.wards })).filter((l) => l.wards.length);
  if (!layers.length) return "";
  return `<h2>Wards</h2>${wardMapHtml(layers, { mirrored: true, id: "cmp-wards" })}`;
}

// Deaths & kills: teamfight spots on the map (mirrored to their own side) and, beside it, how
// each player's deaths or kills split by lane, pickoff and teamfight, per game.
export function deathsHtml(cols) {
  if (!cols.some(({ ex }) => ex.map.games)) return "";
  const data = cols.map(({ lb, ex }, i) => ({ name: lb.name, c: i + 1, games: ex.map.games, deaths: ex.map.deaths, kills: ex.map.kills }));
  return `<h2>Deaths &amp; kills</h2>
    <figure class="wardmap cmp-dmap" data-what="deaths" data-play="${esc(JSON.stringify(data))}">
      <div class="wm-controls"><div class="wm-seg" role="group" data-ctl="what"><button type="button" data-v="deaths" aria-pressed="true">Deaths</button><button type="button" data-v="kills" aria-pressed="false">Kills</button></div></div>
      <div class="wm-body"><div class="wm-map"></div><div class="wm-side"></div></div>
    </figure>`;
}

function drawDeaths(fig) {
  const data = JSON.parse(fig.dataset.play), what = fig.dataset.what;
  const dots = data.map((d) => `<g class="cmp-c${d.c}">${d[what].filter((x) => x.at).map((x) => `<circle class="cmp-dot" cx="${x.at[0].toFixed(1)}" cy="${Y(x.at[1]).toFixed(1)}" r="1.5"><title>${esc(d.name)} ${esc(x.tip)}</title></circle>`).join("")}</g>`).join("");
  fig.querySelector(".wm-map").innerHTML = `<svg viewBox="${VB.x} ${VB.y} ${VB.w} ${VB.h}" role="img" aria-label="Teamfight ${what} on the map">
    <image href="${IMG.src}" x="${VB.x}" y="${VB.y}" width="${VB.w}" height="${VB.h}" preserveAspectRatio="none"/>
    <rect class="wm-dim" x="${VB.x}" y="${VB.y}" width="${VB.w}" height="${VB.h}"/>
    <text class="wm-lbl a" x="${VB.x + 3}" y="${VB.y + VB.h - 3}">Own side</text>
    <text class="wm-lbl b" x="${VB.x + VB.w - 3}" y="${VB.y + 7}" text-anchor="end">Enemy side</text>${dots}</svg>`;
  const per = (n, g) => (g ? (n / g).toFixed(1) : "—");
  const max = Math.max(...data.map((d) => (d.games ? d[what].length / d.games : 0)), 0.1);
  fig.querySelector(".wm-side").innerHTML = data.map((d) => {
    const xs = d[what], n = (k) => xs.filter((x) => x.kind === k).length;
    const parts = [["lane", "Lane"], ["pickoff", "Pickoff"], ["fight", "Teamfight"]];
    const total = d.games ? xs.length / d.games : 0;
    return `<div class="wm-stat cmp-c${d.c}"><div class="wm-who">${esc(d.name)}</div>
      <div><b>${per(xs.length, d.games)}</b> ${what} a game <small>(${d.games} games)</small></div>
      <div class="cmp-split" style="width:${((total / max) * 100).toFixed(0)}%">${parts.map(([k]) => `<i class="k-${k}" style="flex:${n(k) || 0}"></i>`).join("")}</div>
      <div class="cmp-split-l">${parts.map(([k, l]) => `<span class="k-${k}">${l} ${per(n(k), d.games)}</span>`).join("")}</div></div>`;
  }).join("") + `<p class="wm-note">Dots are teamfight ${what}: OpenDota only records a spot inside a teamfight. Dire games are mirrored so everyone plays from the bottom left. Lane = before 10:00 outside a teamfight; pickoff = after.</p>`;
}

export function wirePlay(box) {
  wireCharts(box);
  wireWardMaps(box);
  box.querySelectorAll("figure.cmp-dmap").forEach((fig) => {
    drawDeaths(fig);
    fig.querySelector('[data-ctl="what"]').addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      fig.dataset.what = b.dataset.v;
      fig.querySelectorAll('[data-ctl="what"] button').forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      drawDeaths(fig);
    });
  });
}
