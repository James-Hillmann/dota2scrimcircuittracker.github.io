// Header search: every player and team in every league, each tagged with its league and
// (for players) the team they play for. Built from the same data the pages use, so every
// result opens a page that exists.
import { playerKey } from "./stats.js";
import { listTeams, teamSlug } from "./teams.js";

// Lowercase, accents and case folded, so "ravenscraft" finds "Ravenscraft 天才" and "e" finds "é".
export const fold = (s) => String(s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const junkName = (n) => !n || /^account \d+$|^anonymous$/i.test(n.trim());

// leagues: [{ key, label, root, data, views? }] — an AD2L division, its routes root ("#/warrior")
// and its data file. `views` (Heroic/Aegis: ["a", "b"]) sends each team to its own division's
// pages. scrims: { label, matches } — the saved scrims (private ones carry no players).
export function buildSearchIndex(leagues, scrims = null) {
  const out = [];
  for (const lg of leagues) {
    const { key, label, root, data } = lg;
    const teamRoot = (t) => (lg.views && t?.division ? `${root}/${t.division.toLowerCase()}` : root);
    const teamLabel = (t) => (lg.views && t?.division ? `${label} · Div ${t.division}` : label);
    const byId = new Map(data.teams.map((t) => [t.id, t]));
    for (const t of data.teams) {
      out.push({ kind: "team", name: t.name, league: key, leagueLabel: teamLabel(t), href: `${teamRoot(t)}/teams/${t.id}`,
        players: t.players.map((p) => p.name), terms: [t.name] });
    }
    // Rostered players, then everyone else seen in the division's games (stand-ins).
    const players = new Map();
    for (const t of data.teams) for (const p of t.players) {
      if (p.account_id == null) continue;
      const k = String(p.account_id);
      if (players.has(k)) continue; // on two rosters: first one wins
      players.set(k, { kind: "player", name: p.name, league: key, leagueLabel: teamLabel(t), team: t.name, teamHref: `${teamRoot(t)}/teams/${t.id}`,
        captain: !!p.captain, standin: false, href: `${teamRoot(t)}/player/${encodeURIComponent(k)}`, terms: [p.name] });
    }
    // Newest game first, so a stand-in shows the team they last played for.
    for (const g of [...data.games].sort((a, b) => (b.start_time ?? 0) - (a.start_time ?? 0))) {
      for (const p of g.players ?? []) {
        if (junkName(p.name)) continue;
        const k = playerKey(p), e = players.get(k);
        if (e) { if (!e.terms.includes(p.name)) e.terms.push(p.name); continue; } // in-game name differs from PlayOn's
        const t = byId.get(p.team === "a" ? g.team_a_id : g.team_b_id);
        const team = t?.name ?? p.team_name ?? (p.team === "a" ? g.team_a : g.team_b);
        players.set(k, { kind: "player", name: p.name, league: key, leagueLabel: teamLabel(t), team, teamHref: t ? `${teamRoot(t)}/teams/${t.id}` : null,
          captain: false, standin: true, href: `${teamRoot(t)}/player/${encodeURIComponent(k)}`, terms: [p.name] });
      }
    }
    out.push(...players.values());
  }
  if (scrims) {
    const matches = scrims.matches;
    // Scrim teams list the players seen in their scrims (most games first).
    const seen = new Map();
    for (const m of matches) for (const p of m.players ?? []) {
      const team = p.team_name ?? (p.team === "a" ? m.team_a : m.team_b);
      if (!team || junkName(p.name)) continue;
      const counts = seen.get(teamSlug(team)) ?? seen.set(teamSlug(team), new Map()).get(teamSlug(team));
      counts.set(p.name, (counts.get(p.name) ?? 0) + 1);
    }
    for (const t of listTeams(matches)) {
      const names = [...(seen.get(t.slug) ?? [])].sort((a, b) => b[1] - a[1]).map(([n]) => n);
      out.push({ kind: "team", name: t.name, league: "scrim", leagueLabel: scrims.label, href: `#/scrims/teams/${t.slug}`, players: names, terms: [t.name] });
    }
    const players = new Map();
    for (const m of [...matches].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))) {
      for (const p of m.players ?? []) {
        if (junkName(p.name)) continue;
        const k = playerKey(p), e = players.get(k);
        if (e) { if (!e.terms.includes(p.name)) e.terms.push(p.name); continue; }
        const team = p.team_name ?? (p.team === "a" ? m.team_a : m.team_b);
        players.set(k, { kind: "player", name: p.name, league: "scrim", leagueLabel: scrims.label, team, teamHref: team ? `#/scrims/teams/${teamSlug(team)}` : null,
          captain: false, standin: !!p.standin, href: `#/scrims/player/${encodeURIComponent(k)}`, terms: [p.name] });
      }
    }
    out.push(...players.values());
  }
  for (const e of out) e.folded = e.terms.map(fold);
  return out;
}

// How well a query matches one name: 0 exact, 1 starts with it, 2 a word starts with it,
// 3 anywhere in it; null for no match.
function closeness(name, q) {
  if (name === q) return 0;
  if (name.startsWith(q)) return 1;
  const i = name.indexOf(q);
  if (i < 0) return null;
  return /[\s\-_.·|[\](){}]/.test(name[i - 1]) ? 2 : 3;
}

// Best matches first: closest name, then rostered players before stand-ins, then shorter
// names, then the order leagues were given in.
export function searchIndex(index, query, limit = 12) {
  const q = fold(query);
  if (!q) return [];
  const hits = [];
  index.forEach((e, i) => {
    let best = null, via = null;
    e.folded.forEach((n, j) => {
      const c = closeness(n, q);
      if (c != null && (best == null || c < best)) { best = c; via = j; }
    });
    if (best != null) hits.push({ e, best, alias: via > 0 ? e.terms[via] : null, i });
  });
  hits.sort((a, b) => a.best - b.best || (a.e.standin - b.e.standin) || a.e.name.length - b.e.name.length || a.i - b.i);
  return hits.slice(0, limit).map(({ e, alias }) => ({ ...e, alias }));
}
