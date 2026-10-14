// Steam players on no league roster. Their scout (rank, recent pubs, all-time heroes) is read
// from OpenDota in the visitor's own browser: OpenDota's keyless limit is per IP, which the
// Worker's shared Cloudflare IPs have used up. The Worker (workers/steam-auth/src/scout.js) keeps
// only their Steam name and avatar, registered by their own sign-in (parts/me.js), so the
// Gallery, Feed and search can name them.
import { steamIdToken } from "./store.js";
import { scoutReport } from "./scout-report.js";

export const SCOUT_API = "https://steam-auth.ad2lstats.workers.dev/scout";
const OPENDOTA = "https://api.opendota.com/api";

const openDota = async (path, init) => {
  try { const r = await fetch(OPENDOTA + path, init); return r.ok ? await r.json() : null; } catch { return null; }
};
// The report for a profile page, kept in this tab for an hour.
export async function scout(account, { refresh = false } = {}) {
  const key = `scout:${account}`;
  try { const c = JSON.parse(sessionStorage.getItem(key)); if (c && Date.now() - c.at < 3600e3) return c; } catch { /* not kept */ }
  const r = await scoutReport(account, openDota, { refresh });
  if (r) try { sessionStorage.setItem(key, JSON.stringify(r)); } catch { /* not kept */ }
  return r;
}

// Registers the signed-in account's Steam name and avatar with the Worker.
export async function registerMe(profile) {
  const token = await steamIdToken();
  if (!token || !profile?.name) return null;
  const r = await fetch(SCOUT_API, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name: profile.name, avatar: profile.avatar }) });
  return r.ok ? r.json() : null;
}

// Every registered player: Map account (string) -> { name, avatar }. Loaded once.
let players = null;
export function steamPlayers() {
  return players ??= fetch(`${SCOUT_API}/players`).then((r) => (r.ok ? r.json() : []))
    .then((rows) => new Map(rows.map((p) => [String(p.account), p])))
    .catch(() => { players = null; return new Map(); });
}

// Steam names for `accounts` the Worker doesn't know yet (they haven't signed in since), read
// from OpenDota and kept in this browser for a day. Map account -> name.
const NAMES_KEY = "steam-names";
export async function steamNames(accounts) {
  let kept = {};
  try { kept = JSON.parse(localStorage.getItem(NAMES_KEY)) ?? {}; } catch { /* storage blocked */ }
  const fresh = (a) => kept[a] && Date.now() - kept[a].at < 864e5;
  const missing = [...new Set(accounts.map(String))].filter((a) => /^\d+$/.test(a) && !fresh(a)).slice(0, 20);
  await Promise.all(missing.map(async (a) => { const p = await openDota(`/players/${a}`); if (p) kept[a] = { name: p.profile?.personaname ?? null, at: Date.now() }; }));
  if (missing.length) try { localStorage.setItem(NAMES_KEY, JSON.stringify(kept)); } catch { /* not kept */ }
  return new Map(accounts.map(String).filter((a) => kept[a]?.name).map((a) => [a, kept[a].name]));
}

// Steam names for players on no roster: the Worker's registered names first, OpenDota for the
// rest. Map account (string) -> name.
export async function strangerNames(accounts) {
  const known = await steamPlayers(), out = new Map();
  for (const a of accounts.map(String)) if (known.get(a)?.name) out.set(a, known.get(a).name);
  for (const [a, n] of await steamNames(accounts.map(String).filter((a) => !out.has(a)))) out.set(a, n);
  return out;
}
