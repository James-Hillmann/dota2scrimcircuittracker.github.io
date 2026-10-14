// Scout reports for Steam players on no league roster (workers/steam-auth/src/scout.js): their
// public OpenDota history, kept by the Worker. Their sign-in asks for one (parts/me.js); their
// player page shows it (parts/scouted.js).
import { steamIdToken } from "./store.js";

export const SCOUT_API = "https://steam-auth.ad2lstats.workers.dev/scout";

// The report for `account`, or null when they haven't been scouted.
export async function scoutReport(account) {
  const r = await fetch(`${SCOUT_API}/${encodeURIComponent(account)}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("Scouting is unavailable right now.");
  return r.json();
}

// Scouts the signed-in account (the Worker does it at most every few hours) and returns its report.
export async function scoutMe() {
  const token = await steamIdToken();
  if (!token) return null;
  const r = await fetch(SCOUT_API, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error ?? "Scouting is unavailable right now.");
  return data;
}
