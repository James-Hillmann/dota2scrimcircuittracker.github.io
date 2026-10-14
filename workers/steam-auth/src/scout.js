// Scouting for Steam players who aren't on any league roster. Their sign-in asks for a scout; the
// Worker reads their public OpenDota history and keeps one report per account, which their player
// page shows (public/parts/scouted.js) in place of league stats.
//
//   POST /scout            (Bearer Firebase ID token) scouts the signed-in account; at most once
//                          per SCOUT_GAP, an earlier report is returned as it is.
//   GET  /scout/<account>  that account's report, or 404.
//
// The report uses the sync's formats (scripts/sync/ad2l-sync.js), so the site's pub and all-time
// sections read it unchanged: `pubs` flat groups of 7 (start time, hero name, won, K, D, A,
// ranked), `totals` { p, l } flat groups of 3 (hero id, games, wins).
import { heroById } from '../../../public/lib/hero-meta.js';

const OPENDOTA = 'https://api.opendota.com/api';
export const SCOUT_GAP = 6 * 3600e3;
export const SCOUT_PUB_DAYS = 30;
const json = (value, status = 200) => Response.json(value, { status });

// The report for `account`. od(path, init) returns parsed JSON, or null when OpenDota fails.
export async function scoutReport(account, od, now = Date.now()) {
  // Ask OpenDota to pull their newest games first; the report reads what it has right now.
  await od(`/players/${account}/refresh`, { method: 'POST' });
  const [player, matches, ...heroes] = await Promise.all([
    od(`/players/${account}`),
    od(`/players/${account}/matches?date=${SCOUT_PUB_DAYS}${['hero_id', 'kills', 'deaths', 'assists', 'start_time', 'lobby_type', 'player_slot', 'radiant_win', 'duration'].map((f) => `&project=${f}`).join('')}`),
    ...[0, 7, 1].map((lobby) => od(`/players/${account}/heroes?lobby_type=${lobby}`)),
  ]);
  const since = now / 1000 - SCOUT_PUB_DAYS * 86400, rows = Array.isArray(matches) ? matches : [];
  const pubs = rows.filter((r) => (r.lobby_type === 0 || r.lobby_type === 7) && r.start_time > since && r.duration >= 600)
    .sort((a, b) => b.start_time - a.start_time)
    .flatMap((r) => [r.start_time, heroById(r.hero_id)?.name ?? `hero ${r.hero_id}`, (r.player_slot < 128) === r.radiant_win ? 1 : 0, r.kills, r.deaths, r.assists, r.lobby_type === 7 ? 1 : 0]);
  const sum = (lists) => {
    const all = new Map();
    for (const r of lists.flat()) if (r?.games > 0) { const id = Number(r.hero_id), x = all.get(id) ?? [0, 0]; all.set(id, [x[0] + r.games, x[1] + r.win]); }
    return [...all].sort((a, b) => b[1][0] - a[1][0]).flatMap(([id, [g, w]]) => [id, g, w]);
  };
  const list = (x) => (Array.isArray(x) ? x : []);
  return {
    account: Number(account), at: now,
    name: player?.profile?.personaname ?? null, avatar: player?.profile?.avatarmedium ?? null,
    rank_tier: player?.rank_tier ?? null, leaderboard_rank: player?.leaderboard_rank ?? null,
    // OpenDota answered but shows nothing: a private match history (or a brand-new account).
    private: !!player && !rows.length && !heroes.some((h) => list(h).some((r) => r.games > 0)),
    pubs_days: SCOUT_PUB_DAYS, pubs,
    lobby_recent: rows.filter((r) => r.lobby_type === 1 && r.start_time > since).length,
    totals: { p: sum([list(heroes[0]), list(heroes[1])]), l: sum([list(heroes[2])]) },
  };
}

const openDota = async (path, init) => {
  try { const r = await fetch(OPENDOTA + path, init); return r.ok ? await r.json() : null; } catch { return null; }
};

// One store for every report (account -> report).
export class ScoutStore {
  constructor(ctx) { this.ctx = ctx; }
  async fetch(req) {
    const url = new URL(req.url), account = url.searchParams.get('account');
    if (req.method === 'GET') { const r = await this.ctx.storage.get(`scout:${account}`); return r ? json(r) : json({ error: 'Not scouted.' }, 404); }
    const old = await this.ctx.storage.get(`scout:${account}`);
    if (old && Date.now() - old.at < SCOUT_GAP) return json(old);
    const report = await scoutReport(account, openDota);
    await this.ctx.storage.put(`scout:${account}`, report);
    return json(report);
  }
}

// The Steam account behind a Firebase ID token, or null.
async function tokenAccount(token, env, referer) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Referer: referer }, body: JSON.stringify({ idToken: token }),
  });
  const user = (await r.json()).users?.[0];
  return r.ok && !user?.disabled ? /^steam:(\d{1,10})$/.exec(user?.localId ?? '')?.[1] ?? null : null;
}

export async function scoutRequest(req, env, allowedOrigins) {
  const origin = req.headers.get('origin'), url = new URL(req.url);
  if (origin && !allowedOrigins.includes(origin)) return json({ error: 'Unknown origin.' }, 403);
  const headers = { 'Access-Control-Allow-Origin': origin ?? allowedOrigins[0], Vary: 'Origin', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Cache-Control': 'no-store' };
  const respond = (r) => new Response(r.body, { status: r.status, headers: { ...Object.fromEntries(r.headers), ...headers } });
  if (req.method === 'OPTIONS') return respond(new Response(null, { status: 204 }));
  if (!env.SCOUT) return respond(json({ error: 'Scouting is not configured yet.' }, 503));
  const store = env.SCOUT.get(env.SCOUT.idFromName('scout-v1'));
  const wanted = /^\/scout\/(\d{1,10})$/.exec(url.pathname)?.[1];
  if (req.method === 'GET' && wanted) return respond(await store.fetch(`https://scout/?account=${wanted}`));
  if (req.method !== 'POST' || url.pathname !== '/scout') return respond(json({ error: 'Not found.' }, 404));
  const token = /^Bearer (.+)$/.exec(req.headers.get('authorization') ?? '')?.[1];
  if (!token) return respond(json({ error: 'Sign in with Steam first.' }, 401));
  try {
    const account = await tokenAccount(token, env, `${origin ?? allowedOrigins[0]}/`);
    if (!account) return respond(json({ error: 'Your Steam session expired. Sign in again.' }, 401));
    return respond(await store.fetch(new Request(`https://scout/?account=${account}`, { method: 'POST' })));
  } catch { return respond(json({ error: 'Scouting is temporarily unavailable.' }, 503)); }
}
