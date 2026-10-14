// Steam players on no league roster: the Worker keeps each one's Steam name and avatar so the
// Gallery, Feed and search can name them and link their profile. The scout itself (their OpenDota
// history) runs in the visitor's browser (public/lib/scout.js): OpenDota's keyless limit is per
// IP, and Cloudflare's shared IPs have used it up.
//
//   POST /scout            (Bearer Firebase ID token) { name, avatar }: registers the signed-in
//                          account (their own browser read the name from OpenDota).
//   GET  /scout/players    every registered player: [{ account, name, avatar, at }].
//   GET  /scout/<account>  one player, or 404.

const json = (value, status = 200) => Response.json(value, { status });
export const MAX_NAME = 64;
const cleanName = (v) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_NAME) || null : null);
const cleanAvatar = (v) => (typeof v === 'string' && /^https:\/\/avatars\.steamstatic\.com\/[\w.]+$/.test(v) ? v : null);

// The stored entry for a registration (old fields kept when the new ones are missing).
export function playerEntry(account, body, old = null, now = Date.now()) {
  return { account: Number(account), name: cleanName(body?.name) ?? old?.name ?? null, avatar: cleanAvatar(body?.avatar) ?? old?.avatar ?? null, at: now };
}

export class ScoutStore {
  constructor(ctx) { this.ctx = ctx; }
  async fetch(req) {
    const url = new URL(req.url), account = url.searchParams.get('account');
    if (url.pathname === '/players') {
      const rows = [...(await this.ctx.storage.list({ prefix: 'scout:', limit: 5000 })).values()];
      return json(rows.filter((r) => r.name).map(({ account, name, avatar, at }) => ({ account, name, avatar, at })));
    }
    if (req.method === 'GET') { const r = await this.ctx.storage.get(`scout:${account}`); return r ? json(r) : json({ error: 'Not registered.' }, 404); }
    const entry = playerEntry(account, await req.json().catch(() => ({})), await this.ctx.storage.get(`scout:${account}`));
    await this.ctx.storage.put(`scout:${account}`, entry);
    return json(entry);
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
  if (req.method === 'GET' && url.pathname === '/scout/players') return respond(await store.fetch('https://scout/players'));
  const wanted = /^\/scout\/(\d{1,10})$/.exec(url.pathname)?.[1];
  if (req.method === 'GET' && wanted) return respond(await store.fetch(`https://scout/?account=${wanted}`));
  if (req.method !== 'POST' || url.pathname !== '/scout') return respond(json({ error: 'Not found.' }, 404));
  const token = /^Bearer (.+)$/.exec(req.headers.get('authorization') ?? '')?.[1];
  if (!token) return respond(json({ error: 'Sign in with Steam first.' }, 401));
  const body = await req.text();
  if (body.length > 2000) return respond(json({ error: 'Request too large.' }, 413));
  try {
    const account = await tokenAccount(token, env, `${origin ?? allowedOrigins[0]}/`);
    if (!account) return respond(json({ error: 'Your Steam session expired. Sign in again.' }, 401));
    return respond(await store.fetch(new Request(`https://scout/?account=${account}`, { method: 'POST', body })));
  } catch { return respond(json({ error: 'Scouting is temporarily unavailable.' }, 503)); }
}
