import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tierList, tierModel, tierModels, rankLabel, ratingOf, MIN_GAMES, K_PRIOR, K_SPEED, TIERS, VERSIONS, LIVE } from "../public/lib/tiers.js";
import { parseDuration } from "../public/lib/validate.js";

const game = (id = 1) => {
  const m = JSON.parse(readFileSync(new URL("./fixtures/game.json", import.meta.url), "utf8"));
  m.duration_sec = parseDuration(m.duration);
  m.id = `g${id}`;
  return m;
};
// n copies of the fixture as separate games; `edit(game, i)` changes one.
const games = (n, edit = () => {}) => [...Array(n)].map((_, i) => { const g = game(i); edit(g, i); return g; });
const MULT = VERSIONS.pre.mult;
const preList = (matches, options = {}) => tierList(matches, { model: tierModel(matches, { version: "pre" }), ...options });
const byName = (list) => Object.fromEntries(list.tiers.flatMap((t) => t.players).map((p) => [p.name, p]));

test("players need MIN_GAMES games to be ranked", () => {
  const few = tierList(games(2));
  assert.equal(few.eligible, 0);
  assert.equal(few.unranked.length, 10);
  const enough = tierList(games(MIN_GAMES));
  assert.equal(enough.eligible, 10);
});

test("every eligible player gets exactly one tier, by fixed rating cutoffs", () => {
  const list = tierList(games(4, (g, i) => { g.players[i].kills += 10 * i; g.players[5 + i].deaths += 3 * i; }));
  const all = list.tiers.flatMap((t) => t.players);
  assert.equal(all.length, list.eligible);
  assert.equal(new Set(all.map((p) => p.key)).size, list.eligible);
  for (const { tier, players } of list.tiers) {
    const t = TIERS.find((x) => x.tier === tier), next = TIERS[TIERS.indexOf(t) - 1];
    for (const p of players) {
      assert.ok(p.rating_exact >= t.min, `${p.name} ${p.rating_exact} in ${tier}`);
      if (next) assert.ok(p.rating_exact < next.min, `${p.name} ${p.rating_exact} belongs above ${tier}`);
    }
  }
});

test("without positions, roles come from net worth: top 3 on a team are cores", () => {
  const p = byName(tierList(games(3)));
  // Team A net worth order: Player 5, 3, 2 are the top three; 4 and 1 support.
  for (const n of ["Player 5", "Player 3", "Player 2"]) assert.equal(p[n].role, "core");
  for (const n of ["Player 4", "Player 1"]) assert.equal(p[n].role, "support");
});

test("replay positions override net worth", () => {
  const p = byName(tierList(games(3, (g) => g.players.forEach((x, i) => { x.position = (i % 5) + 1; }))));
  // Player 1 is the poorest on team A but listed as position 1.
  assert.equal(p["Player 1"].role, "core");
  assert.equal(p["Player 5"].role, "support");
});

test("pre-playoff: every stat and the stat points sit on 0–100; the best season average scores 100", () => {
  // Player 1 (a support by net worth) out-damages everyone in every game, so they have the
  // league's best support damage average and get all of damage's points. Their position's other
  // games are split between Player 10 and Player 11, whose averages (padded over fewer games) sit
  // closer to average than Player 1's, so 0 sits as far below average as Player 1 is above it
  // and neither drops to 0.
  const list = preList(games(8, (g, i) => {
    g.players[0].hero_damage += 20000; g.players[i % 5].kills += 4 * i;
    if (i >= 4) Object.assign(g.players[9], { name: "Player 11", player_key: "player 11" });
  }));
  const all = list.tiers.flatMap((t) => t.players);
  for (const p of all) {
    assert.ok(p.stat_points >= 0 && p.stat_points <= 100);
    for (const r of p.roles) for (const st of r.stats) assert.ok(st.score >= 0 && st.score <= 100, `${p.name} ${st.metric} ${st.score}`);
  }
  const dmg = (p) => p.roles.find((r) => r.role === "support").stats.find((s) => s.metric === "dmg").score;
  const supports = all.filter((p) => p.role === "support");
  const best = dmg(supports.find((p) => p.name === "Player 1"));
  assert.equal(best, Math.max(...supports.map(dmg)));
  assert.ok(Math.abs(best - 100) < 1e-9);
  for (const name of ["Player 10", "Player 11"]) assert.ok(dmg(supports.find((p) => p.name === name)) > 0, `${name}: a little below average isn't a flat 0`);
});

test("pre-playoff: series average to the season: stat points and score, weighted by games", () => {
  const list = preList(games(6, (g, i) => { g.series_id = Math.floor(i / 2) + (i === 5 ? 1 : 0); g.players[i % 10].kills += 4 * i; g.players[(i + 2) % 10].hero_damage += 4000 * i; if (i === 4) g.winner = "b"; }));
  for (const p of list.tiers.flatMap((t) => t.players)) {
    const ss = p.series.filter((x) => x.points != null), G = ss.reduce((t, x) => t + x.games, 0);
    assert.ok(Math.abs(ss.reduce((t, x) => t + x.games * x.points, 0) / G - p.stat_points) < 1e-9, `${p.name} points`);
    assert.ok(Math.abs(ss.reduce((t, x) => t + x.games * x.score, 0) / G - p.score) < 1e-9, `${p.name} score`);
  }
});

test("games in the same series average before scaling", () => {
  const list = tierList(games(4, (g, i) => { g.series_id = i < 2 ? 1 : 2; }));
  for (const p of list.tiers.flatMap((t) => t.players)) {
    assert.equal(p.series.length, 2);
    assert.deepEqual(p.series.map((s) => s.games), [2, 2]);
  }
});

test("win rate is pulled toward 50% by K_PRIOR even games", () => {
  const p = byName(tierList(games(4, (g, i) => { if (i === 0) g.winner = "b"; }))); // team A wins 3 of 4
  assert.equal(p["Player 1"].win_shrunk, (3 + K_PRIOR / 2) / (4 + K_PRIOR)); // 60%, not 75%
  assert.equal(p["Player 6"].win_shrunk, (1 + K_PRIOR / 2) / (4 + K_PRIOR)); // 40%, not 25%
  assert.equal(p["Player 1"].win, 70); // 60% on the 25–75 scale
});

test("faster wins score higher on win speed, shrunk toward 50", () => {
  // Team A wins the two short games, team B the two long ones.
  const list = tierList(games(4, (g, i) => { g.duration_sec = [1500, 1800, 3000, 3600][i]; g.winner = i < 2 ? "a" : "b"; }));
  const p = byName(list);
  assert.ok(p["Player 1"].speed > 50 && p["Player 6"].speed < 50);
  // Pool wins, sorted: 25, 30, 50, 60 min. Midrank: the 25-min win beats 3 of 4 and ties
  // itself (half) → 87.5; the 30-min win → 62.5.
  assert.equal(p["Player 1"].speed, (87.5 + 62.5 + K_SPEED * 50) / (2 + K_SPEED));
});

test("stats that grow with game length are team shares, so a longer copy of a game scores the same stat points", () => {
  // Same game twice as long with twice the damage, gold rates unchanged: shares don't move.
  // Deaths and healing are per minute, so hold them to the same rate too.
  const short = games(3);
  const long = games(3, (g) => { g.duration_sec *= 2; g.players.forEach((p) => { p.hero_damage *= 2; p.deaths *= 2; p.hero_healing *= 2; }); });
  const model = tierModel(short);
  const a = byName(tierList(short, { model })), b = byName(tierList(long, { model }));
  for (const n of Object.keys(a)) assert.ok(Math.abs(a[n].stat_points - b[n].stat_points) < 1e-9, n);
});

test("a shared model scores one pool's games against another's reference", () => {
  const pool = games(6, (g, i) => { g.players[0].kills += 5 * i; });
  const model = tierModel(pool);
  const own = tierList(games(3));
  const shared = tierList(games(3), { model });
  assert.equal(shared.eligible, own.eligible);
  assert.notDeepEqual(shared.tiers.flatMap((t) => t.players).map((p) => p.score), own.tiers.flatMap((t) => t.players).map((p) => p.score));
});

test("the default rating curve keeps 50 at 50 and stretches the ends", () => {
  assert.ok(Math.abs(ratingOf(50) - 50) < 1e-6);
  assert.equal(Math.round(ratingOf(75)), 93);
  assert.equal(Math.round(ratingOf(25)), 7);
  for (let s = 0; s < 100; s += 5) assert.ok(ratingOf(s + 5) > ratingOf(s));
  assert.ok(ratingOf(100) < 100 && ratingOf(0) > 0);
});

test("pre-playoff: the score is the stat points times the four multipliers, and the stat rows add up to the stat points", () => {
  const list = preList(games(4, (g, i) => { g.players[i].kills += 3 * i; g.players[5 + i].deaths += i; }));
  for (const p of list.tiers.flatMap((t) => t.players)) {
    const stats = p.roles.flatMap((r) => r.stats);
    assert.ok(Math.abs(stats.reduce((t, st) => t + st.points, 0) - p.stat_points) < 1e-9, p.name);
    assert.ok(Math.abs(stats.reduce((t, st) => t + st.max, 0) - 100) < 1e-9, p.name);
    for (const st of stats) assert.ok(st.points >= 0 && st.points <= st.max + 1e-9);
    const m = p.mult;
    assert.ok(Math.abs(p.stat_points * m.survival * m.consistency * m.opponents * m.winning - p.score) < 1e-9, p.name);
    for (const k of Object.keys(MULT)) assert.ok(m[k] >= MULT[k][0] - 1e-9 && m[k] <= MULT[k][1] + 1e-9, `${p.name} ${k} ${m[k]}`);
  }
});

test("pre-playoff: winning: a better record and faster wins mean a bigger multiplier", () => {
  const p = byName(preList(games(4, (g, i) => { if (i === 0) g.winner = "b"; }))); // A 3–1
  assert.ok(p["Player 1"].mult.winning > 1 && p["Player 6"].mult.winning < 1);
  // 60% adjusted -> 70/100 win rate; winning = (2 × 70 + speed) / 3.
  assert.ok(Math.abs(p["Player 1"].winning - (2 * 70 + p["Player 1"].speed) / 3) < 1e-9);
});

test("pre-playoff: opponent strength: games against a team that wins elsewhere count up, a team that loses elsewhere down", () => {
  const vs = (a, b, winner, i) => { const g = game(i); g.team_a = a; g.team_b = b; g.winner = winner; g.players.forEach((p) => { p.player_key = `${p.team === "a" ? a : b}-${p.name}`; }); return g; };
  const pool = [
    ...[0, 1, 2, 3].map((i) => vs("Strong", "Weak", "a", i)), // Strong 4–0 over Weak
    ...[4, 5, 6].map((i) => vs("X", "Strong", "a", i)),
    ...[7, 8, 9].map((i) => vs("Y", "Weak", "a", i)),
  ];
  const p = Object.fromEntries(preList(pool).tiers.flatMap((t) => t.players).map((x) => [x.key, x]));
  // Strong outside games against X: 4–0 -> (4 + 3) / (4 + 6) = 70%; Weak outside Y: 0–4 -> 30%.
  assert.ok(Math.abs(p["X-Player 1"].opp_rate - 0.7) < 1e-9);
  assert.ok(Math.abs(p["Y-Player 1"].opp_rate - 0.3) < 1e-9);
  assert.ok(Math.abs(p["X-Player 1"].mult.opponents - 1.08) < 1e-9);
  assert.ok(Math.abs(p["Y-Player 1"].mult.opponents - 0.92) < 1e-9);
});

test("lane result: supports only, as a lane pair against the enemy pair (cores have laning)", () => {
  const g = game(1);
  g.players.forEach((p, i) => { p.position = (i % 5) + 1; p.gold_t = Array(11).fill(0); p.gold_t[10] = 3000 + 100 * i; p.xp10 = 2000 + 10 * i; });
  const list = tierList([g, g, g].map((x, i) => ({ ...x, id: `g${i}`, players: x.players.map((p) => ({ ...p })) })), { minGames: 1 });
  const stat = (name) => byName(list)[name].roles[0].stats.find((s) => s.metric === "lanewin");
  const v = (name) => stat(name).value;
  const at10 = (i) => 3000 + 100 * i + 2000 + 10 * i; // player index i (Player i+1)
  assert.equal(stat("Player 1"), undefined); // pos 1
  assert.equal(stat("Player 2"), undefined); // mid
  assert.equal(v("Player 5"), at10(4) + at10(0) - (at10(7) + at10(8))); // pos 5 + 1 vs enemy 3 + 4
  assert.equal(v("Player 4"), at10(3) + at10(2) - (at10(5) + at10(9))); // pos 4 + 3 vs enemy 1 + 5
});

test("survival: dying less raises the survival multiplier", () => {
  // Player 6 has the most deaths of any core (9); with none they'd have the fewest.
  const base = byName(tierList(games(4)))["Player 6"];
  const safer = byName(tierList(games(4, (g) => { g.players[5].deaths = 0; })))["Player 6"];
  assert.ok(safer.survival > base.survival);
  assert.ok(safer.mult.survival > base.mult.survival);
});

test("kills and assists are scored separately and add up to kill participation", () => {
  const p = byName(tierList(games(3)))["Player 1"]; // 4 kills, 19 assists, team 29 kills
  const stats = Object.fromEntries(p.roles[0].stats.map((s) => [s.metric, s]));
  assert.ok(Math.abs(stats.kills.value - 4 / 29) < 1e-9);
  assert.ok(Math.abs(stats.assists.value - 19 / 29) < 1e-9);
  assert.equal(stats.kills.raw, 4);
  assert.equal(stats.assists.raw, 19);
});

test("pre-playoff: GPM and net worth are judged against the position's line for that game length", () => {
  // Pool: the same game at 30 and 60 min, where every player has 100 more GPM and 10k more net
  // worth in the long one. Everyone sits the same distance from the line in both, so each
  // player's score is the same in either length.
  const pool = [...games(3, (g) => { g.duration_sec = 1800; }), ...games(3, (g) => { g.duration_sec = 3600; g.players.forEach((p) => { p.gpm += 100; p.net_worth += 10000; }); })];
  const model = tierModel(pool, { version: "pre" });
  const short = byName(preList(pool.slice(0, 3), { model })), long = byName(preList(pool.slice(3), { model }));
  for (const n of ["Player 2", "Player 7"]) {
    const s = (x) => Object.fromEntries(x[n].roles[0].stats.map((st) => [st.metric, st]));
    assert.ok(Math.abs(s(short).gpm.score - s(long).gpm.score) < 1e-6, `${n} gpm`);
    assert.ok(Math.abs(s(short).nw.score - s(long).nw.score) < 1e-6, `${n} nw`);
  }
});

test("the fitted curve puts the pool's median player at 50", () => {
  const pool = games(6, (g, i) => { g.players[i % 10].kills += 5 * i; g.players[(i + 3) % 10].deaths += 2 * i; });
  const list = tierList(pool);
  const ratings = list.tiers.flatMap((t) => t.players).map((p) => p.rating_exact).sort((a, b) => a - b);
  assert.ok(Math.abs(ratings[Math.floor(ratings.length / 2)] - 50) < 1e-6);
});

test("rank labels", () => {
  assert.equal(rankLabel(80), "Immortal");
  assert.equal(rankLabel(74), "Divine 4");
  assert.equal(rankLabel(null), null);
});

test("each player's exact positions: games at each and the one played most", () => {
  const all = tierList(games(MIN_GAMES)).tiers.flatMap((t) => t.players);
  for (const p of all) {
    assert.equal(Object.values(p.pos_games).reduce((a, b) => a + b, 0), p.games, p.name);
    assert.ok(p.pos >= 1 && p.pos <= 5 && p.pos_games[p.pos] === Math.max(...Object.values(p.pos_games)), p.name);
    assert.equal(p.role, p.pos <= 3 ? "core" : "support");
  }
  // One player per position on each side of the fixture.
  assert.deepEqual([1, 2, 3, 4, 5].map((n) => all.filter((p) => p.pos === n).length), [2, 2, 2, 2, 2]);
});

test("a position's tier list: only games at that position, rated against that position's players", () => {
  const gs = games(4, (g, i) => { g.players[3].kills += 4 * i; });
  const list = tierList(gs, { pos: 4 });
  const all = list.tiers.flatMap((t) => t.players);
  assert.equal(list.model.pos, 4);
  assert.equal(all.length, 2); // one pos 4 a side
  for (const p of all) assert.deepEqual([p.pos, p.pos_games[4], p.games], [4, 4, 4]);
  // Its anchors come from pos 4s only: every stat stays on 0–100 and the two differ.
  const scores = all.flatMap((p) => p.roles[0].stats.map((s) => s.score));
  assert.ok(scores.every((v) => v >= 0 && v <= 100));
  assert.notEqual(all[0].stat_points, all[1].stat_points);
});

test("a swapper is listed once, by their main position, and every game counts; others are untouched", () => {
  // Player 4 (pos 4 on team a) plays pos 5 in two of five games and the pos 5 swaps to pos 4.
  const place = (g) => g.players.forEach((p, k) => { p.position = (k % 5) + 1; });
  const swap = (g, i) => { place(g); if (i < 2) { g.players[3].position = 5; g.players[4].position = 4; } };
  const gs = games(5, swap), plain = games(5, place);
  const lists = (m) => { const set = tierModels(m); return [4, 5].map((n) => tierList(m, { model: set[n], pos: n }).tiers.flatMap((t) => t.players)); };
  const [four, five] = lists(gs), [fourPlain, fivePlain] = lists(plain);
  const names = (l) => l.map((p) => p.name);
  assert.equal(new Set([...names(four), ...names(five)]).size, names(four).length + names(five).length, "no player on both lists");
  const sw = four.find((p) => p.games === 5 && p.by_pos);
  assert.ok(sw, "the swapper keeps all five games on their main list");
  assert.deepEqual(sw.by_pos.map((b) => [b.pos, b.games]).sort(), [[4, 3], [5, 2]]);
  // Players on pos 1–3 never swapped, so their position lists don't change.
  for (const n of [1, 2, 3]) {
    const set = tierModels(gs), setPlain = tierModels(plain);
    const a = tierList(gs, { model: set[n], pos: n }).tiers.flatMap((t) => t.players), b = tierList(plain, { model: setPlain[n], pos: n }).tiers.flatMap((t) => t.players);
    assert.deepEqual(a.map((p) => [p.name, p.score]), b.map((p) => [p.name, p.score]), `pos ${n}`);
  }
  assert.ok(fourPlain.length && fivePlain.length);
});


test("playoff is the default and the pre-playoff model remains selectable", () => {
  const pool = games(6, (g, i) => { g.series_id = Math.floor(i / 2); g.players[0].kills += 5 * i; });
  assert.equal(LIVE, "playoff");
  const current = tierList(pool);
  assert.equal(current.model.version, "playoff");
  assert.deepEqual(current, tierList(pool, { model: tierModel(pool, { version: "playoff" }) }));
  const previous = preList(pool);
  assert.equal(previous.model.version, "pre");
  assert.equal(previous.eligible, current.eligible);
  for (const p of current.tiers.flatMap((t) => t.players)) {
    assert.ok(Math.abs(p.score - (p.stat_points * p.mult.survival * p.mult.consistency * p.mult.opponents + p.win_points + p.podium.points)) < 1e-9);
  }
  assert.notDeepEqual(byName(current), byName(previous));
});
