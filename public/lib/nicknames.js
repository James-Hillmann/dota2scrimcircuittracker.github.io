// Names the site shows in place of a player's own, everywhere (a league joke): rosters, games,
// search, link previews. By account id. The names they go by in game are in aliases.js, so
// uploads and scrims under those names get this one too.
export const NICKNAMES = { 19192564: "[REDACTED]" };

const chosen = new Map(), loaded = new Set();
let ready = null;
const accountOf = p => p?.player_key ?? p?.key ?? p?.account_id ?? p?.account;
export const nicknameOf = id => NICKNAMES[id] ?? chosen.get(String(id)) ?? null;
export const playerNames = p => [...new Set([nicknameOf(accountOf(p)), p.name, p.inGameName].filter(Boolean))];
export const displayName = p => nicknameOf(accountOf(p)) ?? p.inGameName ?? p.name;
export function setPlayerNickname(id, name) {
  if ((chosen.get(String(id)) ?? null) === (name ?? null)) return;
  if (name) chosen.set(String(id), name); else chosen.delete(String(id));
  for (const d of loaded) applyNames(d);
  globalThis.dispatchEvent?.(new Event('player-names-change'));
}
// Shared by division pages and search, including signed-out visitors. Retry after an outage.
export function loadNicknames() {
  return ready ??= fetch('https://steam-auth.ad2lstats.workers.dev/cosmetics/appearances')
    .then(r => { if (!r.ok) throw new Error('Player names unavailable.'); return r.json(); })
    .then(data => { for (const [id, appearance] of Object.entries(data)) setPlayerNickname(id, appearance.nickname); })
    .catch(() => { ready = null; });
}
function applyNames(d) {
  const players = [...(d.teams ?? []).flatMap(t => t.players ?? []), ...(d.games ?? []).flatMap(g => g.players ?? [])];
  for (const p of players) {
    p.inGameName ??= p.name;
    // A name change must never change a name-based scrim player's identity or route.
    if (p.player_key == null && p.account_id == null && p.name) p.player_key = p.inGameName.trim().toLowerCase();
    p.name = displayName(p);
  }
  return d;
}

// A division data file with the nicknames in: roster players and players in games. In place.
export function withNicknames(d) {
  loaded.add(d);
  return applyNames(d);
}
