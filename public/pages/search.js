// Site search results (<league>/search?q=…&type=…&in=…&exact=1): direct links, topic cards with
// a League / All teams·players·heroes / Team / Player / Hero picker, matching names with their
// tabs, and league pages. A query asking for every team, player or hero leads with a table, and
// &table=… opens the table builder (parts/tables.js; &league= is its scope). lib/sitesearch.js
// does the reading; this draws it.
import { app, esc, setTitle, setRoutedAt, SOURCES, DIVISIONS, heroHref, navigate } from "../core.js";
import { HEROES } from "../lib/heroes.js";
import { INFO } from "../lib/glossary.js";
import { fold, searchIndex } from "../lib/search.js";
import { siteSearch, sitelinks, leagueHref, withAt } from "../lib/sitesearch.js";
import { STANDINGS_TABS, SCRIM_TEAMS_TABS, PLAYERS_PAGE_TABS, HEROES_PAGE_TABS, PREDICT_TABS, DRAFTER_MODES, tabList } from "../lib/pagetabs.js";
import { loadSearch } from "../parts/searchindex.js";
import { KINDS, parseTable, tableParams, tableState } from "../lib/tables.js";
import { drawTable, builderHtml, wireBuilder, TABLE_LEAGUES, leagueLabel as tableLeague } from "../parts/tables.js";

const EXAMPLES = ["radiant win rate", "first pick", "pudge ban rate", "ward map", "hero tier list"];
const TYPES = [["all", "All"], ["team", "Teams"], ["player", "Players"], ["hero", "Heroes"], ["pages", "Pages"]];
const SCOPE = { league: "League", teams: "All teams", players: "All players", heroes: "All heroes", team: "Team", player: "Player", hero: "Hero" };
const ALL_OF = { teams: "team", players: "player", heroes: "hero" };
const KIND = { team: "Team", player: "Player", hero: "Hero" };
const LEAGUES = [...Object.keys(DIVISIONS), "scrim"];
const rootOf = (k) => SOURCES[k].root;
const leagueName = (k) => (k === "scrim" ? "Scrims" : DIVISIONS[k]?.short ?? k);
const snippet = (t) => INFO[t.key] ?? t.text ?? "";
const lgChip = (e) => (e.league && e.leagueLabel ? `<span class="lg-chip" data-lg="${e.league}">${esc(e.leagueLabel)}</span>` : "");

export async function renderSearch(src) {
  const p = new URLSearchParams(location.search);
  const q = (p.get("q") ?? "").trim(), exact = p.get("exact") === "1";
  const here = src.all ? null : src.ad2l ? src.key.replace(/_[a-z]$/, "") : "scrim";
  const st = { type: p.get("type") ?? "all", league: p.get("in") ?? "all" };
  const root = src.root;
  const link = (o) => `${root}/search?${new URLSearchParams(o)}`;
  // The table builder: its state (&table=team|player|hero&cols=…) and scope (&league=, else this one).
  let tst = parseTable(p);
  const homeLeague = src.all ? "all" : src.ad2l ? (src.view ? `${src.key}_${src.view}` : src.key) : "scrim";
  let tleague = TABLE_LEAGUES.includes(p.get("league")) && SOURCES[p.get("league")] ? p.get("league") : homeLeague;
  const tableLink = (kind, cols, sort = null) => link({ ...(q && { q }), ...Object.fromEntries(tableParams({ kind, cols, sort })), ...(tleague !== homeLeague && { league: tleague }) });
  // Under every table search builds: open it in the builder, or start a fresh one of that kind.
  const tableActs = (kind, cols, sort) => `<div class="tt-acts"><a class="sr-go" href="${tableLink(kind, cols, sort)}">Edit this table →</a>
    <a href="${link({ table: kind, ...(tleague !== homeLeague && { league: tleague }) })}">Build my own table →</a></div>`;
  const keepTable = () => {
    const u = new URL(location.href);
    for (const k of ["table", "cols", "sort", "dir", "min", "weeks", "team", "league"]) u.searchParams.delete(k);
    if (tst) {
      for (const [k, v] of tableParams(tst)) u.searchParams.set(k, v);
      if (tleague !== homeLeague) u.searchParams.set("league", tleague);
    }
    history.replaceState(history.state, "", u.pathname + u.search + u.hash);
    setRoutedAt(location.href);
  };
  // Every plain table in scope (the table-first block, a card's All … scope): .tt-table[data-kind].
  const mount = (scope) => scope.querySelectorAll(".tt-table[data-kind]").forEach((el) => {
    const lg = el.closest(".sr-card")?.querySelector(".sr-tlg")?.value ?? tleague;
    drawTable(el, lg, tableState(el.dataset.kind, el.dataset.cols.split(","), el.dataset.sort));
  });
  const leagueSelect = () => `<label class="sr-lgpick">League <select class="sr-tlg">${TABLE_LEAGUES.filter((k) => SOURCES[k]).map((k) => `<option value="${k}"${k === tleague ? " selected" : ""}>${esc(tableLeague(k))}</option>`).join("")}</select></label>`;
  setTitle(q ? `“${q}”` : tst ? "Table" : "Search", "Search");
  app.innerHTML = `<header class="page-head reveal"><div class="kicker">Search</div><h1>${q ? esc(q) : tst ? "Table builder" : "Search"}</h1></header>
    <form class="sr-form" role="search"><input id="sr-q" type="search" value="${esc(q)}" aria-label="Search the site"
      placeholder="Players, teams, heroes, stats…" autocomplete="off"><button type="submit" class="seg on">Search</button></form>
    <div id="sr-body"><div class="panel empty">Loading every league…</div></div>`;
  const form = app.querySelector(".sr-form");
  form.onsubmit = (e) => {
    e.preventDefault();
    const v = form.querySelector("#sr-q").value.trim();
    if (v) navigate(link({ q: v, ...(st.type !== "all" && { type: st.type }), ...(st.league !== "all" && { in: st.league }),
      ...(tst && Object.fromEntries(tableParams(tst))), ...(tst && tleague !== homeLeague && { league: tleague }) }));
  };
  let index;
  try { index = await loadSearch(); }
  catch { document.getElementById("sr-body").innerHTML = `<div class="panel empty">Search couldn't load. Try again.</div>`; return; }
  const body = document.getElementById("sr-body");
  if (!body) return; // moved on while loading
  const res = siteSearch({ index, heroes: HEROES, query: q, league: here, exact, heroHref: (h) => heroHref(src, h) });
  const inLg = (e) => st.league === "all" || e.league == null || e.league === st.league;
  const keepUrl = () => {
    const u = new URL(location.href);
    for (const [k, v] of [["type", st.type], ["in", st.league]]) v === "all" ? u.searchParams.delete(k) : u.searchParams.set(k, v);
    history.replaceState(history.state, "", u.pathname + u.search + u.hash);
    setRoutedAt(location.href);
  };

  // A topic card's picker for one scope.
  const pickLeague = st.league !== "all" ? st.league : here ?? LEAGUES[0];
  const picker = (t, scope) => {
    // All teams / players / heroes: the topic's columns for every one, with a league select.
    if (ALL_OF[scope]) {
      const kind = ALL_OF[scope], first = kind === "hero" ? "picks" : "games";
      const cols = [...new Set([first, ...(kind === "hero" ? [] : ["win_rate"]), ...t.table[kind]])];
      return `${leagueSelect()}
        <div class="tt-table" data-kind="${kind}" data-cols="${cols.join(",")}" data-sort="${t.table[kind][0]}"></div>${tableActs(kind, cols, t.table[kind][0])}`;
    }
    if (scope === "league") {
      const opts = LEAGUES.filter((k) => !(t.league.ad2l && k === "scrim"));
      const on = opts.includes(pickLeague) ? pickLeague : opts[0];
      return `<label class="sr-lgpick">League <select class="sr-lg">${opts.map((k) => `<option value="${k}"${k === on ? " selected" : ""}>${esc(leagueName(k))}</option>`).join("")}</select></label>
        <a class="sr-go" href="${leagueHref(rootOf(on), t.league)}">Open ${esc(t.title)} →</a>`;
    }
    return `<input type="search" class="sr-find" data-kind="${scope}" placeholder="Type a ${scope} name" aria-label="Pick a ${scope}" autocomplete="off">
      <div class="sr-opts">${options(t, scope, "")}</div>`;
  };
  const options = (t, kind, v) => {
    let list;
    if (kind === "hero") {
      const f = fold(v);
      list = (f ? HEROES.filter((h) => fold(h).includes(f)) : []).slice(0, 8).map((h) => ({ name: h, href: heroHref(src, h) }));
    } else {
      const pool = index.filter((e) => e.kind === kind && inLg(e));
      list = v.trim() ? searchIndex(pool, v, 8) : kind === "team" ? pool.filter((e) => e.league === (st.league !== "all" ? st.league : here)).slice(0, 12) : [];
    }
    if (!list.length) return `<span class="muted">${v.trim() ? "No match." : `Type a ${kind} name.`}</span>`;
    return list.map((e) => `<a class="sr-opt" href="${withAt(e.href, t[kind])}">${esc(e.name)}${e.leagueLabel ? ` <small>${esc(e.leagueLabel)}</small>` : ""}</a>`).join("");
  };
  // A stat with no name opens on its table (every team, player or hero; the one the type filter
  // names first), unless the page already leads with a table; else on a picker.
  const defaultScope = (scopes) => {
    const all = Object.keys(ALL_OF).filter((s) => scopes.includes(s));
    if (all.length && !res.table) return all.find((s) => ALL_OF[s] === st.type) ?? all[0];
    return scopes.includes(st.type) ? st.type : ["team", "player", "hero", "league"].find((s) => scopes.includes(s)) ?? scopes[0];
  };

  const draw = () => {
    const builder = tst ? `<section class="sr-card tt-card">${q ? `<h2 class="sr-title">Table builder</h2>` : ""}${builderHtml(tst, tleague)}</section>` : "";
    const firstCard = res.cards.find((c) => c.topic.table);
    // "Build my own table": the kind the results are about, else teams.
    const buildKind = res.table?.kind ?? (firstCard && Object.keys(firstCard.topic.table)[0]) ?? "team";
    const buildLink = tst ? "" : `<a class="sr-build" href="${link({ table: buildKind, ...(tleague !== homeLeague && { league: tleague }) })}">Build my own table →</a>`;
    const after = () => {
      if (tst) wireBuilder(body.querySelector(".tt-builder"), tst, tleague, (next, lg) => { tst = next; tleague = lg; keepTable(); });
      mount(body);
    };
    if (!q || res.empty) {
      body.innerHTML = `${builder}${tst && !q ? "" : `<div class="panel empty sr-empty"><strong>${q ? `Nothing on the site matches “${esc(q)}”` : "Search players, teams, heroes and stats"}</strong>
        Try ${EXAMPLES.map((x) => `<a href="${link({ q: x })}">${esc(x)}</a>`).join(" · ")} ${buildLink}</div>`}`;
      return after();
    }
    const kindOk = (k) => st.type === "all" || st.type === k;
    const direct = res.direct.filter((d) => inLg(d.entity) && kindOk(d.entity.kind));
    const cards = st.type === "pages" ? [] : res.cards;
    const names = res.names.filter((e) => inLg(e) && kindOk(e.kind));
    const pages = st.type === "all" || st.type === "pages" ? res.pages.filter((pg) => !pg.ad2l || src.ad2l) : [];
    const did = res.corrected ? `<p class="sr-did">Showing results for <b>${esc(res.corrected)}</b>. <a href="${link({ q, exact: 1 })}">Search instead for “${esc(q)}”</a></p>` : "";
    const filters = `<div class="sr-filters">
        <div class="row segs" role="group" aria-label="Show">${TYPES.map(([id, label]) => `<button type="button" class="seg${id === st.type ? " on" : ""}" data-sr-type="${id}" aria-pressed="${id === st.type}">${label}</button>`).join("")}</div>
        <label class="sr-lgpick">In <select id="sr-in"><option value="all">All leagues</option>${LEAGUES.map((k) => `<option value="${k}"${k === st.league ? " selected" : ""}>${esc(leagueName(k))}</option>`).join("")}</select></label>${buildLink}</div>`;
    // The query asks for every team, player or hero: the table leads.
    const T = res.table;
    const titles = T ? res.cards.filter((c) => c.topic.table?.[T.kind]).map((c) => c.topic.title).join(", ") || KINDS[T.kind].presets[0].name : "";
    const tableFirst = T && !tst ? `<section class="sr-card sr-tablefirst"><h2 class="sr-title">Every ${KINDS[T.kind].one}: ${esc(titles)}</h2>
        ${leagueSelect()}<div class="tt-table" data-kind="${T.kind}" data-cols="${T.cols.join(",")}" data-sort="${T.sort}"></div>
        ${tableActs(T.kind, T.cols, T.sort)}</section>` : "";
    const directHtml = direct.map((d) => `<a class="sr-hit sr-direct" href="${d.href}">
        <span class="sr-crumb">${esc(d.entity.name)} › ${esc(d.tab ?? "")} › <b>${esc(d.topic.title)}</b></span>${lgChip(d.entity)}
        <span class="sr-snip">${esc(snippet(d.topic))}</span></a>`).join("");
    const cardHtml = cards.map(({ topic: t, scopes }) => {
      const on = defaultScope(scopes);
      return `<section class="sr-card" data-topic="${t.id}">
        <h2 class="sr-title">${esc(t.title)}</h2><p class="sr-snip">${esc(snippet(t))}</p>
        <div class="row segs sr-scopes" role="group" aria-label="Where to look">${scopes.map((s) => `<button type="button" class="seg${s === on ? " on" : ""}" data-scope="${s}" aria-pressed="${s === on}">${SCOPE[s]}</button>`).join("")}</div>
        <div class="sr-pick">${picker(t, on)}</div></section>`;
    }).join("");
    const nameHtml = (e, i) => `<div class="sr-name${i >= 20 ? " sr-more" : ""}"${i >= 20 ? " hidden" : ""}>
        <a class="sr-hit" href="${e.href}"><span class="sh-kind sh-${e.kind}">${KIND[e.kind]}</span><b>${esc(e.name)}</b>
          ${e.kind === "player" && e.team ? `<span class="sr-sub">${e.standin ? "Stand-in for " : ""}${esc(e.team)}</span>` : ""}${lgChip(e)}</a>
        <div class="sr-links">${sitelinks(e).map(([l, h]) => `<a href="${h}">${esc(l)}</a>`).join("")}</div></div>`;
    const pageHtml = (pg) => {
      // Standings and Predict only have tabs on AD2L.
      const named = { standings: src.ad2l ? STANDINGS_TABS : SCRIM_TEAMS_TABS, players: PLAYERS_PAGE_TABS, heroes: HEROES_PAGE_TABS, predict: src.ad2l && PREDICT_TABS, drafter: DRAFTER_MODES };
      const tabs = typeof pg.tabs === "string" ? (named[pg.tabs] ? tabList(named[pg.tabs], src) : []) : pg.tabs ?? [];
      return `<div class="sr-name"><a class="sr-hit" href="${leagueHref(root, { path: pg.path })}"><span class="sh-kind">Page</span><b>${esc(pg.title)}</b></a>
        ${tabs.length ? `<div class="sr-links">${tabs.map(([id, l]) => `<a href="${leagueHref(root, { path: pg.path, tab: id })}">${esc(l)}</a>`).join("")}</div>` : ""}</div>`;
    };
    const nothing = !direct.length && !cards.length && !names.length && !pages.length && !tableFirst && !tst;
    body.innerHTML = `${did}${filters}${builder}
      ${nothing ? `<div class="panel empty">Nothing here with these filters.</div>` : ""}
      ${tableFirst}
      ${directHtml ? `<div class="sr-list">${directHtml}</div>` : ""}
      ${cardHtml}
      ${names.length ? `<h2>Names</h2><div class="sr-list">${names.map(nameHtml).join("")}</div>
        ${names.length > 20 ? `<button type="button" class="link-btn sr-show">Show ${names.length - 20} more</button>` : ""}` : ""}
      ${pages.length ? `<h2>Pages</h2><div class="sr-list">${pages.map(pageHtml).join("")}</div>` : ""}`;
    after();
  };
  draw();

  body.addEventListener("click", (e) => {
    const ty = e.target.closest("[data-sr-type]");
    if (ty) { st.type = ty.dataset.srType; keepUrl(); return draw(); }
    const sc = e.target.closest("[data-scope]");
    if (sc) {
      const card = sc.closest(".sr-card"), t = res.cards.find((c) => c.topic.id === card.dataset.topic).topic;
      for (const b of card.querySelectorAll("[data-scope]")) { b.classList.toggle("on", b === sc); b.setAttribute("aria-pressed", String(b === sc)); }
      card.querySelector(".sr-pick").innerHTML = picker(t, sc.dataset.scope);
      mount(card);
      return card.querySelector(".sr-find")?.focus();
    }
    if (e.target.closest(".sr-show")) { body.querySelectorAll(".sr-more").forEach((x) => (x.hidden = false)); e.target.remove(); }
  });
  body.addEventListener("change", (e) => {
    if (e.target.id === "sr-in") { st.league = e.target.value; keepUrl(); return draw(); }
    if (e.target.classList.contains("sr-tlg")) return mount(e.target.closest(".sr-card"));
    if (e.target.classList.contains("sr-lg")) {
      const t = res.cards.find((c) => c.topic.id === e.target.closest(".sr-card").dataset.topic).topic;
      e.target.closest(".sr-pick").querySelector(".sr-go").href = leagueHref(rootOf(e.target.value), t.league);
    }
  });
  body.addEventListener("input", (e) => {
    if (!e.target.classList.contains("sr-find")) return;
    const t = res.cards.find((c) => c.topic.id === e.target.closest(".sr-card").dataset.topic).topic;
    e.target.nextElementSibling.innerHTML = options(t, e.target.dataset.kind, e.target.value);
  });
}
