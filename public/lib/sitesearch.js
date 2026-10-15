// Site search: reads a query into names (teams, players, heroes), topics (lib/topics.js) and
// league pages, corrects near-miss spellings, and returns links. Pure, so the results page
// (pages/search.js) and the tests share it. Spec: docs/superpowers/specs/2026-10-06-site-search-design.md.
import { fold, searchIndex } from "./search.js";
import { TOPICS, PAGES, HERO_SHORT, RATE_WORDS, TABLE_WORDS, KIND_WORDS, PER_MINUTE_WORDS, PER_MINUTE_SHORT } from "./topics.js";
import { KINDS, column } from "./tables.js";
import { TEAM_TABS, PLAYER_TABS, HERO_TABS, tabList } from "./pagetabs.js";

// Words that carry no meaning in a question. "with", "vs" and "against" do, so they stay.
export const STOP = new Set(["how", "often", "does", "do", "did", "is", "are", "was", "were", "the", "a", "an", "what", "whats",
  "who", "which", "in", "on", "at", "of", "for", "to", "my", "their", "his", "her", "its", "me", "show", "find", "tell", "much",
  "many", "times", "there", "they", "them", "has", "have", "get", "gets", "when", "as", "and", "or", "by"]);
const RATE = new Set(RATE_WORDS);

// Lowercase words: accents folded, "No Immortals'" and "team's" lose the possessive, "%" reads as "percent".
export function words(q) {
  return fold(q).replace(/['’]s\b/g, "").replace(/['’]/g, "").replace(/%/g, " percent ")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ").filter(Boolean);
}

// Edits between two words, a swap of neighbouring letters counting as one. Stops early (returns
// max + 1) when the lengths alone rule it out.
export function editDistance(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}
// How many typos a word may carry: none up to 3 letters (too easy to confuse), 1 up to 6, 2 beyond.
export const typoLimit = (w) => (w.length <= 3 ? 0 : w.length <= 6 ? 1 : 2);

// "#/x?tab=…&at=…" from a scope { tab, at }.
export function withAt(href, { tab, at } = {}) {
  const p = new URLSearchParams();
  if (tab) p.set("tab", tab);
  if (at) p.set("at", at);
  const s = p.toString();
  return s ? `${href}?${s}` : href;
}
// A league page from its root ("#/scrims", "#/champion"…; "" path = the league's Teams page).
export const leagueHref = (root, { path = "", tab, at } = {}) => withAt(`${root}/${path}`, { tab, at });

const phraseWords = (p) => p.split(" ").filter((x) => !STOP.has(x));
const TOPIC_WORDS = new Set([...TOPICS, ...PAGES].flatMap((t) => t.words.flatMap(phraseWords)));
const TABLE = TABLE_WORDS.map((p) => p.split(" "));
const PER_MIN = PER_MINUTE_WORDS.map(phraseWords);
// Topic phrases with a per-minute phrase inside ("gold per minute"): those words stay theirs.
const TIME_PHRASES = [...TOPICS, ...PAGES].flatMap((t) => t.words.map((p) => phraseWords(p).join(" ")))
  .filter((p) => p.includes(" ") && PER_MIN.some((m) => ` ${p} `.includes(` ${m.join(" ")} `)));

// A topic read per minute: its table's columns swapped for their per-minute ones (lib/tables.js
// `pm`); null when it has none (the topic stays as it is).
function perMinute(t) {
  if (!t.table) return null;
  let swapped = false;
  const table = Object.fromEntries(Object.entries(t.table).map(([kind, cols]) => [kind, cols.map((id) => {
    const pm = column(kind, id)?.pm;
    if (pm) swapped = true;
    return pm ?? id;
  })]));
  // Teams also show their average game length, which the rate divides by.
  if (swapped && table.team) table.team = [...new Set([...table.team, "avg_min"])];
  return swapped ? { ...t, title: `${t.title} per minute`, table } : null;
}
const TABLE_KINDS = ["team", "player", "hero"];
// "teams", "players", "heroes": every one of them in a table (topics with `table` columns).
const SCOPES = ["league", "teams", "players", "heroes", "team", "player", "hero"];
const ALL_OF = { teams: "team", players: "player", heroes: "hero" };
const LISTS = { team: TEAM_TABS, player: PLAYER_TABS, hero: HERO_TABS };
const RECORD = TOPICS.find((t) => t.id === "record");

// A page type's tab label, and every tab of an entity's page as [label, href] (sitelinks).
export const tabLabel = (kind, id, league) => tabList(LISTS[kind], { ad2l: league !== "scrim" }).find(([x]) => x === id)?.[1] ?? null;
// A Steam player on no roster (league "steam") has one page with no tabs.
export const sitelinks = (e) => e.league === "steam" ? [] : tabList(LISTS[e.kind], { ad2l: e.league !== "scrim" }).map(([id, label]) => [label, withAt(e.href, { tab: id })]);

// Per index (it's built once per visit): name runs and the spelling vocabulary.
const prepared = new WeakMap();
function prepare(index, heroes) {
  const hit = prepared.get(index);
  if (hit && hit.heroes === heroes) return hit;
  const short = Object.entries(HERO_SHORT);
  const heroEnts = heroes.map((h) => ({ kind: "hero", name: h, league: null, terms: [h, ...short.filter(([, n]) => n === h).map(([s]) => s)] }));
  const byRun = new Map(), vocab = new Map();
  const addRun = (k, e) => (byRun.get(k) ?? byRun.set(k, []).get(k)).push(e);
  const addWord = (w, from) => (vocab.get(w) ?? vocab.set(w, new Set()).get(w)).add(from);
  for (const e of [...index, ...heroEnts]) for (const t of e.terms) {
    const w = words(t);
    for (const x of w) addWord(x, e.league ?? "*");
    if (!w.length || w.length > 4) continue;
    addRun(w.join(" "), e);
    if (w.length > 1) addRun(w.join(""), e);
  }
  for (const x of [...TOPIC_WORDS, ...RATE, ...TABLE.flat(), ...PER_MIN.flat(), ...Object.keys(PER_MINUTE_SHORT)]) addWord(x, "*");
  const out = { heroes, byRun, vocab, vocabList: [...vocab.keys()] };
  prepared.set(index, out);
  return out;
}

// The closest known word within the typo limit: exact always wins; then fewest edits, then this
// league's names, then topics and heroes, then other leagues. A word that starts a known word
// ("immo") is someone mid-name, not a typo.
function correct(w, { vocab, vocabList }, league) {
  const max = typoLimit(w);
  if (!max || STOP.has(w) || vocab.has(w) || vocabList.some((v) => v.startsWith(w))) return w;
  let best = null;
  for (const v of vocabList) {
    if (STOP.has(v)) continue;
    const d = editDistance(w, v, max);
    if (d > max) continue;
    const from = vocab.get(v), pri = from.has(league) ? 0 : from.has("*") ? 1 : 2;
    if (!best || d < best.d || (d === best.d && (pri < best.pri || (pri === best.pri && v < best.v)))) best = { v, d, pri };
  }
  return best?.v ?? w;
}

// Score a topic or page against the words left after names: a phrase is worth 2, a word 1.
// `used` collects the positions it matched.
function score(item, rest, used) {
  let s = 0;
  for (const p of item.words) {
    const ps = phraseWords(p);
    if (!ps.length) continue;
    for (let i = 0; i + ps.length <= rest.length; i++) {
      if (!ps.every((x, k) => rest[i + k] === x)) continue;
      s += ps.length > 1 ? 2 : 1;
      ps.forEach((_, k) => used.add(i + k));
      break;
    }
  }
  return s;
}

const entKey = (e) => `${e.kind}|${e.href}`;
const dedupe = (es) => { const seen = new Set(); return es.filter((e) => !seen.has(entKey(e)) && seen.add(entKey(e))); };

// index: lib/search.js buildSearchIndex output (every league). heroes: hero names. league: the
// league searched from (index `league` key, "scrim", or null for All). heroHref: hero name → its
// page in that league. exact: no spelling correction.
// Returns { corrected, direct, cards, names, pages, table, empty }:
//   direct: [{ entity, topic, href, tab }]  a name's page at a topic's section
//   cards:  [{ topic, scopes }]             topics with no matching name, and where they live
//   names:  entities (teams, players, heroes), full-name matches first
//   pages:  PAGES entries whose words matched
//   table:  { kind, cols, sort } when the query asks for every team, player or hero (TABLE_WORDS):
//           the topics' columns for that kind, or its first preset; else null
export function siteSearch({ index, heroes = [], query, league = null, heroHref = () => null, exact = false }) {
  const none = { corrected: null, direct: [], cards: [], names: [], pages: [], table: null, empty: true };
  const raw = words(query ?? "");
  if (!raw.length) return none;
  const prep = prepare(index, heroes);
  const w = exact ? raw : raw.map((x) => correct(x, prep, league));
  const corrected = w.some((x, i) => x !== raw[i]) ? w.join(" ") : null;
  const ent = (e) => (e.kind === "hero" ? { ...e, league, href: heroHref(e.name) } : e);

  // Names: the longest run of up to 4 words that is someone's whole name. One word that is also
  // a topic word ("radiant") is read as the topic; the team still shows under names.
  const claimed = new Set(), found = [];
  for (let i = 0; i < w.length;) {
    let hit = null;
    for (let len = Math.min(4, w.length - i); len >= 1 && !hit; len--) {
      const run = w.slice(i, i + len);
      if (run.every((x) => STOP.has(x))) continue;
      if (len === 1 && (TOPIC_WORDS.has(run[0]) || RATE.has(run[0]))) continue;
      const es = prep.byRun.get(run.join(" ")) ?? (len > 1 ? prep.byRun.get(run.join("")) : null);
      if (es) hit = { len, es };
    }
    if (!hit) { i++; continue; }
    for (let k = i; k < i + hit.len; k++) claimed.add(k);
    found.push(...hit.es.map(ent));
    i += hit.len;
  }
  const full = dedupe(found).sort((a, b) => (b.league === league) - (a.league === league));

  // Topics and pages from what's left, once table words ("compare", "all teams") are set aside;
  // with one, a kind word ("players") says which rows and is set aside too.
  let rest = [];
  const rate = [];
  w.forEach((x, i) => { if (!claimed.has(i) && !STOP.has(x)) (RATE.has(x) ? rate : rest).push(x); });
  // "per minute" (or "kpm"): the words are set aside unless a topic owns the phrase ("gold per minute").
  let perMin = false;
  rest = rest.flatMap((x) => (PER_MINUTE_SHORT[x] ? ((perMin = true), [PER_MINUTE_SHORT[x]]) : [x]));
  const owned = TIME_PHRASES.some((p) => rest.join(" ").includes(p));
  for (const p of PER_MIN) for (let i = 0; i + p.length <= rest.length; i++) {
    if (!p.every((x, k) => rest[i + k] === x)) continue;
    perMin = true;
    if (owned) break;
    rest = [...rest.slice(0, i), ...rest.slice(i + p.length)];
    i--;
  }
  let wantsTable = false, kindAsked = null;
  for (const p of TABLE) for (let i = 0; i + p.length <= rest.length; i++) {
    if (!p.every((x, k) => rest[i + k] === x)) continue;
    kindAsked ??= p.length > 1 ? KIND_WORDS[p.at(-1)] ?? null : null;
    rest = [...rest.slice(0, i), ...rest.slice(i + p.length)];
    wantsTable = true;
    i--;
  }
  if (wantsTable) rest = rest.filter((x) => (KIND_WORDS[x] ? ((kindAsked ??= KIND_WORDS[x]), false) : true));
  const used = new Set();
  const rank = (list, keep) => {
    const scored = list.map((t) => ({ t, s: score(t, rest, used) + (t.rate && rate.length ? 0.5 : 0) }))
      .filter((x) => x.s >= 1).sort((a, b) => b.s - a.s);
    return scored.filter((x) => x.s >= scored[0]?.s / 2).slice(0, keep).map((x) => x.t);
  };
  let topics = rank(TOPICS, 5);
  if (perMin) topics = topics.map((t) => perMinute(t) ?? t);
  if (!topics.length && rate.length) topics = [RECORD];
  const pages = rank(PAGES, 3);

  // Part of a name: the existing header search over the whole query, then over each leftover
  // word of 4+ letters; heroes whose name contains a leftover word of 3+.
  const partial = [];
  const meaningful = w.filter((x) => !STOP.has(x));
  partial.push(...searchIndex(index, meaningful.join(" "), 10));
  rest.forEach((x, i) => {
    if (used.has(i)) return;
    const hs = x.length >= 4 ? searchIndex(index, x, 5) : [];
    const hh = x.length >= 3 ? prep.heroes.filter((h) => fold(h).includes(x)).slice(0, 5) : [];
    if (!hs.length && !hh.length) return;
    used.add(i);
    partial.push(...hs, ...hh.map((h) => ent({ kind: "hero", name: h, terms: [h] })));
  });
  const names = dedupe([...full, ...partial]);

  // Direct links: each whole-name match at each topic its kind of page has.
  const direct = [], covered = new Set();
  for (const e of full) for (const t of topics) {
    const s = e.league !== "steam" && t[e.kind];
    if (!s) continue;
    covered.add(t.id);
    direct.push({ entity: e, topic: t, href: withAt(e.href, s), tab: tabLabel(e.kind, s.tab, e.league) });
  }
  const cards = topics.filter((t) => !covered.has(t.id)).map((t) => ({ topic: t, scopes: SCOPES.filter((s) => (ALL_OF[s] ? t.table?.[ALL_OF[s]] : t[s])) }));
  // A table: the kind asked for, else the first the topics have columns for; their columns in
  // order, or the kind's first preset.
  let table = null;
  if (wantsTable && !full.length) {
    const kind = kindAsked ?? TABLE_KINDS.find((k) => topics.some((t) => t.table?.[k])) ?? "team";
    const cols = [...new Set(topics.flatMap((t) => t.table?.[kind] ?? []))];
    const preset = KINDS[kind].presets[0].cols;
    table = { kind, cols: cols.length ? cols : preset, sort: cols[0] ?? preset[1] };
  }

  // Empty when nothing came up, or when more than half the meaningful words matched nothing.
  const unmatched = rest.filter((_, i) => !used.has(i)).length;
  const total = meaningful.length;
  const empty = !table && ((!direct.length && !cards.length && !names.length && !pages.length) || unmatched * 2 > total);
  return empty ? { ...none, corrected } : { corrected, direct, cards, names, pages, table, empty: false };
}
