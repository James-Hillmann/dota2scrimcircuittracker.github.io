// Guided tour: a first-visit invite, then a walk through real pages. Each stop darkens the
// page around one element (a gold box), shows a caption, and on mouse devices a fake cursor
// glides over and clicks what the tour clicks. The tour runs in the league you're on; stops
// whose element never shows up (an empty league, a private game) are skipped. It only tours
// AD2L divisions (the scrims have far fewer stats): the first stop makes you pick one.
// Design: docs/superpowers/specs/2026-09-29-guided-tour-design.md
import { SEASON } from "./divisions.js";
import { markPackOffer } from "./bonus-offers.js";

// "Move subtabs" puts the page tabs in a closed sidebar (core.js sideBar): open it before
// pointing at them or clicking one.
function showTabs(el) {
  const side = el?.closest?.(".side");
  if (side && !side.classList.contains("open")) side.dispatchEvent(new Event("side:open"));
  return el;
}

const SEEN_KEY = "tour-seen";
// The saved choices, also kept for the session: a reload mid-tour restores them on load.
const KEPT_KEY = "tour-kept";
// Where a paused (or reloaded) tour stands: its chapter, stop, start page and picked pages.
// While it's set, the footer's "New here?" reads "Resume". Exit tour clears it.
const PAUSE_KEY = "tour-paused";
// The tour opens tabs and works filters, and the site remembers some of those choices: all of
// localStorage is snapshotted at the start and put back at the end.

const app = document.getElementById("app");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const calm = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const mouse = () => window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;
const norm = (h) => (h ?? "").replace(/\/+$/, "") || "#";
const visible = (el) => !!el && el.getClientRects().length > 0 && !el.closest("[hidden]");
// A stop can box several elements at once (the search box and its results): their union.
const rectOf = (els) => els.filter(visible).map((e) => e.getBoundingClientRect()).reduce((a, r) => ({
  top: Math.min(a.top, r.top), left: Math.min(a.left, r.left), bottom: Math.max(a.bottom, r.bottom), right: Math.max(a.right, r.right),
}), { top: Infinity, left: Infinity, bottom: -Infinity, right: -Infinity });
const navHref = (key) => document.querySelector(`#nav a[data-nav="${key}"]`)?.getAttribute("href");
// The first letters of a real team or player name on the page, for the search stop to type.
const nameStart = () => (document.querySelector('#standings a.team-link, #app a[href*="/teams/"], #app a[href*="player/"]')?.textContent ?? "").trim().slice(0, 3) || "a";

let deps = null; // { go, here } from app.js
let run = null;  // the running tour

// Stale-run guard: every await in a stop checks the tour it belongs to is still the live one.
class Gone extends Error {}

// ---------- stops ----------
// Each stop: { when(ctx) → shown in this league?, enter(t) → element to box (null = skip),
// title, text (string or ctx → string), leave(t)? }. enter must work from any page, since
// Back re-enters the previous stop.

// The league's Teams page (the scrims' too, since they moved under #/scrims/).
const standingsKey = () => "standings";

const CORE = [
  {
    title: "Pick a league",
    text: `Every AD2L ${SEASON.name} division has its own standings, games, players and heroes. Switching keeps you on the same tab. Pick one to tour it.`,
    // No Next: the tour waits for a pick. The home page's buttons, else the league menu;
    // the scrims are hidden while it waits (body.tour-pick).
    pick: true,
    enter: async (t) => {
      document.body.classList.add("tour-pick");
      const hub = document.querySelector("#app .hub-list");
      if (visible(hub)) return hub;
      const btn = document.getElementById("league-btn");
      if (document.getElementById("league-menu").hidden) await t.click(btn);
      return document.getElementById("league-menu");
    },
    // Clicks on a division go through: the tour switches to it and carries on.
    pass: (t, el) => {
      const a = el.closest("#league-menu a[data-league], .hub-list a[data-league]");
      if (a && a.dataset.league !== "scrim") t.switchLeague(a);
    },
    leave: () => {
      document.body.classList.remove("tour-pick");
      const m = document.getElementById("league-menu"); if (!m.hidden) document.getElementById("league-btn").click();
    },
  },
  {
    title: "The main tabs",
    text: (ctx) => ctx.ad2l
      ? "Teams (the standings), Content (each week, and what's up next), Players, Heroes, Predict, and Upload for games played without a league ticket."
      : "Teams (the table, every match and the team cards), Content (each week's games), Players, Heroes, Predict, and Upload for adding a scrim from its screenshots.",
    enter: async () => document.getElementById("nav"),
  },
  {
    title: "Standings",
    text: (ctx) => ctx.ad2l
      ? "Every team by games won, with form, the model's rating and strength of schedule (past and remaining opponents). Click a team for its page."
      : "Every scrim team by game wins, with win %, kill difference and form. Private scrims count here too.",
    enter: async (t) => {
      await t.visit(navHref(standingsKey(t.ctx)));
      await t.tab("table");
      if (t.ctx.ad2l) return t.find("#pp-panel-table #t table");
      return t.find("#standings");
    },
  },
  {
    title: "What does that mean?",
    text: "Tap ⓘ next to any stat to see how it's worked out.",
    enter: async (t) => {
      await t.visit(navHref(standingsKey(t.ctx)));
      await t.tab("table");
      // The table's own bubbles, or (phones drop them from the table) any on the page.
      const btn = (await t.find(t.ctx.ad2l ? "#pp-panel-table .info" : "#standings .info", 2500)) ?? (await t.find("#app .info", 1000));
      if (!btn) return null;
      await t.click(btn);
      // Box the explanation it opened, so the caption sits clear of it.
      return t.find("#info-pop", 1500);
    },
    leave: () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })),
  },
  {
    title: "Pages have tabs",
    text: "Team, player, hero and game pages have tabs like these. Your last tab is remembered, and Back returns to the one before.",
    enter: async (t) => { if (!(await t.visitPicked("team"))) return null; return showTabs(await t.find(".pp-tabs")); },
  },
  {
    title: "Draft by phase",
    text: "The team's bans, bans against it, and picks in each draft phase. Hero pool W–L is above.",
    enter: async (t) => {
      if (!(await t.visitPicked("team"))) return null;
      const panel = await t.tab("heroes");
      // AD2L drafts: box the phase grid and its heading. Scrims have no draft: the hero pool.
      const grid = panel && (await t.find("#pp-panel-heroes .phase-grid", 1500));
      return grid ? [grid, grid.previousElementSibling, grid.previousElementSibling?.previousElementSibling].filter(Boolean) : panel;
    },
    alt: { selector: ".pp-panel", title: "Hero pool", text: "The heroes this team plays, with W–L on each." },
  },
  {
    title: "Division A, B or both",
    text: "Heroic/Aegis runs as two divisions. Pick one to see only its teams and games, or Combined for both.",
    when: (ctx) => ctx.league === "heroic",
    enter: async () => { const el = document.getElementById("div-switch"); return visible(el) ? el : null; },
  },
  {
    title: "Content",
    text: "One week at a time: player of the week and the other awards, then every game with lineups and MVP.",
    enter: async (t) => { await t.visit(navHref("week")); return t.find("#app > .cards") ?? t.find(".sp-tabs"); },
  },
  {
    title: "Tier list",
    text: "Every player with 3+ games, ranked S to D against players in the same role. Click a chip for the breakdown.",
    enter: async (t) => { await t.visit(navHref("players")); return (await t.find("#tiers .tier-band", 2500)) ?? t.find("#leaders"); },
    alt: { selector: "#leaders", title: "Stat leaders", text: "Who leads the league in each stat. The tier list appears once players have 3+ games." },
  },
  {
    title: "Search",
    text: "Find any player or team in any league. Press / from any page to jump here.",
    enter: async (t) => {
      const box = document.getElementById("search"), input = document.getElementById("search-in");
      await t.point(input);
      input.focus();
      if (!t.ctx.query) t.ctx.query = nameStart();
      for (const ch of t.ctx.query) { t.live(); input.value += ch; input.dispatchEvent(new Event("input")); await sleep(calm() ? 0 : 140); }
      const pop = await t.find("#search-pop", 2500);
      return pop ? [box, pop] : box;
    },
    leave: () => {
      const input = document.getElementById("search-in");
      input.value = ""; input.dispatchEvent(new Event("input"));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      input.blur();
    },
  },
];

// ---------- deep dive ----------
// Very detailed about what's easy to miss: every sub-tab (its button boxed with the section
// worth seeing in it), every map view, and the less obvious sections. Stat cards, standouts
// and page headers are left out: eyes go there anyway. Stops whose element isn't
// on this page (scrims have no map, laning or drafts) drop out.

const ad2l = (ctx) => ctx.ad2l;
const always = () => true;
const scrim = (ctx) => !ctx.ad2l;
const PICKED = ["team", "game", "player", "hero"];

// One highlighted section. page: a picked page (team/game/player/hero) or a nav key.
// tab: the sub-tab to open first (null = the page itself). sel: selector inside it, or a
// function (scope → element). head: also box the section's heading. btn: also box the tab's
// button (the first stop in each tab), so every tab is seen being opened.
const part = ({ page, tab = null, sel, head = false, btn = false, title, text, when }) => ({
  title, text, when,
  enter: async (t) => {
    if (!(await t.open(page))) return null;
    let scope = app;
    if (tab) { scope = await t.tab(tab); if (!scope) return null; }
    const el = typeof sel === "function" ? sel(scope) : await t.findIn(scope, sel, 2000);
    if (!el || !visible(el)) return null;
    const box = head ? t.withHead(el) : [el];
    if (tab && btn) { const b = showTabs(document.querySelector(`.pp-tabs [data-tab="${tab}"]`)); if (b) box.push(b); }
    return box;
  },
});
// A view inside the page's Map tab (wards, towers, deaths, team fights): the button and view.
const view = (page, id, title, text, when = ad2l) => ({
  title, text, when,
  enter: async (t) => ((await t.open(page)) ? t.mapView(id) : null),
});
// The game page's big chart: its two views.
const chart = (id, title, text) => ({
  title, text, when: ad2l,
  enter: async (t) => {
    if (!(await t.open("game")) || !(await t.tab("graphs"))) return null;
    const b = await t.find(`[data-chart-view="${id}"]`, 2500);
    if (!b) return null;
    if (b.getAttribute("aria-pressed") !== "true") await t.click(b);
    const c = await t.find(".gm-hero-chart");
    return c && [c, b];
  },
});
// The section under the h2 whose text matches re, inside scope (past any intro note).
const after = (re) => (scope) => {
  let e = [...scope.querySelectorAll("h2")].find((h) => re.test(h.textContent))?.nextElementSibling;
  while (e?.matches("p.table-note")) e = e.nextElementSibling;
  return e ?? null;
};
const group = (name, stops) => stops.map((s) => ({ ...s, group: name }));

// Using a filter. Opens the page, then the tab, map view or scope (a selector) it lives in,
// runs act (clicks a button, picks from a list), and boxes box (a selector in the scope) or
// the whole scope, so the change shows.
const filter = ({ page, tab, view: v, scope: sc, act, box, title, text, when = ad2l }) => ({
  title, text, when,
  enter: async (t) => {
    if (!(await t.open(page))) return null;
    let scope = app;
    if (v) { const r = await t.mapView(v); if (!r) return null; scope = r[0]; }
    else if (tab) { scope = await t.tab(tab); if (!scope) return null; }
    if (sc) { scope = await t.findIn(scope, sc, 2000); if (!scope) return null; }
    if (!(await act(t, scope))) return null;
    return box ? t.findIn(app, box, 1500) : scope;
  },
});
// Click whichever Radiant / Dire side button isn't showing (ward, fight and death maps).
const otherSide = async (t, scope) => {
  const b = [...scope.querySelectorAll(".wm-seg button")].find((x) => visible(x) && /^As (Radiant|Dire)/.test(x.textContent.trim()) && x.getAttribute("aria-pressed") !== "true");
  if (!b) return false;
  await t.click(b);
  return true;
};
// Click the segment button whose label matches re.
const seg = (re) => async (t, scope) => {
  const b = [...scope.querySelectorAll(".wm-seg button, .segs button")].find((x) => visible(x) && re.test(x.textContent.trim()));
  if (!b) return false;
  if (b.getAttribute("aria-pressed") !== "true" && !b.classList.contains("on")) await t.click(b);
  return true;
};
// Pick an option from a list: by index, or the first whose label matches a regex.
const choose = (sel, pick) => async (t, scope) => {
  const el = [...scope.querySelectorAll(sel)].find(visible);
  if (!el || el.options.length < 2) return false;
  const i = typeof pick === "number" ? pick : [...el.options].findIndex((o) => pick.test(o.textContent.trim()));
  if (i < 0) return false;
  await t.point(el);
  el.selectedIndex = i;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  await sleep(350);
  return true;
};

const DEEP = [
  ...group("Standings", [
    part({ page: "standings", tab: "matches", sel: ".mx-grid", btn: true, when: ad2l, title: "Matches",
      text: "Every series week by week, played and coming up: green won, red lost, gold tied. G1 and G2 open each game." }),
    part({ page: "standings", tab: "cross", sel: "table.ct", btn: true, when: ad2l, title: "Crosstable",
      text: "Every team against every other. Read across: the row team's score and the week. Empty cells haven't met yet." }),
    part({ page: "standings", tab: "race", sel: "figure.chart", btn: true, when: ad2l, title: "Race",
      text: "Every team's wins, week by week. Hover a line for its totals." }),
  ]),

  ...group("Content", [
    part({ page: "week", sel: ".fixtures", when: ad2l, title: "Up next",
      text: "The series still to play, with the model's odds for each." }),
    {
      title: "Every series has a tab",
      text: (ctx) => ctx.ad2l
        ? "Each series this week gets its own tab. Click one to see its games."
        : "Each game this week gets its own tab.",
      enter: async (t) => {
        await t.visit(navHref("week"));
        const bar = await t.find(".sp-tabs");
        const tabs = [...(bar?.querySelectorAll('[role="tab"]') ?? [])];
        if (tabs.length > 1 && tabs[1].getAttribute("aria-selected") !== "true") await t.click(tabs[1]);
        return bar;
      },
    },
    part({ page: "week", sel: ".series .game-panel", title: "Each game",
      text: (ctx) => ctx.ad2l
        ? "Both lineups with each player's line, the MVP, and the full draft in pick/ban order. Click through for the whole game."
        : "Both lineups with each player's line and the MVP. Click through for the whole game." }),
  ]),

  ...group("Team page", [
    part({ page: "team", tab: "overview", sel: ".cards", btn: true, title: "Overview",
      text: "Record, form over the last five games, average game length, and kills for and against." }),
    part({ btn: true, page: "team", tab: "overview", sel: ".h2h", head: true, title: "Head to head",
      text: "Its result against every team it has played." }),
    part({ btn: true, page: "team", tab: "roster", sel: "#t", head: true, title: "Player stats",
      text: "Every player's stats in this team's games. Sort by any column." }),
    part({ page: "team", tab: "games", sel: ".history", btn: true, title: "Every result",
      text: (ctx) => ctx.ad2l ? "Every series with each game's result, newest first, and the next one scheduled." : "Every game, newest first." }),
    part({ btn: true, page: "team", tab: "draft", sel: ".phase-grid", head: true, when: ad2l, title: "Draft by phase",
      text: "The team's bans, bans against it, and picks in each of the three phases." }),
    part({ page: "team", tab: "map", sel: ".tm-sum", btn: true, when: ad2l, title: "Strengths and weak spots",
      text: "Where the team ranks in the league on objectives, gold and vision: its best and worst." }),
    part({ page: "team", tab: "resources", sel: ".tg-grid", head: true, btn: true, when: ad2l, title: "Gold",
      text: "The gold lead in every game on one chart: when the team gets ahead, and whether it holds." }),
    view("team", "wards", "Team wards", "Where the team places its wards. Both sides shows Radiant and Dire games together, with Dire games flipped so the team's base is bottom left."),
    filter({ page: "team", view: "wards", act: otherSide, title: "Radiant or Dire",
      text: "Pick a side to see only those games, at their real spots on the map. Team fights has the same switch." }),
    filter({ page: "team", view: "wards", act: seg(/^0–10'$/), title: "Filter by time",
      text: "Every map filters by stretch of the game. Here: only wards placed in the first 10 minutes. You can also pick observers or sentries, one player, or switch dots to heat." }),
    view("team", "fights", "Team fights", "Where the team takes its fights. Heat shows where they happen. Net shows where it comes out ahead or behind."),
    filter({ page: "team", view: "fights", act: seg(/^Net$/), title: "Where it wins fights",
      text: "Net: green where the team comes out ahead, red where it comes out behind. Filter to wins or losses, own or enemy deaths, or a stretch of the game." }),
  ]),

  ...group("Game page", [
    part({ page: "game", sel: ".gm-draft", when: ad2l, title: "Draft",
      text: "All 24 draft steps in order: every ban and pick for both teams." }),
    chart("fights", "Items & fights", "The gold lead minute by minute, with each teamfight sized by deaths and coloured by who came out ahead, and core items on the same clock."),
    filter({ page: "game", tab: "graphs", scope: ".gm-hero-chart", title: "Chart layers",
      text: "Tick layers on and off: items, hero deaths, Roshan and Tormentor, towers and buybacks.",
      act: async (t, scope) => {
        const f = scope.querySelector('[data-chart-view="fights"]');
        if (f && f.getAttribute("aria-pressed") !== "true") await t.click(f);
        const box = [...scope.querySelectorAll("label")].find((l) => visible(l) && l.querySelector('input[type="checkbox"]') && /Towers/.test(l.textContent));
        if (!box) return false;
        await t.click(box.querySelector("input"));
        return true;
      } }),
    chart("worth", "Net worth by player", "Every player's gold, minute by minute. Solid lines for one team, dashed for the other."),
    part({ btn: true, page: "game", tab: "board", sel: ".gm-tape", head: true, title: "Team comparison",
      text: "The two teams side by side: kills, net worth, damage, towers, healing, stuns and wards." }),
    part({ page: "game", tab: "ratings", sel: ".gm-ratings", btn: true, title: "Ratings",
      text: "Each player's rating from this game alone, on the tier list's scale. Green tags lifted it, red held it back." }),
    part({ btn: true, page: "game", tab: "lanes", sel: ".table-wrap", head: true, when: ad2l, title: "Laning",
      text: "Every player's first 10 minutes in numbers." }),
    part({ page: "game", tab: "map", sel: ".obj-strip", head: true, btn: true, when: ad2l, title: "Vision & objectives",
      text: "Every Roshan and Tormentor with its time and the team that took it, then each player's wards, smokes, objectives and building damage." }),
    part({ page: "game", tab: "combat", sel: after(/^Stuns, damage taken/), head: true, btn: true, when: ad2l, title: "Stuns and survival",
      text: "Each player's stun time, damage taken and time dead side by side." }),
    part({ page: "game", tab: "items", sel: ".items-table", head: true, btn: true, when: ad2l, title: "Items",
      text: "Every player's final items, and when each core item was finished." }),
    view("game", "wards", "Wards", "Every ward both teams placed in this game."),
    filter({ page: "game", view: "wards", act: choose("select.wm-player", 1), title: "One player's wards",
      text: "Pick a player to see only their wards. Death maps have the same kind of picker for heroes." }),
    view("game", "towers", "Towers", "When each tower and barracks fell, and what was still standing at each phase."),
    view("game", "deaths", "Deaths", "Where every teamfight death happened, and every death on a timeline. Filter by team, player and time."),
    filter({ page: "game", view: "deaths", act: seg(/^20–35'$/), title: "Deaths by time",
      text: "Only the deaths from 20 to 35 minutes. Switch to kills, pick one hero, or one team." }),
  ]),

  ...group("Players", [
    filter({ page: "players", tab: "tiers", scope: "#tiers", act: seg(/^Supports$/), when: always, title: "Cores or supports",
      text: "Show the tier list for cores or supports only." }),
    part({ page: "players", tab: "tiers", sel: "details.how-tiers", title: "How it's scored",
      text: "Open this for how the tier list is worked out." }),
    filter({ page: "players", tab: "leaders", act: choose("#ld-stat", /^GPM$/), box: "#leaders", when: always, title: "Stat leaders",
      text: "Pick any stat from the list and see who leads the league in it. Here: GPM." }),
    filter({ page: "players", tab: "lanes", scope: "#lane-board", act: seg(/^Mid$/), title: "Lane board",
      text: "Every player's laning, one role at a time. Here: mid." }),
  ]),

  ...group("Player page", [
    part({ btn: true, page: "player", tab: "stats", sel: "#stat-ranks-box", title: "Stat ranks",
      text: "Where each stat ranks in this league and across every league." }),
    part({ page: "player", tab: "heroes", sel: "#hero-ranks-box", btn: true, title: "Hero pool",
      text: "Their rating on each hero, and where it places among everyone who played that hero." }),
    part({ page: "player", tab: "heroes", sel: (scope) => { const d = scope.querySelector(".pubs-fold"); if (d) d.open = true; return after(/^Recent pubs/)(scope); }, head: true, when: ad2l, title: "Recent pubs",
      text: "Their public games since the last league night: results, form and heroes." }),
    part({ btn: true, page: "player", tab: "lanes", sel: ".table-wrap", head: true, when: ad2l, title: "Every lane",
      text: "Each lane they played, game by game." }),
    part({ page: "player", tab: "items", sel: ".ih-chips", head: true, btn: true, when: ad2l, title: "Core items",
      text: "Pick a hero to see their item timings on it." }),
    part({ page: "player", tab: "items", sel: ".ih-view", when: ad2l, title: "Their timings",
      text: "Each core item: how often they build it, their average time, the league's on the same heroes, and the lead swing after it." }),
    view("player", "wards", "Their wards", "Where they place wards: both sides together, or only their Radiant or Dire games."),
    view("player", "deaths", "Their deaths", "Where and when they die, as Radiant or as Dire."),
    filter({ page: "player", view: "deaths", title: "Radiant or Dire",
      text: "Switch between their Radiant and Dire games. You can also filter by hero, wins or losses, and time.",
      act: otherSide }),
    filter({ page: "player", tab: "games", act: choose("select.sort-key", /^GPM$/), box: "#pp-panel-games #t", when: always, title: "Sort any table",
      text: "Every table sorts by any column: pick from the list, or click a column header." }),
    part({ page: "player", tab: "stats", sel: "#game-box", head: true, btn: true, title: "Game analysis",
      text: "Each game's stat line and how it placed among the 10 players, with their best game marked." }),
  ]),

  ...group("Hero page", [
    part({ btn: true, page: "hero", tab: "stats", sel: "figure.chart", head: true, when: ad2l, title: "Gold over time",
      text: "Its average gold curve against the division's average core and support." }),
    part({ page: "hero", tab: "players", sel: "#hero-players-box", btn: true, title: "Players on it",
      text: "Everyone who played it, their rating on it, and their place in this league and across every league." }),
    part({ page: "hero", tab: "players", sel: "#teams", head: true, title: "Teams",
      text: "Each team's picks and wins on it, its bans, and bans against it." }),
    part({ page: "hero", tab: "draft", sel: ".dp-grid-3", head: true, btn: true, when: ad2l, title: "Draft phases",
      text: "When it gets picked or banned in each of the three phases, and how it does." }),
    part({ btn: true, page: "hero", tab: "lanes", sel: ".table-wrap", head: true, when: ad2l, title: "Every lane",
      text: "Each lane it played, game by game." }),
    part({ page: "hero", tab: "items", sel: ".items-table", head: true, btn: true, when: ad2l, title: "Core items",
      text: "Each core item built on it: how often, average and fastest time, win % built, and the lead swing." }),
    view("hero", "wards", "Its wards", "Where players on this hero place wards."),
    view("hero", "deaths", "Its deaths", "Where and when this hero dies."),
    filter({ page: "hero", view: "deaths", act: seg(/^0–10'$/), title: "Early deaths",
      text: "Only deaths in the first 10 minutes: where this hero dies in the laning stage." }),
    part({ page: "hero", tab: "analysis", sel: "#game-box", head: true, btn: true, title: "Game analysis",
      text: "Each game on it and how the stat line placed among the 10 players." }),
  ]),

  ...group("Predict", [
    part({ page: "predict", sel: ".pred-name", title: "Your name",
      text: "Type the name you pick as. It's how you show up on the leaderboard, so use the same one each week." }),
    part({ page: "predict", tab: "calls", btn: true, sel: ".pred-card", when: ad2l, title: "Make your calls",
      text: "Pick 2–0 for either team, or 1–1. The bars show how everyone else picked and which call the model made. Picks lock when the series starts." }),
    part({ page: "predict", tab: "calls", sel: ".pred-card details.dr", when: ad2l, title: "Model's draft",
      text: "Open it for the model's full 24-step draft for the series, with a toggle for who has first pick." }),
    part({ page: "predict", tab: "board", btn: true, sel: ".sticky-name", head: true, when: ad2l, title: "Leaderboard",
      text: "One point per correct call. The model competes too. Click a name to see their bracket and final table." }),
    part({ page: "predict", tab: "bracket", btn: true, sel: ".po-progress", when: ad2l, title: "Your bracket",
      text: "Your calls played out to the final table and week 8 tiebreakers. Click winners to fill in the bracket from week 1 on. Switch to Model's picks to see the model's." }),
    part({ page: "predict", tab: "odds", btn: true, sel: ".po-poss", when: ad2l, title: "Seeding",
      text: "Each team's chance of each seed at the end of the group stage (not the playoff result). Click a cell for what that team needs." }),
    part({ page: "predict", sel: ".fx-add", when: scrim, title: "Add a scrim",
      text: "Add an upcoming scrim: two teams, start time, and Bo1, Bo2 or Bo3. Everyone can call it until it starts." }),
  ]),

  ...group("Tools", [
    {
      title: "Time machine",
      text: "Under the settings cog: see standings, teams, players and heroes as they stood over any weeks you pick.",
      enter: async (t) => {
        await t.visit(navHref(standingsKey(t.ctx)));
        if (document.getElementById("settings-pop").hidden) await t.click(document.getElementById("settings-btn"));
        return t.find("#tm", 2500); // shows once the league has 2+ weeks
      },
      leave: () => { if (!document.getElementById("settings-pop").hidden) document.getElementById("settings-btn").click(); },
    },
    part({ page: "upload", sel: ".examples", title: "What to screenshot",
      text: "Examples of the two post-game screens it needs." }),
    part({ page: "upload", sel: "#drop", title: "Upload a game",
      text: (ctx) => ctx.ad2l
        ? "Played without a league ticket? Paste or drop the two screenshots here. The stats are read in your browser and you check them before saving."
        : "Paste or drop the two screenshots here. The stats are read in your browser and you check them before saving." }),
    part({ page: "upload", sel: ".private-hint", when: scrim, title: "Private scrims",
      text: "Private posts only the result: teams, winner, kill score and duration. Heroes and stats never leave your browser." }),
  ]),
];

// ---------- overlay ----------

function buildUI() {
  const root = document.createElement("div");
  root.className = "tour";
  root.innerHTML = `
    <div class="tour-block"></div>
    <div class="tour-box" hidden></div>
    <div class="tour-card" role="dialog" aria-live="polite" aria-label="Site tour" hidden>
      <div class="tour-count"></div>
      <div class="tour-path"></div>
      <h3 class="tour-title"></h3>
      <p class="tour-text"></p>
      <div class="tour-btns"></div>
    </div>
    <svg class="tour-cursor" viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" hidden>
      <path d="M4 2l15 11-6.5 1.2 3.8 7.3-3 1.5-3.8-7.3L4 20z"/>
    </svg>
    <div class="tour-ripple" hidden></div>`;
  document.body.append(root);
  const q = (s) => root.querySelector(s);
  return { root, block: q(".tour-block"), box: q(".tour-box"), card: q(".tour-card"), count: q(".tour-count"),
    path: q(".tour-path"), title: q(".tour-title"), text: q(".tour-text"), btns: q(".tour-btns"), cursor: q(".tour-cursor"), ripple: q(".tour-ripple") };
}

// ---------- the running tour ----------

class Tour {
  constructor(ctx) {
    this.ctx = ctx;
    this.ui = buildUI();
    this.kept = snapshotLocal();
    this.saveKept();
    this.start = deps.here();
    this.target = null;
    this.cur = { x: innerWidth / 2, y: innerHeight / 2 };
    this.onKey = (e) => {
      if (!e.isTrusted) return;
      if (e.key === "Escape") { e.preventDefault(); this.pause(); }
      else if (e.key === "ArrowRight" && !this.busy && !this.stops?.[this.i]?.pick) { e.preventDefault(); this.next(); }
      else if (e.key === "ArrowLeft" && !this.busy) { e.preventDefault(); this.back(); }
    };
    document.addEventListener("keydown", this.onKey, true);
    // Clicks on the dimmed page stop here, so the page's own "click outside" handlers (which
    // close the league menu and the ⓘ bubble a stop is boxing) don't fire. It listens on
    // window in the capture phase, ahead of those document-level capture handlers. A stop
    // with pass() lets clicks inside its box through; the Feedback button always works.
    this.onBlockClick = (e) => {
      if (e.target !== this.ui.block) return;
      e.stopPropagation();
      const fb = document.getElementById("fb-open");
      if (fb && document.elementsFromPoint(e.clientX, e.clientY).includes(fb)) return fb.click();
      const s = this.stops?.[this.i];
      if (this.busy || !s?.pass || !this.target) return;
      const under = document.elementsFromPoint(e.clientX, e.clientY).find((el) => !this.ui.root.contains(el));
      if (under && this.target.some((el) => el.contains(under))) s.pass(this, under);
    };
    window.addEventListener("click", this.onBlockClick, true);
    // The overlay also swallows hover: on a stop with pass(), mark the link under the pointer
    // (.tour-hover, styled like :hover) so the choices still light up as you point at them.
    // The Feedback button lights up the same way.
    let hovered = null;
    const setHover = (el) => {
      if (el === hovered) return;
      hovered?.classList.remove("tour-hover");
      hovered = el;
      el?.classList.add("tour-hover");
      this.ui.block.style.cursor = el ? "pointer" : "";
    };
    this.clearHover = () => setHover(null);
    this.ui.block.addEventListener("mousemove", (e) => {
      const fb = document.getElementById("fb-open");
      if (fb && document.elementsFromPoint(e.clientX, e.clientY).includes(fb)) return setHover(fb);
      const s = this.stops?.[this.i];
      if (this.busy || !s?.pass || !this.target) return setHover(null);
      const under = document.elementsFromPoint(e.clientX, e.clientY).find((el) => !this.ui.root.contains(el));
      const link = under?.closest("a[data-league]");
      setHover(link && this.target.some((el) => el.contains(link)) ? link : null);
    });
    this.ui.block.addEventListener("mouseleave", () => setHover(null));
    const follow = () => { if (this.dead) return; this.place(); this.raf = requestAnimationFrame(follow); };
    this.raf = requestAnimationFrame(follow);
    document.body.classList.add("touring");
  }

  live() { if (this.dead) throw new Gone(); }
  saveKept() { try { sessionStorage.setItem(KEPT_KEY, JSON.stringify(this.kept)); } catch { /* private mode */ } }

  // A chapter: a list of stops, then a closing card.
  // at: the stop to start from (its group and title, from a paused tour).
  async chapter(name, at = null) {
    if (this.chapterName === "core" && name === "deep") markPackOffer("tour");
    const { stops, closing } = CHAPTERS[name];
    this.chapterName = name;
    this.stops = stops.filter((s) => !s.when || s.when(this.ctx));
    this.closing = closing;
    this.i = -1;
    const from = at ? this.stops.findIndex((s) => stopKey(s) === at) : 0;
    await this.go(Math.max(from, 0), 1);
  }

  // Show stop i (moving in direction dir past any that come up empty).
  async go(i, dir) {
    const token = (this.token = {});
    this.busy = true;
    this.ui.card.hidden = true;
    const prev = this.stops[this.i];
    this.clearHover();
    try { prev?.leave?.(this); } catch { /* leaving is best effort */ }
    try {
      for (; i >= 0 && i < this.stops.length; i += dir) {
        const s = this.stops[i];
        let el = null;
        try { el = await s.enter(this); } catch (e) { if (e instanceof Gone) return; }
        this.live();
        if (token !== this.token) return;
        const main = Array.isArray(el) ? el[0] : el;
        if (main && visible(main)) { this.i = i; return this.show(s, el); }
        // Nothing to show here: drop the stop so the count stays "n of N" without gaps.
        this.stops.splice(i, 1);
        if (dir > 0) i -= 1;
      }
      if (i >= this.stops.length) { this.i = this.stops.length; return this.showClosing(); }
      // Back past the first stop: stay on the first one that works.
      return this.go(0, 1);
    } catch (e) {
      if (!(e instanceof Gone)) { console.error("tour:", e); this.end(); }
    } finally {
      if (token === this.token) this.busy = false;
    }
  }

  // The visitor picked a league from the menu: go there and carry on from the next stop, with
  // this league's stops and freshly picked pages.
  async switchLeague(a) {
    const league = a.dataset.league;
    if (league === this.ctx.league) return this.next();
    this.busy = true;
    const at = stopKey(this.stops[this.i]);
    a.click(); // the site's own link handler routes there
    const until = Date.now() + 5000;
    while (document.body.dataset.league !== league && Date.now() < until) { await sleep(50); if (this.dead) return; }
    Object.assign(this.ctx, { league: document.body.dataset.league, ad2l: !!navHref("standings"), picked: {}, query: "" });
    this.start = deps.here(); // Done lands in the new league
    this.stops = CHAPTERS[this.chapterName].stops.filter((s) => !s.when || s.when(this.ctx));
    this.i = Math.max(this.stops.findIndex((s) => stopKey(s) === at), 0);
    this.busy = false;
    return this.go(this.i + 1, 1);
  }

  next() { this.go(this.i + 1, 1); }
  back() { if (this.i > 0) this.go(this.i - 1, -1); }

  show(s, el) {
    const useAlt = s.alt && !Array.isArray(el) && el.matches(s.alt.selector);
    const title = useAlt ? s.alt.title : s.title;
    const raw = useAlt ? s.alt.text : s.text;
    const text = typeof raw === "function" ? raw(this.ctx) : raw;
    // A tab panel taller than the screen: box its first block (the cards up top).
    if (!Array.isArray(el) && el.matches(".pp-panel") && el.getBoundingClientRect().height > innerHeight * 0.55) {
      const first = [...el.children].find((c) => visible(c) && c.getBoundingClientRect().height > 40);
      if (first) el = first;
    }
    this.target = [el].flat();
    this.saveSpot(stopKey(s));
    this.card(`${s.group ? `${s.group} · ` : ""}${this.i + 1} of ${this.stops.length}`, title, text, [
      ["skip", "Pause tour", () => this.pause()],
      ["exit", "Exit tour", () => this.exit()],
      this.i > 0 && ["back", "Back", () => this.back()],
      !s.pick && ["next", this.i === this.stops.length - 1 ? "Finish" : "Next", () => this.next()],
    ]);
    this.setPath(breadcrumb(this.target));
    this.bringIntoView(this.target); // after the card, so a docked card's height is known
  }

  showClosing() {
    this.target = null;
    const c = this.closing;
    this.card("", c.title, c.text, c.buttons(this));
    this.setPath([]);
  }

  card(count, title, text, buttons) {
    const u = this.ui;
    u.count.textContent = count;
    u.count.hidden = !count;
    u.title.textContent = title;
    // "ⓘ" in a caption draws the site's own info dot.
    u.text.replaceChildren(...text.split("ⓘ").flatMap((part, i) => (i ? [Object.assign(document.createElement("span"), { className: "tour-i", textContent: "i" }), part] : [part])));
    u.btns.innerHTML = "";
    for (const b of buttons.filter(Boolean)) {
      const [cls, label, fn] = b;
      const el = document.createElement("button");
      el.type = "button"; el.className = `tour-btn tour-${cls}`; el.textContent = label;
      el.onclick = (e) => { e.stopPropagation(); if (!this.busy) fn(); };
      u.btns.append(el);
    }
    u.card.hidden = false;
    this.place();
    u.btns.querySelector(".tour-next, .tour-primary")?.focus({ preventScroll: true });
  }

  // The breadcrumb line: league › top tab › page › sub-tab › map view.
  setPath(parts) {
    const el = this.ui.path;
    el.replaceChildren(...parts.flatMap((p, i) => {
      const b = document.createElement("span");
      b.textContent = p;
      if (i === parts.length - 1) b.className = "here";
      return i ? [Object.assign(document.createElement("i"), { textContent: "›", ariaHidden: "true" }), b] : [b];
    }));
    el.hidden = !parts.length;
    el.scrollLeft = el.scrollWidth; // phones show it on one line: keep the page you're on in view
    el.setAttribute("aria-label", parts.length ? `You are on ${parts.join(", ")}` : "");
    this.place();
  }

  // Box and caption follow the target every frame (scrolling, late layout, tab switches).
  place() {
    const u = this.ui, els = this.target;
    const phone = innerWidth < 761;
    u.card.classList.toggle("docked", phone || !els);
    if (!phone || !els) u.card.classList.remove("up");
    // No box (the closing card), or the boxed element went away (a bubble closed): the caption
    // sits mid-screen, so its buttons stay in reach.
    if (!els || !els[0].isConnected || !visible(els[0])) {
      u.box.hidden = true; u.block.classList.add("dim");
      u.card.classList.add("center");
      u.card.style.left = u.card.style.top = "";
      return;
    }
    u.block.classList.remove("dim"); u.card.classList.remove("center");
    const pad = 6, r = rectOf(els);
    let top = Math.max(r.top - pad, 4), bottom = Math.min(r.bottom + pad, innerHeight - 4);
    const left = Math.max(r.left - pad, 4), right = Math.min(r.right + pad, innerWidth - 4);
    if (phone && !u.card.hidden) {
      // The caption docks at the bottom, or at the top when only that leaves the whole box
      // clear (the league menu, which can't scroll). The box stops at the caption's edge.
      const ch = u.card.offsetHeight + 16;
      const up = bottom > innerHeight - ch && top >= ch && bottom - top <= innerHeight - ch;
      u.card.classList.toggle("up", up);
      if (up) top = Math.max(top, ch); else bottom = Math.min(bottom, innerHeight - ch);
    }
    u.box.hidden = false;
    Object.assign(u.box.style, { top: `${top}px`, left: `${left}px`, width: `${Math.max(right - left, 0)}px`, height: `${Math.max(bottom - top, 0)}px` });
    if (phone || u.card.hidden) { u.card.style.left = u.card.style.top = ""; return; }
    const cw = u.card.offsetWidth, ch = u.card.offsetHeight, gap = 14;
    let y = bottom + gap, x = Math.min(Math.max(left, 12), innerWidth - cw - 12);
    if (y + ch > innerHeight - 8) y = top - gap - ch;
    if (y < 8) {
      // No room above or below: beside it if there's room, else the bottom of the screen.
      y = Math.min(Math.max(top, 8), innerHeight - ch - 16);
      if (left - gap - cw >= 12) x = left - gap - cw;
      else if (right + gap + cw <= innerWidth - 12) x = right + gap;
      else y = innerHeight - ch - 16;
    }
    u.card.style.left = `${x}px`; u.card.style.top = `${y}px`;
  }

  // Scroll so the element sits in view below the sticky header (phones: the header scrolls
  // away during the tour) and clear of a docked caption.
  bringIntoView(els) {
    const bar = document.querySelector(".top");
    const sticky = bar && getComputedStyle(bar).position === "sticky";
    els = [els].flat().filter((e) => !(sticky && e.closest(".top")) && getComputedStyle(e).position !== "fixed");
    if (!els.length) return;
    const card = this.ui.card, docked = !card.hidden && card.classList.contains("docked");
    const cr = card.getBoundingClientRect();
    let head = sticky ? bar.getBoundingClientRect().bottom : 0;
    if (docked && card.classList.contains("up")) head = Math.max(head, cr.bottom);
    const r = rectOf(els);
    r.height = r.bottom - r.top;
    const floor = docked && !card.classList.contains("up") ? cr.top - 8 : innerHeight - 8;
    const room = floor - head;
    if (r.top >= head + 8 && r.bottom <= floor) return;
    const y = r.height > room - 40 ? r.top - head - 16 : r.top - head - (room - r.height) / 2;
    window.scrollBy({ top: y, behavior: calm() ? "auto" : "smooth" });
  }

  // ---------- helpers the stops use ----------

  // Wait for a selector's first visible match (null after ms).
  async find(sel, ms = 6000) {
    const until = Date.now() + ms;
    for (;;) {
      this.live();
      const el = [...document.querySelectorAll(sel)].find(visible);
      if (el) return el;
      if (Date.now() > until) return null;
      await sleep(100);
    }
  }

  // Glide the cursor to an element (mouse devices), after scrolling it into view.
  async point(el) {
    this.live();
    this.target = null; this.ui.box.hidden = true;
    this.bringIntoView(el);
    await sleep(calm() ? 0 : 350);
    this.live();
    const r = el.getBoundingClientRect();
    const x = r.left + Math.min(r.width / 2, 40), y = r.top + Math.min(r.height / 2, 18);
    if (!mouse()) return { x, y };
    const c = this.ui.cursor;
    c.hidden = false;
    const d = Math.hypot(x - this.cur.x, y - this.cur.y);
    const ms = calm() ? 0 : Math.min(900, 300 + d * 0.6);
    c.style.transition = `transform ${ms}ms cubic-bezier(.45,.05,.25,1)`;
    c.style.transform = `translate(${x}px, ${y}px)`;
    this.cur = { x, y };
    await sleep(ms + 60);
    this.live();
    return { x, y };
  }

  // Point at an element, show a click, click it for real.
  async click(el) {
    const { x, y } = await this.point(el);
    const rp = this.ui.ripple;
    rp.hidden = false;
    rp.style.left = `${x}px`; rp.style.top = `${y}px`;
    rp.classList.remove("go"); void rp.offsetWidth; rp.classList.add("go");
    this.ui.cursor.classList.add("press");
    await sleep(calm() ? 0 : 160);
    this.ui.cursor.classList.remove("press");
    this.live();
    el.click();
    await sleep(calm() ? 50 : 250);
    this.live();
  }

  // Go to a page: click a visible link to it if there is one (so the cursor shows the way),
  // otherwise navigate directly. Resolves once the new page has started rendering.
  async visit(href) {
    if (!href) return;
    this.live();
    if (norm(deps.here()) === norm(href)) return;
    const before = app.firstElementChild;
    const link = [...document.querySelectorAll(`#nav a, #app a`)].find((a) => norm(a.getAttribute("href")) === norm(href) && visible(a));
    if (link) await this.click(link); else deps.go(href);
    const until = Date.now() + 5000;
    while (app.firstElementChild === before && Date.now() < until) { this.live(); await sleep(80); }
    window.scrollTo({ top: 0 });
  }

  // A page picked from live data the first time it's needed: the top team, a game, a
  // player, a hero. Goes to the page it's listed on, then clicks through. False if none.
  async visitPicked(kind) {
    const ad2l = this.ctx.ad2l;
    if (!(kind in this.ctx.picked)) {
      const from = {
        team: [navHref(standingsKey(this.ctx)), ad2l ? '#pp-panel-table #t tbody a[href*="/teams/"]' : "#standings a.team-link"],
        game: ad2l ? [navHref("week"), 'a[href*="/game/"]'] : [navHref("standings"), 'a.fixture[href*="match/"]'],
        player: [navHref("players"), '#tiers a[href*="player/"], #t a[href*="player/"]'],
        hero: [navHref("heroes"), '#pp-panel-table #t a[href*="hero/"]'],
      }[kind];
      await this.visit(from[0]);
      if (kind === "team" || kind === "hero") await this.tab("table");
      if (kind === "game" && !ad2l) await this.tab("matches");
      await this.find(from[1]);
      // Private scrims have no stats to show: skip them.
      const link = [...document.querySelectorAll(from[1])].find((a) => visible(a) && !a.querySelector(".priv"));
      this.ctx.picked[kind] = link?.getAttribute("href") ?? null;
      if (kind === "team" && link) this.ctx.query = link.textContent.trim().slice(0, 3) || this.ctx.query;
    }
    const href = this.ctx.picked[kind];
    if (!href) return false;
    await this.visit(href);
    return true;
  }

  // A picked page (team, game, player, hero) or a nav tab's page; false if there's none.
  async open(page) {
    if (PICKED.includes(page)) return this.visitPicked(page);
    const href = navHref(page);
    if (!href) return false;
    await this.visit(href);
    return true;
  }

  // First visible match for sel inside scope (null after ms).
  async findIn(scope, sel, ms = 2000) {
    const until = Date.now() + ms;
    for (;;) {
      this.live();
      const el = [...scope.querySelectorAll(sel)].find(visible);
      if (el || Date.now() > until) return el ?? null;
      await sleep(100);
    }
  }

  // An element plus the h2 heading it sits under (past any intro notes between them).
  withHead(el) {
    let p = el.previousElementSibling;
    for (let n = 0; p && n < 4 && p.tagName !== "H2"; n++) p = p.previousElementSibling;
    return p?.tagName === "H2" ? [el, p] : [el];
  }

  // Open the Map tab, then one of its views; that view plus its button, or null.
  async mapView(id) {
    const panel = await this.tab("map");
    const b = panel?.querySelector(`.map-segs button[data-view="${id}"]`);
    if (!b) return null;
    if (b.getAttribute("aria-pressed") !== "true") await this.click(b);
    const v = panel.querySelector(`.map-view[data-view="${id}"]`);
    return v && [v, b];
  }

  // Open a sub-tab on the current page (clicking it if it isn't open); its panel, or null.
  async tab(id) {
    const bar = showTabs(await this.find(".pp-tabs", 4000));
    const b = bar?.querySelector(`[data-tab="${id}"]`);
    if (!b) return null;
    if (b.getAttribute("aria-selected") !== "true") await this.click(b);
    return this.find(`#pp-panel-${id}`, 2000);
  }

  // Remember where the tour stands, so a pause or a reload can pick it up again.
  saveSpot(at) {
    const spot = { chapter: this.chapterName, at, start: this.start, league: this.ctx.league, picked: this.ctx.picked, query: this.ctx.query };
    try { localStorage.setItem(PAUSE_KEY, JSON.stringify(spot)); } catch { /* private mode */ }
  }

  // Close the overlay and put back the visitor's own choices; the page stays where it is.
  close() {
    if (this.dead) return false;
    const s = this.stops?.[this.i];
    this.clearHover();
    try { s?.leave?.(this); } catch { /* best effort */ }
    this.dead = true;
    cancelAnimationFrame(this.raf);
    document.removeEventListener("keydown", this.onKey, true);
    window.removeEventListener("click", this.onBlockClick, true);
    restoreKept(this.kept);
    this.ui.root.remove();
    document.body.classList.remove("touring");
    run = null;
    return true;
  }

  // Exit: stay on this page and forget the tour's place; the footer reads "New here?" again.
  exit() {
    if (!this.close()) return;
    try { localStorage.removeItem(PAUSE_KEY); } catch { /* private mode */ }
    syncTopBar();
    deps.go(deps.here(), { rerender: true }); // show the restored tab choices
  }

  // Pause: stay on this page to look around; the footer offers Resume.
  pause() {
    if (!this.close()) return;
    syncTopBar();
    deps.go(deps.here(), { rerender: true }); // show the restored tab choices
  }

  // Done: forget the tour's place and go back where it started.
  end() {
    if (!this.close()) return;
    if (this.chapterName === "core") markPackOffer("tour");
    try { localStorage.removeItem(PAUSE_KEY); } catch { /* private mode */ }
    syncTopBar();
    if (norm(deps.here()) !== norm(this.start)) deps.go(this.start);
    else deps.go(this.start, { rerender: true });
  }
}

function snapshotLocal() {
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k !== SEEN_KEY && k !== PAUSE_KEY) out[k] = localStorage.getItem(k); }
  } catch { /* private mode */ }
  return out;
}
// Back to the snapshot: its values, and nothing the tour added (its own seen and paused
// flags stay).
function restoreKept(kept) {
  try {
    for (const k of Object.keys(snapshotLocal())) if (!(k in kept)) localStorage.removeItem(k);
    for (const [k, v] of Object.entries(kept)) localStorage.setItem(k, v);
  } catch { /* private mode */ }
  try { sessionStorage.removeItem(KEPT_KEY); } catch { /* private mode */ }
}
// Where the boxed element is, and how to get there by hand: the league (from the league
// menu), the top tab, the team, game, player or hero open, the sub-tab, and the map view or
// weekly series. "Champion › Heroes › Rubick › Stats tab".
function breadcrumb(els) {
  const el = els?.[0];
  const league = document.querySelector("#league-menu a.current b")?.textContent.replace(/^AD2L · S\d+ /, "").trim();
  const parts = league ? [league] : [];
  if (el?.closest?.(".top")) {
    parts.push(el.closest(".switcher") ? "League menu" : el.closest("#search") ? "Search" : "Top bar");
    return parts;
  }
  const nav = document.querySelector("#nav a.active")?.textContent.trim();
  if (nav) parts.push(nav);
  const name = pageName();
  if (name) parts.push(name);
  if (!el?.closest) return parts;
  const panel = el.closest(".pp-panel");
  // Tab labels can carry a count ("Up next · 5"): drop it.
  const tab = panel && document.getElementById(panel.getAttribute("aria-labelledby"))?.textContent.replace(/\s*·\s*\d+$/, "").trim();
  if (tab) parts.push(`${tab} tab`);
  const mv = el.closest(".map-view");
  const view = mv && mv.closest(".map-card")?.querySelector(`.map-segs button[data-view="${mv.dataset.view}"]`)?.textContent.trim();
  if (view) parts.push(view);
  const sp = el.closest("section.series")?.querySelector(".series-head")?.textContent.replace(/\s+/g, " ").trim();
  if (sp) parts.push(sp);
  return parts;
}
// The team, game, player or hero whose page this is; null on list pages.
function pageName() {
  if (!/\/(teams\/[^/]+|player\/|hero\/|game\/|match\/)/.test(deps.here())) return null;
  const teams = app.querySelectorAll(".banner .plate .team");
  if (app.querySelector(".banner") && teams.length >= 2) {
    const n = app.querySelector('.gm-series [aria-current="page"] small')?.textContent.match(/Game \d+/)?.[0];
    return `${teams[0].textContent.trim()} vs ${teams[1].textContent.trim()}${n ? `, ${n}` : ""}`;
  }
  const h1 = app.querySelector("h1");
  return (h1?.querySelector(".h1-name") ?? h1)?.textContent.replace(/\s+/g, " ").trim() || null;
}
const stopKey = (s) => `${s.group ?? ""}|${s.title}`;
function localGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function markSeen() { try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* not remembered */ } }

// ---------- public ----------

const CHAPTERS = {
  core: {
    stops: CORE,
    closing: {
      title: "That's the basics",
      text: "The detailed tour opens every tab on every page and shows its filters.",
      buttons: (tour) => [
        ["skip", "Done", () => tour.end()],
        ["primary", "Show me everything", () => tour.chapter("deep")],
      ],
    },
  },
  deep: {
    stops: DEEP,
    closing: {
      title: "You're set",
      text: "Take the tour again any time with New here? at the bottom of the page.",
      buttons: (tour) => [["primary", "Done", () => tour.end()]],
    },
  },
};

function pausedSpot() { try { return JSON.parse(localStorage.getItem(PAUSE_KEY)); } catch { return null; } }

// Start from the beginning, or (resume) from where a paused tour stopped.
export async function startTour({ resume = false } = {}) {
  if (run) return;
  markSeen();
  closeInvite();
  const spot = resume ? pausedSpot() : null;
  if (!resume) { try { localStorage.removeItem(PAUSE_KEY); } catch { /* private mode */ } }
  const league = document.body.dataset.league || "scrim";
  // Only AD2L divisions are toured. From the home page or the scrims, the first stop (pick a
  // league) moves the tour into one; a paused spot there can't be resumed.
  const ad2l = !!navHref("standings");
  const at = ad2l ? spot : null;
  // Picked pages (a team, a game...) only carry over within the same league.
  const same = at?.league === league;
  const t = (run = new Tour({ league, ad2l: true, picked: same ? at.picked ?? {} : {}, query: same ? at.query ?? "" : "" }));
  if (at?.start) t.start = at.start;
  syncTopBar();
  // Search types the start of a real name from this league.
  if (!t.ctx.query) t.ctx.query = (document.querySelector('#standings a.team-link, #t tbody a[href*="/teams/"]')?.textContent ?? "").trim().slice(0, 3) || "a";
  await t.chapter(at?.chapter in CHAPTERS ? at.chapter : "core", at?.at ?? null);
}

// Footer button: "New here?" normally; "Resume" while a tour is paused.
function syncTopBar() {
  const open = document.getElementById("tour-open");
  const paused = !run && !!pausedSpot();
  if (open) {
    open.textContent = paused ? "Resume" : "New here?";
    open.title = paused ? "Resume the tour where you left it" : "A guided tour of the site";
    open.classList.toggle("paused", paused);
  }
}

let invite = null;
function closeInvite() { invite?.remove(); invite = null; }

function showInvite() {
  if (invite || run) return;
  invite = document.createElement("div");
  invite.className = "tour-invite";
  invite.setAttribute("role", "dialog");
  invite.setAttribute("aria-label", "Site tour");
  invite.innerHTML = `<b>First time here?</b><span>Take a one-minute tour of the site.</span>
    <div class="tour-btns"><button type="button" class="tour-btn tour-skip">Not now</button><button type="button" class="tour-btn tour-primary">Start tour</button></div>`;
  invite.querySelector(".tour-skip").onclick = () => { markSeen(); closeInvite(); };
  invite.querySelector(".tour-primary").onclick = () => startTour();
  document.body.append(invite);
  // Ignored for 20s: step aside (not marked seen, so it asks again next visit; the footer's
  // "New here?" is always there). Not while the pointer or focus is on it.
  const mine = invite;
  setTimeout(function away() {
    if (invite !== mine) return;
    if (mine.matches(":hover, :focus-within")) return void setTimeout(away, 4000);
    closeInvite();
  }, 20000);
}

// Left mid-tour by a reload: put its tab choices back. Runs on import, before app.js renders.
try { const k = JSON.parse(sessionStorage.getItem(KEPT_KEY)); if (k) restoreKept(k); } catch { /* none */ }

// go(href, { rerender }) navigates in-app; here() is the current "#/..." route.
export function initTour({ go, here }) {
  deps = { go, here };
  // Footer: New here? / Resume.
  const on = (id, fn) => document.getElementById(id)?.addEventListener("click", (e) => { e.preventDefault(); fn(); });
  on("tour-open", () => startTour({ resume: !!pausedSpot() }));
  syncTopBar();
  if (localGet(SEEN_KEY)) return;
  // Wait for the first page to render, then a moment more.
  const wait = Date.now() + 8000;
  const tick = () => {
    if (localGet(SEEN_KEY) || run) return;
    if (app.children.length || Date.now() > wait) setTimeout(showInvite, 2000);
    else setTimeout(tick, 200);
  };
  tick();
}
