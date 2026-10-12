// The playoff picture if the model calls every remaining result right: the rest of the group
// stage, the final table, AD2L's tiebreakers (week 8) and the bracket.
//
// AD2L rules (S48, rules §5–7, read 2026-10-02):
//  - Group stage: 7 weeks, pseudo-swiss, two-game series. The table counts game wins; a bye
//    is a 1–0 series.
//  - Playoffs: 8 teams, double elimination; seeds 1–4 start in the upper bracket, 5–8 in the
//    lower. Seed 1 picks seed 3 or 4 as its first opponent. Bo3; the grand final Bo3 or Bo5.
//  - A tie across a dividing line (upper/lower bracket, playoffs/out) is played off in week 8,
//    by the table in tiebreakFormat below, with the tied teams ranked by SoS (strength of
//    schedule: total wins of the opponents played), then head to head, then record against the
//    highest common opponent, then a 1v1 solo mid. A tie that only decides seed order isn't
//    played: SoS, head to head, highest common opponent, then a 1v1 mid for 1st and a coin flip
//    for any other seed (the league admins, 2026-10-06).
// Not in the rules, taken from S47's brackets on PlayOn: lower round 1 is 5 v 8 and 6 v 7; the
// loser of seed 1's match meets the 6 v 7 winner, the other upper loser the 5 v 8 winner.
// Smaller divisions (fewer than 8 teams) put everyone in: 4 teams all start upper (1 v 4,
// 2 v 3); 5–6 teams play 5 v 6 in the lower bracket. That part is the site's assumption.

import { seriesOdds, modelCall, ODDS_SPREAD } from "./predict.js";
import { isPlayed, gameWins, strengthOfSchedule } from "./schedule.js";
import { ordinal as ord } from "./ranks.js";
import { isPostseason, groupStage } from "./divisions.js";

export const REG_WEEKS = 7;
export const isBye = (t) => /\bbye week\b/i.test(t?.name ?? "");

const sig = (x) => 1 / (1 + Math.exp(-x));
// Chance the first team wins one game: the same stretched gap as the series odds on Predict.
export const gameP = (ra, rb) => sig(ODDS_SPREAD * (ra - rb));
// Chance to win a best-of-n from the one-game chance (games independent).
export function bestOfP(p, n) {
  if (n === 1 || n == null) return p;
  if (n === 3) return p * p * (3 - 2 * p);
  if (n === 5) return p ** 3 * (10 - 15 * p + 6 * p * p);
  return p;
}
// Every final score of a best-of-n (odd n; anything else plays as a Bo1) and its chance, from
// the first team's one-game chance: [{ a, b, p }], first team's wins first (Bo3: 2–0, 2–1, 1–2,
// 0–2). A first-to-k win with j losses: the last game won, j of the other k-1+j lost.
export function bestOfScores(p, n) {
  const k = n === 3 || n === 5 ? (n + 1) / 2 : 1, q = 1 - p;
  const choose = (m, r) => { let c = 1; for (let i = 0; i < r; i++) c = (c * (m - i)) / (i + 1); return c; };
  const ways = (j) => choose(k - 1 + j, j);
  const out = [];
  for (let j = 0; j < k; j++) out.push({ a: k, b: j, p: ways(j) * p ** k * q ** j });
  for (let j = k - 1; j >= 0; j--) out.push({ a: j, b: k, p: ways(j) * q ** k * p ** j });
  return out;
}
// The likeliest score with `side` ("a" or "b") winning, as [winner's wins, loser's wins]. For
// the favourite a Bo3 is always 2–0 (2–1 needs a dropped game); a Bo5 is 3–1 below 2/3 a game.
export function likelyScore(scores, side) {
  const won = scores.filter((s) => (side === "a" ? s.a > s.b : s.b > s.a));
  const top = won.reduce((x, s) => (s.p > x.p ? s : x));
  return side === "a" ? [top.a, top.b] : [top.b, top.a];
}
// One match: the winner (`chosen` when it's one of the two, else the model's), its chance by the
// model, the likeliest score and every score's chance. `mine` marks a chosen winner.
function callMatch(ratings, a, b, bestOf, chosen) {
  const p = gameP(ratings.get(a) ?? 0, ratings.get(b) ?? 0), pa = bestOfP(p, bestOf ?? 1);
  const mine = chosen === a || chosen === b;
  const winner = mine ? chosen : pa >= 0.5 ? a : b, scores = bestOfScores(p, bestOf ?? 1);
  return { winner, loser: winner === a ? b : a, p: winner === a ? pa : 1 - pa, score: likelyScore(scores, winner === a ? "a" : "b"), scores, mine, model: pa >= 0.5 ? a : b };
}
// The key a viewer's pick for a match is stored under: the same two teams, either order.
export const pairKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

// ---------- the rest of the group stage ----------

// Pairs a week swiss-style: teams in table order, each taking the nearest team below it that
// it hasn't met yet. If that can't pair everyone (small divisions run out of new opponents),
// the fewest repeat meetings win. PlayOn's own pairing ("pseudo-swiss") isn't published, so
// these are a stand-in until the real week is posted.
export function pairWeek(order, met) {
  const ids = order.length % 2 ? order.slice(0, -1) : order;
  const times = (a, b) => met.get(`${a}|${b}`) ?? 0;
  const solve = (list, allow) => {
    if (!list.length) return [];
    const [a, ...rest] = list;
    for (const b of rest) {
      if (times(a, b) > allow) continue;
      const more = solve(rest.filter((x) => x !== b), allow);
      if (more) return [[a, b], ...more];
    }
    return null;
  };
  for (let allow = 0; allow <= REG_WEEKS; allow++) {
    const p = solve(ids, allow);
    if (p) return p;
  }
  return [];
}

// A two-game series: `call(s)` ("home", "tie" or "away") when it gives one, else the model's
// call (favourite 2–0, or 1–1 for a coin flip). A bye is 1–0.
const OUTCOMES = ["home", "tie", "away"];
function callSeries(s, teamOf, ratings, call) {
  const h = teamOf.get(s.home), a = teamOf.get(s.away);
  if (isBye(h)) return { ...s, home_score: 0, away_score: 1, bye: true };
  if (isBye(a)) return { ...s, home_score: 1, away_score: 0, bye: true };
  const own = call?.(s), mine = OUTCOMES.includes(own);
  const c = mine ? own : modelCall(seriesOdds(ratings.get(s.home) ?? 0, ratings.get(s.away) ?? 0));
  return { ...s, home_score: c === "home" ? 2 : c === "tie" ? 1 : 0, away_score: c === "away" ? 2 : c === "tie" ? 1 : 0, ...(mine ? { mine: true } : {}) };
}

// Every series to the end of week 7: played ones as they are, the rest called by the model,
// and weeks PlayOn hasn't posted paired swiss-style (marked `paired`). Divisions inside one
// league (Heroic A/B) pair separately. Weeks posted = series ÷ (teams / 2), so a make-up
// played on another night doesn't count as its own week. `call`: see callSeries.
export function projectSeries(teams, series, ratings, call) {
  const teamOf = new Map(teams.map((t) => [t.id, t]));
  const real = groupStage(series).filter((s) => teamOf.has(s.home) && teamOf.has(s.away));
  let out = real.map((s) => (isPlayed(s) ? { ...s } : { ...callSeries(s, teamOf, ratings, call), projected: true }));
  const divs = [...new Set(teams.map((t) => t.division ?? ""))];
  let next = -1;
  for (const div of divs) {
    const ids = teams.filter((t) => (t.division ?? "") === div).map((t) => t.id);
    const mine = (s) => ids.includes(s.home) && ids.includes(s.away);
    const perWeek = Math.floor(ids.length / 2);
    const posted = perWeek ? Math.round(real.filter(mine).length / perWeek) : REG_WEEKS;
    for (let wk = posted + 1; wk <= REG_WEEKS; wk++) {
      const wins = gameWins(out), met = new Map();
      for (const s of out.filter(mine)) for (const k of [`${s.home}|${s.away}`, `${s.away}|${s.home}`]) met.set(k, (met.get(k) ?? 0) + 1);
      const order = [...ids].sort((a, b) => (wins.get(b) ?? 0) - (wins.get(a) ?? 0) || (ratings.get(b) ?? 0) - (ratings.get(a) ?? 0));
      for (const [home, away] of pairWeek(order, met)) out.push({ ...callSeries({ id: next--, home, away, week: wk }, teamOf, ratings, call), projected: true, paired: true });
    }
  }
  return out;
}

// ---------- tiebreakers ----------

// The rules' table for a tie across a dividing line: `slots` places above the line, the tied
// teams `list` ranked by SoS (best first). Returns who ends above the line, who below, and the
// week 8 matches. `stated` is false when the rules' table doesn't list this case and the
// nearest listed pattern was followed (1 slot with 5+ teams; 4 slots with 7+; 5+ slots).
const LISTED = new Set(["1,2", "1,3", "1,4", "2,3", "2,4+", "3,4", "3,5", "3,6+", "4,5", "4,6"]);
const caseKey = (s, n) => (s === 2 && n >= 4 ? "2,4+" : s === 3 && n >= 6 ? "3,6+" : `${s},${n}`);
export function tiebreakFormat(slots, list, play) {
  const n = list.length, s = slots;
  const stated = LISTED.has(caseKey(s, n));
  if (s <= 0) return { above: [], below: list, matches: [], stated: true };
  if (s >= n) return { above: list, below: [], matches: [], stated: true };
  if (s === 1 && n === 3) {
    const m1 = play(list[1], list[2], 1, "2nd v 3rd on SoS"), m2 = play(list[0], m1.winner, 1, `1st on SoS v the winner`);
    return { above: [m2.winner], below: [m2.loser, m1.loser], matches: [m1, m2], stated };
  }
  if (s === 1 && n >= 4) {
    const m1 = play(list[0], list[3], null, "1st v 4th on SoS"), m2 = play(list[1], list[2], null, "2nd v 3rd on SoS");
    const m3 = play(m1.winner, m2.winner, null, "the two winners");
    return { above: [m3.winner], below: [m3.loser, m1.loser, m2.loser, ...list.slice(4)], matches: [m1, m2, m3], stated };
  }
  if (n - s === 1) {
    const m = play(list[s - 1], list[s], 3, s === 1 ? "" : `${ord(s)} v ${ord(s + 1)} on SoS`);
    return { above: [...list.slice(0, s - 1), m.winner], below: [m.loser], matches: [m], stated };
  }
  if (s === 2) {
    const m1 = play(list[0], list[3], 3, "1st v 4th on SoS"), m2 = play(list[1], list[2], 3, "2nd v 3rd on SoS");
    return { above: [m1.winner, m2.winner], below: [m1.loser, m2.loser, ...list.slice(4)], matches: [m1, m2], stated };
  }
  // 3+ slots, 2+ teams below: the best SoS goes through, the rest follow the smaller case.
  const r = tiebreakFormat(s - 1, list.slice(1), play);
  return { above: [list[0], ...r.above], below: r.below, matches: r.matches, stated: stated && r.stated };
}

// Compares two tied teams: SoS, head to head (games won between them), then record against
// the highest common opponent, then a 1v1 mid, which the model stands in for with the stronger
// rating (resolveTable's `choose` can play it either way).
function comparer(series, wins, sos, ratings) {
  const played = series.filter(isPlayed);
  const vs = (a, b) => played.filter((s) => (s.home === a && s.away === b) || (s.home === b && s.away === a))
    .reduce((x, s) => x + (s.home === a ? s.home_score - s.away_score : s.away_score - s.home_score), 0);
  const opps = (t) => new Set(played.filter((s) => s.home === t || s.away === t).map((s) => (s.home === t ? s.away : s.home)));
  return (a, b) => {
    const sa = sos.get(a) ?? 0, sb = sos.get(b) ?? 0;
    if (sa !== sb) return { d: sb - sa, by: "SoS", detail: `SoS ${Math.max(sa, sb)} v ${Math.min(sa, sb)}` };
    const h = vs(a, b);
    if (h) return { d: -h, by: "head to head", detail: "head to head" };
    const oa = opps(a), ob = opps(b);
    const common = [...oa].filter((o) => ob.has(o) && o !== a && o !== b);
    if (common.length) {
      const top = Math.max(...common.map((o) => wins.get(o) ?? 0));
      const best = common.filter((o) => (wins.get(o) ?? 0) === top);
      const r = best.reduce((x, o) => x + vs(a, o) - vs(b, o), 0);
      if (r) return { d: -r, by: "highest common opponent", detail: "record against the highest common opponent", opp: best };
    }
    const ra = ratings.get(a) ?? 0, rb = ratings.get(b) ?? 0;
    // Everything that came out level on the way here, for the 1v1 tables.
    const games = (x, y) => played.filter((s) => (s.home === x && s.away === y) || (s.home === y && s.away === x))
      .reduce(([w, l], s) => (s.home === x ? [w + s.home_score, l + s.away_score] : [w + s.away_score, l + s.home_score]), [0, 0]);
    const top = common.length ? Math.max(...common.map((o) => wins.get(o) ?? 0)) : null;
    const why = { sos: sa, h2h: oa.has(b) ? games(a, b) : null,
      hco: common.filter((o) => (wins.get(o) ?? 0) === top).map((o) => ({ opp: o, wins: top, a: games(a, o), b: games(b, o) })) };
    return { d: rb - ra || a - b, by: "1v1 mid", detail: "1v1 mid (model: the stronger team)", why };
  };
}

// Final order for one division and the week 8 tiebreakers. `lines`: [{ after, above, below }]
// — places 1..after are above the line. Returns rows in order, the tiebreakers played across
// lines (with predicted winners), the seed-order ties settled without playing and `mids`, every
// 1v1 mid it came down to ({ teams, purpose: "week8" (ranking for a line's tiebreaker, `line`)
// or "seed", places, why: what came out level (SoS, head to head games or null, the highest
// common opponents with each side's games against them), from its first two teams }).
// `choose(key, a, b, bestOf, p)` may name a tiebreaker's winner (key "tb:<pairKey>"; otherwise
// the model's) or a 1v1 mid's (key "mid:…", b null: returning `a` puts it next, chance p).
export function resolveTable(ids, series, ratings, lines, choose) {
  const wins = gameWins(series), sos = new Map(strengthOfSchedule(ids, series).map((r) => [r.id, r.sos ?? 0]));
  const tie = comparer(series, wins, sos, ratings);
  // Teams level on SoS, head to head and the highest common opponent play a 1v1 mid when it
  // decides 1st or a side of a line (upper/lower, playoffs/out); other seed order is a coin flip. `choose` may settle it ("mid:" keys, b null, with the chance as a fifth
  // argument: Possibilities counts every order, each the same); left alone, the model's stronger
  // team goes first. One result per group of teams, whether it ranks them for week 8 or seeds them.
  const midOrder = new Map(), midsFound = [];
  const byId = (x, y) => (x < y ? -1 : 1);
  // Runs of neighbours level all the way to the 1v1: [[from, to)] in `list`.
  const midRuns = (list) => {
    const runs = [];
    for (let k = 0; k < list.length;) {
      let e = k + 1;
      while (e < list.length && tie(list[e - 1], list[e]).by === "1v1 mid") e++;
      if (e - k > 1) runs.push([k, e]);
      k = e;
    }
    return runs;
  };
  const mids = (list) => {
    if (!choose) return list;
    const out = [...list];
    for (const [k, e] of midRuns(list)) {
      const run = list.slice(k, e), id = [...run].sort(byId).join("-");
      if (!midOrder.has(id)) {
        const left = [...run], order = [];
        // Each place in turn: every team left has the same chance of taking it.
        while (left.length > 1) {
          let pick = left.length - 1;
          for (let j = 0; j < left.length - 1; j++) {
            const c = choose(`mid:${id}:${left[j]}`, left[j], null, 0, 1 / (left.length - j));
            if (c === undefined) { pick = 0; break; } // no say: the model's order
            if (c === left[j]) { pick = j; break; }
          }
          order.push(...left.splice(pick, 1));
        }
        midOrder.set(id, [...order, ...left]);
      }
      out.splice(k, e - k, ...midOrder.get(id));
    }
    return out;
  };
  const w = (t) => wins.get(t) ?? 0;
  const order = [...ids].sort((a, b) => w(b) - w(a) || tie(a, b).d);
  // Segments of the table still tied with each other (same wins, not split by a tiebreaker).
  let segs = [];
  for (const t of order) {
    const last = segs.at(-1);
    if (last && w(last[0]) === w(t)) last.push(t); else segs.push([t]);
  }
  const tiebreakers = [];
  const play = (pName) => (a, b, bestOf, note) => {
    const key = `tb:${pairKey(a, b)}`;
    return { a, b, bestOf, note, key, ...callMatch(ratings, a, b, bestOf, choose?.(key, a, b, bestOf)), for: pName };
  };
  for (const line of lines) {
    let start = 0;
    const i = segs.findIndex((seg) => { const hit = start < line.after && start + seg.length > line.after; if (!hit) start += seg.length; return hit; });
    if (i < 0) continue;
    const seg = segs[i], slots = line.after - start;
    const sorted = [...seg].sort((a, b) => tie(a, b).d);
    for (const [k, e] of midRuns(sorted)) midsFound.push({ teams: sorted.slice(k, e).sort(byId), purpose: "week8", line, places: [start + 1, start + seg.length], why: tie(sorted[k], sorted[k + 1]).why });
    const ranked = mids(sorted);
    const r = tiebreakFormat(slots, ranked, play(line.above));
    const byPos = (xs) => mids([...xs].sort((a, b) => tie(a, b).d));
    tiebreakers.push({ line, wins: w(seg[0]), teams: ranked, sosRank: ranked.map((t, k) => ({ id: t, sos: sos.get(t) ?? 0, by: k ? tie(ranked[k - 1], t) : null })),
      slots, places: [start + 1, start + seg.length], matches: r.matches, above: r.above, below: r.below, stated: r.stated });
    segs.splice(i, 1, ...[byPos(r.above), byPos(r.below)].filter((x) => x.length));
  }
  segs = segs.map(mids);
  const final = segs.flat();
  // A seed tie level all the way down is a 1v1 mid only for 1st; any other seed order goes to
  // a coin flip (both counted 50/50 by Possibilities' `choose`). Line ties' 1v1s are above.
  for (const seg of segs) for (const [k, e] of midRuns(seg)) {
    const from = final.indexOf(seg[k]) + 1;
    if (from === 1) midsFound.push({ teams: seg.slice(k, e).sort(byId), purpose: "seed", places: [from, from + e - k - 1], why: tie(seg[k], seg[k + 1]).why });
  }
  // Seed-order ties: neighbours on the same wins whose order no tiebreaker match decided.
  const settled = [];
  for (const seg of segs) for (let k = 1; k < seg.length; k++) {
    const c = tie(seg[k - 1], seg[k]);
    const place = final.indexOf(seg[k - 1]) + 1;
    const last = c.by === "1v1 mid" && place !== 1 ? { by: "coin flip", detail: "coin flip (model: the stronger team)" } : {};
    const by = last.by ?? c.by;
    settled.push({ above: seg[k - 1], below: seg[k], place, ...c, ...last, ...((by === "1v1 mid" || by === "coin flip") && choose && { detail: by }) });
  }
  return {
    rows: final.map((id, k) => ({ id, place: k + 1, wins: w(id), sos: sos.get(id) ?? 0, played: series.filter((s) => isPlayed(s) && (s.home === id || s.away === id)).length })),
    tiebreakers, settled, mids: midsFound,
  };
}

// ---------- the bracket ----------

// Double elimination from seeds (team ids, best first; a missing seed is a bye that sends its
// opponent through). Every match is played the model's way: the higher one-game chance wins.
// Rounds carry the playoff week they're played in, as S47 ran them. `choose(key, a, b)` may
// name a match's winner (key "<match id>:<pairKey>") and, with key "pick", seed 1's opponent
// (3 or 4); otherwise the model's, or with `blank` nobody yet: the match's winner and loser
// are TBD, and so is every slot they feed. `fixed`: no choice, seed 1 plays seed 4 (Heroic/Aegis, where
// the seeds alternate divisions and 1 v 4 pairs A1 with B2).
export const TBD = "tbd";
export function bracket(seeds, ratings, choose, { fixed = false, blank = false } = {}) {
  const n = seeds.length;
  if (n < 4) return null;
  const ms = [];
  const M = (id, side, week, a, b, bestOf, label) => {
    let m;
    if (a === TBD || b === TBD) m = { a, b, winner: TBD, loser: TBD, pending: true };
    else if (a == null || b == null) m = { a, b, winner: a ?? b, loser: null, bye: true };
    else {
      const key = `${id}:${pairKey(a, b)}`;
      m = { a, b, key, ...callMatch(ratings, a, b, bestOf, choose?.(key, a, b, bestOf)) };
      if (blank && !m.mine) m = { ...m, winner: TBD, loser: TBD, p: m.winner === m.model ? m.p : 1 - m.p, open: true };
    }
    ms.push({ id, side, week, bestOf, label, ...m });
    return ms.at(-1);
  };
  const seed = (k) => seeds[k - 1] ?? null;
  // Seed 1 chooses 3 or 4: the model has it take whichever is weaker.
  const r = (id) => ratings.get(id) ?? 0;
  const modelPick = fixed ? 4 : r(seed(4)) > r(seed(3)) ? 3 : 4, own = fixed ? null : choose?.("pick");
  const pick = own === 3 || own === 4 ? own : modelPick;
  const u1 = M("u1", "upper", 1, seed(1), seed(pick), 3, "Upper round 1");
  const u2 = M("u2", "upper", 1, seed(2), seed(pick === 4 ? 3 : 4), 3, "Upper round 1");
  let lbWinner;
  if (n === 4) {
    const l1 = M("l1", "lower", 2, u1.loser, u2.loser, 3, "Lower round 1");
    lbWinner = l1.winner;
    const uf = M("uf", "upper", 2, u1.winner, u2.winner, 3, "Upper final");
    const lf = M("lf", "lower", 3, uf.loser, lbWinner, 3, "Lower final");
    M("gf", "final", 4, uf.winner, lf.winner, 5, "Grand final");
  } else if (n <= 6) {
    const l1 = M("l1", "lower", 1, seed(5), seed(6), 3, "Lower round 1");
    const l2 = M("l2", "lower", 2, u2.loser, l1.winner, 3, "Lower round 2");
    const uf = M("uf", "upper", 3, u1.winner, u2.winner, 3, "Upper final");
    const l3 = M("l3", "lower", 3, u1.loser, l2.winner, 3, "Lower semifinal");
    const lf = M("lf", "lower", 4, uf.loser, l3.winner, 3, "Lower final");
    M("gf", "final", 5, uf.winner, lf.winner, 5, "Grand final");
  } else {
    const l1 = M("l1", "lower", 1, seed(5), seed(8), 3, "Lower round 1");
    const l2 = M("l2", "lower", 1, seed(6), seed(7), 3, "Lower round 1");
    const l3 = M("l3", "lower", 2, u1.loser, l2.winner, 3, "Lower round 2");
    const l4 = M("l4", "lower", 2, u2.loser, l1.winner, 3, "Lower round 2");
    const uf = M("uf", "upper", 3, u1.winner, u2.winner, 3, "Upper final");
    // The loser of seed 1's match meets the 6 v 7 winner, seed 2's loser the 5 v 8 winner, so
    // list 6 v 7 first and each lower round 2 match sits beside the one that feeds it.
    const i1 = ms.indexOf(l1), i2 = ms.indexOf(l2);
    ms[i1] = l2; ms[i2] = l1;
    const l5 = M("l5", "lower", 3, l3.winner, l4.winner, 3, "Lower semifinal");
    const lf = M("lf", "lower", 4, uf.loser, l5.winner, 3, "Lower final");
    M("gf", "final", 5, uf.winner, lf.winner, 5, "Grand final");
  }
  return { matches: ms, pick, modelPick, fixed, champion: ms.at(-1).winner };
}

// ---------- the whole picture ----------

// teams/series: a division's data. split: Heroic/Aegis, one league in divisions A and B (the
// admin on Discord, 2026-10-05): each division's 1st–2nd start Aegis's upper bracket, 3rd–4th
// its lower, 5th–6th Heroic's upper, 7th–8th Heroic's lower. Who meets whom across A and B
// wasn't said: the site alternates the divisions into seeds 1–8 (A1, B1, A2, B2, A3, B3, A4,
// B4), so with the usual shape upper round 1 is A1 v B2 and B1 v A2, lower round 1 A3 v B4 and
// B3 v A4. Those brackets come back in `brackets` (named, with each seed's label).
// `call` picks group-stage results and `choose` tiebreaker and bracket winners (a viewer's own
// picks); whatever they leave open goes the model's way.
// `blank`: bracket matches nobody picked stay open (see bracket).
export function playoffPicture(teams, series, ratings, { split = false, call, choose: own, blank = false } = {}) {
  const projected = projectSeries(teams, series, ratings, call);
  // Played postseason series settle their tiebreaker or bracket match, ahead of anyone's pick.
  const actual = postResults(series);
  // Without picks or results, `choose` stays unset so the model's own wording stays (1v1 mids).
  const choose = own || actual.any ? (k, a, b, ...rest) => actual.winner(k, a, b) ?? own?.(k, a, b, ...rest) : undefined;
  const divs = [...new Set(teams.map((t) => t.division ?? ""))].sort();
  const out = {
    series: projected,
    divisions: divs.map((div) => {
      const ids = teams.filter((t) => (t.division ?? "") === div && !isBye(t)).map((t) => t.id);
      const mine = projected.filter((s) => ids.includes(s.home) || ids.includes(s.away));
      const lines = linesFor(ids.length, split);
      const table = resolveTable(ids, mine, ratings, lines.filter((l) => l.after < ids.length), choose);
      const seeds = table.rows.slice(0, 8).map((r) => r.id);
      for (const tb of table.tiebreakers) for (const m of tb.matches) actual.mark(m);
      return { division: div, lines, ...table, bracket: split ? null : actual.markAll(bracket(seeds, ratings, actual.chooser(seeds, choose), { blank })) };
    }),
  };
  if (split) {
    const [A, B] = out.divisions;
    // Seeds alternate A and B: place from+1 of each, then from+2, ... (a missing one is a bye).
    out.brackets = [["Aegis", 0], ["Heroic", 4]].map(([name, from]) => {
      const seeds = [], labels = new Map();
      for (let k = 0; k < 4; k++) for (const dv of [A, B]) {
        const id = dv?.rows[from + k]?.id ?? null;
        seeds.push(id);
        if (id != null) labels.set(id, `${dv.division}${from + k + 1}`);
      }
      return { name, labels, bracket: actual.markAll(bracket(seeds, ratings, choose, { fixed: true, blank })) };
    });
  }
  return out;
}

// ---------- the postseason as played ----------

// Played postseason series (lib/divisions.js isPostseason) as match results. winner(key, a, b):
// the winner of the match between a and b with that key, when they've played it. The same two
// teams can meet twice (upper round 1, then the grand final): their series go to their matches
// in the order the matches ask, oldest series first, and a key keeps the one it got. mark(m)
// flags a match decided that way (`real`, with the series' score from a's side), markAll a
// bracket's. chooser(seeds, choose): `choose` plus seed 1's pick of opponent from who it played.
function postResults(series) {
  const byPair = new Map();
  for (const s of series.filter((x) => isPostseason(x) && isPlayed(x) && x.home_score !== x.away_score).sort((x, y) => (x.time ?? 0) - (y.time ?? 0))) {
    const k = pairKey(s.home, s.away);
    (byPair.get(k) ?? byPair.set(k, []).get(k)).push(s);
  }
  const taken = new Map(), used = new Map();
  const seriesFor = (key, a, b) => {
    if (taken.has(key)) return taken.get(key);
    if (a == null || b == null || a === TBD || b === TBD || !key || key.startsWith("mid:") || key === "pick") return null;
    const pk = pairKey(a, b), n = used.get(pk) ?? 0, s = byPair.get(pk)?.[n] ?? null;
    if (s) { used.set(pk, n + 1); taken.set(key, s); }
    return s;
  };
  const winnerOf = (s) => (s.home_score > s.away_score ? s.home : s.away);
  const mark = (m) => {
    const s = m.key ? taken.get(m.key) : null;
    if (!s) return m;
    const [x, y] = s.home === m.a ? [s.home_score, s.away_score] : [s.away_score, s.home_score];
    return Object.assign(m, { real: true, mine: false, series_id: s.id, score: [Math.max(x, y), Math.min(x, y)], result: [x, y] });
  };
  return {
    any: byPair.size > 0,
    winner: (key, a, b) => { const s = seriesFor(key, a, b); return s ? winnerOf(s) : undefined; },
    mark,
    markAll: (b) => { if (b) for (const m of b.matches) mark(m); return b; },
    chooser: (seeds, choose) => choose && ((k, ...rest) => {
      if (k !== "pick") return choose(k, ...rest);
      const [s1, s3, s4] = [seeds[0], seeds[2], seeds[3]];
      if (s1 != null && s3 != null && byPair.has(pairKey(s1, s3))) return 3;
      if (s1 != null && s4 != null && byPair.has(pairKey(s1, s4))) return 4;
      return choose(k, ...rest);
    }),
  };
}

// The postseason as the schedule stands: for each postseason series, what it is ({ kind:
// "tiebreak" or "bracket", label, bestOf, bracket name for Heroic/Aegis }), when the bracket
// locks (the first bracket series' start, null until one is scheduled) and each bracket match
// already decided ({ bracket, id, label, winner, teams }). From the model's picture with the real
// results in, so a pairing nobody has played yet is matched to the match the model expects.
export function postseason(teams, series, ratings, { split = false } = {}) {
  const post = series.filter(isPostseason);
  const out = { roles: new Map(), lock: null, decided: [], bracketTeams: new Map() };
  if (!post.length) return out;
  const pic = playoffPicture(teams, series, ratings, { split });
  const tbs = pic.divisions.flatMap((dv) => dv.tiebreakers.flatMap((tb) => tb.matches));
  const brackets = split ? pic.brackets.map((b) => [b.name, b.bracket]) : pic.divisions.map((dv) => ["", dv.bracket]);
  for (const s of post) {
    const pk = pairKey(s.home, s.away);
    const byId = (m) => m.series_id === s.id;
    const tb = tbs.find(byId) ?? tbs.find((m) => !m.real && pairKey(m.a, m.b) === pk);
    if (tb) { out.roles.set(s.id, { kind: "tiebreak", label: "Tiebreaker", bestOf: tb.bestOf ?? 1 }); continue; }
    for (const [name, b] of brackets) {
      const m = b?.matches.find(byId) ?? b?.matches.find((x) => !x.real && x.a !== TBD && x.b !== TBD && x.a != null && x.b != null && pairKey(x.a, x.b) === pk);
      if (m) { out.roles.set(s.id, { kind: "bracket", label: name ? `${name} ${m.label.toLowerCase()}` : m.label, bestOf: m.bestOf, bracket: name, match: m.id }); break; }
    }
    if (!out.roles.has(s.id)) out.roles.set(s.id, { kind: "bracket", label: "Playoffs", bestOf: 3 });
  }
  const starts = post.filter((s) => out.roles.get(s.id)?.kind === "bracket" && s.time).map((s) => s.time);
  out.lock = starts.length ? Math.min(...starts) : null;
  for (const [name, b] of brackets) out.bracketTeams.set(name, new Set((b?.matches ?? []).flatMap((m) => [m.a, m.b]).filter((x) => x != null && x !== TBD)));
  for (const [name, b] of brackets) for (const m of b?.matches ?? []) if (m.real) out.decided.push({ bracket: name, id: m.id, label: m.label, winner: m.winner, teams: [m.a, m.b] });
  return out;
}

// One saved bracket's points: 1 for each decided bracket match whose winner the person picked
// for that match (their pick for it may have had other teams in it, so the match is found by
// its id and, for Heroic/Aegis, by the bracket its picked winner belongs to). Tiebreakers and
// seed 1's pick don't score here (tiebreakers are series picks on the Predictions tab).
// picks: { "<match id>:<pair>": winner team id }. bracketTeams: bracket name -> Set of its teams.
export function bracketPoints(picks, decided, bracketTeams = new Map()) {
  let points = 0;
  for (const m of decided) {
    const teamsHere = bracketTeams.get(m.bracket);
    const mine = Object.entries(picks).filter(([k, w]) => k.startsWith(`${m.id}:`) && (!teamsHere || teamsHere.has(w)));
    if (mine.some(([, w]) => w === m.winner)) points++;
  }
  return { points, of: decided.length };
}

// The dividing lines in a division's table.
// `col` names the line's column on Possibilities: "this line or better", or with `band` just
// the places between the line before and this one (Heroic/Aegis's four brackets).
function linesFor(n, split) {
  return split
    ? [{ after: 2, above: "Aegis upper bracket", below: "Aegis lower bracket", col: "Aegis upper", band: true },
      { after: 4, above: "Aegis lower bracket", below: "Heroic upper bracket", col: "Aegis lower", band: true },
      { after: 6, above: "Heroic upper bracket", below: "Heroic lower bracket", col: "Heroic upper", band: true },
      { after: 8, above: "Heroic lower bracket", below: "out", col: "Heroic lower", band: true }]
    : n >= 8 ? [{ after: 4, above: "upper bracket", below: "lower bracket", col: "Starts upper" }, { after: 8, above: "playoffs", below: "out", col: "Makes playoffs" }]
    : n > 4 ? [{ after: 4, above: "upper bracket", below: "lower bracket", col: "Starts upper" }] : [];
}

// ---------- every possible outcome ----------

// Every way the open series can go (2–0 either way or 1–1), and for each, every way the week 8
// tiebreakers it sets up can go. `weight`: "equal" counts outcomes (each result of a series a
// third, each tiebreaker winner a half); "model" weighs them by the model's odds. Up to
// 3^maxExact outcomes are listed exactly; past that, or while weeks aren't posted (their
// pairings depend on the results), `samples` random outcomes stand in. Ties settle as on the
// rest of the page, except a 1v1 mid, which is counted every way (half each for two teams).
// Per division: dist (team id → chance of each place, 1st first), exact / unposted / open /
// count / total, and when exact, scenarios ({ res: outcome index per open series, w, at: team
// id → Map "place|its week 8 results" → chance within that outcome }).
export function possibilities(teams, series, ratings, { split = false, weight = "equal", samples = 4000, rng = Math.random, maxExact = 9 } = {}) {
  const r = (id) => ratings.get(id) ?? 0;
  const odds = (s) => (weight === "model" ? seriesOdds(r(s.home), r(s.away)) : { home: 1 / 3, tie: 1 / 3, away: 1 / 3 });
  // A division's results never move another's table, so each is worked out on its own
  // (Heroic: 3^6 and 3^5 outcomes rather than 3^11).
  const divisions = [...new Set(teams.map((t) => t.division ?? ""))].sort().map((div) => {
    const dTeams = teams.filter((t) => (t.division ?? "") === div), inDiv = new Set(dTeams.map((t) => t.id));
    const dSeries = groupStage(series).filter((s) => inDiv.has(s.home) && inDiv.has(s.away));
    const teamOf = new Map(dTeams.map((t) => [t.id, t]));
    const open = dSeries.filter((s) => !isPlayed(s) && !isBye(teamOf.get(s.home)) && !isBye(teamOf.get(s.away)));
    const unposted = projectSeries(dTeams, dSeries, ratings).some((s) => s.paired);
    const exact = !unposted && open.length <= maxExact;
    const ids = dTeams.filter((t) => !isBye(t)).map((t) => t.id);
    const lines = linesFor(ids.length, split);
    const dv = { division: div, ids, lines, dist: new Map(ids.map((id) => [id, new Array(ids.length).fill(0)])), scenarios: [], events: new Map(),
      exact, unposted, open: exact ? open : null, count: exact ? 3 ** open.length : samples, total: 0 };
    const run = (call, w, res) => {
      dv.total += w;
      const mine = projectSeries(dTeams, dSeries, ratings, call);
      const at = new Map(), ev = new Map();
      // Every branch of the tiebreakers: a tape of choices (0 = first team, 1 = second), stepped
      // like a binary counter over the choices each run actually made.
      let tape = [];
      for (;;) {
        const used = [];
        let bw = 1;
        const choose = (key, a, b, bestOf, p) => {
          const c = tape[used.length] ?? 0;
          used.push(c);
          // A 1v1 mid comes with its own chance (the model rates teams, not mid players).
          const pa = p ?? (weight === "model" ? bestOfP(gameP(r(a), r(b)), bestOf ?? 1) : 0.5);
          bw *= c ? 1 - pa : pa;
          return c ? b : a;
        };
        const t = resolveTable(ids, mine, ratings, lines.filter((l) => l.after < ids.length), choose);
        // Each week 8 tiebreaker and 1v1 mid this branch comes to, once per branch.
        const seen = new Set();
        const note = (key, info) => {
          if (seen.has(key)) return;
          seen.add(key);
          const e = dv.events.get(key) ?? dv.events.set(key, { key, ...info, p: 0, best: 0 }).get(key);
          e.p += w * bw;
          // Details that differ by outcome (a 1v1's SoS and records): the likeliest one's.
          if (w * bw > e.best) Object.assign(e, info, { best: w * bw });
          if (exact) ev.set(key, (ev.get(key) ?? 0) + bw);
        };
        for (const tb of t.tiebreakers) {
          const teams = [...tb.teams].sort((x, y) => (x < y ? -1 : 1));
          note(`tb|${tb.line.after}|${teams.join("-")}`, { kind: "tb", line: tb.line, teams, wins: tb.wins, slots: tb.slots, places: tb.places });
        }
        for (const m of t.mids) note(`mid|${m.purpose}|${m.line?.after ?? ""}|${m.teams.join("-")}|${m.places.join("-")}`, { kind: "mid", ...m, wins: t.rows.find((r) => r.id === m.teams[0]).wins });
        for (const row of t.rows) {
          dv.dist.get(row.id)[row.place - 1] += w * bw;
          if (exact) {
            // Keyed "place|its own week 8 results" ("w<opp id>" won v, "l<opp id>" lost to).
            const tb = t.tiebreakers.flatMap((x) => x.matches).filter((m) => m.a === row.id || m.b === row.id)
              .map((m) => (m.winner === row.id ? `w${m.loser}` : `l${m.winner}`)).join(",");
            const m = at.get(row.id) ?? new Map(), k = `${row.place}|${tb}`;
            m.set(k, (m.get(k) ?? 0) + bw);
            at.set(row.id, m);
          }
        }
        let k = used.length - 1;
        while (k >= 0 && used[k] === 1) k--;
        if (k < 0) break;
        tape = [...used.slice(0, k), 1];
      }
      if (exact) dv.scenarios.push({ res, w, at, ev });
    };
    if (exact) {
      const idx = new Map(open.map((s, i) => [s.id, i]));
      for (let n = 0; n < 3 ** open.length; n++) {
        const res = open.map((_, i) => Math.floor(n / 3 ** i) % 3);
        const w = open.reduce((x, s, i) => x * odds(s)[OUTCOMES[res[i]]], 1);
        if (w > 0) run((s) => OUTCOMES[res[idx.get(s.id)]], w, res);
      }
    } else {
      for (let n = 0; n < samples; n++) run((s) => {
        const o = odds(s), u = rng();
        return u < o.home ? "home" : u < o.home + o.tie ? "tie" : "away";
      }, 1);
    }
    for (const arr of dv.dist.values()) for (let i = 0; i < arr.length; i++) arr[i] /= dv.total || 1;
    for (const e of dv.events.values()) e.p /= dv.total || 1;
    return dv;
  });
  return { exact: divisions.every((dv) => dv.exact), divisions };
}

// What it takes for `id` to finish `place` (exact possibilities only): the outcomes where it
// can, merged into groups. Each group: `masks` (one per open series; bits 1 = home 2–0, 2 = 1–1,
// 4 = away 2–0, so 7 = any result), `tb` (what week 8 has to do: "" nothing; else its own
// results, "w<id>" beat / "l<id>" lose to, comma-joined, or "*" when it rests on other teams'
// tiebreakers) and `p`, the group's share of everything by the same weighting.
export function pathsTo(dv, id, place, total = 1) {
  return mergePaths(dv, total, (sc) => [...(sc.at.get(id) ?? [])].filter(([k]) => Number(k.split("|")[0]) === place).map(([k, x]) => [k.split("|")[1], x]));
}
// What leads to a week 8 tiebreaker or 1v1 mid (a `dv.events` key): the same groups, `tb` "*"
// where it also rests on how week 8 goes.
export const pathsToEvent = (dv, key, total = 1) => mergePaths(dv, total, (sc) => (sc.ev.has(key) ? [["", sc.ev.get(key)]] : []));

// `pick(scenario)`: [[week 8 results, share of its week 8 branches]] where it happens.
function mergePaths(dv, total, pick) {
  let cubes = [];
  for (const sc of dv.scenarios) {
    const here = pick(sc);
    const q = here.reduce((a, [, x]) => a + x, 0);
    if (q < 1e-9) continue;
    const masks = sc.res.map((o) => 1 << o);
    // Every week 8 branch gets here: week 8 doesn't matter.
    if (q > 1 - 1e-9) { cubes.push({ masks, tb: "", p: sc.w / total }); continue; }
    for (const [k, x] of here) cubes.push({ masks, tb: k || "*", p: (sc.w * x) / total });
  }
  const n = cubes[0]?.masks.length ?? 0;
  // Two groups that differ in one series only merge into one; repeat until nothing merges.
  for (let changed = true; changed;) {
    changed = false;
    for (let i = 0; i < n; i++) {
      const groups = new Map();
      for (const c of cubes) {
        const k = `${c.tb}|${c.masks.map((m, j) => (j === i ? "*" : m)).join(",")}`;
        const g = groups.get(k);
        if (g) { g.masks[i] |= c.masks[i]; g.p += c.p; changed = true; } else groups.set(k, { ...c, masks: [...c.masks] });
      }
      cubes = [...groups.values()];
    }
  }
  return cubes.sort((a, b) => b.p - a.p);
}
