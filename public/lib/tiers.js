// In-season player tier list, from game stats alone.
//
//   score = stat points × survival × consistency × opponent strength × winning
//
//   role      Position 1–5 from the parsed replay (OpenDota's estimate); 1–3 are cores,
//             4–5 supports. Games without one (screenshot uploads, scrims) fall back to net
//             worth rank within the team. Each game is scored in the role played in it; a
//             player's listed role is the one they played most.
//   stat z    Each game, every stat is a z-score against the same position (a pos 3 is compared
//             with pos 3s), capped at ±Z_CAP, flipped for stats where less is better. GPM, XPM and
//             net worth are compared with what that position gets in a game that long (a
//             straight-line fit on game length), since they climb as games go on.
//   stat 0–100  A player's average z for each stat in a role, padded with K_SHRINK games at the
//             position average (so 3 lucky games don't read as a season). Then each stat is put on
//             its own 0–100 per role: 100 = the best such average of any player with MIN_GAMES+
//             games in that role, 0 = the worst (but no closer to average than the best is).
//             Capped to 0–100.
//   stat points  Each stat is worth a fixed number of points (WEIGHTS, 100 per role) and earns
//             its 0–100 as a percentage of them. No base or offset.
//   survival  Deaths, time dead and hero damage taken per life, each on its own 0–100 the same
//             way, weighted (SURVIVAL) into one 0–100 -> × 0.85 to × 1.00 on the stat points.
//   consistency  The spread (sd) of a player's series stat points, pulled toward the pool's
//             typical spread by K_CONSISTENCY series; the steadiest player sets 100, the
//             streakiest 0 -> × 0.90 to × 1.00.
//   opponents Each game's opponent: their game win % outside games against this player's team,
//             shrunk toward 50% by K_PRIOR even games. 25% -> × 0.90, 50% -> × 1.00,
//             75% -> × 1.10. Each series takes its games' average, and the season multiplier
//             weights series by their stat points, so the per-series scores average to the score.
//   winning   Win rate shrunk toward 50% by K_PRIOR even games, 25% -> 0, 75% -> 100; win speed:
//             each win scores the share of the pool's wins that took longer, shrunk toward 50
//             by K_SPEED wins. Two parts win rate to one part speed -> × 0.70 to × 1.30.
//   rating    The score through a normal curve fitted to the pool: the median player rates 50,
//             and the spread is RATING_STRETCH × the pool's standard deviation. Tiers by fixed
//             rating cutoffs.
//
// Farm, damage, building damage, kills and assists are shares of the team's total, which
// don't grow with game length the way per-minute numbers do.
//
// The constants named above (K_*, WEIGHTS, SURVIVAL, ranges) are per version: see VERSIONS.
//
// The reference (per-position means, anchors, win lengths, consistency spread, curve) comes
// from the league itself: each AD2L division, or the scrim ledger, is scored against its own
// games (tierModel on them; the Heroic A/B views pass the whole division's model). Ratings
// compare players within a league, not across leagues.

import { tierLaneResult } from "./lanes.js";

export const MIN_GAMES = 3;
const Z_CAP = 2.5;

// Scoring versions: every number that tunes the scoring. LIVE is the one the whole site uses.
// The tier list keeps every version available for comparison, with LIVE selected by default.
// A model carries its version (`model.v`).
const PRE = {
  label: "Pre-playoff",
  // metric -> the points it's worth, out of 100 stat points per role (core/support) or per
  // position (1–5: see weightsOf). Negative = lower is
  // better. A player missing a stat (screenshot uploads have no wards) has the rest scaled up
  // to fill its points. See METRICS for definitions.
  weights: {
    // No lanewin for cores: laning already covers their lane.
    core: { dmg: 16, farm: 15, kills: 15, gpm: 14, nw: 10, xpm: 8, assists: 8, tower: 5, lane: 5, stuns: 4 },
    support: { vision: 16, dewards: 13, assists: 13, stuns: 8, kills: 8, lanewin: 7, heal: 7, stacks: 7, smokes: 5, dmg: 3, gpm: 3, dust: 2, sentries: 2, farm: 2, nw: 2, tower: 2 },
  },
  // Survival: its three parts' share of the survival score. Negative = lower is better.
  survival: { deaths: -40, dead: -35, tanked: 25 },
  // Multiplier ranges: [at 0, at 100] (opponents: [at 25%, at 75%] opponent win rate).
  mult: { survival: [0.85, 1.0], consistency: [0.9, 1.0], opponents: [0.9, 1.1], winning: [0.7, 1.3] },
  win_parts: { win: 2, speed: 1 }, // winning = (2 × win rate + 1 × win speed) / 3
  // Stats where 100 is reached before the league's best: a few supports stack far more than
  // everyone else, so 100 stacks sits 70% of the way from the worst to the best.
  ease: { support: { stacks: 0.7 } },
  k_prior: 6, k_speed: 3, k_consistency: 2, k_shrink: 3,
  stretch: 1.5,
};
// A version that differs from `base` only in the fields given (each replaces that field whole).
const tweak = (base, changes) => ({ ...structuredClone(base), ...changes });
export const VERSIONS = {
  pre: PRE,
  playoff: tweak(PRE, {
    label: "Playoff",
    // Consistency rewards as well as costs, and counts 1.5× as much (a 0.15 spread, was 0.10):
    // the steadiest player gains 7.5%, the streakiest loses 7.5%.
    mult: { ...PRE.mult, consistency: [0.925, 1.075] },
    // Consistency as how often a player is near the top, not how much they swing against
    // themselves (100s and an 80 read as streaky, though an 80 is still great): the share of
    // their series in the top `consistency_top` (two quintiles) of every series at the position
    // in the league.
    consistency_top: 0.4,
    // Winning as flat points, [at 0, at 100], added after the multipliers: the same for every
    // player, not a share of their stat points. As a multiplier, strong players on winning teams
    // got +20 or more from it (Heroic) and weak ones on losing teams lost as much.
    winning_flat: [-15, 15],
    // Opponent strength from a team rating (teamRatings), refitted without the series being
    // scored, not from the opponent's raw win %: a strong team with a hard schedule can sit at
    // 50%. The division's strongest team is the top of mult.opponents, its weakest the bottom.
    opponents_by: "rating",
    // Initiators (pos 3 and 4) absorb pressure and die doing it: survival costs them at most 10%,
    // and damage taken per life weighs most in it.
    survival_pos: {
      3: { weights: { deaths: -35, dead: -25, tanked: 40 }, range: [0.9, 1.0] },
      4: { weights: { deaths: -35, dead: -25, tanked: 40 }, range: [0.9, 1.0] },
    },
    // Points per position, not per role. GPM, net worth and XPM moved almost together
    // (0.83–0.94 across cores), so net worth and farm share are gone; GPM and XPM stay. Damage
    // taken share is new, mostly for offlaners. Healing is down to 3: few heroes heal.
    // New vision and ward uptime are one stat, Vision % (their points added together): new
    // vision already counted only the time a ward was alive, and now ground a standing tower
    // sees earns nothing either.
    weights: {
      1: { gpm: 20, dmg: 20, xpm: 14, kills: 14, lane: 10, tower: 8, assists: 6, soak: 5, stuns: 3 },
      2: { dmg: 18, xpm: 16, kills: 16, gpm: 14, lane: 10, assists: 10, stuns: 8, soak: 5, tower: 3 },
      3: { dmg: 15, gpm: 13, soak: 12, xpm: 12, stuns: 12, assists: 11, kills: 11, lane: 8, tower: 6 },
      4: { assists: 18, stuns: 12, vispct: 11, dewards: 10, kills: 8, smokes: 8, lanewin: 7, gpm: 7, stacks: 6, dmg: 4, xpm: 3, heal: 3, dust: 2, sentries: 1 },
      5: { vispct: 22, dewards: 15, assists: 13, lanewin: 9, stacks: 9, gpm: 7, stuns: 6, kills: 5, smokes: 4, xpm: 3, heal: 3, sentries: 2, dust: 2 },
    },
    // Stat podium: impressive raw numbers, cores and supports apart. In each of a role's podium
    // stats (PODIUM_STATS), the best three season averages a game among players whose main
    // position is in that role (cores 1-3, supports 4-5; minGames+) get these points added to
    // their score, before the rating curve. No shares or percentages.
    podium: {
      points: [1.25, 1, 0.75],
      stats: {
        core: ["damage", "gpm", "net_worth", "kills", "lh10", "xpm", "stuns", "taken", "assists"],
        support: ["assists", "stuns", "kills", "wards_killed", "ward_life", "damage", "stacks", "healing", "obs"],
      },
    },
  }),
};
export const LIVE = "playoff";

// A version's survival parts and range for a position: its own (survival_pos) or everyone's.
export const survivalOf = (v, pos) => v.survival_pos?.[pos]?.weights ?? v.survival;
export const survivalRange = (v, pos) => v.survival_pos?.[pos]?.range ?? v.mult.survival;
// A version's points for a position: its own table when the version has one per position,
// else its role's.
export const perPosition = (v) => v.weights[1] != null;
export const weightsOf = (v, pos) => (perPosition(v) ? v.weights[pos] : v.weights[pos <= 3 ? "core" : "support"]);

// The live version's numbers, for everything outside the tier list's Model tab.
const L = VERSIONS[LIVE];
export const { weights: WEIGHTS, survival: SURVIVAL, mult: MULT, ease: EASE, k_prior: K_PRIOR, k_speed: K_SPEED, k_consistency: K_CONSISTENCY, k_shrink: K_SHRINK, stretch: RATING_STRETCH } = L;

// Podium stats: raw numbers from one game (get(player, game); null = not in that game's data),
// averaged a game.
export const PODIUM_STATS = {
  damage: { label: "Hero damage", get: (p) => p.hero_damage },
  gpm: { label: "GPM", get: (p) => p.gpm },
  xpm: { label: "XPM", get: (p) => p.xpm },
  net_worth: { label: "Net worth", get: (p) => p.net_worth },
  kills: { label: "Kills", get: (p) => p.kills },
  lh10: { label: "Last hits at 10", get: (p) => p.lh10 ?? null },
  taken: { label: "Damage taken", get: (p) => p.dmg_taken ?? null },
  stuns: { label: "Stun seconds", get: (p) => p.stuns ?? null },
  assists: { label: "Assists", get: (p) => p.assists },
  wards_killed: { label: "Dewards", get: (p) => (p.obs_placed != null ? (p.obs_killed ?? 0) + (p.sen_killed ?? 0) : null) },
  // Seconds the player's observers stayed up, on average (one killed early pulls it down).
  // A ward still up at the end counts the time it had (its 6 minutes at most).
  ward_life: { label: "Average ward uptime", get: (p, m) => {
    const o = p.obs_pos;
    if (!o || o.length < 5) return null;
    let t = 0, n = 0;
    for (let i = 0; i + 4 < o.length; i += 5) { t += o[i + 3] >= 0 ? o[i + 3] : Math.min(360, Math.max(0, m.duration_sec - Math.max(0, o[i + 2]))); n++; }
    return t / n;
  },
  // Only players placing 5+ observers a game on average: a ward or two kept safe isn't a feat.
  qualify: (rows) => { const xs = rows.map((r) => r.p.obs_placed).filter((x) => x != null); return xs.length > 0 && mean(xs) >= 5; } },
  stacks: { label: "Stacks", get: (p) => p.camps_stacked ?? null },
  obs: { label: "Observers placed", get: (p) => p.obs_placed ?? null },
  healing: { label: "Healing", get: (p) => p.hero_healing ?? null },
};

// metric -> short label and definition (the info bubbles and "How it's scored" use these).
export const METRICS = {
  farm: { label: "Farm share", def: "The player's share of the team's gold (their GPM over the team's total)." },
  gpm: { label: "GPM", def: "Gold per minute, against what the same position gets in a game that long." },
  nw: { label: "Net worth", def: "Net worth at the end of the game, against what the same position has in a game that long." },
  dmg: { label: "Damage share", def: "Share of the team's hero damage." },
  tower: { label: "Building share", def: "Share of the team's damage to towers, barracks and the Ancient." },
  soak: { label: "Damage taken share", def: "Share of the hero damage the team took that the player took: who stood in front." },
  xpm: { label: "XPM", def: "Experience per minute, against what the same position gets in a game that long." },
  kills: { label: "Kill share", def: "Share of the team's kills the player got the last hit on." },
  assists: { label: "Assist share", def: "Share of the team's kills the player assisted. Kill share + assist share = kill participation." },
  lanewin: { label: "Lane result", def: "Supports only. Gold + XP lead at 10 minutes of their whole lane over the enemy's. Junglers have none." },
  lane: { label: "Laning", def: "Gold earned in the first 10 minutes as a % of the most a lane can give." },
  stuns: { label: "Stun time", def: "Seconds of disable on enemy heroes per minute." },
  vision: { label: "New vision", def: "Share of the map outside their base that their observer wards lit up first on the team, averaged over the game. Trees and cliffs block wards; ground a teammate already showed doesn't count. Older games have no number." },
  vispct: { label: "Vision %", def: "Share of the map outside their base that their observer wards lit and nothing else on the team already showed, averaged over the game: ground a teammate's ward or a standing tower already sees doesn't count, and a ward only counts while it's alive. Accounts for day and night: tower sight shrinks at night, so a ward near a tower is worth more then. A fallen tower sees nothing, so a ward is worth more once the towers near it are down. Older games have no number." },
  uptime: { label: "Ward uptime", def: "Seconds of observer vision a minute: every observer's time alive, so one the enemy kills early counts only the time it lived. Sentries count half." },
  dewards: { label: "Dewards", def: "Enemy wards killed per 10 minutes; a sentry counts half an observer." },
  sentries: { label: "Sentries", def: "Sentry wards placed per 10 minutes." },
  dust: { label: "Dust", def: "Dust of Appearance used per 10 minutes." },
  smokes: { label: "Smokes", def: "Smokes of Deceit used per 10 minutes." },
  stacks: { label: "Stacks", def: "Neutral camps stacked per game, against what the position stacks in a game that long." },
  heal: { label: "Healing", def: "Healing done to allied heroes per minute." },
  deaths: { label: "Deaths", def: "Deaths per 10 minutes. Fewer is better." },
  dead: { label: "Time dead", def: "Share of the game spent dead. Lower is better." },
  tanked: { label: "Damage per life", def: "Hero damage taken per death (damage taken ÷ (deaths + 1)). Higher is better." },
};

// Stats compared with the position's line fit on game length instead of a flat average.
const LENGTH_FIT = new Set(["gpm", "xpm", "nw", "stacks"]);

// Fixed rating cutoffs, same for cores and supports (both are scored against their own role).
// With the curve fitted to the AD2L pool these split it about 8/20/32/26/14%.
export const TIERS = [
  { tier: "S", min: 85 },
  { tier: "A", min: 65 },
  { tier: "B", min: 45 },
  { tier: "C", min: 30 },
  { tier: "D", min: -Infinity },
];

const keyOf = (p) => p.player_key ?? p.name.trim().toLowerCase();
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const mean = (xs) => xs.reduce((s, v) => s + v, 0) / xs.length;
const sdOf = (xs, mu = mean(xs)) => Math.sqrt(mean(xs.map((v) => (v - mu) ** 2)));
const share = (v, total) => (v != null && total ? v / total : null);
const lerp = ([a, b], t) => a + (b - a) * clamp(t, 0, 1);
const teamKey = (name) => String(name ?? "").trim().toLowerCase();

// Standard normal CDF (Abramowitz–Stegun 7.1.26 erf, error < 1.5e-7).
function phi(z) {
  const x = Math.abs(z) / Math.SQRT2, t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}
const DEFAULT_CURVE = [50, 17];
export const ratingOf = (score, [center, spread] = DEFAULT_CURVE) => 100 * phi((score - center) / spread);

// Seconds a player's wards were up: obs_pos / sen_pos are flat groups of 5 (x, y, second placed,
// seconds it lived or -1 if still up at the end, 1 if the enemy killed it).
function wardSeconds(groups, duration) {
  let t = 0;
  for (let i = 0; i + 4 < groups.length; i += 5) t += groups[i + 3] >= 0 ? groups[i + 3] : Math.max(0, duration - Math.max(0, groups[i + 2]));
  return t;
}

// One row per player per game: role, position, metrics (null = not in this game's data) and
// the raw numbers the breakdown shows next to the shares.
function gameRows(m) {
  const minutes = m.duration_sec / 60;
  const rows = [];
  for (const t of ["a", "b"]) {
    const team = m.players.filter((p) => p.team === t);
    const sum = (f) => team.reduce((s, p) => s + (f(p) ?? 0), 0);
    const kills = t === "a" ? m.score_a : m.score_b;
    const gold = sum((p) => p.gpm), dmg = sum((p) => p.hero_damage);
    const taken = team.every((p) => p.dmg_taken != null) ? sum((p) => p.dmg_taken) : null;
    const tower = team.every((p) => p.tower_damage != null) ? sum((p) => p.tower_damage) : null;
    const byNw = [...team].sort((x, y) => y.net_worth - x.net_worth);
    for (const p of team) {
      const pos = p.position ?? byNw.indexOf(p) + 1;
      const parsed = p.obs_placed != null;
      const per10 = (v) => (v != null ? (v / minutes) * 10 : null);
      rows.push({
        p, match: m, pos, role: pos <= 3 ? "core" : "support", won: m.winner === t, minutes,
        series: String(m.series_id ?? m.id ?? m.match_id),
        us: teamKey(t === "a" ? m.team_a : m.team_b), them: teamKey(t === "a" ? m.team_b : m.team_a),
        raw: { gpm: p.gpm, xpm: p.xpm, dmg: p.hero_damage, tower: p.tower_damage ?? null, kills: p.kills, assists: p.assists, taken: p.dmg_taken ?? null },
        metrics: {
          farm: share(p.gpm, gold), gpm: p.gpm ?? null, nw: p.net_worth ?? null,
          dmg: share(p.hero_damage, dmg), xpm: p.xpm ?? null,
          tower: tower ? share(p.tower_damage, tower) : null,
          soak: taken ? share(p.dmg_taken, taken) : null,
          kills: kills ? p.kills / kills : null, assists: kills ? p.assists / kills : null,
          lanewin: tierLaneResult(m, p),
          lane: p.lane_eff ?? null,
          stuns: p.stuns != null ? p.stuns / minutes : null,
          vision: p.new_vision ?? null,
          vispct: p.ward_vision ?? null,
          dewards: parsed ? per10((p.obs_killed ?? 0) + 0.5 * (p.sen_killed ?? 0)) : null,
          uptime: p.obs_pos ? (wardSeconds(p.obs_pos, m.duration_sec) + 0.5 * wardSeconds(p.sen_pos ?? [], m.duration_sec)) / minutes : null,
          sentries: parsed ? per10(p.sen_placed) : null,
          dust: per10(p.dust_used), smokes: per10(p.smoke_used),
          stacks: p.camps_stacked,
          heal: p.hero_healing != null ? p.hero_healing / minutes : null,
          deaths: per10(p.deaths),
          dead: p.time_dead != null ? p.time_dead / m.duration_sec : null,
          tanked: p.dmg_taken != null ? p.dmg_taken / (p.deaths + 1) : null,
        },
      });
    }
  }
  return rows;
}

// A position's reference for a stat: [mean, sd], or [a, b, sd] for a line a + b·minutes.
const expected = (ref, minutes) => (ref.length === 3 ? ref[0] + ref[1] * minutes : ref[0]);
// Every metric a role is scored on: its stats plus survival's parts.
const scoredMetrics = (pos, v) => ({ ...weightsOf(v, pos), ...survivalOf(v, pos) });
// Every metric anyone in a role is scored on (with points per position, all its positions').
const roleMetrics = (role, v) => Object.assign({}, ...(role === "core" ? [1, 2, 3] : [4, 5]).map((n) => scoredMetrics(n, v)));

// Each row's capped, direction-flipped z per metric (higher = better) and the value it was
// compared with.
function scoreRow(row, model) {
  row.z = {}; row.exp = {};
  for (const [metric, w] of Object.entries(scoredMetrics(row.pos, model.v))) {
    const v = row.metrics[metric], ref = model.positions[row.pos]?.[metric];
    if (v == null || !ref) continue;
    const e = expected(ref, row.minutes), sd = ref[ref.length - 1];
    row.exp[metric] = e;
    row.z[metric] = sd > 0 ? clamp((v - e) / sd, -Z_CAP, Z_CAP) * Math.sign(w) : 0;
  }
  return row;
}

// Series rows: one per player, series and role, with each metric's average z and how many of
// its games had that metric.
function seriesRows(rows, unitOf = (r) => r.role) {
  const by = new Map();
  for (const r of rows) {
    const k = `${keyOf(r.p)}|${r.series}|${unitOf(r)}`;
    const m = r.match;
    const s = by.get(k) ?? {
      key: keyOf(r.p), role: r.role, unit: unitOf(r), series: r.series, games: 0, wins: 0, z: {}, n: {}, game_ids: [],
      vs: (r.p.team === "a" ? m.team_b : m.team_a) ?? null, time: m.start_time ?? (m.createdAt ? +new Date(m.createdAt) / 1000 : null),
    };
    s.games++;
    s.game_ids.push([m.start_time ?? (m.createdAt ? +new Date(m.createdAt) / 1000 : 0), m.id]);
    if (r.won) s.wins++;
    for (const [metric, z] of Object.entries(r.z)) { s.z[metric] = (s.z[metric] ?? 0) + z; s.n[metric] = (s.n[metric] ?? 0) + 1; }
    by.set(k, s);
  }
  for (const s of by.values()) {
    for (const m of Object.keys(s.z)) s.z[m] /= s.n[m];
    s.game_ids = s.game_ids.sort((a, b) => a[0] - b[0]).map(([, id]) => id); // played order
  }
  return [...by.values()];
}

// A z on the role's 0–100 scale for that metric (linear100 uncapped, score100 capped).
const linear100 = (z, [lo, hi]) => (hi > lo ? ((z - lo) / (hi - lo)) * 100 : 50);
const score100 = (z, lohi) => clamp(linear100(z, lohi), 0, 100);

// Shares over the metrics present: |w| / the sum of |w| for those metrics.
function shares(weights, present) {
  const ws = Object.entries(weights).filter(([m]) => present.has(m));
  const total = ws.reduce((s, [, w]) => s + Math.abs(w), 0);
  return Object.fromEntries(ws.map(([m, w]) => [m, Math.abs(w) / total]));
}

// Share of the pool's wins that took longer than this one (ties count half).
function winSpeed(minutes, sorted) {
  if (!sorted.length) return 50;
  let longer = 0, same = 0;
  for (const m of sorted) { if (m > minutes + 1e-9) longer++; else if (Math.abs(m - minutes) <= 1e-9) same++; }
  return ((longer + same / 2) / sorted.length) * 100;
}

// Each team's game results from `rows`: team -> [{ opp, won }] (one entry per game).
function teamGames(rows) {
  const seen = new Set(), by = new Map();
  for (const r of rows) {
    const k = `${r.match.id ?? r.match.match_id}|${r.us}`;
    if (seen.has(k) || !r.us) continue;
    seen.add(k);
    (by.get(r.us) ?? by.set(r.us, []).get(r.us)).push({ opp: r.them, won: r.won, series: r.series });
  }
  return by;
}
// teamGames for a league's games, made once per game list (`rows` its game rows), so every tier
// list and model of one league shares it and the opponent ratings fitted on it.
const teamsMemo = new WeakMap();
const teamsOf = (matches, rows) => teamsMemo.get(matches) ?? teamsMemo.set(matches, teamGames(rows)).get(matches);

// Team strength from game results: Bradley-Terry (a team beats another with chance
// 1 / (1 + e^(r_them - r_us))), pulled toward even by a ridge of `lambda` so a team with few
// games can't run off, fitted without the games of series `skip`. teams: teamGames.
function teamRatings(teams, skip, lambda = 0.5) {
  const ids = [...teams.keys()], at = new Map(ids.map((t, i) => [t, i]));
  const games = [], n = new Float64Array(ids.length);
  for (const [t, gs] of teams) for (const g of gs) {
    if (!g.won || g.series === skip || !at.has(g.opp)) continue;
    games.push([at.get(t), at.get(g.opp)]);
    n[at.get(t)]++; n[at.get(g.opp)]++;
  }
  const r = new Float64Array(ids.length);
  // Newton steps with a diagonal Hessian bound (each game's curvature is at most 1/4).
  for (let it = 0; it < 60; it++) {
    const grad = r.map((x) => -lambda * x);
    for (const [w, l] of games) { const p = 1 / (1 + Math.exp(r[w] - r[l])); grad[w] += p; grad[l] -= p; }
    for (let i = 0; i < r.length; i++) r[i] += grad[i] / (lambda + 0.25 * n[i]);
  }
  return new Map(ids.map((t, i) => [t, r[i]]));
}
// An opponent's strength 0-1 (the weakest team 0, the strongest 1) from ratings fitted without
// series `series`. One fit per series per league, kept.
const ratingMemo = new WeakMap();
function oppRating(teams, them, series) {
  const m = ratingMemo.get(teams) ?? ratingMemo.set(teams, new Map()).get(teams);
  let f = m.get(series);
  if (!f) {
    const r = teamRatings(teams, series), vals = [...r.values()];
    f = { r, lo: Math.min(...vals), hi: Math.max(...vals) };
    m.set(series, f);
  }
  return f.hi > f.lo && f.r.has(them) ? (f.r.get(them) - f.lo) / (f.hi - f.lo) : 0.5;
}
// An opponent's game win % outside games against `us`, shrunk toward 50% by k_prior games.
function oppStrength(teams, them, us, kPrior) {
  const gs = (teams.get(them) ?? []).filter((g) => g.opp !== us);
  return (gs.filter((g) => g.won).length + kPrior / 2) / (gs.length + kPrior);
}

// A player's average z per metric over some games, padded with k_shrink games at 0 (the
// position average): { metric: [shrunk z, games] }.
function shrunkZ(rrows, kShrink) {
  const sum = {}, n = {};
  for (const r of rrows) for (const [m, z] of Object.entries(r.z)) { sum[m] = (sum[m] ?? 0) + z; n[m] = (n[m] ?? 0) + 1; }
  return Object.fromEntries(Object.keys(sum).map((m) => [m, [sum[m] / (n[m] + kShrink), n[m]]]));
}

// Per player and unit (a role, or a position): each metric's 0–100 from their shrunk average
// against that unit's `anchors` ({ metric: [0, 100] }), plus their average value and position
// expectation for the breakdown.
function metricScores(rrows, weights, anchors, kShrink) {
  const zs = shrunkZ(rrows, kShrink), sum = {}, n = {};
  for (const [m, [z, games]] of Object.entries(zs)) {
    if (!(m in weights)) continue;
    sum[m] = z; n[m] = games;
  }
  const sh = shares(weights, new Set(Object.keys(n)));
  return Object.keys(sh).map((m) => {
    const with_ = rrows.filter((r) => r.z[m] != null);
    const rawKey = { farm: "gpm", dmg: "dmg", tower: "tower", kills: "kills", assists: "assists", tanked: "taken", soak: "taken" }[m];
    const rawVals = rawKey ? with_.map((r) => r.raw[rawKey]).filter((v) => v != null) : [];
    return {
      metric: m, weight: weights[m], share: sh[m], games: n[m],
      score: score100(sum[m], anchors[m]), linear: linear100(sum[m], anchors[m]),
      value: mean(with_.map((r) => r.metrics[m])), avg: mean(with_.map((r) => r.exp[m])),
      raw: rawVals.length ? mean(rawVals) : null,
    };
  }).sort((x, y) => y.share - x.share);
}

// Score every player in `rows` against `model` (rows must already be scored). With
// `consistency: false` (while the model is being built) consistency counts as 1. `teams`:
// the team results opponent strength is read from (default: `rows` themselves).
// Normally each role is scored against the league's anchors for that role. A model with
// `pos_anchors` (a position's list: see tierModels) scores each position's games against that
// position's own anchors, so a player's off-position games are judged by the position played.
function scorePlayers(rows, model, { consistency = true, teams = teamGames(rows) } = {}) {
  const v = model.v;
  // With points per position, each position is its own unit even on a whole-league model (its
  // anchors are then the role's).
  const byPos = model.pos_anchors || perPosition(v);
  const unitOf = byPos ? (r) => r.pos : (r) => r.role;
  const anchorsOf = (u) => (model.pos_anchors ? model.pos_anchors[u] : model.anchors[typeof u === "number" ? (u <= 3 ? "core" : "support") : u]);
  const series = seriesRows(rows, unitOf);
  const byPlayer = new Map();
  for (const r of rows) {
    const k = keyOf(r.p);
    const a = byPlayer.get(k) ?? { key: k, p: r.p, rows: [], series: [], teams: {}, heroes: {}, rank_tier: null };
    a.rows.push(r);
    a.heroes[r.p.hero] = (a.heroes[r.p.hero] ?? 0) + 1;
    if (r.p.rank_tier != null) a.rank_tier = r.p.rank_tier;
    if (r.p.team_name && !r.p.standin) a.teams[r.p.team_name] = (a.teams[r.p.team_name] ?? 0) + 1;
    else if (r.p.team_name) a.teams[r.p.team_name] ??= 0;
    byPlayer.set(k, a);
  }
  for (const s of series) byPlayer.get(s.key).series.push(s);

  return [...byPlayer.values()].map((a) => {
    const games = a.rows.length, wins = a.rows.filter((r) => r.won).length;
    const roleGames = { core: 0, support: 0 };
    for (const r of a.rows) roleGames[r.role]++;
    const role = roleGames.core >= roleGames.support ? "core" : "support";
    // Exact positions: games at each (1–5), and the one played most (ties: the lower number).
    const posGames = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of a.rows) if (posGames[r.pos] != null) posGames[r.pos]++;
    const pos = Number(Object.entries(posGames).sort((x, y) => y[1] - x[1] || x[0] - y[0])[0][0]);

    // Stat points and survival, per role, then weighted by games in each role.
    const roles = [];
    for (const u of [...new Set(a.rows.map(unitOf))].sort()) {
      const rrows = a.rows.filter((r) => unitOf(r) === u), rl = rrows[0].role;
      const stats = metricScores(rrows, typeof u === "number" ? weightsOf(v, u) : v.weights[rl], anchorsOf(u), v.k_shrink);
      const surv = metricScores(rrows, typeof u === "number" ? survivalOf(v, u) : v.survival, anchorsOf(u), v.k_shrink);
      roles.push({
        role: rl, unit: u, games: rrows.length, stats, survival: surv,
        points: stats.reduce((t, s) => t + s.share * s.score, 0),
        survivalScore: surv.length ? surv.reduce((t, s) => t + s.share * s.score, 0) : null,
      });
    }
    const scored = roles.filter((r) => r.stats.length);
    const scoredGames = scored.reduce((t, r) => t + r.games, 0);
    for (const r of roles) r.frac = scoredGames && r.stats.length ? r.games / scoredGames : 0;
    const statPoints = scoredGames ? scored.reduce((t, r) => t + r.frac * r.points, 0) : 50;
    // Each stat's points toward the stat subtotal: 100 × the role's share of games × its share × 0–100.
    for (const r of roles) for (const s of r.stats) { s.max = 100 * r.frac * s.share; s.points = (s.max * s.score) / 100; }
    const survRoles = roles.filter((r) => r.survivalScore != null);
    const survGames = survRoles.reduce((t, r) => t + r.games, 0);
    const survival = survGames ? survRoles.reduce((t, r) => t + r.games * r.survivalScore, 0) / survGames : 50;

    // Each series' stat points, built so that the series (weighted by games) average to exactly
    // the season's: the series' average z per stat gets the same padding as the season
    // (× n / (n + K_SHRINK), n = the season's games with that stat), isn't capped on its own,
    // and takes the season's cap as a shift; a stat missing from some games counts in
    // proportion to the games that had it.
    for (const s of a.series) {
      const r = roles.find((x) => x.unit === s.unit);
      if (!r?.stats.length) { s.points = null; continue; }
      s.points = r.stats.reduce((t, st) => {
        if (s.z[st.metric] == null) return t;
        const sc = linear100((s.z[st.metric] * st.games) / (st.games + v.k_shrink), anchorsOf(s.unit)[st.metric]) + (st.score - st.linear);
        return t + (st.share * sc * s.n[st.metric] * r.games) / (s.games * st.games);
      }, 0);
    }
    const scoredSeries = a.series.filter((s) => s.points != null);
    const seriesPts = scoredSeries.map((s) => s.points);

    // Consistency: spread of the player's series stat points, pulled toward the pool's typical
    // spread by k_consistency series.
    const c = model.consistency;
    let spread = null, consistencyScore = 50, topHits = null;
    if (c?.top) {
      // Series in the league's top share, padded with k_consistency series at the league's rate.
      topHits = seriesPts.filter((x) => x >= c.cut).length;
      const share = (topHits + v.k_consistency * c.top) / (seriesPts.length + v.k_consistency);
      consistencyScore = c.best > c.worst ? clamp(((share - c.worst) / (c.best - c.worst)) * 100, 0, 100) : 50;
    } else if (c) {
      const dof = Math.max(0, seriesPts.length - 1);
      spread = (dof * (seriesPts.length > 1 ? sdOf(seriesPts) : 0) + v.k_consistency * c.typical) / (dof + v.k_consistency);
      consistencyScore = c.worst > c.best ? clamp(((c.worst - spread) / (c.worst - c.best)) * 100, 0, 100) : 50;
    }

    // Opponents: each game's opponent strength -> a factor; each series takes its games' average,
    // and the season's multiplier weights each series by its stat points (a big series against a
    // strong team counts more than one against a weak team).
    // By rating (opponents_by "rating"): strength 0-1 straight onto the range. By win %: 25% -> the
    // bottom, 75% -> the top.
    const byRating = v.opponents_by === "rating";
    const oppOf = (r) => (!r.them ? 0.5 : byRating ? oppRating(teams, r.them, r.series) : oppStrength(teams, r.them, r.us, v.k_prior));
    const factor = (rate) => (byRating ? lerp(v.mult.opponents, rate) : lerp(v.mult.opponents, (rate - 0.25) / 0.5));
    const oppRate = mean(a.rows.map(oppOf));
    for (const s of a.series) {
      const rs = a.rows.filter((r) => r.series === s.series && unitOf(r) === s.unit);
      s.opp_rate = mean(rs.map(oppOf));
      s.opp = mean(rs.map((r) => factor(oppOf(r))));
    }
    const weighted = scoredSeries.reduce((t, s) => t + s.games * s.points, 0);
    const oppMult = weighted > 0 ? scoredSeries.reduce((t, s) => t + s.games * s.points * s.opp, 0) / weighted : mean(a.rows.map((r) => factor(oppOf(r))));

    const winRows = a.rows.filter((r) => r.won);
    const winShrunk = (wins + v.k_prior * 0.5) / (games + v.k_prior);
    const win = clamp(((winShrunk - 0.25) / 0.5) * 100, 0, 100);
    const speed = (winRows.reduce((s, r) => s + winSpeed(r.minutes, model.win_minutes), 0) + v.k_speed * 50) / (winRows.length + v.k_speed);
    const winning = (v.win_parts.win * win + v.win_parts.speed * speed) / (v.win_parts.win + v.win_parts.speed);

    // Winning: a multiplier, or with `winning_flat` flat points added after the multipliers.
    const winPts = v.winning_flat ? lerp(v.winning_flat, winning / 100) : 0;
    const mult = {
      survival: lerp(survivalRange(v, pos), survival / 100), // the main position's range
      consistency: consistency ? lerp(v.mult.consistency, consistencyScore / 100) : 1,
      opponents: oppMult,
      winning: v.winning_flat ? 1 : lerp(v.mult.winning, winning / 100),
    };
    const score = statPoints * mult.survival * mult.consistency * mult.opponents * mult.winning + winPts;
    const teamEntries = Object.entries(a.teams).sort((x, y) => y[1] - x[1]);
    return {
      key: a.key, name: a.p.name, account_id: a.p.account_id ?? null, rank_tier: a.rank_tier,
      team: teamEntries[0]?.[0] ?? null, standin: teamEntries.length > 0 && teamEntries[0][1] === 0,
      version: model.version, role, games, wins, role_games: roleGames, pos, pos_games: posGames,
      roles: roles.sort((x, y) => (x.role === role ? -1 : y.role === role ? 1 : 0)),
      // Per series: stat points, and a score = those × that series' opponent factor × the
      // season's survival, consistency and winning. Both average (weighted by games) to the
      // season's stat points and score.
      series: a.series.map((s) => ({
        series: s.series, role: s.role, pos: typeof s.unit === "number" ? s.unit : null, games: s.games, wins: s.wins, vs: s.vs, time: s.time, game_ids: s.game_ids,
        points: s.points, opp: s.opp, opp_rate: s.opp_rate,
        score: s.points == null ? null : s.points * s.opp * mult.survival * mult.consistency * mult.winning + winPts,
      })).sort((x, y) => (y.time ?? 0) - (x.time ?? 0)),
      series_points: seriesPts,
      stat_points: statPoints, survival, consistency: consistencyScore, spread, top_hits: topHits, top_cut: c?.top ? c.cut : null, opp_rate: oppRate,
      win_minutes: winRows.length ? mean(winRows.map((r) => r.minutes)) : null,
      win_shrunk: winShrunk, win, speed, winning, mult, score, win_points: v.winning_flat ? winPts : null,
      top_heroes: Object.entries(a.heroes).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([h]) => h),
    };
  });
}

// Stat podium (versions with `podium`): the league's top three in each podium stat, by season
// average a game of the raw number (players with minGames+ games, any position). `rows`: the
// whole league's game rows. Returns key -> { points, places: [{ metric, place, points }] }.
function leaguePodium(rows, v, minGames) {
  const out = new Map();
  if (!v.podium) return out;
  const byPlayer = new Map();
  for (const r of rows) { const k = keyOf(r.p); (byPlayer.get(k) ?? byPlayer.set(k, []).get(k)).push(r); }
  const field = [...byPlayer].filter(([, rs]) => rs.length >= minGames);
  // Grouped (stats keyed by "core" / "support", or by position 1-5): each group ranks the players
  // whose main position (most games; ties the lower number) falls in it, on its own stats. A
  // list: everyone at once.
  const mainPos = (rs) => { const c = {}; for (const r of rs) c[r.pos] = (c[r.pos] ?? 0) + 1; return Number(Object.entries(c).sort((x, y) => y[1] - x[1] || x[0] - y[0])[0][0]); };
  const inGroup = (k, pos) => (k === "core" ? pos <= 3 : k === "support" ? pos >= 4 : pos === Number(k));
  const groups = Array.isArray(v.podium.stats)
    ? [[field, v.podium.stats]]
    : Object.entries(v.podium.stats).map(([k, stats]) => [field.filter(([, rs]) => inGroup(k, mainPos(rs))), stats]);
  for (const [group, stats] of groups) for (const m of stats) {
    const q = PODIUM_STATS[m].qualify;
    const avgs = (q ? group.filter(([, rs]) => q(rs)) : group).map(([k, rs]) => { const xs = rs.map((r) => PODIUM_STATS[m].get(r.p, r.match)).filter((x) => x != null); return [k, xs.length ? mean(xs) : null]; })
      .filter(([, a]) => a != null).sort((a, b) => b[1] - a[1]);
    v.podium.points.forEach((pts, i) => {
      if (!avgs[i]) return;
      const e = out.get(avgs[i][0]) ?? out.set(avgs[i][0], { points: 0, places: [] }).get(avgs[i][0]);
      e.places.push({ metric: m, place: i + 1, points: pts });
      e.points += pts;
    });
  }
  for (const e of out.values()) e.places.sort((a, b) => a.place - b.place);
  return out;
}
// Adds each player's podium points (from leaguePodium) to their score. Sets p.podium and
// p.score_base (the score before it).
function addPodium(players, podium, v) {
  if (!v.podium) return;
  for (const p of players) {
    p.score_base = p.score;
    p.podium = podium.get(p.key) ?? { points: 0, places: [] };
    p.score += p.podium.points;
  }
}

// Least-squares line y = a + b·x, and the spread of what's left over.
function lineFit(xs, ys) {
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0;
  xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; });
  const b = sxx > 0 ? sxy / sxx : 0, a = my - b * mx;
  return [a, b, sdOf(ys.map((y, i) => y - (a + b * xs[i])), 0)];
}

// [lowest, highest] of a list, or null with fewer than two.
const ends = (xs) => (xs.length >= 2 ? [Math.min(...xs), Math.max(...xs)] : null);

// The reference a tier list is scored against. `matches` is the league's games: one AD2L
// division, or the scrim ledger. `minGames`: the games a player needs to count toward the
// anchors and the curve (lower when the time machine picks only a week or two). `pos` (1–5):
// a model for one position, whose anchors, consistency and curve come from that position's
// games and players only, so its tier list rates pos 4s against pos 4s. `version`: a key of
// VERSIONS, the scoring numbers to use.
export function tierModel(matches, { minGames = MIN_GAMES, pos = null, version = LIVE } = {}) {
  const v = VERSIONS[version];
  const all = matches.flatMap(gameRows);
  const positions = {};
  for (const pos of [1, 2, 3, 4, 5]) {
    const here = all.filter((r) => r.pos === pos);
    positions[pos] = {};
    for (const metric of Object.keys(METRICS)) {
      const with_ = here.filter((r) => r.metrics[metric] != null);
      if (with_.length < 2) continue;
      const vs = with_.map((r) => r.metrics[metric]);
      positions[pos][metric] = LENGTH_FIT.has(metric) ? lineFit(with_.map((r) => r.minutes), vs) : [mean(vs), sdOf(vs)];
    }
  }
  const model = { version, v, games: matches.length, pos, positions, anchors: {}, win_minutes: all.filter((r) => r.won && r.pos === 1).map((r) => r.minutes).sort((a, b) => a - b) };
  for (const r of all) scoreRow(r, model);
  // Opponent strength always from every game; everything else from the rows this model rates.
  const teams = teamsOf(matches, all), rows = pos ? all.filter((r) => r.pos === pos) : all;
  // Anchors, from every player with minGames+ games in a role. 100 is the best shrunk season
  // average at a stat (the number players are scored on), so the league's best gets all its
  // points. 0 is the worst single series by such a player, flat out, so every series and season
  // sits inside the scale and a weak series isn't a 0 or 1.
  const byPlayerRole = new Map();
  for (const r of rows) { const k = `${keyOf(r.p)}|${r.role}`; (byPlayerRole.get(k) ?? byPlayerRole.set(k, []).get(k)).push(r); }
  const eligible = new Set([...byPlayerRole].filter(([, rs]) => rs.length >= minGames).map(([k]) => k));
  const perfs = seriesRows(rows).filter((s) => eligible.has(`${s.key}|${s.role}`));
  for (const role of ["core", "support"]) {
    model.anchors[role] = {};
    const players = [...byPlayerRole.values()].filter((rs) => rs[0].role === role && rs.length >= minGames).map((rs) => shrunkZ(rs, v.k_shrink));
    const here = perfs.filter((s) => s.role === role);
    for (const metric of Object.keys(roleMetrics(role, v))) {
      const best = ends(players.filter((z) => z[metric]).map((z) => z[metric][0]));
      const worst = ends(here.filter((s) => s.z[metric] != null).map((s) => s.z[metric]));
      // Too few players or series to find a best and a worst: fall back to ±1 sd.
      const [lo, hi] = best && worst ? [Math.min(worst[0], best[1] - 1e-6), best[1]] : [-1, 1];
      // Some stats are easier to max: 100 sits part of the way to the best player.
      model.anchors[role][metric] = [lo, lo + (hi - lo) * (v.ease[role]?.[metric] ?? 1)];
    }
  }
  // Consistency reference: eligible players' series spreads (2+ series).
  const first = scorePlayers(rows, model, { consistency: false, teams }).filter((p) => p.games >= minGames && p.series_points.length >= 2);
  const sds = first.map((p) => sdOf(p.series_points)).sort((a, b) => a - b);
  if (v.consistency_top && sds.length) {
    // The bar: the series score that `consistency_top` of all eligible players' series reach.
    const all = first.flatMap((p) => p.series_points).sort((a, b) => a - b);
    const cut = all[Math.min(all.length - 1, Math.floor(all.length * (1 - v.consistency_top)))];
    const shares = first.map((p) => (p.series_points.filter((x) => x >= cut).length + v.k_consistency * v.consistency_top) / (p.series_points.length + v.k_consistency));
    const e = ends(shares);
    model.consistency = { top: v.consistency_top, cut, best: e ? e[1] : v.consistency_top + 0.2, worst: e ? e[0] : v.consistency_top - 0.2 };
  } else if (sds.length) {
    const typical = sds[Math.floor(sds.length / 2)];
    // Anchors on the shrunk spreads, the same way players are scored.
    const shrunk = first.map((p) => { const dof = p.series_points.length - 1; return (dof * sdOf(p.series_points) + v.k_consistency * typical) / (dof + v.k_consistency); });
    const e = ends(shrunk);
    model.consistency = { typical, best: e ? e[0] : typical * 0.5, worst: e ? e[1] : typical * 1.5 };
  }
  const season = scorePlayers(rows, model, { teams });
  addPodium(season, leaguePodium(all, v, minGames), v);
  const scores = season.filter((p) => p.games >= minGames).map((p) => p.score).sort((a, b) => a - b);
  model.curve = scores.length >= 5 ? [scores[Math.floor(scores.length / 2)], v.stretch * sdOf(scores)] : DEFAULT_CURVE;
  // One game's score sits closer to the middle than a season's (no averaging luck out, and the
  // shrinking pulls one game hard), so on the season curve almost no game reached S or D.
  // Game ratings get their own curve, fitted the same way to every player-game in the league,
  // so a game rating spreads like the tier list.
  const byGame = new Map();
  for (const r of rows) { const k = r.match.id ?? r.match.match_id; (byGame.get(k) ?? byGame.set(k, []).get(k)).push(r); }
  const games = [...byGame.values()].flatMap((rs) => scorePlayers(rs, model, { teams }).map((p) => p.score)).sort((a, b) => a - b);
  model.game_curve = games.length >= 10 ? [games[Math.floor(games.length / 2)], v.stretch * sdOf(games)] : model.curve;
  return model;
}

// The five position models for the per-position tier lists, keyed 1–5. Each is the model for
// that position's games alone (its anchors, consistency and curve, as `tierModel` with `pos`),
// and also carries every position's anchors (`pos_anchors`) and the whole set (`set`), so a
// player with games at several positions is scored on all of them, each against the position
// played.
export function tierModels(matches, { minGames = MIN_GAMES, version = LIVE } = {}) {
  const set = {};
  for (const n of [1, 2, 3, 4, 5]) set[n] = tierModel(matches, { minGames, pos: n, version });
  const pos_anchors = Object.fromEntries([1, 2, 3, 4, 5].map((n) => [n, set[n].anchors[n <= 3 ? "core" : "support"]]));
  for (const n of [1, 2, 3, 4, 5]) Object.assign(set[n], { pos_anchors, set });
  return set;
}

// `pos` (1–5): that position's list, the players whose main position it is; `model` is then
// that position's model from `tierModels`. All of a player's games count, each against the
// position played in it. A player with games at several positions also gets `by_pos`: the score
// from their games at each (a full result per position, rated on that position's curve).
export function tierList(matches, { minGames = MIN_GAMES, model = null, pos = null } = {}) {
  model ??= pos ? tierModels(matches, { minGames })[pos] : tierModel(matches, { minGames });
  const rows = matches.flatMap(gameRows).map((r) => scoreRow(r, model));
  const teams = teamsOf(matches, rows);
  let players = scorePlayers(rows, model, { teams });
  if (pos) players = players.filter((p) => p.pos === pos);
  addPodium(players, leaguePodium(rows, model.v, minGames), model.v);
  for (const p of players) { p.rating_exact = ratingOf(p.score, model.curve); p.rating = Math.round(p.rating_exact); p.curve = model.curve; }
  const mixed = new Map(players.filter((p) => Object.values(p.pos_games).filter((n) => n).length > 1).map((p) => [p.key, p]));
  if (pos && mixed.size) {
    for (const n of [1, 2, 3, 4, 5]) {
      const m = model.set[n], here = rows.filter((r) => r.pos === n && mixed.has(keyOf(r.p)));
      for (const q of scorePlayers(here, m, { teams })) {
        // The list's own position carries the player's podium places (earned in this list).
        const p = mixed.get(q.key);
        if (n === pos && p.podium) { q.podium = p.podium; q.score_base = q.score; q.score += p.podium.points; }
        q.rating_exact = ratingOf(q.score, m.curve); q.rating = Math.round(q.rating_exact); q.curve = m.curve;
        (mixed.get(q.key).by_pos ??= []).push(q); // a full player result for just the games at pos n
      }
    }
  }

  const eligible = players.filter((p) => p.games >= minGames).sort((a, b) => b.score - a.score);
  for (const p of eligible) p.tier = TIERS.find((t) => p.rating_exact >= t.min).tier;

  return {
    tiers: TIERS.map(({ tier }) => ({ tier, players: eligible.filter((p) => p.tier === tier) })),
    unranked: players.filter((p) => p.games < minGames).sort((a, b) => b.games - a.games),
    eligible: eligible.length,
    curve: model.curve,
    model,
  };
}

// Per-hero ratings: each player's games on one hero, scored like the tier list against the
// league's model (so a hero rating reads on the same curve as the tier rating). Opponent
// strength still comes from all the league's games. Returns hero -> players, best first. No
// minimum games: the rating already pulls small samples toward the average.
export function heroRatings(matches, { model = null, minGames = MIN_GAMES } = {}) {
  model ??= tierModel(matches, { minGames });
  const rows = matches.flatMap(gameRows).map((r) => scoreRow(r, model));
  const teams = teamGames(rows), byHero = new Map();
  for (const r of rows) (byHero.get(r.p.hero) ?? byHero.set(r.p.hero, []).get(r.p.hero)).push(r);
  return new Map([...byHero].map(([hero, rs]) => [hero, scorePlayers(rs, model, { teams })
    .map((p) => { const rating_exact = ratingOf(p.score, model.curve); return { ...p, hero, rating_exact, rating: Math.round(rating_exact), curve: model.curve }; })
    .sort((a, b) => b.score - a.score)]));
}

// The hero tier list: every player-on-hero pair from heroRatings with `minGames`+ games on that
// hero, best first, each with its tier letter (same cutoffs as the tier list).
export const HERO_TIER_MIN = 2;
export function heroTierList(ratings, { minGames = HERO_TIER_MIN } = {}) {
  const pairs = [...ratings.values()].flat().filter((p) => p.games >= minGames)
    .map((p) => ({ ...p, tier: TIERS.find((t) => p.rating_exact >= t.min).tier }))
    .sort((a, b) => b.rating_exact - a.rating_exact || b.games - a.games);
  return TIERS.map(({ tier }) => ({ tier, pairs: pairs.filter((p) => p.tier === tier) }));
}

// Heroes themselves, ranked by how well players do on them: the games-weighted average hero
// rating of everyone who played it, padded with K_HERO games at 50 (the league's median player)
// so a 3-game hero can't top the list. Those averages bunch up, so like the tier list they go
// on a curve: fitted to the heroes with HERO_TIER_MIN+ games (median 50, RATING_STRETCH × their
// spread). Heroes need `minGames`+ games. Bands by the tier cutoffs, best first.
export const K_HERO = 3;
export function heroPowerList(ratings, { minGames = MIN_GAMES } = {}) {
  const heroes = [...ratings].map(([hero, ps]) => {
    const games = ps.reduce((s, p) => s + p.games, 0);
    const avg = (ps.reduce((s, p) => s + p.rating_exact * p.games, 0) + 50 * K_HERO) / (games + K_HERO);
    return { hero, games, wins: ps.reduce((s, p) => s + p.wins, 0), players: ps.length, avg, best: ps[0], on: ps };
  });
  const fit = heroes.filter((h) => h.games >= HERO_TIER_MIN).length >= 5 ? heroes.filter((h) => h.games >= HERO_TIER_MIN) : heroes;
  const avgs = fit.map((h) => h.avg).sort((a, b) => a - b);
  const curve = avgs.length >= 5 && sdOf(avgs) > 0 ? [avgs[Math.floor(avgs.length / 2)], RATING_STRETCH * sdOf(avgs)] : DEFAULT_CURVE;
  const shown = heroes.filter((h) => h.games >= minGames).map((h) => {
    const rating_exact = ratingOf(h.avg, curve);
    return { ...h, rating_exact, rating: Math.round(rating_exact), tier: TIERS.find((t) => rating_exact >= t.min).tier };
  }).sort((a, b) => b.rating_exact - a.rating_exact || b.games - a.games);
  shown.forEach((h, i) => { h.place = i + 1; h.of = shown.length; });
  return { tiers: TIERS.map(({ tier }) => ({ tier, heroes: shown.filter((h) => h.tier === tier) })), curve };
}

// One game's ratings: its ten players, each scored on that game alone against the league's
// model (opponent strength from all of `matches`), on the league's game curve (the tier curve's
// method fitted to single games), so game ratings spread across S–D like the tier list. Best first.
const leagueTeams = new WeakMap();
export function gameRatings(m, matches, { model = null } = {}) {
  model ??= tierModel(matches);
  const teams = leagueTeams.get(matches) ?? leagueTeams.set(matches, teamGames(matches.flatMap(gameRows))).get(matches);
  const rows = gameRows(m).map((r) => scoreRow(r, model));
  return scorePlayers(rows, model, { teams })
    .map((p) => { const rating_exact = ratingOf(p.score, model.game_curve ?? model.curve); return { ...p, rating_exact, rating: Math.round(rating_exact), tier: TIERS.find((t) => rating_exact >= t.min).tier }; })
    .sort((a, b) => b.score - a.score);
}

// One player's score in one game as if they had played position `pos` in it (the fantasy league
// scores a pick against its slot's position, whatever they played). `models`: a tierModels set
// (any version); opponent strength from all of `matches`. null when they're not in the game.
export function gameScoreAt(m, matches, key, pos, models) {
  const model = models[pos];
  const teams = leagueTeams.get(matches) ?? leagueTeams.set(matches, teamGames(matches.flatMap(gameRows))).get(matches);
  const rows = gameRows(m).filter((r) => keyOf(r.p) === String(key));
  if (!rows.length) return null;
  for (const r of rows) { r.pos = pos; r.role = pos <= 3 ? "core" : "support"; scoreRow(r, model); }
  return scorePlayers(rows, model, { teams })[0].score;
}

// OpenDota rank_tier (tens = medal, ones = stars) -> label.
const MEDALS = ["", "Herald", "Guardian", "Crusader", "Archon", "Legend", "Ancient", "Divine", "Immortal"];
export function rankLabel(rt) {
  if (!rt) return null;
  const medal = MEDALS[Math.floor(rt / 10)];
  if (!medal) return null;
  const stars = rt % 10;
  return medal === "Immortal" || !stars ? medal : `${medal} ${stars}`;
}
