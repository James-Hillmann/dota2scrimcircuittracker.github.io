// Shared by every page: escaping and formatting helpers, page headers and breadcrumbs, the
// AD2L divisions and their data (loading, caches, the time machine), the scrim list, the
// upload/edit lock and the review form's pieces other pages reuse, page tabs, sortable tables.
import { playerKey, heroSlug, withDerived, isRemake, hasDetails } from "./lib/stats.js";
import { MIN_GAMES } from "./lib/tiers.js";
import { heroImg } from "./lib/hero-meta.js";
import { teamSlug, sideOf } from "./lib/teams.js";
import { goldCurves, teamObjectives, teamTimeline, BIG_LEAD } from "./lib/timeline.js";
import { lineChart, leadChart } from "./lib/charts.js";
import { wardMapHtml } from "./lib/wardmap.js";
import { teamLogoHtml } from "./lib/team-logos.js";
import { aliasOf, openGames, asAd2l } from "./lib/unticketed.js";
import { listMatches } from "./lib/store.js";
import { info } from "./lib/glossary.js";
import { ordinal, RANK_STATS, RANK_GROUPS } from "./lib/ranks.js";
import { routeOf, sharePath } from "./lib/share.js";
import { withNicknames, loadNicknames, displayName } from "./lib/nicknames.js";
import { DIVISIONS as DIVISION_LIST, fullName, SEASON } from "./lib/divisions.js";
import { teamSplits } from "./lib/combat.js";
import { isBye } from "./lib/playoffs.js";

// lib/tour.js loads after the first page (bottom of app.js), except when a reload left a tour
// mid-way: loading it puts the tour's tab choices back in storage, which the page modules read
// as they start. This file is the first of them to run, so it loads the tour here first.
try { if (sessionStorage.getItem("tour-kept")) await import("./lib/tour.js"); } catch { /* storage blocked */ }

export const app = document.getElementById("app");
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString());
export const pct = (x) => (x == null ? "—" : `${Math.round(x * 100)}%`);
export const dur = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
export const when = (d) => (d ? d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "");

// With `bar` (a playerTabs bar), the page's tabs sit on the title's line, to the right, as on
// the team, player and hero pages.
export const pageHead = (kicker, title, sub = "", bar = "") => bar ? `
  <header class="page-head pp-head reveal">
    <div class="kicker" style="--i:0">${kicker}</div>
    <div class="pp-row" style="--i:1"><h1>${title}</h1>${sub ? `<p class="pp-sub">${sub}</p>` : ""}${bar}</div>
  </header>` : `
  <header class="page-head reveal">
    <div class="kicker" style="--i:0">${kicker}</div>
    <h1 style="--i:1">${title}</h1>
    ${sub ? `<p style="--i:2">${sub}</p>` : ""}
  </header>`;
// Browser tab title: the page first, then where it sits, then the site.
export const setTitle = (...parts) => { document.title = [...parts, "AD2L Stat Tracker"].join(" · "); };
// Breadcrumbs on a detail page (player, hero, team, game): league › list › this page, and the
// tab title from the same trail. `list` is [label, href]; `name` is plain text (escaped here).
const leagueCrumb = (src) => src.all ? ["All divisions", "#/all/"]
  : src.ad2l ? [`${DIVISIONS[src.key].short}${src.view ? ` ${src.view.toUpperCase()}` : ""}`, `${src.root}/`] : ["Scrim League", "#/scrims/"];
export function crumbs(src, list, name) {
  const trail = [leagueCrumb(src), list];
  setTitle(name, list[0], trail[0][0]);
  return `<nav class="crumbs" aria-label="Breadcrumb"><ol>${trail.map(([label, href]) => `<li><a href="${href}">${esc(label)}</a></li>`).join("")}<li aria-current="page">${esc(name)}</li></ol></nav>`;
}
// A team name that opens the team's page. AD2L teams by PlayOn id (looked up by name when
// only the name is known); scrim teams by name (#/scrims/teams/<slug>). Inside something that's already a link
// (a match card), nested=true gives a span handled by the click listener at the bottom.
function teamHref(src, name, id = null) {
  if (!name) return null;
  if (src.ad2l) {
    id ??= src.cache()?.teams.find((t) => t.name.trim().toLowerCase() === name.trim().toLowerCase())?.id;
    return id != null ? `${src.root}/teams/${id}` : null;
  }
  return `${src.root}/teams/${teamSlug(name)}`;
}
export function teamLink(src, name, id = null, nested = false) {
  const href = teamHref(src, name, id);
  if (!href) return esc(name ?? "");
  const mark = teamLogoHtml({ id, name }, "inline-team-logo");
  return nested
    ? `<span class="team-link" role="link" tabindex="0" data-href="${href}">${mark}<span>${esc(name)}</span></span>`
    : `<a class="team-link" href="${href}">${mark}<span>${esc(name)}</span></a>`;
}
// A player's pages elsewhere: the same /players/<account ID> path on Stratz, OpenDota and
// Dotabuff, and their PlayOn page when the roster gave its id. "" without a numeric account ID.
export function profileLinks(accountId, playonId = null, sep = " · ") {
  if (!/^\d+$/.test(String(accountId ?? ""))) return "";
  const out = [["Stratz", "https://stratz.com"], ["OpenDota", "https://www.opendota.com"], ["Dotabuff", "https://www.dotabuff.com"]]
    .map(([name, base]) => [name, `${base}/players/${accountId}`]);
  if (playonId) out.push(["PlayOn", `https://dota.playon.gg/players/${playonId}`]);
  return out.map(([name, href]) => `<a href="${href}" target="_blank" rel="noopener">${name} ↗</a>`).join(sep);
}
// A player name that opens their page (same nested rule as teamLink).
export const playerHref = (src, key) => `${src.root}/player/${encodeURIComponent(key)}`;
export function playerLink(src, p, nested = false, label = null) {
  const href = playerHref(src, p.key ?? playerKey(p));
  const text = label ?? esc(displayName(p));
  return nested
    ? `<span class="player-link" role="link" tabindex="0" data-href="${href}">${text}</span>`
    : `<a class="player-link" href="${href}">${text}</a>`;
}
// A hero name that opens the hero's page (same nested rule as teamLink).
export const heroHref = (src, hero) => `${src.root}/hero/${heroSlug(hero)}`;
export function heroLink(src, hero, nested = false) {
  const href = heroHref(src, hero);
  return nested
    ? `<span class="hero-link" role="link" tabindex="0" data-href="${href}">${esc(hero)}</span>`
    : `<a class="hero-link" href="${href}">${esc(hero)}</a>`;
}
export const dec = (v) => (v == null ? "—" : v.toFixed(1));
// Short gold figure: 8,200 -> "8.2k".
export const kg = (v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)));

// Average gold curve for one player or hero against the division's core and support averages.
export function goldCurveSection(matches, match, what) {
  const c = goldCurves(matches, match);
  if (c.games < 1 || c.mine.length < 2) return "";
  return `<h2>Gold over time${info("gold_curve")}</h2>
    ${lineChart([
      { label: what, values: c.mine, cls: "s-mine", strong: true },
      { label: "Average core", values: c.core, cls: "s-ref", dash: true },
      { label: "Average support", values: c.support, cls: "s-ref2", dash: true },
    ], { caption: `Average gold at each minute over ${c.games} game${c.games === 1 ? "" : "s"}, against the division's average core and support. Hover for values.` })}`;
}

// Where one player / hero / team puts wards, over all their parsed games (own side bottom left).
export const wardView = (wards, what) => wardMapHtml([{ label: what, cls: "s-mine", wards }], { mirrored: true, mode: "vision" });

// The Map tabs: one card, one map at a time, picked with buttons above it. Views are
// [id, label, glossary key, html]; empty ones are dropped. The pick is remembered across pages,
// so going from a game's deaths to a player's opens their deaths.
const MAP_KEY = "mapView";
// layers: a game's overlay data (lib/maplayers.js), for the checkboxes shared by its maps.
export function mapCard(views, { layers = null } = {}) {
  const shown = views.filter(([, , , html]) => html?.trim());
  if (!shown.length) return "";
  let want = null;
  try { want = localStorage.getItem(MAP_KEY); } catch {}
  const open = shown.some(([id]) => id === want) ? want : shown[0][0];
  const btn = ([id, label]) => `<button type="button" class="seg${id === open ? " on" : ""}" data-view="${id}" aria-pressed="${id === open}">${label}</button>`;
  return `<section class="map-card"${layers ? ` data-layers="${esc(JSON.stringify(layers))}"` : ""}>
    ${shown.length > 1 ? `<div class="row segs map-segs" role="group" aria-label="Map">${shown.map(btn).join("")}</div>` : ""}
    ${shown.map(([id, label, tip, html]) => `<div class="map-view" data-view="${id}"${id === open ? "" : " hidden"}><h2>${label}${info(tip)}</h2>${html}</div>`).join("")}
  </section>`;
}
export function wireMapCards(root) {
  for (const card of root.querySelectorAll(".map-card")) {
    card.querySelector(".map-segs")?.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-view]");
      if (!b) return;
      const id = b.dataset.view;
      for (const x of card.querySelectorAll(".map-segs .seg")) { x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", String(x === b)); }
      for (const v of card.querySelectorAll(".map-view")) v.hidden = v.dataset.view !== id;
      try { localStorage.setItem(MAP_KEY, id); } catch {}
    });
  }
}

// A known other name (aliases.js) counts as the player's roster name, as in AD2L games.
export const scrimNames = (m, d) => (m.players ? { ...m, players: m.players.map((p) => ({ ...p, name: aliasOf(d, p.name) ?? p.name })) } : m);

// League data is small; load it once per visit and refresh after uploads.
// Callers that ask at the same time share one load.
let matchesReady = null;
export function allMatches(force = false) {
  if (!matchesReady || force) {
    matchesReady = Promise.all([listMatches(), divData("ad2l").catch(() => null)])
      .then(([list, d]) => withNicknames({ games: list.map((m) => withDerived(scrimNames(m, d))) }).games)
      .catch((e) => { matchesReady = null; throw e; });
  }
  return matchesReady;
}
// Games an upload can fill: missing from earlier weeks, or this week's not ticketed yet.
const thisWeekEnd = () => (weekStart(new Date()).getTime() + 7 * 864e5) / 1000;
export function missingGames(league, except = null) {
  const d = SOURCES[league].cache();
  return d ? openGames(d, uploadsBy[league] ?? [], thisWeekEnd(), except) : [];
}
// "Week 3 · A vs B · game 2 (PlayOn 2–0)" for the series pickers; d = that division's data.
function openGameLabel({ series: s, game, scored }, d) {
  const tname = Object.fromEntries((d?.teams ?? []).map((t) => [t.id, t.name]));
  const first = d?.series.filter((x) => x.time).reduce((m, x) => Math.min(m, x.time), Infinity);
  const week = Number.isFinite(first) && s.time ? `Week ${Math.round((weekStart(new Date(s.time * 1000)) - weekStart(new Date(first * 1000))) / (7 * 864e5)) + 1} · ` : "";
  return `${week}${tname[s.home] ?? "?"} vs ${tname[s.away] ?? "?"} · game ${game} ${scored ? `(PlayOn ${s.home_score}–${s.away_score})` : "(not scored yet)"}`;
}
export const seriesOptions = (opts, selected, d) => opts.filter((g, i, all) => all.findIndex((x) => x.series.id === g.series.id) === i)
  .map((g) => `<option value="${g.series.id}" ${selected === g.series.id ? "selected" : ""}>${esc(openGameLabel(g, d))}</option>`).join("");

// The league's shared password for deleting or moving someone else's upload. It only gates
// the buttons (anyone reading this file can see it); remembered for this tab.
const EDIT_PASSWORD = "ad2l";
let editOk = false; // fallback when session storage is blocked
export const editUnlocked = () => { try { return editOk || sessionStorage.getItem("scrim-edit") === "1"; } catch { return editOk; } };
export function unlockEdit(pw) {
  if ((pw ?? "").trim().toLowerCase() !== EDIT_PASSWORD) return false;
  editOk = true;
  try { sessionStorage.setItem("scrim-edit", "1"); } catch {}
  return true;
}
export const lockEdit = () => { editOk = false; try { sessionStorage.removeItem("scrim-edit"); } catch {} };

// ---------- Leagues ----------
// The same pages show community scrims (screenshots uploaded to Firestore) and each AD2L
// division's ticketed games (one data file each, built offline from PlayOn rosters + OpenDota
// match details by `npm run sync -- <division>`). The divisions themselves are listed in
// lib/divisions.js. Each division has its own unticketed uploads and predictions under its
// key; the scrim team lists use Champion's ("ad2l"). `views`: the division is played in
// sub-divisions (Heroic/Aegis: A and B). `slug`: the address when it isn't the key (Champion is
// keyed "ad2l" in the data files, Firestore and predictions, but lives at #/champion; #/ad2l
// is the league picker).
export const DIVISIONS = Object.fromEntries(DIVISION_LIST.map((d) => [d.key,
  { name: fullName(d), short: d.name, file: `data/${d.key}.json`, ...(d.slug && { slug: d.slug }), ...(d.views && { views: d.views }) }]));

async function loadDivision(file) {
  const res = await fetch(file, { cache: "no-cache" });
  if (!res.ok) throw new Error("The AD2L data hasn't been published yet.");
  const [raw] = await Promise.all([res.json(), loadNicknames()]);
  const d = withNicknames(raw);
  d.games = d.games.filter((g) => !isRemake(g)).map((g) => withDerived({ ...g, createdAt: new Date(g.start_time * 1000) }));
  return d;
}
// divCache: loaded files, for the pages that read them synchronously. divReady: the loads,
// so callers that ask at the same time share one fetch.
export const divCache = {}, divReady = {};
export function divData(key) {
  return divReady[key] ??= loadDivision(DIVISIONS[key].file).then((d) => (divCache[key] = d))
    .catch((e) => { delete divReady[key]; throw e; });
}
// Another division's games for the overall ranks and search: the deploy's trimmed copy
// (scripts/deploy/lite-data.js: no timelines, ward spots or items; the ranks come out the same, at
// about a third of the download). The full file when it's already loaded, or when there's
// no copy (npm start serves public/ as committed).
const liteReady = {};
export function divLite(key) {
  if (divCache[key]) return Promise.resolve(divCache[key]);
  return liteReady[key] ??= loadDivision(DIVISIONS[key].file.replace(/\.json$/, "-lite.json")).catch(() => divData(key))
    .catch((e) => { delete liteReady[key]; throw e; });
}

// "My team": the visitor's own AD2L team, set under the settings cog or beside a hero grid, kept
// in this browser. Hero grids read the draft model against it. A change anywhere fires "myteam"
// on window (other tabs get it through the storage event, app.js).
const MY_TEAM_KEY = "my-team";
export function myTeam() {
  try { const v = JSON.parse(localStorage.getItem(MY_TEAM_KEY)); return v?.div && v.id != null ? v : null; } catch { return null; }
}
// `auto`: set from the Steam sign-in (parts/me.js), the team whose roster has you. A choice made
// by hand (a team, or None) is kept as such, and sign-in never overrides it.
export function setMyTeam(t, { auto = false } = {}) {
  const v = t ? { div: t.div, id: t.id, name: t.name, ...(auto ? { auto: true } : {}) } : null;
  try { localStorage.setItem(MY_TEAM_KEY, JSON.stringify(v ?? { none: true })); } catch { /* not remembered */ }
  dispatchEvent(new CustomEvent("myteam", { detail: v }));
}
// Whether sign-in may set My team: never chosen, or last set by sign-in itself.
export function myTeamAutoOk() {
  try { const raw = localStorage.getItem(MY_TEAM_KEY); return raw == null || !!JSON.parse(raw)?.auto; } catch { return false; }
}
// <option>s for a "my team" <select>: none, then every division's teams (each division's lite
// file, loaded once), without PlayOn's bye-week placeholders. Option values are "div:id".
let teamListReady = null;
export async function myTeamOptions(selected = myTeam()) {
  teamListReady ??= Promise.all(ALL_DIVS.map(async (k) => [k, await divLite(k).catch(() => null)]))
    .then((all) => all.filter(([, d]) => d?.teams?.length).map(([k, d]) => ({ k, teams: d.teams.filter((t) => !isBye(t)).sort((a, b) => a.name.localeCompare(b.name)) })));
  const sel = selected ? `${selected.div}:${selected.id}` : "";
  return `<option value="">None set</option>${(await teamListReady).map(({ k, teams }) => `<optgroup label="${esc(DIVISIONS[k].name)}">${teams.map((t) => `<option value="${k}:${t.id}"${sel === `${k}:${t.id}` ? " selected" : ""}>${esc(t.name)}</option>`).join("")}</optgroup>`).join("")}`;
}
// A "div:id" option value back to a team ({ div, id, name }), or null.
export async function teamFromOption(v) {
  if (!v) return null;
  const [k, id] = v.split(":");
  const t = (await teamListReady)?.find((x) => x.k === k)?.teams.find((x) => String(x.id) === id);
  return t ? { div: k, id: t.id, name: t.name } : null;
}

// Unticketed games uploaded from screenshots (Firestore), per division. If the database
// can't be reached the division's view still works from the static file.
const uploadsBy = {};
export async function divUploaded(league, force = false) {
  if (!uploadsBy[league] || force) uploadsBy[league] = await listMatches(league).catch((e) => { console.warn("unticketed games unavailable", e); return []; });
  return uploadsBy[league];
}

// Heroic/Aegis is one league played in two divisions. Its A and B views are the same data
// narrowed to that division's teams, the series they played and the games between them;
// Combined is the whole file. Uploads and predictions stay under the league's own key.
const divViews = new WeakMap();
function inDivision(d, div) {
  const views = divViews.get(d) ?? divViews.set(d, {}).get(d);
  if (views[div]) return views[div];
  const ids = new Set(d.teams.filter((t) => t.division === div).map((t) => t.id));
  return views[div] = {
    ...d, division: div,
    teams: d.teams.filter((t) => ids.has(t.id)),
    series: d.series.filter((s) => ids.has(s.home) && ids.has(s.away)),
    games: d.games.filter((g) => ids.has(g.team_a_id) && ids.has(g.team_b_id)),
  };
}

async function divGames(src) {
  const d = await src.data();
  const ids = src.view ? new Set(d.teams.map((t) => t.id)) : null;
  const up = (await divUploaded(src.key)).filter((u) => !u.private).map((u) => withDerived(asAd2l(u, d)))
    .filter((g) => !isRemake(g) && (!ids || (ids.has(g.team_a_id) && ids.has(g.team_b_id))));
  return up.length ? [...d.games, ...up].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)) : d.games;
}

// Scrim pages live under #/scrims/ like a division's under #/<slug>/ (old #/week, #/teams…
// links forward, app.js route). Teams (#/scrims/) holds the table, the matches and the team grid.
export const SOURCES = {
  scrim: {
    key: "scrim", kicker: "The ledger", load: allMatches, root: "#/scrims",
    link: (m) => `#/scrims/match/${m.id}`, base: "#/scrims/content",
    empty: `The ledger is empty. <a href="#/scrims/upload">Upload the first scrim</a>.`,
    nav: [["#/scrims/", "standings", "Teams"], ["#/scrims/content", "week", "Content"], ["#/scrims/players", "players", "Players"], ["#/scrims/heroes", "heroes", "Heroes"], ["#/scrims/predict", "predict", "Predict"], ["#/scrims/gallery", "gallery", "Gallery"], ["#/scrims/upload", "upload", "Upload", "nav-cta"]],
  },
};
// AD2L divisions: `ad2l` marks the PlayOn/OpenDota pages, `root` prefixes their routes
// (#/<slug>, else #/<key>), `data`/`cache` give that division's file.
export const bySlug = Object.fromEntries(Object.entries(DIVISIONS).map(([key, dv]) => [dv.slug ?? key, key]));
for (const [key, dv] of Object.entries(DIVISIONS)) {
  const root = `#/${dv.slug ?? key}`;
  SOURCES[key] = {
    key, ad2l: true, root, data: () => divData(key), cache: () => divCache[key],
    division: dv.name, kicker: `AD2L · ${dv.name}`, load: () => divGames(SOURCES[key]),
    link: (m) => `${root}/game/${m.id}`, base: `${root}/content`,
    empty: `No ticketed ${dv.short} games found yet.`,
    nav: [[`${root}/`, "standings", "Teams"], [`${root}/content`, "week", "Content"], [`${root}/players`, "players", "Players"], [`${root}/heroes`, "heroes", "Heroes"], [`${root}/predict`, "predict", "Predict"], [`${root}/drafter`, "drafter", "Drafter"], [`${root}/gallery`, "gallery", "Gallery"], [`${root}/upload`, "upload", "Upload", "nav-cta"]],
  };
  // Sub-division views (#/heroic/a/..., #/heroic/b/...): same pages and league key, data
  // narrowed to that sub-division. Plain #/<key>/... is Combined.
  for (const v of dv.views ?? []) {
    const div = v.toUpperCase(), vroot = `${root}/${v}`, h = SOURCES[key];
    const src = SOURCES[`${key}_${v}`] = {
      ...h, view: v, root: vroot,
      data: async () => inDivision(await divData(key), div), cache: () => divCache[key] && inDivision(divCache[key], div),
      kicker: `${h.kicker} · Division ${div}`, load: () => divGames(src),
      link: (m) => `${vroot}/game/${m.id}`, base: `${vroot}/content`,
      empty: `No ticketed Division ${div} games found yet.`,
      nav: h.nav.map(([href, ...rest]) => [href.replace(root, vroot), ...rest]),
    };
  }
}

// Every division at once (#/all): the division files merged, each team tagged with its
// league and, as `division`, the box it plays in (Heroic/Aegis per sub-division), so Matches
// and Crosstable split by division. Team ids, series ids and match ids don't collide between
// divisions. Read-only: no Predict or Upload, and a game opens in its own division.
export const ALL_DIVS = DIVISION_LIST.map((d) => d.key); // the menu's order
export const gameLeague = new Map(); // match id -> division key, filled as the games load
let allCache = null, allReady = null;
function allData() {
  allReady ??= Promise.all(ALL_DIVS.map(async (key) => [key, await divData(key)])).then((parts) => {
    for (const [key, d] of parts) for (const g of d.games) gameLeague.set(g.id, key);
    const label = (key, t) => (DIVISIONS[key].views && t.division ? `${DIVISIONS[key].short} ${t.division}` : DIVISIONS[key].short);
    return allCache = {
      season: `${SEASON.name} All Divisions`, updated: parts.map(([, d]) => d.updated).sort().at(-1), pubs_days: parts[0][1].pubs_days,
      teams: parts.flatMap(([key, d]) => d.teams.map((t) => ({ ...t, league: key, division: label(key, t) }))),
      series: parts.flatMap(([, d]) => d.series),
      games: parts.flatMap(([, d]) => d.games).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)),
      pubs: Object.assign({}, ...parts.map(([, d]) => d.pubs)),
    };
  }).catch((e) => { allReady = null; throw e; });
  return allReady;
}
// Same array while no division's games change, so the stat caches (keyed by it) still hit.
let allGames = { parts: [], list: null };
export async function allLoad() {
  const parts = await Promise.all(ALL_DIVS.map(async (key) => {
    const gs = await SOURCES[key].load();
    for (const g of gs) gameLeague.set(g.id, key);
    return gs;
  }));
  if (!allGames.list || parts.some((p, i) => p !== allGames.parts[i]))
    allGames = { parts, list: parts.flat().sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)) };
  return allGames.list;
}
SOURCES.all = {
  key: "all", ad2l: true, all: true, root: "#/all", data: allData, cache: () => allCache,
  division: `${SEASON.name} All Divisions`, kicker: `AD2L · ${SEASON.name} · Every division`, load: allLoad,
  link: (m) => `${SOURCES[gameLeague.get(m.id)]?.root ?? "#/all"}/game/${m.id}`, base: "#/all/content",
  empty: "No ticketed games found yet.",
  nav: [["#/all/", "standings", "Teams"], ["#/all/content", "week", "Content"], ["#/all/players", "players", "Players"], ["#/all/heroes", "heroes", "Heroes"], ["#/all/gallery", "gallery", "Gallery"]],
};
bySlug.all = "all";

// ---------- Pages of rows ----------

// A long list (table rows, a card grid) shows size items at a time, with page buttons under
// it: Prev, the first and last pages, the ones around the current page, Next, and "Show all".
// Lists up to a fifth over one page stay whole, so 27 rows never split 25 + 2 (slack: 1 pages
// strictly). page is
// where to start (-1 is everything); onChange(page) hears every switch, so a list redrawn by
// its owner can come back on the same page. at is where the buttons go after (the list itself
// by default; a table passes its scroll box).
export const PAGE_SIZE = 25;
export function pageList(list, { size = PAGE_SIZE, page = 0, at = list, onChange = null, slack = 1.2 } = {}) {
  if (!list) return;
  list._pager?.remove();
  list._pager = null;
  const items = [...list.children], total = items.length, pages = Math.ceil(total / size);
  items.forEach((it) => it.classList.remove("pg-off"));
  if (total <= size * slack) return;
  const nav = document.createElement("nav");
  nav.className = "pager";
  nav.setAttribute("aria-label", "Pages");
  const btn = (pg, label, { on = false, off = false, cls = "" } = {}) =>
    `<button type="button" class="${cls}${on ? " on" : ""}" data-pg="${pg}"${on ? ' aria-current="page"' : ""}${off ? " disabled" : ""}>${label}</button>`;
  const show = (p) => {
    page = p;
    items.forEach((it, i) => it.classList.toggle("pg-off", p >= 0 && (i < p * size || i >= (p + 1) * size)));
    if (p < 0) {
      nav.innerHTML = `<span class="pg-range">All ${total}</span>${btn(0, "Show pages", { cls: "pg-all" })}`;
      return;
    }
    const near = [...new Set([0, pages - 1, p - 1, p, p + 1])].filter((i) => i >= 0 && i < pages).sort((a, b) => a - b);
    nav.innerHTML = btn(p - 1, "‹ Prev", { off: p === 0, cls: "pg-step" })
      + near.map((i, j) => `${j && i - near[j - 1] > 1 ? '<span class="pg-gap">…</span>' : ""}${btn(i, i + 1, { on: i === p })}`).join("")
      + btn(p + 1, "Next ›", { off: p === pages - 1, cls: "pg-step" })
      + `<span class="pg-range">${p * size + 1}–${Math.min(total, (p + 1) * size)} of ${total}</span>${btn("all", "Show all", { cls: "pg-all" })}`;
  };
  nav.onclick = (e) => {
    const b = e.target.closest("[data-pg]");
    if (!b || b.disabled) return;
    show(b.dataset.pg === "all" ? -1 : Number(b.dataset.pg));
    onChange?.(page);
    // From the buttons under a long page, bring the list's top back into view.
    const top = (at === list ? list : at).getBoundingClientRect().top;
    if (top < 0) (at === list ? list : at).scrollIntoView({ block: "start", behavior: "smooth" });
  };
  at.after(nav);
  list._pager = nav;
  show(Math.min(page, pages - 1));
}

// ---------- Leaderboards ----------

// columns: [key, label, format?, class?, bar colour?, info?]. A bar colour draws a thin bar under
// the value, scaled to the column's highest value. Info is a glossary id for the header's
// info bubble; by default the column key is looked up, and false turns it off.
// With { toolbar: true } a "Sort by" menu and direction toggle sit above the table, for
// people who don't think to click headers (and for phones, where the table scrolls).
// Fitting to the screen: when the table is wider than its box it first tightens (two
// density steps); if it still doesn't fit, the columns after the first (the name, which
// stays put) are split into pages that each fit, with tabs to switch between them. It
// refits when the table's width changes.
// Long tables show PAGE_SIZE rows at a time (pageList); sorting goes back to the first page.
// For the search tables (parts/tables.js): dir ("asc" | "desc") to start with, nullsLast (empty
// values after every value, in either direction) and onSort(key, dir) after a change.
export function sortableTable(el, columns, rows, sortKey, { toolbar = false, dir: startDir = "desc", nullsLast = false, onSort = null } = {}) {
  let key = sortKey, dir = startDir === "asc" ? 1 : -1, density = 0, pages = null, page = 0, rowPage = 0;
  const max = Object.fromEntries(columns.filter((c) => c[4]).map(([k]) => [k, Math.max(...rows.map((r) => r[k] ?? 0)) || 1]));
  const labelOf = Object.fromEntries(columns.map(([k, l]) => [k, l]));
  const pageOf = (k) => pages?.findIndex((pg) => pg.includes(k)) ?? -1;
  const cell = ([k, , f, cls, bar], r) => {
    const barCls = bar ? ` bar ${bar}` : "";
    const style = bar ? ` style="--w:${Math.max(0, (r[k] ?? 0) / max[k]).toFixed(3)}"` : "";
    return `<td class="${cls ?? ""}${barCls}"${style}>${f ? f(r[k], r) : esc(r[k])}</td>`;
  };
  const draw = () => {
    const sorted = [...rows].sort((a, b) => {
      const x = a[key], y = b[key];
      if (nullsLast && (x == null || y == null)) return x == null ? (y == null ? 0 : 1) : -1;
      // Text columns: blanks go last either way (null minus a string is NaN, which jumbles the sort).
      if (typeof x === "string" || typeof y === "string") return x == null ? (y == null ? 0 : 1) : y == null ? -1 : dir * -String(x).localeCompare(String(y));
      return dir * ((x ?? -Infinity) - (y ?? -Infinity));
    });
    const bar = toolbar ? `<div class="sort-bar">
        <label>Sort by <select class="sort-key">${columns.filter(([, label]) => label).map(([k, label]) => `<option value="${k}" ${k === key ? "selected" : ""}>${label}</option>`).join("")}</select></label>
        <button class="sort-dir" type="button">${dir < 0 ? "High → low" : "Low → high"}</button>
        <span class="sort-hint">or click any column header ↕</span>
      </div>` : "";
    const paged = pages && pages.length > 1;
    const cols = paged ? columns.filter(([k], i) => i === 0 || pages[page].includes(k)) : columns;
    const range = (pg) => (pg.length > 1 ? `${labelOf[pg[0]]} – ${labelOf[pg.at(-1)]}` : labelOf[pg[0]]);
    const pager = paged ? `<div class="col-pager" role="group" aria-label="Column pages">
        <button type="button" class="cp-step" data-step="-1" ${page === 0 ? "disabled" : ""} aria-label="Previous columns">‹</button>
        ${pages.map((pg, i) => `<button type="button" class="cp-page${i === page ? " on" : ""}" data-page="${i}" aria-pressed="${i === page}">${esc(range(pg))}</button>`).join("")}
        <button type="button" class="cp-step" data-step="1" ${page === pages.length - 1 ? "disabled" : ""} aria-label="More columns">›</button>
      </div>` : "";
    el.innerHTML = `${bar}${pager}<div class="table-wrap sticky-name${density ? ` d${density}` : ""}"><table>
      <thead><tr><th scope="col" class="rank">#</th>${cols.map(([k, label, , cls, , tip]) => label ? `<th scope="col" class="sortable ${cls ?? ""}${k === key ? " sorted" : ""}" data-k="${k}" title="Sort by ${label}"
        aria-sort="${k === key ? (dir < 0 ? "descending" : "ascending") : "none"}">${label}${tip === false ? "" : info(tip ?? k)}<span class="sort-ico">${k === key ? (dir < 0 ? "▾" : "▴") : "↕"}</span></th>` : '<th scope="col"></th>').join("")}</tr></thead>
      <tbody>${sorted.map((r, i) => `<tr><td class="rank${i < 3 ? " lead" : ""}">${String(i + 1).padStart(2, "0")}</td>${cols.map((c) => cell(c, r)).join("")}</tr>`).join("")}</tbody>
    </table></div>`;
    pageList(el.querySelector("tbody"), { page: rowPage, at: el.querySelector(".table-wrap"), onChange: (p) => (rowPage = p) });
    el.querySelectorAll("th.sortable").forEach((th) => (th.onclick = () => {
      if (th.dataset.k === key) dir = -dir; else { key = th.dataset.k; dir = -1; }
      if (rowPage > 0) rowPage = 0;
      onSort?.(key, dir < 0 ? "desc" : "asc");
      draw();
    }));
    if (toolbar) {
      // Sorting by a column on another page flips to that page.
      el.querySelector(".sort-key").onchange = (e) => { key = e.target.value; dir = -1; if (rowPage > 0) rowPage = 0; if (pageOf(key) >= 0) page = pageOf(key); onSort?.(key, "desc"); draw(); };
      el.querySelector(".sort-dir").onclick = () => { dir = -dir; if (rowPage > 0) rowPage = 0; onSort?.(key, dir < 0 ? "desc" : "asc"); draw(); };
    }
    el.querySelectorAll(".cp-page").forEach((b) => (b.onclick = () => { page = +b.dataset.page; draw(); }));
    el.querySelectorAll(".cp-step").forEach((b) => (b.onclick = () => { page = Math.min(pages.length - 1, Math.max(0, page + +b.dataset.step)); draw(); }));
  };
  const refit = () => {
    const anchor = pages?.[page]?.[0];
    density = 0; pages = null; page = 0;
    draw();
    const wrap = () => el.querySelector(".table-wrap");
    const over = () => wrap().clientWidth > 0 && wrap().scrollWidth > wrap().clientWidth + 1;
    while (over() && density < 2) { wrap().classList.remove(`d${density}`); density++; wrap().classList.add(`d${density}`); }
    if (!over()) return;
    // Pack the columns after the name into pages, using their widths at this density.
    const widths = [...wrap().querySelectorAll("thead th")].map((th) => th.getBoundingClientRect().width);
    const room = wrap().clientWidth - widths[0] - widths[1] - 2;
    const pack = (limit) => {
      const out = [];
      let cur = [], used = 0;
      columns.slice(1).forEach(([k], i) => {
        const w = widths[i + 2];
        if (cur.length && used + w > limit) { out.push(cur); cur = []; used = 0; }
        cur.push(k); used += w;
      });
      if (cur.length) out.push(cur);
      return out;
    };
    // Fewest pages that fit, then the narrowest page width that still gives that many
    // pages, so the columns split evenly instead of one full page and a stub.
    const n = pack(room).length;
    let lo = Math.max(...widths.slice(2)), hi = room;
    while (hi - lo > 1) { const mid = (lo + hi) / 2; if (pack(mid).length <= n) hi = mid; else lo = mid; }
    pages = pack(hi);
    page = Math.max(0, pageOf(anchor ?? key));
    draw();
  };
  el._refit = refit;
  refit();
  // Refit when the table's box changes width (window resize, rotation, zoom).
  if (!el._fitObserver && "ResizeObserver" in window) {
    let width = el.clientWidth, timer;
    el._fitObserver = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      clearTimeout(timer);
      timer = setTimeout(() => el._refit?.(), 120);
    });
    el._fitObserver.observe(el);
  }
  el.dataset.fit = "";
}

// Backup for browsers without ResizeObserver: refit on window resize too (a refit that
// finds nothing changed is cheap).
let fitTimer;
window.addEventListener("resize", () => {
  clearTimeout(fitTimer);
  fitTimer = setTimeout(() => document.querySelectorAll("[data-fit]").forEach((el) => !el._fitObserver && el._refit?.()), 150);
});

// Hero card grids (.hp-grid): fewest rows that fit, then split the cards evenly across them,
// so 8 cards go 4 + 4 instead of 7 + 1. Phones keep the CSS two-column layout.
const HP_MIN = 220, HP_GAP = 10;
const narrow = matchMedia("(max-width: 1000px)");
function balanceGrid(el) {
  const n = el.children.length, w = el.clientWidth;
  if (narrow.matches || !n || !w) return void el.style.removeProperty("grid-template-columns");
  const rows = Math.ceil(n / Math.max(1, Math.floor((w + HP_GAP) / (HP_MIN + HP_GAP))));
  el.style.gridTemplateColumns = `repeat(${Math.ceil(n / rows)}, minmax(0, 1fr))`;
}
// Grids arrive with page and tab renders (often in a hidden tab, width 0): watch for them,
// and rebalance each when its width changes.
if ("ResizeObserver" in window) {
  const ro = new ResizeObserver((es) => es.forEach((e) => balanceGrid(e.target)));
  const seen = new WeakSet();
  const watch = () => document.querySelectorAll(".hp-grid").forEach((el) => {
    if (seen.has(el)) return;
    seen.add(el);
    balanceGrid(el); // now, so the first paint is already balanced
    ro.observe(el);
  });
  new MutationObserver(watch).observe(document.body, { childList: true, subtree: true });
  watch();
  narrow.addEventListener("change", () => document.querySelectorAll(".hp-grid").forEach(balanceGrid));
}

// ---------- Ranks ----------
// Stat leaders and hero ranks: in the page's league, and "overall" across every AD2L league
// (each division once; Heroic/Aegis as Combined). Overall needs every division's file, so it
// loads after the page draws and fills in when ready. Scrims have no overall.

export const statRowsCache = new WeakMap(), heroRankCache = new WeakMap();
// Hero lines for the hero page's ranks: every hero's games added up the way a player's are
// (key "hero:<name>", games = picks), plus pick, contest and ban rates.
export const heroRowsCache = new WeakMap();

// Every AD2L league's games, over the same weeks as `src` when the time machine is on (weeks
// are calendar weeks, so they line up across leagues). One load per pick.
// Each division reads through divLite (the page's own division is already loaded in full).
const everyLeague = new Map(), liteSrcs = {};
function liteSrc(key) {
  if (liteSrcs[key]) return liteSrcs[key];
  const s = liteSrcs[key] = { ...SOURCES[key], data: () => divLite(key) };
  s.load = () => divGames(s);
  return s;
}
export function allLeagues(src) {
  const sel = src.weeks, sig = sel ? [...sel].sort().join() : "";
  if (!everyLeague.has(sig)) everyLeague.set(sig, Promise.all(Object.keys(DIVISIONS).map(async (key) => ({ key, matches: (await (sel ? timeSrc(liteSrc(key), sel) : liteSrc(key)).load()).filter(hasDetails) })))
    .catch((e) => { everyLeague.delete(sig); throw e; }));
  return everyLeague.get(sig);
}
export const inLeague = (src, key) => (r) => r.league === src.key && r.key === key;
export const LEAGUE_COUNT = Object.keys(DIVISIONS).length;
export const leagueShort = (src) => (src.all ? "every division" : src.ad2l ? DIVISIONS[src.key].short : "the scrims");

// "2nd overall" / "Last overall" on anyone in the top or bottom 3 across every league.
export function overallBadge(pl) {
  if (!pl?.end) return "";
  const text = pl.end === "top" ? `${ordinal(pl.rank)} overall` : pl.fromBottom === 1 ? "Last overall" : `${ordinal(pl.fromBottom)}-last overall`;
  return `<span class="ov-badge ov-${pl.end}${pl.end === "top" ? ` ov-${pl.rank}` : ""}">${text}</span>`;
}
export const heroVal = (p) => p.rating_exact;

// Player page: their place on every stat, in the league and overall. The hero page uses it
// too, ranking one hero against every other (HERO_RANKS).
export const PLAYER_RANKS = { stats: RANK_STATS, groups: RANK_GROUPS, id: "stat-ranks", title: "Stat ranks", tip: "stat_ranks", unit: "games" };

// Hero page: everyone who played it, best hero rating first: tier letter, rating, record, and
// their place on it in the league and across every league (medal colours for a top 3).
export const HERO_PLAYERS_SHOWN = 12;

// Recent pubs on the player page and the players table: the PUB_DAYS days before the
// division's last sync (the sync keeps 30). Predictions still read pubs since the last
// league night.
export const PUB_DAYS = 14;
export const pubStart = (d) => (d?.updated ? Date.parse(d.updated) / 1000 : Date.now() / 1000) - PUB_DAYS * 86400;
export const pubStartLabel = (d) => new Date(pubStart(d) * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });

// Pub practice: their league games on a hero they'd played in pubs that week, against the rest.
// Only games far enough inside the pub window that the week before is all on record.
export const PREP_DAYS = 7;

// Team Map and Resources tabs: objectives and vision (Map), gold (Resources), each number ranked
// against every team in the league (games with replay data), so what a team is good or bad at
// stands out.
const leagueMapCache = new WeakMap();
function leagueTeamMap(matches, teams) {
  const hit = leagueMapCache.get(matches);
  if (hit) return hit;
  const share = (a, b) => (a + b ? a / (a + b) : null);
  const out = new Map(teams.map((t) => {
    const side = (m) => sideOf(m, t);
    const gs = matches.filter(side);
    const o = teamObjectives(gs, side), tl = teamTimeline(gs, side), fb = teamSplits(gs, side).first_blood;
    return [t.key, o || tl ? { team: t, o, tl, v: {
      rosh: o && share(o.roshans, o.roshans_against), first: o?.first_rosh.games ? o.first_rosh.taken / o.first_rosh.games : null,
      torm: o && share(o.tormentors, o.tormentors_against),
      obs: o?.obs_pg ?? null, sen: o?.sen_pg ?? null, dewards: o?.dewards_pg ?? null, stacks: o?.stacks_pg ?? null,
      lead10: tl?.lead10 ?? null, lead20: tl?.lead20 ?? null,
      fb: fb.games ? fb.taken / fb.games : null,
    }, fb } : null];
  }).filter(([, x]) => x));
  leagueMapCache.set(matches, out);
  return out;
}

export const signedK = (v) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${kg(Math.abs(v))}`;
// [key, label, value format, glossary id, strength phrase]
const MAP_METRICS = {
  rosh: ["Roshan control", pct, "team_roshans", "Roshan control"],
  first: ["First Roshan", pct, "first_roshan", "first Roshan"],
  torm: ["Tormentor control", pct, "team_tormentors", "Tormentors"],
  obs: ["Observers / game", dec, "team_wards", "observer wards"],
  sen: ["Sentries / game", dec, "team_wards", "sentry wards"],
  dewards: ["Dewards / game", dec, "team_dewards", "dewarding"],
  stacks: ["Stacks / game", dec, "team_stacks", "stacking"],
  lead10: ["Gold at 10'", signedK, "lead10", "gold at 10 minutes"],
  lead20: ["Gold at 20'", signedK, "lead20", "gold at 20 minutes"],
  fb: ["First blood", pct, "team_first_blood", "first blood"],
};

// part: "map" = strengths and weak spots, objectives, vision; "gold" = the Resources tab's gold block.
export function teamMapHtml(src, matches, teams, team, h, part = "map") {
  const all = leagueTeamMap(matches, teams), me = all.get(team.key);
  if (!me) return "";
  const field = [...all.values()];
  // Rank among teams with a value (1 = most); top / bottom ~30% get coloured.
  const rankOf = (k) => {
    const mine = me.v[k];
    const vals = field.map((x) => x.v[k]).filter((v) => v != null);
    if (mine == null || vals.length < 3) return null;
    const rank = 1 + vals.filter((v) => v > mine + 1e-9).length, n = vals.length, band = Math.max(1, Math.round(n * 0.3));
    return { rank, n, vals, tone: rank <= band ? "good" : rank > n - band ? "bad" : "mid" };
  };
  const ranks = Object.fromEntries(Object.keys(MAP_METRICS).map((k) => [k, rankOf(k)]));

  // A dot per team on one line, this team's big and coloured, so its place reads at a glance.
  const strip = (k) => {
    const r = ranks[k];
    if (!r) return "";
    const lo = Math.min(...r.vals), hi = Math.max(...r.vals), at = (v) => (hi > lo ? ((v - lo) / (hi - lo)) * 100 : 50);
    return `<div class="lc-strip" aria-hidden="true">${field.filter((x) => x.v[k] != null && x !== me).map((x) => `<i style="left:${at(x.v[k]).toFixed(1)}%" title="${esc(x.team.name)}: ${MAP_METRICS[k][1](x.v[k])}"></i>`).join("")}
      <b style="left:${at(me.v[k]).toFixed(1)}%"></b></div>`;
  };
  const card = (k, sub, extra = "", i = 0) => {
    const [label, f, tip] = MAP_METRICS[k], r = ranks[k];
    return `<div class="card lc ${r?.tone ?? ""}" style="--i:${i}">
      <div class="k">${label}${info(tip)}</div>
      <div class="lc-top"><div class="v">${me.v[k] == null ? "—" : f(me.v[k])}</div>${r ? `<span class="lc-rank">${ordinal(r.rank)}<small> of ${r.n}</small></span>` : ""}</div>
      ${extra}${strip(k)}<div class="s">${sub}</div></div>`;
  };
  const split = (a, b) => (a + b ? `<div class="split" title="${a} taken, ${b} given up"><i style="flex:${a}"></i><i style="flex:${b}"></i></div>` : "");
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

  // Headline: where they're top or bottom of the league.
  const tops = Object.keys(MAP_METRICS).filter((k) => ranks[k]?.tone === "good").sort((a, b) => ranks[a].rank - ranks[b].rank);
  const lows = Object.keys(MAP_METRICS).filter((k) => ranks[k]?.tone === "bad").sort((a, b) => ranks[b].rank - ranks[a].rank);
  const chip = (k) => `<span class="sum-chip ${ranks[k].tone}"><b>${ordinal(ranks[k].rank)}</b> ${MAP_METRICS[k][3]}</span>`;
  const summary = tops.length || lows.length ? `<div class="tm-sum reveal">
      ${tops.length ? `<div><span class="sum-k">Strengths</span>${tops.map(chip).join("")}</div>` : ""}
      ${lows.length ? `<div><span class="sum-k">Weak spots</span>${lows.map(chip).join("")}</div>` : ""}
    </div><p class="table-note">Ranked against the ${field.length} teams in ${esc(leagueShort(src))} with replay data. Green = top 30%, red = bottom 30%.</p>` : "";

  const { o, tl } = me;
  const objectives = o ? `<h2>Objectives</h2><div class="cards lc-cards reveal">
      ${card("rosh", `${o.roshans} taken, ${o.roshans_against} given up in ${plural(o.games, "game")}`, split(o.roshans, o.roshans_against), 0)}
      ${card("first", o.first_rosh.games ? `took it in ${o.first_rosh.taken} of ${o.first_rosh.games} · won ${o.first_rosh.wins} of those` : "no Roshan kills yet", "", 1)}
      ${card("torm", `${o.tormentors} taken, ${o.tormentors_against} given up`, split(o.tormentors, o.tormentors_against), 2)}
      ${me.fb.games ? card("fb", `drew it in ${me.fb.taken} of ${plural(me.fb.games, "game")} · won ${me.fb.wins_taken} of those, ${me.fb.wins_given} of ${me.fb.games - me.fb.taken} without`, split(me.fb.taken, me.fb.games - me.fb.taken), 3) : ""}
    </div>
    <h2>Vision &amp; jungle</h2><div class="cards lc-cards reveal">
      ${card("obs", "observers placed, whole team", "", 0)}
      ${card("sen", "sentries placed, whole team", "", 1)}
      ${card("dewards", "enemy wards killed", "", 2)}
      ${card("stacks", "camps stacked", "", 3)}
    </div>` : "";

  let gold = "";
  if (tl) {
    const rec = ({ games, wins }) => (games ? `<span class="rec"><b class="w">${wins}</b>–<b class="l">${games - wins}</b></span>` : "—");
    const gameRef = (r, v) => (r ? `<a href="${src.link(r.m)}">${kg(v)} vs ${esc(r.side === "a" ? r.m.team_b : r.m.team_a)}</a>` : "none yet");
    const mini = (k, v, s, tip) => `<div class="card mini"><div class="k">${k}${info(tip)}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
    const ghosts = tl.rows.map((r) => ({ values: r.adv, won: r.won, href: src.link(r.m),
      label: `${r.won ? "Won" : "Lost"} vs ${r.side === "a" ? r.m.team_b : r.m.team_a} · ${Math.round(r.m.duration_sec / 60)} min` }));
    gold = `<h2>Gold${info("team_gold")}</h2>
      <div class="tg-grid">
        <div class="tg-chart">${leadChart(tl.curve, { nameA: team.name, nameB: "Opponents", id: `team-lead-${team.slug}`, ghosts, counts: tl.counts, peaks: false })}</div>
        <div class="tg-side">
          <div class="cards lc-cards two">${card("lead10", "average lead at 10 minutes", "", 0)}${card("lead20", "average lead at 20 minutes", "", 1)}</div>
          <div class="cards mini-cards">
            ${(() => { const lead = teamSplits(matches, (m) => sideOf(m, team)).lead;
              const pair = (t) => (t === 20
                ? `${mini("Ahead at 20'", rec(tl.ahead20), "record when leading", "ahead20")}${mini("Behind at 20'", rec(tl.behind20), "record when trailing", "behind20")}`
                : `${mini(`Ahead at ${t}'`, rec(lead[t].ahead), "record when leading", "lead_conversion")}${mini(`Behind at ${t}'`, rec(lead[t].behind), "record when trailing", "lead_conversion")}`);
              return [10, 20, 30].map(pair).join(""); })()}
            ${mini("Comebacks", String(tl.comebacks), `won from ${kg(BIG_LEAD)}+ down · biggest: ${gameRef(tl.best_comeback, tl.best_comeback?.trail)}`, "comebacks")}
            ${mini("Throws", String(tl.throws), `lost from ${kg(BIG_LEAD)}+ up · biggest: ${gameRef(tl.worst_throw, tl.worst_throw?.led)}`, "throws")}
          </div>
        </div>
      </div>`;
  }
  return part === "gold" ? gold : `${summary}${objectives}`;
}

// Page tabs: one panel shows at a time. Empty panels (no map data in scrims) get no tab. A fresh
// page opens on its first available tab unless its address names one. Each tab click is its own
// history step with ?tab=<id>, so Back and copied links still reopen the intended tab. Pages can
// opt into restoring their last tab with remember: true.
const TAB_KEY = "playerTab";
export const tabInUrl = () => history.state?.tab ?? new URLSearchParams(location.search).get("tab");
export function playerTabs(tabs, { store = TAB_KEY, label = "Player sections", remember = false } = {}) {
  const shown = tabs.filter(([, , html]) => html.trim());
  let want = tabInUrl();
  if (remember && !shown.some(([id]) => id === want)) try { want = localStorage.getItem(store); } catch {}
  const open = shown.some(([id]) => id === want) ? want : shown[0][0];
  return {
    bar: `<div class="pp-tabs" role="tablist" aria-label="${label}" data-store="${store}">${shown.map(([id, label]) => `<button type="button" role="tab" id="pp-tab-${id}"
      aria-controls="pp-panel-${id}" aria-selected="${id === open}" tabindex="${id === open ? 0 : -1}" data-tab="${id}">${label}</button>`).join("")}</div>`,
    panels: shown.map(([id, , html]) => `<section class="pp-panel" role="tabpanel" id="pp-panel-${id}" aria-labelledby="pp-tab-${id}"${id === open ? "" : " hidden"}>${html}</section>`).join(""),
  };
}
// "Move subtabs" (settings cog): a page's tabs (or the Content page's weeks) move into a sidebar
// on the left, opened by its handle. Wide screens: it docks and the page moves over, and stays
// open (remembered) while you switch. Phones: it slides over the page; picking one closes it.
export const subtabsMoved = () => { try { return localStorage.getItem("moveSubtabs") === "1"; } catch { return false; } };
const SIDE_KEY = "sideOpen", wideSide = matchMedia("(min-width: 1001px)");
// groups: [{ label, el }]; each el moves into the sidebar under its label. now(): the handle's text.
export function sideBar(groups, now) {
  groups = groups.filter((g) => g.el);
  if (!groups.length) return;
  const side = document.createElement("div");
  side.className = "side";
  side.innerHTML = `<div class="side-shade" hidden></div>
    <aside class="side-panel" id="side-panel" aria-label="Page sections" inert>
      ${groups.map((g, i) => `<div class="side-group" data-i="${i}"><div class="menu-label">${esc(g.label)}</div></div>`).join("")}
    </aside>
    <button type="button" class="side-handle" aria-expanded="false" aria-controls="side-panel" title="Page sections">
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 3 5 5-5 5"/></svg>
      <span class="side-now"></span></button>`;
  groups.forEach((g, i) => side.querySelector(`.side-group[data-i="${i}"]`).append(g.el));
  const panel = side.querySelector(".side-panel"), handle = side.querySelector(".side-handle"), shade = side.querySelector(".side-shade");
  const label = () => { side.querySelector(".side-now").textContent = now?.() || groups[0].label; };
  const isOpen = () => side.classList.contains("open");
  const set = (open, { keyboard = false, remember = true } = {}) => {
    side.classList.toggle("open", open);
    panel.inert = !open;
    shade.hidden = !open || wideSide.matches;
    handle.setAttribute("aria-expanded", String(open));
    if (remember && wideSide.matches) try { localStorage.setItem(SIDE_KEY, open ? "1" : "0"); } catch {}
    if (open && keyboard) panel.querySelector('[aria-selected="true"], [aria-current="page"], a, button')?.focus({ preventScroll: true });
  };
  app.append(side);
  label();
  // As wide as its longest entry: the handle and the page's shift follow it.
  const fit = () => { if (side.isConnected) app.style.setProperty("--side-w", `${Math.ceil(panel.getBoundingClientRect().width)}px`); };
  fit();
  document.fonts?.ready.then(fit);
  // Docked open last time: open it again without sliding in.
  let docked = false;
  try { docked = wideSide.matches && localStorage.getItem(SIDE_KEY) === "1"; } catch {}
  if (docked) { side.classList.add("still"); set(true, { remember: false }); requestAnimationFrame(() => requestAnimationFrame(() => side.classList.remove("still"))); }
  // A click's detail is 0 from the keyboard (Enter/Space): only then move focus into the list.
  handle.addEventListener("click", (e) => set(!isOpen(), { keyboard: e.detail === 0 }));
  shade.addEventListener("click", () => set(false));
  // The guided tour opens it to point at the tabs, without changing the remembered choice.
  side.addEventListener("side:open", () => { if (!isOpen()) set(true, { remember: false }); });
  panel.addEventListener("click", (e) => {
    if (!e.target.closest("[role=tab], a[href]")) return;
    setTimeout(label);
    if (!wideSide.matches) set(false);
  });
  side.addEventListener("keydown", (e) => { if (e.key === "Escape" && isOpen()) { set(false); handle.focus(); } });
  // Back/Forward switch tabs without a click: keep the handle's text in step.
  new MutationObserver(label).observe(panel, { subtree: true, attributes: true, attributeFilter: ["aria-selected"] });
  const away = (e) => {
    if (!side.isConnected) return document.removeEventListener("pointerdown", away);
    if (!wideSide.matches && !side.contains(e.target)) set(false, { remember: false });
  };
  document.addEventListener("pointerdown", away);
}
// The sticky header's height, so the sidebar starts just under it.
{
  const top = document.querySelector(".top");
  if (top) new ResizeObserver(() => document.documentElement.style.setProperty("--head-h", `${getComputedStyle(top).position === "sticky" ? top.offsetHeight : 0}px`)).observe(top);
}
export function wirePlayerTabs() {
  const bar = app.querySelector(".pp-tabs");
  if (!bar) return;
  if (subtabsMoved()) sideBar([{ label: "Sections", el: bar }], () => bar.querySelector('[aria-selected="true"]')?.textContent.trim());
  const btns = [...bar.querySelectorAll("[role=tab]")];
  const withTab = (id) => { const u = new URL(location.href); u.searchParams.set("tab", id); return u.pathname + u.search + u.hash; };
  // The tab this history entry shows, so Back to it (or a reload) opens it again.
  history.replaceState({ ...history.state, tab: btns.find((x) => x.getAttribute("aria-selected") === "true")?.dataset.tab }, "");
  const pick = (b, focus = false, push = true) => {
    for (const x of btns) {
      const on = x === b;
      x.setAttribute("aria-selected", String(on));
      x.tabIndex = on ? 0 : -1;
      document.getElementById(x.getAttribute("aria-controls")).hidden = !on;
    }
    if (focus) b.focus();
    try { localStorage.setItem(bar.dataset.store, b.dataset.tab); } catch {}
    if (push && history.state?.tab !== b.dataset.tab) {
      history.pushState({ ...history.state, tab: b.dataset.tab }, "", withTab(b.dataset.tab));
      routedAt = location.href;
    }
    if (!push) return;
    // Switching from far down a long tab: bring the bar back up, just under the sticky header.
    const head = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--head-h")) || 0;
    const top = (bar.closest(".side") ? app.querySelector(".pp-panel:not([hidden])") ?? bar : bar).getBoundingClientRect().top;
    if (top < head) scrollTo({ top: scrollY + top - head - 12 });
  };
  bar.addEventListener("click", (e) => { const b = e.target.closest("[role=tab]"); if (b) pick(b); });
  bar.addEventListener("keydown", (e) => {
    const i = btns.indexOf(document.activeElement), step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 1, ArrowUp: -1 }[e.key];
    if (i < 0 || !step) return;
    e.preventDefault();
    pick(btns[(i + step + btns.length) % btns.length], true);
  });
  showTab = (id) => { const b = btns.find((x) => x.dataset.tab === id) ?? btns[0]; pick(b, false, false); };
}
// Set by the page's tab bar: opens a tab without a new history step (Back / Forward).
export let showTab = null;

// A series' games, each with its full Captains Mode draft in pick/ban order. Games without a
// draft are skipped but keep their number.
export const seriesDraftsHtml = (src, games) => games.map((m, j) => !m.draft?.length ? "" : `<div class="sd-game">
    <div class="sd-game-head"><span class="gp-label">Game ${j + 1}</span>
      <span class="sd-win">${esc(m.winner === "a" ? m.team_a : m.team_b)} win</span>
      <span class="gp-meta">${m.score_a}–${m.score_b} · ${dur(m.duration_sec)} · <a href="${src.link(m)}">Full stats →</a></span></div>
    ${draftStrip(m, src)}</div>`).join("");

// "Show at least N" filter above a table, so a hero picked once at 100% doesn't top the list.
export const MIN_DEFAULT = (matches) => (matches.length >= 20 ? 3 : matches.length >= 8 ? 2 : 1);
export const minBar = (before, after, def) => `<div class="min-bar"><label>${before} <select id="min-n">${[1, 2, 3, 5, 10].map((n) => `<option value="${n}" ${n === def ? "selected" : ""}>${n}</option>`).join("")}</select> ${after}</label><span class="min-note" id="min-note"></span></div>`;
export function wireMinBar(rows, count, draw) {
  const sel = document.getElementById("min-n"), note = document.getElementById("min-note");
  const go = () => {
    const min = +sel.value, shown = rows.filter((r) => count(r) >= min);
    note.textContent = shown.length < rows.length ? `${rows.length - shown.length} of ${rows.length} hidden (under ${min})` : "";
    draw(shown);
  };
  sel.onchange = go;
  // Never open on an empty table: with few games the default can hide every row.
  while (sel.selectedIndex > 0 && !rows.some((r) => count(r) >= +sel.value)) sel.selectedIndex--;
  go();
}

// ---------- Weekly recap ----------

// Weeks run Monday 00:00 → Sunday (local time).
export function weekStart(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
export const shortDate = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });

// A game's MVP: the winning-side player with the best average of damage share, kill
// participation and net-worth share.
export function gameMvp(m) {
  const nwTotal = (t) => m.teamTotals[t].net_worth || 1;
  const rate = (p) => ((p.dmg_share ?? 0) + (p.kill_participation ?? 0) + p.net_worth / nwTotal(p.team)) / 3;
  return m.players.filter((p) => p.team === m.winner).sort((a, b) => rate(b) - rate(a))[0];
}

export const portrait = (hero, cls = "") => {
  const src = heroImg(hero);
  return src ? `<img class="hero-img ${cls}" src="${src}" alt="${esc(hero)}" title="${esc(hero)}" loading="lazy">` : `<span class="hero-img ${cls} missing" title="${esc(hero)}">${esc(hero.slice(0, 2))}</span>`;
};

// A row of small hero portraits, each linking to the hero's page, with "×n" when played more than once.
export const heroStrip = (src, list) => (list?.length
  ? `<span class="hero-strip">${list.map(({ hero, n }) => `<a href="${heroHref(src, hero)}" title="${esc(hero)}${n > 1 ? ` ×${n}` : ""}">${portrait(hero)}${n > 1 ? `<b>${n}</b>` : ""}</a>`).join("")}</span>`
  : '<span class="muted">—</span>');

// part: "top" = Radiant's row and the legend, "bottom" = Dire's row; omitted = both rows together.
export function draftStrip(m, src, part) {
  if (!m.draft?.length) return `<p class="draft-none">Draft order isn't on the post-game screen, so scrims show lineups only.</p>`;
  // Team A is Radiant: its bans and picks on the top row, Dire's below. Numbers keep the overall order.
  const step = (s, i) => `
    <a class="draft-step ${s.pick ? "pick" : "ban"} side-${s.side}" href="${heroHref(src, s.hero)}" title="${i + 1}. ${s.side === "a" ? esc(m.team_a) : esc(m.team_b)} ${s.pick ? "picks" : "bans"} ${esc(s.hero)}">
      ${portrait(s.hero)}<span class="draft-tag">${s.pick ? "Pick" : "Ban"} ${i + 1}</span>
    </a>`;
  // A phase is a run of consecutive bans or picks in the draft; a gap marks each new phase in a row.
  const run = []; m.draft.forEach((s, i) => run.push(i && !!s.pick === !!m.draft[i - 1].pick ? run[i - 1] : (run[i - 1] ?? -1) + 1));
  // Bans on top, picks below, each in draft order.
  const row = (side) => `<div class="draft draft-${side}">${[false, true].map((pick) => {
    let last = null;
    const cells = m.draft.map((s, i) => {
      if (s.side !== side || !!s.pick !== pick) return "";
      const gap = last !== null && run[i] !== last ? '<i class="draft-gap"></i>' : "";
      last = run[i];
      return gap + step(s, i);
    }).join("");
    return `<div class="draft-${pick ? "picks" : "bans"}">${cells}</div>`;
  }).join("")}</div>`;
  if (part === "bottom") return `<div class="draft-rows draft-bottom" aria-label="Dire draft">${row("b")}</div>`;
  return `<div class="draft-rows" aria-label="Draft order">${row("a")}${part === "top" ? "" : row("b")}</div>
    <div class="draft-legend"><span class="lg a">${esc(m.team_a)}</span><span class="lg b">${esc(m.team_b)}</span><span class="lg ban">Ban</span><span class="lg pick">Pick</span></div>`;
}

// Time machine: see Standings, Teams, Players and Heroes as they stood over chosen weeks.
// A pick is a set of week starts (Monday, ms) per league, kept for the browser session; no
// pick means every week. AD2L games and series count toward their series' scheduled week,
// as on the Weekly page; scrims use the game's date.
export const TM_KEY = "time-machine";
export const timeSel = (() => {
  try { return Object.fromEntries(Object.entries(JSON.parse(sessionStorage.getItem(TM_KEY)) ?? {}).map(([k, v]) => [k, new Set(v)])); }
  catch { return {}; }
})();
export const seriesWeek = (s) => (s.time ? weekStart(new Date(s.time * 1000)).getTime() : null);
// A game's week; d = the division's data (null for scrims).
export function gameWeeker(d) {
  const sched = new Map((d?.series ?? []).filter((s) => s.time).map((s) => [s.id, new Date(s.time * 1000)]));
  return (m) => { const t = sched.get(m.series_id) ?? m.createdAt; return t ? weekStart(t).getTime() : null; };
}
// Narrowed copies, memoized per source object and pick so the stat caches (keyed by the
// games array) still hit on re-renders.
const tmMemo = new WeakMap();
const memoTM = (obj, sig, make) => {
  const m = tmMemo.get(obj) ?? tmMemo.set(obj, new Map()).get(obj);
  return m.get(sig) ?? m.set(sig, make()).get(sig);
};
function narrowDiv(d, sel, sig) {
  return memoTM(d, sig, () => {
    const wk = gameWeeker(d);
    return { ...d, series: d.series.filter((s) => sel.has(seriesWeek(s))), games: d.games.filter((g) => sel.has(wk(g))) };
  });
}
// The source as seen through the time machine (the source itself when every week is on).
// `sel` defaults to the league's own pick. A week or two holds only a game or four per player,
// so the ranking floor (MIN_GAMES) drops to the number of weeks picked.
export function timeSrc(src, sel = timeSel[src.key]) {
  if (!sel?.size) return src;
  const sig = [...sel].sort().join();
  return {
    ...src, weeks: sel, minGames: Math.min(MIN_GAMES, sel.size),
    data: async () => narrowDiv(await src.data(), sel, sig),
    cache: () => { const d = src.cache(); return d && narrowDiv(d, sel, sig); },
    load: async () => {
      const [all, d] = await Promise.all([src.load(), src.ad2l ? src.data() : null]);
      return memoTM(all, sig, () => { const wk = gameWeeker(d); return all.filter((m) => sel.has(wk(m))); });
    },
  };
}
// Games a player needs to be ranked on this source (lower under a short time-machine pick).
export const floorOf = (src) => src.minGames ?? MIN_GAMES;
// The whole league behind a source (Combined for a Heroic A/B view), over the same weeks.
export const leagueSrc = (src) => (src.weeks ? timeSrc(SOURCES[src.key], src.weeks) : SOURCES[src.key]);

// Addresses: routes are "#/..." inside the app, but the address bar shows the /path/ form
// (/warrior/players/) whenever the page has a link-preview page (lib/share.js), so a link
// pasted from the address bar previews as that page in Discord, not as the home page.
// Other pages stay /#/... . Old #/ links still work; a /path/ address with no hash (a
// reload, or the local server) routes from the path.
export function here() {
  if (location.hash) return location.hash;
  const p = location.pathname.replace(/index\.html$/, "");
  return p === "/" ? "#/" : routeOf(p);
}
export const addressOf = (h) => sharePath(h) ?? `/${h === "#/" ? "" : h}`;
// hashchange and popstate both fire on some back/forward steps: route once per address.
export let routedAt = null;
// app.js moves it too (an imported binding is read-only there).
export const setRoutedAt = (v) => { routedAt = v; };
// In-app navigation to "#/x?tab=…&at=…": move the address without a page load (every query
// parameter rides along), then route as a hash change would.
export function navigate(href) {
  const [h, q = ""] = href.split("?");
  const params = new URLSearchParams(q), tab = params.get("tab");
  const u = new URL(addressOf(h), location.href);
  for (const [k, v] of params) u.searchParams.set(k, v);
  history.pushState(tab ? { tab } : null, "", u.pathname + u.search + u.hash);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}
// Scroll an element to just under the sticky header.
export function scrollToSection(el) {
  scrollTo({ top: scrollY + el.getBoundingClientRect().top - (document.querySelector(".top")?.offsetHeight ?? 0) - 12 });
}
// Site search links end in &at=<glossary key or element id>. After a page draws, scroll to that
// section in the open tab (else anywhere on the page: cards above the tabs, a header badge) and
// flash it once; then drop `at` from the address so a copied link doesn't flash again. Sections
// some pages fill a moment later get one more look.
export function goToSection() {
  const u = new URL(location.href), at = u.searchParams.get("at");
  if (!at) return;
  u.searchParams.delete("at");
  history.replaceState(history.state, "", u.pathname + u.search + u.hash);
  setRoutedAt(location.href);
  const within = (scope) => {
    const btn = scope.querySelector(`[data-info="${CSS.escape(at)}"]`);
    if (btn && !btn.closest("dialog")) return btn.closest(".card, .td-tile") ?? btn.closest("h2, h3") ?? btn.parentElement;
    return scope.querySelector(`#${CSS.escape(at)}`);
  };
  const find = () => {
    const panel = app.querySelector(".pp-panel:not([hidden])");
    return (panel && within(panel)) ?? within(app);
  };
  const flash = (el) => {
    // A section folded away (player Heroes' "Pubs and other leagues ▾") opens first.
    for (let d = el.closest("details:not([open])"); d; d = d.parentElement?.closest("details:not([open])")) d.open = true;
    scrollToSection(el);
    el.classList.remove("search-flash");
    void el.offsetWidth; // restart the animation
    el.classList.add("search-flash");
    el.addEventListener("animationend", () => el.classList.remove("search-flash"), { once: true });
  };
  const el = find();
  if (el) return flash(el);
  setTimeout(() => { const later = find(); if (later) flash(later); }, 600);
}
