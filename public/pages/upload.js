// Upload a scrim or an unticketed AD2L game, and edit a saved upload. Loaded on demand.
import { validateMatch } from "../lib/validate.js";
import { listTeams } from "../lib/teams.js";
import { buildPlayerIndex, matchPlayers, nameKey } from "../lib/players.js";
import { rosterQuestions, teamByName, sameTeams, guessTeams, aliasOf } from "../lib/unticketed.js";
import { editMatch, submitMatch, getMatch, currentUid } from "../lib/store.js";
import { DIVISIONS, divCache, SOURCES, missingGames, esc, here, divUploaded, divData, allMatches, seriesOptions, dur, app, editUnlocked, pageHead } from "../core.js";
import { STATS, errorBox } from "../parts/lanes.js";
import { fxWhen } from "./predict.js";

// ---------- Upload + review ----------

// The screenshot reader (lib/ocr, and Tesseract from jsdelivr) loads on the first upload, not
// with every page.
let ocrReady = null;
const ocr = () => (ocrReady ??= Promise.all([import("../lib/ocr/parse.js"), import("../lib/ocr/engine-browser.js")])
  .then(([{ parseScreenshots }, { createBrowserEngine }]) => ({ parseScreenshots, engine: createBrowserEngine() }))
  .catch((e) => { ocrReady = null; throw e; }));
// league: "scrim" (the ledger), or an AD2L division key ("ad2l" = Champion; see lib/divisions.js)
// for an unticketed game in that division, same form.
export const upload = { images: [], draft: null, check: null, notes: [], names: [], standins: new Set(), busy: false, progress: "", message: null, isPrivate: false, league: "scrim", seriesId: null,
  // Private result form (scrims): no screenshots or players, just the result.
  quick: false, teams: [], newTeam: { a: false, b: false },
  // Editing a saved upload: { id, league, back, title }. Same form; saves in place (editMatch).
  editing: null,
  // A scheduled scrim this upload is the result of (Predict tab): { id, team_a, team_b,
  // start, best_of, game }. Only fills in team names and says which scrim; the game is
  // matched to the scrim by teams and time, not by this.
  fixture: null, fixtureQuick: false };
// Is this league one of the AD2L divisions (vs the scrim ledger)?
const isDiv = (league) => league in DIVISIONS;
// Rosters the upload form checks names against: the division being uploaded to, and for
// scrims the Champion teams (scrim teams are the Champion teams).
const upData = () => divCache[isDiv(upload.league) ? upload.league : "ad2l"];
// Private uploads only need a valid result; public ones need every player too. AD2L
// uploads must name two division teams, so the game lands on the right team pages.
export function checkDraft(d) {
  const resultOnly = upload.isPrivate && !isDiv(upload.league);
  const c = validateMatch(d, { resultOnly });
  // Unknown names on a division team's side: same player under another name, or a stand-in?
  upload.rosterQs = resultOnly || upload.quick ? [] : rosterQuestions(d, upData(), upload.standins);
  const asked = upload.rosterQs.map((q) => `Say who “${q.from}” is (${q.team}): one of their players under another name, or a stand-in.`);
  const div = upData();
  if (!isDiv(upload.league) || !div) return asked.length ? { ...c, ok: false, errors: [...(c.errors ?? []), ...asked] } : c;
  const errors = [...asked, ...[d.team_a, d.team_b].filter((n) => n && !teamByName(div, n)).map((n) => `“${n}” isn't a team in ${SOURCES[upload.league].division}. Pick one from the list.`)];
  // Unticketed uploads must fill a game the league is missing (see seriesPickHtml).
  if (upload.editing) { /* an edit keeps the series it was saved in */ }
  else if (!missingGames(upload.league).length) errors.push("No AD2L games are missing right now, so there's nothing to upload.");
  else if (!upload.seriesId) errors.push("Pick which game this is under “Which game is this?” at the top of the review.");
  const s = upload.seriesId && div.series.find((x) => x.id === upload.seriesId);
  if (s && d.team_a && d.team_b && !sameTeams(div, s, d.team_a, d.team_b)) errors.push("The teams don't match the series picked under “Which game is this?”.");
  if (!errors.length) return c;
  return { ...c, ok: false, errors: [...(c.errors ?? []), ...errors] };
}
// Pick the missing game for these two teams when there's exactly one.
function guessSeries(d) {
  const hits = [...new Set(missingGames(upload.league).filter((g) => sameTeams(upData(), g.series, d.team_a, d.team_b)).map((g) => g.series.id))];
  upload.seriesId = hits.length === 1 ? hits[0] : null;
}

const fixtureKey = (a, b) => [a, b].map((n) => (n ?? "").trim().toLowerCase()).sort().join("|");
// Does the review form already name the scheduled scrim's two teams (either side)?
const fixtureNamed = (d) => !upload.fixture || fixtureKey(d.team_a, d.team_b) === fixtureKey(upload.fixture.team_a, upload.fixture.team_b);
// Blank team names get the scheduled ones.
function fillFixtureTeams(d) {
  const f = upload.fixture;
  if (!f || upload.league !== "scrim" || d.team_a || d.team_b) return;
  d.team_a = f.team_a;
  d.team_b = f.team_b;
}
function fixtureBanner() {
  const f = upload.fixture;
  if (!f || upload.league !== "scrim") return "";
  const d = upload.draft;
  const sides = d && !upload.quick && !fixtureNamed(d) ? `
    <div class="fx-sides">In-game names don't match the schedule. Which team was on the left (Radiant)?
      <button type="button" data-fx-side="ab">${esc(f.team_a)}</button>
      <button type="button" data-fx-side="ba">${esc(f.team_b)}</button></div>` : "";
  return `<div class="notice ok fx-banner">Result for <b>${esc(f.team_a)} vs ${esc(f.team_b)}</b> · ${esc(fxWhen(new Date(f.start)))} · Bo${f.best_of}, game ${f.game}.
    <button type="button" class="linkish" id="fx-clear">Not this scrim</button>${sides}</div>`;
}

function blankDraft() {
  const player = (team) => ({ team, name: "", tag: "", hero: "", ...Object.fromEntries(STATS.map(([k]) => [k, null])) });
  return {
    team_a: "", team_b: "", score_a: null, score_b: null, winner: null, duration: "", game_mode: "Captains Mode",
    players: [...Array(5)].map(() => player("a")).concat([...Array(5)].map(() => player("b"))),
  };
}

function addFiles(files) {
  const imgs = [...files].filter((f) => f.type.startsWith("image/"));
  if (!imgs.length) return;
  for (const f of imgs) upload.images.push({ file: f, url: URL.createObjectURL(f), name: f.name || "pasted image" });
  while (upload.images.length > 2) URL.revokeObjectURL(upload.images.shift().url);
  upload.message = null;
  ocr().then(({ engine }) => engine.warmUp()).catch(() => {}); // runParse reports a failure
  renderUpload();
}

// Snipping Tool: Win+Shift+S, then Ctrl+V anywhere on the upload page.
document.addEventListener("paste", (e) => {
  if (!/^#\/(([a-z0-9]+)(\/[a-z])?\/)?upload/.test(here()) || e.target.closest?.("input")) return;
  const files = [...(e.clipboardData?.items ?? [])].filter((i) => i.kind === "file").map((i) => i.getAsFile()).filter(Boolean);
  if (files.length) { e.preventDefault(); addFiles(files); }
});

async function runParse() {
  upload.busy = true;
  upload.message = null;
  upload.progress = "Loading the text reader (first time takes a few seconds)…";
  renderUpload();
  try {
    const { parseScreenshots, engine } = await ocr();
    const { match, notes } = await parseScreenshots(engine, upload.images.map((i) => i.file), {
      onProgress: (msg) => { upload.progress = msg; const el = document.getElementById("progress"); if (el) el.textContent = msg; },
    });
    upload.draft = match;
    upload.notes = notes;
    upload.names = await fixNames(match);
    upload.standins = new Set();
    fillFixtureTeams(match);
    if (isDiv(upload.league)) { await SOURCES[upload.league].data(); await divUploaded(upload.league); upload.notes = [...upload.notes, ...guessTeams(match, upData())]; guessSeries(match); }
    // Scrim teams are the Champion teams: name a side after the roster most of it is on
    // (unless the schedule already named both sides).
    else if (!upload.fixture && divCache.ad2l) upload.notes = [...upload.notes, ...guessTeams(match, divCache.ad2l)];
    upload.check = checkDraft(match);
    upload.message = { kind: "ok", text: "Done. Check every value against your screenshots: red boxes couldn't be read." };
  } catch (e) {
    console.error(e);
    upload.message = { kind: "err", text: `Couldn't read the screenshots: ${e.message}. You can still enter the game manually.` };
  }
  upload.busy = false;
  renderUpload();
}

// Known players: the division's rosters (plus stand-ins; Champion for scrims) and names
// from saved scrims.
async function playerIndex(league = upload.league) {
  const [ad2l, scrims] = await Promise.all([divData(isDiv(league) ? league : "ad2l").catch(() => null), allMatches().catch(() => [])]);
  return buildPlayerIndex(ad2l, scrims);
}

// Fix clear misreads of known names in place; return every match for the review form
// (fixed ones to show what changed, loose ones as suggestions to accept or ignore).
async function fixNames(match) {
  const index = await playerIndex();
  const aliased = [];
  for (const [i, p] of match.players.entries()) {
    const to = aliasOf(upData(), p.name);
    if (to && to !== p.name) { aliased.push({ i, from: p.name, to, sure: true, teams: [] }); p.name = to; }
  }
  const found = [...aliased, ...matchPlayers(match.players, index)];
  for (const f of found) if (f.sure) match.players[f.i].name = f.to;
  return found;
}

function namesHtml(names) {
  if (!names.length) return "";
  const fixed = names.filter((n) => n.sure), maybe = names.filter((n) => !n.sure);
  const team = (n) => n.teams.length ? ` <span class="muted">(${esc(n.teams.join(" / "))})</span>` : "";
  return `<div class="notice ok names"><b>Known players:</b><ul>
    ${fixed.map((n) => `<li>Read “${esc(n.from)}”, matched to <strong>${esc(n.to)}</strong>${team(n)}</li>`).join("")}
    ${maybe.map((n, k) => `<li>“${esc(n.from)}” might be <strong>${esc(n.to)}</strong>${team(n)}
      <button class="small" data-name-fix="${k}">Use ${esc(n.to)}</button></li>`).join("")}
  </ul></div>`;
}

// Asked for each player on a Champion team's side whose name isn't a division name.
function rosterQsHtml(qs) {
  if (!qs.length) return "";
  return `<div class="notice warn roster-qs"><b>Same player or a stand-in?</b>
    <p class="muted">These names aren't on the team's roster. If it's one of their players under another in-game name, pick them so the game counts on that player's page.</p>
    <ul>${qs.map((q, k) => `<li>“${esc(q.from)}” on <strong>${esc(q.team)}</strong> is
      ${q.options.map((o) => `<button class="small" data-roster-q="${k}" data-roster-to="${esc(o)}">${esc(o)}</button>`).join(" ")}
      <button class="small" data-roster-q="${k}" data-roster-standin>A different player (stand-in)</button></li>`).join("")}</ul></div>`;
}

function revalidate() {
  upload.check = checkDraft(upload.draft);
  renderChecks();
}

function checksHtml(check) {
  if (!check) return "";
  let h = rosterQsHtml(upload.rosterQs ?? []);
  if (check.errors?.length) h += `<div class="notice err"><b>Fix before saving:</b><ul>${check.errors.map((e) => `<li>${esc(e)}</li>`).join("")}</ul></div>`;
  if (check.warnings?.length) h += `<div class="notice warn"><b>Double-check:</b><ul>${check.warnings.map((e) => `<li>${esc(e)}</li>`).join("")}</ul></div>`;
  if (check.ok && !check.warnings?.length) h += `<div class="notice ok">${upload.quick ? "Ready to post." : "All checks pass. Kills match scores on both sides."}</div>`;
  return h;
}

function renderChecks() {
  const el = document.getElementById("checks");
  if (el) el.innerHTML = checksHtml(upload.check);
  const save = document.getElementById("save");
  if (save) save.disabled = !upload.check?.ok || upload.busy;
}

function numInput(path, v) {
  return `<input class="num${v == null ? " bad" : ""}" data-path="${path}" data-type="int" inputmode="numeric" value="${v ?? ""}">`;
}

function textInput(path, v, attrs = "") {
  return `<input class="${v ? "" : "bad"}" data-path="${path}" value="${esc(v)}" ${attrs}>`;
}

export function draftHtml(d) {
  const teamRows = (t) =>
    d.players.map((p, i) => [p, i]).filter(([p]) => p.team === t).map(([p, i]) => `
      <tr class="team-${t}">
        <td class="l">${textInput(`players.${i}.name`, p.name, 'list="player-list" placeholder="name" style="min-width:130px"')}</td>
        <td class="l"><input data-path="players.${i}.tag" value="${esc(p.tag)}" placeholder="optional" style="width:80px"></td>
        <td class="l">${textInput(`players.${i}.hero`, p.hero, 'list="hero-list" placeholder="hero" style="min-width:140px"')}</td>
        <td><input class="num" data-path="players.${i}.pick" data-type="int-opt" inputmode="numeric" value="${p.pick ?? ""}" style="width:52px" placeholder="—"></td>
        ${STATS.map(([k]) => `<td>${numInput(`players.${i}.${k}`, p[k])}</td>`).join("")}
      </tr>`).join("");
  const uploadHead = `<th scope="col" class="l">Player</th><th scope="col" class="l">Tag</th><th scope="col" class="l">Hero</th><th scope="col" title="Draft order, 1–10, from the Scoreboard's PICK column">Pick</th>${STATS.map(([, l]) => `<th scope="col">${l}</th>`).join("")}`;

  return `
    <h2>Review</h2>
    ${isDiv(upload.league) && !upload.editing ? seriesPickHtml() : ""}
    <div class="panel edit">
      <div class="fields">
        <label>Team A (first / left)${textInput("team_a", d.team_a, isDiv(upload.league) ? 'list="ad2l-teams"' : "")}</label>
        <label>Team A score${numInput("score_a", d.score_a)}</label>
        <label>Team B (second / right)${textInput("team_b", d.team_b, isDiv(upload.league) ? 'list="ad2l-teams"' : "")}</label>
        <label>Team B score${numInput("score_b", d.score_b)}</label>
        <label>Winner
          <select data-path="winner" class="${d.winner ? "" : "bad"}">
            <option value="" ${!d.winner ? "selected" : ""}>—</option>
            <option value="a" ${d.winner === "a" ? "selected" : ""}>Team A</option>
            <option value="b" ${d.winner === "b" ? "selected" : ""}>Team B</option>
          </select></label>
        <label>Duration (mm:ss)${textInput("duration", d.duration, 'placeholder="44:43"')}</label>
        <label>Game mode<input data-path="game_mode" value="${esc(d.game_mode)}"></label>
      </div>
    </div>
    ${namesHtml(upload.names)}
    ${upload.notes.length ? `<div class="notice warn"><b>Reader notes:</b><ul>${upload.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></div>` : ""}
    <div class="table-wrap edit" style="margin-top:12px">
      <table>
        <thead><tr>${uploadHead}</tr></thead>
        <tbody>
          <tr class="sep a"><td colspan="${STATS.length + 4}">Team A</td></tr>${teamRows("a")}
          <tr class="sep b"><td colspan="${STATS.length + 4}">Team B</td></tr>
          <tr class="head-repeat">${uploadHead}</tr>${teamRows("b")}
        </tbody>
      </table>
    </div>
    <div id="checks">${checksHtml(upload.check)}</div>
    ${isDiv(upload.league) ? `<datalist id="ad2l-teams">${(upData()?.teams ?? []).map((t) => `<option value="${esc(t.name)}">`).join("")}</datalist>` : upload.editing ? "" : `
    <label class="private-toggle">
      <input type="checkbox" id="private" ${upload.isPrivate ? "checked" : ""}>
      <span><b>Private: post the result only.</b> Teams, winner, kill score and duration are saved.
        Heroes, players and stats stay in this browser.</span>
    </label>`}
    <div class="row" style="margin-top:12px">
      <button class="primary" id="save" ${upload.check?.ok ? "" : "disabled"}>${upload.editing ? "Save changes" : upload.isPrivate ? "Post private result" : isDiv(upload.league) ? "Save to AD2L" : "Save to league"}</button>
      <button id="discard">${upload.editing ? "Cancel" : "Discard"}</button>
    </div>`;
}

// Which PlayOn game this upload fills, from the games PlayOn scored that nobody has on
// record. Saved as series_id, so the game lands in that series and its week.
function seriesPickHtml() {
  const opts = missingGames(upload.league);
  if (!opts.length) return `<div class="notice err">No AD2L games are missing right now: every game PlayOn has scored is on record, and this week's are all ticketed. Only missing games can be uploaded.</div>`;
  return `<label class="series-pick">Which game is this?
      <select id="series-pick" class="${upload.seriesId ? "" : "bad"}">
        <option value="" disabled ${upload.seriesId ? "" : "selected"}>Pick the missing game…</option>
        ${seriesOptions(opts, upload.seriesId, upData())}
      </select>
      <span class="muted">Only missing games can be uploaded: from earlier weeks, or this week's not yet ticketed. The game goes in that series and week, and the teams must match.</span></label>`;
}

// Private result: pick both teams from the league's list (or add a new one), then the kill
// score, winner and duration. Nothing else is asked for or saved.
function privateHtml(d) {
  const teamPick = (t) => {
    const v = d[`team_${t}`] ?? "";
    const typed = upload.newTeam[t];
    return `<label>Team ${t.toUpperCase()}${t === "a" ? " (Radiant / left)" : " (Dire / right)"}
      <select data-team="${t}" class="${v || typed ? "" : "bad"}">
        <option value="" ${!v && !typed ? "selected" : ""}>Pick a team…</option>
        ${upload.teams.map((n) => `<option value="${esc(n)}" ${!typed && n === v ? "selected" : ""}>${esc(n)}</option>`).join("")}
        <option value="__new" ${typed ? "selected" : ""}>+ New team (type the name)</option>
      </select>
      ${typed ? textInput(`team_${t}`, v, 'placeholder="Team name" maxlength="40"') : ""}</label>`;
  };
  const name = (t) => esc(d[`team_${t}`] || `Team ${t.toUpperCase()}`);
  return `
    <h2>Private result</h2>
    ${upload.editing ? "" : `<ol class="how-steps">
      <li><b>Pick both teams</b> from the list. Team A is the side shown on the left of the post-game screen (Radiant). If a team hasn't played before, choose <b>+ New team</b> and type its name the way it should appear on the site.</li>
      <li><b>Kill score:</b> the two big numbers at the top of the post-game screen, one per team.</li>
      <li><b>Winner:</b> the team the post-game banner names.</li>
      <li><b>Duration:</b> the game time from the post-game screen, as minutes:seconds (for example <code>38:12</code>).</li>
      <li>Press <b>Post private result</b>. Only the teams, kill score, winner and duration are saved; no heroes, players or stats. It counts toward both teams' records.</li>
    </ol>`}
    <div class="panel edit">
      <div class="fields">
        ${teamPick("a")}
        <label>Team A kills${numInput("score_a", d.score_a)}</label>
        ${teamPick("b")}
        <label>Team B kills${numInput("score_b", d.score_b)}</label>
        <label>Winner
          <select data-path="winner" class="${d.winner ? "" : "bad"}">
            <option value="" ${!d.winner ? "selected" : ""}>—</option>
            <option value="a" ${d.winner === "a" ? "selected" : ""}>${name("a")}</option>
            <option value="b" ${d.winner === "b" ? "selected" : ""}>${name("b")}</option>
          </select></label>
        <label>Duration (mm:ss)${textInput("duration", d.duration, 'placeholder="38:12" inputmode="numeric"')}</label>
      </div>
    </div>
    <div id="checks">${checksHtml(upload.check)}</div>
    <div class="row" style="margin-top:12px">
      <button class="primary" id="save" ${upload.check?.ok ? "" : "disabled"}>${upload.editing ? "Save changes" : "Post private result"}</button>
      <button id="discard">Cancel</button>
    </div>`;
}

// Teams to pick from for a private result: the Champion teams (scrim teams are the same
// teams) and any other team the ledger has, one entry per name, Champion spelling first.
async function privateTeams() {
  const names = new Map();
  const add = (n) => { if (n && !names.has(n.trim().toLowerCase())) names.set(n.trim().toLowerCase(), n.trim()); };
  for (const t of (await divData("ad2l").catch(() => null))?.teams ?? []) add(t.name);
  try { for (const t of listTeams(await allMatches())) add(t.name); } catch { /* offline: new-team entry still works */ }
  return [...names.values()].sort((x, y) => x.localeCompare(y));
}

export async function startPrivate() {
  const teams = await privateTeams();
  Object.assign(upload, { quick: true, isPrivate: true, teams, newTeam: { a: !teams.length, b: !teams.length }, notes: [], names: [], standins: new Set(), message: null });
  upload.draft = blankDraft();
  fillFixtureTeams(upload.draft);
  for (const t of ["a", "b"]) {
    const n = upload.draft[`team_${t}`];
    if (!n) continue;
    const known = upload.teams.find((x) => x.toLowerCase() === n.toLowerCase());
    if (known) upload.draft[`team_${t}`] = known; else upload.teams.push(n);
  }
  upload.newTeam = { a: !upload.teams.length, b: !upload.teams.length };
  upload.check = checkDraft(upload.draft);
  renderUpload();
}

function setPath(obj, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  keys.reduce((o, k) => o[k], obj)[last] = value;
}

export function onDraftInput(e) {
  const el = e.target;
  if (!el.dataset.path) return;
  let v = el.value;
  if (el.dataset.type === "int-opt") {
    const cleaned = v.replace(/\s/g, "");
    v = /^\d+$/.test(cleaned) ? Number(cleaned) : null;
    el.classList.toggle("bad", cleaned !== "" && v == null);
  } else if (el.dataset.type === "int") {
    const cleaned = v.replace(/[,\s]/g, "");
    v = /^\d+$/.test(cleaned) ? Number(cleaned) : null;
    el.classList.toggle("bad", v == null);
  } else if (el.dataset.path === "winner") {
    v = v || null;
    el.classList.toggle("bad", !v);
  } else if (el.classList.contains("bad") || !v) {
    el.classList.toggle("bad", !v.trim());
  }
  setPath(upload.draft, el.dataset.path, v);
  revalidate();
}

async function saveDraft() {
  const save = document.getElementById("save");
  save.disabled = true;
  save.textContent = "Saving…";
  try {
    const ad2l = isDiv(upload.league);
    if (upload.editing) {
      const { id, back } = upload.editing;
      await editMatch(id, upload.check.match, upload.league);
      endEdit();
      if (ad2l) await divUploaded(upload.league, true); else await allMatches(true);
      location.hash = back;
      return;
    }
    const res = await submitMatch(upload.check.match, { isPrivate: ad2l ? false : upload.isPrivate, league: upload.league, seriesId: upload.seriesId });
    if (res.duplicateOf) {
      upload.message = { kind: "warn", text: "This game is already in the league.", link: ad2l ? `${SOURCES[upload.league].root}/game/${res.duplicateOf}` : `#/scrims/match/${res.duplicateOf}` };
      renderUpload();
      return;
    }
    for (const img of upload.images) URL.revokeObjectURL(img.url);
    const fromFixture = !ad2l && upload.fixture;
    upload.fixture = null;
    if (upload.quick) upload.isPrivate = false;
    Object.assign(upload, { images: [], draft: null, check: null, notes: [], names: [], standins: new Set(), message: null, seriesId: null, quick: false });
    if (ad2l) { const root = SOURCES[upload.league].root; await divUploaded(upload.league, true); location.hash = `${root}/game/${res.id}`; }
    else { await allMatches(true); location.hash = fromFixture ? "#/scrims/predict" : `#/scrims/match/${res.id}`; }
  } catch (e) {
    upload.message = { kind: "err", text: `Couldn't save: ${e.message}` };
    renderUpload();
  }
}

// Edit page: the saved game loaded into the review form (public: every field; private: the
// result form). Only for its uploader or someone who has typed the league password.
function editDraft(m) {
  const d = blankDraft();
  Object.assign(d, { team_a: m.team_a, team_b: m.team_b, score_a: m.score_a, score_b: m.score_b, winner: m.winner,
    duration: dur(m.duration_sec), game_mode: m.game_mode ?? "" });
  if (!m.private) d.players = m.players.map((p) => ({ ...p, tag: p.tag ?? "" }));
  return d;
}
export function endEdit() {
  if (upload.editing) Object.assign(upload, { editing: null, draft: null, check: null, isPrivate: false, quick: false, seriesId: null, message: null });
}
export async function renderEdit(id, league) {
  const back = isDiv(league) ? `${SOURCES[league].root}/game/${id}` : `#/scrims/match/${id}`;
  app.innerHTML = `<div class="panel empty">Loading…</div>`;
  let m;
  try { m = await getMatch(id, league); } catch (e) { app.innerHTML = errorBox(e); return; }
  if (!m) { app.innerHTML = `<div class="notice err">No such game.</div>`; return; }
  if (m.uid !== (await currentUid()) && !editUnlocked()) { location.hash = back; return; }
  await divData(isDiv(league) ? league : "ad2l").catch(() => null); // rosters: AD2L teams, and the name questions
  if (upload.editing?.id !== id) {
    let teams = [];
    if (m.private) teams = await privateTeams();
    Object.assign(upload, { editing: { id, league, back, title: `${m.team_a} vs ${m.team_b}` }, league, draft: editDraft(m), isPrivate: !!m.private, quick: !!m.private,
      seriesId: m.series_id ?? null, teams, newTeam: { a: false, b: false }, notes: [], names: [], standins: new Set(), message: null });
  }
  upload.check = checkDraft(upload.draft);
  renderUpload();
}

// Known player names (scrims + AD2L Champion) help fix OCR misreads in the review form's name
// boxes. Filled on the first upload or edit page, so other pages don't load them.
let playerList = null;
const fillPlayerList = () => (playerList ??= playerIndex("scrim").then((idx) => {
  const names = idx.map((e) => e.name).sort((a, b) => a.localeCompare(b));
  document.getElementById("player-list").innerHTML = names.map((n) => `<option value="${esc(n)}">`).join("");
}).catch(() => {}));

export function renderUpload() {
  fillPlayerList();
  const msg = upload.message;
  if (upload.editing) {
    const e = upload.editing;
    app.innerHTML = `
      <div class="kicker" style="margin-bottom:16px"><a href="${e.back}">← Back to the game</a></div>
      ${pageHead(isDiv(e.league) ? SOURCES[e.league].kicker : "The ledger", `Edit ${esc(e.title)}`,
        "Fix anything that's wrong and press <b>Save changes</b>. The game keeps its upload date, so it stays in the same week.")}
      ${msg ? `<div class="notice ${msg.kind}">${esc(msg.text)}</div>` : ""}
      ${upload.quick ? privateHtml(upload.draft) : draftHtml(upload.draft)}`;
    wireDraft();
    return;
  }
  const slot = (i) => {
    const img = upload.images[i];
    return img
      ? `<div class="slot filled" style="--i:${i + 3}"><img src="${img.url}" alt="Screenshot ${i + 1}" title="${esc(img.name)}"><span class="slot-tag">Screenshot ${i + 1}</span></div>`
      : `<div class="slot" style="--i:${i + 3}"><div><div class="slot-num">0${i + 1}</div>
           <div class="slot-label">${i === 0 ? "Overview or Scoreboard" : "The other one"}</div>
           <div class="slot-hint">Paste · drop · click</div></div></div>`;
  };
  const how = `Snip the post-game <b>overview</b> (hero cards) and the <b>Scoreboard</b> tab with <kbd>Win</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>,
       then press <kbd>Ctrl</kbd>+<kbd>V</kbd> here, once for each. On the Scoreboard, scroll the table all the way right so <b>PICK</b> shows
       (the draft order). Don't hover over anything while snipping; tooltips cover numbers.
       Screenshots are read on your computer; only the stats you save are uploaded.`;
  const examples = `<div class="examples" style="--i:2"><div class="examples-lbl">Example</div>
      ${[["example-overview", "Overview: all ten hero cards, team names and score"], ["example-scoreboard", "Scoreboard, scrolled right to PICK"]].map(([f, cap]) =>
        `<figure class="example"><img src="img/${f}.webp" alt="${cap}" loading="lazy"><figcaption>${cap}</figcaption></figure>`).join("")}
    </div>`;
  app.innerHTML = `
    ${isDiv(upload.league)
      ? pageHead(SOURCES[upload.league].kicker, "Upload an unticketed game", `For ${SOURCES[upload.league].division} games played <b>without a league ticket</b>, which the site can't find on its own. ${how}
         They count on team, player, hero and tier pages, marked “Unticketed”. Standings still follow PlayOn. No draft, gold graph or ward data without a replay.`)
      : pageHead("Post-game intake", "Upload a scrim", how)}
    <div class="reveal">
      ${upload.images.length || upload.draft ? "" : examples}
      <div class="slots" id="drop" style="--i:3">${slot(0)}${slot(1)}
        <input type="file" id="file" accept="image/*" multiple hidden></div>
      <div class="row upload-actions" style="--i:4">
        <button class="primary" id="parse" ${!upload.images.length || upload.busy ? "disabled" : ""}>Read screenshots</button>
        <button id="manual" ${upload.busy ? "disabled" : ""}>Enter manually</button>
        ${isDiv(upload.league) ? "" : `<button id="private-result" ${upload.busy ? "disabled" : ""}>Private result (score only)</button>`}
        ${upload.images.length && !upload.busy ? `<button id="clear">Clear</button>` : ""}
      </div>
      ${upload.busy ? `<p class="progress" id="progress">${esc(upload.progress)}</p>` : ""}
    </div>
    ${msg ? `<div class="notice ${msg.kind}">${esc(msg.text)}${msg.link ? ` <a href="${msg.link}">Open it</a>` : ""}</div>` : ""}
    ${fixtureBanner()}
    ${isDiv(upload.league) || upload.draft ? "" : `<p class="table-note private-hint">Played a scrim you don't want to share the draft or lineups of? Use <b>Private result</b>: pick the two teams, then type the kill score, winner and duration. No screenshots needed.</p>`}
    ${upload.draft ? (upload.quick ? privateHtml(upload.draft) : draftHtml(upload.draft)) : ""}
    <dialog id="zoom"><img alt=""></dialog>`;

  const drop = document.getElementById("drop");
  const file = document.getElementById("file");
  const zoom = document.getElementById("zoom");
  drop.querySelectorAll(".slot").forEach((s) => {
    s.onclick = () => {
      const img = s.querySelector("img");
      if (img) { zoom.querySelector("img").src = img.src; zoom.showModal(); } else file.click();
    };
  });
  file.onchange = () => addFiles(file.files);
  drop.ondragover = (e) => { e.preventDefault(); drop.querySelectorAll(".slot:not(.filled)").forEach((s) => s.classList.add("over")); };
  drop.ondragleave = () => drop.querySelectorAll(".slot").forEach((s) => s.classList.remove("over"));
  drop.ondrop = (e) => { e.preventDefault(); drop.ondragleave(); addFiles(e.dataTransfer.files); };
  zoom.onclick = () => zoom.close();
  app.querySelectorAll(".example img").forEach((img) => (img.onclick = () => { zoom.querySelector("img").src = img.src; zoom.showModal(); }));

  document.getElementById("parse").onclick = runParse;
  const priv = document.getElementById("private-result");
  if (priv) priv.onclick = startPrivate;
  document.getElementById("manual").onclick = async () => { await divData(isDiv(upload.league) ? upload.league : "ad2l").catch(() => null); upload.quick = false; upload.draft = blankDraft(); fillFixtureTeams(upload.draft); upload.seriesId = null; upload.notes = []; upload.names = []; upload.standins = new Set(); upload.message = null; upload.check = checkDraft(upload.draft); renderUpload(); };
  const clear = document.getElementById("clear");
  if (clear) clear.onclick = () => { for (const i of upload.images) URL.revokeObjectURL(i.url); upload.images = []; renderUpload(); };

  const fxClear = document.getElementById("fx-clear");
  if (fxClear) fxClear.onclick = () => { upload.fixture = null; renderUpload(); };
  app.querySelectorAll("[data-fx-side]").forEach((b) => b.onclick = () => {
    const f = upload.fixture, ab = b.dataset.fxSide === "ab";
    upload.draft.team_a = ab ? f.team_a : f.team_b;
    upload.draft.team_b = ab ? f.team_b : f.team_a;
    upload.check = checkDraft(upload.draft);
    renderUpload();
  });

  if (upload.draft) wireDraft();
}

// Review-form handlers, shared by uploads and edits.
function wireDraft() {
  document.getElementById("save").onclick = saveDraft;
  // #checks is redrawn as you type, so its buttons are handled on the container.
  const checks = document.getElementById("checks");
  if (checks) checks.onclick = (e) => {
    const b = e.target.closest("[data-roster-q]");
    const q = b && upload.rosterQs?.[Number(b.dataset.rosterQ)];
    if (!q) return;
    if (b.hasAttribute("data-roster-standin")) { upload.standins.add(nameKey(q.from)); revalidate(); return; }
    upload.draft.players[q.i].name = b.dataset.rosterTo;
    upload.check = checkDraft(upload.draft);
    renderUpload();
  };
  const pick = document.getElementById("series-pick");
  if (pick) pick.onchange = () => {
    upload.seriesId = Number(pick.value) || null;
    const s = upData()?.series.find((x) => x.id === upload.seriesId);
    const tname = (id) => upData().teams.find((t) => t.id === id)?.name ?? "";
    if (s && !upload.draft.team_a && !upload.draft.team_b) { upload.draft.team_a = tname(s.home); upload.draft.team_b = tname(s.away); }
    upload.check = checkDraft(upload.draft);
    renderUpload();
  };
  const toggle = document.getElementById("private");
  if (toggle) toggle.onchange = (e) => { upload.isPrivate = e.target.checked; upload.check = checkDraft(upload.draft); renderUpload(); };
  document.getElementById("discard").onclick = () => {
    if (upload.editing) { const { back } = upload.editing; endEdit(); location.hash = back; return; }
    if (upload.quick) upload.isPrivate = false;
    Object.assign(upload, { draft: null, check: null, notes: [], names: [], standins: new Set(), quick: false });
    renderUpload();
  };
  app.querySelectorAll("select[data-team]").forEach((sel) => (sel.onchange = () => {
    const t = sel.dataset.team;
    upload.newTeam[t] = sel.value === "__new";
    upload.draft[`team_${t}`] = sel.value === "__new" ? "" : sel.value;
    upload.check = checkDraft(upload.draft);
    renderUpload();
    if (upload.newTeam[t]) app.querySelector(`input[data-path="team_${t}"]`)?.focus();
  }));
  // A typed new team name shows up in the Winner menu as you type.
  app.querySelectorAll('input[data-path="team_a"], input[data-path="team_b"]').forEach((inp) => inp.addEventListener("input", () => {
    const t = inp.dataset.path.slice(-1);
    const opt = app.querySelector(`select[data-path="winner"] option[value="${t}"]`);
    if (opt && upload.quick) opt.textContent = inp.value.trim() || `Team ${t.toUpperCase()}`;
  }));
  const maybe = upload.names.filter((n) => !n.sure);
  app.querySelectorAll("[data-name-fix]").forEach((b) => b.onclick = () => {
    const n = maybe[Number(b.dataset.nameFix)];
    upload.draft.players[n.i].name = n.to;
    upload.names = upload.names.map((x) => x === n ? { ...x, sure: true } : x);
    upload.check = checkDraft(upload.draft);
    renderUpload();
  });
}

// Typing in the review form (upload or edit) re-checks the draft.
app.addEventListener("input", (e) => { if (upload.draft && e.target.closest(".edit")) onDraftInput(e); });
