// Observer-ward vision on the real map: what each ward could see past trees, cliffs and
// Valve's vision blockers. Worked out at sync time from the parsed replay (scripts/sync/vision.js
// reads the map there) and, for the game page's vision map, in the browser (lib/visionmap.js).
// Runs in both: no Node or DOM APIs in this file.
//
//   new_vision (per player): the share of the map outside the player's own base that their
//     observers were the first of their team to light, averaged over the game, in %. A ward
//     only gets credit for ground no earlier teammate ward still standing already showed, so
//     stacking wards on one spot or warding your own base earns nothing. A team's five add up
//     to its line on the vision chart, averaged over the game.
//   ward_vision (per player, when the game's building falls are known): the same, but ground
//     one of the team's standing towers already sees earns nothing either (tower sight shrinks
//     at night). Warding beside your own tier 1 adds little; once it falls, the spot is worth
//     more. The playoff tier model's "Vision %".
//   vision (per game): { a, b } each team's observer coverage at each minute, as the same %.
//
// The map is the patch's dump from leamare/dota-map-coordinates (a custom game that records
// Valve's grid; see https://github.com/leamare/dota-map-coordinates): one PNG of 64×64-unit
// tiles holding elevation, tree heights, walkable ground, vision blockers and no-ward zones,
// the layout devilesk/dota-vision-simulation reads. Never committed or served from this site
// (neither repo has a licence): the sync downloads it into .cache/vision/, and the browser
// fetches it from GitHub (raw.githubusercontent.com allows that). The vision rules follow that
// simulator: higher ground blocks sight from below, a tree blocks a viewer below its top
// (ground + 40), and blocker tiles are never seen. Trees cut down during the game aren't in
// the replay data we get, so every tree counts as standing.
//
// OpenDota's ward x, y are its 128-unit map grid: world = x × 128 − 16384. Checked against
// 31,008 S48 observer spots: 1.2% land on unwalkable tiles at this offset, 17–22% at half a
// cell either way.

// OpenDota patch id -> that patch's map. Games on a patch with no entry get no vision numbers;
// add the new dump here when the map changes. from: the patch's release (unix seconds, OpenDota's
// patch list), for the browser, which has a game's start time but not its patch id. forts: each
// Ancient's world position (team a = Radiant), from the same commit's data/mapdata.json.
export const VISION_MAPS = {
  60: {
    patch: "7.41", file: "map_data_741.png", from: 1774313459, // 2026-03-24T00:50:59Z
    url: "https://raw.githubusercontent.com/leamare/dota-map-coordinates/f793787ecf402f52c9e698da260b02f041256898/img/map_data_741.png",
    forts: { a: [-5920, -5352], b: [5528, 5000] },
    // Towers by side and the keys lib/towermap.js gives them (two tier 4s each), world x, y.
    towers: {
      a: { t1_top: [-6336, 1856], t2_top: [-6501, -872], t3_top: [-6592, -3408], t1_mid: [-1544, -1408], t2_mid: [-3190, -2926], t3_mid: [-4640, -4144],
        t1_bot: [4860, -6379], t2_bot: [-360, -6256], t3_bot: [-3952, -6112], t4: [[-5712, -4864], [-5392, -5192]] },
      b: { t1_top: [-5275, 6036], t2_top: [-128, 6016], t3_top: [3552, 5776], t1_mid: [524, 652], t2_mid: [2496, 2112], t3_mid: [4272, 3759],
        t1_bot: [6269, -2240], t2_bot: [6400, 384], t3_bot: [6336, 3032], t4: [[4944, 4776], [5280, 4432]] },
    },
    // Roshan's two pits and the Tormentor's two spots (same mapdata). Roshan sits in the Dire
    // pit (north-west) by day and the Radiant pit (south-east) by night; the Tormentor is in
    // the south-east by day and the north-west by night (Liquipedia, Roshan / Tormentor).
    roshan: { day: [-3194, 2395], night: [2831, -2740] },
    tormentor: { day: [7744, -6208], night: [-7680, 6336] },
  },
};
export const OBS_RANGE = 1600; // ground vision, day and night (item_ward_observer)
export const OBS_LIFE = 360;
// Sentries see nothing themselves: they reveal invisible units within 1050 for 7 minutes.
export const SENTRY_SIGHT = 1050, SENTRY_LIFE = 420;
// Tower sight, [day, night] (Valve's npc_units: tier 1 1900/800, tiers 2–4 1900/1100). Treated
// as ground vision, like wards: neither Valve's data nor Liquipedia says otherwise.
export const TOWER_RANGE = { 1: [1900, 800], 2: [1900, 1100], 3: [1900, 1100], 4: [1900, 1100] };
// Day and night take turns every 5 minutes: day from the horn (0:00), night 5:00–10:00, and so
// on; night before the horn (Liquipedia, Time of Day). Spells that force day or night (Luna,
// Night Stalker, Phoenix, Dawnbreaker) aren't in the data, so they're left out. Observers see
// 1600 day and night, so night only shrinks tower sight here.
export const isNight = (t) => t < 0 || Math.floor(t / 300) % 2 === 1;
// Own base: within this far of your Ancient. The tier-3 towers stand 1,760–2,127 away.
const BASE_RADIUS = 2600;
const TILE = 64, WORLD_MIN = -10464;
const toWorld = (g) => g * 128 - 16384;

// OpenDota ward logs -> flat [x, y, placed_sec, life_sec, killed, ...]. A ward that left before
// its full duration (observer 360s, sentry 420s) was killed; the left log names an attacker
// even on expiry, so lifetime is the test. Wards still up at game end have no left entry
// (life -1). round: false keeps OpenDota's fractions (a tenth of a cell), for vision.
export function wardLog(placed, left, round = true) {
  if (!Array.isArray(placed)) return null;
  const gone = new Map((left ?? []).map((w) => [w.ehandle, w]));
  const out = [];
  for (const w of placed) {
    const l = gone.get(w.ehandle);
    const life = l ? l.time - w.time : -1;
    const full = w.type === "obs_log" ? 360 : 420;
    out.push(round ? Math.round(w.x) : w.x, round ? Math.round(w.y) : w.y, w.time, life, l && life < full - 5 ? 1 : 0);
  }
  return out;
}

// ---------- the map ----------

// The dump is five square panels side by side (devilesk's layout), image y down, grid y up:
// elevation (red), tree tops (a pure-red pixel at a tree's rounded-up corner; red = the ground
// under it), walkable (white), vision blockers (black), no-ward zones (black).
export function buildMap(png, def) {
  const n = png.height, size = n * n;
  if (png.width !== n * 5) throw new Error(`map panels: expected ${n * 5} wide, got ${png.width}`);
  const red = (panel, gx, gy) => png.px[((n - 1 - gy) * png.width + panel * n + gx) * 4];
  const pixel = (panel, gx, gy) => { const i = ((n - 1 - gy) * png.width + panel * n + gx) * 4; return [png.px[i], png.px[i + 1], png.px[i + 2]]; };
  const elev = new Int16Array(size), tree = new Int16Array(size).fill(-1), walk = new Uint8Array(size), fow = new Uint8Array(size);
  for (let gy = 0; gy < n; gy++) for (let gx = 0; gx < n; gx++) {
    const i = gx + gy * n;
    elev[i] = red(0, gx, gy);
    walk[i] = red(2, gx, gy) ? 1 : 0;
    fow[i] = red(3, gx, gy) ? 0 : 1;
  }
  // A tree covers the 2×2 tiles below-left of its marker and blocks viewers under its top.
  for (let gy = 0; gy < n; gy++) for (let gx = 0; gx < n; gx++) {
    const [r, g, b] = pixel(1, gx, gy);
    if (g || b) continue;
    for (const tx of [gx - 1, gx]) for (const ty of [gy - 1, gy]) {
      if (tx < 0 || ty < 0) continue;
      const i = tx + ty * n;
      tree[i] = Math.max(tree[i], r + 40);
    }
  }
  // Ground each side is scored on: walkable and outside its own base.
  const counted = {}, area = {};
  for (const t of ["a", "b"]) {
    const [fx, fy] = def.forts[t], c = (counted[t] = new Uint8Array(size));
    let sum = 0;
    for (let i = 0; i < size; i++) {
      const wx = (i % n) * TILE + WORLD_MIN, wy = Math.floor(i / n) * TILE + WORLD_MIN;
      if (walk[i] && Math.hypot(wx - fx, wy - fy) > BASE_RADIUS) { c[i] = 1; sum++; }
    }
    area[t] = sum;
  }
  return { n, elev, tree, walk, fow, counted, area, def, fovCache: new Map() };
}

// The map a game was played on, by its start time (the patch's dump from its release on).
export function mapDefAt(startTime) {
  return Object.values(VISION_MAPS).filter((m) => m.from <= startTime).sort((a, b) => b.from - a.from)[0] ?? null;
}

// ---------- line of sight ----------

// The tile a ward stands on. About 1% of logged spots round onto a tile you can't stand on (a
// cliff edge, a tree); those move to the nearest walkable tile within two.
export function wardTile(map, x, y) {
  const n = map.n, gx = Math.round((toWorld(x) - WORLD_MIN) / TILE), gy = Math.round((toWorld(y) - WORLD_MIN) / TILE);
  let best = null, bestD = Infinity;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const tx = gx + dx, ty = gy + dy, d = dx * dx + dy * dy;
    if (tx < 0 || ty < 0 || tx >= n || ty >= n || d >= bestD) continue;
    if (map.walk[tx + ty * n]) { best = tx + ty * n; bestD = d; }
  }
  return best ?? (gx >= 0 && gy >= 0 && gx < n && gy < n ? gx + gy * n : null);
}

// Octant transforms for recursive shadowcasting.
const OCT = [[1, 0, 0, -1, -1, 0, 0, 1], [0, 1, -1, 0, 0, -1, 1, 0], [0, 1, 1, 0, 0, -1, -1, 0], [1, 0, 0, 1, -1, 0, 0, -1]];

// Tiles an observer on tile `at` sees (Int32Array of tile indexes), cached per tile.
export function fov(map, at, range = OBS_RANGE) {
  const key = at * 4096 + range;
  const hit = map.fovCache.get(key);
  if (hit) return hit;
  const n = map.n, cx = at % n, cy = Math.floor(at / n), z = map.elev[at], r = Math.floor(range / TILE), r2 = r * r;
  const opaque = (x, y) => {
    if (x < 0 || y < 0 || x >= n || y >= n) return true;
    const i = x + y * n;
    return map.elev[i] > z || map.tree[i] > z || map.fow[i] === 1;
  };
  const seen = new Set([at]);
  // Björn Bergström's recursive shadowcasting: scan rows outward, splitting the light cone
  // around each run of blocking tiles. Blocking tiles aren't seen themselves.
  const cast = (row, start, end, xx, xy, yx, yy) => {
    if (start < end) return;
    let next = 0;
    for (let j = row; j <= r; j++) {
      let dx = -j - 1, blocked = false;
      const dy = -j;
      while (dx <= 0) {
        dx++;
        const X = cx + dx * xx + dy * xy, Y = cy + dx * yx + dy * yy;
        const lSlope = (dx - 0.5) / (dy + 0.5), rSlope = (dx + 0.5) / (dy - 0.5);
        if (start < rSlope) continue;
        if (end > lSlope) break;
        const wall = opaque(X, Y);
        if (!wall && dx * dx + dy * dy <= r2) seen.add(X + Y * n);
        if (blocked) {
          if (wall) { next = rSlope; continue; }
          blocked = false; start = next;
        } else if (wall && j < r) {
          blocked = true;
          cast(j + 1, start, lSlope, xx, xy, yx, yy);
          next = rSlope;
        }
      }
      if (blocked) break;
    }
  };
  for (let o = 0; o < 8; o++) cast(1, 1, 0, OCT[0][o], OCT[1][o], OCT[2][o], OCT[3][o]);
  const out = Int32Array.from(seen);
  map.fovCache.set(key, out);
  return out;
}

// ---------- per game ----------

// d: an OpenDota match. Returns { vision: { a, b }, new_vision: [one per player, in
// player_slot order] }, or null if the replay isn't parsed (no ward logs). buildings: the
// game's fall events (lib/towermap.js buildingsFrom) to add ward_vision too; needs map.def.
export function visionFields(map, d, buildings = null) {
  if (!map || !d.players?.some((p) => Array.isArray(p.obs_log))) return null;
  const dur = d.duration, players = [...d.players].sort((x, y) => x.player_slot - y.player_slot);
  const wards = [];
  players.forEach((p, slot) => {
    const log = wardLog(p.obs_log, p.obs_left_log, false) ?? [];
    for (let i = 0; i < log.length; i += 5) {
      const placed = log[i + 2], life = log[i + 3];
      const from = Math.max(0, placed), to = Math.min(dur, placed + Math.min(OBS_LIFE, life >= 0 ? life : dur - placed));
      const tile = wardTile(map, log[i], log[i + 1]);
      if (to > from && tile != null) wards.push({ slot, team: p.isRadiant ? "a" : "b", placed, from, to, tiles: fov(map, tile) });
    }
  });
  wards.sort((x, y) => x.placed - y.placed);

  // Between two placements or expiries the live wards don't change, so each stretch is
  // scored once and weighted by its length.
  // With towers, a tower falling or day turning to night changes what they see, so those cut too.
  const towers = buildings && map.def?.towers ? buildings : null;
  const extra = towers ? [...towers.map((b) => b.time), ...Array.from({ length: Math.ceil(dur / 300) }, (_, k) => k * 300)] : [];
  const cuts = [...new Set([0, dur, ...wards.flatMap((w) => [w.from, w.to]), ...extra.filter((s) => s > 0 && s < dur)])].sort((x, y) => x - y);
  const credit = new Float64Array(players.length), creditTw = new Float64Array(players.length), minutes = Math.floor(dur / 60) + 1;
  const lit = { a: new Float64Array(minutes), b: new Float64Array(minutes) };
  const stamp = new Int32Array(map.n * map.n);
  let mark = 0;
  for (let c = 0; c + 1 < cuts.length; c++) {
    const t0 = cuts[c], t1 = cuts[c + 1], len = t1 - t0;
    for (const team of ["a", "b"]) {
      const counted = map.counted[team];
      mark++;
      let seen = 0;
      for (const w of wards) {
        if (w.team !== team || w.from > t0 || w.to < t1) continue;
        let fresh = 0;
        for (const i of w.tiles) if (counted[i] && stamp[i] !== mark) { stamp[i] = mark; fresh++; }
        credit[w.slot] += fresh * len;
        seen += fresh;
      }
      // Again with the team's standing towers' ground taken first.
      if (towers) {
        mark++;
        const night = isNight(t0);
        for (const tw of towersUp(map.def, towers, t0)) {
          if (tw.side !== team) continue;
          const tile = tileAtWorld(map, tw.x, tw.y);
          if (tile != null) for (const i of fov(map, tile, TOWER_RANGE[tw.tier][night ? 1 : 0])) stamp[i] = mark;
        }
        for (const w of wards) {
          if (w.team !== team || w.from > t0 || w.to < t1) continue;
          let fresh = 0;
          for (const i of w.tiles) if (counted[i] && stamp[i] !== mark) { stamp[i] = mark; fresh++; }
          creditTw[w.slot] += fresh * len;
        }
      }
      // Spread the stretch over the minutes it spans.
      for (let m = Math.floor(t0 / 60); m < minutes && m * 60 < t1; m++) {
        const overlap = Math.min(t1, (m + 1) * 60) - Math.max(t0, m * 60);
        if (overlap > 0) lit[team][m] += seen * overlap;
      }
    }
  }
  const pct = (v, digits) => Math.round(v * 10 ** digits) / 10 ** digits;
  const series = (team) => Array.from(lit[team], (v, m) => {
    const secs = Math.min(dur, (m + 1) * 60) - m * 60;
    return secs > 0 ? pct((v / secs / map.area[team]) * 100, 1) : 0;
  });
  return {
    vision: { a: series("a"), b: series("b") },
    new_vision: players.map((p, slot) => (Array.isArray(p.obs_log) ? pct((credit[slot] / dur / map.area[p.isRadiant ? "a" : "b"]) * 100, 2) : null)),
    ward_vision: players.map((p, slot) => (towers && Array.isArray(p.obs_log) ? pct((creditTw[slot] / dur / map.area[p.isRadiant ? "a" : "b"]) * 100, 2) : null)),
  };
}


// ---------- one moment (the game page's vision map) ----------

// Is the observer at group i of a stored obs_pos ([x, y, placed, life, killed] × n) up at second
// t? Up from when it was placed for its life, 6 minutes at most (-1 = still up at the end).
export const obsUpAt = (pos, i, t, life = OBS_LIFE) => pos[i + 2] <= t && t < pos[i + 2] + Math.min(life, pos[i + 3] >= 0 ? pos[i + 3] : Infinity);
// Same for a stored sen_pos.
export const sentryUpAt = (pos, i, t) => obsUpAt(pos, i, t, SENTRY_LIFE);

// The tile at a world position (towers stand on unwalkable tiles, so no snapping).
const tileAtWorld = (map, wx, wy) => {
  const gx = Math.round((wx - WORLD_MIN) / TILE), gy = Math.round((wy - WORLD_MIN) / TILE);
  return gx >= 0 && gy >= 0 && gx < map.n && gy < map.n ? gx + gy * map.n : null;
};
// OpenDota grid units for a world position (what the minimap pictures are drawn in).
export const toGrid = (w) => (w + 16384) / 128;

// Towers standing at second t: [{ side, key, tier, x, y (world) }]. buildings: the game's fall
// events (lib/towermap.js). The two tier 4s share one key, so the first to fall is taken as
// the first listed (which one really went first isn't in the data).
export function towersUp(def, buildings, t) {
  const fell = new Map();
  for (const b of buildings ?? []) if (b.time <= t) fell.set(`${b.side}|${b.b}`, (fell.get(`${b.side}|${b.b}`) ?? 0) + 1);
  const out = [];
  for (const side of ["a", "b"]) for (const [key, at] of Object.entries(def.towers[side])) {
    const spots = key === "t4" ? at : [at];
    spots.forEach(([x, y], k) => {
      if (k < (fell.get(`${side}|${key}`) ?? 0)) return;
      out.push({ side, key, tier: Number(key[1]), x, y });
    });
  }
  return out;
}

// What each team's observers showed at second t. teams: { a: [obs_pos, ...], b: [...] }, one
// obs_pos per player. Returns per team { lit: Uint8Array (1 = seen), pct: % of its ground
// outside its own base, as on the vision chart, wards: how many were up }.
// towers: towersUp() for that second to add their sight (2 in lit = seen only by a tower);
// night: use night ranges. pct stays observers only, as on the chart; withTowers adds them.
export function litAt(map, teams, t, { towers = null, night = false } = {}) {
  const out = {};
  for (const team of ["a", "b"]) {
    const lit = new Uint8Array(map.n * map.n), counted = map.counted[team];
    let seen = 0, wards = 0, extra = 0;
    for (const pos of teams[team]) for (let i = 0; i + 4 < pos.length; i += 5) {
      if (!obsUpAt(pos, i, t)) continue;
      const tile = wardTile(map, pos[i], pos[i + 1]);
      if (tile == null) continue;
      wards++;
      for (const k of fov(map, tile)) if (!lit[k]) { lit[k] = 1; if (counted[k]) seen++; }
    }
    for (const tw of towers ?? []) {
      if (tw.side !== team) continue;
      const tile = tileAtWorld(map, tw.x, tw.y);
      if (tile == null) continue;
      for (const k of fov(map, tile, TOWER_RANGE[tw.tier][night ? 1 : 0])) if (!lit[k]) { lit[k] = 2; if (counted[k]) extra++; }
    }
    out[team] = { lit, pct: (seen / map.area[team]) * 100, withTowers: ((seen + extra) / map.area[team]) * 100, wards };
  }
  return out;
}

// What each team's observers (and towers) showed over seconds [from, to): per team `ward` and
// `any` (Float32Array, the share of the range each tile was lit by a ward / by anything), and
// time-weighted pct and withTowers, as litAt gives for a moment. Between ward placements and
// expiries, tower falls and day/night switches nothing changes, so each stretch is worked out
// once and weighted by its length. towers: { def, buildings } to add tower sight; night: use
// night ranges.
export function litOver(map, teams, from, to, { towers = null, night = false } = {}) {
  const cuts = new Set([from, to]);
  const add = (s) => { if (s > from && s < to) cuts.add(s); };
  for (const team of ["a", "b"]) for (const pos of teams[team]) for (let i = 0; i + 4 < pos.length; i += 5) {
    add(pos[i + 2]);
    add(pos[i + 2] + Math.min(OBS_LIFE, pos[i + 3] >= 0 ? pos[i + 3] : Infinity));
  }
  if (towers) {
    for (const b of towers.buildings ?? []) add(b.time);
    if (night) for (let s = Math.ceil(from / 300) * 300; s < to; s += 300) add(s);
  }
  const pts = [...cuts].sort((x, y) => x - y), size = map.n * map.n, span = to - from;
  const out = {};
  for (const team of ["a", "b"]) out[team] = { ward: new Float32Array(size), any: new Float32Array(size), pct: 0, withTowers: 0 };
  for (let c = 0; c + 1 < pts.length; c++) {
    const t = pts[c], w = (pts[c + 1] - t) / span;
    const now = litAt(map, teams, t, { towers: towers ? towersUp(towers.def, towers.buildings, t) : null, night: night && isNight(t) });
    for (const team of ["a", "b"]) {
      const o = out[team], lit = now[team].lit;
      for (let k = 0; k < size; k++) if (lit[k]) { o.any[k] += w; if (lit[k] === 1) o.ward[k] += w; }
      o.pct += now[team].pct * w;
      o.withTowers += now[team].withTowers * w;
    }
  }
  return out;
}
