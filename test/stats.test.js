import { test } from "node:test";
import assert from "node:assert/strict";
import { statsRange, goatStats, MAX_DAYS, TRIES } from "../workers/steam-auth/src/stats.js";
import worker from "../workers/steam-auth/src/index.js";
import { hoursOf, byHourOfDay } from "../public/lib/visits.js";
import { ADMIN_ACCOUNT } from "../public/lib/pack-gifts.js";

const NOW = Date.UTC(2026, 9, 14, 12, 30);

test("stats range: rounded to whole hours, at most MAX_DAYS, default a week", () => {
  assert.deepEqual(statsRange("2026-10-13T10:20:00Z", "2026-10-14T12:30:00Z"), { start: "2026-10-13T10:00:00Z", end: "2026-10-14T13:00:00Z" });
  assert.deepEqual(statsRange(null, null, NOW), { start: "2026-10-07T12:00:00Z", end: "2026-10-14T13:00:00Z" });
  assert.equal(statsRange("2026-10-14T00:00:00Z", "2026-10-13T00:00:00Z"), null);
  assert.equal(statsRange("nope", null, NOW), null);
  assert.equal(statsRange(new Date(NOW - (MAX_DAYS + 1) * 864e5).toISOString(), new Date(NOW).toISOString()), null);
});

test("goatStats: pages through every path with exclude_paths and keeps day + hourly", async () => {
  const calls = [];
  const day = (n) => ({ day: "2026-10-14", hourly: Array.from({ length: 24 }, (_, h) => (h === 9 ? n : 0)), daily: n });
  const get = async (url, init) => {
    calls.push([url, init.headers.Authorization]);
    const u = new URL(url);
    if (u.pathname.endsWith("/stats/total")) return Response.json({ total: 12, total_events: 2, stats: [day(12)] });
    const excluded = u.searchParams.getAll("exclude_paths");
    return excluded.length
      ? Response.json({ hits: [{ path_id: 2, path: "/#/scrims/heroes", title: "Heroes", count: 2, max: 2, stats: [day(2)] }], more: false })
      : Response.json({ hits: [{ path_id: 1, path: "/#/scrims/week", title: "Week", count: 10, max: 10, stats: [day(10)] }], more: true });
  };
  const r = await goatStats({ start: "a", end: "b" }, { site: "demo", key: "k", get });
  assert.equal(calls[0][0].startsWith("https://demo.goatcounter.com/api/v0/stats/total?"), true);
  assert.equal(calls[0][1], "Bearer k");
  assert.match(calls[2][0], /exclude_paths=1/);
  assert.deepEqual(r.paths.map((p) => [p.path, p.count]), [["/#/scrims/week", 10], ["/#/scrims/heroes", 2]]);
  assert.equal(r.total, 12);
  assert.equal(r.events, 2);
  assert.equal(r.paths[0].stats[0].hourly[9], 10);
  assert.equal(byHourOfDay(r.stats)[9], 12);
  assert.equal(hoursOf(r.stats).length, 24);
});

test("stats route: needs a token, refuses other origins and non-admins", async () => {
  const realFetch = globalThis.fetch;
  const env = { FIREBASE_WEB_API_KEY: "x", GOATCOUNTER_TOKEN: "k" };
  const as = (account) => async (url) => String(url).includes("identitytoolkit")
    ? Response.json({ users: [{ localId: `steam:${account}` }] })
    : String(url).includes("/stats/total") ? Response.json({ total: 1, total_events: 0, stats: [] }) : Response.json({ hits: [], more: false });
  const req = (h = {}) => new Request("https://w.dev/stats", { headers: { origin: "http://localhost:3000", ...h } });
  try {
    assert.equal((await worker.fetch(req(), env)).status, 401);
    assert.equal((await worker.fetch(new Request("https://w.dev/stats", { headers: { origin: "https://evil.example" } }), env)).status, 403);
    globalThis.fetch = as("5");
    const no = await worker.fetch(req({ authorization: "Bearer t" }), env);
    assert.equal(no.status, 403);
    assert.match((await no.json()).error, /Only Fav/);
    globalThis.fetch = as(ADMIN_ACCOUNT);
    const yes = await worker.fetch(req({ authorization: "Bearer t" }), env);
    assert.equal(yes.status, 200);
    assert.equal(yes.headers.get("access-control-allow-origin"), "http://localhost:3000");
    assert.equal((await yes.json()).total, 1);
    assert.equal((await worker.fetch(req({ authorization: "Bearer t" }), { FIREBASE_WEB_API_KEY: "x" })).status, 503);
  } finally { globalThis.fetch = realFetch; }
});

test("goatStats: retries a failed call, and gives up after TRIES", async () => {
  let n = 0;
  const flaky = async (url) => (++n === 1 ? new Response("nope", { status: 404 })
    : String(url).includes("/stats/total") ? Response.json({ total: 3, total_events: 0, stats: [] }) : Response.json({ hits: [], more: false }));
  const r = await goatStats({ start: "a", end: "b" }, { site: "demo", key: "k", get: flaky, wait: async () => {} });
  assert.equal(r.total, 3);
  assert.equal(n, 3); // failed total, total again, hits
  let tries = 0;
  const down = async () => (tries++, new Response("<html>down</html>", { status: 404 }));
  await assert.rejects(goatStats({ start: "a", end: "b" }, { site: "demo", key: "k", get: down, wait: async () => {} }), /GoatCounter 404 on \/stats\/total: <html>down<\/html>/);
  assert.equal(tries, TRIES);
});
