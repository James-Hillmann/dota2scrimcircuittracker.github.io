// Fantasy league, one per AD2L division. Each week you pick five of that league's rostered
// players, one per position (slot 1–5), from teams with a series that week; picks lock at the
// week's first series start. A pick scores the playoff tier model's game score with every game
// read as the slot's position (whatever they played), and only their best two games of the week
// count (a Bo3: the best two of three). You can't pick yourself; your teammates are fine. The
// leaderboard is the season so far, from the first week anyone entered.
//
// Pure functions over the league's data file (`teams`, `series`) and its games, so they run in the
// Node tests. Entries come from lib/store.js (listFantasy); sign-in from workers/steam-auth.
import { tierModels, gameScoreAt, NEXT } from "./tiers.js";

export const SLOTS = [1, 2, 3, 4, 5];
export const GAMES_COUNTED = 2;

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
export const weekGames = (matches, week) => matches.filter((m) => week.seriesIds.has(m.series_id)
  || (m.start_time && weekKey(m.start_time) === week.key && week.teams.has(m.team_a_id) && week.teams.has(m.team_b_id)));

// The playoff-model position models for a league's games, made once per game list.
const modelMemo = new WeakMap();
export const fantasyModels = (matches) => modelMemo.get(matches) ?? modelMemo.set(matches, tierModels(matches, { version: NEXT })).get(matches);

const round1 = (x) => Math.round(x * 10) / 10;

// One pick's week: each game it played scored as `pos`, and the best GAMES_COUNTED added up.
// { points, games: [{ id, score, counted }] } (games newest last).
export function pickPoints(account, pos, games, matches, models) {
  const scored = games.map((m) => ({ id: m.id, time: m.start_time ?? 0, score: gameScoreAt(m, matches, account, pos, models) }))
    .filter((g) => g.score != null).sort((a, b) => a.time - b.time);
  const best = new Set([...scored].sort((a, b) => b.score - a.score).slice(0, GAMES_COUNTED).map((g) => g.id));
  for (const g of scored) { g.counted = best.has(g.id); g.score = round1(g.score); }
  return { points: round1(scored.filter((g) => g.counted).reduce((t, g) => t + g.score, 0)), games: scored };
}

// An entry's week: null when it was saved after the lock (the server's clock; such entries never
// count), else its points and each pick's.
export function scoreEntry(entry, week, matches, models) {
  if (!entry.updatedAt || +entry.updatedAt / 1000 >= week.lock) return null;
  const games = weekGames(matches, week);
  const picks = entry.picks.map((account, i) => ({ account, pos: SLOTS[i], ...pickPoints(account, SLOTS[i], games, matches, models) }));
  return { points: round1(picks.reduce((t, p) => t + p.points, 0)), picks };
}

// The season standings: every entrant's points over the weeks already locked at `now`, best
// first. entries: [{ account, name, week, picks, updatedAt }] for this league.
export function leaderboard(entries, weeks, matches, now, models = fantasyModels(matches)) {
  const byKey = new Map(weeks.map((w) => [w.key, w]));
  const rows = new Map();
  for (const e of entries) {
    const w = byKey.get(e.week);
    if (!w || w.lock > now) continue;
    const s = scoreEntry(e, w, matches, models);
    if (!s) continue;
    const r = rows.get(e.account) ?? rows.set(e.account, { account: e.account, name: e.name, points: 0, weeks: [] }).get(e.account);
    r.points = round1(r.points + s.points);
    r.weeks.push({ week: w.key, ...s });
    if (w.lock >= (byKey.get(r.lastWeek)?.lock ?? -Infinity)) { r.lastWeek = w.key; r.name = e.name; }
  }
  return [...rows.values()].map((r) => ({ ...r, weeks: r.weeks.sort((a, b) => b.week.localeCompare(a.week)) }))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
}
