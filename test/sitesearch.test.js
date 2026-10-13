import { test } from "node:test";
import assert from "node:assert/strict";
import { TOPICS, PAGES, HERO_SHORT, ANCHORS, RATE_WORDS } from "../public/lib/topics.js";
import { INFO } from "../public/lib/glossary.js";
import { HEROES } from "../public/lib/heroes.js";
import { TEAM_TABS, PLAYER_TABS, HERO_TABS, STANDINGS_TABS, PLAYERS_PAGE_TABS, HEROES_PAGE_TABS } from "../public/lib/pagetabs.js";
import { fold } from "../public/lib/search.js";

const LEAGUE_TABS = { "": STANDINGS_TABS.map(([id]) => id), heroes: HEROES_PAGE_TABS.map(([id]) => id), players: PLAYERS_PAGE_TABS.map(([id]) => id), content: [] };
const PAGE_TABS = { team: TEAM_TABS, player: PLAYER_TABS, hero: HERO_TABS };
const where = (at) => !at || INFO[at] || ANCHORS.includes(at);
const clean = (w) => w === fold(w).replace(/[^\p{L}\p{N} ]/gu, "") && !/\s{2}/.test(w);

test("topic catalog points at real glossary entries, tabs and heroes", () => {
  const ids = new Set();
  for (const t of [...TOPICS, ...PAGES]) {
    assert.ok(!ids.has(t.id), `duplicate id ${t.id}`);
    ids.add(t.id);
    assert.ok(t.words.length, `${t.id}: no words`);
    for (const w of t.words) assert.ok(clean(w), `${t.id}: "${w}" must be lowercase letters, digits and single spaces`);
  }
  for (const t of TOPICS) {
    assert.ok(t.key ? INFO[t.key] : t.text, `${t.id}: needs a glossary key or text`);
    for (const kind of ["team", "player", "hero"]) {
      const s = t[kind];
      if (!s) continue;
      assert.ok(PAGE_TABS[kind].some(([id]) => id === s.tab), `${t.id}: no ${kind} tab "${s.tab}"`);
      assert.ok(where(s.at), `${t.id}: "${s.at}" is neither a glossary key nor an anchor`);
    }
    if (t.league) {
      const L = t.league;
      assert.ok(L.path in LEAGUE_TABS, `${t.id}: unknown league path "${L.path}"`);
      if (L.tab) assert.ok(LEAGUE_TABS[L.path].includes(L.tab), `${t.id}: no tab "${L.tab}" on "${L.path}"`);
      assert.ok(where(L.at), `${t.id}: "${L.at}" is neither a glossary key nor an anchor`);
    }
    assert.ok(t.team || t.player || t.hero || t.league, `${t.id}: lives nowhere`);
  }
  for (const w of RATE_WORDS) assert.ok(clean(w));
  for (const [s, hero] of Object.entries(HERO_SHORT)) assert.ok(HEROES.includes(hero), `${s} → ${hero} isn't a hero`);
});

import { words, editDistance, typoLimit, withAt, leagueHref } from "../public/lib/sitesearch.js";

test("words: folded, possessives and punctuation gone, % spelled out", () => {
  assert.deepEqual(words("How often does No Immortals' win%?"), ["how", "often", "does", "no", "immortals", "win", "percent"]);
  assert.deepEqual(words("Who's best K/D"), ["who", "best", "k", "d"]);
  assert.deepEqual(words("  "), []);
});

test("editDistance counts a swap of neighbours as one edit", () => {
  assert.equal(editDistance("radaint", "radiant"), 1);
  assert.equal(editDistance("pikc", "pick"), 1);
  assert.equal(editDistance("imortals", "immortals"), 1);
  assert.equal(editDistance("abc", "xyz", 2), 3);
  assert.deepEqual(["kp", "kda", "pikc", "radiant", "imortals"].map(typoLimit), [0, 0, 1, 2, 2]);
});

test("link helpers", () => {
  assert.equal(withAt("#/champion/teams/5", { tab: "overview", at: "team_sides" }), "#/champion/teams/5?tab=overview&at=team_sides");
  assert.equal(withAt("#/champion/teams/5", {}), "#/champion/teams/5");
  assert.equal(leagueHref("#/scrims", { path: "" }), "#/scrims/");
  assert.equal(leagueHref("#/scrims", { path: "heroes", tab: "table" }), "#/scrims/heroes?tab=table");
  assert.equal(leagueHref("#/champion", { path: "heroes", tab: "table", at: "radiant_rate" }), "#/champion/heroes?tab=table&at=radiant_rate");
  assert.equal(leagueHref("#/champion", { path: "" }), "#/champion/");
});

import { siteSearch, sitelinks } from "../public/lib/sitesearch.js";
import { buildSearchIndex } from "../public/lib/search.js";

const champ = { teams: [
  { id: 15026, name: "No Immortals", players: [{ name: "Hex", account_id: 11 }] },
  { id: 15022, name: "Radiant Ravens", players: [{ name: "Rune", account_id: 21 }] },
], games: [] };
const warrior = { teams: [{ id: 9, name: "No Immortals", players: [] }], games: [] };
const index = buildSearchIndex([
  { key: "ad2l", label: "Champion", root: "#/champion", data: champ },
  { key: "warrior", label: "Warrior", root: "#/warrior", data: warrior },
]);
const run = (query, o = {}) => siteSearch({ index, heroes: ["Anti-Mage", "Pudge", "Mirana"], query, league: "ad2l",
  heroHref: (h) => `#/champion/hero/${h}`, ...o });

test("a name plus a topic is a direct link, this league first", () => {
  const r = run("how often does No Immortals win radiant");
  assert.equal(r.empty, false);
  assert.equal(r.direct[0].entity.name, "No Immortals");
  assert.equal(r.direct[0].entity.league, "ad2l");
  assert.equal(r.direct[0].topic.id, "sides");
  assert.equal(r.direct[0].href, "#/champion/teams/15026?tab=overview&at=team_sides");
  assert.equal(r.direct[0].tab, "Overview");
  assert.equal(r.direct.length, 2); // Warrior's No Immortals too
});

test("a topic with no name is a card with its scopes", () => {
  const r = run("radiant win rate");
  assert.equal(r.direct.length, 0);
  assert.equal(r.cards[0].topic.id, "sides");
  assert.deepEqual(r.cards[0].scopes, ["league", "teams", "team"]);
  assert.equal(r.table, null);
  assert.equal(r.corrected, null);
});

test("per minute swaps a topic's columns for their per-minute ones", () => {
  for (const q of ["kills per minute", "kills a minute", "kpm"]) {
    const t = run(q).cards[0].topic;
    assert.equal(t.id, "kills", q);
    assert.deepEqual(t.table, { team: ["kills_pm", "deaths_pm", "kill_diff_pm", "avg_min"], player: ["kills_pm", "deaths_pm", "assists_pm"] }, q);
  }
  assert.deepEqual(run("compare players kills per min").table, { kind: "player", cols: ["kills_pm", "deaths_pm", "assists_pm"], sort: "kills_pm" });
  // A topic that owns the phrase keeps it; "minutes" stays game length.
  assert.equal(run("gold per minute").cards[0].topic.id, "gpm");
  assert.equal(run("game minutes").cards[0].topic.id, "length");
});

test("typos are corrected and reported", () => {
  const r = run("radaint win rate");
  assert.equal(r.corrected, "radiant win rate");
  assert.equal(r.cards[0].topic.id, "sides");
  const n = run("No Imortals");
  assert.equal(n.corrected, "no immortals");
  assert.equal(n.names[0].name, "No Immortals");
  assert.equal(n.names[0].league, "ad2l");
  assert.equal(run("frist pikc").cards[0].topic.id, "side_pick");
});

test("exact=1 turns correction off", () => {
  assert.equal(run("radaint").corrected, "radiant");
  const r = run("radaint", { exact: true });
  assert.equal(r.corrected, null);
  assert.equal(r.empty, true);
});

test("heroes by name and shorthand, with their tabs as sitelinks", () => {
  const p = run("pudge");
  assert.equal(p.names[0].kind, "hero");
  assert.equal(p.names[0].href, "#/champion/hero/Pudge");
  assert.ok(sitelinks(p.names[0]).some(([label, href]) => label === "Draft" && href === "#/champion/hero/Pudge?tab=draft"));
  const am = run("am ban rate");
  assert.equal(am.direct[0].entity.name, "Anti-Mage");
  assert.equal(am.direct[0].topic.id, "ban_rate");
  assert.equal(am.direct[0].href, "#/champion/hero/Anti-Mage?tab=stats&at=ban_rate");
});

test("short words are never corrected", () => {
  const kp = run("kp");
  assert.equal(kp.cards[0].topic.id, "kp");
  assert.equal(kp.corrected, null);
  assert.equal(run("kq").empty, true);
});

test("part of a name still finds it", () => {
  const r = run("immortals");
  assert.equal(r.empty, false);
  assert.ok(r.names.some((e) => e.name === "No Immortals"));
});

test("nonsense and mostly-unmatched questions are empty", () => {
  assert.equal(run("asdfgh").empty, true);
  assert.equal(run("who's best at the side of the river").empty, true);
  assert.equal(run("").empty, true);
});

test("league pages by name", () => {
  const r = run("standings");
  assert.equal(r.pages[0].id, "page_standings");
});

import { column } from "../public/lib/tables.js";

test("topic table columns are real columns of their kind", () => {
  for (const t of TOPICS) for (const [kind, cols] of Object.entries(t.table ?? {})) for (const id of cols) assert.ok(column(kind, id), `${t.id}: no ${kind} column ${id}`);
});

test("asking for every team, player or hero leads with a table", () => {
  const r = run("compare first blood and roshan");
  assert.deepEqual(r.table, { kind: "team", cols: ["fb_taken", "fb_win", "rosh", "first_rosh"], sort: "fb_taken" });
  assert.equal(r.empty, false);
  assert.deepEqual(run("radiant win rate all teams").table, { kind: "team", cols: ["radiant_rate", "dire_rate"], sort: "radiant_rate" });
  assert.deepEqual(run("compare kda").table, { kind: "player", cols: ["kda"], sort: "kda" });
  assert.deepEqual(run("kda all heroes").table, { kind: "hero", cols: ["avg_kda"], sort: "avg_kda" });
  assert.deepEqual(run("compare players first blood").table, { kind: "player", cols: ["fb_rate", "fb_death_rate"], sort: "fb_rate" });
  assert.deepEqual(run("ban rate table").table, { kind: "hero", cols: ["ban_rate", "bans"], sort: "ban_rate" });
  assert.equal(run("player table").table.kind, "player");
  assert.equal(run("team table").table.kind, "team");
  assert.equal(run("radiant win rate").table, null); // a card, with an All teams scope instead
  assert.equal(run("compare No Immortals radiant").table, null); // one team: the direct link
});

test("cards offer every kind the topic has a table for", () => {
  assert.deepEqual(run("kda").cards[0].scopes, ["players", "heroes", "player", "hero"]);
});
