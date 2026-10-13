import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { weekKey, fantasyWeeks, openWeek, pickable, checkPicks, pickPoints, scoreEntry, leaderboard, fantasyModels, weekGames, GAMES_COUNTED } from "../public/lib/fantasy.js";

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
const weeks = fantasyWeeks(d.series), models = fantasyModels(d.games);

test("a pick counts its best two games, scored as the slot's position", () => {
  const w = weeks.find((x) => weekGames(d.games, x).length);
  const games = weekGames(d.games, w);
  const acct = games[0].players.find((p) => p.account_id).account_id;
  const asOne = pickPoints(acct, 1, games, d.games, models), asFive = pickPoints(acct, 5, games, d.games, models);
  assert.ok(asOne.games.length >= 1 && asOne.games.filter((g) => g.counted).length === Math.min(GAMES_COUNTED, asOne.games.length));
  const top = [...asOne.games].sort((a, b) => b.score - a.score).slice(0, GAMES_COUNTED);
  assert.ok(Math.abs(asOne.points - top.reduce((t, g) => t + g.score, 0)) < 0.2);
  assert.notEqual(asOne.points, asFive.points); // the slot's position changes the score
  // Three games: still only the best two.
  const three = pickPoints(acct, 1, [...games, ...games.slice(0, 1).map((m) => ({ ...m, id: `${m.id}x`, start_time: (m.start_time ?? 0) + 1 }))], d.games, models);
  assert.ok(three.games.length > asOne.games.length && three.games.filter((g) => g.counted).length === GAMES_COUNTED);
});

test("entries saved after the lock never count; the board adds weeks up", () => {
  const w = weeks.find((x) => weekGames(d.games, x).length);
  const picks = d.teams.filter((t) => w.teams.has(t.id)).flatMap((t) => t.players.map((p) => p.account_id)).slice(0, 5);
  const early = { account: 1, name: "Early", week: w.key, picks, updatedAt: new Date((w.lock - 60) * 1000) };
  const late = { account: 2, name: "Late", week: w.key, picks, updatedAt: new Date((w.lock + 60) * 1000) };
  assert.equal(scoreEntry(late, w, d.games, models), null);
  const board = leaderboard([early, late], weeks, d.games, w.lock + 1, models);
  assert.deepEqual(board.map((r) => r.name), ["Early"]);
  assert.equal(board[0].points, scoreEntry(early, w, d.games, models).points);
  // Before the lock nothing is scored yet.
  assert.deepEqual(leaderboard([early], weeks, d.games, w.lock - 1, models), []);
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
