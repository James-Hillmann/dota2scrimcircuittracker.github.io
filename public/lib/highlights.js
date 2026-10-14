// Achievements for a game a player highlights in a Feed post (parts/feed.js): multi-kills, their
// own bests across the season and the league's bests in a stat, worked out from the loaded games
// so a post can't claim what didn't happen. Runs in Node for the tests.

const kda = (p) => (p.kills + p.assists) / Math.max(p.deaths, 1);
// Stats compared for bests: label, value, how to show it.
export const BEST_STATS = [
  { id: 'kills', label: 'kills', value: (p) => p.kills, show: (v) => String(v) },
  { id: 'kda', label: 'KDA', value: kda, show: (v) => v.toFixed(1) },
  { id: 'gpm', label: 'GPM', value: (p) => p.gpm, show: (v) => String(v) },
  { id: 'damage', label: 'hero damage', value: (p) => p.hero_damage, show: (v) => `${(v / 1000).toFixed(1)}k` },
  { id: 'last_hits', label: 'last hits', value: (p) => p.last_hits, show: (v) => String(v) },
];
// A personal best needs this many of their own games to mean something.
const OWN_MIN_GAMES = 4;

const ok = (v) => typeof v === 'number' && Number.isFinite(v);
const sameAccount = (p, account) => String(p.account_id ?? p.player_key) === String(account);

// The player's line in one game, or null.
export const playerLine = (match, account) => match?.players?.find((p) => sameAccount(p, account)) ?? null;

// The games a player can highlight: theirs with a player line, newest first.
export function highlightableGames(matches, account) {
  return matches.filter((m) => playerLine(m, account)).sort((a, b) => (b.start_time ?? b.createdAt ?? 0) - (a.start_time ?? a.createdAt ?? 0));
}

// Badges for one player in one game: { id, label, tip, tier } with tier 'league' (best in the
// league), 'multi' (multi-kill) or 'own' (their own best). Ordered most impressive first.
export function gameAchievements(matches, match, account) {
  const p = playerLine(match, account);
  if (!p) return [];
  const out = [], multi = p.multi ?? [];
  if (multi[3] > 0) out.push({ id: 'rampage', label: multi[3] > 1 ? `${multi[3]}× Rampage` : 'Rampage', tip: 'Five kills in a row', tier: 'multi' });
  else if (multi[2] > 0) out.push({ id: 'ultra', label: 'Ultra kill', tip: 'Four kills in a row', tier: 'multi' });
  const everyone = matches.flatMap((m) => (m.players ?? []).map((q) => ({ m, q })));
  const mine = everyone.filter(({ q }) => sameAccount(q, account));
  for (const s of BEST_STATS) {
    const v = s.value(p);
    if (!ok(v) || v <= 0) continue;
    const top = Math.max(...everyone.map(({ q }) => s.value(q)).filter(ok));
    if (v >= top && everyone.length > 10) { out.push({ id: `league-${s.id}`, label: `League-best ${s.label}`, tip: `${s.show(v)} ${s.label}: the most by anyone this season`, tier: 'league' }); continue; }
    if (mine.length < OWN_MIN_GAMES) continue;
    const ownTop = Math.max(...mine.map(({ q }) => s.value(q)).filter(ok));
    if (v >= ownTop) out.push({ id: `own-${s.id}`, label: `Career-high ${s.label}`, tip: `${s.show(v)} ${s.label}: their best in ${mine.length} games`, tier: 'own' });
  }
  if (p.deaths === 0 && p.kills + p.assists >= 10) out.push({ id: 'deathless', label: 'Deathless', tip: `${p.kills}/0/${p.assists} without dying`, tier: 'own' });
  const rank = { league: 0, multi: 1, own: 2 };
  return out.sort((a, b) => rank[a.tier] - rank[b.tier]);
}
