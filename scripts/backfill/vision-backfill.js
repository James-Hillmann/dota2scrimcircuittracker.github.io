// Add observer vision (game `vision`, player `new_vision` and `ward_vision`; see
// scripts/sync/vision.js) to every game already in public/data/*.json, from the cached OpenDota
// matches (.cache/opendota). The only network call is the map download on first use. The sync
// writes them from now on.
// Usage: node scripts/backfill/vision-backfill.js
import { readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { visionMap, visionFields } from "../sync/vision.js";
import { buildingsFrom } from "../../public/lib/towermap.js";
import { leagueJson } from "../sync/league-json.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA = path.join(ROOT, "public", "data"), CACHE = path.join(ROOT, ".cache");

// Keys go in after `fights` (games) and `sen_pos` (players), where the sync writes them, so the
// next sync doesn't reorder anything.
const placeAfter = (obj, after, add) => {
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (!(k in add)) { out[k] = v; if (k === after) Object.assign(out, add); }
  return after in obj ? out : { ...out, ...add };
};

for (const f of (await readdir(DATA)).filter((f) => f.endsWith(".json") && !/-(detail|lite)\.json$/.test(f))) {
  const d = JSON.parse(await readFile(path.join(DATA, f), "utf8"));
  if (!Array.isArray(d.games)) continue;
  let done = 0, missing = 0, noMap = 0;
  const t0 = Date.now();
  for (const [gi, g] of d.games.entries()) {
    const file = path.join(CACHE, "opendota", `match_${g.match_id}.json`);
    if (!existsSync(file)) { missing++; continue; }
    const od = JSON.parse(await readFile(file, "utf8"));
    const map = await visionMap(od.patch, CACHE);
    if (!map) noMap++;
    const vis = visionFields(map, od, buildingsFrom(od.objectives));
    if (vis) done++;
    d.games[gi] = placeAfter({ ...g, players: g.players.map((p, i) => placeAfter(p, "sen_pos", { new_vision: vis?.new_vision[i] ?? null, ward_vision: vis?.ward_vision[i] ?? null })) }, "fights", { vision: vis?.vision ?? null });
  }
  await writeFile(path.join(DATA, f), leagueJson(d));
  console.log(`${f}: vision for ${done} of ${d.games.length} games${missing ? `, ${missing} not in the cache` : ""}${noMap ? `, ${noMap} on a patch with no map` : ""} (${Date.now() - t0} ms)`);
}
