import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { weekKey, fantasyWeeks, openWeek, pickable, checkPicks, pickPoints, scoreEntry, leaderboard, fantasyPoints, playoffWeeks, testWeek, TEST_WEEK, weekBoard, weekGames, GAMES_COUNTED } from "../public/lib/fantasy.js";

const T = (iso) => Date.parse(iso) / 1000;
const series = [
  { id: 1, time: T("2026-10-02T01:00:00Z"), home: 10, away: 11 }, // Thu night US = Fri UTC, week of Sep 28
  { id: 2, time: T("2026-10-02T02:00:00Z"), home: 12, away: 13 },
  { id: 3, time: T("2026-10-09T01:00:00Z"), home: 10, away: 12 }, // 11 and 13 have a bye
];
const teams = [10, 11, 12, 13].map((id) => ({ id, name: `T${id}`, players: [1, 2, 3, 4, 5].map((n) => ({ name: `P${id}-${n}`, account_id: id * 100 + n })) }));

test("weeks run Monday to Monday UTC and lock at the first series", () => {
  assert.equal(weekKey(T("2026-10-02T01:00:00Z")), "2026-09-28");
  assert.equal(weekKey(T("2026-10-05T00:00:00Z")), "2026-10-05");
  const ws = fantasyWeeks(series);
  assert.deepEqual(ws.map((w) => [w.key, w.lock, w.series.length]), [["2026-09-28", series[0].time, 2], ["2026-10-05", series[2].time, 1]]);
  assert.equal(openWeek(ws, series[0].time - 1).key, "2026-09-28");
  assert.equal(openWeek(ws, series[0].time).key, "2026-10-05"); // locked at the first start
  assert.equal(openWeek(ws, series[2].time + 1), null);
});

test("only teams playing that week can be picked, and never yourself", () => {
  const w = fantasyWeeks(series)[1];
  const pool = pickable(teams, w, 1001);
  assert.deepEqual([...new Set(pool.map((p) => p.team_id))], [10, 12]);
  assert.ok(!pool.some((p) => p.account === 1001));
  assert.equal(checkPicks([1002, 1003, 1201, 1202, 1203], pool, 1001), null);
  assert.equal(checkPicks([1001, 1003, 1201, 1202, 1203], pool, 1001), "You can't pick yourself.");
  assert.equal(checkPicks([1101, 1003, 1201, 1202, 1203], pool, 1001), "Every pick must be on a team that plays this week."); // bye
  assert.equal(checkPicks([1002, 1002, 1201, 1202, 1203], pool, 1001), "Each player can fill one position only.");
  assert.equal(checkPicks([1002, 1003, 1201, 1202], pool, 1001), "Pick a player for every position.");
});

// Real games: the Champion file.
const d = JSON.parse(fs.readFileSync(new URL("../public/data/ad2l.json", import.meta.url)));
const weeks = fantasyWeeks(d.series);

test("raw fantasy points have fixed weights, no position or population curve", () => {
  const p = { kills: 10, deaths: 2, last_hits: 200, denies: 10, gpm: 500, tf_part: 0.5,
    obs_placed: 2, camps_stacked: 2, runes: [2, 2], first_blood: 1, roshan_kills: 1, stuns: 10 };
  const f = fantasyPoints(p);
  assert.equal(f.points, 17);
  assert.equal(f.parts.find((x) => x.label === "Deaths").points, 2.4);
  assert.equal(fantasyPoints({ deaths: 20 }).points, 0);
});

test("a pick counts its best two raw-stat games and exposes every contribution", () => {
  const games = [0, 10, 20].map((kills, i) => ({ id: i, start_time: i + 1, players: [{ account_id: 1, kills }] }));
  const result = pickPoints(1, games);
  assert.equal(result.points, 15);
  assert.deepEqual(result.games.map((g) => g.counted), [false, true, true]);
  assert.equal(result.games[2].parts.find((x) => x.label === "Kills").points, 6);
  assert.equal(pickPoints(999, games).points, 0);
});

test("the first week pools tiebreakers and later weeks only include the playoff bracket", () => {
  const divisions = TEST_WEEK.leagues.map((key) => ({ key, ...JSON.parse(fs.readFileSync(new URL(`../public/data/${key}.json`, import.meta.url))) }));
  const w = testWeek(divisions);
  assert.equal(w.key, TEST_WEEK.key);
  assert.equal(w.league, "all");
  assert.equal(w.teams.size, 7);
  assert.equal(pickable(divisions.flatMap((x) => x.teams), w).length, 35);
  const later = { id: "playoff", time: T("2026-10-23T01:00:00Z"), home: 10, away: 11 };
  const ws = playoffWeeks("ad2l", [...series, later]);
  assert.deepEqual(ws.map((x) => x.key), ["2026-10-19"]);
  assert.equal(weekGames([{ ...later, series_id: "playoff", league: "heroic" }], ws[0]).length, 0);
});

test("entries saved after the lock never count; the board adds weeks up", () => {
  const w = weeks.find((x) => weekGames(d.games, x).length);
  const picks = d.teams.filter((t) => w.teams.has(t.id)).flatMap((t) => t.players.map((p) => p.account_id)).slice(0, 5);
  const early = { account: 1, name: "Early", week: w.key, picks, updatedAt: new Date((w.lock - 60) * 1000) };
  const late = { account: 2, name: "Late", week: w.key, picks, updatedAt: new Date((w.lock + 60) * 1000) };
  assert.equal(scoreEntry(late, w, d.games), null);
  assert.equal(scoreEntry(early, { ...w, eligible: new Set() }, d.games), null);
  assert.equal(scoreEntry({ ...early, updatedAt: new Date(w.lock * 1000) }, w, d.games), null);
  const board = leaderboard([early, late], weeks, d.games, w.lock + 1);
  assert.deepEqual(board.map((r) => r.name), ["Early"]);
  assert.equal(board[0].points, scoreEntry(early, w, d.games).points);
  assert.deepEqual(weekBoard([early, late], w, d.games).map((r) => r.name), ["Early"]);
  // Before the lock nothing is scored yet.
  assert.deepEqual(leaderboard([early], weeks, d.games, w.lock - 1), []);
});

test("announced series join the week until PlayOn posts its own", async () => {
  const { withAnnounced, ANNOUNCED } = await import("../public/lib/divisions.js");
  const a = ANNOUNCED.ad2l[0];
  const withA = withAnnounced("ad2l", d.series);
  assert.equal(withA.length, d.series.length + 1);
  const w = fantasyWeeks(withA).find((x) => x.seriesIds.has(a.id));
  assert.deepEqual([...w.teams].sort(), [a.home, a.away].sort());
  assert.equal(pickable(d.teams, w).length, 10);
  // PlayOn posts it (another id, same teams, same night): the announced one drops out.
  const posted = [...d.series, { id: 99999, time: a.time + 3600, home: a.away, away: a.home }];
  assert.equal(withAnnounced("ad2l", posted).length, posted.length);
  // Its games count by teams and week even without a PlayOn series id.
  const g = { ...d.games[0], id: "x", series_id: null, start_time: a.time + 600, team_a_id: a.home, team_b_id: a.away };
  assert.equal(weekGames([g], w).length, 1);
});
test("captain doubles one pick's best-two-game total and legacy entries retain their score", () => {
  const week={key:'2026-10-12',lock:100,seriesIds:new Set(['captain-test']),teams:new Set()};
  const picks=[11,12,13,14,15];
  const entry={account:99,picks,week:week.key,updatedAt:new Date(90000)};
  const games=[0,10,20].map((kills,i)=>({id:i,series_id:'captain-test',start_time:101+i,players:picks.map(account_id=>({account_id,kills}))}));
  const original=scoreEntry(entry,week,games),result=scoreEntry({...entry,captain:12},week,games);
  assert.equal(original.points,75);
  assert.equal(result.points,90);
  assert.equal(result.picks[1].points,30);
  assert.equal(result.picks[1].basePoints,15);
  assert.equal(result.picks.filter(p=>p.captain).length,1);
  assert.deepEqual(result.picks[1].games.map(g=>g.counted),[false,true,true]);
  assert.equal(weekBoard([{...entry,captain:12}],week,games)[0].points,90);
  assert.equal(leaderboard([{...entry,captain:12}],[week],games,101)[0].points,90);
  assert.equal(scoreEntry({...entry,captain:99},week,games),null);
  assert.equal(scoreEntry({...entry,captain:'12'},week,games),null);
});
