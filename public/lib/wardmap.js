// Ward maps from parsed replays (AD2L). Each player carries obs_pos / sen_pos as flat groups
// of 5: x, y on OpenDota's map grid (about 62-195, Radiant bottom left), second placed,
// seconds it lived (-1 = still up at the end), 1 if the enemy killed it.
//
// wardMapHtml() returns a <figure> with the wards embedded; wireWardMaps() draws it and wires
// the controls (observers / sentries, game phase, player, dots / heat). No library: heat is a density
// grid drawn as SVG cells with a light blur.

// The minimap picture (public/img/minimap.webp, 634×599) placed on the grid by its two fountain
// icons (pixels 75,532 and 535,106) and where players stand pre-horn in 38 S48 replays (grid
// 74.6,78.0 and 182.9,177.9). Both axes come out at 4.25 px per grid unit, so no stretching.
import { applyZoom, wireZoom } from "./mapzoom.js";
import { drawLayers } from "./maplayers.js";

// Observer and sentry item icons (Valve's CDN, as for item pictures elsewhere).
export const WARD_IMG = { obs: "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/ward_observer.png", sen: "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/ward_sentry.png" };
export const IMG = { src: "img/minimap.webp", x0: 56.94, x1: 206.2, y0: 62.3, y1: 202.8 };
// The map is point-symmetric about the midpoint of the fountains; mirroring uses that centre.
export const CX = (74.6 + 182.9) / 2, CY = (78.0 + 177.9) / 2;
export const Y = (y) => 256 - y; // grid y goes up, SVG y goes down
export const VB = { x: IMG.x0, y: Y(IMG.y1), w: IMG.x1 - IMG.x0, h: IMG.y1 - IMG.y0 };
const attr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const clock = (s) => `${s < 0 ? "-" : ""}${Math.floor(Math.abs(s) / 60)}:${String(Math.abs(s) % 60).padStart(2, "0")}`;

export const hasWards = (p) => Array.isArray(p.obs_pos) || Array.isArray(p.sen_pos);

// One player's wards as objects. flip: mirror Dire wards so every ward is from the placer's
// own side (own base bottom left), which is what makes wards from many games comparable.
export function wardsOf(p, { flip = false } = {}) {
  const out = [];
  const mirror = flip && p.team === "b"; // team "b" is Dire in AD2L data
  for (const [kind, arr] of [["obs", p.obs_pos], ["sen", p.sen_pos]]) {
    if (!Array.isArray(arr)) continue;
    for (let i = 0; i + 4 < arr.length; i += 5) {
      const x = arr[i], y = arr[i + 1];
      out.push({ kind, x: mirror ? +(2 * CX - x).toFixed(1) : x, y: mirror ? +(2 * CY - y).toFixed(1) : y, t: arr[i + 2], life: arr[i + 3], killed: arr[i + 4] === 1, who: p.name ?? null, hero: p.hero ?? null });
    }
  }
  return out;
}

// Wards for every player-game matching `match(p, m)`, mirrored to the placer's side. Each
// keeps the side it was placed from ("a" Radiant / "b" Dire) and its game, so the map can
// split them again.
export function collectWards(games, match) {
  const out = [];
  for (const m of games) for (const p of m.players) {
    if (!hasWards(p) || !match(p, m)) continue;
    for (const w of wardsOf(p, { flip: true })) out.push({ ...w, side: p.team, game: m.id ?? m.match_id });
  }
  return out;
}

// Headline numbers for a set of wards.
export function wardSummary(wards) {
  const obs = wards.filter((w) => w.kind === "obs"), sen = wards.filter((w) => w.kind === "sen");
  const ended = obs.filter((w) => w.life >= 0);
  return {
    obs: obs.length, sen: sen.length,
    obs_killed: obs.filter((w) => w.killed).length,
    sen_killed: sen.filter((w) => w.killed).length,
    obs_life: ended.length ? ended.reduce((s, w) => s + w.life, 0) / ended.length : null,
  };
}

// layers: [{ label, cls, wards }]. One layer = a player / hero / team;
// two layers (a game) = each team in its colour. Dots by default, heat on toggle.
// Wards from more than one player get a player picker, busiest warder first; a player who
// warded on one hero only (always so in a game) is shown with it. Mirrored maps get a side
// switch: both sides together (mirrored, own base bottom left), or only Radiant or only Dire
// games at their real spots.
export function wardMapHtml(layers, { mirrored = false, mode = null, id = "wards" } = {}) {
  const total = layers.reduce((s, l) => s + l.wards.length, 0);
  if (!total) return "";
  const count = new Map(), heroesOf = new Map();
  for (const l of layers) for (const w of l.wards) if (w.who) {
    count.set(w.who, (count.get(w.who) ?? 0) + 1);
    if (!heroesOf.has(w.who)) heroesOf.set(w.who, new Set());
    if (w.hero && w.hero !== l.label) heroesOf.get(w.who).add(w.hero); // not on a hero's own page
  }
  const people = [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([who, n]) => { const hs = heroesOf.get(who); return [who, n, hs.size === 1 ? `${who} · ${[...hs][0]}` : who]; });
  const pi = new Map(people.map(([who], i) => [who, i]));
  const compact = layers.map((l) => ({ label: l.label, cls: l.cls, w: l.wards.map((w) => [w.kind === "obs" ? 1 : 0, w.x, w.y, w.t, w.life, w.killed ? 1 : 0, pi.get(w.who) ?? -1, w.side === "b" ? 1 : 0]) }));
  const start = mode ?? "dots";
  const gamesOn = (side) => new Set(layers.flatMap((l) => l.wards.filter((w) => w.side === side).map((w) => w.game))).size;
  const sides = mirrored ? [["a", "Radiant"], ["b", "Dire"]].map(([v, l]) => [v, l, gamesOn(v)]).filter(([, , n]) => n) : [];
  const side = sides.length === 1 ? sides[0][0] : "all";
  const seg = (name, opts, on) => `<div class="wm-seg" role="group" data-ctl="${name}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${v === on}">${l}</button>`).join("")}</div>`;
  const pick = people.length > 1
    ? `<select class="wm-player" aria-label="Player"><option value="all">All players</option>${people.map(([, n, label], i) => `<option value="${i}">${attr(label)} (${n})</option>`).join("")}</select>`
    : "";
  return `<figure class="wardmap" id="${id}" data-mode="${start}" data-side="${side}" data-mirrored="${mirrored ? 1 : 0}" data-people="${attr(JSON.stringify(people.map(([, , label]) => label)))}" data-wards="${attr(JSON.stringify(compact))}">
    <div class="wm-controls">
      ${sides.length ? seg("side", [...(sides.length > 1 ? [["all", "Both sides"]] : []), ...sides.map(([v, l, n]) => [v, `As ${l} (${n})`])], side) : ""}
      ${seg("kind", [["all", "All wards"], ["obs", "Observers"], ["sen", "Sentries"]], "all")}
      ${seg("phase", [["all", "Whole game"], ["0", "0–10'"], ["1", "10–20'"], ["2", "20–35'"], ["3", "35'+"]], "all")}
      ${pick}
      ${seg("mode", [["dots", "Dots"], ["heat", "Heat"]], start)}
    </div>
    <div class="wm-body"><div class="wm-map"></div><div class="wm-side"></div></div>
  </figure>`;
}

// 0..1 → teal (few) → gold → ember → near white (most).
const RAMP = [[0, [40, 120, 110]], [0.35, [95, 211, 155]], [0.6, [232, 182, 76]], [0.85, [255, 90, 54]], [1, [255, 236, 214]]];
export function heat(v) {
  const k = RAMP.findIndex(([s]) => s >= v);
  if (k <= 0) return `rgb(${RAMP[0][1]})`;
  const [s0, c0] = RAMP[k - 1], [s1, c1] = RAMP[k], f = (v - s0) / (s1 - s0);
  return `rgb(${c0.map((c, i) => Math.round(c + (c1[i] - c) * f)).join(",")})`;
}

// Density on a 2-unit grid over the minimap: a Gaussian spread of ~`spread` grid units around
// each point [x, y, weight = 1]. Weights can be negative (the fight map nets deaths off).
export function densityGrid(points, { cell = 2, spread = 2.5 } = {}) {
  const GX = Math.ceil(VB.w / cell), GY = Math.ceil(VB.h / cell), sigma = spread / cell, reach = Math.ceil(sigma * 2.5);
  const grid = new Float32Array(GX * GY);
  for (const [x, y, wt = 1] of points) {
    const cx = (x - VB.x) / cell, cy = (Y(y) - VB.y) / cell;
    for (let j = Math.max(0, Math.floor(cy) - reach); j <= Math.min(GY - 1, Math.floor(cy) + reach); j++)
      for (let i = Math.max(0, Math.floor(cx) - reach); i <= Math.min(GX - 1, Math.floor(cx) + reach); i++) {
        const d2 = (i + 0.5 - cx) ** 2 + (j + 0.5 - cy) ** 2;
        grid[j * GX + i] += wt * Math.exp(-d2 / (2 * sigma * sigma));
      }
  }
  return { cell, GX, GY, grid, x0: VB.x, y0: VB.y };
}

const PHASES =[[-Infinity, 600], [600, 1200], [1200, 2100], [2100, Infinity]];

// The minimap picture, darkened a little so wards and heat stand out, with side labels.
function terrain(mirrored) {
  const own = mirrored ? "Own side" : "Radiant", enemy = mirrored ? "Enemy side" : "Dire";
  return `<image href="${IMG.src}" x="${VB.x}" y="${VB.y}" width="${VB.w}" height="${VB.h}" preserveAspectRatio="none"/>
    <rect class="wm-dim" x="${VB.x}" y="${VB.y}" width="${VB.w}" height="${VB.h}"/>
    <text class="wm-lbl a" x="${VB.x + 3}" y="${VB.y + VB.h - 3}">${own}</text>
    <text class="wm-lbl b" x="${VB.x + VB.w - 3}" y="${VB.y + 7}" text-anchor="end">${enemy}</text>`;
}

function draw(fig) {
  const layers = JSON.parse(fig.dataset.wards);
  const mode = fig.dataset.mode, kind = fig.dataset.kind ?? "all", phase = fig.dataset.phase ?? "all", who = fig.dataset.who ?? "all";
  const people = JSON.parse(fig.dataset.people ?? "[]");
  const mirrored = fig.dataset.mirrored === "1", side = mirrored ? fig.dataset.side ?? "all" : "all";
  const keep = (w) => (kind === "all" || (kind === "obs") === (w[0] === 1)) &&
    (phase === "all" || (w[3] >= PHASES[+phase][0] && w[3] < PHASES[+phase][1])) &&
    (who === "all" || w[6] === +who) &&
    (side === "all" || w[7] === (side === "b" ? 1 : 0));
  // One side only: Dire wards go back to their real spots (mirroring twice is the identity).
  const real = (w) => (side === "b" ? [w[0], +(2 * CX - w[1]).toFixed(1), +(2 * CY - w[2]).toFixed(1), ...w.slice(3)] : w);
  const shown = layers.map((l) => ({ ...l, w: l.w.filter(keep).map(real) }));
  const n = shown.reduce((s, l) => s + l.w.length, 0);
  const fid = `${fig.id}-heat`;
  let body = "";
  if (mode === "heat") {
    // Density scaled to the busiest cell so the hot spots always show, whether there are 20
    // wards or 2,000.
    const { cell, GX, GY, grid } = densityGrid(shown.flatMap((l) => l.w).map((w) => [w[1], w[2]]));
    const peak = Math.max(...grid) || 1;
    let cells = "";
    for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) {
      const v = grid[j * GX + i] / peak;
      if (v < 0.12) continue;
      cells += `<rect x="${(VB.x + i * cell).toFixed(1)}" y="${(VB.y + j * cell).toFixed(1)}" width="${cell + 0.05}" height="${cell + 0.05}" fill="${heat(v)}" fill-opacity="${(0.15 + 0.8 * v).toFixed(2)}"/>`;
    }
    body = `<defs><filter id="${fid}"><feGaussianBlur stdDeviation="0.9"/></filter></defs><g class="wm-heat" filter="url(#${fid})">${cells}</g>`;
  } else {
    // Each ward is its item icon in a ring of the team's colour; dewarded ones are greyed out
    // and drawn first, so live wards sit on top where they overlap.
    body = `<defs><clipPath id="${fig.id}-clip" clipPathUnits="objectBoundingBox"><circle cx=".5" cy=".5" r=".5"/></clipPath></defs>` +
      shown.map((l) => `<g class="wm-dots ${l.cls ?? ""}">${[...l.w].sort((a, b) => b[5] - a[5]).map((w) => {
      const tip = `${attr(l.label)}${people[w[6]] && people[w[6]] !== l.label ? ` (${attr(people[w[6]])})` : ""}${mirrored ? ` · as ${w[7] ? "Dire" : "Radiant"}` : ""} · ${w[0] === 1 ? "Observer" : "Sentry"} at ${clock(w[3])}${w[4] >= 0 ? `, lasted ${clock(w[4])}${w[5] ? " (dewarded)" : ""}` : ", up at game end"}`;
      // Drawn at 0,0 and moved into place, so wards keep their size when the map is zoomed.
      return `<g class="ward ${w[0] === 1 ? "obs" : "sen"}${w[5] ? " killed" : ""}" style="transform:translate(${w[1]}px,${Y(w[2])}px) scale(var(--ms,1))"><title>${tip}</title>
        <circle r="2.1"/><image href="${w[0] === 1 ? WARD_IMG.obs : WARD_IMG.sen}" x="-1.7" y="-1.7" width="3.4" height="3.4" preserveAspectRatio="xMidYMid slice" clip-path="url(#${fig.id}-clip)"/></g>`;
    }).join("")}</g>`).join("");
  }
  fig.querySelector(".wm-map").innerHTML = `<svg viewBox="${VB.x} ${VB.y} ${VB.w} ${VB.h}" role="img" aria-label="Ward map, ${n} wards">${terrain(side === "all" && mirrored)}${body}</svg>`;
  // A game's Map tab overlays, over the phase shown (never on mirrored maps: those aren't one game).
  if (!mirrored) drawLayers(fig, phase === "all" ? -Infinity : PHASES[+phase][0], phase === "all" ? Infinity : PHASES[+phase][1], "wards");
  applyZoom(fig);

  // Side panel: counts and survival per layer for what's shown.
  fig.querySelector(".wm-side").innerHTML = shown.map((l) => {
    const obs = l.w.filter((w) => w[0] === 1), sen = l.w.filter((w) => w[0] === 0);
    const ended = obs.filter((w) => w[4] >= 0);
    const life = ended.length ? ended.reduce((s, w) => s + w[4], 0) / ended.length : null;
    const killed = obs.filter((w) => w[5]).length;
    return `<div class="wm-stat ${l.cls ?? ""}"><div class="wm-who">${attr(l.label)}</div>
      <div><b>${obs.length}</b> observers · <b>${sen.length}</b> sentries</div>
      ${obs.length ? `<div><b>${Math.round((killed / obs.length) * 100)}%</b> of observers dewarded</div>` : ""}
      ${life != null ? `<div>Observers lasted <b>${clock(Math.round(life))}</b> on average (max 6:00)</div>` : ""}</div>`;
  }).join("") + `<p class="wm-note">${mode === "heat" ? "Brighter = more wards placed there (scaled to the busiest spot)." : "Ring colour = team; greyed out = dewarded."}
    ${!mirrored ? "" : side === "all" ? " Both sides together: Dire games are mirrored so every ward is from the placer's own side (own base bottom left). Pick a side above for real spots." : ` Only games as ${side === "b" ? "Dire" : "Radiant"}, at their real spots on the map.`}</p>`;
}

export function wireWardMaps(root) {
  root.querySelectorAll("figure.wardmap[data-wards]").forEach((fig) => {
    draw(fig);
    wireZoom(fig);
    fig.querySelectorAll(".wm-seg").forEach((seg) => seg.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      fig.dataset[seg.dataset.ctl] = b.dataset.v;
      seg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      draw(fig);
    }));
    fig.querySelector(".wm-player")?.addEventListener("change", (e) => { fig.dataset.who = e.target.value; draw(fig); });
  });
}
