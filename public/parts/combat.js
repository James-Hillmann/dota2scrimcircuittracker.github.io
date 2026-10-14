// Combat (lib/combat.js, parsed replays): first blood, streaks, runes and the Combat tabs.
import { hasDetails, combatSummary } from "../lib/stats.js";
import { info } from "../lib/glossary.js";
import { ordinal } from "../lib/ranks.js";
import { itemName, clock } from "../lib/items.js";
import { hitSource, heroOfSlug, firstBloodOf, RUNES, hasCombat, combatTotals, bestStreakOf, streakName, benchSummary, deathSources, MULTI, BENCH, pausesOf } from "../lib/combat.js";
import { streakBarsHtml, deathSourcesHtml, benchHtml, streakChartHtml } from "../lib/combat-charts.js";
import { DIVISIONS, ALL_DIVS, esc, fmt, pct, dec, portrait, playerLink, heroLink, dur } from "../core.js";
import { plusSlot } from "../lib/hero-levels.js";

// ---------- Combat (lib/combat.js, parsed replays) ----------
// Purchases and skill builds live in each division's detail file, loaded only by the game and
// hero pages that show them. The All divisions view loads every division's.
const detailCache = {};
const divDetail = (key) => (detailCache[key] ??= fetch(DIVISIONS[key].file.replace(/\.json$/, "-detail.json"), { cache: "no-cache" })
  .then((r) => (r.ok ? r.json() : {})).catch(() => ({})));
export const detailsFor = async (src) => Object.assign({}, ...(await Promise.all((src.all ? ALL_DIVS : [src.key]).filter((k) => DIVISIONS[k]).map(divDetail))));
let abilityNames = null;
export const loadAbilities = () => (abilityNames ??= import("../lib/abilities-data.js").then((x) => (id) => x.ABILITIES[id] ?? null));

export const hitText = (h) => `${hitSource(h[1], itemName)}${h[2] && heroOfSlug(h[2]) ? ` on ${heroOfSlug(h[2])}` : ""}`;
// First blood on a player: drew it ("FB") or was its victim ("died first"), as a small tag.
const fbCache = new WeakMap();
export const fbOf = (m) => (fbCache.has(m) ? fbCache.get(m) : fbCache.set(m, hasDetails(m) ? firstBloodOf(m) : null).get(m));
export const fbRole = (m, p) => { const fb = fbOf(m), i = m.players.indexOf(p); return !fb || i < 0 ? null : fb.i === i ? 1 : fb.victim === i ? -1 : 0; };
export function fbTag(m, p) {
  const r = fbRole(m, p), fb = fbOf(m);
  if (r === 1) return `<span class="fb-tag" title="First blood at ${clock(fb.t)}${fb.victim != null ? ` on ${esc(m.players[fb.victim].hero)}` : ""}">FB</span>`;
  if (r === -1) return `<span class="fb-tag died" title="Gave up first blood at ${clock(fb.t)} to ${esc(m.players[fb.i].hero)}">died first</span>`;
  return "";
}
export const fbCell = (v) => (v === 1 ? '<span class="fb-tag">FB</span>' : v === -1 ? '<span class="fb-tag died">died first</span>' : v === 0 ? "" : "—");
const runeTop = (runes) => { const i = runes.indexOf(Math.max(...runes)); return runes[i] ? RUNES[i] : null; };
const isCoreP = (p) => p.position != null && p.position <= 3;

// Player and hero pages: a Combat tab. match(p, m) picks the player-games; empty without replays.
export function combatTabHtml(src, matches, match, name, { hero = false } = {}) {
  const detailed = matches.filter(hasDetails);
  const mine = detailed.flatMap((m) => m.players.map((p, i) => ({ m, p, i })).filter(({ p, m: g }) => match(p, g) && hasCombat(p)));
  if (!mine.length) return "";
  const ps = mine.map((x) => x.p), s = combatSummary(ps), t = combatTotals(ps);
  const best = mine.map((x) => ({ ...x, streak: bestStreakOf(x.m, x.i) })).sort((a, b) => b.streak - a.streak)[0];
  const hit = mine.filter((x) => x.p.max_hit).sort((a, b) => b.p.max_hit[0] - a.p.max_hit[0])[0];
  const fbs = ps.filter((p) => p.first_blood === 1).length;
  const vs = ({ m, p }) => esc(p.team === "a" ? m.team_b : m.team_a);
  const gameRef = (x, label) => `<a href="${src.link(x.m)}">${label}</a>`;
  const top = runeTop(t.runes);
  const cards = [
    ["APM", fmt(Math.round(s.apm)), "actions per minute, average", "apm"],
    ["Longest streak", String(best.streak), `${best.streak >= 3 ? `${streakName(best.streak)} · ` : "kills without dying · "}${gameRef(best, `${hero ? esc(best.p.name) : esc(best.p.hero)} vs ${vs(best)}`)}`, "best_streak"],
    ["Rampages", String(s.rampages), `${s.ultras} ultra · ${s.triples} triple · ${s.doubles} double kill${s.doubles === 1 ? "" : "s"}`, "rampages"],
    ["First bloods", String(fbs), `${pct(s.fb_rate)} of ${mine.length} game${mine.length === 1 ? "" : "s"}${s.fb_deaths != null ? ` · died first ${s.fb_deaths} time${s.fb_deaths === 1 ? "" : "s"}` : ""}`, "fb_rate"],
    ["Teamfights", pct(s.tf_part), "of their team's teamfights they took part in", "tf_part"],
    ["Runes", dec(s.runes_pg), `a game${top ? ` · mostly ${top}` : ""}`, "runes_pg"],
    ...(hit ? [["Biggest hit", fmt(hit.p.max_hit[0]), `${esc(hitText(hit.p.max_hit))} · ${gameRef(hit, `${hero ? esc(hit.p.name) : "vs"} ${vs(hit)}`)}`, "max_hit"]] : []),
    ["Couriers", String(s.courier_kills), "enemy couriers killed", "courier_kills"],
    ["Pings", dec(s.pings_pg), "map pings a game", "pings"],
  ];
  // Benchmarks against the league's average for the same role (players) or nothing (heroes:
  // the percentiles are already against that hero).
  const role = hero ? null : (mine.filter((x) => isCoreP(x.p)).length * 2 >= mine.length ? "core" : "support");
  const ref = role ? benchSummary(detailed.flatMap((m) => m.players).filter((p) => p.position != null && isCoreP(p) === (role === "core"))) : null;
  return `<div class="cards player-cards reveal" style="--cols:${Math.ceil(cards.length / 2)}">${cards.map(([k, v, sub, tip], i) => `<div class="card" style="--i:${i}"><div class="k">${k}${info(tip)}</div><div class="v">${v}</div><div class="s">${sub}</div></div>`).join("")}</div>
    ${streakBarsHtml(t)}
    <h2>Deaths by source${info("death_sources")}</h2>${deathSourcesHtml(deathSources(matches, match), deathSources(matches, () => true), name)}
    <h2>Percentile against public games${info("benchmarks")}</h2>${benchHtml(benchSummary(ps), ref, { refLabel: `league's average for ${role === "core" ? "cores" : "supports"}` })}`;
}

// Game page: the Combat tab (streak chart, each player's combat line, benchmarks, pauses).
export function gameCombatHtml(m, src) {
  if (!m.players.some(hasCombat)) return "";
  const chart = streakChartHtml(m, { id: `streaks-${m.id}` });
  const who = (p) => `<td class="l who">${portrait(p.hero)}${plusSlot(p.account_id, p.hero, m.start_time)}<span class="who-body"><span class="who-name">${playerLink(src, p)}</span><span class="who-sub">${heroLink(src, p.hero)}</span></span></td>`;
  const multi = (p) => (p.multi ? p.multi.map((n, k) => (n ? `${n}× ${MULTI[k].replace(" kill", "")}` : "")).filter(Boolean).join(", ") || "—" : "—");
  const rows = (t) => m.players.map((p, i) => ({ p, i })).filter(({ p }) => p.team === t).map(({ p, i }) => {
    const st = bestStreakOf(m, i), runes = p.runes ? p.runes.reduce((a, b) => a + b, 0) : null;
    return `<tr class="team-${t}">${who(p)}<td>${p.apm ?? "—"}</td><td>${pct(p.tf_part)}</td><td>${st == null ? "—" : st >= 3 ? `<b title="${esc(streakName(st))}">${st}</b>` : st}</td>
      <td class="l">${multi(p)}</td><td>${fbTag(m, p)}</td><td title="${p.runes ? esc(p.runes.map((n, k) => (n ? `${RUNES[k]} ${n}` : "")).filter(Boolean).join(", ")) : ""}">${runes ?? "—"}</td>
      <td>${p.courier_kills ?? "—"}</td><td class="l">${p.max_hit ? `${fmt(p.max_hit[0])} <small class="muted">${esc(hitText(p.max_hit))}</small>` : "—"}</td><td>${p.pings ?? "—"}</td></tr>`;
  }).join("");
  const head = `<th scope="col" class="l">Player</th><th scope="col">APM${info("apm")}</th><th scope="col">Fights${info("tf_part")}</th><th scope="col">Streak${info("best_streak")}</th><th scope="col" class="l">Multi-kills</th><th scope="col">FB</th><th scope="col">Runes</th><th scope="col">Couriers</th><th scope="col" class="l">Biggest hit${info("max_hit")}</th><th scope="col">Pings</th>`;
  // Each cell: the percentile as an ordinal over a bar filled that far (50th = halfway).
  const benchCell = (v, label, p) => (v == null ? `<td class="bn-cell">—</td>`
    : `<td class="bn-cell${v >= 75 ? " hot" : v < 25 ? " cold" : ""}" style="--v:${v / 100}" title="${esc(`${p.name}'s ${label}: better than ${v}% of public games on ${p.hero}`)}"><span>${ordinal(v)}</span></td>`);
  const benchRows = (t) => m.players.filter((p) => p.team === t && p.bench).map((p) => `<tr class="team-${t}">${who(p)}${p.bench.map((v, k) => benchCell(v, BENCH[k], p)).join("")}</tr>`).join("");
  const benchTable = m.players.some((p) => p.bench) ? `<h3 class="gm-h3">Percentile against public games${info("benchmarks")}</h3>
    <p class="table-note wm-intro">Compared with public games on the same hero: 50th is typical, 90th beats 90% of them. Gold: 75th and up · red: under 25th.</p>
    <div class="table-wrap gm-board bn-board"><table><thead><tr><th scope="col" class="l">Player</th>${BENCH.map((b) => `<th scope="col">${b}<small>percentile</small></th>`).join("")}</tr></thead>
    <tbody>${benchRows("a")}${benchRows("b")}</tbody></table></div>` : "";
  const pz = pausesOf(m);
  const pauseNote = pz?.n ? `<p class="table-note keep">Paused ${pz.n} time${pz.n === 1 ? "" : "s"}, ${dur(pz.total)} total.</p>` : "";
  return `${chart ? `<h3 class="gm-h3">Kill streaks${info("streak_chart")}</h3>${chart}` : ""}
    <h3 class="gm-h3">Combat</h3>
    <div class="table-wrap gm-board"><table><thead><tr>${head}</tr></thead><tbody>
      <tr class="sep a"><td colspan="10">${esc(m.team_a)}</td></tr>${rows("a")}
      <tr class="sep b"><td colspan="10">${esc(m.team_b)}</td></tr>${rows("b")}</tbody></table></div>
    ${pauseNote}${benchTable}`;
}