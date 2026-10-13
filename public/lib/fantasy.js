import { withAnnounced, isPostseason } from "./divisions.js";

// Fantasy league, one per AD2L division, over the playoffs. Each week you pick five of that
// league's rostered players, one per position (slot 1–5), from teams with a series that week;
// picks lock at the week's first series start. A pick scores fantasy points: raw stat points per
// game (FANTASY_POINTS, no curve and no comparison with other players), and only their best two
// games of the week count (a Bo3: the best two of three). You can't pick yourself; your teammates
// are fine. The leaderboard is the playoffs so far.
// The test week (TEST_WEEK): week 8's tiebreakers, one Fantasy across every division that plays
// one, stored under the league key "all".
//
// Pure functions over the league's data file (`teams`, `series`) and its games, so they run in the
// Node tests. Entries come from lib/store.js (listFantasy); sign-in from workers/steam-auth.

export const SLOTS = [1, 2, 3, 4, 5];
export const GAMES_COUNTED = 2;
// The first Fantasy week, a test: the week 8 tiebreakers of these divisions (lib/divisions.js
// ANNOUNCED), picked and scored as one league. New season: null.
export const TEST_WEEK = { key: "2026-10-12", league: "all", leagues: ["challenger", "ad2l", "heroic"] };

// Fantasy points for one game: raw numbers times a fixed value each (the pro fantasy scheme),
// added up. [label, points per unit, what one unit is, value from the game's player row]
export const FANTASY_POINTS = [
  ["Kills", 0.3, "kill", (p) => p.kills ?? 0],
  ["Deaths", -0.3, "death, from a 3 point start (never below 0)", (p) => p.deaths ?? 0],
  ["Last hits and denies", 0.003, "creep", (p) => (p.last_hits ?? 0) + (p.denies ?? 0)],
  ["GPM", 0.002, "gold per minute", (p) => p.gpm ?? 0],
  ["Teamfights", 3, "share of the team's kills taken part in", (p) => p.tf_part ?? 0],
  ["Observer wards", 0.5, "ward placed", (p) => p.obs_placed ?? 0],
  ["Camps stacked", 0.5, "stack", (p) => p.camps_stacked ?? 0],
  ["Runes", 0.25, "rune", (p) => (Array.isArray(p.runes) ? p.runes.reduce((t, n) => t + n, 0) : 0)],
  ["First blood", 4, "first blood", (p) => (p.first_blood ? 1 : 0)],
  ["Roshan", 1, "Roshan kill", (p) => p.roshan_kills ?? 0],
  ["Stuns", 0.05, "second of stun", (p) => p.stuns ?? 0],
];
const round1 = (x) => Math.round(x * 10) / 10;
// One player row's points: { points, parts: [{ label, value, points }] }.
export function fantasyPoints(p) {
  const parts = FANTASY_POINTS.map(([label, per, , get]) => {
    const value = get(p);
    return { label, value, points: label === "Deaths" ? Math.max(0, 3 + per * value) : per * value };
  });
  return { points: round1(parts.reduce((t, x) => t + x.points, 0)), parts };
}

// Weeks run Monday 00:00 UTC to the next Monday; a week's key is that Monday's date, so it's the
// same in every time zone.
export function weekKey(t) {
  const d = new Date(t * 1000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7))).toISOString().slice(0, 10);
}

// The league's weeks, oldest first: { key, lock (first series start, unix s), series, seriesIds,
// teams (team ids with a series that week) }.
export function fantasyWeeks(series) {
  const by = new Map();
  for (const s of series ?? []) {
    if (!s.time) continue;
    const k = weekKey(s.time);
    const w = by.get(k) ?? by.set(k, { key: k, lock: Infinity, series: [], seriesIds: new Set(), teams: new Set() }).get(k);
    w.series.push(s); w.seriesIds.add(s.id); w.lock = Math.min(w.lock, s.time);
    for (const t of [s.home, s.away]) if (t != null) w.teams.add(t);
  }
  return [...by.values()].sort((a, b) => a.lock - b.lock);
}

// Restrict later weeks to the division's playoff bracket. The shared test only includes
// its tiebreaker week; it remains available to review after it has ended.
export function playoffWeeks(league, series) {
  return fantasyWeeks(withAnnounced(league, series).filter((s) => isPostseason(s)
    && (!TEST_WEEK || weekKey(s.time) > TEST_WEEK.key))).map((w) => ({ ...w, league }));
}
export function testWeek(divisions) {
  if (!TEST_WEEK) return null;
  const series = divisions.filter((d) => TEST_WEEK.leagues.includes(d.key)).flatMap((d) =>
    withAnnounced(d.key, d.series).filter((s) => isPostseason(s) && weekKey(s.time) === TEST_WEEK.key));
  const w = fantasyWeeks(series)[0];
  return w ? { ...w, league: TEST_WEEK.league } : null;
}

// The week open for picks at `now` (unix s): the first whose lock is still ahead. null if PlayOn
// hasn't posted one.
export const openWeek = (weeks, now) => weeks.find((w) => w.lock > now) ?? null;

// Who can be picked in `week`: every rostered player of a team playing that week, except `me`
// (the picker's account id). [{ account, name, team, team_id }]
export function pickable(teams, week, me = null) {
  return (teams ?? []).filter((t) => week.teams.has(t.id)).flatMap((t) => t.players
    .filter((p) => p.account_id && p.account_id !== me)
    .map((p) => ({ account: p.account_id, name: p.name, team: t.name, team_id: t.id })));
}

// Why `picks` (five account ids, slot 1 first) can't be saved, or null if they can.
export function checkPicks(picks, pool, me = null) {
  if (!Array.isArray(picks) || picks.length !== SLOTS.length || picks.some((a) => !Number.isInteger(a))) return "Pick a player for every position.";
  if (new Set(picks).size !== picks.length) return "Each player can fill one position only.";
  if (me != null && picks.includes(me)) return "You can't pick yourself.";
  const ok = new Set(pool.map((p) => p.account));
  if (picks.some((a) => !ok.has(a))) return "Every pick must be on a team that plays this week.";
  return null;
}

// The week's games: those of its series, or (a series PlayOn hadn't posted, see
// divisions.js ANNOUNCED) played that week between two of its teams.
export const weekGames = (matches, week) => matches.filter((m) => (!week.league || week.league === "all" || m.league === week.league)
  && (week.seriesIds.has(m.series_id)
  || (m.start_time && weekKey(m.start_time) === week.key && week.teams.has(m.team_a_id) && week.teams.has(m.team_b_id))));

// One pick's week: each game it played scored in fantasy points, and the best GAMES_COUNTED added
// up. { points, games: [{ id, match, time, score, parts, counted }] } (games oldest first).
export function pickPoints(account, games) {
  const scored = games.flatMap((m) => {
    const p = (m.players ?? []).find((x) => x.account_id === account);
    if (!p) return [];
    const f = fantasyPoints(p);
    return [{ id: m.id, match: m, time: m.start_time ?? 0, score: f.points, parts: f.parts }];
  }).sort((a, b) => a.time - b.time);
  const best = new Set([...scored].sort((a, b) => b.score - a.score).slice(0, GAMES_COUNTED).map((g) => g.id));
  for (const g of scored) g.counted = best.has(g.id);
  return { points: round1(scored.filter((g) => g.counted).reduce((t, g) => t + g.score, 0)), games: scored };
}

// An entry's week: null when it was saved after the lock (the server's clock; such entries never
// count), else its points and each pick's.
export function scoreEntry(entry, week, matches) {
  if (!entry.updatedAt || !Number.isFinite(+entry.updatedAt) || +entry.updatedAt / 1000 >= week.lock
    || !Array.isArray(entry.picks) || entry.picks.length !== SLOTS.length || new Set(entry.picks).size !== SLOTS.length
    || entry.picks.some((a) => !Number.isInteger(a) || a === entry.account || (week.eligible && !week.eligible.has(a)))) return null;
  if(entry.captain!=null&&(!Number.isInteger(entry.captain)||!entry.picks.includes(entry.captain)))return null;
  const games = weekGames(matches, week);
  const picks = entry.picks.map((account, i) => {
    const result=pickPoints(account,games),captain=account===entry.captain;
    return {account,pos:SLOTS[i],...result,captain,basePoints:result.points,points:round1(result.points*(captain?2:1))};
  });
  return { points: round1(picks.reduce((t, p) => t + p.points, 0)), picks };
}

// One week's standings: every entry that counts, best first. [{ account, name, points, picks }]
export function weekBoard(entries, week, matches) {
  return entries.filter((e) => e.week === week.key).flatMap((e) => {
    const s = scoreEntry(e, week, matches);
    return s ? [{ account: e.account, name: e.name, ...s }] : [];
  }).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
}

// The season standings: every entrant's points over the weeks already locked at `now`, best
// first. entries: [{ account, name, week, picks, updatedAt }] for this league.
export function leaderboard(entries, weeks, matches, now) {
  const byKey = new Map(weeks.map((w) => [w.key, w]));
  const rows = new Map();
  for (const e of entries) {
    const w = byKey.get(e.week);
    if (!w || w.lock > now) continue;
    const s = scoreEntry(e, w, matches);
    if (!s) continue;
    const r = rows.get(e.account) ?? rows.set(e.account, { account: e.account, name: e.name, points: 0, weeks: [] }).get(e.account);
    r.points = round1(r.points + s.points);
    r.weeks.push({ week: w.key, ...s });
    if (w.lock >= (byKey.get(r.lastWeek)?.lock ?? -Infinity)) { r.lastWeek = w.key; r.name = e.name; }
  }
  return [...rows.values()].map((r) => ({ ...r, weeks: r.weeks.sort((a, b) => b.week.localeCompare(a.week)) }))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
}
