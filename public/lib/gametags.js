// Game tags: short chips on game lists and the game page (Stomp, Comeback / Throw, Rampage /
// Ultra kill, Long / Short game). Stomp, comeback and throw need the gold timeline (replays);
// multi-kills need parsed combat data; length works for every game.
import { swings, BIG_LEAD } from "./timeline.js";

// Same as core.js dur; lib/ stays free of core.js so it runs in the Node tests.
const dur = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

// Stomp: the winner led by this much at some point and the loser was never ahead at any minute.
// S48, all divisions: 17% of games with a gold timeline (15k would be 22%; allowing the loser a
// 2k lead, 57%, since most losers lead a little early). Comebacks are 20%.
export const STOMP_LEAD = 20000;
// Long / Short: the league's longest and shortest tenth of games; needs this many games first.
const LENGTH_SHARE = 0.1, LENGTH_MIN_GAMES = 10;

const ctxCache = new WeakMap();
// The league's length cut-offs, from every game with a duration.
export function tagContext(matches) {
  if (ctxCache.has(matches)) return ctxCache.get(matches);
  const d = matches.map((m) => m.duration_sec).filter((x) => x > 0).sort((a, b) => a - b);
  const ctx = d.length >= LENGTH_MIN_GAMES
    ? { short: d[Math.floor((d.length - 1) * LENGTH_SHARE)], long: d[Math.ceil((d.length - 1) * (1 - LENGTH_SHARE))] }
    : { short: null, long: null };
  ctxCache.set(matches, ctx);
  return ctx;
}

const k = (v) => `${(v / 1000).toFixed(1)}k`;

// Tags for one game. side ("a" / "b") reads the swing from that team: Comeback when they won
// from behind, Throw when they lost from ahead. Without a side, only the winner's Comeback.
export function gameTags(m, ctx, side = null) {
  const tags = [];
  const s = swings(m);
  if (s) {
    const winner = m.winner, loser = s.loser;
    if (s.lead[winner].max >= STOMP_LEAD && s.lead[loser].max <= 0) {
      tags.push({ id: "stomp", label: "Stomp", tip: `Led by ${k(s.lead[winner].max)} and never behind` });
    } else if (s.thrown >= BIG_LEAD) {
      const thrown = side && side === loser;
      tags.push(thrown
        ? { id: "throw", label: "Throw", tip: `Led by ${k(s.thrown)} at ${s.thrown_minute}' and lost` }
        : { id: "comeback", label: "Comeback", tip: `Won after trailing by ${k(s.thrown)} at ${s.thrown_minute}'` });
    }
  }
  const multi = (i) => (m.players ?? []).filter((p) => (p.multi?.[i] ?? 0) > 0);
  const ramp = multi(3), ultra = ramp.length ? [] : multi(2);
  const who = (ps) => ps.map((p) => `${p.hero} (${p.name})`).join(", ");
  if (ramp.length) tags.push({ id: "rampage", label: "Rampage", tip: `Rampage: ${who(ramp)}` });
  else if (ultra.length) tags.push({ id: "ultra", label: "Ultra kill", tip: `Ultra kill: ${who(ultra)}` });
  if (ctx && m.duration_sec > 0) {
    if (ctx.long != null && m.duration_sec >= ctx.long) tags.push({ id: "long", label: "Long game", tip: `${dur(m.duration_sec)}: among the league's longest tenth (${dur(ctx.long)}+)` });
    else if (ctx.short != null && m.duration_sec <= ctx.short) tags.push({ id: "short", label: "Short game", tip: `${dur(m.duration_sec)}: among the league's shortest tenth (${dur(ctx.short)} or less)` });
  }
  return tags;
}

const escAttr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
export const tagsHtml = (tags) => (tags.length
  ? `<span class="gtags">${tags.map((t) => `<span class="gtag gtag-${t.id}" title="${escAttr(t.tip)}">${t.label}</span>`).join("")}</span>`
  : "");

// Row fields for a sortable table: `tags` (labels, for sorting) and `tag_list` (for the chips).
export const tagCells = (tags) => ({ tags: tags.map((t) => t.label).join(", "), tag_list: tags });
