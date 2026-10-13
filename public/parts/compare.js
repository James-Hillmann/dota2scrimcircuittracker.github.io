// Player page "Compare" tab: this player beside up to MAX_OTHERS others from the same league,
// picked by name. The picks live in the address (?vs=key,key) so a comparison can be shared.
import { METRICS } from "../lib/tiers.js";
import { radarSvg, roleScores } from "./radar.js";
import { playOf, LANE_ROWS, overTimeHtml, wardsHtml, deathsHtml, wirePlay } from "./compare-play.js";
import { esc, pct, fmt, dec, portrait, playerLink, teamLink, setRoutedAt } from "../core.js";

const MAX_OTHERS = 3;
const vsInUrl = () => (new URLSearchParams(location.search).get("vs") ?? "").split(",").filter(Boolean);

// Rows: [label, value(lb, tp), shown(value, lb, tp), better: 1 higher, -1 lower, 0 neither, bar].
// lb: the player's leaderboard line (lib/stats.js), tp: their tier-list result (may be null).
// bar: the value a full bar stands for (100 for 0–100 scores, 1 for shares), "max" for the row's
// biggest value, 0 for no bar.
const per = (v, lb) => v / lb.games;
const SECTIONS = [
  ["Tier list", [
    ["Rating", (lb, tp) => tp?.tier ? tp.rating : null, (v, lb, tp) => `<span class="cmp-tier t-${tp.tier}">${tp.tier}</span> ${v}`, 1, 100],
    ["Stat points", (lb, tp) => tp?.stat_points ?? null, (v) => v.toFixed(1), 1, "max"],
    ["Survival", (lb, tp) => tp?.survival ?? null, Math.round, 1, 100],
    ["Consistency", (lb, tp) => (tp?.series_points.length >= 2 ? tp.consistency : null), Math.round, 1, 100],
    ["Opponents' win %", (lb, tp) => tp?.opp_rate ?? null, pct, 1, 1],
    ["Winning", (lb, tp) => tp?.winning ?? null, Math.round, 1, 100],
  ]],
  ["Results", [
    ["Games", (lb) => lb.games, String, 0, "max"],
    ["Record", (lb) => lb.win_rate, (v, lb) => `${lb.wins}–${lb.games - lb.wins} <small>${pct(v)}</small>`, 1, 1],
  ]],
  ["A game", [
    ["KDA", (lb) => lb.kda, (v) => v.toFixed(2), 1, "max"],
    ["Kills", (lb) => per(lb.kills, lb), (v) => v.toFixed(1), 1, "max"],
    ["Deaths", (lb) => per(lb.deaths, lb), (v) => v.toFixed(1), -1, "max"],
    ["Assists", (lb) => per(lb.assists, lb), (v) => v.toFixed(1), 1, "max"],
    ["Kill participation", (lb) => lb.avg_kp, pct, 1, 1],
    ["GPM", (lb) => lb.avg_gpm, fmt, 1, "max"],
    ["XPM", (lb) => lb.avg_xpm, fmt, 1, "max"],
    ["Damage / min", (lb) => lb.dmg_per_min, fmt, 1, "max"],
    ["Building damage", (lb) => lb.building_pg, (v) => fmt(Math.round(v)), 1, "max"],
    ["Damage taken", (lb) => lb.dmg_taken_pg, (v) => fmt(Math.round(v)), 0, "max"],
    ["Stun time", (lb) => lb.stuns_pg, (v) => `${v.toFixed(1)}s`, 1, "max"],
    ["Healing", (lb) => lb.healing_pg, (v) => fmt(Math.round(v)), 1, "max"],
  ]],
  ["Map", [
    ["Observers", (lb) => (lb.map_games ? lb.obs_pg : null), dec, 1, "max"],
    ["Sentries", (lb) => (lb.map_games ? lb.sen_pg : null), dec, 1, "max"],
    ["Dewards", (lb) => (lb.map_games ? lb.dewards_pg : null), dec, 1, "max"],
    ["Stacks", (lb) => (lb.map_games ? lb.stacks_pg : null), dec, 1, "max"],
  ]],
];


// The tab's content: `key` is the page's player, `players` the league's leaderboard lines,
// `tier` the league's tier-list results by key.
export function compareHtml(key) {
  return `<div id="cmp-box" data-key="${esc(key)}"></div>`;
}

// `play`: { matches (games with details), cuts (lane cut-offs) } for the sections drawn from
// the games themselves (laning, minute by minute, wards, deaths).
export function wireCompare(src, key, players, tier, play = null) {
  const box = document.getElementById("cmp-box");
  if (!box || box.dataset.key !== key) return;
  const byKey = new Map(players.map((p) => [p.key, p]));
  // Picker options: "Name · Team", made unique when two players share both.
  const label = new Map(), seen = new Set();
  for (const p of [...players].sort((a, b) => a.name.localeCompare(b.name))) {
    if (p.key === key) continue;
    let l = p.team ? `${p.name} · ${p.team}` : p.name;
    for (let n = 2; seen.has(l); n++) l = `${p.name} · ${p.team ?? "no team"} (${n})`;
    seen.add(l); label.set(l, p.key);
  }
  let others = vsInUrl().filter((k) => k !== key && byKey.has(k)).slice(0, MAX_OTHERS);

  const save = () => {
    const u = new URL(location.href);
    if (others.length) u.searchParams.set("vs", others.join(",")); else u.searchParams.delete("vs");
    history.replaceState(history.state, "", u.pathname + u.search + u.hash);
    setRoutedAt(location.href);
  };

  const plays = new Map();
  const exOf = (k) => (play ? plays.get(k) ?? plays.set(k, playOf(play.matches, k, play.cuts)).get(k) : null);
  const draw = () => {
    const cols = [key, ...others].map((k) => ({ k, lb: byKey.get(k), tp: tier.get(k) ?? null, ex: exOf(k) }));
    const lead = cols.map(() => 0);
    let contested = 0;
    const row = ([name, get, shown, better, scale]) => {
      const vals = cols.map(({ lb, tp, ex }) => { const v = get(lb, tp, ex); return v == null || Number.isNaN(v) ? null : v; });
      if (vals.every((v) => v == null)) return "";
      const have = vals.filter((v) => v != null);
      const best = better && have.length > 1 && new Set(have).size > 1 ? (better > 0 ? Math.max(...have) : Math.min(...have)) : null;
      if (best != null) { contested++; vals.forEach((v, i) => v === best && lead[i]++); }
      const full = scale === "max" ? Math.max(...have, 0) : scale;
      return `<tr><th scope="row" class="l">${name}</th>${cols.map(({ lb, tp, ex }, i) => {
        const v = vals[i];
        if (v == null) return `<td class="cmp-c${i + 1} cmp-none">—</td>`;
        const w = full > 0 ? Math.max(0, Math.min(1, v / full)) : 0;
        return `<td class="cmp-c${i + 1}${v === best ? " cmp-best" : ""}"><span class="cmp-v">${shown(v, lb, tp, ex)}</span>${full ? `<i class="cmp-bar" style="--w:${w.toFixed(3)}"></i>` : ""}</td>`;
      }).join("")}</tr>`;
    };
    // Tier stats: every stat any of them was scored on, each against their own position.
    const scores = cols.map(({ tp }) => roleScores(tp));
    const metrics = Object.keys(METRICS).filter((m) => scores.some((s) => s[m] != null));
    const shared = metrics.filter((m) => scores.every((s) => s[m] != null));
    const statRows = metrics.map((m) => [METRICS[m].label, (lb, tp) => roleScores(tp)[m] ?? null, Math.round, 1, 100]);
    const section = (title, rows) => { const body = rows.map(row).join(""); return body ? `<tr class="cmp-sec"><th scope="rowgroup" colspan="${cols.length + 1}">${title}</th></tr>${body}` : ""; };
    const body = SECTIONS.map(([t, rows]) => section(t, rows)).join("") + section("Laning", LANE_ROWS) + section("Tier stats, 0–100", statRows);
    const head = cols.map(({ k, lb, tp }, i) => `<th scope="col" class="cmp-p cmp-c${i + 1}">
        <div class="cmp-name">${i ? playerLink(src, lb) : `<b>${esc(lb.name)}</b>`}${i ? `<button type="button" class="cmp-x" data-drop="${esc(k)}" aria-label="Remove ${esc(lb.name)}" title="Remove">×</button>` : ""}</div>
        <div class="cmp-team">${lb.team ? teamLink(src, lb.team) : "&nbsp;"}${lb.standin ? " · stand-in" : ""}</div>
        <div class="cmp-badge">${tp?.tier ? `<span class="rc-tier t-${tp.tier}">${tp.tier}</span>` : ""}${tp?.pos ? `<span>Pos ${tp.pos}</span>` : ""}<span>${lb.wins}–${lb.games - lb.wins}</span></div>
        <div class="cmp-heroes">${lb.hero_list.slice(0, 4).map((h) => portrait(h.hero, "cmp-hero")).join("")}</div>
        ${others.length && contested ? `<div class="cmp-lead" title="Rows where this player has the best number"><b>${lead[i]}</b> / ${contested} best</div>` : ""}</th>`).join("");
    const full = others.length >= MAX_OTHERS;
    // Each player's card under the radar: name, tier, record and how many rows they lead.
    const keyCard = ({ k, lb, tp }, i) => `<div class="cmp-key cmp-c${i + 1}"><b>${esc(lb.name)}</b>${i ? `<button type="button" class="cmp-x cmp-key-x" data-drop="${esc(k)}" aria-label="Remove ${esc(lb.name)}" title="Remove from the comparison">×</button>` : ""}
        <span>${tp?.tier ? `<span class="rc-tier t-${tp.tier}">${tp.tier}</span> ${tp.rating}` : "Unrated"}</span>
        <small>${lb.wins}–${lb.games - lb.wins}${contested ? ` · ${lead[i]} / ${contested} best` : ""}</small></div>`;
    // On its own (nobody picked yet) the player's own profile and charts still show.
    const chart = shared.length >= 3
      ? `<h2>Tier profile</h2><figure class="cmp-fig">${radarSvg(cols.map(({ lb }, i) => ({ name: lb.name, cls: `cmp-c${i + 1}`, scores: scores[i] })), shared)}
          <figcaption>${cols.map(keyCard).join("")}<small class="cmp-cap">${others.length ? "The tier stats they all share" : "Tier stats"}, each 0–100 against their own position</small></figcaption></figure>`
      : others.length ? `<h2>At a glance</h2><div class="cmp-keys">${cols.map(keyCard).join("")}</div>` : "";
    box.innerHTML = `<div class="cmp-pick">
        <label for="cmp-in">Compare with</label>
        <input id="cmp-in" type="text" list="cmp-list" autocomplete="off" placeholder="${full ? `Up to ${MAX_OTHERS} players` : "Type a player's name"}"${full ? " disabled" : ""}>
        <datalist id="cmp-list">${[...label].filter(([, k]) => !others.includes(k)).map(([l]) => `<option value="${esc(l)}"></option>`).join("")}</datalist>
        ${others.length ? `<button type="button" class="cmp-clear">Clear all</button>` : `<span class="cmp-hint">Pick up to ${MAX_OTHERS} players to line up against ${esc(byKey.get(key).name)}.</span>`}
      </div>
      ${chart}
      ${play ? overTimeHtml(cols) : ""}
      <h2>${others.length ? "Head to head" : "Stats"}</h2><div class="cmp-wrap"><table class="cmp-table">
        <thead><tr><th scope="col" class="l"></th>${head}</tr></thead>
        <tbody>${body}</tbody>
      </table></div>
      ${play ? wardsHtml(cols) + deathsHtml(cols) : ""}`;
    if (play) wirePlay(box);
    const input = box.querySelector("#cmp-in");
    const add = () => {
      const k = label.get(input.value.trim());
      if (!k || others.includes(k) || others.length >= MAX_OTHERS) return;
      others = [...others, k];
      save(); draw();
      box.querySelector("#cmp-in")?.focus();
    };
    input.addEventListener("change", add);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); add(); } });
    box.querySelectorAll(".cmp-x").forEach((b) => (b.onclick = () => { others = others.filter((k) => k !== b.dataset.drop); save(); draw(); }));
    const clear = box.querySelector(".cmp-clear");
    if (clear) clear.onclick = () => { others = []; save(); draw(); box.querySelector("#cmp-in")?.focus(); };
  };
  draw();
}
