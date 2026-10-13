// Content: each week's games and highlights, and (AD2L) the series up next.
import { hasDetails, playerKey, hasMapStats } from "../lib/stats.js";
import { hasTimeline, swings } from "../lib/timeline.js";
import { info } from "../lib/glossary.js";
import { clock } from "../lib/items.js";
import { laneCuts, laneBoard, LANE_GROUPS, playerLane, isJungler } from "../lib/lanes.js";
import { hasCombat, bestStreakOf, streakName, pausesOf } from "../lib/combat.js";
import { gameMvp, esc, playerLink, fmt, heroLink, signedK, teamLink, dur, portrait, draftStrip, app, pageHead, shortDate, when, kg, subtabsMoved, sideBar } from "../core.js";
import { fbOf, hitText } from "../parts/combat.js";
import { bestLaner, loading, errorBox, weekOfFn } from "../parts/lanes.js";
import { upNextHtml } from "./standings.js";
import { tagContext, gameTags, tagsHtml } from "../lib/gametags.js";

function weekHighlights(games, src, league = games) {
  const all = games.flatMap((m) => m.players.map((p) => ({ p, m })));
  const best = (score) => all.reduce((top, x) => (!top || score(x) > score(top) ? x : top), null);
  const mvps = {};
  for (const m of games) {
    const p = gameMvp(m);
    const k = p.player_key ?? p.name.toLowerCase();
    (mvps[k] ??= { p, n: 0 }).n++;
  }
  const pow = Object.values(mvps).sort((a, b) => b.n - a.n)[0];
  const gamesOf = (p) => games.filter((m) => m.players.some((q) => (q.player_key ?? q.name) === (p.player_key ?? p.name))).length;
  const dmg = best(({ p }) => p.hero_damage);
  const kda = best(({ p }) => (p.kills + p.assists) / Math.max(p.deaths, 1));
  const gpm = best(({ p }) => p.gpm);
  const kills = best(({ p }) => p.kills);
  const vs = (m) => `${esc(m.team_a)} vs ${esc(m.team_b)}`;
  const cuts = src.ad2l ? laneCuts(league.filter(hasDetails)) : null;
  const laner = cuts ? bestLaner(laneBoard(games, cuts, playerKey, 0)) : null;
  return [
    ["Player of the week", playerLink(src, pow.p), `${pow.n} MVP${pow.n === 1 ? "" : "s"} in ${gamesOf(pow.p)} game${gamesOf(pow.p) === 1 ? "" : "s"}`, pow.p.hero, "mvp"],
    ["Biggest damage game", fmt(dmg.p.hero_damage), `<b>${playerLink(src, dmg.p)}</b> · ${heroLink(src, dmg.p.hero)} · ${vs(dmg.m)}`, dmg.p.hero],
    ["Best KDA", `${kda.p.kills}/${kda.p.deaths}/${kda.p.assists}`, `<b>${playerLink(src, kda.p)}</b> · ${heroLink(src, kda.p.hero)} · ${vs(kda.m)}`, kda.p.hero],
    ["Top GPM", fmt(gpm.p.gpm), `<b>${playerLink(src, gpm.p)}</b> · ${heroLink(src, gpm.p.hero)} · ${vs(gpm.m)}`, gpm.p.hero],
    ["Most kills", fmt(kills.p.kills), `<b>${playerLink(src, kills.p)}</b> · ${heroLink(src, kills.p.hero)} · ${vs(kills.m)}`, kills.p.hero],
    ...(laner ? [["Best laner", signedK(laner.margin),
      `gold + XP lead at 10', won ${laner.won} of ${laner.lanes} lane${laner.lanes === 1 ? "" : "s"} · <b>${playerLink(src, laner.p)}</b> · ${esc(LANE_GROUPS.find(([k]) => k === laner.group)[1])}`, laner.p.hero, "lane_best_week"]] : []),
  ];
}

function gamePanel(m, src, label, cuts = null, tagCtx = null) {
  if (m.private) {
    return `<article class="game-panel">
      <header class="gp-head">
        <span class="gp-label">${label}</span>
        <span class="gp-result"><b class="${m.winner === "a" ? "w" : ""}">${teamLink(src, m.team_a, m.team_a_id)}</b> <span class="gp-score">${m.score_a}–${m.score_b}</span> <b class="${m.winner === "b" ? "w" : ""}">${teamLink(src, m.team_b, m.team_b_id)}</b></span>
        <span class="gp-meta">${dur(m.duration_sec)} · <span class="priv">Private</span> · result only${tagsHtml(gameTags(m, tagCtx))}</span>
      </header>
    </article>`;
  }
  const mvp = gameMvp(m);
  // Lane result at 10:00, from the player's own side of their lane (AD2L games with replay numbers).
  const LANE_SHORT = { 1: "Safe", 2: "Mid", 3: "Off" };
  const laneTag = (p) => {
    const pl = cuts && hasDetails(m) ? playerLane(m, p, cuts) : null, v = pl?.verdict;
    const role = p.roaming ? ' <span class="tag">roaming</span>' : cuts && isJungler(p) ? ' <span class="tag">jungle</span>' : "";
    return (v ? ` <span class="lane-n">${LANE_SHORT[pl.role]}</span><span class="lane-v ${v}">${v === "even" ? "Draw" : v === "won" ? "Won" : "Lost"}</span>` : "") + role;
  };
  const lineup = (t) => m.players.filter((p) => p.team === t).map((p) => `
    <li class="${p === mvp ? "mvp" : ""}">${portrait(p.hero)}
      <span class="lu-name">${playerLink(src, p)}${p === mvp ? ' <span class="mvp-tag">MVP</span>' : ""}${laneTag(p)}</span>
      <span class="lu-kda">${p.kills}/${p.deaths}/${p.assists}</span>
      <span class="lu-nw">${fmt(p.net_worth)}</span>
    </li>`).join("");
  return `<article class="game-panel">
    <header class="gp-head">
      <span class="gp-label">${label}</span>
      <span class="gp-result"><b class="${m.winner === "a" ? "w" : ""}">${teamLink(src, m.team_a, m.team_a_id)}</b> <span class="gp-score">${m.score_a}–${m.score_b}</span> <b class="${m.winner === "b" ? "w" : ""}">${teamLink(src, m.team_b, m.team_b_id)}</b></span>
      <span class="gp-meta">${dur(m.duration_sec)} · ${esc(m.winner === "a" ? m.team_a : m.team_b)} win${fbOf(m) ? ` · first blood ${clock(fbOf(m).t)} ${esc(m.players[fbOf(m).i].name)}` : ""} · <a href="${src.link(m)}">Full stats →</a>${tagsHtml(gameTags(m, tagCtx))}</span>
    </header>
    ${draftStrip(m, src, "top")}
    <div class="lineups">
      <ul class="lineup a"><li class="lu-head">${teamLink(src, m.team_a, m.team_a_id)}${m.winner === "a" ? ' <span class="win-badge">Win</span>' : ""}</li>${lineup("a")}</ul>
      <ul class="lineup b"><li class="lu-head">${teamLink(src, m.team_b, m.team_b_id)}${m.winner === "b" ? ' <span class="win-badge">Win</span>' : ""}</li>${lineup("b")}</ul>
    </div>
    ${draftStrip(m, src, "bottom")}
  </article>`;
}

export async function renderWeek(src, back = 0) {
  app.innerHTML = loading(src.kicker, "Content");
  let games, ad2l = null;
  try {
    games = await src.load();
    if (src.ad2l) ad2l = await src.data();
  } catch (e) { app.innerHTML = `${pageHead(src.kicker, "Content")}${errorBox(e)}`; return; }
  // AD2L games count toward their series' scheduled week, so a series played early or
  // late still lands in the right week. Anything without a scheduled series uses its date.
  // AD2L: the series still to play, at the top of the latest week.
  const next = ad2l ? upNextHtml(src, ad2l) : "";
  const nextBlock = next ? `<h2 id="up-next">Up next</h2>${next}` : "";
  const weekOf = weekOfFn(ad2l);
  const cuts = src.ad2l ? laneCuts(games.filter(hasDetails)) : null;
  const tagCtx = tagContext(games);
  const weeks = [...new Set(games.map(weekOf))].sort((a, b) => b - a);
  if (!weeks.length) {
    app.innerHTML = `${pageHead(src.kicker, "Content")}${nextBlock}<div class="panel empty"><strong>No games yet</strong>${src.empty}</div>`;
    return;
  }
  back = Math.min(Math.max(0, back), weeks.length - 1);
  const start = new Date(weeks[back]);
  const end = new Date(start); end.setDate(end.getDate() + 6);
  const inWeek = games.filter((m) => weekOf(m) === weeks[back]).sort((a, b) => a.createdAt - b.createdAt);
  const base = `${src.root}/content`;
  const navBtn = (to, label, on) => on ? `<a class="week-btn" href="${base}/${to}">${label}</a>` : `<span class="week-btn off">${label}</span>`;
  // Every week with games, newest first (the latest on the left, week 1 at the end). Numbered
  // from the first week, so a week with no games shows up as a skipped number.
  const WEEK_MS = 7 * 864e5;
  const first = weeks[weeks.length - 1];
  const counts = new Map();
  for (const m of games) { const w = weekOf(m); counts.set(w, (counts.get(w) ?? 0) + 1); }
  const weekCols = Math.ceil(weeks.length / Math.ceil(weeks.length / 8));
  const picker = `<nav class="week-pick" aria-label="Weeks" style="--week-cols:${weekCols}">
    <div class="week-pick-label">Week</div>
    <div class="week-chips">${weeks.map((w, i) => {
      const n = Math.round((w - first) / WEEK_MS) + 1, c = counts.get(w);
      return `<a class="week-chip${i === back ? " on" : ""}" href="${base}/${i}" ${i === back ? 'aria-current="page"' : ""}
        title="Week of ${shortDate(new Date(w))} · ${c} game${c === 1 ? "" : "s"}">
        <span class="wn">${n}</span><span class="wd">${shortDate(new Date(w))}</span><span class="wc">${c}g</span></a>`;
    }).join("")}</div>
  </nav>`;

  // One series (AD2L) or game (scrims) per entry; the picker shows one at a time.
  let items;
  if (ad2l) {
    // Group games under their PlayOn series.
    const bySeries = new Map();
    for (const m of inWeek) (bySeries.get(m.series_id) ?? bySeries.set(m.series_id, []).get(m.series_id)).push(m);
    const tname = Object.fromEntries(ad2l.teams.map((t) => [t.id, t.name]));
    // All divisions: each series chip wears its division's menu colour, named in the sub line.
    const tteam = src.all ? new Map(ad2l.teams.map((t) => [t.id, t])) : null;
    items = [...bySeries.entries()].map(([sid, gs]) => {
      const s = ad2l.series.find((x) => x.id === sid);
      const head = s
        ? `<span>${teamLink(src, tname[s.home], s.home)}</span> <span class="series-score">${s.home_score ?? "?"}–${s.away_score ?? "?"}</span> <span>${teamLink(src, tname[s.away], s.away)}</span>`
        : `${esc(gs[0].team_a)} vs ${esc(gs[0].team_b)}`;
      const [sa, sb] = s ? [s.home_score, s.away_score] : [null, null];
      const home = tteam?.get(s?.home ?? gs[0].team_a_id);
      return {
        lg: home?.league ?? null,
        a: s ? tname[s.home] ?? gs[0].team_a : gs[0].team_a, b: s ? tname[s.away] ?? gs[0].team_b : gs[0].team_b, sa, sb,
        win: sa == null || sb == null || sa === sb ? null : sa > sb ? "a" : "b",
        sub: `${home ? `${esc(home.division)} · ` : ""}${gs.length} game${gs.length === 1 ? "" : "s"}`,
        html: `<h2 class="series-head">${head}</h2>${gs.map((m, j) => gamePanel(m, src, `Game ${j + 1}`, cuts, tagCtx)).join("")}`,
      };
    });
  } else {
    items = inWeek.map((m) => ({ a: m.team_a, b: m.team_b, sa: m.score_a, sb: m.score_b, win: m.winner, sub: when(m.createdAt), html: gamePanel(m, src, when(m.createdAt), cuts, tagCtx) }));
  }
  const noun = src.ad2l ? "series" : "game";
  const tabs = items.map((it, i) => `<button type="button" role="tab" id="sp-tab-${i}" aria-controls="sp-panel-${i}"
      aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" style="--i:${Math.min(i, 12)}"${it.lg ? ` data-lg="${it.lg}"` : ""}>
      <span class="sp-team${it.win === "a" ? " w" : ""}" title="${esc(it.a)}">${esc(it.a)}</span><span class="sp-score${it.win === "a" ? " w" : ""}">${it.sa ?? "?"}</span>
      <span class="sp-team${it.win === "b" ? " w" : ""}" title="${esc(it.b)}">${esc(it.b)}</span><span class="sp-score${it.win === "b" ? " w" : ""}">${it.sb ?? "?"}</span>
      <span class="sp-sub">${it.sub}</span>
    </button>`).join("");
  const panels = items.map((it, i) => {
    const next = items[i + 1];
    return `<section class="series" role="tabpanel" id="sp-panel-${i}" aria-labelledby="sp-tab-${i}"${i === 0 ? "" : " hidden"}>
      ${it.html}
      ${next ? `<button type="button" class="sp-next" data-go="${i + 1}">Next ${noun}: ${esc(next.a)} vs ${esc(next.b)} →</button>` : ""}
    </section>`;
  }).join("");
  const body = `<div class="sp-tabs reveal" role="tablist" aria-label="${src.ad2l ? "Series" : "Games"} this week">${tabs}</div>${panels}`;

  // Highlights only from games with details (private scrims are results only).
  const detailed = inWeek.filter(hasDetails);
  const hl = detailed.length ? weekHighlights(detailed, src, games) : [];
  // Map play of the week (games with replay data): most wards, stacks and dewards in one game.
  const mapped = detailed.flatMap((m) => m.players.filter(hasMapStats).map((p) => ({ m, p })));
  if (mapped.length) {
    const top = (f) => mapped.reduce((a, b) => (f(b.p) > f(a.p) ? b : a));
    const vsTxt = (m) => `${esc(m.team_a)} vs ${esc(m.team_b)}`;
    const w = top((p) => p.obs_placed + p.sen_placed), st = top((p) => p.camps_stacked), dw = top((p) => p.obs_killed + p.sen_killed);
    hl.push(["Most wards", `${w.p.obs_placed + w.p.sen_placed}`, `<b>${playerLink(src, w.p)}</b> · ${w.p.obs_placed} obs, ${w.p.sen_placed} sentries · ${vsTxt(w.m)}`, w.p.hero]);
    hl.push(["Most stacks", `${st.p.camps_stacked}`, `<b>${playerLink(src, st.p)}</b> · ${heroLink(src, st.p.hero)} · ${vsTxt(st.m)}`, st.p.hero]);
    hl.push(["Most dewards", `${dw.p.obs_killed + dw.p.sen_killed}`, `<b>${playerLink(src, dw.p)}</b> · ${dw.p.obs_killed} obs, ${dw.p.sen_killed} sentries · ${vsTxt(dw.m)}`, dw.p.hero]);
  }
  // Combat of the week (parsed replays): longest streak, rampages, biggest hit, top APM, aegis
  // steals and the most paused game.
  const fought = detailed.flatMap((m) => m.players.map((p, i) => ({ m, p, i })).filter(({ p }) => hasCombat(p)));
  if (fought.length) {
    const vsTxt = (m) => `${esc(m.team_a)} vs ${esc(m.team_b)}`;
    const streak = fought.map((x) => ({ ...x, n: bestStreakOf(x.m, x.i) })).sort((a, b) => b.n - a.n)[0];
    if (streak.n >= 3) hl.push(["Longest streak", `<a href="${src.link(streak.m)}">${streak.n}</a>`, `${esc(streakName(streak.n))} · <b>${playerLink(src, streak.p)}</b> · ${heroLink(src, streak.p.hero)} · ${vsTxt(streak.m)}`, streak.p.hero, "best_streak"]);
    const ramp = fought.filter((x) => x.p.multi?.[3]);
    if (ramp.length) hl.push(["Rampages", String(ramp.reduce((a, x) => a + x.p.multi[3], 0)),
      ramp.map((x) => `<b>${playerLink(src, x.p)}</b> · ${heroLink(src, x.p.hero)} · ${vsTxt(x.m)}`).join("<br>"), ramp[0].p.hero, "rampages"]);
    const hit = fought.filter((x) => x.p.max_hit).sort((a, b) => b.p.max_hit[0] - a.p.max_hit[0])[0];
    if (hit) hl.push(["Biggest hit", fmt(hit.p.max_hit[0]), `<b>${playerLink(src, hit.p)}</b> · ${esc(hitText(hit.p.max_hit))} · ${vsTxt(hit.m)}`, hit.p.hero, "max_hit"]);
    const apm = fought.filter((x) => x.p.apm != null).sort((a, b) => b.p.apm - a.p.apm)[0];
    if (apm) hl.push(["Highest APM", String(apm.p.apm), `<b>${playerLink(src, apm.p)}</b> · ${heroLink(src, apm.p.hero)} · ${vsTxt(apm.m)}`, apm.p.hero, "apm"]);
  }
  const fbs = detailed.map((m) => ({ m, fb: fbOf(m) })).filter((x) => x.fb).sort((a, b) => a.fb.t - b.fb.t);
  if (fbs.length) {
    const { m, fb } = fbs[0], p = m.players[fb.i], v = fb.victim != null ? m.players[fb.victim] : null;
    hl.push(["Fastest first blood", `<a href="${src.link(m)}">${clock(fb.t)}</a>`, `<b>${playerLink(src, p)}</b> · ${heroLink(src, p.hero)}${v ? ` on ${heroLink(src, v.hero)}` : ""} · ${esc(m.team_a)} vs ${esc(m.team_b)}${fb.t < 0 ? " · before the horn" : ""}`, p.hero, "first_blood"]);
  }
  const steals = detailed.flatMap((m) => (m.objectives ?? []).filter((o) => o.type === "aegis_stolen").map((o) => ({ m, o })));
  if (steals.length) hl.push(["Aegis stolen", String(steals.length), steals.map(({ m, o }) => `${esc(o.side === "a" ? m.team_a : m.team_b)} at ${clock(o.time)} · <a href="${src.link(m)}">${esc(m.team_a)} vs ${esc(m.team_b)}</a>`).join("<br>"), null, "aegis_steals"]);
  const paused = detailed.map((m) => ({ m, z: pausesOf(m) })).filter((x) => x.z?.n).sort((a, b) => b.z.total - a.z.total)[0];
  if (paused) hl.push(["Most paused", dur(paused.z.total), `${paused.z.n} pause${paused.z.n === 1 ? "" : "s"} · <a href="${src.link(paused.m)}">${esc(paused.m.team_a)} vs ${esc(paused.m.team_b)}</a>`, null, "pauses"]);
  // Biggest comeback of the week (games with a gold timeline).
  const swung = detailed.filter(hasTimeline).map((m) => ({ m, s: swings(m) })).sort((a, b) => b.s.thrown - a.s.thrown)[0];
  if (swung && swung.s.thrown >= 1000) {
    const { m, s } = swung;
    const winner = m.winner === "a" ? m.team_a : m.team_b, loser = m.winner === "a" ? m.team_b : m.team_a;
    hl.push(["Biggest comeback", `<a href="${src.link(m)}">${kg(s.thrown)}</a>`,
      `${teamLink(src, winner, m.winner === "a" ? m.team_a_id : m.team_b_id)} came back after ${teamLink(src, loser, m.winner === "a" ? m.team_b_id : m.team_a_id)} led by ${kg(s.thrown)} at ${s.thrown_minute}'`, null, "biggest_comeback"]);
  }
  app.innerHTML = `
    <div class="week-top">
      ${pageHead(src.kicker, "Content", `Week of ${shortDate(start)} – ${shortDate(end)} · ${inWeek.length} game${inWeek.length === 1 ? "" : "s"}${src.ad2l ? " · drafts in pick/ban order" : ""}`)}
      ${picker}
    </div>
    <div class="week-nav">${navBtn(back - 1, "← Later week", back > 0)}${navBtn(back + 1, "Earlier week →", back < weeks.length - 1)}</div>
    <h2>${src.ad2l ? "Series" : "Games"} <span class="h-note">${items.length} this week · pick one</span></h2>
    ${body}
    ${back === 0 ? nextBlock : ""}
    ${hl.length ? `<h2>Highlights</h2>
    <div class="cards reveal">${hl.map(([k, v, s, hero, tip], i) => `<div class="card hl" style="--i:${i}">${hero ? portrait(hero, "card-hero") : ""}<div class="k">${k}${info(tip)}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join("")}</div>` : ""}`;
  wireSeriesTabs();
  if (subtabsMoved()) sideBar([{ label: "Weeks", el: app.querySelector(".week-pick") }], () => `Week ${app.querySelector(".week-chip.on .wn")?.textContent ?? ""}`);
}

// Weekly page: one series panel at a time. Arrow keys move between tabs; the "Next series"
// button at the bottom of a panel opens the next one and brings the picker back into view.
function wireSeriesTabs() {
  const bar = app.querySelector(".sp-tabs");
  if (!bar) return;
  const btns = [...bar.querySelectorAll("[role=tab]")];
  const pick = (b, { focus = false, scroll = false } = {}) => {
    for (const x of btns) {
      const on = x === b;
      x.setAttribute("aria-selected", String(on));
      x.tabIndex = on ? 0 : -1;
      document.getElementById(x.getAttribute("aria-controls")).hidden = !on;
    }
    if (focus) b.focus({ preventScroll: true });
    // Keep the chosen tab in view when the strip scrolls sideways (phones).
    if (b.offsetLeft < bar.scrollLeft || b.offsetLeft + b.offsetWidth > bar.scrollLeft + bar.clientWidth) bar.scrollLeft = b.offsetLeft - 16;
    const head = document.querySelector(".top")?.offsetHeight ?? 0, top = bar.getBoundingClientRect().top;
    if (scroll || top < head) scrollTo({ top: scrollY + top - head - 12 });
  };
  bar.addEventListener("click", (e) => { const b = e.target.closest("[role=tab]"); if (b) pick(b); });
  bar.addEventListener("keydown", (e) => {
    const i = btns.indexOf(document.activeElement), step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 1, ArrowUp: -1 }[e.key];
    if (i < 0 || !step) return;
    e.preventDefault();
    pick(btns[(i + step + btns.length) % btns.length], { focus: true });
  });
  for (const n of app.querySelectorAll(".sp-next")) n.addEventListener("click", () => pick(btns[Number(n.dataset.go)], { scroll: true }));
}
