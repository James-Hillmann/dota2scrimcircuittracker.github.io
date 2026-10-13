// Build public/data/<division>.json: one AD2L division (default Champion) with
// teams, series results from PlayOn, and every ticketed game's stats from OpenDota.
//
// Sources (all public, no keys):
//   dota.playon.gg/seasons/{id}   -> the division's teams and PlayOn match (series) links
//   dota.playon.gg/matches/{id}   -> series time, home/away team, series score
//   dota.playon.gg/teams/{id}     -> roster: player name + 32-bit account id + smurfs
//   OpenDota /players/{id}        -> current rank (PlayOn's roster rank is the fallback)
//   OpenDota /players/{id}/matches?lobby_type=1  -> candidate practice-lobby games
//   OpenDota /matches/{id}        -> full stats; `leagueid` says if it's this AD2L season
// OpenDota has no per-league match list for amateur leagues (S48's league returns 0), and
// its league filter on player matches doesn't work, so games are found through the
// rosters. A game counts if it's tagged with the league AND both sides are rosters from
// this division (3+ of 5 players), which also drops cross-division games.
//
// Usage: npm run sync -- <division>     (a key from public/lib/divisions.js: warrior, heroic, ad2l, ...)
//        npm run sync:all                (every division; scripts/sync/sync-all.js)
// The PlayOn season id, Dota league id and output file come from public/lib/divisions.js;
// --season, --league and --out override them.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildingsFrom } from "../../public/lib/towermap.js";
import { deathsFrom } from "../../public/lib/deathmap.js";
import { itemsFrom } from "../../public/lib/items.js";
import { laneFields } from "./lane-fields.js";
import { timingFields } from "./timing-fields.js";
import { combatFields, gameExtras, firstDeathOf, detailOf, detailName, detailJson } from "./combat-fields.js";
import { leagueJson } from "./league-json.js";
import { wardLog, visionMap, visionFields } from "./vision.js";
import { SEASON, DIVISIONS, division } from "../../public/lib/divisions.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CACHE = path.join(ROOT, ".cache");
const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : dflt; };
const DIV = division(arg("division") ?? "ad2l");
if (!DIV) throw new Error(`Unknown division "${arg("division")}". One of: ${DIVISIONS.map((d) => d.key).join(", ")}.`);
const OUT = path.join(ROOT, "public", "data", path.basename(arg("out", `${DIV.key}.json`)));
const SEASON_ID = Number(arg("season", DIV.season)); // PlayOn season, e.g. "S48 Champion League"
const LEAGUE_ID = Number(arg("league", SEASON.dotaLeague)); // Dota league, e.g. "AD2L Season 48"
// --series latest (the series played in the last 2 days) or --series <id>,<id>: only those
// series' games, found through the two teams' recent practice lobbies, merged into the existing
// file and written after each series. No pubs, draft history or hero totals. For league night.
const ONLY = arg("series");
const UA = "dota-scrim-league/0.1 (AD2L fan stats page; contact: jonahbyu@gmail.com)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const decode = (s) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").trim();

// ---------- polite fetchers with on-disk caches ----------

let lastPlayOn = 0;
async function playon(p, ttlHours) {
  const file = path.join(CACHE, "playon", p.replace(/\W+/g, "_") + ".html");
  if (existsSync(file) && ttlHours > 0) {
    const { mtimeMs } = await import("node:fs").then((fs) => fs.statSync(file));
    if (Date.now() - mtimeMs < ttlHours * 3600e3) return readFile(file, "utf8");
  }
  await sleep(Math.max(0, 1200 - (Date.now() - lastPlayOn)));
  lastPlayOn = Date.now();
  const res = await fetch(`https://dota.playon.gg${p}`, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`PlayOn ${p}: HTTP ${res.status}`);
  const html = await res.text();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, html);
  return html;
}

let lastOD = 0, odCalls = 0;
async function opendota(p, method = "GET", tries = 6) {
  // 429s: wait what OpenDota asks (Retry-After) or 30s, 60s, ... up to 2 min, six times
  // (about 9 minutes in all). The scheduled sync runs on shared GitHub runners, whose IPs
  // other OpenDota users share, so a burst of 429s there isn't this script's own pace.
  for (let attempt = 0; attempt < tries; attempt++) {
    await sleep(Math.max(0, 1100 - (Date.now() - lastOD))); // free tier: 60/min
    lastOD = Date.now();
    odCalls++;
    // A dropped connection (ECONNRESET, "terminated") is a hiccup like a 5xx: retry it too.
    const res = await fetch(`https://api.opendota.com/api${p}`, { method, headers: { "user-agent": UA } })
      .catch((e) => { if (attempt === tries - 1) throw e; return { status: 599, error: e }; });
    if (res.status === 429) {
      const after = Number(res.headers.get("retry-after"));
      const wait = Math.min(120e3, after > 0 ? after * 1000 : 30e3 * (attempt + 1));
      console.log(`  OpenDota rate limit on ${p}; waiting ${Math.round(wait / 1000)}s`);
      await sleep(wait);
      continue;
    }
    // 5xx: OpenDota's own hiccups, gone on a retry. One used to fail the whole division.
    if (res.status >= 500 && attempt < tries - 1) {
      const wait = 10e3 * (attempt + 1);
      console.log(`  OpenDota HTTP ${res.status} on ${p}; retrying in ${wait / 1000}s`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`OpenDota ${p}: HTTP ${res.status}`);
    return res.json();
  }
  throw new Error(`OpenDota ${p}: rate limited`);
}

// Match details never change once OpenDota has parsed the replay: cache those forever.
// Before that the response has no per-minute, ward or kill-log data, so an unparsed copy
// is refetched every run (and a parse requested) instead of being frozen in the cache.
const isParsed = (d) => Array.isArray(d.radiant_gold_adv) || d.od_data?.has_parsed === true;
async function matchDetail(id) {
  const file = path.join(CACHE, "opendota", `match_${id}.json`);
  if (existsSync(file)) {
    const cached = JSON.parse(await readFile(file, "utf8"));
    if (isParsed(cached)) return cached;
  }
  const d = await opendota(`/matches/${id}`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(d));
  if (!isParsed(d)) {
    console.log(`  match ${id} not parsed by OpenDota yet; requested a parse, rerun later`);
    await opendota(`/request/${id}`, "POST").catch((e) => console.log(`  parse request failed: ${e.message}`));
  }
  return d;
}

// ---------- PlayOn parsing ----------

function parseSeason(html) {
  const title = decode(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "");
  const teams = new Map();
  for (const m of html.matchAll(/href="\/teams\/(\d+)"[^>]*>([^<]+)<\/a>/g)) teams.set(Number(m[1]), decode(m[2]));
  const series = [...new Set([...html.matchAll(/href="\/matches\/(\d+)"/g)].map((m) => Number(m[1])))];
  // Seasons split into divisions have one Participants table per division, headed
  // "Division A" etc. (Champion has none). Other tables share the "Division" heading but
  // aren't divisions: "Ready To Be Scheduled" (Challenger's whole field) and the refund
  // tables ("Division Refund", "Division Refund - Contact Admins"), which hold bye
  // placeholders and withdrawn teams, so those are dropped. Only a single letter is a division.
  const division = new Map(), refund = new Set();
  for (const table of html.split("<table").slice(1)) {
    const head = decode(table.match(/<th colspan=3>\s*Division\s+([^<]+?)\s*<\/th>/)?.[1] ?? "");
    for (const m of table.matchAll(/href="\/teams\/(\d+)"/g)) {
      if (/^Refund\b/i.test(head)) refund.add(Number(m[1]));
      else if (/^[A-Z]$/.test(head)) division.set(Number(m[1]), head);
    }
  }
  for (const id of refund) teams.delete(id);
  return { title, teams, series, division };
}

function parseSeries(html, id) {
  const epoch = Number(html.match(/data-epoch-offset='(\d+)'/)?.[1] ?? 0);
  const res = html.slice(html.indexOf("<h4>Results:</h4>"));
  const [home, away] = [...res.matchAll(/<h3><a href="\/teams\/(\d+)">([^<]*)<\/a><\/h3>/g)].slice(0, 2).map((m) => Number(m[1]));
  const scores = [...res.matchAll(/<h4>\s*(\d*)\s*<\/h4>/g)].slice(0, 2).map((m) => (m[1] === "" ? null : Number(m[1])));
  return { id, time: epoch || null, home, away, home_score: scores[0] ?? null, away_score: scores[1] ?? null };
}

// Same rules as the drafter's ad2l.py: split on the MAIN roster <li>; nested
// "-alt" entries are that player's smurfs, merged in, not extra people.
function parseRoster(html) {
  const players = [];
  for (const block of html.split('<li class="rosterNameContainer">').slice(1)) {
    const altAt = block.indexOf('<li class="rosterNameContainer rosterNameContainer-alt">');
    const main = altAt >= 0 ? block.slice(0, altAt) : block;
    const acct = main.match(/dotabuff\.com\/players\/(\d+)/);
    if (!acct) continue;
    // PlayOn's own player page (/players/<PlayOn id>) is the link around the name.
    const own = main.match(/href="\/players\/(\d+)"[^>]*>([^<]+)<\/a>/);
    const name = decode(own?.[2] ?? `account ${acct[1]}`);
    const alts = altAt >= 0 ? [...block.slice(altAt).matchAll(/dotabuff\.com\/players\/(\d+)/g)].map((m) => Number(m[1])) : [];
    const rank = main.match(/data-rank="(\d+)"/); // same 0-80 scale as OpenDota rank_tier
    players.push({ name, account_ids: [Number(acct[1]), ...new Set(alts)], playon_id: own ? Number(own[1]) : null, captain: main.includes("(Captain)"), rank_tier: rank ? Number(rank[1]) : null });
  }
  return players;
}

// ---------- build ----------

console.log(`PlayOn season ${SEASON_ID}, Dota league ${LEAGUE_ID}`);
const season = parseSeason(await playon(`/seasons/${SEASON_ID}`, 6));
console.log(`  ${season.title}: ${season.teams.size} teams, ${season.series.length} series`);

const teams = [];
for (const [id, name] of season.teams) {
  const roster = parseRoster(await playon(`/teams/${id}`, 72));
  teams.push({ id, name, ...(season.division.has(id) && { division: season.division.get(id) }), players: roster });
}
// Current rank from OpenDota (the main account's Steam profile); PlayOn's lags, often by a
// medal or more. Kept PlayOn's when OpenDota has none or the call fails. Cached 11 hours so
// the twice-daily runs each refresh it but Thursday night's back-to-back runs don't.
async function odRank(acct) {
  const file = path.join(CACHE, "opendota", `player_${acct}.json`);
  if (existsSync(file)) {
    const { mtimeMs } = await import("node:fs").then((fs) => fs.statSync(file));
    if (Date.now() - mtimeMs < 11 * 3600e3) return JSON.parse(await readFile(file, "utf8")).rank_tier ?? null;
  }
  const p = await opendota(`/players/${acct}`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify({ rank_tier: p.rank_tier ?? null }));
  return p.rank_tier ?? null;
}
let rankChanged = 0;
for (const t of teams) for (const p of t.players) {
  const r = await odRank(p.account_ids[0]).catch((e) => (console.log(`  rank for ${p.name}: ${e.message}`), null));
  if (r != null && r !== p.rank_tier) { rankChanged++; p.rank_tier = r; }
}
console.log(`  ranks: ${rankChanged} differ from PlayOn, OpenDota's used`);
const owner = new Map(); // account id -> { team, player name }
// `main` is the player's main account: smurf games count for the same person.
for (const t of teams) for (const p of t.players) for (const a of p.account_ids) owner.set(a, { team: t.id, name: p.name, main: p.account_ids[0], rank_tier: p.rank_tier });
console.log(`  rosters: ${teams.reduce((s, t) => s + t.players.length, 0)} players, ${owner.size} accounts incl. smurfs`);

const series = [];
for (const id of season.series) {
  // Played series don't change; unplayed ones are re-checked.
  const s = parseSeries(await playon(`/matches/${id}`, 6), id);
  // "TBD / Bye vs TBD / Bye" placeholders (no team links) aren't series between two teams.
  if (!season.teams.has(s.home) || !season.teams.has(s.away)) { console.log(`  skipping series ${id}: not two division teams`); continue; }
  // A bye is a 1–0 forfeit win, but PlayOn shows 0–0 until an admin enters it, which can take
  // days (the team drops a point meanwhile). Once its night has passed, score it 1–0 ourselves;
  // a score PlayOn does enter is kept as it is.
  const isBye = (t) => /\bbye week\b/i.test(season.teams.get(t) ?? "");
  if (s.time && s.time < Date.now() / 1000 && !s.home_score && !s.away_score && isBye(s.home) !== isBye(s.away)) {
    [s.home_score, s.away_score] = isBye(s.home) ? [0, 1] : [1, 0];
    console.log(`  series ${id}: bye with no score on PlayOn, counted 1–0`);
  }
  series.push(s);
}
series.sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
const firstSeries = series.find((s) => s.time)?.time ?? Math.floor(Date.now() / 1000) - 90 * 86400;
const days = Math.ceil((Date.now() / 1000 - firstSeries) / 86400) + 10;
console.log(`  series: ${series.filter((s) => (s.home_score ?? 0) + (s.away_score ?? 0) > 0).length} played of ${series.length}; searching the last ${days} days`);

// One call per rostered account (smurfs included) for every game in the last HISTORY_DAYS:
// practice lobbies (lobby_type 1) since the season began are candidate league games; public
// and ranked games (0, 7) in the last PUB_DAYS are that player's recent pubs, used for pub form
// and draft predictions. Every game is also the draft model's history (lib/cmdraft.js): its
// records reach back about 390 days (90-day half-life, cut below 5%), and farm and lane say
// what position each game was played at. Same one call; the extra fields are projected.
const PUB_DAYS = 30;
const HISTORY_DAYS = 390;
const PROJECT = ["hero_id", "kills", "deaths", "assists", "last_hits", "gold_per_min", "hero_healing", "lane_role", "average_rank"].map((f) => `&project=${f}`).join("");
// Each account's list is kept on disk for 2 hours, so a run that dies partway (OpenDota errors)
// and is run again picks up where it stopped instead of walking every account again.
async function playerMatches(acct, date) {
  const file = path.join(CACHE, "opendota", `matches_${acct}.json`);
  if (existsSync(file) && Date.now() - statSync(file).mtimeMs < 2 * 3600e3) {
    const kept = JSON.parse(await readFile(file, "utf8"));
    if (kept.date >= date) return kept.rows;
  }
  const rows = await opendota(`/players/${acct}/matches?date=${date}${PROJECT}`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify({ date, rows }));
  return rows;
}
const candidates = new Set();
const pubRows = new Map(); // main account -> rows
const historyRows = new Map(); // main account -> rows (smurfs merged), for the draft model
for (const [acct, o] of ONLY ? [] : owner) {
  // OpenDota can 500 on a long history for a busy account: fall back to the season window (its
  // league games and pubs still count; the draft history is shorter this run), then to skipping it.
  const rows = await playerMatches(acct, Math.max(days, PUB_DAYS, HISTORY_DAYS))
    .catch((e) => (console.log(`  ${acct}: ${e.message}; retrying with the last ${Math.max(days, PUB_DAYS)} days`),
      playerMatches(acct, Math.max(days, PUB_DAYS))))
    .catch((e) => (console.log(`  ${acct}: ${e.message}; skipped this run`), []));
  const hist = historyRows.get(o.main) ?? historyRows.set(o.main, []).get(o.main);
  for (const r of rows) if (r.hero_id && r.start_time) hist.push(r);
  for (const r of rows) {
    if (r.lobby_type === 1 && r.start_time < Date.now() / 1000 - days * 86400) continue;
    if (r.lobby_type === 1) candidates.add(r.match_id);
    else if ((r.lobby_type === 0 || r.lobby_type === 7) && r.start_time > Date.now() / 1000 - PUB_DAYS * 86400 && r.duration >= 600) {
      const list = pubRows.get(o.main) ?? [];
      list.push(r);
      pubRows.set(o.main, list);
    }
  }
}
console.log(`  ${candidates.size} candidate practice-lobby games; pubs for ${pubRows.size} players`);

// All-time hero totals per player (main account, smurfs merged): games and wins on each hero in
// pubs (lobby types 0 and 7) and in practice lobbies (1: every amateur league game, AD2L or
// not, plus scrims and inhouses; OpenDota can't tell those apart per player). Three calls per
// account, cached TOTALS_DAYS; at most TOTALS_PER_RUN accounts are refreshed a run (missing
// first, then oldest) so a run stays about a minute longer, and the rest use their cached copy.
// A failed call leaves a .tried stamp, and that account waits TOTALS_RETRY_DAYS before trying
// again, so accounts OpenDota keeps refusing can't take every slot on every run.
const TOTALS_DAYS = 7, TOTALS_RETRY_DAYS = 1, TOTALS_PER_RUN = Number(process.env.TOTALS_PER_RUN) || 18, TOTAL_LOBBIES = [0, 7, 1];
const totalsFile = (acct, lobby) => path.join(CACHE, "opendota", `heroes_${acct}_${lobby}.json`);
const triedFile = (acct, lobby) => `${totalsFile(acct, lobby)}.tried`;
const ageOf = (file) => (existsSync(file) ? Date.now() - statSync(file).mtimeMs : Infinity);
const totalsAge = new Map();
for (const acct of owner.keys()) {
  if (TOTAL_LOBBIES.some((l) => ageOf(triedFile(acct, l)) < TOTALS_RETRY_DAYS * 86400e3)) continue;
  totalsAge.set(acct, Math.max(...TOTAL_LOBBIES.map((l) => ageOf(totalsFile(acct, l)))));
}
const refresh = ONLY ? [] : [...totalsAge].filter(([, age]) => age > TOTALS_DAYS * 86400e3).sort((a, b) => b[1] - a[1]).slice(0, TOTALS_PER_RUN).map(([a]) => a);
for (const acct of refresh) {
  for (const lobby of TOTAL_LOBBIES) {
    const rows = await opendota(`/players/${acct}/heroes?lobby_type=${lobby}`).catch((e) => (console.log(`  hero totals ${acct}/${lobby}: ${e.message}`), null));
    if (!rows) {
      await mkdir(path.dirname(triedFile(acct, lobby)), { recursive: true });
      await writeFile(triedFile(acct, lobby), "");
      continue;
    }
    if (existsSync(triedFile(acct, lobby))) await rm(triedFile(acct, lobby));
    await mkdir(path.dirname(totalsFile(acct, lobby)), { recursive: true });
    await writeFile(totalsFile(acct, lobby), JSON.stringify(rows.filter((r) => r.games > 0).map((r) => [Number(r.hero_id), r.games, r.win])));
  }
}
const totals = new Map(); // main account -> { p: Map(hero id -> [games, wins]), l: Map }
for (const [acct, o] of owner) {
  const t = totals.get(o.main) ?? totals.set(o.main, { p: new Map(), l: new Map() }).get(o.main);
  for (const lobby of TOTAL_LOBBIES) {
    const file = totalsFile(acct, lobby);
    if (!existsSync(file)) continue;
    const into = lobby === 1 ? t.l : t.p;
    for (const [id, g, w] of JSON.parse(await readFile(file, "utf8"))) { const x = into.get(id) ?? [0, 0]; into.set(id, [x[0] + g, x[1] + w]); }
  }
}
const haveTotals = [...totals.values()].filter((t) => t.p.size || t.l.size).length;
console.log(`  all-time hero totals: ${refresh.length} accounts refreshed, ${haveTotals} of ${totals.size} players have them`);

const heroList = await opendota("/heroes");
const heroes = Object.fromEntries(heroList.map((h) => [h.id, h.localized_name === "Ring Master" ? "Ringmaster" : h.localized_name]));
const heroKeys = Object.fromEntries(heroList.map((h) => [h.id, h.name])); // "npc_dota_hero_…", as the death logs name killers
// Each hero's ranked picks and wins per bracket (Herald 1 … Immortal 8): the draft model's hero
// baselines, which a player's record on a hero is shrunk toward.
const heroStats = ONLY ? [] : await opendota("/heroStats");

const games = [], detail = {};
if (ONLY) await bySeries();
for (const id of [...candidates].sort()) {
  // A match OpenDota won't serve this run is left out (and its parse retried next run), not the
  // whole division. Its cached copy, if any, still counts.
  const g = await buildGame(id).catch((e) => (console.log(`  match ${id}: ${e.message}; left out this run`), null));
  if (g) games.push(g);
}

// One game's entry, or null if it isn't this division's league game. Its purchases and skill
// builds go into `detail`.
async function buildGame(id) {
  const d = await matchDetail(id);
  if (d.leagueid !== LEAGUE_ID || !Array.isArray(d.players) || d.players.length !== 10) return null;
  // A remake: lobby made, game never played; every player 0/0/0.
  if (d.players.every((p) => !p.kills && !p.deaths && !p.assists)) return null;
  // Which division team is each side? Majority of its 5 accounts.
  const sideTeam = (radiant) => {
    const counts = {};
    for (const p of d.players.filter((p) => p.isRadiant === radiant)) {
      const o = owner.get(p.account_id);
      if (o) counts[o.team] = (counts[o.team] ?? 0) + 1;
    }
    const [team, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] ?? [];
    return n >= 3 ? Number(team) : null;
  };
  const rad = sideTeam(true), dire = sideTeam(false);
  if (rad == null || dire == null || rad === dire) return null;
  const teamName = (id) => teams.find((t) => t.id === id).name;
  // Which PlayOn series this game belongs to: same two teams, closest scheduled time.
  const deaths = deathsFrom(d, (id) => heroKeys[id]);
  const seriesOf = series
    .filter((s) => (s.home === rad && s.away === dire) || (s.home === dire && s.away === rad))
    .sort((x, y) => Math.abs((x.time ?? 0) - d.start_time) - Math.abs((y.time ?? 0) - d.start_time))[0];
  const det = detailOf(d);
  if (det) detail[d.match_id] = det;
  const extras = gameExtras(d);
  const vis = visionFields(await visionMap(d.patch, CACHE), d, buildingsFrom(d.objectives));
  return {
    series_id: seriesOf?.id ?? null,
    // Captains Mode draft in order; OpenDota team 0 = Radiant = side "a".
    draft: (d.picks_bans ?? []).sort((x, y) => x.order - y.order)
      .map((pb) => ({ order: pb.order, pick: pb.is_pick, side: pb.team === 0 ? "a" : "b", hero: heroes[pb.hero_id] ?? `hero ${pb.hero_id}` })),
    id: String(d.match_id),
    match_id: d.match_id,
    start_time: d.start_time,
    team_a: teamName(rad), team_b: teamName(dire),
    team_a_id: rad, team_b_id: dire,
    score_a: d.radiant_score, score_b: d.dire_score,
    winner: d.radiant_win ? "a" : "b",
    duration_sec: d.duration,
    game_mode: "Captains Mode",
    // Per-minute series from the parsed replay (null if OpenDota hasn't parsed it):
    // team A's net-worth and XP lead (negative = team B ahead).
    gold_adv: Array.isArray(d.radiant_gold_adv) ? d.radiant_gold_adv : null,
    xp_adv: Array.isArray(d.radiant_xp_adv) ? d.radiant_xp_adv : null,
    // Roshan and Tormentor kills with the minute and the side that took them
    // (OpenDota team 2 = Radiant = "a", 3 = Dire = "b"); aegis = who picked it up.
    objectives: Array.isArray(d.objectives) ? d.objectives.flatMap((o) => {
      const type = { CHAT_MESSAGE_ROSHAN_KILL: "roshan", CHAT_MESSAGE_MINIBOSS_KILL: "tormentor", CHAT_MESSAGE_AEGIS: "aegis", CHAT_MESSAGE_AEGIS_STOLEN: "aegis_stolen" }[o.type];
      if (!type) return [];
      const side = o.team === 2 ? "a" : o.team === 3 ? "b" : o.player_slot != null ? (o.player_slot < 128 ? "a" : "b") : null;
      return [{ type, minute: Math.floor(o.time / 60), time: o.time, side }];
    }) : null,
    // Towers, barracks and Ancients as they fell: owner side, which one, second, who took it.
    buildings: buildingsFrom(d.objectives, (slot) => heroes[d.players.find((p) => p.player_slot === slot)?.hero_id] ?? null),
    // Teamfights (flat groups of 3: start second, end second, deaths), from the parsed replay.
    fights: deaths?.fights ?? null,
    // Each team's observer vision at each minute, % of the map outside its own base (see
    // scripts/sync/vision.js; null if unparsed or the patch has no map).
    vision: vis?.vision ?? null,
    // First blood [second, killer, victim] and pauses (see scripts/sync/combat-fields.js).
    ...extras,
    players: [...d.players].sort((x, y) => x.player_slot - y.player_slot).map((p, i) => ({
      team: p.isRadiant ? "a" : "b",
      name: owner.get(p.account_id)?.name ?? p.personaname ?? (p.account_id ? `account ${p.account_id}` : "anonymous"),
      account_id: p.account_id ?? null,
      // Identity for leaderboards: names collide across teams (two "Icarus" in S48 Champion).
      player_key: String(owner.get(p.account_id)?.main ?? p.account_id ?? `${d.match_id}-${p.player_slot}`),
      team_name: teamName(p.isRadiant ? rad : dire),
      standin: owner.get(p.account_id)?.team !== (p.isRadiant ? rad : dire),
      rank_tier: owner.get(p.account_id)?.rank_tier ?? p.rank_tier ?? null,
      tag: null,
      hero: heroes[p.hero_id] ?? `hero ${p.hero_id}`,
      level: p.level, kills: p.kills, deaths: p.deaths, assists: p.assists,
      net_worth: p.net_worth ?? p.total_gold ?? 0, last_hits: p.last_hits, denies: p.denies,
      gpm: p.gold_per_min, xpm: p.xp_per_min, hero_damage: p.hero_damage ?? 0, hero_healing: p.hero_healing ?? 0,
      // Gold earned by each minute (OpenDota gold_t, only ever rises), for per-player and
      // per-hero curves; net worth at each minute (networth_t) for the game's by-player chart.
      gold_t: Array.isArray(p.gold_t) ? p.gold_t : null,
      networth_t: Array.isArray(p.networth_t) ? p.networth_t : null,
      // Map play from the parsed replay (null if unparsed). Creep kills split lane / neutral
      // / ancient as OpenDota reports them; dewards = enemy observers + sentries killed.
      lane_kills: p.lane_kills ?? null, neutral_kills: p.neutral_kills ?? null, ancient_kills: p.ancient_kills ?? null,
      camps_stacked: p.camps_stacked ?? null,
      obs_placed: p.obs_placed ?? null, sen_placed: p.sen_placed ?? null,
      obs_killed: p.observer_kills ?? null, sen_killed: p.sentry_kills ?? null,
      // For the tier list: OpenDota's position estimate (1–5), seconds of disable dealt,
      // building damage, laning efficiency (% of max farm, first 10 min) and seconds spent
      // dead (life_state_dead; units checked against death counts, ~40s per death).
      position: p.position_est ?? null, stuns: p.stuns ?? null, tower_damage: p.tower_damage ?? null,
      lane_eff: p.lane_efficiency_pct ?? null, time_dead: p.life_state_dead ?? null,
      // Lane result (gold and XP at 10 min, against the lane opponent), hero damage taken
      // (survival), and utility used by supports: dust and smokes (sentries are sen_placed).
      xp10: Array.isArray(p.xp_t) ? p.xp_t[10] ?? null : null,
      // XP by minute and hero damage per teamfight (see scripts/sync/timing-fields.js).
      ...timingFields(d, p),
      // Laning (see public/lib/lanes.js): the replay's lane, and last hits / denies at 10 min.
      ...laneFields(p),
      dmg_taken: p.damage_taken ? Object.entries(p.damage_taken).filter(([k]) => k.startsWith("npc_dota_hero_")).reduce((t, [, v]) => t + v, 0) : null,
      // Seconds of each buyback (OpenDota buyback_log; its length always equals buyback_count).
      buybacks: Array.isArray(p.buyback_log) ? p.buyback_log.map((b) => b.time) : null,
      dust_used: p.item_uses ? p.item_uses.dust ?? 0 : null, smoke_used: p.item_uses ? p.item_uses.smoke_of_deceit ?? 0 : null,
      // From the per-unit kill counts: OpenDota's own roshan_kills field disagreed with the
      // Roshan kill events and Aegis pickups in 12 of 38 S48 games; these always agree.
      roshan_kills: p.killed ? (p.killed.npc_dota_roshan ?? 0) : null,
      tormentor_kills: p.killed ? (p.killed.npc_dota_miniboss ?? 0) : null,
      // Ward placements, flat groups of 5: x, y (OpenDota map grid, ~64-192, Radiant bottom
      // left), second placed, seconds it lived (-1 unknown), 1 if an enemy killed it.
      obs_pos: wardLog(p.obs_log, p.obs_left_log),
      sen_pos: wardLog(p.sen_log, p.sen_left_log),
      // Map their observers were first to light, % of the map, averaged (scripts/sync/vision.js).
      new_vision: vis?.new_vision[i] ?? null,
      // The same, less ground the team's standing towers already saw (the playoff "Vision %").
      ward_vision: vis?.ward_vision[i] ?? null,
      // Every death, flat groups of 6 (see public/lib/deathmap.js): second, killer, gold
      // lost, seconds dead, x, y (a spot only for teamfight deaths).
      death_log: deaths?.players[i] ?? null,
      // Final 6 slots + neutral (item keys), and the first purchase second of each core item,
      // flat [key, sec, ...] (see public/lib/items.js).
      ...itemsFrom(p),
      // APM, multi-kills, kill streaks, kill times, first blood, teamfight share, runes, courier
      // kills, biggest hit, pings, public benchmarks and smoke kills (see scripts/sync/combat-fields.js).
      ...combatFields(p, firstDeathOf(extras.first_blood_at, i)),
    })),
  };
}

// PlayOn can sit at 0–0 for days after a series is played. When its games are found, score the
// series from them; a score PlayOn does enter replaces this on the next sync.
function scoreFromGames(list, gameList) {
  for (const s of list) {
    if (!s.time || s.time > Date.now() / 1000 || s.home_score || s.away_score) continue;
    const mine = gameList.filter((g) => g.series_id === s.id);
    if (!mine.length) continue;
    const won = (id) => mine.filter((g) => (g.winner === "a" ? g.team_a_id : g.team_b_id) === id).length;
    [s.home_score, s.away_score] = [won(s.home), won(s.away)];
    console.log(`  series ${s.id}: no score on PlayOn, ${s.home_score}–${s.away_score} from ${mine.length} games`);
  }
}

// --series: each series in turn, written as soon as its games are in, so a failure later on
// keeps what came before. A team's players are asked for their recent practice lobbies one at a
// time, stopping once the series has as many games as PlayOn's score says were played.
async function bySeries() {
  const now = Date.now() / 1000;
  const targets = ONLY === "latest"
    ? series.filter((s) => s.time && s.time > now - 2 * 86400 && s.time < now)
    : series.filter((s) => ONLY.split(",").map(Number).includes(s.id));
  console.log(`  --series: ${targets.length} series`);
  const file = JSON.parse(await readFile(OUT, "utf8"));
  const fileDetail = existsSync(detailName(OUT)) ? JSON.parse(await readFile(detailName(OUT), "utf8")) : {};
  for (const s of targets) {
    const label = `${teams.find((t) => t.id === s.home).name} v ${teams.find((t) => t.id === s.away).name}`;
    const played = (s.home_score ?? 0) + (s.away_score ?? 0);
    const found = new Map(), seen = new Set();
    const accounts = [...owner].filter(([, o]) => o.team === s.home || o.team === s.away);
    const window = Math.ceil((now - s.time) / 86400) + 1;
    for (const [acct] of accounts) {
      if (played && found.size >= played) break;
      const rows = await opendota(`/players/${acct}/matches?date=${window}&lobby_type=1`, "GET", 2)
        .catch((e) => (console.log(`  ${acct}: ${e.message}; next player`), []));
      for (const r of rows) {
        if (seen.has(r.match_id) || r.start_time < s.time - 3 * 3600) continue;
        seen.add(r.match_id);
        const g = await buildGame(r.match_id).catch((e) => (console.log(`  match ${r.match_id}: ${e.message}`), null));
        if (g && g.series_id === s.id) found.set(g.match_id, g);
      }
    }
    file.games = file.games.filter((g) => !found.has(g.match_id)).concat([...found.values()]).sort((a, b) => b.start_time - a.start_time);
    scoreFromGames(series, file.games);
    file.series = series;
    file.updated = new Date().toISOString();
    for (const id of found.keys()) if (detail[id]) fileDetail[id] = detail[id];
    await writeFile(OUT, leagueJson(file));
    await writeFile(detailName(OUT), detailJson(fileDetail));
    console.log(`  ${label} ${s.home_score}-${s.away_score}: ${found.size} of ${played} games written`);
  }
  process.exit(0);
}
games.sort((a, b) => b.start_time - a.start_time);
scoreFromGames(series, games);

const out = {
  season: season.title.replace(/\s*\|.*$/, "") || `PlayOn season ${SEASON_ID}`,
  playon_season_id: SEASON_ID,
  league_id: LEAGUE_ID,
  updated: new Date().toISOString(),
  teams: teams.map((t) => ({ id: t.id, name: t.name, ...(t.division && { division: t.division }), players: t.players.map((p) => ({ name: p.name, captain: p.captain, account_id: p.account_ids[0], ...(p.playon_id && { playon_id: p.playon_id }), rank_tier: p.rank_tier })) })),
  series,
  games,
  // Recent pubs per player (main account; smurf games merged), last PUB_DAYS days, newest
  // first, flat groups of 7: start time, hero, won (1/0), kills, deaths, assists, ranked (1/0).
  pubs_days: PUB_DAYS,
  pubs: Object.fromEntries([...pubRows].map(([acct, rows]) => [acct, rows.sort((a, b) => b.start_time - a.start_time).flatMap((r) => [
    r.start_time, heroes[r.hero_id] ?? `hero ${r.hero_id}`, (r.player_slot < 128) === r.radiant_win ? 1 : 0, r.kills, r.deaths, r.assists, r.lobby_type === 7 ? 1 : 0,
  ])])),
};
await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, leagueJson(out));
// Purchases and skill builds, loaded only by the pages that show them.
await writeFile(detailName(OUT), detailJson(detail));
// The draft model's inputs (lib/cmdraft.js), loaded only by the Draft tab and the Drafter:
// hero names and baselines, and every rostered player's games (main account, smurfs merged)
// in flat groups of 10: start time, hero id, won (1/0), lobby type, duration, last hits, GPM,
// healing, lane role (0 unparsed), lobby average rank (0 unknown). Oldest first.
const num = (v) => (Number.isFinite(v) ? v : -1);
const draftOut = {
  updated: out.updated,
  history_days: HISTORY_DAYS,
  heroes,
  baselines: Object.fromEntries(heroStats.map((h) => [h.id, [1, 2, 3, 4, 5, 6, 7, 8].map((b) => h[`${b}_pick`] ?? 0).concat([1, 2, 3, 4, 5, 6, 7, 8].map((b) => h[`${b}_win`] ?? 0))])),
  // All-time hero totals: per main account, `p` (pubs) and `l` (practice lobbies), each flat
  // groups of 3: hero id, games, wins. Most games first.
  totals: Object.fromEntries([...totals].filter(([, t]) => t.p.size || t.l.size).map(([acct, t]) => [acct, Object.fromEntries(["p", "l"].map((k) => [k, [...t[k]].sort((a, b) => b[1][0] - a[1][0]).flatMap(([id, [g, w]]) => [id, g, w])]))])),
  history: Object.fromEntries([...historyRows].map(([acct, rows]) => [acct, [...new Map(rows.map((r) => [r.match_id, r])).values()]
    .sort((a, b) => a.start_time - b.start_time)
    .flatMap((r) => [r.start_time, r.hero_id, (r.player_slot < 128) === r.radiant_win ? 1 : 0, r.lobby_type ?? 0, r.duration ?? 0, num(r.last_hits), num(r.gold_per_min), num(r.hero_healing), r.lane_role ?? 0, r.average_rank ?? 0])])),
};
// One line per key and per player, so the auto sync's "only the timestamp changed" check (it
// drops a file whose every changed line holds "updated":) sees real changes, and diffs stay small.
const line = ([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`;
const { history, totals: allTime, ...head } = draftOut;
await writeFile(OUT.replace(/\.json$/, "-draft.json"),
  `{${Object.entries(head).map(line).join(",\n")},\n"totals":{\n${Object.entries(allTime).map(line).join(",\n")}\n},\n"history":{\n${Object.entries(history).map(line).join(",\n")}\n}}\n`);
console.log(`  ${games.length} division games from league ${LEAGUE_ID}; ${odCalls} OpenDota calls this run`);
console.log(`wrote ${path.relative(ROOT, OUT)}`);
