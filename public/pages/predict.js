// Predictions: AD2L series calls and the scrim schedule. Loaded on demand.
import { listTeams } from "../lib/teams.js";
import { nameKey } from "../lib/players.js";
import { tune, backtest, fitRatings, isPlayed, draftRead, predictDraft, seriesOdds, modelCall, postOdds, postCall, crowd, standings, validPicks, favourite, outcomeOf, pickHistory, nightScores, TIE_EDGE } from "../lib/predict.js";
import { isPostseason, playoffs } from "../lib/divisions.js";
import { postseason, bracketPoints } from "../lib/playoffs.js";
import { listPredictions, listBrackets, saveBracket, currentUid, savePrediction, listFixtures, addFixture, moveFixture, deleteFixture } from "../lib/store.js";
import { settle, asSeries, scrimRatings, fixtureBacktest, fixtureOdds, fixtureCall, fixtureScores, outcomes, outcomeLabel } from "../lib/fixtures.js";
import { info } from "../lib/glossary.js";
import { esc, app, pageHead, portrait, teamLink, playerLink, pct, SOURCES, DIVISIONS, allMatches, editUnlocked, when, unlockEdit, playerTabs, wirePlayerTabs } from "../core.js";
import { loading, errorBox } from "../parts/lanes.js";
import { lastNight, sinceLabel } from "../parts/ranks.js";
import { draftHtml, upload } from "./upload.js";
import { mountPlayoffs } from "../parts/playoffs.js";
import { pageTabs, PREDICT_TABS } from "../lib/pagetabs.js";

// ---------- Predictions (AD2L) ----------

const NAME_KEY = "predict-name";
const storedName = () => { try { return localStorage.getItem(NAME_KEY) ?? ""; } catch { return ""; } };
const storeName = (n) => { try { localStorage.setItem(NAME_KEY, n); } catch { /* private window: name just isn't remembered */ } };
const OUTCOMES = ["home", "tie", "away"];
// "Picking as <name>" bar shared by both leagues' prediction pages.
const nameBarHtml = (name) => `
    <div class="pred-name">
      <div class="pred-name-show"${name ? "" : " hidden"}>Picking as <b>${esc(name)}</b> <button type="button" class="linkish" id="pred-name-edit">Change</button></div>
      <div class="pred-name-form"${name ? " hidden" : ""}>
        <label>Your name <input id="pred-name" maxlength="24" value="${esc(name)}" placeholder="Type your name" autocomplete="nickname"></label>
        <button class="primary" id="pred-name-save" type="button">Save</button>
      </div>
    </div>`;
function wireNameBar(rerender) {
  const input = document.getElementById("pred-name");
  document.getElementById("pred-name-edit").onclick = () => {
    app.querySelector(".pred-name-show").hidden = true;
    app.querySelector(".pred-name-form").hidden = false;
    input.focus();
  };
  document.getElementById("pred-name-save").onclick = () => {
    const n = input.value.trim().slice(0, 24);
    if (!n) { input.focus(); return; }
    storeName(n);
    rerender();
  };
  input.onkeydown = (e) => { if (e.key === "Enter") document.getElementById("pred-name-save").click(); };
  return input;
}

export async function renderPredict(src) {
  const kicker = src.kicker;
  app.innerHTML = loading(kicker, "Predictions");
  let d, preds;
  try { d = await src.data(); } catch (e) { app.innerHTML = `${pageHead(kicker, "Predictions")}${errorBox(e)}`; return; }
  // Each division's picks carry its league key ("ad2l" = Champion).
  try { preds = (await listPredictions()).filter((p) => p.league === src.key); } catch (e) { console.warn(e); preds = null; }
  // Saved brackets (tiebreaker and bracket picks), newest per name, for the Leaderboard.
  const savedBrackets = new Map(), savedAt = new Map(), savedName = new Map();
  try {
    for (const b of (await listBrackets()).filter((x) => x.league === src.key).sort((a, b) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0))) {
      let picks; try { picks = JSON.parse(b.picks); } catch { continue; }
      if (picks && typeof picks === "object" && !Array.isArray(picks)) {
        savedBrackets.set(nameKey(b.name), Object.fromEntries(Object.entries(picks).filter(([, v]) => Number.isInteger(v))));
        savedAt.set(nameKey(b.name), b.updatedAt);
        savedName.set(nameKey(b.name), b.name);
      }
    }
  } catch (e) { console.warn(e); }
  const uid = await currentUid();
  const name = storedName();
  const teamName = Object.fromEntries(d.teams.map((t) => [t.id, t.name]));
  const params = tune(d.teams, d.series);
  const bt = backtest(d.teams, d.series, params);
  const ratings = fitRatings(d.teams, d.series, params);
  const since = lastNight(d);
  const now = Date.now();
  // The playoff picture works on the whole league: Heroic's A and B views hold one division each,
  // but its brackets mix both (ratings fitted to it, as on Combined). Postseason series
  // (lib/divisions.js) are best-of with no tie: their round, the bracket lock and the bracket
  // matches decided so far come from lib/playoffs.js postseason.
  const full = src.view ? await SOURCES[src.key].data() : d;
  const fullRatings = full === d ? ratings : fitRatings(full.teams, full.series, tune(full.teams, full.series));
  const split = !!DIVISIONS[src.key]?.views;
  const ps = postseason(full.teams, full.series, fullRatings, { split });
  const bracketLocked = ps.lock != null && now >= ps.lock * 1000;
  const roleOf = (s) => ps.roles.get(s.id) ?? { label: "Playoffs", bestOf: 3 };

  // This week's slate: the earliest night still to be played. A series whose result never
  // came (a 0–0 between teams that dropped out) stops counting 3 days after its start, so
  // it can't hold the page on a dead week; a forfeit against the bye-week placeholder isn't
  // a match to call.
  const bye = new Set(d.teams.filter((t) => /\bbye week\b/i.test(t.name)).map((t) => t.id));
  const upcoming = d.series.filter((s) => !isPlayed(s) && s.time && s.time * 1000 > now - 3 * 86400e3 && !bye.has(s.home) && !bye.has(s.away));
  const night = upcoming.length ? Math.min(...upcoming.map((s) => s.time)) : null;
  const week = upcoming.filter((s) => s.time === night);
  const mine = (sid) => (preds ?? []).filter((p) => p.series_id === sid && p.uid === uid).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
  const label = (s, o) => (isPostseason(s) ? `${esc(teamName[o === "home" ? s.home : s.away])} wins` : o === "tie" ? "1–1" : `${esc(teamName[o === "home" ? s.home : s.away])} 2–0`);

  // The model's full draft for a series, in Captains Mode order, for either team on first
  // pick (not known ahead of time); a toggle switches between the two.
  const PHASE_ROWS = [["ban", 1, "Ban phase 1"], ["pick", 1, "First picks"], ["ban", 2, "Ban phase 2"], ["pick", 2, "Picks"], ["ban", 3, "Ban phase 3"], ["pick", 3, "Last picks"]];
  // Laid out by side: home team's steps on the left, away team's on the right. Heroes show
  // as portraits (name on hover); picks carry the player expected to play them.
  const draftHtml = (steps, home, away) => `<div class="pd-row pd-sides"><div></div>
      <div class="pd-side a">${esc(home.name)}</div><div class="pd-side b">${esc(away.name)}</div></div>` +
    PHASE_ROWS.map(([kind, phase, title]) => {
      const row = steps.filter((x) => x.kind === kind && x.phase === phase);
      const side = (id, cls) => `<div class="pd-steps">${row.filter((x) => x.team.id === id).map((x) => `
        <div class="pd-step ${cls} ${kind}" title="${x.n}. ${esc(x.team.name)} ${kind === "ban" ? "ban" : "pick"}${x.hero ? ` ${esc(x.hero)}` : ""} — ${esc(x.why)}">
          <span class="pd-n">${x.n}</span>${x.hero ? portrait(x.hero) : '<span class="pd-hero">?</span>'}${x.player ? `<span class="pd-player">${esc(x.player.name)}</span>` : ""}
        </div>`).join("")}</div>`;
      return `<div class="pd-row ${kind}"><div class="pd-title">${title}</div>${side(home.id, "a")}${side(away.id, "b")}</div>`;
    }).join("");

  const read = (s) => {
    const home = d.teams.find((t) => t.id === s.home), away = d.teams.find((t) => t.id === s.away);
    if (!home || !away) return "";
    const pools = (us, them) => {
      const r = draftRead(d, us, them, since);
      return `<div class="dr-col"><h4>${teamLink(src, us.name, us.id)}</h4>
        ${r.picks.map((p) => `<div class="dr-player"><div class="dr-name">${playerLink(src, { name: p.player.name, account_id: p.player.account_id, key: String(p.player.account_id) })}
            <span class="muted">${p.pub ? `${p.pub.games} pubs since ${sinceLabel(d)} · ${p.pub.wins}–${p.pub.games - p.pub.wins}` : "no recent pubs"}</span></div>
          <div class="dr-heroes">${p.heroes.map((h) => `<span class="dr-chip" title="${h.league} league games, ${h.pub} recent pubs${h.ban_risk >= 0.2 ? ` · ${Math.round(h.ban_risk * 100)}% ban risk` : ""}">${portrait(h.hero)}${esc(h.hero)} <b>${Math.round(h.chance * 100)}%</b></span>`).join("") || '<span class="muted">—</span>'}</div></div>`).join("")}
      </div>`;
    };
    // Game 2 follows on from the model's game 1 (same first pick), assuming the favourite
    // took game 1: their heroes draw bans and repeats get less likely.
    const fav = oddsOf(s).game >= 0.5 ? home : away;
    const drafts = [];
    for (const [fp, x, y] of [["home", home, away], ["away", away, home]]) {
      const g1 = predictDraft(d, x, y, since);
      drafts.push([`${fp}-1`, g1], [`${fp}-2`, predictDraft(d, x, y, since, undefined, { steps: g1, winner: fav.id })]);
    }
    // One expander, two drafts, one First pick toggle for both: the draft model's best draft
    // with its odds (filled by the cmdraft wiring below), then the habit-based likely draft.
    return `<details class="dr"><summary>Model's draft${info("model_draft")}</summary>
      <div class="pd-toggles">
        <div class="pd-toggle" role="group" aria-label="First pick">
          <span class="pd-lbl">First pick</span>
          <button type="button" data-fp="home" aria-pressed="true">${esc(home.name)}</button>
          <button type="button" data-fp="away" aria-pressed="false">${esc(away.name)}</button>
        </div>
      </div>
      <div class="pcm-sec">
        <div class="dr-sub">Best draft, and the odds after it</div>
        <div class="pcm-body"><div class="panel empty">Building the draft…</div></div>
        <p class="table-note">Both teams drafted by Sybil's draft model, taking the Drafter's top suggestion each step. Each pick is the best hero for a player without one, at the open position they play most. Each ban is the hero worth most to the other team at a position it still needs. The first-pick team is Radiant. "Before the draft" rates the ten players alone; "after" adds these heroes. The series odds above don't use this.</p>
      </div>
      <div class="dr-sub">Likely draft, from each team's habits</div>
      <div class="pd-toggles">
        <div class="pd-toggle" role="group" aria-label="Game">
          <span class="pd-lbl">Game</span>
          <button type="button" data-g="1" aria-pressed="true">G1</button>
          <button type="button" data-g="2" aria-pressed="false">G2</button>
        </div>
      </div>
      <p class="table-note keep pd-g2note" hidden>Game 2 assumes ${esc(fav.name)}, the favourite, won game 1 with this game 1 draft.</p>
      ${drafts.map(([k, st], i) => `<div class="pd" data-for="${k}"${i ? " hidden" : ""}>${draftHtml(st, home, away)}</div>`).join("")}
      <p class="table-note">All 24 steps in S48 Captains Mode order: the first-pick team bans 3, 2 and 2 across the phases, the other team 4, 1 and 2. Bans weigh how often and how recently the team bans each hero in that phase, what the opponent's remaining players have been playing (recent league games most, plus pubs since ${sinceLabel(d)}), and the division's usual bans.</p>
      <div class="dr-sub">Player pools${info("player_pools")}</div>
      <div class="dr-cols">${pools(home, away)}${pools(away, home)}</div></details>`;
  };

  // One card per series: three pick buttons, each carrying the model's odds and how many
  // people took it; the model's call is tagged on its button.
  const oddsOf = (s) => (isPostseason(s) ? postOdds(ratings.get(s.home) ?? 0, ratings.get(s.away) ?? 0, roleOf(s).bestOf) : seriesOdds(ratings.get(s.home) ?? 0, ratings.get(s.away) ?? 0));
  const callOf = (s) => (isPostseason(s) ? postCall(oddsOf(s)) : modelCall(oddsOf(s)));
  const card = (s) => {
    const o = oddsOf(s), call = callOf(s), post = isPostseason(s);
    const locked = now >= s.time * 1000;
    const my = mine(s.id);
    const c = preds ? crowd(preds, s) : null;
    return `<article class="pred-card" data-sid="${s.id}">
      <div class="pred-head">
        <div class="pred-teams"><span class="a">${teamLink(src, teamName[s.home], s.home)}</span><i>vs</i><span class="b">${teamLink(src, teamName[s.away], s.away)}</span></div>
        ${locked ? '<span class="pred-lock">Locked</span>' : ""}
      </div>
      ${post ? `<div class="pred-round">${esc(roleOf(s).label)}${roleOf(s).bestOf > 1 ? ` · Bo${roleOf(s).bestOf}` : ""}</div>` : ""}
      <div class="pred-picks${post ? " two" : ""}" role="group" aria-label="Your pick">${(post ? ["home", "away"] : OUTCOMES).map((k) => {
        const n = c ? Math.round(c[k] * c.n) : 0;
        // The buttons sit under their team's name, so the score alone says whose win it is.
        return `<button type="button" class="${k}" data-pick="${k}" aria-pressed="${my?.pick === k}" aria-label="${label(s, k)}" title="${label(s, k)}" ${locked || !preds ? "disabled" : ""}>
          <span class="pk-main">${post ? "Wins" : k === "home" ? "2–0" : k === "away" ? "0–2" : "1–1"}</span>
          <span class="pk-sub">${Math.round(o[k] * 100)}%${c ? ` · ${n} pick${n === 1 ? "" : "s"}` : ""}${k === call ? ' · <b>model</b>' : ""}</span>
        </button>`;
      }).join("")}</div>
      <div class="pcm" data-home="${s.home}" data-away="${s.away}"></div>
      ${read(s)}
    </article>`;
  };

  const st = preds ? standings(preds, d.series, bt) : [];
  const playedNights = [...new Set(d.series.filter(isPlayed).map((s) => s.time))].sort((a, b) => b - a);
  const valid = preds ? validPicks(preds, d.series) : [];
  const myKey = nameKey(name);

  // Leaderboard: standings plus everyone's picks for the coming night, one column per
  // series. People with picks this week but nothing scored yet still get a row.
  const board = new Map(st.map((r) => [r.model ? "\u0000model" : nameKey(r.name), { ...r, now: {} }]));
  const unplayed = new Set(d.series.filter((s) => !isPlayed(s)).map((s) => s.id));
  for (const p of valid) {
    if (!unplayed.has(p.series_id)) continue;
    const k = nameKey(p.name);
    if (!board.has(k)) board.set(k, { name: p.name, points: 0, picks: 0, accuracy: null, now: {} });
    if (week.some((s) => s.id === p.series_id)) board.get(k).now[p.series_id] = p.pick;
  }
  if (week.length) {
    if (!board.has("\u0000model")) board.set("\u0000model", { name: "The model", model: true, points: 0, picks: 0, accuracy: null, now: {} });
    for (const s of week) board.get("\u0000model").now[s.id] = callOf(s);
  }
  // Bracket points (playoffs): 1 per decided bracket match whose winner the person picked, from a
  // bracket saved before the lock (the first bracket match). The board ranks series points plus
  // bracket points.
  const showBracket = ps.decided.length > 0;
  if (showBracket) for (const [k, picks] of savedBrackets) {
    const at = savedAt.get(k);
    if (!at || ps.lock == null || at.getTime() >= ps.lock * 1000) continue;
    if (!board.has(k)) board.set(k, { name: savedName.get(k), points: 0, picks: 0, accuracy: null, now: {} });
    board.get(k).bracket = bracketPoints(picks, ps.decided, ps.bracketTeams).points;
  }
  const total = (r) => r.points + (r.bracket ?? 0);
  // Change from last week: each row's score on the latest played night, and how their
  // accuracy moved against where it stood before that night (in points of %).
  const lastNightScore = new Map();
  if (playedNights.length) {
    for (const r of preds ? nightScores(preds, d.series, playedNights[0]) : []) lastNightScore.set(nameKey(r.name), r);
    const m = bt.filter((x) => x.s.time === playedNights[0]);
    if (m.length) lastNightScore.set(" model", { points: m.filter((x) => x.correct).length, picks: m.length });
  }
  const delta = (k, r) => {
    const l = lastNightScore.get(k);
    if (!l?.picks) return { pts: "", acc: "" };
    const before = r.picks - l.picks;
    const diff = before > 0 ? Math.round((r.points / r.picks - (r.points - l.points) / before) * 100) : null;
    return {
      pts: `<span class="pb-delta" title="Last week: ${l.points} right of ${l.picks}">+${l.points}<span class="muted">/${l.picks}</span></span>`,
      acc: diff == null ? `<span class="pb-delta muted" title="First week with picks">new</span>`
        : `<span class="pb-delta ${diff > 0 ? "up" : diff < 0 ? "down" : "muted"}" title="Change since last week, in points of %">${diff > 0 ? "▲" : diff < 0 ? "▼" : "±"}${Math.abs(diff)}%</span>`,
    };
  };
  const boardRows = [...board.entries()].sort(([, a], [, b]) => total(b) - total(a) || b.points - a.points || (b.accuracy ?? -1) - (a.accuracy ?? -1) || a.name.localeCompare(b.name));
  const pickChip = (s, k) => (k ? `<span class="pk-chip ${k}" title="${label(s, k)}">${label(s, k)}</span>` : '<span class="muted">—</span>');
  const boardHtml = boardRows.length ? `<div class="table-wrap sticky-name"><table class="pred-board">
    <thead><tr><th scope="col" class="rank">#</th><th scope="col" class="l">Name</th><th scope="col">Points${info("points")}</th><th scope="col">Correct${info("correct")}</th>${showBracket ? `<th scope="col">Bracket${info("bracket_pts")}</th><th scope="col">Total</th>` : ""}
      ${week.map((s) => `<th scope="col" class="l pb-series"><span class="a">${esc(teamName[s.home])}</span><span class="b">${esc(teamName[s.away])}</span></th>`).join("")}</tr></thead>
    <tbody>${boardRows.map(([k, r], i) => `<tr class="${k === myKey ? "me" : ""}">
      <td class="rank${i < 3 && r.picks ? " lead" : ""}">${String(i + 1).padStart(2, "0")}</td>
      <td class="l"><button type="button" class="linkish pb-who" data-who="${r.model ? "model" : esc(k)}" aria-pressed="false" title="See ${esc(r.name)}'s picks and bracket"><i class="pb-dot" aria-hidden="true"></i>${r.model ? `<b>${esc(r.name)}</b>` : esc(r.name)}</button>${r.model ? ' <span class="tag">replayed</span>' : ""}</td>
      <td class="num">${r.picks ? `${delta(k, r).pts}${r.points}<span class="muted">/${r.picks}</span>` : '<span class="muted">—</span>'}</td>
      <td class="num">${r.accuracy == null ? '<span class="muted">—</span>' : `${delta(k, r).acc}${pct(r.accuracy)}`}</td>
      ${showBracket ? `<td class="num">${r.bracket == null ? '<span class="muted">—</span>' : `${r.bracket}<span class="muted">/${ps.decided.length}</span>`}</td><td class="num"><b>${total(r)}</b></td>` : ""}
      ${week.map((s) => `<td class="l">${pickChip(s, r.now[s.id])}</td>`).join("")}</tr>`).join("")}</tbody>
  </table></div>` : "";
  // One played night: each series' result and how the model, the crowd and you called it.
  const dayLabel = (t, month = "short") => new Date(t * 1000).toLocaleDateString(undefined, { weekday: "long", month, day: "numeric" });
  const nightTable = (t) => {
    const rows = d.series.filter((s) => s.time === t && isPlayed(s)).map((s) => {
      const m = bt.find((x) => x.s.id === s.id);
      const c = preds ? crowd(preds, s) : null;
      const crowdPick = c?.n ? favourite(c) : null;
      const me = myKey ? valid.find((p) => p.series_id === s.id && nameKey(p.name) === myKey) : null;
      const actual = outcomeOf(s);
      const tick = (pick) => (pick ? `${label(s, pick)} ${pick === actual ? '<b class="s-a">✓</b>' : '<b class="s-b">✗</b>'}` : '<span class="muted">—</span>');
      return `<tr><td class="l">${teamLink(src, teamName[s.home], s.home)} vs ${teamLink(src, teamName[s.away], s.away)}</td>
        <td>${s.home_score}–${s.away_score}</td><td class="l">${m ? `${tick(m.pick)} <span class="muted">(${Math.round(m.p_actual * 100)}% on the result)</span>` : "—"}</td>
        <td class="l">${c?.n ? `${tick(crowdPick)} <span class="muted">${c.n}</span>` : '<span class="muted">—</span>'}</td>${myKey ? `<td class="l">${me ? tick(me.pick) : '<span class="muted">—</span>'}</td>` : ""}</tr>`;
    }).join("");
    return `<div class="table-wrap"><table><thead><tr><th scope="col" class="l">Series</th><th scope="col">Result</th><th scope="col" class="l">Model${info("model_col")}</th><th scope="col" class="l">Crowd${info("crowd_col")}</th>${myKey ? `<th scope="col" class="l">You${info("you_col")}</th>` : ""}</tr></thead><tbody>${rows}</tbody></table></div>`;
  };
  const past = playedNights.map((t) => `<h3 class="pred-night">${dayLabel(t)}</h3>${nightTable(t)}`).join("");
  // A name that opens that person's history on the Leaderboard.
  const whoBtn = (k, text) => `<button type="button" class="linkish" data-history="${esc(k)}">${text}</button>`;
  const scoreChip = (who, r) => `<span class="pred-lw-chip"><span>${who}</span><b>${r.points}<span class="muted">/${r.picks}</span></b></span>`;
  // Last week, on the Predictions tab: the latest played night, the best scores, the model's and yours.
  const prevNight = playedNights[0];
  const lastWeekHtml = prevNight ? (() => {
    const scores = preds ? nightScores(preds, d.series, prevNight) : [];
    const mdl = bt.filter((x) => x.s.time === prevNight);
    const best = scores.filter((r) => r.points === scores[0]?.points && r.points > 0);
    const me = myKey ? scores.find((r) => nameKey(r.name) === myKey) : null;
    const chips = [
      ...best.slice(0, 4).map((r) => scoreChip(whoBtn(nameKey(r.name), esc(r.name)), r)),
      best.length > 4 ? `<span class="muted">+${best.length - 4} more</span>` : "",
      mdl.length ? scoreChip(whoBtn("model", "The model"), { points: mdl.filter((x) => x.correct).length, picks: mdl.length }) : "",
      me && !best.includes(me) ? scoreChip(whoBtn(myKey, "You"), me) : "",
    ].filter(Boolean);
    return `<section class="pred-lw">
      <h2>Latest results <span class="pred-time">${dayLabel(prevNight, "long")}</span></h2>
      ${chips.length ? `<div class="pred-lw-scores">${best.length ? '<span class="pred-lw-lbl">Top</span>' : ""}${chips.join("")}</div>` : ""}
      ${nightTable(prevNight)}
      ${board.has(myKey) && myKey ? `<p class="table-note keep">${whoBtn(myKey, "Your full pick history →")}</p>` : boardRows.length ? `<p class="table-note keep">${whoBtn("", "Everyone's pick history on the Leaderboard →")}</p>` : ""}
    </section>`;
  })() : "";

  // One person's (or the model's) every call, newest night first, with the result of each.
  const historyHtml = (row, calls) => {
    const nights = pickHistory(calls, d.series);
    if (!nights.length) return `<p class="muted">No picks yet.</p>`;
    const tot = nights.reduce((a, n) => ({ points: a.points + n.points, picks: a.picks + n.picks }), { points: 0, picks: 0 });
    const res = (s) => `<span class="${s.home_score > s.away_score ? "s-a" : s.home_score < s.away_score ? "s-b" : ""}">${s.home_score}–${s.away_score}</span>`;
    return `<p class="pb-hist-sum">${tot.picks ? `<b>${tot.points}</b> of ${tot.picks} called right · ${pct(tot.points / tot.picks)}` : "Nothing decided yet"} <span class="muted">· ${nights.length} week${nights.length === 1 ? "" : "s"}</span></p>
      <div class="table-wrap"><table class="pb-hist">
      <thead><tr><th scope="col" class="l">Series</th><th scope="col" class="l">${row.model ? "Call" : "Pick"}</th><th scope="col">Result</th><th scope="col"><span class="sr-only">Right?</span></th></tr></thead>
      ${nights.map((n) => `<tbody><tr class="pb-hist-night"><th scope="rowgroup" colspan="4">${dayLabel(n.time)}<span>${n.picks ? `${n.points}/${n.picks}` : "to play"}</span></th></tr>
        ${n.rows.map(({ s, pick, correct }) => `<tr><td class="l">${teamLink(src, teamName[s.home], s.home)} <i class="muted">vs</i> ${teamLink(src, teamName[s.away], s.away)}</td>
          <td class="l">${pickChip(s, pick)}</td>
          <td>${correct == null ? '<span class="muted">—</span>' : res(s)}</td>
          <td>${correct == null ? "" : correct ? '<b class="s-a" aria-label="right">✓</b>' : '<b class="s-b" aria-label="wrong">✗</b>'}</td></tr>`).join("")}</tbody>`).join("")}
      </table></div>`;
  };

  const called = bt.filter((x) => x.correct).length;
  const ties = bt.filter((x) => x.actual === "tie").length;
  const decisive = bt.filter((x) => x.actual !== "tie");
  // Three tabs, each its own link (?tab=): this week's calls with the leaderboard, the
  // bracket they lead to, and every way the rest of the season can go.
  const callsHtml = `
    <h2>${night ? new Date(night * 1000).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : "No upcoming series"}${night ? ` <span class="pred-time">${new Date(night * 1000).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>` : ""}</h2>
    ${week.length ? `<div class="pred-grid reveal">${week.map(card).join("")}</div>
`
      : `<div class="panel empty">PlayOn hasn't posted next week's schedule yet.</div>`}
    ${lastWeekHtml}
    <details class="how explain"><summary>How the model works</summary>
      <p>Each team has a strength rating fitted to every series result so far. With only ${playedNights.length} weeks played, results alone are noisy, so each rating is pulled toward a starting point set by the average PlayOn medal of the team's top three players. The pull and the medal weight were tuned by replaying all seven divisions, predicting each week from the weeks before it. So far medals have predicted results far better than past results, so the pull is strong.</p>
      <p>The model's call takes the favourite 2–0, even when 1–1 is the likeliest single result. It only calls 1–1 when per-game odds are within ${TIE_EDGE * 100} points of 50%. The odds are more cautious: past results haven't predicted the next week much better than a coin flip, so most series look close. Replayed over the season, its calls got <b>${called} of ${bt.length}</b> series exactly right${decisive.length ? ` and picked the right team in ${decisive.filter((x) => x.pick === x.actual).length} of the ${decisive.length} that weren't 1–1` : ""}${bt.some((x) => x.pick === "tie") ? `, and called ${bt.filter((x) => x.pick === "tie").length} splits` : ""}; always calling 1–1 would have got ${ties}.</p>
      <p>The two games in a series aren't independent: the better team on the night tends to win both, and only about a third of series have ended 1–1. So an even match is 33% / 33% / 33%, not 25% / 50% / 25%. Current settings: pull ${params.lambda}, medal weight ${params.beta}.</p>
    </details>`;
  const boardTab = `
    <h2>Leaderboard</h2>
    ${boardHtml ? `${boardHtml}<p class="table-note">Points = correct calls / series called.${showBracket ? " Bracket = bracket matches whose winner you picked, from a bracket saved before the playoffs started; Total ranks the board." : ""} Columns on the right are this week's picks. <b>Click a name</b> for their pick history and bracket.</p>` : `<div class="panel empty">No picks yet.</div>`}
    ${boardHtml ? `<section class="pb-view" id="pb-view" aria-live="polite"><p class="muted">Loading…</p></section>` : ""}
    ${past ? `<details class="how"><summary>Past weeks</summary>${past}<p class="table-note">Model: its pick that week, using only earlier results. Crowd: the most-picked call and how many made it. Picks made after a series started don't count.</p></details>` : ""}`;
  const tabs = playerTabs(pageTabs(PREDICT_TABS, src, [
    ["calls", callsHtml],
    ["board", boardTab],
    ["bracket", `<section class="po" id="po-bracket"></section>`],
    ["odds", `<section class="po" id="po-odds"><div class="panel empty">Working out every outcome…</div></section>`],
  ]), { store: "predictTab", label: "Predict sections" });
  app.innerHTML = `${pageHead(kicker, "Predictions", "", tabs.bar)}
    ${nameBarHtml(name)}
    ${preds ? "" : `<div class="notice err">Couldn't reach the predictions database, so picks and the leaderboard are unavailable right now. The model's odds still work.</div>`}
    <div id="pred-msg"></div>
    ${tabs.panels}`;
  wirePlayerTabs();

  const input = wireNameBar(() => renderPredict(src));

  // The draft model (parts/cmdraft.js): its pre-draft chance on every card once the division's
  // draft file loads, and its own draft when a card's "Draft model's draft" is opened. Separate
  // from the ratings: the odds, the model's call and the standings don't change.
  const cards = [...app.querySelectorAll(".pcm[data-home]")];
  // Without the model's read (no file, a failed load, a team not found) the expander keeps just
  // the likely draft.
  const dropBest = (scope) => scope.querySelectorAll(".pcm-sec").forEach((x) => x.remove());
  if (cards.length) import("../parts/cmdraft.js").then(async (cm) => {
    const data = await cm.draftData(src.key);
    if (!document.body.contains(cards[0])) return;
    if (!data) return dropBest(app);
    for (const box of cards) {
      const home = d.teams.find((t) => t.id === Number(box.dataset.home)), away = d.teams.find((t) => t.id === Number(box.dataset.away));
      if (!home || !away) { dropBest(box.parentElement); continue; }
      const r = cm.seriesRead(home, away, d.games, data);
      box.innerHTML = cm.preDraftLine(home, away, r.pre);
      const dr = box.parentElement.querySelector("details.dr"), body = dr?.querySelector(".pcm-body"), built = {};
      if (!body) continue;
      // Drawn for the First pick the expander's toggle has on (the likely draft's wiring below
      // flips the buttons; this redraws the best draft alongside).
      const fpNow = () => dr.querySelector("[data-fp][aria-pressed=true]")?.dataset.fp ?? "home";
      const show = (fp) => {
        built[fp] ??= r.draft(fp === "home");
        body.innerHTML = cm.modelDraftHtml(home, away, built[fp], body.clientWidth || 900);
      };
      dr.addEventListener("toggle", () => { if (dr.open && !body.dataset.done) { body.dataset.done = "1"; show(fpNow()); } });
      dr.querySelectorAll("[data-fp]").forEach((b) => b.addEventListener("click", () => { if (body.dataset.done) show(b.dataset.fp); }));
    }
  }).catch((e) => { console.warn("draft model unavailable", e); if (document.body.contains(cards[0])) dropBest(app); });
  if (!cards.length) dropBest(app);

  app.querySelectorAll("details.dr").forEach((dr) => {
    const sel = { fp: "home", g: "1" };
    dr.querySelectorAll("[data-fp], [data-g]").forEach((b) => b.onclick = () => {
      const k = b.dataset.fp ? "fp" : "g";
      sel[k] = b.dataset[k];
      dr.querySelectorAll(`[data-${k}]`).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      dr.querySelectorAll(".pd").forEach((x) => (x.hidden = x.dataset.for !== `${sel.fp}-${sel.g}`));
      dr.querySelector(".pd-g2note").hidden = sel.g !== "2";
    });
  });
  const msg = document.getElementById("pred-msg");
  app.querySelectorAll(".pred-card").forEach((c) => c.querySelectorAll("[data-pick]").forEach((b) => b.onclick = async () => {
    const n = storedName() || input.value.trim();
    if (!n) { msg.innerHTML = `<div class="notice warn">Type your name first, so your picks count toward the standings.</div>`; input.focus(); return; }
    storeName(n);
    c.querySelectorAll("[data-pick]").forEach((x) => (x.disabled = true));
    try {
      await savePrediction(Number(c.dataset.sid), b.dataset.pick, n, src.key);
      renderPredict(src);
    } catch (e) {
      msg.innerHTML = `<div class="notice err">Couldn't save your pick: ${esc(e.message)}</div>`;
      c.querySelectorAll("[data-pick]").forEach((x) => (x.disabled = false));
    }
  }));

  // The playoff picture: the viewer's own calls for series still to be reported feed its
  // "Your picks" tab. Heroic's A and B views hold one division each, but its brackets mix
  // both, so the picture gets the whole league (and ratings fitted to it, as on Combined).
  const poBracket = document.getElementById("po-bracket"), poOdds = document.getElementById("po-odds");
  if (!document.body.contains(poBracket)) return;
  const myCalls = new Map(full.series.filter((s) => !isPlayed(s)).map((s) => [s.id, mine(s.id)?.pick]).filter(([, k]) => k));
  mountPlayoffs(poBracket, src, full, fullRatings, myCalls, { share: { name, saved: savedBrackets.get(myKey), save: (picks) => saveBracket(src.key, picks, name) }, locked: bracketLocked ? ps.lock : null });

  // Leaderboard: click a name for the bracket and final table their calls lead to. Fresh host
  // each time, since mountPlayoffs listens for clicks on its element.
  const view = document.getElementById("pb-view");
  if (view) {
    const fullValid = validPicks(preds ?? [], full.series);
    const open = new Set(full.series.filter((s) => !isPlayed(s)).map((s) => s.id));
    const show = (who, scroll) => {
      const k = who === "model" ? " model" : who, row = board.get(k);
      if (!row) return;
      app.querySelectorAll(".pb-who").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.who === who)));
      const calls = new Map(row.model ? [] : fullValid.filter((p) => nameKey(p.name) === k && open.has(p.series_id)).map((p) => [p.series_id, p.pick]));
      const whose = row.model ? "The model's" : `${esc(row.name)}'s`;
      const history = row.model
        ? [...bt.map((x) => ({ series_id: x.s.id, pick: x.pick })), ...week.map((s) => ({ series_id: s.id, pick: callOf(s) }))]
        : valid.filter((p) => nameKey(p.name) === k);
      const hasBracket = row.model || savedBrackets.has(k) || calls.size;
      view.innerHTML = `<h3 class="pb-view-h">${whose} picks</h3>${historyHtml(row, history)}
        <h3 class="pb-view-h pb-view-h2">${whose} bracket${row.model || !hasBracket ? "" : ` <span class="muted">· ${calls.size} upcoming series called</span>`}</h3>
        ${hasBracket ? `<div class="pb-host"></div>` : `<p class="muted">${esc(row.name)} hasn't made a bracket yet.</p>`}`;
      if (hasBracket) mountPlayoffs(view.querySelector(".pb-host"), src, full, fullRatings, calls, { watch: { name: row.name, model: !!row.model, picks: row.model ? null : savedBrackets.get(k) ?? {} } });
      if (scroll) view.scrollIntoView({ block: "nearest", behavior: "smooth" });
    };
    app.querySelectorAll(".pb-who").forEach((b) => b.onclick = () => show(b.dataset.who, true));
    // Last week's names (and "Your full pick history") open the Leaderboard on that person.
    app.querySelectorAll("[data-history]").forEach((b) => b.onclick = () => {
      app.querySelector('.pp-tabs [data-tab="board"]')?.click();
      if (b.dataset.history) show(b.dataset.history, true);
      else view.scrollIntoView({ block: "start", behavior: "smooth" });
    });
    // Open on you if you're on the board, else the first person with a saved bracket, else the leader.
    const first = myKey && board.has(myKey) ? myKey : boardRows.find(([k, r]) => !r.model && savedBrackets.has(k))?.[0] ?? boardRows.find(([, r]) => !r.model)?.[0];
    if (first) show(first === " model" ? "model" : first, false);
  }
  // Possibilities runs every outcome, so it waits until its tab is first shown.
  const oddsPanel = poOdds.closest("[role=tabpanel]");
  const mountOdds = () => {
    if (oddsPanel.hidden || poOdds.dataset.done) return;
    poOdds.dataset.done = "1";
    setTimeout(() => mountPlayoffs(poOdds, src, full, fullRatings, myCalls, { view: "odds" }), 0);
  };
  new MutationObserver(mountOdds).observe(oddsPanel, { attributes: true, attributeFilter: ["hidden"] });
  mountOdds();
}

// ---------- Predictions (scrims) ----------
// Anyone can put an upcoming scrim on the schedule (teams, start, Bo1/2/3); anyone can call
// it until it starts. Uploaded games between the same teams around that time settle it
// (lib/fixtures.js), so posting a result is just the usual upload, started from the card.

// <input type="datetime-local"> value for a Date, in the viewer's time zone.
const localInput = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
export const fxWhen = (d) => d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
function fxUntil(d, now) {
  const m = Math.round((d - now) / 6e4);
  if (m <= 0) return "started";
  if (m < 60) return `in ${m} min`;
  if (m < 48 * 60) return `in ${Math.round(m / 60)} h`;
  return `in ${Math.round(m / 1440)} days`;
}
const boOptions = (sel) => [1, 2, 3].map((n) => `<option value="${n}" ${n === sel ? "selected" : ""}>Best of ${n}</option>`).join("");
// Start an upload for a fixture: the upload page shows which scrim it's for and fills in
// the team names.
function uploadFor(f, quick) {
  upload.fixture = { id: f.id, team_a: f.team_a, team_b: f.team_b, start: f.start, best_of: f.best_of, game: f.games.length + 1 };
  upload.fixtureQuick = quick;
  location.hash = "#/upload";
}

export async function renderScrimPredict() {
  const kicker = SOURCES.scrim.kicker;
  app.innerHTML = loading(kicker, "Predictions");
  let matches, fixtures, preds;
  try { matches = await allMatches(); } catch (e) { app.innerHTML = `${pageHead(kicker, "Predictions")}${errorBox(e)}`; return; }
  try { fixtures = await listFixtures(); } catch (e) { console.warn(e); fixtures = null; }
  try { preds = (await listPredictions()).filter((p) => p.league === "scrim"); } catch (e) { console.warn(e); preds = null; }
  const uid = await currentUid();
  const name = storedName();
  const myKey = nameKey(name);
  const now = Date.now();
  const settled = settle((fixtures ?? []).filter((f) => f.start), matches);
  const series = settled.map(asSeries);
  const ratings = scrimRatings(matches);
  const bt = fixtureBacktest(settled, matches);
  const valid = preds ? validPicks(preds, series) : [];
  const teams = listTeams(matches).map((t) => t.name);
  for (const f of fixtures ?? []) for (const t of [f.team_a, f.team_b]) if (!teams.some((x) => x.toLowerCase() === t.toLowerCase())) teams.push(t);
  teams.sort((a, b) => a.localeCompare(b));

  const upcoming = settled.filter((f) => !f.done).sort((a, b) => a.start - b.start);
  const done = settled.filter((f) => f.done).sort((a, b) => b.start - a.start);
  const mine = (id) => (preds ?? []).filter((p) => p.series_id === id && p.uid === uid).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
  const canManage = (f) => f.uid === uid || editUnlocked();

  const card = (f, i) => {
    const locked = now >= f.start;
    const o = fixtureOdds(f, ratings), call = fixtureCall(f, o), fs = fixtureScores(f, o);
    const my = mine(f.id);
    const c = preds ? crowd(preds, asSeries(f)) : null;
    const opts = outcomes(f.best_of);
    const soFar = f.games.length ? `${f.home_wins}–${f.away_wins} after ${f.games.length} game${f.games.length === 1 ? "" : "s"}` : "";
    return `<article class="pred-card" data-fid="${f.id}" style="--i:${Math.min(i, 12)}">
      <div class="pred-head">
        <div class="pred-teams"><span class="a">${teamLink(SOURCES.scrim, f.team_a)}</span><i>vs</i><span class="b">${teamLink(SOURCES.scrim, f.team_b)}</span></div>
        ${locked ? '<span class="pred-lock">Locked</span>' : ""}
      </div>
      <div class="fx-meta"><b>${esc(fxWhen(f.start))}</b> · ${fxUntil(f.start, now)} · Bo${f.best_of}${soFar ? ` · <span class="fx-sofar">${soFar}</span>` : ""}</div>
      <div class="pred-picks${opts.length === 2 ? " two" : ""}" role="group" aria-label="Your pick">${opts.map((k) => {
        const n = c ? Math.round(c[k] * c.n) : 0;
        return `<button type="button" class="${k}" data-pick="${k}" aria-pressed="${my?.pick === k}" ${locked || !preds ? "disabled" : ""}>
          <span class="pk-main">${esc(outcomeLabel(f, k))}</span>
          <span class="pk-sub">${Math.round(o[k] * 100)}%${c ? ` · ${n} pick${n === 1 ? "" : "s"}` : ""}${k === call ? " · <b>model</b>" : ""}</span>
        </button>`;
      }).join("")}</div>
      ${fs ? `<div class="fx-model">Model: <b>${esc(call === "home" ? f.team_a : f.team_b)} ${fs.score[0]}–${fs.score[1]}</b> <span class="muted">· ${fs.scores.map((s) => `${s.a}–${s.b} ${pct(s.p)}`).join(" · ")} (${esc(f.team_a)} first)</span></div>` : ""}
      <div class="fx-actions">
        <button type="button" class="${locked ? "primary" : ""}" data-up="shots">Upload game ${f.games.length + 1}</button>
        <button type="button" data-up="quick">Private result</button>
        ${f.games.map((m, j) => `<a class="fx-game" href="#/match/${m.id}">Game ${j + 1}</a>`).join("")}
        <span class="fx-manage">
          <button type="button" class="linkish" data-fx="move">Change time</button>
          <button type="button" class="linkish" data-fx="delete">Delete</button>
        </span>
      </div>
      <div class="fx-move" hidden>
        <input type="datetime-local" value="${localInput(f.start)}">
        <select>${boOptions(f.best_of)}</select>
        <button type="button" class="primary" data-fx="move-save">Save</button>
      </div>
    </article>`;
  };

  // Leaderboard: everyone with a pick that counted, plus the model replayed.
  const st = preds ? standings(preds, series, bt) : [];
  const boardHtml = st.length ? `<div class="table-wrap"><table class="pred-board">
    <thead><tr><th scope="col" class="rank">#</th><th scope="col" class="l">Name</th><th scope="col">Points${info("points")}</th><th scope="col">Correct${info("correct")}</th></tr></thead>
    <tbody>${st.map((r, i) => `<tr class="${!r.model && nameKey(r.name) === myKey ? "me" : ""}">
      <td class="rank${i < 3 && r.picks ? " lead" : ""}">${String(i + 1).padStart(2, "0")}</td>
      <td class="l">${r.model ? `<b>${esc(r.name)}</b> <span class="tag">replayed</span>` : esc(r.name)}</td>
      <td class="num">${r.points}<span class="muted">/${r.picks}</span></td>
      <td class="num">${pct(r.accuracy)}</td></tr>`).join("")}</tbody></table></div>` : "";

  const results = done.map((f) => {
    const m = bt.find((x) => x.s.id === f.id);
    const c = preds ? crowd(preds, asSeries(f)) : null;
    const crowdPick = c?.n ? outcomes(f.best_of).sort((a, b) => c[b] - c[a])[0] : null;
    const me = myKey ? valid.find((p) => p.series_id === f.id && nameKey(p.name) === myKey) : null;
    const tick = (pick) => (pick ? `${esc(outcomeLabel(f, pick))} ${pick === f.outcome ? '<b class="s-a">✓</b>' : '<b class="s-b">✗</b>'}` : '<span class="muted">—</span>');
    return `<tr><td class="l">${esc(f.start.toLocaleDateString(undefined, { month: "short", day: "numeric" }))}</td>
      <td class="l">${teamLink(SOURCES.scrim, f.team_a)} vs ${teamLink(SOURCES.scrim, f.team_b)}</td>
      <td>${f.home_wins}–${f.away_wins} ${f.games.map((g, j) => `<a href="#/match/${g.id}" title="Game ${j + 1}">G${j + 1}</a>`).join(" ")}</td>
      <td class="l">${m ? tick(m.pick) : "—"}</td>
      <td class="l">${c?.n ? `${tick(crowdPick)} <span class="muted">${c.n}</span>` : '<span class="muted">—</span>'}</td>
      ${myKey ? `<td class="l">${me ? tick(me.pick) : '<span class="muted">—</span>'}</td>` : ""}</tr>`;
  }).join("");

  const start = new Date(now + 864e5);
  start.setMinutes(0, 0, 0);
  app.innerHTML = `${pageHead(kicker, "Predictions")}
    ${nameBarHtml(name)}
    ${fixtures && preds ? "" : `<div class="notice err">Couldn't load the ${fixtures ? "" : "schedule and "}predictions from the database, so ${fixtures ? "picks and the leaderboard are" : "scheduled scrims, picks and the leaderboard are"} unavailable right now.</div>`}
    <div id="pred-msg"></div>
    <details class="fx-add" ${upcoming.length ? "" : "open"}>
      <summary>+ Add an upcoming scrim</summary>
      <form id="fx-form" class="fx-form">
        <datalist id="scrim-teams">${teams.map((t) => `<option value="${esc(t)}">`).join("")}</datalist>
        <label>Team A<input name="a" list="scrim-teams" maxlength="40" required placeholder="Team name" autocomplete="off"></label>
        <label>Team B<input name="b" list="scrim-teams" maxlength="40" required placeholder="Team name" autocomplete="off"></label>
        <label>Starts<input name="start" type="datetime-local" required value="${localInput(start)}"></label>
        <label>Format<select name="bo">${boOptions(2)}</select></label>
        <button class="primary" type="submit">Add to schedule</button>
      </form>
      <p class="table-note">Pick team names from the list so results match up. Times are in your time zone.</p>
    </details>
    <h2>Upcoming</h2>
    ${upcoming.length ? `<div class="pred-grid reveal">${upcoming.map(card).join("")}</div>
      <p class="table-note">After the scrim, press <b>Upload game</b> (screenshots) or <b>Private result</b> (score only) on its card. Games between the same two teams uploaded from 2 hours before the start to 3 days after count automatically.</p>`
      : `<div class="panel empty">Nothing scheduled. Add the next scrim above.</div>`}
    <h2>Leaderboard</h2>
    ${boardHtml ? `${boardHtml}<p class="table-note">Points = correct calls / scrims called.</p>` : `<div class="panel empty">No scrims decided yet.</div>`}
    ${results ? `<h2>Results</h2><div class="table-wrap"><table><thead><tr><th scope="col" class="l">Date</th><th scope="col" class="l">Scrim</th><th scope="col">Result</th><th scope="col" class="l">Model${info("model_col")}</th><th scope="col" class="l">Crowd${info("crowd_col")}</th>${myKey ? `<th scope="col" class="l">You${info("you_col")}</th>` : ""}</tr></thead><tbody>${results}</tbody></table></div>` : ""}
    <details class="how explain"><summary>How it works</summary>
      <p>Each team has a strength rating fitted to every scrim result on the site, private results included, and pulled toward even. In a Bo2 the better team on the night tends to win both, so an even Bo2 is 33% / 33% / 33%. A Bo3 treats each game separately: the card shows the favourite's likeliest score (always 2–0) and the odds of each score. With no games between the teams, the model calls a coin flip: 1–1 in a Bo2, Team A otherwise.</p>
      <p>A scrim is decided once all its games are in (Bo1, Bo2) or a team has two wins (Bo3). Until then it stays under Upcoming with the score so far. If the teams played under different names in game, the upload page offers the scheduled names in one click.</p>
    </details>`;

  const input = wireNameBar(renderScrimPredict);
  const msg = document.getElementById("pred-msg");
  const say = (kind, text) => { msg.innerHTML = `<div class="notice ${kind}">${esc(text)}</div>`; msg.scrollIntoView({ block: "nearest" }); };

  document.getElementById("fx-form").onsubmit = async (e) => {
    e.preventDefault();
    const fm = e.target, btn = fm.querySelector("button");
    const a = fm.a.value.trim(), b = fm.b.value.trim(), when = new Date(fm.start.value);
    if (!a || !b) return say("warn", "Type both team names.");
    if (a.toLowerCase() === b.toLowerCase()) return say("warn", "Pick two different teams.");
    if (Number.isNaN(+when)) return say("warn", "Pick a start time.");
    if (when < now - 2 * 864e5 || when > now + 60 * 864e5) return say("warn", "The start has to be within the last 2 days or the next 60.");
    // Use the saved spelling when the typed name matches a known team.
    const canon = (n) => teams.find((t) => t.toLowerCase() === n.toLowerCase()) ?? n;
    btn.disabled = true;
    try {
      await addFixture({ team_a: canon(a), team_b: canon(b), start: when, best_of: Number(fm.bo.value) });
      renderScrimPredict();
    } catch (err) { btn.disabled = false; say("err", `Couldn't add the scrim: ${err.message}`); }
  };

  const unlocked = () => {
    const pw = window.prompt("Only whoever added this scrim can change it. League password:");
    return pw != null && unlockEdit(pw);
  };
  app.querySelectorAll(".pred-card[data-fid]").forEach((c) => {
    const f = settled.find((x) => x.id === c.dataset.fid);
    c.querySelectorAll("[data-pick]").forEach((b) => b.onclick = async () => {
      const n = storedName() || input.value.trim();
      if (!n) { say("warn", "Type your name first, so your picks count toward the standings."); input.focus(); return; }
      storeName(n);
      c.querySelectorAll("[data-pick]").forEach((x) => (x.disabled = true));
      try { await savePrediction(f.id, b.dataset.pick, n, "scrim"); renderScrimPredict(); }
      catch (e) { say("err", `Couldn't save your pick: ${e.message}`); c.querySelectorAll("[data-pick]").forEach((x) => (x.disabled = false)); }
    });
    c.querySelectorAll("[data-up]").forEach((b) => b.onclick = () => uploadFor(f, b.dataset.up === "quick"));
    const move = c.querySelector(".fx-move");
    c.querySelector('[data-fx="move"]').onclick = () => { if (canManage(f) || unlocked()) move.hidden = !move.hidden; };
    c.querySelector('[data-fx="move-save"]').onclick = async (e) => {
      const when = new Date(move.querySelector("input").value);
      if (Number.isNaN(+when)) return say("warn", "Pick a start time.");
      e.target.disabled = true;
      try { await moveFixture(f.id, when, Number(move.querySelector("select").value)); renderScrimPredict(); }
      catch (err) { e.target.disabled = false; say("err", `Couldn't change it: ${err.message}`); }
    };
    c.querySelector('[data-fx="delete"]').onclick = async () => {
      if (!canManage(f) && !unlocked()) return;
      if (!window.confirm(`Delete ${f.team_a} vs ${f.team_b} from the schedule? Picks on it stop counting. Uploaded games stay.`)) return;
      try { await deleteFixture(f.id); renderScrimPredict(); } catch (err) { say("err", `Couldn't delete it: ${err.message}`); }
    };
  });
}