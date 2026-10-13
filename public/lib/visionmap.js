// Game page vision map: what each team could see, either at one moment (a time slider, or
// played through) or over a range (From / To: everywhere lit at some point, stronger the longer
// it stayed lit). The lit ground is worked out here in the browser with the same line of sight
// as the sync's vision numbers (lib/vision.js), on the patch's map dump, fetched from GitHub
// the first time a vision map is drawn. Wards are the stored obs_pos / sen_pos (rounded to
// OpenDota's 128-unit grid), so a ward on a cliff edge can differ a little from the sync's
// numbers, which use the unrounded spots.
//
// Optional overlays, each a checkbox (remembered): towers standing at that moment with their
// sight, sentries with their true-sight circle, and night (towers see less at night; observers
// don't change). The Map tab's own overlays (lib/maplayers.js) join the same row.
//
// visionMapHtml() returns the <figure>; wireVisionMaps() loads the map and wires the controls.
import { VB, IMG, Y, WARD_IMG, CX, CY, heat } from "./wardmap.js";
import { applyZoom, wireZoom } from "./mapzoom.js";
import { drawLayers } from "./maplayers.js";
import { buildMap, mapDefAt, litAt, litOver, towersUp, isNight, toGrid, wardTile, fov, TOWER_RANGE, SENTRY_SIGHT, OBS_LIFE, SENTRY_LIFE } from "./vision.js";

const attr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const clock = (s) => `${s < 0 ? "-" : ""}${Math.floor(Math.abs(s) / 60)}:${String(Math.abs(s) % 60).padStart(2, "0")}`;
const STEP = 5; // slider seconds
const PLAY_RATE = 120; // playing: two game minutes a second
const LINGER = 120; // moment view: overlay events from the last two game minutes
const MIN_SPAN = 30; // range view: shortest range, seconds
const LAYERS = [["towers", "Towers"], ["sentries", "Sentries"], ["night", "Night"]];
const LAYER_KEY = "visionLayers";
const LANE = { top: "top", mid: "mid", bot: "bottom" };
const towerName = (tw) => (tw.tier === 4 ? "tier 4" : `tier ${tw.tier} ${LANE[tw.key.split("_")[1]]}`);

function savedLayers() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(LAYER_KEY) ?? "{}") ?? {}; } catch {}
  return Object.fromEntries(LAYERS.map(([k]) => [k, saved[k] !== false]));
}

// m: a game with `vision` (the sync worked it out) and obs_pos / sen_pos per player.
export function visionMapHtml(m, { id = "vision-map" } = {}) {
  const def = m.vision && mapDefAt(m.start_time);
  if (!def) return "";
  const side = (t) => m.players.filter((p) => p.team === t).map((p) => ({ name: p.name, hero: p.hero, obs: p.obs_pos ?? [], sen: p.sen_pos ?? [] }));
  const data = { dur: m.duration_sec, start: m.start_time, buildings: m.buildings ?? [], a: { name: m.team_a, players: side("a") }, b: { name: m.team_b, players: side("b") } };
  const t0 = Math.min(600, Math.floor(m.duration_sec / STEP) * STEP);
  // Range view starts on 20:00–25:00, or the last five minutes of a shorter game.
  const r1 = Math.min(1500, Math.floor(m.duration_sec / STEP) * STEP), r0 = Math.max(0, r1 - 300);
  const layers = savedLayers();
  const seg = (ctl, opts, on) => `<div class="wm-seg" role="group" data-ctl="${ctl}">${opts
    .map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${v === on}">${attr(l)}</button>`).join("")}</div>`;
  // Night stretches of the game as darker bands under the sliders (5 minutes each, from 5:00).
  const bands = [];
  for (let s = 300; s < m.duration_sec; s += 600) bands.push([s, Math.min(m.duration_sec, s + 300)]);
  const pc = (s) => ((s / m.duration_sec) * 100).toFixed(2);
  const cycle = `<div class="vm-cycle" style="background:linear-gradient(to right, ${["var(--vm-day) 0%", ...bands.flatMap(([a, b]) => [`var(--vm-day) ${pc(a)}%`, `var(--vm-night) ${pc(a)}%`, `var(--vm-night) ${pc(b)}%`, `var(--vm-day) ${pc(b)}%`]), "var(--vm-day) 100%"].join(", ")})" title="Darker = night"></div>`;
  const end = (cls, v, label) => `<label class="vm-end"><span>${label}</span><input type="range" class="${cls}" min="0" max="${m.duration_sec}" step="${STEP}" value="${v}" aria-label="${label}"><output>${clock(v)}</output></label>`;
  return `<figure class="wardmap visionmap" id="${id}" data-show="both" data-mode="moment" data-t="${t0}" data-from="${r0}" data-to="${r1}" data-vision="${attr(JSON.stringify(data))}">
    <div class="wm-controls">
      ${seg("mode", [["moment", "Moment"], ["range", "Range"]], "moment")}
      ${seg("show", [["both", "Both teams"], ["a", m.team_a], ["b", m.team_b]], "both")}
      <fieldset class="vm-layers"><legend>Show</legend>${LAYERS.map(([k, label]) =>
        `<label><input type="checkbox" data-layer="${k}"${layers[k] ? " checked" : ""}> ${label}</label>`).join("")}</fieldset>
    </div>
    <div class="vm-time">
      <button type="button" class="vm-play" aria-label="Play">▶</button>
      <div class="vm-track">
        <input type="range" class="vm-slider" min="0" max="${m.duration_sec}" step="${STEP}" value="${t0}" aria-label="Game time">
        ${cycle}
      </div>
      <output class="vm-clock">${clock(t0)}</output>
      <span class="vm-phase"></span>
    </div>
    <div class="vm-range" hidden>${end("vm-from", r0, "From")}${end("vm-to", r1, "To")}<div class="vm-track">${cycle}</div></div>
    <div class="wm-body"><div class="wm-map"></div><div class="wm-side"><p class="wm-note keep">Loading the map…</p></div></div>
  </figure>`;
}

// The patch's dump, decoded once per page load. The browser can't read raw pixels from an
// <img>, so it goes through a canvas, with colour management off so the stored values survive.
const maps = new Map();
function loadMap(def) {
  if (!maps.has(def.url)) maps.set(def.url, (async () => {
    const res = await fetch(def.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bmp = await createImageBitmap(await res.blob(), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
    const c = document.createElement("canvas");
    c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0);
    return buildMap({ width: c.width, height: c.height, px: ctx.getImageData(0, 0, c.width, c.height).data }, def);
  })());
  return maps.get(def.url);
}

// A CSS colour (the theme's --jade / --ember) as [r, g, b].
function rgb(css) {
  const c = document.createElement("canvas").getContext("2d");
  c.fillStyle = css;
  const v = c.fillStyle;
  if (v.startsWith("#")) return [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16));
  return v.match(/\d+/g).slice(0, 3).map(Number);
}

// The tile grid on the minimap: tile gx's centre is OpenDota grid gx / 2 + 46.25 (64-unit tiles
// from world −10464; grid = (world + 16384) / 128), so the n×n picture spans n / 2 grid units.
const gridBox = (n) => ({ x: 46, y: Y(46 + n / 2), w: n / 2, h: n / 2 });

// Player and hero ward maps (lib/wardmap.js, Vision): every observer's sight summed over the
// map, weighted by how long it stood, on the current patch's map. wards: [x, y, life, flip] at
// their real spots on the grid; flip: mirror that ward's sight (a Dire ward on a both-sides map;
// tile gx's centre is grid gx / 2 + 46.25, so the mirror of tile gx is 4·CX − 185 − gx).
// Returns { href, box } for an <image> over the minimap, or null when no map covers the patch.
export async function wardVisionImage(wards) {
  const def = mapDefAt(Date.now() / 1000);
  if (!def) return null;
  const map = await loadMap(def), n = map.n, sum = new Float32Array(n * n);
  const mx = (g, c) => Math.round(4 * c - 185 - g);
  for (const [x, y, life, flip] of wards) {
    const at = wardTile(map, x, y);
    if (at == null) continue;
    const wt = life >= 0 ? Math.min(life, OBS_LIFE) : OBS_LIFE;
    for (const t of fov(map, at)) {
      if (!flip) { sum[t] += wt; continue; }
      const gx = mx(t % n, CX), gy = mx(Math.floor(t / n), CY);
      if (gx >= 0 && gy >= 0 && gx < n && gy < n) sum[gx + gy * n] += wt;
    }
  }
  let peak = 0;
  for (const v of sum) if (v > peak) peak = v;
  const canvas = Object.assign(document.createElement("canvas"), { width: n, height: n });
  const ctx = canvas.getContext("2d"), img = ctx.createImageData(n, n), px = img.data;
  for (let gy = 0; gy < n; gy++) for (let gx = 0; gx < n; gx++) {
    const v = peak ? sum[gx + gy * n] / peak : 0;
    if (v < 0.01) continue;
    const o = (gx + (n - 1 - gy) * n) * 4, [r, g, b] = heat(v).match(/\d+/g).map(Number);
    px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = Math.round(70 + 120 * v);
  }
  ctx.putImageData(img, 0, 0);
  return { href: canvas.toDataURL(), box: gridBox(n) };
}

// An item icon in a team-coloured ring at grid x, y, keeping its size when zoomed.
const icon = (fig, cls, x, y, img, tip) => `<g class="ward ${cls}" style="transform:translate(${x}px,${Y(y)}px) scale(var(--ms,1))"><title>${tip}</title>
  <circle r="2.1"/><image href="${img}" x="-1.7" y="-1.7" width="3.4" height="3.4" preserveAspectRatio="xMidYMid slice" clip-path="url(#${fig.id}-clip)"/></g>`;
const lifeTip = (pos, i, kind) => {
  const placed = pos[i + 2], life = pos[i + 3];
  return `${kind} placed ${clock(placed)}, ${life >= 0 ? `${pos[i + 4] ? "dewarded" : "expired"} at ${clock(placed + life)}` : "up at game end"}`;
};
// Is a stored ward (group i) up at any point in [from, to)? life: its full duration.
const upDuring = (pos, i, from, to, life) => pos[i + 2] < to && pos[i + 2] + Math.min(life, pos[i + 3] >= 0 ? pos[i + 3] : Infinity) > from;
const checked = (fig) => Object.fromEntries([...fig.querySelectorAll("[data-layer]")].map((c) => [c.dataset.layer, c.checked]));

// Paints the lit-ground layer. shade(team, i) -> [ward share, any share] of tile i, 0..1 (a
// moment: 1 or 0; a range: the share of it the tile was lit). Ground a ward sees is stronger
// than ground only a tower sees; a blend where both teams see it; the rest of the map fogged.
function paint(fig, map, shade, fog) {
  const n = map.n, canvas = fig._canvas ??= Object.assign(document.createElement("canvas"), { width: n, height: n });
  const ctx = canvas.getContext("2d"), img = ctx.createImageData(n, n), px = img.data;
  const style = getComputedStyle(fig), ca = rgb(style.getPropertyValue("--jade").trim() || "#5fd39b"), cb = rgb(style.getPropertyValue("--ember").trim() || "#ff5a36");
  const alpha = ([ward, any]) => (any ? 35 + 70 * ward + 25 * (any - ward) : 0);
  for (let gy = 0; gy < n; gy++) for (let gx = 0; gx < n; gx++) {
    const i = gx + gy * n, o = (gx + (n - 1 - gy) * n) * 4;
    if (!map.walk[i] && map.elev[i] === 0) continue; // off the map
    const a = alpha(shade("a", i)), b = alpha(shade("b", i));
    if (a && b) { const wa = a / (a + b); for (let k = 0; k < 3; k++) px[o + k] = ca[k] * wa + cb[k] * (1 - wa); px[o + 3] = Math.min(160, Math.max(a, b) + 15); }
    else if (a || b) { const c = a ? ca : cb; px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = a || b; }
    else px[o + 3] = fog;
  }
  ctx.putImageData(img, 0, 0);
  fig.querySelector(".vm-lit").setAttribute("href", canvas.toDataURL());
}

// Towers, then sentry circles, then observers on top. up(pos, i, life): is that ward shown.
function marksHtml(fig, d, on, layers, towers, night, up) {
  const sideName = (team) => attr(d[team].name);
  let marks = "";
  if (towers) marks += ["a", "b"].filter(on).map((team) => `<g class="vm-towers s-${team}">${towers.filter((tw) => tw.side === team).map((tw) => {
    const range = TOWER_RANGE[tw.tier][night ? 1 : 0];
    return `<g class="vm-tower" style="transform:translate(${toGrid(tw.x)}px,${Y(toGrid(tw.y))}px) scale(var(--ms,1))"><title>${sideName(team)} ${towerName(tw)} · sees ${range} ${night ? "(night)" : "(day)"}</title><rect x="-1.5" y="-1.5" width="3" height="3" transform="rotate(45)"/></g>`;
  }).join("")}</g>`).join("");
  if (layers.sentries) marks += ["a", "b"].filter(on).map((team) => `<g class="wm-dots vm-sentries s-${team}">${d[team].players.flatMap((p) => {
    const out = [];
    for (let i = 0; i + 4 < p.sen.length; i += 5) {
      if (!up(p.sen, i, SENTRY_LIFE)) continue;
      out.push(`<circle class="vm-sight" cx="${p.sen[i]}" cy="${Y(p.sen[i + 1])}" r="${(SENTRY_SIGHT / 128).toFixed(2)}"/>` +
        icon(fig, "sen", p.sen[i], p.sen[i + 1], WARD_IMG.sen, `${attr(p.name)} (${attr(p.hero)}) · ${lifeTip(p.sen, i, "Sentry")} · reveals invisible units within ${SENTRY_SIGHT}`));
    }
    return out;
  }).join("")}</g>`).join("");
  marks += ["a", "b"].filter(on).map((team) => `<g class="wm-dots s-${team}">${d[team].players.flatMap((p) => {
    const out = [];
    for (let i = 0; i + 4 < p.obs.length; i += 5)
      if (up(p.obs, i, OBS_LIFE)) out.push(icon(fig, "obs", p.obs[i], p.obs[i + 1], WARD_IMG.obs, `${attr(p.name)} (${attr(p.hero)}) · ${lifeTip(p.obs, i, "Observer")}`));
    return out;
  }).join("")}</g>`).join("");
  return marks;
}

function draw(fig, map) {
  if (fig.dataset.mode === "range") return drawRange(fig, map);
  const d = JSON.parse(fig.dataset.vision), t = Number(fig.dataset.t), show = fig.dataset.show;
  const layers = checked(fig);
  const on = (team) => show === "both" || show === team;
  const night = layers.night && isNight(t);
  const towers = layers.towers ? towersUp(mapDefAt(d.start), d.buildings, t) : null;
  const teams = { a: d.a.players.map((p) => p.obs), b: d.b.players.map((p) => p.obs) };
  const now = litAt(map, teams, t, { towers, night });
  const share = (v) => (v === 1 ? [1, 1] : v === 2 ? [0, 1] : [0, 0]);
  paint(fig, map, (team, i) => (on(team) ? share(now[team].lit[i]) : [0, 0]), night ? 150 : 120);
  fig.querySelector(".vm-wards").innerHTML = marksHtml(fig, d, on, layers, towers, night, (pos, i, life) => upDuring(pos, i, t, t + 1, life));
  // The Map tab's overlays: what happened in the two minutes up to now, older ones fainter.
  drawLayers(fig, t - LINGER, t + 1, "vision", { fade: true });

  fig.querySelector(".vm-clock").textContent = clock(t);
  fig.querySelector(".vm-phase").textContent = isNight(t) ? "☾ Night" : "☀ Day";
  const sentriesUp = (team) => d[team].players.reduce((s, p) => { let k = 0; for (let i = 0; i + 4 < p.sen.length; i += 5) if (upDuring(p.sen, i, t, t + 1, SENTRY_LIFE)) k++; return s + k; }, 0);
  fig.querySelector(".wm-side").innerHTML = ["a", "b"].filter(on).map((team) => `<div class="wm-stat s-${team}"><div class="wm-who">${attr(d[team].name)}</div>
      <div><b>${now[team].pct.toFixed(1)}%</b> of the map in ward vision</div>
      ${towers ? `<div><b>${now[team].withTowers.toFixed(1)}%</b> with towers (${towers.filter((tw) => tw.side === team).length} standing)</div>` : ""}
      <div><b>${now[team].wards}</b> observer${now[team].wards === 1 ? "" : "s"}${layers.sentries ? ` · <b>${sentriesUp(team)}</b> sentr${sentriesUp(team) === 1 ? "y" : "ies"}` : ""} up</div></div>`).join("") +
    `<p class="wm-note">Lit ground = what that team's observers${towers ? " and towers (fainter)" : ""} could see at ${clock(t)}, blocked by trees, cliffs and high ground; the rest is fogged. % = share of the walkable map outside the team's own base, as on the Vision chart.
      ${layers.sentries ? " Sentry rings: true sight (1050), which reveals invisible units and wards but no ground." : ""}
      ${layers.night ? ` ${isNight(t) ? "Night" : "Day"} now: night runs 5:00–10:00, 15:00–20:00 and so on. Observers see 1600 day or night; towers drop from 1900 to 800 (tier 1) or 1100.` : " Night off: towers drawn with their day sight all game."}
      Trees cut during the game and spells that change day or night aren't in the data. Kills, Teamfights, Objectives and Wards show the two minutes before ${clock(t)}, older ones fainter.</p>`;
}

// Range view: every tile lit at some point in [from, to), stronger the longer it was lit; every
// ward up at some point in it; towers as they stood at the end; overlays for the whole range.
function drawRange(fig, map) {
  const d = JSON.parse(fig.dataset.vision), from = Number(fig.dataset.from), to = Number(fig.dataset.to), show = fig.dataset.show;
  const layers = checked(fig);
  const on = (team) => show === "both" || show === team;
  const def = mapDefAt(d.start);
  const teams = { a: d.a.players.map((p) => p.obs), b: d.b.players.map((p) => p.obs) };
  const r = litOver(map, teams, from, to, { towers: layers.towers ? { def, buildings: d.buildings } : null, night: layers.night });
  paint(fig, map, (team, i) => (on(team) ? [r[team].ward[i], r[team].any[i]] : [0, 0]), 120);
  const towers = layers.towers ? towersUp(def, d.buildings, to - 1) : null;
  const endNight = layers.night && isNight(to - 1);
  fig.querySelector(".vm-wards").innerHTML = marksHtml(fig, d, on, layers, towers, endNight, (pos, i, life) => upDuring(pos, i, from, to, life));
  drawLayers(fig, from, to, "vision");
  const count = (team, key, life) => d[team].players.reduce((s, p) => { let k = 0; for (let i = 0; i + 4 < p[key].length; i += 5) if (upDuring(p[key], i, from, to, life)) k++; return s + k; }, 0);
  const placed = (team) => d[team].players.reduce((s, p) => { let k = 0; for (let i = 0; i + 4 < p.obs.length; i += 5) if (p.obs[i + 2] >= from && p.obs[i + 2] < to) k++; return s + k; }, 0);
  fig.querySelector(".wm-side").innerHTML = ["a", "b"].filter(on).map((team) => `<div class="wm-stat s-${team}"><div class="wm-who">${attr(d[team].name)}</div>
      <div><b>${r[team].pct.toFixed(1)}%</b> of the map in ward vision, on average</div>
      ${towers ? `<div><b>${r[team].withTowers.toFixed(1)}%</b> with towers, on average</div>` : ""}
      <div><b>${count(team, "obs", OBS_LIFE)}</b> observers up at some point (${placed(team)} placed)${layers.sentries ? ` · <b>${count(team, "sen", SENTRY_LIFE)}</b> sentries` : ""}</div></div>`).join("") +
    `<p class="wm-note">${clock(from)}–${clock(to)}: lit ground = everywhere that team's observers${towers ? " and towers (fainter)" : ""} could see at some point, stronger the longer it stayed lit; the rest is fogged. % = average share of the walkable map outside the team's own base, as on the Vision chart.${towers ? ` Towers as they stood at ${clock(to)}.` : ""}${layers.night && towers ? " Tower sight follows day and night across the range." : ""}
      Kills, Teamfights, Objectives and Wards show the whole range.</p>`;
}

export function wireVisionMaps(root) {
  root.querySelectorAll("figure.visionmap[data-vision]").forEach(async (fig) => {
    const d = JSON.parse(fig.dataset.vision);
    fig.querySelector(".wm-map").innerHTML = `<svg viewBox="${VB.x} ${VB.y} ${VB.w} ${VB.h}" role="img" aria-label="Vision map">
      <defs><clipPath id="${fig.id}-clip" clipPathUnits="objectBoundingBox"><circle cx=".5" cy=".5" r=".5"/></clipPath></defs>
      <image href="${IMG.src}" x="${VB.x}" y="${VB.y}" width="${VB.w}" height="${VB.h}" preserveAspectRatio="none"/>
      <image class="vm-lit" preserveAspectRatio="none"/>
      <g class="vm-wards"></g></svg>`;
    wireZoom(fig, { skip: ".ward, .vm-tower" });
    let map;
    try { map = await loadMap(mapDefAt(d.start)); }
    catch (e) { fig.querySelector(".wm-side").innerHTML = `<p class="wm-note keep">Couldn't load the map (${attr(e.message)}).</p>`; return; }
    const b = gridBox(map.n), lit = fig.querySelector(".vm-lit");
    for (const [k, v] of Object.entries({ x: b.x, y: b.y, width: b.w, height: b.h })) lit.setAttribute(k, v);
    const slider = fig.querySelector(".vm-slider"), play = fig.querySelector(".vm-play");
    const fromIn = fig.querySelector(".vm-from"), toIn = fig.querySelector(".vm-to");
    // Redraws wait for the next frame, so dragging a slider fast doesn't queue up work.
    let queued = false;
    const redraw = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; draw(fig, map); }); };
    const setT = (t) => { fig.dataset.t = t; slider.value = t; redraw(); };
    slider.addEventListener("input", () => setT(Number(slider.value)));
    const segs = (ctl, fn) => fig.querySelector(`[data-ctl="${ctl}"]`).addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      for (const x of btn.parentElement.children) x.setAttribute("aria-pressed", String(x === btn));
      fn(btn.dataset.v);
      redraw();
    });
    segs("show", (v) => { fig.dataset.show = v; });
    segs("mode", (v) => {
      if (playing) stop();
      fig.dataset.mode = v;
      fig.querySelector(".vm-time").hidden = v === "range";
      fig.querySelector(".vm-range").hidden = v !== "range";
    });
    fig.querySelector(".vm-layers").addEventListener("change", () => {
      const layers = checked(fig);
      try { localStorage.setItem(LAYER_KEY, JSON.stringify(layers)); } catch {}
      redraw();
    });
    // Range ends: the clocks follow while dragging; the map (a heavier sum over the range) is
    // worked out when the handle is let go. Each end keeps at least MIN_SPAN from the other.
    const ends = (moved) => {
      let from = Number(fromIn.value), to = Number(toIn.value);
      if (to - from < MIN_SPAN) {
        if (moved === fromIn) from = Math.max(0, Math.min(from, d.dur - MIN_SPAN)), to = Math.max(to, from + MIN_SPAN);
        else to = Math.min(d.dur, Math.max(to, MIN_SPAN)), from = Math.min(from, to - MIN_SPAN);
        fromIn.value = from; toIn.value = to;
      }
      fromIn.nextElementSibling.textContent = clock(Number(fromIn.value));
      toIn.nextElementSibling.textContent = clock(Number(toIn.value));
      return [Number(fromIn.value), Number(toIn.value)];
    };
    for (const input of [fromIn, toIn]) {
      input.addEventListener("input", () => ends(input));
      input.addEventListener("change", () => { [fig.dataset.from, fig.dataset.to] = ends(input); redraw(); });
    }
    // Playing moves on by real time elapsed, one draw a frame, so a slow device shows fewer
    // frames rather than a slower game, and the clock always matches the map.
    let playing = null;
    const stop = () => { playing = null; play.textContent = "▶"; play.setAttribute("aria-label", "Play"); };
    play.addEventListener("click", () => {
      if (playing) return stop();
      // At the end (the slider's 5-second steps can stop just short of it): start over.
      if (Number(fig.dataset.t) > d.dur - STEP) { fig.dataset.t = 0; slider.value = 0; }
      play.textContent = "❚❚"; play.setAttribute("aria-label", "Pause");
      const run = playing = { from: Number(fig.dataset.t), at: performance.now() };
      const frame = (now) => {
        // Paused, restarted, or the page has moved on and the figure is gone.
        if (playing !== run || !fig.isConnected) return;
        const t = Math.min(d.dur, run.from + Math.floor(((now - run.at) / 1000) * PLAY_RATE / STEP) * STEP);
        fig.dataset.t = t; slider.value = t;
        draw(fig, map);
        if (t >= d.dur) stop(); else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    // Dragging the slider while it plays takes over.
    slider.addEventListener("pointerdown", () => playing && stop());
    draw(fig, map);
    applyZoom(fig);
  });
}
