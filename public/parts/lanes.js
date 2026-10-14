// Laning: the lane report on game, player and hero pages (lib/lanes.js does the maths).
import { hasDetails, playerKey } from "../lib/stats.js";
import { info } from "../lib/glossary.js";
import { isJungler, at10, laneCuts, LANE_LABEL, gameLanes, verdict, cutFor, MAP_LANE, playerLane, laneSummary, laneBoard, LANE_GROUPS } from "../lib/lanes.js";
import { leagueSrc, fmt, heroHref, esc, portrait, playerLink, kg, heroLink, signedK, pct, dec, shortDate, floorOf, sortableTable, teamLink, weekStart, pageHead } from "../core.js";
import { plusSlot } from "../lib/hero-levels.js";

// ---------- Laning (lib/lanes.js) ----------
// Won / draw / lost cut-offs come from the whole division, like the tier list's reference
// (only the picked weeks' games while the time machine is on).
export const laneCutsOf = async (src) => (src.ad2l ? laneCuts((await leagueSrc(src).load()).filter(hasDetails)) : null);
const VERDICT = { won: "Won", even: "Draw", lost: "Lost" };
const verdictTag = (v) => (v ? `<span class="lane-v ${v}">${VERDICT[v]}</span>` : '<span class="muted">—</span>');
const laneName = (r) => `${LANE_LABEL[r.role]}${r.roaming ? ' <span class="tag">roaming</span>' : ""}`;
const cutNote = (cuts) => `Won = more than ${fmt(cuts.side)} gold + XP ahead at 10:00 in a side lane, ${fmt(cuts.mid)} in mid (a third of this division's lanes each way); lost = that far behind; even = in between.`;
const faces = (src, ps) => ps.map((q) => `<a href="${heroHref(src, q.hero)}" title="${esc(q.name)} (${esc(q.hero)})">${portrait(q.hero)}</a>`).join("");

// Match page, Laning tab: the three lanes, then every player's first 10 minutes.
export function gameLanesHtml(m, src, cuts) {
  const lanes = gameLanes(m);
  if (!cuts || !lanes.some((l) => l.margin != null)) return "";
  const name = (t) => esc(t === "a" ? m.team_a : m.team_b);
  const card = (l, i) => {
    const v = verdict(l.margin, cutFor(cuts, l.lane));
    const who = v === "even" ? "Draw" : v ? `${name(v === "won" ? "a" : "b")} won` : "No result";
    const side = (t, ps, role) => `<div class="ln-side ${t}"><div class="ln-role">${name(t)} · ${LANE_LABEL[role]}</div>
      ${ps.length ? ps.map((p) => `<div class="ln-p">${portrait(p.hero)}${plusSlot(p.account_id, p.hero, m.start_time)}<span>${playerLink(src, p)}<small>${p.lh10 ?? "—"}/${p.dn10 ?? "—"} LH/DN · ${kg((p.gold_t?.[10] ?? 0) + (p.xp10 ?? 0))} gold+XP</small></span></div>`).join("") : '<div class="muted">Nobody</div>'}</div>`;
    return `<div class="card ln-card ${v ?? ""}" style="--i:${i}">
      <div class="k">${MAP_LANE[l.lane]}</div>
      <div class="ln-verdict">${who}${l.margin == null ? "" : v !== "even" ? ` <small>by ${kg(Math.abs(l.margin))}</small>` : ` <small>${name(l.margin >= 0 ? "a" : "b")} +${kg(Math.abs(l.margin))}</small>`}</div>
      ${side("a", l.a, l.lane)}${side("b", l.b, { 1: 3, 2: 2, 3: 1 }[l.lane])}
    </div>`;
  };
  const rows = m.players.map((p) => ({ p, r: playerLane(m, p, cuts) })).filter((x) => x.r);
  const tr = ({ p, r }) => `<tr class="side-${p.team}"><td class="l">${playerLink(src, p)}</td><td class="l">${heroLink(src, p.hero)}</td><td class="l">${laneName(r)}</td>
    <td>${verdictTag(r.verdict)}</td><td>${r.margin == null ? "—" : signedK(r.margin)}</td><td>${r.lh10 ?? "—"}</td><td>${r.dn10 ?? "—"}</td>
    <td>${r.eff == null ? "—" : `${Math.round(r.eff)}%`}</td><td>${r.kills10 ?? "—"}</td><td>${r.deaths10 ?? "—"}</td></tr>`;
  // Roamers and junglers: who left their lane, what the lane they left did, and what they got.
  const odd = m.players.filter((p) => p.roaming || isJungler(p));
  const anyJg = odd.some(isJungler);
  const oddTr = (p) => {
    const r = playerLane(m, p, cuts), jg = isJungler(p);
    const lead = jg ? at10(p) : r?.margin;
    return `<tr class="side-${p.team}"><td class="l">${playerLink(src, p)}</td><td class="l">${heroLink(src, p.hero)}</td>
      <td class="l"><span class="tag">${jg ? "jungle" : "roaming"}</span></td>
      <td class="l">${jg || !r ? "—" : LANE_LABEL[r.role]}</td><td>${jg || !r ? "—" : verdictTag(r.verdict)}</td>
      <td>${lead == null ? "—" : jg ? kg(lead) : signedK(lead)}</td><td>${r?.kills10 ?? "—"}</td><td>${r?.deaths10 ?? "—"}</td>${anyJg ? `<td class="l">${jg ? `${p.neutral_kills ?? "—"} neutrals · ${p.lh10 ?? "—"} LH` : "—"}</td>` : ""}</tr>`;
  };
  const oddHtml = odd.length ? `<h2>Roaming &amp; jungle</h2>
    <div class="table-wrap"><table class="ln-table"><thead><tr><th scope="col" class="l">Player</th><th scope="col" class="l">Hero</th><th scope="col" class="l">Role</th><th scope="col" class="l">Left lane</th><th scope="col">That lane (their team)</th><th scope="col">Lane gold+XP lead</th><th scope="col">Kills by 10'</th><th scope="col">Deaths by 10'</th>${anyJg ? '<th scope="col" class="l">Jungle</th>' : ""}</tr></thead>
    <tbody>${odd.map(oddTr).join("")}</tbody></table></div>
    <p class="table-note keep">Roaming is a support who left their lane in the first minutes (OpenDota's flag): the result shown is how the lane they left did for their team at 10:00. Junglers are shown only when the replay marks one.</p>` : "";
  return `<div class="cards ln-cards reveal">${lanes.map(card).join("")}</div>${oddHtml}
    <h2>First 10 minutes${info("lane_players")}</h2>
    <div class="table-wrap"><table class="ln-table"><thead><tr><th scope="col" class="l">Player</th><th scope="col" class="l">Hero</th><th scope="col" class="l">Lane</th><th scope="col">Result</th><th scope="col">Gold+XP lead</th><th scope="col">LH</th><th scope="col">DN</th><th scope="col">Lane eff.</th><th scope="col">Kills</th><th scope="col">Deaths</th></tr></thead>
    <tbody>${["a", "b"].map((t) => rows.filter((x) => x.p.team === t).map(tr).join("")).join("")}</tbody></table></div>
    <p class="table-note">${cutNote(cuts)} Lead = the lane's gold + XP against the other side, roamers left out; in a 1v2, the cores'. LH, DN, kills and deaths are before 10:00.</p>`;
}

// Player and hero pages, Laning tab: record, averages, by lane, then each game.
export function lanesPageHtml(src, matches, pred, cuts, { name, hero = false }) {
  if (!cuts) return "";
  const rows = matches.flatMap((m) => m.players.filter((p) => pred(p, m)).map((p) => { const r = playerLane(m, p, cuts); return r && { ...r, m, p }; })).filter(Boolean);
  if (!rows.length) return "";
  const s = laneSummary(rows);
  const cards = [
    ["Lanes", `${s.won}–${s.even}–${s.lost}`, "won–draw–lost", "lane_record"],
    ["Lane win %", pct(s.lane_rate), "a draw counts half", "lane_rate"],
    ["Avg lead at 10'", s.margin == null ? "—" : signedK(s.margin), "gold + XP, whole lane", "lane_margin"],
    ["Last hits at 10'", dec(s.lh10), `denies ${dec(s.dn10)}`, "lane_lh"],
    ["Deaths before 10'", s.deaths10 == null ? "—" : s.deaths10.toFixed(2), `kills ${s.kills10 == null ? "—" : s.kills10.toFixed(2)}`, "lane_deaths"],
    ["Win % after winning lane", pct(s.win_when_won), `${s.won_lane_games} lane${s.won_lane_games === 1 ? "" : "s"} won`, "lane_convert"],
  ];
  const byRole = [1, 2, 3].map((role) => ({ role, s: laneSummary(rows.filter((r) => r.role === role)) })).filter((x) => x.s.lanes);
  const sorted = [...rows].sort((a, b) => (b.m.start_time ?? 0) - (a.m.start_time ?? 0));
  return `<div class="cards player-cards reveal" style="--cols:3">${cards.map(([k, v, t, tip], i) => `<div class="card" style="--i:${i}"><div class="k">${k}${info(tip)}</div><div class="v">${v}</div><div class="s">${t}</div></div>`).join("")}</div>
    ${byRole.length > 1 ? `<h2>By lane</h2><div class="table-wrap"><table><thead><tr><th scope="col" class="l">Lane</th><th scope="col">Lanes</th><th scope="col">Won–draw–lost</th><th scope="col">Lane win %</th><th scope="col">Avg lead</th><th scope="col">LH at 10'</th></tr></thead><tbody>
      ${byRole.map(({ role, s: x }) => `<tr><td class="l">${LANE_LABEL[role]}</td><td>${x.lanes}</td><td>${x.won}–${x.even}–${x.lost}</td><td>${pct(x.lane_rate)}</td><td>${x.margin == null ? "—" : signedK(x.margin)}</td><td>${dec(x.lh10)}</td></tr>`).join("")}</tbody></table></div>` : ""}
    <h2>Every lane</h2>
    <div class="table-wrap"><table class="ln-table"><thead><tr><th scope="col" class="l">Game</th><th scope="col" class="l">${hero ? "Player" : "Hero"}</th><th scope="col" class="l">Lane</th><th scope="col" class="l">With</th><th scope="col" class="l">Against</th><th scope="col">Result</th><th scope="col">Lead</th><th scope="col">LH/DN</th><th scope="col">Game</th></tr></thead><tbody>
      ${sorted.map((r) => `<tr><td class="l"><a href="${src.link(r.m)}">${esc(r.p.team === "a" ? r.m.team_b : r.m.team_a)}</a> <span class="muted">${shortDate(r.m.createdAt)}</span></td>
        <td class="l">${hero ? playerLink(src, r.p) : heroLink(src, r.p.hero)}</td><td class="l">${laneName(r)}</td>
        <td class="l ln-faces">${faces(src, r.mates) || '<span class="muted">solo</span>'}</td><td class="l ln-faces">${faces(src, r.foes) || '<span class="muted">nobody</span>'}</td>
        <td>${verdictTag(r.verdict)}</td><td>${r.margin == null ? "—" : signedK(r.margin)}</td><td>${r.lh10 ?? "—"}/${r.dn10 ?? "—"}</td><td>${r.won ? '<span class="ln-w">W</span>' : '<span class="ln-l">L</span>'}</td></tr>`).join("")}
    </tbody></table></div>
    <p class="table-note">${cutNote(cuts)}</p>`;
}

// Team page, Laning tab: the team's three lanes (safe, mid, off) across its games, then every
// game lane by lane. `games` are { m, side } with side "a" or "b".
const OPP_ROLE = { 1: 3, 2: 2, 3: 1 };
export function teamLanesHtml(src, games, cuts, team) {
  if (!cuts) return "";
  // A game's three lanes from this team's side: role 1 safe, 2 mid, 3 off.
  const lanesOf = ({ m, side }) => {
    const all = gameLanes(m);
    if (!all.length) return null;
    return [1, 2, 3].map((role) => {
      const l = all.find((x) => x.lane === (side === "a" ? role : OPP_ROLE[role]));
      const margin = l?.margin == null ? null : side === "a" ? l.margin : -l.margin;
      return { role, margin, v: verdict(margin, cutFor(cuts, role)), us: l ? (side === "a" ? l.a : l.b) : [], them: l ? (side === "a" ? l.b : l.a) : [] };
    });
  };
  const rows = games.map((g) => ({ ...g, lanes: lanesOf(g) })).filter((g) => g.lanes).sort((x, y) => (y.m.start_time ?? 0) - (x.m.start_time ?? 0));
  if (!rows.length) return "";
  const opp = ({ m, side }) => (side === "a" ? m.team_b : m.team_a);
  const tally = (role) => {
    const ls = rows.map((g) => g.lanes[role - 1]).filter((l) => l.v);
    const n = (v) => ls.filter((l) => l.v === v).length, won = n("won"), even = n("even"), lost = n("lost");
    const lead = ls.length ? ls.reduce((t, l) => t + l.margin, 0) / ls.length : null;
    // Who played this lane most for the team.
    const who = new Map();
    for (const g of rows) for (const p of g.lanes[role - 1].us) { const k = playerKey(p), e = who.get(k) ?? { p, n: 0 }; e.n++; who.set(k, e); }
    return { lanes: ls.length, won, even, lost, lead, rate: ls.length ? (won + even / 2) / ls.length : null, who: [...who.values()].sort((x, y) => y.n - x.n).slice(0, 3) };
  };
  const card = (role, i) => {
    const t = tally(role), tone = t.rate == null ? "" : t.rate > 0.55 ? "won" : t.rate < 0.45 ? "lost" : "even";
    const w = (x) => (t.lanes ? ((x / t.lanes) * 100).toFixed(1) : 0);
    return `<div class="card tl-card ${tone}" style="--i:${i}">
      <div class="k">${LANE_LABEL[role]}</div>
      <div class="v">${t.won}–${t.even}–${t.lost}</div>
      <div class="tl-split" role="img" aria-label="${t.won} won, ${t.even} drawn, ${t.lost} lost"><i class="won" style="width:${w(t.won)}%"></i><i class="even" style="width:${w(t.even)}%"></i><i class="lost" style="width:${w(t.lost)}%"></i></div>
      <div class="s">won–draw–lost · ${t.rate == null ? "—" : pct(t.rate)} lane win · avg ${t.lead == null ? "—" : signedK(t.lead)}</div>
      <div class="tl-who">${t.who.map((x) => `<span>${playerLink(src, x.p)} <small>×${x.n}</small></span>`).join("")}</div>
    </div>`;
  };
  const cell = (l) => `<td class="l tl-cell ${l.v ?? ""}"><div class="tl-faces"><span class="tl-us">${faces(src, l.us) || '<span class="muted">—</span>'}</span><span class="tl-vs">vs</span><span class="tl-them">${faces(src, l.them) || '<span class="muted">—</span>'}</span></div>
    <div class="tl-res">${verdictTag(l.v)} <b>${l.margin == null ? "" : signedK(l.margin)}</b></div></td>`;
  return `<div class="cards tl-cards reveal">${[1, 2, 3].map(card).join("")}</div>
    <h2>Every game, lane by lane</h2>
    <div class="table-wrap"><table class="tl-table"><thead><tr><th scope="col" class="l">Game</th>${[1, 2, 3].map((r) => `<th scope="col" class="l">${LANE_LABEL[r]}</th>`).join("")}<th scope="col">Game</th></tr></thead><tbody>
      ${rows.map((g) => `<tr><td class="l tl-game"><a href="${src.link(g.m)}">vs ${esc(opp(g))}</a><small>${shortDate(g.m.createdAt)}</small></td>${g.lanes.map(cell).join("")}
        <td>${g.m.winner === g.side ? '<span class="ln-w">W</span>' : '<span class="ln-l">L</span>'}</td></tr>`).join("")}
    </tbody></table></div>
    <p class="table-note">${esc(team.name)}'s side of each lane: their heroes first, and the lead is theirs. ${cutNote(cuts)}</p>`;
}

// Highest lane score among players with `min`+ lanes (a week: 2, or 1 if nobody has 2).
export function bestLaner(rows, min = 2) {
  const top = (n) => rows.filter((r) => r.lanes >= n).sort((a, b) => b.score - a.score || b.lanes - a.lanes)[0];
  return top(min) ?? (min === 2 ? top(1) : null);
}

// Players tab: best laner this week and this season, then everyone ranked by position.
let laneGroup = "safe";
export function lanesSection(src, matches, cuts, weekGames) {
  if (!cuts) return null;
  const board = laneBoard(matches, cuts, playerKey).filter((r) => r.lanes);
  if (!board.length) return null;
  const groupLabel = Object.fromEntries(LANE_GROUPS.map(([k, l]) => [k, l]));
  const week = bestLaner(laneBoard(weekGames, cuts, playerKey, 0));
  const season = bestLaner(board, floorOf(src));
  const hl = (title, r, tip, i) => r ? `<div class="card hl" style="--i:${i}">${portrait(r.p.hero, "card-hero")}<div class="k">${title}${info(tip)}</div>
    <div class="v small">${playerLink(src, r.p)}</div>
    <div class="s">${groupLabel[r.group]} · won ${r.won} of ${r.lanes} lane${r.lanes === 1 ? "" : "s"} · <b>${signedK(r.margin)}</b> avg gold + XP at 10'</div></div>` : "";
  const html = `<h2 id="laning">Laning${info("lane_rank")}</h2>
    <div class="cards ln-best reveal">${hl("Best laner this week", week, "lane_best_week", 0)}${hl("Best laner this season", season, "lane_best_season", 1)}</div>
    <div id="lane-board"></div>
    <p class="table-note">${cutNote(cuts)} Ranked within the position played (${floorOf(src)}+ lanes); lane score = average lead ÷ the won cut-off, padded with 2 even lanes, so 1.0 means winning every lane by exactly the cut-off.</p>`;
  const draw = () => {
    const el = document.getElementById("lane-board");
    const rows = board.filter((r) => r.group === laneGroup && r.lanes >= floorOf(src))
      .map((r) => ({ ...r, name: r.p.name, team: r.p.team_name, wel: `${r.won}–${r.even}–${r.lost}` }));
    const tab = ([k, label]) => `<button type="button" class="seg${laneGroup === k ? " on" : ""}" data-group="${k}">${label}</button>`;
    el.innerHTML = `<div class="row segs">${LANE_GROUPS.map(tab).join("")}</div><div id="lane-table"></div>`;
    el.querySelectorAll(".seg").forEach((b) => (b.onclick = () => { laneGroup = b.dataset.group; draw(); }));
    if (!rows.length) { el.querySelector("#lane-table").innerHTML = `<p class="muted">Nobody has ${floorOf(src)}+ lanes here yet.</p>`; return; }
    sortableTable(el.querySelector("#lane-table"), [
      ["name", "Player", (v, r) => playerLink(src, r.p), "l name"], ["team", "Team", (v) => (v ? teamLink(src, v) : ""), "l name"],
      ["lanes", "Lanes"], ["wel", "W–D–L", null, "l"], ["lane_rate", "Lane win %", pct, "", "jade"],
      ["score", "Lane score", (v) => v.toFixed(2), "", "gold"], ["margin", "Avg lead", signedK],
      ["lh10", "LH at 10'", dec], ["dn10", "DN at 10'", dec], ["eff", "Lane eff.", (v) => (v == null ? "—" : `${Math.round(v)}%`)],
      ["kills10", "Kills <10'", (v) => (v == null ? "—" : v.toFixed(2))], ["deaths10", "Deaths <10'", (v) => (v == null ? "—" : v.toFixed(2))],
      ["win_when_won", "Win % after won lane", pct],
    ], rows, "score");
  };
  return { html, draw };
}

// The week a game counts toward: its series' scheduled week (AD2L), else its date.
export const weekOfFn = (d) => {
  const sched = new Map((d?.series ?? []).filter((s) => s.time).map((s) => [s.id, new Date(s.time * 1000)]));
  return (m) => weekStart(sched.get(m.series_id) ?? m.createdAt).getTime();
};

export const loading = (kicker, title) => `${pageHead(kicker, title)}<div class="panel empty">Loading…</div>`;

export const STATS = [
  ["level", "Lvl"], ["kills", "K"], ["deaths", "D"], ["assists", "A"], ["net_worth", "Net worth"],
  ["last_hits", "LH"], ["denies", "DN"], ["gpm", "GPM"], ["xpm", "XPM"],
  ["hero_damage", "Hero dmg"], ["hero_healing", "Heal"],
];

export function errorBox(e) {
  console.error(e);
  const offline = e?.code === "unavailable" || /network|fetch/i.test(e?.message ?? "");
  return `<div class="notice err">${offline ? "Couldn't reach the league database. Check your connection and reload." : esc(e?.message ?? "Something went wrong.")}</div>`;
}