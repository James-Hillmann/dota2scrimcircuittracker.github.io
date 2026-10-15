import { test } from "node:test";
import assert from "node:assert/strict";
import { scoutReport } from "../public/lib/scout-report.js";
import { playerEntry, cleanReport, ScoutStore } from "../workers/steam-auth/src/scout.js";
import worker from "../workers/steam-auth/src/index.js";
import { pubsSince } from "../public/lib/predict.js";
import { decodeTotals } from "../public/lib/herogrid.js";
import { buildSearchIndex, searchIndex } from "../public/lib/search.js";

const NOW = Date.UTC(2026, 9, 14), T = NOW / 1000;
const fakeOpenDota = (calls) => async (path, init) => {
  calls.push([init?.method ?? "GET", path]);
  if (path.endsWith("/refresh")) return {};
  if (/\/players\/\d+$/.test(path)) return { profile: { personaname: "Newbie", avatarmedium: "a.png" }, rank_tier: 54 };
  if (path.includes("/matches")) return [
    { hero_id: 1, kills: 5, deaths: 2, assists: 7, start_time: T - 86400, lobby_type: 7, player_slot: 1, radiant_win: true, duration: 2000 },
    { hero_id: 14, kills: 1, deaths: 9, assists: 3, start_time: T - 3600, lobby_type: 0, player_slot: 130, radiant_win: true, duration: 1800 },
    { hero_id: 2, kills: 0, deaths: 0, assists: 0, start_time: T - 7200, lobby_type: 0, player_slot: 1, radiant_win: true, duration: 300 }, // abandoned: dropped
    { hero_id: 5, kills: 2, deaths: 2, assists: 2, start_time: T - 9000, lobby_type: 1, player_slot: 1, radiant_win: true, duration: 2400 },
  ];
  const lobby = /lobby_type=(\d)/.exec(path)[1];
  return { 0: [{ hero_id: "1", games: 10, win: 6 }], 7: [{ hero_id: "1", games: 4, win: 1 }, { hero_id: "14", games: 20, win: 12 }], 1: [{ hero_id: "5", games: 3, win: 2 }, { hero_id: "6", games: 0, win: 0 }] }[lobby];
};

test("scout report: pubs and all-time totals in the sync's formats", async () => {
  const calls = [], r = await scoutReport("123", fakeOpenDota(calls), { now: NOW, refresh: true });
  assert.deepEqual(calls[0], ["POST", "/players/123/refresh"]);
  assert.equal(r.name, "Newbie");
  assert.equal(r.rank_tier, 54);
  assert.equal(r.private, false);
  assert.equal(r.lobby_recent, 1);
  const pubs = pubsSince({ pubs: { 123: r.pubs } }, "123", T - 14 * 86400);
  assert.deepEqual(pubs.map((g) => [g.hero, g.won, g.ranked]), [["Pudge", false, false], ["Anti-Mage", true, true]]);
  const t = decodeTotals(r.totals, { 1: "Anti-Mage", 5: "Crystal Maiden", 14: "Pudge" });
  assert.deepEqual(t.pubs, [{ hero: "Pudge", games: 20, wins: 12 }, { hero: "Anti-Mage", games: 14, wins: 7 }]);
  assert.deepEqual(t.lobby, [{ hero: "Crystal Maiden", games: 3, wins: 2 }]);
});

test("scout report: no refresh unless asked; private history; OpenDota down gives no report", async () => {
  const calls = [];
  await scoutReport("1", fakeOpenDota(calls), { now: NOW });
  assert.ok(!calls.some(([m]) => m === "POST"));
  const hidden = await scoutReport("9", async (path) => (/\/players\/\d+$/.test(path) ? { profile: { personaname: "Hidden" } } : []), { now: NOW });
  assert.equal(hidden.private, true);
  assert.equal(await scoutReport("9", async () => null, { now: NOW }), null);
});

test("name registry: cleans the name, refuses foreign avatars, keeps old fields", () => {
  const e = playerEntry("5", { name: "  Darth\u0007 Kokujin ", avatar: "https://avatars.steamstatic.com/abc_medium.jpg" }, null, 1);
  assert.deepEqual(e, { account: 5, name: "Darth Kokujin", avatar: "https://avatars.steamstatic.com/abc_medium.jpg", at: 1, report: null });
  assert.equal(playerEntry("5", { avatar: "https://evil.example/x.jpg" }, e, 2).avatar, e.avatar);
  assert.equal(playerEntry("5", { name: "x".repeat(200) }).name.length, 64);
});

test("saved report: the browser's report is kept to its shapes, and kept when a save sends none", async () => {
  const report = await scoutReport("123", fakeOpenDota([]), { now: NOW });
  const e = playerEntry("123", { name: "Newbie", report }, null, 5);
  assert.deepEqual(e.report.pubs, report.pubs);
  assert.deepEqual(e.report.totals, report.totals);
  assert.equal(e.report.at, 5); // the Worker's clock, not the browser's
  assert.equal(e.report.name, undefined); // only known fields
  assert.deepEqual(playerEntry("123", { name: "Renamed" }, e, 9).report, e.report);
  assert.deepEqual(cleanReport({ pubs: [1, "Puck", 1, 2, 3, 4, "x"], totals: { p: [1, 2, -3], l: "no" } }, 1).pubs, []);
  assert.deepEqual(cleanReport({ totals: { p: [1, 2, -3] } }, 1).totals, { p: [], l: [] });
  assert.equal(playerEntry("7", { name: "Old" }, { account: 7, at: 1, name: null, pubs: [] }).report, null); // the first Worker scouts' flat entries
});

test("name registry store: register, read one, list named players", async () => {
  const kept = new Map([["scout:7", { account: 7, at: 1, name: null }]]); // an old empty report stays out of the list
  const store = new ScoutStore({ storage: { get: async (k) => kept.get(k), put: async (k, v) => kept.set(k, v), list: async () => kept } });
  assert.equal((await store.fetch(new Request("https://scout/?account=1"))).status, 404);
  await store.fetch(new Request("https://scout/?account=1", { method: "POST", body: JSON.stringify({ name: "Kokujin" }) }));
  assert.equal((await (await store.fetch(new Request("https://scout/?account=1"))).json()).name, "Kokujin");
  assert.deepEqual((await (await store.fetch(new Request("https://scout/players"))).json()).map((p) => p.name), ["Kokujin"]);
});

test("scout endpoint: needs a sign-in to register, refuses other origins", async () => {
  const env = { SCOUT: { idFromName: () => 0, get: () => ({ fetch: async () => Response.json([]) }) }, FIREBASE_WEB_API_KEY: "k" };
  assert.equal((await worker.fetch(new Request("https://w.dev/scout", { method: "POST" }), env)).status, 401);
  assert.equal((await worker.fetch(new Request("https://w.dev/scout/5", { headers: { origin: "https://evil.example" } }), env)).status, 403);
  const r = await worker.fetch(new Request("https://w.dev/scout/players", { headers: { origin: "http://localhost:3000" } }), env);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("access-control-allow-origin"), "http://localhost:3000");
});

test("search finds Steam players on no roster, but not twice for a rostered one", () => {
  const data = { teams: [{ id: 1, name: "Team", players: [{ name: "Rostered", account_id: 11 }] }], games: [] };
  const idx = buildSearchIndex([{ key: "warrior", label: "Warrior", root: "#/warrior", data }], null,
    { label: "Not in a league", root: "#/warrior", players: [{ account: 39702330, name: "Darth Kokujin" }, { account: 11, name: "Rostered steam" }] });
  const hit = searchIndex(idx, "kokujin")[0];
  assert.equal(hit.href, "#/warrior/player/39702330");
  assert.equal(hit.league, "steam");
  assert.equal(searchIndex(idx, "rostered steam").length, 0);
});
