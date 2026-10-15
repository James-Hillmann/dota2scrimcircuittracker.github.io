// A scout report: a Steam player's public OpenDota history (lib/scout.js). No page code, so the
// tests run it in Node.
import { heroById } from "./hero-meta.js";

export const SCOUT_PUB_DAYS = 30;

// The report for `account` in the sync's formats (scripts/sync/ad2l-sync.js), so the site's pub
// and all-time sections read it unchanged: `pubs` flat groups of 7 (start time, hero name, won,
// K, D, A, ranked), `totals` { p, l } flat groups of 3 (hero id, games, wins). od(path, init)
// returns parsed JSON, or null when OpenDota fails. `refresh` asks OpenDota to pull their newest
// games first (their own page only).
export async function scoutReport(account, od, { now = Date.now(), refresh = false } = {}) {
  if (refresh) await od(`/players/${account}/refresh`, { method: "POST" });
  const [player, matches, ...heroes] = await Promise.all([
    od(`/players/${account}`),
    od(`/players/${account}/matches?date=${SCOUT_PUB_DAYS}${["hero_id", "kills", "deaths", "assists", "start_time", "lobby_type", "player_slot", "radiant_win", "duration"].map((f) => `&project=${f}`).join("")}`),
    ...[0, 7, 1].map((lobby) => od(`/players/${account}/heroes?lobby_type=${lobby}`)),
  ]);
  if (!player) return null; // OpenDota didn't answer: no report rather than an empty one
  const since = now / 1000 - SCOUT_PUB_DAYS * 86400, rows = Array.isArray(matches) ? matches : [];
  const list = (x) => (Array.isArray(x) ? x : []);
  const pubs = rows.filter((r) => (r.lobby_type === 0 || r.lobby_type === 7) && r.start_time > since && r.duration >= 600)
    .sort((a, b) => b.start_time - a.start_time)
    .flatMap((r) => [r.start_time, heroById(r.hero_id)?.name ?? `hero ${r.hero_id}`, (r.player_slot < 128) === r.radiant_win ? 1 : 0, r.kills, r.deaths, r.assists, r.lobby_type === 7 ? 1 : 0]);
  const sum = (lists) => {
    const all = new Map();
    for (const r of lists.flat()) if (r?.games > 0) { const id = Number(r.hero_id), x = all.get(id) ?? [0, 0]; all.set(id, [x[0] + r.games, x[1] + r.win]); }
    return [...all].sort((a, b) => b[1][0] - a[1][0]).flatMap(([id, [g, w]]) => [id, g, w]);
  };
  return {
    account: Number(account), at: now,
    name: player.profile?.personaname ?? null, avatar: player.profile?.avatarmedium ?? null,
    rank_tier: player.rank_tier ?? null, leaderboard_rank: player.leaderboard_rank ?? null,
    // OpenDota answered but shows nothing: a private match history (or a brand-new account).
    private: !rows.length && !heroes.some((h) => list(h).some((r) => r.games > 0)),
    pubs_days: SCOUT_PUB_DAYS, pubs,
    lobby_recent: rows.filter((r) => r.lobby_type === 1 && r.start_time > since).length,
    totals: { p: sum([list(heroes[0]), list(heroes[1])]), l: sum([list(heroes[2])]) },
  };
}
