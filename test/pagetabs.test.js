import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TEAM_TABS, PLAYER_TABS, HERO_TABS, STANDINGS_TABS, tabList, pageTabs } from "../public/lib/pagetabs.js";

const ad2l = { ad2l: {} }, all = { ad2l: {}, all: true }, scrims = {};

test("menu tabs: AD2L-only tabs drop out for scrims, labels follow the source", () => {
  assert.deepEqual(tabList(TEAM_TABS, ad2l).map(([id]) => id), ["overview", "roster", "games", "heroes", "draft", "chances", "lanes", "resources", "map"]);
  assert.deepEqual(tabList(TEAM_TABS, scrims).map(([id]) => id), ["overview", "roster", "games", "heroes", "draft", "map"]);
  assert.equal(tabList(TEAM_TABS, ad2l)[2][1], "Series");
  assert.equal(tabList(TEAM_TABS, scrims)[2][1], "Games");
  assert.ok(!tabList(PLAYER_TABS, scrims).some(([id]) => id === "lanes"));
  assert.ok(tabList(STANDINGS_TABS, ad2l).some(([id]) => id === "race"));
  assert.ok(!tabList(STANDINGS_TABS, all).some(([id]) => id === "race"));
});

test("page tabs: list order and labels, label override, out-of-step lists throw", () => {
  const panels = STANDINGS_TABS.map(([id]) => [id, id === "matches" ? { label: "Matches · 3", html: "n" } : id]);
  assert.deepEqual(pageTabs(STANDINGS_TABS, ad2l, panels.reverse()).map(([id, label]) => `${id}:${label}`),
    ["table:Table", "matches:Matches · 3", "cross:Crosstable", "race:Race"]);
  assert.throws(() => pageTabs(TEAM_TABS, ad2l, [["overview", "x"]]), /-roster/);
  assert.throws(() => pageTabs(HERO_TABS, ad2l, [...HERO_TABS.map(([id]) => [id, "x"]), ["extra", "x"]]), /\+extra/);
  // A scrim page needn't fill the AD2L-only tabs.
  assert.doesNotThrow(() => pageTabs(PLAYER_TABS, scrims, PLAYER_TABS.filter(([, , o]) => !o?.ad2l).map(([id]) => [id, "x"])));
});

test("each page builds its tab bar from lib/pagetabs.js", () => {
  for (const [file, list] of [["teams", "TEAM_TABS"], ["player", "PLAYER_TABS"], ["hero", "HERO_TABS"], ["standings", "STANDINGS_TABS"]]) {
    assert.match(readFileSync(new URL(`../public/pages/${file}.js`, import.meta.url), "utf8"), new RegExp(`playerTabs\\(pageTabs\\(${list}, src,`), file);
  }
});
