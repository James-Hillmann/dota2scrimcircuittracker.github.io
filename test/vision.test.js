import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { decodePng, buildMap, fov, wardTile, visionFields, wardLog } from "../scripts/sync/vision.js";
import { VISION_MAPS, isNight, towersUp, litAt, litOver } from "../public/lib/vision.js";

// A blank map the size of the real one: flat, walkable, no trees, every tile counted.
const N = 327;
function flatMap() {
  const size = N * N;
  const all = () => new Uint8Array(size).fill(1);
  return { n: N, elev: new Int16Array(size), tree: new Int16Array(size).fill(-1), walk: all(), fow: new Uint8Array(size),
    counted: { a: all(), b: all() }, area: { a: size, b: size }, fovCache: new Map() };
}
// OpenDota grid 128,128 is world 0,0: tile 164,164 on the 64-unit grid.
const MID = wardTile(flatMap(), 128, 128);
const at = (dx, dy) => MID + dx + dy * N;

test("the map grid lines up: OpenDota 128,128 is the world centre tile", () => {
  assert.equal(MID % N, 164);
  assert.equal(Math.floor(MID / N), 164);
});

test("open ground: a full 1600-radius circle", () => {
  const seen = fov(flatMap(), MID);
  // π × 25² ≈ 1963 tiles.
  assert.ok(seen.length > 1900 && seen.length < 2050, `${seen.length} tiles`);
  assert.ok(seen.includes(at(24, 0)) && !seen.includes(at(26, 0)));
});

test("higher ground blocks sight from below and isn't itself seen", () => {
  const map = flatMap();
  for (let dy = -3; dy <= 3; dy++) map.elev[at(5, dy)] = 20;
  const seen = new Set(fov(map, MID));
  assert.ok(!seen.has(at(5, 0)), "cliff tile");
  assert.ok(!seen.has(at(10, 0)), "behind the cliff");
  assert.ok(seen.has(at(-10, 0)), "the other way is open");
  // From on top of the same rise the wall is ground level, so nothing is hidden.
  map.elev[MID] = 20;
  map.fovCache.clear();
  assert.ok(new Set(fov(map, MID)).has(at(10, 0)));
});

test("a tree blocks a viewer below its top, not one above it", () => {
  const map = flatMap();
  for (let dy = -2; dy <= 2; dy++) map.tree[at(4, dy)] = 40; // a tree on ground 0
  assert.ok(!new Set(fov(map, MID)).has(at(9, 0)));
  map.elev[MID] = 60; // ward on a rise above the treetops
  map.fovCache.clear();
  assert.ok(new Set(fov(map, MID)).has(at(9, 0)));
});

test("vision blocker tiles are never seen and stop sight", () => {
  const map = flatMap();
  for (let dy = -2; dy <= 2; dy++) map.fow[at(6, dy)] = 1;
  const seen = new Set(fov(map, MID));
  assert.ok(!seen.has(at(6, 0)) && !seen.has(at(12, 0)));
});

// An OpenDota match with Radiant players' observers: [x, y, placed second, life].
const ward = (x, y, time, life, i) => ({ placed: { x, y, time, ehandle: i, type: "obs_log" }, left: life == null ? null : { time: time + life, ehandle: i } });
function match(dur, wardsBySlot) {
  return {
    duration: dur,
    players: Array.from({ length: 10 }, (_, slot) => {
      const ws = wardsBySlot[slot] ?? [];
      return { player_slot: slot < 5 ? slot : 123 + slot, isRadiant: slot < 5, obs_log: ws.map((w) => w.placed), obs_left_log: ws.filter((w) => w.left).map((w) => w.left) };
    }),
  };
}

test("a ward on ground a teammate's ward already shows gets no credit for it", () => {
  const map = flatMap();
  // Slot 0: 0:00, full 6 minutes. Slot 1: same spot at 1:00, full 6 minutes. 10-minute game.
  const v = visionFields(map, match(600, { 0: [ward(128, 128, 0, 360, 1)], 1: [ward(128, 128, 60, 360, 2)] }));
  const circle = fov(map, MID).length;
  // Slot 0 lit it 0–6:00; slot 1 adds it only for 6:00–7:00, after the first ward expired.
  assert.equal(v.new_vision[0], Math.round(((circle * 360) / 600 / map.area.a) * 100 * 100) / 100);
  assert.equal(v.new_vision[1], Math.round(((circle * 60) / 600 / map.area.a) * 100 * 100) / 100);
  assert.equal(v.new_vision[5], 0, "Dire players with ward logs and no wards: 0");
  // Coverage: one circle for the first 7 minutes, nothing after.
  const one = Math.round((circle / map.area.a) * 1000) / 10;
  assert.deepEqual(v.vision.a, [one, one, one, one, one, one, one, 0, 0, 0, 0]);
  assert.ok(v.vision.b.every((x) => x === 0));
});

test("ground in your own base doesn't count", () => {
  const map = flatMap();
  map.counted.a = new Uint8Array(N * N); // all of it is Radiant's base
  const v = visionFields(map, match(600, { 0: [ward(128, 128, 0, 360, 1)] }));
  assert.equal(v.new_vision[0], 0);
});

test("a team's new vision adds up to its average coverage", () => {
  const map = flatMap();
  const v = visionFields(map, match(1500, {
    0: [ward(128, 128, -60, null, 1), ward(140, 128, 400, 200, 2)],
    2: [ward(132, 130, 100, 360, 3), ward(100, 100, 900, null, 4)],
    3: [ward(128, 126, 1300, null, 5)],
  }));
  const total = [0, 1, 2, 3, 4].reduce((s, i) => s + v.new_vision[i], 0);
  const mean = v.vision.a.reduce((s, x, m) => s + x * (Math.min(1500, (m + 1) * 60) - m * 60), 0) / 1500;
  assert.ok(Math.abs(total - mean) < 0.05, `${total} vs ${mean}`);
});

test("ward_vision: ground a standing tower sees earns nothing; once it falls, it does", () => {
  // Radiant's mid tier 1 moved onto the centre tile, the ward right on top of it. Day only (a
  // 5-minute game), so the tower sees 1900, past the ward's 1600.
  const map = { ...flatMap(), def: { towers: { a: { t1_mid: [0, 0] }, b: {} } } };
  const d = match(300, { 0: [ward(128, 128, 0, null, 1)] });
  const standing = visionFields(map, d, []);
  assert.ok(standing.new_vision[0] > 0);
  assert.equal(standing.ward_vision[0], 0);
  // The tower falls at 1:00: the ward gets the last 4 minutes, as new vision counts it.
  const fell = visionFields(map, d, [{ side: "a", b: "t1_mid", time: 60 }]);
  assert.ok(Math.abs(fell.ward_vision[0] - standing.new_vision[0] * 0.8) < 0.02, `${fell.ward_vision[0]}`);
  // An enemy tower doesn't take a team's ground.
  const enemy = visionFields({ ...flatMap(), def: { towers: { a: {}, b: { t1_mid: [0, 0] } } } }, d, []);
  assert.equal(enemy.ward_vision[0], enemy.new_vision[0]);
  // Without building data there's no ward_vision.
  assert.equal(visionFields(map, d).ward_vision[0], null);
});

test("ward_vision: at night a tier 1 sees 800, so the ward gets the ring beyond it", () => {
  const map = { ...flatMap(), def: { towers: { a: { t1_mid: [0, 0] }, b: {} } } };
  // Placed at 5:00 (night), up to 6:00.
  const v = visionFields(map, match(360, { 0: [ward(128, 128, 300, null, 1)] }), []);
  const ring = fov(map, MID).length - fov(map, MID, 800).length;
  assert.equal(v.ward_vision[0], Math.round(((ring * 60) / 360 / map.area.a) * 100 * 100) / 100);
});

test("unparsed games (no ward logs) get nothing", () => {
  assert.equal(visionFields(flatMap(), { duration: 600, players: [{ player_slot: 0, isRadiant: true }] }), null);
  assert.equal(visionFields(null, match(600, {})), null);
});

test("wardLog keeps fractions only when asked", () => {
  const placed = [{ x: 100.4, y: 90.6, time: 30, ehandle: 1, type: "obs_log" }];
  assert.deepEqual(wardLog(placed, []), [100, 91, 30, -1, 0]);
  assert.deepEqual(wardLog(placed, [{ time: 100, ehandle: 1 }], false), [100.4, 90.6, 30, 70, 1]);
});

// A tiny RGBA PNG with one row per filter type, encoded by hand.
function png(width, rows) {
  const chunk = (type, body) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
    return Buffer.concat([len, Buffer.from(type), body, Buffer.alloc(4)]); // CRC isn't checked
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(rows.length, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.concat(rows.map(([filter, bytes]) => Buffer.from([filter, ...bytes])));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

test("decodePng undoes each row filter", () => {
  const img = decodePng(png(2, [
    [0, [10, 20, 30, 255, 40, 50, 60, 255]], // none
    [1, [5, 5, 5, 0, 1, 1, 1, 0]], // sub: + pixel to the left
    [2, [1, 1, 1, 0, 1, 1, 1, 0]], // up: + pixel above
    [3, [0, 0, 0, 0, 0, 0, 0, 0]], // average of left and above
    [4, [0, 0, 0, 0, 0, 0, 0, 0]], // Paeth
  ]));
  assert.equal(img.width, 2);
  assert.deepEqual([...img.px.subarray(0, 8)], [10, 20, 30, 255, 40, 50, 60, 255]);
  assert.deepEqual([...img.px.subarray(8, 16)], [5, 5, 5, 0, 6, 6, 6, 0]);
  assert.deepEqual([...img.px.subarray(16, 24)], [6, 6, 6, 0, 7, 7, 7, 0]);
  assert.deepEqual([...img.px.subarray(24, 32)], [3, 3, 3, 0, 5, 5, 5, 0]);
  assert.deepEqual([...img.px.subarray(32, 40)], [3, 3, 3, 0, 5, 5, 5, 0]);
});

test("buildMap reads the five panels the right way up", () => {
  // 2×2 panels: elevation, trees, walkable, blockers, no-ward. Image row 0 = grid y 1.
  const W = 10, px = new Uint8Array(W * 2 * 4);
  const set = (x, row, rgb) => px.set([...rgb, 255], (row * W + x) * 4);
  for (let x = 0; x < W; x++) for (let row = 0; row < 2; row++) set(x, row, [255, 255, 255]);
  set(0, 0, [40, 40, 40]); // elevation 40 at grid (0, 1)
  set(2 + 1, 1, [20, 0, 0]); // tree marker at grid (1, 0), ground 20
  set(4 + 1, 1, [0, 0, 0]); // unwalkable at grid (1, 0)
  set(6 + 0, 0, [0, 0, 0]); // blocker at grid (0, 1)
  const map = buildMap({ width: W, height: 2, px }, { forts: { a: [-1e6, -1e6], b: [1e6, 1e6] } });
  assert.equal(map.elev[0 + 1 * 2], 40);
  assert.equal(map.tree[1 + 0 * 2], 60, "covers its own tile");
  assert.equal(map.tree[0 + 0 * 2], 60, "and the one to its left");
  assert.equal(map.walk[1], 0);
  assert.equal(map.fow[0 + 1 * 2], 1);
  assert.equal(map.area.a, 3);
});

test("day and night take turns every 5 minutes from the horn; night before it", () => {
  assert.equal(isNight(-30), true);
  assert.equal(isNight(0), false);
  assert.equal(isNight(299), false);
  assert.equal(isNight(300), true);
  assert.equal(isNight(599), true);
  assert.equal(isNight(600), false);
  assert.equal(isNight(1500), true);
});

test("towersUp drops each tower once it falls; the two tier 4s go one at a time", () => {
  const def = VISION_MAPS[60];
  assert.equal(towersUp(def, [], 0).length, 22);
  const fell = [{ side: "a", b: "t1_mid", time: 600 }, { side: "b", b: "t4", time: 2000 }, { side: "b", b: "t4", time: 2100 }];
  const at = (t) => towersUp(def, fell, t);
  assert.ok(at(599).some((tw) => tw.side === "a" && tw.key === "t1_mid"));
  assert.ok(!at(600).some((tw) => tw.side === "a" && tw.key === "t1_mid"));
  assert.equal(at(2050).filter((tw) => tw.side === "b" && tw.key === "t4").length, 1);
  assert.equal(at(2100).filter((tw) => tw.side === "b" && tw.key === "t4").length, 0);
});

test("litAt: towers add their own sight (marked 2), smaller at night; % stays observers only", () => {
  const map = flatMap();
  const tower = [{ side: "a", key: "t1_mid", tier: 1, x: 0, y: 0 }]; // world 0,0 = the centre tile
  const day = litAt(map, { a: [], b: [] }, 0, { towers: tower });
  const night = litAt(map, { a: [], b: [] }, 300, { towers: tower, night: true });
  const count = (lit) => lit.reduce((s, v) => s + (v === 2 ? 1 : 0), 0);
  assert.ok(count(day.a.lit) > 2550, "1900 is 29 whole tiles: ≈ 2,640");
  assert.ok(count(night.a.lit) < 500, "800 is 12 whole tiles: ≈ 450");
  assert.equal(day.a.pct, 0);
  assert.ok(day.a.withTowers > 0);
  // An observer on the same spot claims its tiles as ward vision (1), not tower.
  const both = litAt(map, { a: [[128, 128, 0, -1, 0]], b: [] }, 10, { towers: tower });
  assert.equal(both.a.lit[MID], 1);
  assert.ok(both.a.pct > 0);
});

test("litOver weights each tile by the share of the range it was lit", () => {
  const map = flatMap();
  // One observer at the centre from 0:00 to 6:00; range 3:00–9:00 sees it for half.
  const teams = { a: [[128, 128, 0, 360, 0]], b: [] };
  const r = litOver(map, teams, 180, 540);
  assert.ok(Math.abs(r.a.ward[MID] - 0.5) < 1e-6);
  assert.equal(r.b.any[MID], 0);
  const moment = litAt(map, teams, 200);
  assert.ok(Math.abs(r.a.pct - moment.a.pct / 2) < 1e-9);
});
