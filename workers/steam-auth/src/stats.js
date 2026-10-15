// Visit counts for Fav's /stats page, read from GoatCounter's API. The API key can't sit in the
// browser, so the page asks here and only the admin account gets numbers back.
//
//   GET /stats?start=<ISO>&end=<ISO>  (Bearer Firebase ID token, admin only)
//     → { total, events, paths: [{ path, title, event, count, max, stats: [{ day, hourly }] }] }
//
// Secret GOATCOUNTER_TOKEN: a GoatCounter API key with "Read statistics" permission
// (`npx wrangler secret put GOATCOUNTER_TOKEN`). The site code is the one the site counts with.

import { SITE_CODE } from '../../../public/lib/visits.js';
import { isAdmin } from '../../../public/lib/pack-gifts.js';
import { tokenAccount } from './scout.js';

const json = (value, status = 200) => Response.json(value, { status });
export const MAX_DAYS = 92, MAX_PAGES = 10;
const HOUR = 3600e3;

// The asked range rounded to whole hours (GoatCounter wants that), or null if it isn't sensible.
export function statsRange(start, end, now = Date.now()) {
  const e = end ? Date.parse(end) : now, s = start ? Date.parse(start) : e - 7 * 24 * HOUR;
  if (!Number.isFinite(s) || !Number.isFinite(e) || s >= e || e - s > MAX_DAYS * 24 * HOUR) return null;
  const iso = (t) => new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');
  return { start: iso(Math.floor(s / HOUR) * HOUR), end: iso(Math.ceil(e / HOUR) * HOUR) };
}

// Every path in the range: GoatCounter gives at most 100 a call, then more with exclude_paths.
// GoatCounter sometimes fails a call it answers fine a moment later, so each call gets TRIES goes.
export const TRIES = 3;
export async function goatStats(range, { site = SITE_CODE, key, get = fetch, wait = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const base = `https://${site}.goatcounter.com/api/v0`;
  const once = async (path, params) => {
    const r = await get(`${base}${path}?${params}`, { headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } });
    if (!r.ok) throw new Error(`GoatCounter ${r.status} on ${path}: ${(await r.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300)}`);
    return r.json();
  };
  const call = async (path, params) => {
    for (let i = 1; ; i++) {
      try { return await once(path, params); }
      catch (e) { if (i >= TRIES) throw e; await wait(400 * i); }
    }
  };
  const totals = await call('/stats/total', new URLSearchParams(range));
  const paths = [], seen = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const q = new URLSearchParams({ ...range, limit: '100' });
    for (const id of seen) q.append('exclude_paths', String(id));
    const r = await call('/stats/hits', q);
    for (const h of r.hits ?? []) {
      seen.push(h.path_id);
      paths.push({ path: h.path, title: h.title ?? '', event: !!h.event, count: h.count ?? 0, max: h.max ?? 0,
        stats: (h.stats ?? []).map(({ day, hourly }) => ({ day, hourly: hourly ?? [] })) });
    }
    if (!r.more || !r.hits?.length) break;
  }
  return { total: totals.total ?? 0, events: totals.total_events ?? 0,
    stats: (totals.stats ?? []).map(({ day, hourly }) => ({ day, hourly: hourly ?? [] })), paths };
}

export async function statsRequest(req, env, allowedOrigins) {
  const origin = req.headers.get('origin'), url = new URL(req.url);
  if (origin && !allowedOrigins.includes(origin)) return json({ error: 'Unknown origin.' }, 403);
  const headers = { 'Access-Control-Allow-Origin': origin ?? allowedOrigins[0], Vary: 'Origin', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization', 'Cache-Control': 'no-store' };
  const respond = (r) => new Response(r.body, { status: r.status, headers: { ...Object.fromEntries(r.headers), ...headers } });
  if (req.method === 'OPTIONS') return respond(new Response(null, { status: 204 }));
  if (req.method !== 'GET' || url.pathname !== '/stats') return respond(json({ error: 'Not found.' }, 404));
  const token = /^Bearer (.+)$/.exec(req.headers.get('authorization') ?? '')?.[1];
  if (!token) return respond(json({ error: 'Sign in with Steam first.' }, 401));
  const range = statsRange(url.searchParams.get('start'), url.searchParams.get('end'));
  if (!range) return respond(json({ error: `Pick a range of at most ${MAX_DAYS} days.` }, 400));
  let account;
  try { account = await tokenAccount(token, env, `${origin ?? allowedOrigins[0]}/`); }
  catch { return respond(json({ error: 'Sign-in check is temporarily unavailable.' }, 503)); }
  if (!account) return respond(json({ error: 'Your Steam session expired. Sign in again.' }, 401));
  if (!isAdmin(account)) return respond(json({ error: 'Only Fav can see visit counts.' }, 403));
  if (!env.GOATCOUNTER_TOKEN) return respond(json({ error: 'GOATCOUNTER_TOKEN is not set on the Worker.' }, 503));
  try { return respond(json({ range, ...(await goatStats(range, { key: env.GOATCOUNTER_TOKEN })) })); }
  catch (e) { return respond(json({ error: `Couldn't read GoatCounter: ${e.message}` }, 502)); }
}
