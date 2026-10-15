// Steam players on no league roster. Their scout (rank, recent pubs, all-time heroes) is read
// from OpenDota in their own browser (OpenDota's keyless limit is per IP, which the Worker's
// shared Cloudflare IPs have used up) and saved on the Worker (workers/steam-auth/src/scout.js)
// with their Steam name and avatar, at most every SCOUT_GAP. Everyone else reads the saved copy.
import { steamIdToken } from "./store.js";
import { scoutReport } from "./scout-report.js";

export const SCOUT_API = "https://steam-auth.ad2lstats.workers.dev/scout";
const OPENDOTA = "https://api.opendota.com/api";

const openDota = async (path, init) => {
  try { const r = await fetch(OPENDOTA + path, init); return r.ok ? await r.json() : null; } catch { return null; }
};
// A report read in this browser and not saved (someone else's profile with none saved yet), kept
// in this tab for an hour.
export async function scout(account, { refresh = false } = {}) {
  const key = `scout:${account}`;
  try { const c = JSON.parse(sessionStorage.getItem(key)); if (c && Date.now() - c.at < 3600e3) return c; } catch { /* not kept */ }
  const r = await scoutReport(account, openDota, { refresh });
  if (r) try { sessionStorage.setItem(key, JSON.stringify(r)); } catch { /* not kept */ }
  return r;
}

export const SCOUT_GAP = 6 * 3600e3;
// The saved entry { account, name, avatar, at, report } for `account`, or null.
export async function savedScout(account) {
  const r = await fetch(`${SCOUT_API}/${encodeURIComponent(account)}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("Scouting is unavailable right now.");
  return r.json();
}
// The signed-in player (on no roster): re-scouts in this browser when the saved report is
// missing or over SCOUT_GAP old, and saves it with their Steam name. Returns the saved entry.
// The top bar and their own profile both ask on the same page load: one scout serves both.
const saving = new Map();
export function saveMyScout(account, profile = null) {
  if (!saving.has(String(account))) saving.set(String(account), saveScout(account, profile).finally(() => setTimeout(() => saving.delete(String(account)), 60e3)));
  return saving.get(String(account));
}
async function saveScout(account, profile) {
  const token = await steamIdToken();
  if (!token) return null;
  const saved = await savedScout(account).catch(() => null);
  const stale = !saved?.report || Date.now() - saved.report.at > SCOUT_GAP;
  const name = profile?.name ?? saved?.name ?? null;
  if (!stale && name === saved?.name) return saved;
  const report = stale ? await scoutReport(account, openDota, { refresh: true }) : null;
  const r = await fetch(SCOUT_API, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: name ?? report?.name, avatar: profile?.avatar ?? report?.avatar, ...(report && { report }) }) });
  return r.ok ? r.json() : saved;
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
