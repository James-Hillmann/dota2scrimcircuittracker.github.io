// Scrim standings (the ledger) and the game page.
import { withDerived, hasDetails, playerKey } from "../lib/stats.js";
import { gameRatings, tierList, rankLabel, METRICS, SURVIVAL } from "../lib/tiers.js";
import { heroImg } from "../lib/hero-meta.js";
import { standingsRows } from "../lib/teams.js";
import { hasTimeline, swings, BIG_LEAD } from "../lib/timeline.js";
import { lineChart, leadChart, wireCharts } from "../lib/charts.js";
import { wardMapHtml, wardsOf, wireWardMaps } from "../lib/wardmap.js";
import { visionMapHtml, wireVisionMaps } from "../lib/visionmap.js";
import { mapLayerData, wireMapLayers } from "../lib/maplayers.js";
import { deathMapHtml, wireDeathMaps } from "../lib/deathmap.js";
import { smokeMapHtml, wireSmokeMaps } from "../lib/smokemap.js";
import { towerMapHtml, wireTowerMaps } from "../lib/towermap.js";
import { itemLeadHtml, LAYERS } from "../lib/itemlead.js";
import { asAd2l, sameTeams } from "../lib/unticketed.js";
import { getMatch, currentUid, moveMatch, deleteMatch, listCasts, MAX_CASTS, addCast, deleteCast } from "../lib/store.js";
import { info } from "../lib/glossary.js";
import { SEASON } from "../lib/divisions.js";
import { clock } from "../lib/items.js";
import { firstBloodOf } from "../lib/combat.js";
import { tagContext, gameTags, tagsHtml } from "../lib/gametags.js";
import { wireStreakCharts, buildOrderHtml } from "../lib/combat-charts.js";
import { app, pageHead, teamLink, dur, when, sortableTable, pct, scrimNames, divData, editUnlocked, missingGames, seriesOptions, unlockEdit, divUploaded, lockEdit, allMatches, esc, crumbs, floorOf, gameMvp, shortDate, portrait, playerLink, kg, fmt, heroLink, mapCard, playerTabs, draftStrip, wirePlayerTabs, wireMapCards } from "../core.js";
import { gameCombatHtml, detailsFor } from "../parts/combat.js";
import { rateOf } from "../parts/draft.js";
import { gameItemsHtml } from "../parts/items.js";
import { loading, errorBox, laneCutsOf, gameLanesHtml } from "../parts/lanes.js";
import { tierRef } from "../parts/tiers.js";
import { route } from "../app.js";
import { pageTabs, SCRIM_TEAMS_TABS } from "../lib/pagetabs.js";
import { teamGridHtml } from "./teams.js";

// ---------- Matches ----------

// The scrims' Teams page (#/scrims/), like a division's: Table (standings built from the
// games, since scrims have no official table) | Matches | Teams (the team cards).
export async function renderMatches(src) {
  const title = "Teams";
  app.innerHTML = loading(src.kicker, title);
  let data;
  try { data = await src.load(); } catch (e) { app.innerHTML = `${pageHead(src.kicker, title)}${errorBox(e)}`; return; }
  const count = `${data.length} ${data.length === 1 ? "game" : "games"} on record`;
  const fixtures = data.length ? `<div class="fixtures reveal">${data.map((m, i) => `
      <a class="fixture win-${m.winner}" href="${src.link(m)}" style="--i:${Math.min(i, 12)}">
        <div class="fx-team a ${m.winner === "a" ? "" : "lost"}">${teamLink(src, m.team_a, m.team_a_id, true)}${m.winner === "a" ? "<small>Victory</small>" : ""}</div>
        <div class="fx-score">
          <div class="n">${m.score_a}<i>/</i>${m.score_b}</div>
          <div class="meta">${dur(m.duration_sec)} · ${when(m.createdAt)}${m.private ? ' · <span class="priv">Private</span>' : ""}${m.unticketed ? ' · <span class="priv">Unticketed</span>' : ""}${tagsHtml(gameTags(m, tagContext(data)))}</div>
        </div>
        <div class="fx-team b ${m.winner === "b" ? "" : "lost"}">${teamLink(src, m.team_b, m.team_b_id, true)}${m.winner === "b" ? "<small>Victory</small>" : ""}</div>
      </a>`).join("")}</div>`
    : `<div class="panel empty"><strong>No games yet</strong>${src.empty}</div>`;
  const tabs = playerTabs(pageTabs(SCRIM_TEAMS_TABS, src, [
    ["table", data.length ? `<div id="standings" class="reveal"></div>
      <p class="table-note">Ranked by game wins, then fewest losses. Private scrims count. <b>Kill ±</b> = average kill score
        difference per game. <b>Form</b> = last five games, oldest first.</p>` : `<div class="panel empty"><strong>No games yet</strong>${src.empty}</div>`],
    ["matches", { label: data.length ? `Matches · ${data.length}` : "Matches", html: fixtures }],
    ["teams", data.length ? teamGridHtml(src, data, null) : ""],
  ]), { store: "standingsTab", label: "Teams sections", remember: false });
  app.innerHTML = `${pageHead(src.kicker, title, data.length ? count : "", tabs.bar)}${tabs.panels}`;
  wirePlayerTabs();
  const el = document.getElementById("standings");
  if (!el) return;
  const signed = (x) => (x == null ? "—" : `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toFixed(1)}`);
  const form = (f) => `<span class="sos-faced">${f.map((r) => `<span class="sos-sq ${r.toLowerCase()}" title="${r === "W" ? "Won" : "Lost"}">${r}</span>`).join("")}</span>`;
  sortableTable(el, [
    ["team", "Team", (v) => teamLink(src, v), "l"], ["games", "GP", null, "", null, "gp"], ["wins", "W", null, "", "jade"], ["losses", "L"],
    ["win_rate", "Win %", pct, "", "jade"], ["kill_diff", "Kill ±", signed], ["form", "Form", form, "l"], ["streak", "Streak"],
  ], standingsRows(data), "wins");
}

export async function renderMatch(id, src) {
  app.innerHTML = `<div class="panel empty">Loading…</div>`;
  let raw, all;
  try {
    all = await src.load().catch(() => []);
    raw = all.find((m) => m.id === id)
      ?? (src.key === "scrim" ? await getMatch(id).then(async (m) => m && scrimNames(m, await divData("ad2l").catch(() => null))) : src.ad2l && /^[0-9a-f]{32}$/.test(id) ? await getMatch(id, src.key).then((u) => u && withDerived(asAd2l(u, src.cache()))) : null);
  } catch (e) { app.innerHTML = errorBox(e); return; }
  if (!raw) { app.innerHTML = `<div class="notice err">No such match.</div>`; return; }
  const m = raw.teamTotals || raw.private ? raw : withDerived(raw);

  // The uploader (same browser) can delete or move their upload; so can anyone who types the
  // league's shared password (kept for this tab). A speed bump, not security: the rules let
  // any visitor delete an upload.
  const uploaded = src.key === "scrim" || m.unticketed;
  const mine = uploaded && m.uid && m.uid === (await currentUid());
  const unlocked = uploaded && !mine && editUnlocked();
  const canDelete = mine || unlocked;
  const noun = m.unticketed ? "game" : "scrim";
  // Unticketed uploads can be put in (or moved to) the PlayOn series they stand for.
  const moveOpts = m.unticketed && canDelete ? missingGames(src.key, m.id).filter((g) => sameTeams(src.cache(), g.series, m.team_a, m.team_b)) : [];
  const moveHtml = m.unticketed && canDelete ? `<label class="series-pick">Which game is this?
      <select id="series-move">
        <option value="" disabled ${m.series_id ? "" : "selected"}>Pick the missing game…</option>
        ${seriesOptions(moveOpts, m.series_id ?? null, src.cache())}
      </select>
      <span class="muted">${moveOpts.length ? "Games between these two teams missing from the record, from earlier weeks or not yet ticketed this week. Picking one moves this game into that series and week." : "No open game between these two teams: PlayOn has every game of their series on record."}</span>
      <span class="row"><button type="button" id="move" disabled>Move</button><span class="muted" id="move-msg"></span></span></label>` : "";
  const deleteBtn = !uploaded ? "" : canDelete
    ? `${moveHtml}<div class="row" style="margin-top:18px"><button id="edit">Edit this ${noun}</button>
        <button class="danger" id="del">Delete this ${noun}</button>
        ${unlocked ? `<span class="muted">Unlocked with the league password · <a href="#" id="edit-lock">Lock</a></span>` : ""}</div>`
    : `<details class="admin-login"><summary>Edit or delete this ${noun}</summary>
        <form id="edit-form" class="row"><input type="password" name="password" placeholder="League password" autocomplete="off" required>
          <button type="submit">Unlock</button></form><p class="muted" id="edit-msg"></p></details>`;
  const wireDelete = () => {
    const form = document.getElementById("edit-form");
    if (form) form.onsubmit = (e) => {
      e.preventDefault();
      if (unlockEdit(form.password.value)) route();
      else document.getElementById("edit-msg").textContent = "Wrong password.";
    };
    const sel = document.getElementById("series-move"), mv = document.getElementById("move");
    if (sel && mv) {
      sel.onchange = () => { mv.disabled = (Number(sel.value) || null) === (m.series_id ?? null); };
      mv.onclick = async () => {
        mv.disabled = true;
        const msg = document.getElementById("move-msg");
        msg.textContent = "Moving…";
        try {
          await moveMatch(m.id, Number(sel.value) || null, src.key);
          await divUploaded(src.key, true);
          route();
        } catch (err) { msg.textContent = `Couldn't move it: ${err.message}`; mv.disabled = false; }
      };
    }
    const ed = document.getElementById("edit");
    if (ed) ed.onclick = () => { location.hash = `${src.root}/edit/${m.id}`; };
    const lock = document.getElementById("edit-lock");
    if (lock) lock.onclick = (e) => { e.preventDefault(); lockEdit(); route(); };
    const b = document.getElementById("del");
    if (!b) return;
    b.onclick = async () => {
      if (!confirm(`Delete ${m.team_a} vs ${m.team_b}? This removes it from the league for everyone and can't be undone.`)) return;
      b.disabled = true;
      b.textContent = "Deleting…";
      try {
        await deleteMatch(m.id, m.unticketed ? src.key : "scrim");
        if (m.unticketed) { await divUploaded(src.key, true); location.hash = src.base; }
        else { await allMatches(true); location.hash = "#/scrims/"; }
      } catch (e) {
        b.disabled = false;
        b.textContent = `Delete this ${noun}`;
        app.insertAdjacentHTML("beforeend", `<div class="notice err">Couldn't delete: ${esc(e.message)}</div>`);
      }
    };
  };

  if (m.private) {
    const side = (t) => `<div class="plate ${t} ${m.winner === t ? "" : "lost"}">
      <div class="top-line"><span class="side">${t === "a" ? "Team A" : "Team B"}</span>${m.winner === t ? '<span class="win-badge">Victory</span>' : ""}</div>
      <div class="team">${t === "a" ? teamLink(src, m.team_a, m.team_a_id) : teamLink(src, m.team_b, m.team_b_id)}</div>
      <div class="n">${t === "a" ? m.score_a : m.score_b}</div></div>`;
    app.innerHTML = `
      <div class="kicker" style="margin-bottom:16px">${crumbs(src, ["Standings", src.base], `${m.team_a} vs ${m.team_b}`)}</div>
      <h1 class="sr-only">${esc(m.team_a)} vs ${esc(m.team_b)}</h1>
      <section class="banner">${side("a")}${side("b")}
        <div class="banner-meta">${esc(m.game_mode || "Match")} · <b>${dur(m.duration_sec)}</b></div></section>
      <div class="panel empty"><strong>Private scrim</strong>Only the result was posted: no heroes, players or stats.<br>
        It counts toward both teams' records, but not the tier list, player or hero tables.</div>
      ${CASTS_BOX}
      <p class="table-note keep">Posted ${when(m.createdAt)}.</p>${deleteBtn}`;
    wireDelete();
    wireCasts(m.id, src.key);
    return;
  }

  const ad2l = src.ad2l;
  const detailed = all.filter(hasDetails);
  if (!detailed.includes(m)) detailed.push(m);
  // Game ratings and each player's season tier, as on the player page. Leagues too small for
  // a model just go without.
  let rated = [], season = new Map();
  try {
    const model = src.view ? await tierRef(src) : null; // else built from `detailed`, this game included
    rated = gameRatings(m, detailed, { model });
    season = new Map(tierList(detailed, { model, minGames: floorOf(src) }).tiers.flatMap(({ tier, players }) => players.map((p) => [p.key, { ...p, tier }])));
  } catch { /* not enough games to rate */ }
  const rateOf = new Map(rated.map((r) => [r.key, r]));
  const mvp = gameMvp(m);
  const teamOf = (t) => m.players.filter((p) => p.team === t);
  const nameOf = (t) => (t === "a" ? m.team_a : m.team_b);
  const linkOf = (t) => (t === "a" ? teamLink(src, m.team_a, m.team_a_id) : teamLink(src, m.team_b, m.team_b_id));

  const plate = (t) => {
    const won = m.winner === t;
    return `<div class="plate ${t} ${won ? "" : "lost"}">
      <div class="top-line"><span class="side">${ad2l && !m.unticketed ? (t === "a" ? "Radiant" : "Dire") : (t === "a" ? "Team A" : "Team B")}</span>${won ? '<span class="win-badge">Victory</span>' : ""}</div>
      <div class="team">${linkOf(t)}</div>
      <div class="n">${t === "a" ? m.score_a : m.score_b}</div>
    </div>`;
  };

  // The series this game belongs to (AD2L), or earlier meetings of the same two teams (scrims).
  const pair = (g) => [g.team_a, g.team_b].map((x) => x.toLowerCase()).sort().join("|");
  const inSeries = ad2l && m.series_id != null;
  const others = all.filter((g) => (inSeries ? g.series_id === m.series_id : pair(g) === pair(m)))
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  let seriesHtml = "";
  if (others.length > 1) {
    const wins = { [m.team_a.toLowerCase()]: 0, [m.team_b.toLowerCase()]: 0 };
    for (const g of others) wins[(g.winner === "a" ? g.team_a : g.team_b).toLowerCase()]++;
    const s = inSeries ? src.cache()?.series?.find((x) => x.id === m.series_id) : null;
    const [wa, wb] = s ? (s.home === m.team_a_id ? [s.home_score, s.away_score] : [s.away_score, s.home_score]) : [wins[m.team_a.toLowerCase()], wins[m.team_b.toLowerCase()]];
    const shown = inSeries ? others : others.slice(-8);
    seriesHtml = `<nav class="gm-series" aria-label="${inSeries ? "Games in this series" : "Meetings between these teams"}">
      <span class="gm-series-k">${inSeries ? "Series" : "Head to head"} <b>${esc(m.team_a)} ${wa ?? "?"}–${wb ?? "?"} ${esc(m.team_b)}</b></span>
      ${shown.map((g) => {
        const n = others.indexOf(g) + 1, win = g.winner === "a" ? g.team_a : g.team_b;
        const side = win.toLowerCase() === m.team_a.toLowerCase() ? "a" : "b";
        return g === m
          ? `<span class="gm-chip on s-${side}" aria-current="page"><small>Game ${n} · won by</small>${esc(win)}</span>`
          : `<a class="gm-chip s-${side}" href="${src.link(g)}"><small>Game ${n}${inSeries ? "" : ` · ${shortDate(g.createdAt)}`} · won by</small>${esc(win)}</a>`;
      }).join("")}</nav>`;
  }

  // Key facts: MVP, the gold story, first Roshan, towers.
  const s = hasTimeline(m) ? swings(m) : null;
  const mvpRate = rateOf.get(playerKey(mvp));
  const firstRosh = (m.objectives ?? []).filter((o) => o.type === "roshan").sort((a, b) => a.time - b.time)[0];
  const fb = firstBloodOf(m), fbP = fb && m.players[fb.i];
  const facts = [
    ["MVP", `${portrait(mvp.hero, "fact-img")}${playerLink(src, mvp)}`, `${esc(mvp.hero)} · ${mvp.kills}/${mvp.deaths}/${mvp.assists}${mvpRate ? ` · rating ${mvpRate.rating}` : ""}`, "mvp"],
    s && ["Biggest lead", `<span class="s-${s.lead.a.max >= s.lead.b.max ? "a" : "b"}">+${kg(Math.max(s.lead.a.max, s.lead.b.max))}</span>`,
      `${esc(nameOf(s.lead.a.max >= s.lead.b.max ? "a" : "b"))} at ${s.lead[s.lead.a.max >= s.lead.b.max ? "a" : "b"].minute}'`],
    s && [s.thrown >= BIG_LEAD ? "Comeback" : "Loser's best lead", s.thrown >= 1000 ? `<span class="s-${s.loser}">+${kg(s.thrown)}</span>` : "None",
      s.thrown >= 1000 ? `${esc(nameOf(s.loser))} at ${s.thrown_minute}', then lost` : `${esc(nameOf(m.winner))} led wire to wire`],
    s && ["Lead changes", String(s.lead_changes), s.at10 != null ? `${esc(nameOf(s.at10 >= 0 ? "a" : "b"))} +${kg(Math.abs(s.at10))} at 10'` : ""],
    fb && ["First blood", `<span class="s-${fb.team}">${clock(fb.t)}</span>`, `${playerLink(src, fbP)} · ${esc(fbP.hero)}${fb.victim != null ? ` on ${esc(m.players[fb.victim].hero)}` : ""}`, "first_blood"],
    firstRosh && ["First Roshan", `<span class="s-${firstRosh.side}">${clock(firstRosh.time)}</span>`, esc(nameOf(firstRosh.side))],
    !s && ["Kills", `<span class="s-a">${m.score_a}</span>–<span class="s-b">${m.score_b}</span>`, `${fmt(m.score_a + m.score_b)} in ${dur(m.duration_sec)}`],
  ].filter(Boolean);
  const factsHtml = `<div class="gm-facts reveal">${facts.map(([k, v, sub, tip], i) => `<div class="gm-fact" style="--i:${i}">
      <div class="k">${k}${tip ? info(tip) : ""}</div><div class="v">${v}</div><div class="s">${sub}</div></div>`).join("")}</div>`;

  // Team against team, stat by stat: one split bar per row.
  const sum = (t, f) => teamOf(t).reduce((a, p) => a + (f(p) ?? 0), 0);
  const all10 = (f) => m.players.every((p) => f(p) != null);
  const objCount = (type, t) => (m.objectives ?? []).filter((o) => o.type === type && o.side === t).length;
  const towersTaken = (t) => (m.buildings ?? []).filter((b) => b.side !== t && /^t\d/.test(b.b)).length;
  const tape = [
    ["Kills", () => m.score_a, () => m.score_b, fmt],
    ["Net worth", ...["a", "b"].map((t) => () => sum(t, (p) => p.net_worth)), kg],
    ["Hero damage", ...["a", "b"].map((t) => () => sum(t, (p) => p.hero_damage)), kg],
    all10((p) => p.tower_damage) && ["Building damage", ...["a", "b"].map((t) => () => sum(t, (p) => p.tower_damage)), kg],
    m.buildings?.length && ["Towers taken", () => towersTaken("a"), () => towersTaken("b"), fmt],
    ["Last hits", ...["a", "b"].map((t) => () => sum(t, (p) => p.last_hits)), fmt],
    ["Healing", ...["a", "b"].map((t) => () => sum(t, (p) => p.hero_healing)), kg],
    all10((p) => p.stuns) && ["Stun time", ...["a", "b"].map((t) => () => sum(t, (p) => p.stuns)), (v) => `${Math.round(v)}s`],
    all10((p) => p.obs_placed) && ["Wards placed", ...["a", "b"].map((t) => () => sum(t, (p) => p.obs_placed + p.sen_placed)), fmt],
    all10((p) => p.obs_killed) && ["Dewards", ...["a", "b"].map((t) => () => sum(t, (p) => p.obs_killed + p.sen_killed)), fmt],
    all10((p) => p.camps_stacked) && ["Stacks", ...["a", "b"].map((t) => () => sum(t, (p) => p.camps_stacked)), fmt],
    m.objectives && ["Roshans", () => objCount("roshan", "a"), () => objCount("roshan", "b"), fmt],
    all10((p) => p.time_dead) && ["Time dead", ...["a", "b"].map((t) => () => sum(t, (p) => p.time_dead)), (v) => dur(Math.round(v)), true],
  ].filter(Boolean);
  const tapeHtml = `<div class="gm-tape" aria-label="Team comparison">
    <div class="gm-tape-head"><span class="s-a">${linkOf("a")}</span><span class="s-b">${linkOf("b")}</span></div>
    <div class="gm-tape-rows">${tape.map(([label, fa, fb, f, lowerBetter]) => {
      const a = fa(), b = fb(), tot = a + b, lead = a === b ? "" : (a > b) !== !!lowerBetter ? "a" : "b";
      return `<div class="gm-row${lead ? ` lead-${lead}` : ""}"><b class="va">${f(a)}</b><span class="tl">${label}</span><b class="vb">${f(b)}</b>
        <span class="tbar" style="--p:${tot ? (a / tot).toFixed(3) : 0.5}"></span></div>`;
    }).join("")}</div></div>`;

  // Scoreboard: player (portrait, hero, rank) then the numbers, ▲ on the game's best.
  const best = (k) => Math.max(...m.players.map((p) => p[k] ?? -Infinity));
  const cols = [
    ["kills", "K"], ["deaths", "D"], ["assists", "A"], ["level", "Lvl"], ["net_worth", "Net worth", fmt], ["last_hits", "LH"], ["denies", "DN"],
    ["gpm", "GPM"], ["xpm", "XPM"], ["hero_damage", "Hero dmg", fmt], ["dmg_per_min", "Dmg/min", fmt],
    ["dmg_per_1k_nw", "Dmg per 1k NW", fmt], ["dmg_share", "Dmg share", pct], ["kill_participation", "KP", pct], ["hero_healing", "Heal", fmt],
  ].filter(([k]) => m.players.some((p) => p[k] != null));
  const highlight = new Set(["kills", "net_worth", "gpm", "xpm", "hero_damage", "dmg_per_min", "dmg_per_1k_nw", "kill_participation", "hero_healing"]);
  const who = (p) => {
    const rank = rankLabel(p.rank_tier), r = rateOf.get(playerKey(p));
    return `<td class="l who">${portrait(p.hero)}<span class="who-body"><span class="who-name">${playerLink(src, p)}${p === mvp ? ' <span class="mvp-tag">MVP</span>' : ""}</span>
      <span class="who-sub">${heroLink(src, p.hero)}${p.position ? ` · pos ${p.position}` : ""}${rank ? ` · ${esc(rank)}` : ""}${p.standin ? " · stand-in" : ""}</span></span>
      ${r ? `<span class="who-r t-${r.tier}" title="Game rating ${r.rating} (${r.tier})">${r.rating}</span>` : ""}</td>`;
  };
  const rows = (t) => teamOf(t).map((p) => `
    <tr class="team-${t}">${who(p)}
      ${cols.map(([k, , f]) => `<td class="${highlight.has(k) && p[k] === best(k) && p[k] > 0 ? "best" : ""}">${(f ?? ((x) => x ?? "—"))(p[k])}</td>`).join("")}
    </tr>`).join("");
  const top = (k, f) => { const p = [...m.players].sort((x, y) => (y[k] ?? 0) - (x[k] ?? 0))[0]; return { p, v: f(p[k]) }; };
  const cards = [
    ["Most hero damage", top("hero_damage", fmt), "hero_damage"],
    ["Best damage per 1k NW", top("dmg_per_1k_nw", fmt), "dmg_per_1k_nw"],
    ["Highest kill participation", top("kill_participation", pct), "kill_participation"],
    ["Richest", top("net_worth", fmt), "net_worth"],
    ["Top GPM", top("gpm", fmt), "gpm"],
  ];
  // Header cells, repeated under team B's banner so its columns read without scrolling up.
  const headCells = `<th scope="col" class="l">Player${rated.length ? " · rating" : ""}</th>${cols.map(([k, l]) => `<th scope="col">${l}${info(k)}</th>`).join("")}`;
  const scoreHtml = `<div class="gm-standouts">${cards.map(([k, { p, v }, tip]) => `<div class="gm-stand">${portrait(p.hero, "fact-img")}
      <div><div class="k">${k}${info(tip)}</div><div class="v">${v}</div><div class="s">${playerLink(src, p)}</div></div></div>`).join("")}</div>
    <div class="table-wrap gm-board"><table>
      <thead><tr>${headCells}</tr></thead>
      <tbody>
        <tr class="sep a"><td colspan="${cols.length + 1}">${linkOf("a")}${m.winner === "a" ? ' <span class="win-badge">Win</span>' : ""}</td></tr>${rows("a")}
        <tr class="sep b"><td colspan="${cols.length + 1}">${linkOf("b")}${m.winner === "b" ? ' <span class="win-badge">Win</span>' : ""}</td></tr>
        <tr class="head-repeat">${headCells}</tr>${rows("b")}
      </tbody></table></div>
    <p class="table-note">▲ best in the game.</p>
    <h3 class="gm-h3">Team comparison</h3>${tapeHtml}`;

  // Ratings: every player's game rating, what drove it, and their season tier for comparison.
  let ratingsHtml = "";
  if (rated.length) {
    const lean = (x) => (x.score - 50) * x.share * (x.surv ? 0.5 : 1);
    // Survival parts read as "few" / "many": a green "Deaths" alone would read backwards.
    // SURVIVAL's sign says which way is good (deaths: fewer; damage per life: more).
    const label = (x) => {
      const name = METRICS[x.metric]?.label ?? x.metric;
      if (!x.surv) return esc(name);
      const high = (x.score >= 50) === (SURVIVAL[x.metric] > 0);
      return `${high ? "High" : "Low"} ${esc(name.toLowerCase())}`;
    };
    const line = (r, k) => {
      const p = m.players.find((q) => playerKey(q) === r.key);
      if (!p) return "";
      const parts = r.roles[0] ? [...r.roles[0].stats, ...r.roles[0].survival.map((x) => ({ ...x, surv: true }))] : [];
      const up = parts.filter((x) => lean(x) > 1.5).sort((a, b) => lean(b) - lean(a)).slice(0, 2);
      const down = parts.filter((x) => lean(x) < -1.5).sort((a, b) => lean(a) - lean(b)).slice(0, 1);
      const tier = season.get(r.key), diff = tier ? r.rating - tier.rating : null;
      return `<li class="s-${p.team}${p === mvp ? " mvp" : ""}" style="--i:${k}">
        <span class="rt-n">${k + 1}</span>${portrait(p.hero)}
        <span class="rt-who"><b>${playerLink(src, p)}</b><small>${esc(p.hero)} · ${esc(nameOf(p.team))}${p.position ? ` · pos ${p.position}` : ""}</small></span>
        <span class="rt-why">${up.map((x) => `<em class="up">${label(x)}</em>`).join("")}${down.map((x) => `<em class="down">${label(x)}</em>`).join("")}</span>
        <span class="rt-season">${tier ? `<span class="rt-tier t-${tier.tier}">${tier.tier}</span> ${tier.rating}<small>${diff >= 0 ? "+" : "−"}${Math.abs(diff)} vs season</small>` : `<small>no season rating</small>`}</span>
        <span class="rt-r t-${r.tier}"><b>${r.rating}</b><small>${r.tier}</small></span>
      </li>`;
    };
    ratingsHtml = `<p class="table-note keep wm-intro">Game ratings${info("game_rating")}</p>
      <ol class="gm-ratings reveal">${rated.map(line).join("")}</ol>`;
  }

  // Graphs tab (second, after Scoreboard): the gold lead with items and teamfights, or toggle to every
  // player's net worth or gold earned (net worth by default; games synced before networth_t
  // was kept only have gold earned). Both choices are remembered.
  let heroHtml = "", worthChart = null;
  if (hasTimeline(m)) {
    const winner = nameOf(m.winner), loser = nameOf(s.loser);
    const story = s.thrown >= BIG_LEAD
      ? `<b>${esc(loser)}</b> led by ${kg(s.thrown)} at ${s.thrown_minute}' and lost: a comeback for ${esc(winner)}.`
      : s.thrown >= 1000 ? `${esc(loser)}'s best was a ${kg(s.thrown)} lead at ${s.thrown_minute}'.` : `${esc(winner)} led wire to wire.`;
    const hasNw = m.players.some((p) => Array.isArray(p.networth_t));
    let series = "nw";
    try { if (localStorage.getItem("gameWorth") === "gold") series = "gold"; } catch {}
    if (!hasNw) series = "gold";
    worthChart = (kind) => {
      const f = kind === "nw" ? "networth_t" : "gold_t";
      const rank = (t) => teamOf(t).filter((p) => Array.isArray(p[f])).sort((a, b) => b[f][b[f].length - 1] - a[f][a[f].length - 1]);
      const lines = ["a", "b"].flatMap((t) => rank(t).map((p, i) => ({
        label: `${p.name} (${p.hero})`, end: p.name, img: heroImg(p.hero), values: p[f], cls: `s-c${i + 1}`, dash: t === "b",
      })));
      return lines.length ? lineChart(lines, { endLabels: true, height: 300,
        caption: `${kind === "nw" ? "Net worth (gold held plus items) at each minute" : "Gold earned by each minute, before spending"}. Solid: ${esc(m.team_a)} · dashed: ${esc(m.team_b)}; richest first within each team. Hover for everyone at that minute.` }) : "";
    };
    const worthHtml = worthChart(series) && `${hasNw ? `<div class="segs gm-worth-segs" role="group" aria-label="Series">${[["nw", "Net worth"], ["gold", "Gold earned"]]
      .map(([k, label]) => `<button type="button" class="seg${k === series ? " on" : ""}" data-worth="${k}" aria-pressed="${k === series}">${label}</button>`).join("")}</div>` : ""}
      <div class="gm-worth">${worthChart(series)}</div>`;
    // Layers on the items & fights chart (items, hero deaths, Roshan/Tormentor, towers),
    // each a checkbox; what's hidden is remembered.
    // First visit: items, fights, Roshan/Tormentor and first blood; the busier layers wait for a tick.
    let show = { xp: false, deaths: false, towers: false, buybacks: false };
    try { show = { ...show, ...(JSON.parse(localStorage.getItem("gameLayers") ?? "{}") ?? {}) }; } catch {}
    // About 1.2 screen pixels per chart unit, so the icons don't blow up on a wide screen.
    const chartWidth = () => Math.min(1800, (app.clientWidth - 30) / 1.2);
    const fightsChart = (layers) => itemLeadHtml(m, { id: `item-lead-${m.id}`, show: layers, width: chartWidth() });
    const hasFights = !!fightsChart({});
    const views = [
      ["fights", "Items & fights", "items_fights", fightsChart(show) || leadChart(m.gold_adv, { xp: m.xp_adv, nameA: m.team_a, nameB: m.team_b, id: `lead-${m.id}`, objectives: m.objectives })],
      ["worth", "Gold by player", "gold_players", worthHtml],
      ["vision", "Vision", "vision_chart", visionChart(m)],
    ].filter(([, , , html]) => html);
    let want = null;
    try { want = localStorage.getItem("gameChart"); } catch {}
    const on = views.some(([id]) => id === want) ? want : views[0][0];
    heroHtml = `<section class="gm-hero-chart">
      <div class="gm-hc-head">
        <div class="segs gm-hc-segs" role="group" aria-label="Chart">${views.map(([id, label]) => `<button type="button" class="seg${id === on ? " on" : ""}" data-chart-view="${id}" aria-pressed="${id === on}">${label}</button>`).join("")}</div>
        ${hasFights ? `<fieldset class="gm-hc-layers"${on === "fights" ? "" : " hidden"}><legend>Show</legend>${LAYERS.map(([k, label]) =>
          `<label><input type="checkbox" data-layer="${k}" ${show[k] === false ? "" : "checked"}> ${label}</label>`).join("")}</fieldset>` : ""}
        <p class="swing-story">${story} Lead changed hands ${s.lead_changes} time${s.lead_changes === 1 ? "" : "s"}${s.at10 != null ? ` · at 10': ${esc(nameOf(s.at10 >= 0 ? "a" : "b"))} +${kg(Math.abs(s.at10))}` : ""}${s.at20 != null ? ` · at 20': ${esc(nameOf(s.at20 >= 0 ? "a" : "b"))} +${kg(Math.abs(s.at20))}` : ""}.</p>
      </div>
      ${views.map(([id, , tip, html]) => `<div class="gm-hc-view" data-view="${id}"${id === on ? "" : " hidden"}>${html}</div>`).join("")}
    </section>`;
  }

  // Map tab: wards, towers, deaths, smokes.
  const deaths = deathMapHtml(m);
  const laneCuts_ = src.ad2l && !m.unticketed ? await laneCutsOf(src) : null;
  const mapHtml = mapCard([
    ["wards", "Wards", "match_wards", m.players.some((p) => p.obs_pos) ? wardMapHtml([
      { label: m.team_a, cls: "s-a", wards: teamOf("a").flatMap((p) => wardsOf(p)) },
      { label: m.team_b, cls: "s-b", wards: teamOf("b").flatMap((p) => wardsOf(p)) },
    ], { id: "match-wards" }) : ""],
    ["vision", "Vision", "vision_map", visionMapHtml(m, { id: "match-vision" })],
    ["towers", "Towers", "tower_map", m.buildings?.length ? towerMapHtml(m, { id: "match-towers" }) : ""],
    ["deaths", "Deaths", "fight_deaths", deaths],
    ["smokes", "Smokes", "smoke_map", smokeMapHtml(m, { id: "match-smokes" })],
  ], { layers: mapLayerData(m) });

  const footer = m.unticketed
    ? `Unticketed AD2L game, uploaded ${when(m.createdAt)} from post-game screenshots, so no draft, gold graph or ward data.
       Wrong? ${mine ? "You can edit or delete it below." : "Anyone with the league password can edit or remove it below."}`
    : ad2l
    ? `Played ${when(m.createdAt)} · AD2L ${SEASON.name} ticketed game ${m.match_id} ·
       <a href="https://www.opendota.com/matches/${m.match_id}" target="_blank" rel="noopener">OpenDota</a> ·
       <a href="https://www.dotabuff.com/matches/${m.match_id}" target="_blank" rel="noopener">Dotabuff</a>`
    : `Uploaded ${when(m.createdAt)}. Wrong? ${mine ? "You can edit or delete it below." : "Anyone with the league password can edit or remove it below."}`;

  const lanesHtml = gameLanesHtml(m, src, laneCuts_);
  const tabs = playerTabs([
    ["board", "Scoreboard", scoreHtml],
    ["graphs", "Graphs", heroHtml],
    // The draft model's read of this draft: filled when the tab first opens (parts/cmdraft.js).
    ["draft", "Draft", ad2l && !m.unticketed && m.draft?.some((s) => s.pick) && m.players?.length === 10 ? `<div id="cm-box" data-game="${esc(m.id)}"><div class="panel empty">Reading the draft…</div></div>` : ""],
    ["ratings", "Ratings", ratingsHtml],
    ["lanes", "Laning", (lanesHtml && `${fb ? `<p class="table-note keep wm-intro lane-fb-note"><span class="fb-tag">FB</span> First blood at <b>${clock(fb.t)}</b>: ${playerLink(src, fbP)} (${esc(fbP.hero)})${fb.victim != null ? ` killed ${playerLink(src, m.players[fb.victim])} (${esc(m.players[fb.victim].hero)})` : ""}${fb.t < 0 ? ", before the horn" : ""}.</p>` : ""}${lanesHtml}`) + laneEffTableHtml(m, src, !!lanesHtml)],
    ["resources", "Resources", resourcesTableHtml(m, src)],
    ["combat", "Combat", gameCombatHtml(m, src) + survivalTableHtml(m, src)],
    ["items", "Items", gameItemsHtml(m, src) && `${gameItemsHtml(m, src)}<div id="bo-box" data-game="${esc(m.id)}"></div>`],
    ["map", "Map", mapTableHtml(m, src) + mapHtml],
  ], { store: "gameTab", label: "Game sections" });

  app.innerHTML = `
    <div class="kicker gm-back">${crumbs(src, ["Content", src.base], `${m.team_a} vs ${m.team_b}`)}${ad2l && !m.unticketed ? `<span class="gm-ext"><a href="https://www.opendota.com/matches/${m.match_id}" target="_blank" rel="noopener">OpenDota</a><a href="https://www.dotabuff.com/matches/${m.match_id}" target="_blank" rel="noopener">Dotabuff</a></span>` : ""}</div>
    <h1 class="sr-only">${esc(m.team_a)} vs ${esc(m.team_b)}</h1>
    <section class="banner compact">
      ${plate("a")}${plate("b")}
      <div class="banner-meta">${esc(m.game_mode || "Match")} · <b>${dur(m.duration_sec)}</b>${m.createdAt ? ` · ${shortDate(m.createdAt)}` : ""}${tagsHtml(gameTags(m, all.length ? tagContext(all) : null))}</div>
    </section>
    ${seriesHtml}
    ${CASTS_BOX}
    ${factsHtml}
    ${m.draft?.length ? `<div class="gm-draft"><h3 class="gm-h3">Draft</h3>${draftStrip(m, src)}</div>` : ""}
    ${tabs.bar.replace('class="pp-tabs"', 'class="pp-tabs gm-tabs"')}
    ${tabs.panels}
    <p class="table-note">${footer}</p>${deleteBtn}`;
  wireDelete();
  wireCasts(m.id, src.key);
  wirePlayerTabs();
  wireCharts(app);
  app.querySelectorAll("[data-chart-view]").forEach((b) => (b.onclick = () => {
    for (const x of app.querySelectorAll("[data-chart-view]")) { const on = x === b; x.classList.toggle("on", on); x.setAttribute("aria-pressed", String(on)); }
    for (const v of app.querySelectorAll(".gm-hc-view")) v.hidden = v.dataset.view !== b.dataset.chartView;
    const box = app.querySelector(".gm-hc-layers");
    if (box) box.hidden = b.dataset.chartView !== "fights";
    try { localStorage.setItem("gameChart", b.dataset.chartView); } catch {}
  }));
  // Net worth / gold earned on the by-player chart.
  app.querySelectorAll("[data-worth]").forEach((b) => (b.onclick = () => {
    for (const x of app.querySelectorAll("[data-worth]")) { const on = x === b; x.classList.toggle("on", on); x.setAttribute("aria-pressed", String(on)); }
    const box = app.querySelector(".gm-worth");
    box.innerHTML = worthChart(b.dataset.worth);
    wireCharts(box);
    try { localStorage.setItem("gameWorth", b.dataset.worth); } catch {}
  }));
  // Layer checkboxes: redraw the items & fights chart with just what's ticked.
  const layerBox = app.querySelector(".gm-hc-layers");
  if (layerBox) layerBox.onchange = () => {
    const layers = Object.fromEntries([...layerBox.querySelectorAll("[data-layer]")].map((c) => [c.dataset.layer, c.checked]));
    const view = app.querySelector('.gm-hc-view[data-view="fights"]');
    view.innerHTML = itemLeadHtml(m, { id: `item-lead-${m.id}`, show: layers, width: Math.min(1800, (app.clientWidth - 30) / 1.2) });
    wireCharts(view);
    try { localStorage.setItem("gameLayers", JSON.stringify(layers)); } catch {}
  };
  wireMapCards(app);
  wireWardMaps(app);
  wireVisionMaps(app);
  wireMapLayers(app);
  wireTowerMaps(app);
  wireDeathMaps(app);
  wireSmokeMaps(app);
  wireStreakCharts(app);
  // Draft tab: load the model and the division's draft file the first time the tab is shown.
  const cmBox = app.querySelector("#cm-box");
  if (cmBox) {
    const panel = cmBox.closest(".pp-panel");
    const fill = () => {
      if (cmBox.dataset.filled) return;
      cmBox.dataset.filled = "1";
      import("../parts/cmdraft.js").then(async (cm) => [cm, await cm.draftData(src.key)]).then(([cm, data]) => {
        if (document.getElementById("cm-box") !== cmBox) return;
        cmBox.innerHTML = data ? cm.gameDraftHtml(m, src, data, cmBox.clientWidth) : `<p class="muted">Draft analysis isn't available for this division yet.</p>`;
        wireCharts(cmBox);
      }).catch((e) => { cmBox.innerHTML = errorBox(e); });
    };
    if (!panel.hidden) fill();
    else new MutationObserver((_, obs) => { if (!panel.hidden) { obs.disconnect(); fill(); } }).observe(panel, { attributes: true, attributeFilter: ["hidden"] });
  }
  // Build order from the division's detail file, once it loads (still this game's page?).
  if (ad2l && !m.unticketed && app.querySelector("#bo-box")) detailsFor(src).then((det) => {
    const box = document.getElementById("bo-box");
    const html = det[m.match_id] ? buildOrderHtml(m, det[m.match_id], { playerCell: (p) => `${portrait(p.hero)} ${playerLink(src, p)}` }) : "";
    if (box?.dataset.game === m.id && html) box.innerHTML = `<h3 class="gm-h3">Build order</h3>${html}`;
  });
}

// Casts: links to a cast of the game (YouTube, Twitch, …) with the caster's name. Anyone can
// add one; whoever added it (same browser) can remove it, anyone else needs the league
// password. Loaded after the page so a slow read doesn't hold it up.
const CASTS_BOX = `<section class="gm-casts" id="gm-casts" aria-label="Casts" hidden></section>`;
const castSite = (url) => {
  const host = new URL(url).hostname.replace(/^www\.|^m\./, "");
  return { "youtube.com": "YouTube", "youtu.be": "YouTube", "twitch.tv": "Twitch", "kick.com": "Kick" }[host] ?? host;
};
// What was typed → an https URL the rules accept, or null.
function castUrl(raw) {
  let s = raw.trim();
  if (!s) return null;
  if (!/^[a-z]+:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (u.protocol === "http:") u.protocol = "https:";
    if (u.protocol !== "https:" || !u.hostname.includes(".")) return null;
    return u.href.length <= 300 ? u.href : null;
  } catch { return null; }
}
async function wireCasts(game, league) {
  const box = document.getElementById("gm-casts");
  if (!box) return;
  let list, uid;
  try { [list, uid] = await Promise.all([listCasts(game, league), currentUid()]); }
  catch { return; } // no casts box rather than an error on the game page
  if (!box.isConnected) return;
  let name = "";
  try { name = localStorage.getItem("castName") ?? ""; } catch {}
  const full = list.length >= MAX_CASTS;
  box.hidden = false;
  box.innerHTML = `<span class="gm-series-k">Casts</span>
    ${list.map((c) => `<span class="gm-cast"><a href="${esc(c.url)}" target="_blank" rel="noopener nofollow ugc">
        <small>${esc(castSite(c.url))}</small>${esc(c.caster)}</a><button type="button" class="gm-cast-x" data-cast="${esc(c.id)}" data-mine="${c.uid === uid ? 1 : ""}" title="Remove this cast" aria-label="Remove ${esc(c.caster)}'s cast">×</button></span>`).join("")}
    ${full ? "" : `<details class="gm-cast-add"><summary>${list.length ? "+ Add a cast" : "No casts yet · + add one"}</summary>
      <form class="row" id="cast-form">
        <input name="url" type="text" inputmode="url" placeholder="Link (YouTube, Twitch…)" maxlength="300" required autocomplete="off">
        <input name="caster" type="text" placeholder="Caster name(s)" maxlength="40" required value="${esc(name)}">
        <button type="submit">Add</button><span class="muted" id="cast-msg" role="status"></span></form></details>`}`;
  const msg = (t) => { const el = document.getElementById("cast-msg"); if (el) el.textContent = t; };
  const form = document.getElementById("cast-form");
  if (form) form.onsubmit = async (e) => {
    e.preventDefault();
    const url = castUrl(form.url.value), caster = form.caster.value.trim();
    if (!url) return msg("That doesn't look like a link.");
    if (!caster) return msg("Add the caster's name.");
    if (list.some((c) => c.url === url)) return msg("That cast is already here.");
    try { localStorage.setItem("castName", caster); } catch {}
    form.querySelector("button").disabled = true;
    msg("Saving…");
    try { await addCast(game, league, { url, caster }); wireCasts(game, league); }
    catch (err) { form.querySelector("button").disabled = false; msg(`Couldn't save it: ${err.message}`); }
  };
  box.querySelectorAll("[data-cast]").forEach((b) => (b.onclick = async () => {
    const c = list.find((x) => x.id === b.dataset.cast);
    if (!b.dataset.mine && !editUnlocked()) {
      const pw = window.prompt("Only whoever added this cast can remove it. League password:");
      if (pw == null) return;
      if (!unlockEdit(pw)) return window.alert("Wrong password.");
    }
    if (!window.confirm(`Remove ${c.caster}'s cast (${castSite(c.url)}) for everyone?`)) return;
    b.disabled = true;
    try { await deleteCast(c.id); wireCasts(game, league); }
    catch (err) { b.disabled = false; window.alert(`Couldn't remove it: ${err.message}`); }
  }));
}

// Game page: each team's observer vision at each minute, % of the map outside its own base
// (worked out on the real map at sync time, scripts/sync/vision.js). "" for games without it.
function visionChart(m) {
  if (!m.vision) return "";
  const top = Math.max(...m.vision.a, ...m.vision.b);
  const avg = (t) => m.players.filter((p) => p.team === t).reduce((s, p) => s + (p.new_vision ?? 0), 0);
  return lineChart([
    { label: m.team_a, values: m.vision.a, cls: "s-a" },
    { label: m.team_b, values: m.vision.b, cls: "s-b" },
  ], { id: `vision-${m.id}`, step: top > 12 ? 5 : top > 6 ? 2 : 1, dp: 1, unit: "%",
    caption: `Share of the map outside its own base that each team's observer wards showed, by minute. Trees, cliffs and high ground block sight. Game average: ${esc(m.team_a)} ${avg("a").toFixed(1)}%, ${esc(m.team_b)} ${avg("b").toFixed(1)}%. Hover for values.` });
}

// Per-player replay numbers (parsed replays only), one table per tab: Resources (farm), Map
// (vision and objectives), Combat (stuns, damage taken, time dead) and Laning (lane efficiency,
// XP at 10'). cols: [key, label, format?, lower is better?]; a column shows when every player has
// it. totals: a team total row under each side.
const statOf = (p, k) => (k === "dewards" ? (p.obs_killed == null ? null : p.obs_killed + p.sen_killed) : p[k]);
function playerStatTable(m, src, cols, { title, tip = null, totals = false, above = "" } = {}) {
  cols = cols.filter(([k]) => m.players.every((p) => statOf(p, k) != null));
  if (!cols.length) return "";
  const show = (v, f) => (f ?? String)(v);
  const best = Object.fromEntries(cols.map(([k, , , low]) => [k, (low ? Math.min : Math.max)(...m.players.map((p) => statOf(p, k)))]));
  const row = (p) => `<tr class="team-${p.team}"><td class="l">${playerLink(src, p)}</td><td class="l">${heroLink(src, p.hero)}</td>
    ${cols.map(([k, , f, low]) => `<td class="${statOf(p, k) === best[k] && (low || best[k] > 0) ? "best" : ""}">${show(statOf(p, k), f)}</td>`).join("")}</tr>`;
  const total = (t) => (totals ? `<tr class="total team-${t}"><td class="l" colspan="2">Team total</td>${cols.map(([k, , f]) => `<td>${show(m.players.filter((p) => p.team === t).reduce((a, p) => a + statOf(p, k), 0), f)}</td>`).join("")}</tr>` : "");
  const head = `<th scope="col" class="l">Player</th><th scope="col" class="l">Hero</th>${cols.map(([k, l]) => `<th scope="col">${l}${info(k)}</th>`).join("")}`;
  const side = (t) => `<tr class="sep ${t}"><td colspan="${cols.length + 2}">${t === "a" ? teamLink(src, m.team_a, m.team_a_id) : teamLink(src, m.team_b, m.team_b_id)}</td></tr>${t === "b" ? `<tr class="head-repeat">${head}</tr>` : ""}${m.players.filter((p) => p.team === t).map(row).join("")}${total(t)}`;
  return `<h2>${title}${tip ? info(tip) : ""}</h2>${above}
    <div class="table-wrap"><table>
      <thead><tr>${head}</tr></thead>
      <tbody>${side("a")}${side("b")}</tbody></table></div>
`;
}
// Resources tab: farm (gold and XP sources to come).
const resourcesTableHtml = (m, src) => playerStatTable(m, src,
  [["lane_kills", "Lane creeps"], ["neutral_kills", "Neutrals"], ["ancient_kills", "Ancients"], ["camps_stacked", "Stacks"]],
  { title: "Farm", totals: true });
// Map tab, on top: vision, smokes, objectives and building damage, under the Roshan/Tormentor
// timeline. New vision is a share of the map with decimals; the rest are counts.
function mapTableHtml(m, src) {
  const objs = (m.objectives ?? []).filter((o) => o.type === "roshan" || o.type === "tormentor").sort((a, b) => a.time - b.time);
  return playerStatTable(m, src, [["obs_placed", "Obs"], ["new_vision", "New vision", (v) => `${v.toFixed(1)}%`], ["sen_placed", "Sentries"],
    ["dewards", "Dewards"], ["smoke_used", "Smokes"], ["dust_used", "Dust"], ["roshan_kills", "Roshan"], ["tormentor_kills", "Tormentor"],
    ["tower_damage", "Building dmg", fmt]], { title: "Vision &amp; objectives", tip: "map_objectives", totals: true,
    above: objs.length ? `<div class="obj-strip">${objs.map((o) => `<span class="obj-chip s-${o.side}"><b>${o.type === "roshan" ? "Roshan" : "Tormentor"}</b> ${clock(o.time)} · ${esc(o.side === "a" ? m.team_a : m.team_b)}</span>`).join("")}</div>` : "" });
}
// Combat tab, at the bottom: control and survival.
const survivalTableHtml = (m, src) => playerStatTable(m, src,
  [["stuns", "Stuns", (v) => `${v.toFixed(1)}s`], ["dmg_taken", "Dmg taken", fmt], ["time_dead", "Time dead", dur, true]],
  { title: "Stuns, damage taken, time dead" });
// Laning tab, at the bottom. The lane table above already has lane efficiency when it shows.
const laneEffTableHtml = (m, src, lanes) => playerStatTable(m, src, [...(lanes ? [] : [["lane_eff", "Lane eff.", (v) => `${v}%`]]), ["xp10", "XP @10'", fmt]],
  { title: lanes ? "XP at 10 minutes" : "Lane efficiency" });
