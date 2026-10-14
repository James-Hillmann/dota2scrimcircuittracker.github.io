// Build public/data/hero-levels.json: every league player's Dota Plus hero levels, from STRATZ.
// The accounts are every rostered player, every account in a league game and every account with
// synced pubs, across all divisions (public/lib/divisions.js).
//
// STRATZ's player.dotaPlus is one row per level a player reached on a hero, dated. Kept as is,
// so a game can show the level the player had when it was played (lib/hero-levels.js):
//   { "updated": ..., "accounts": { "<account id>": { "<hero id>": [level, hour, level, hour, ...] } } }
// hour = unix hours (seconds / 3600). One line per account, so the sync's "timestamp-only
// changes" check still works on this file.
// An account STRATZ can't answer for keeps what the last run found. Without STRATZ_API_KEY
// the script says so and leaves the file alone.
//
// Usage: STRATZ_API_KEY=... node scripts/stratz/hero-levels.js
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stratz, hasToken } from "./stratz.js";
import { DIVISIONS } from "../../public/lib/divisions.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = path.join(ROOT, "public", "data", "hero-levels.json");
const BATCH = 10; // players per request, as GraphQL aliases

if (!hasToken()) { console.log("STRATZ_API_KEY isn't set; hero levels not refreshed."); process.exit(0); }

const accounts = new Set();
for (const div of DIVISIONS) {
  const file = path.join(ROOT, "public", "data", `${div.key}.json`);
  if (!existsSync(file)) continue;
  const d = JSON.parse(await readFile(file, "utf8"));
  for (const t of d.teams ?? []) for (const p of t.players ?? []) accounts.add(p.account_id);
  for (const g of d.games ?? []) for (const p of g.players ?? []) accounts.add(p.account_id);
  for (const a of Object.keys(d.pubs ?? {})) accounts.add(Number(a));
}
const ids = [...accounts].filter((a) => Number.isInteger(a) && a > 0).sort((a, b) => a - b);
const old = existsSync(OUT) ? JSON.parse(await readFile(OUT, "utf8")).accounts ?? {} : {};

// One account's rows -> { heroId: [level, hour, ...] }, oldest level first.
function compact(rows) {
  const by = {};
  for (const r of rows ?? []) {
    if (!r?.heroId || !r.level) continue;
    (by[r.heroId] ??= []).push([r.level, Math.floor((r.createdDateTime ?? 0) / 3600)]);
  }
  const out = {};
  for (const h of Object.keys(by).sort((a, b) => a - b)) out[h] = by[h].sort((x, y) => x[0] - y[0]).flat();
  return out;
}

const fields = "dotaPlus { heroId level createdDateTime }";
async function fetchBatch(batch) {
  const q = `{ ${batch.map((a) => `a${a}: player(steamAccountId: ${a}) { ${fields} }`).join(" ")} }`;
  try {
    const d = await stratz(q);
    return batch.map((a) => [a, d[`a${a}`]?.dotaPlus ?? null]);
  } catch (e) {
    // One bad account can fail a whole batch: ask one at a time.
    if (batch.length === 1) { console.log(`  ${batch[0]}: ${e.message}`); return [[batch[0], undefined]]; }
    const out = [];
    for (const a of batch) out.push(...(await fetchBatch([a])));
    return out;
  }
}

const result = {};
let got = 0, empty = 0, failed = 0;
const lowest = new Map();
for (let i = 0; i < ids.length; i += BATCH) {
  for (const [a, rows] of await fetchBatch(ids.slice(i, i + BATCH))) {
    if (rows === undefined) { failed++; if (old[a]) result[a] = old[a]; continue; }
    const c = compact(rows);
    if (!Object.keys(c).length) { empty++; if (old[a]) result[a] = old[a]; continue; }
    got++;
    result[a] = c;
    for (const list of Object.values(c)) lowest.set(list[0], (lowest.get(list[0]) ?? 0) + 1);
  }
}
console.log(`Hero levels: ${got} accounts with levels, ${empty} with none (or private), ${failed} failed, of ${ids.length}.`);
console.log(`Lowest level STRATZ lists per hero: ${[...lowest].sort((a, b) => a[0] - b[0]).map(([l, n]) => `${l}: ${n}`).join(", ")}`);
if (!got && !Object.keys(old).length) { console.log("Nothing from STRATZ; file not written."); process.exit(0); }

const lines = Object.keys(result).sort((a, b) => a - b).map((a) => `${JSON.stringify(a)}:${JSON.stringify(result[a])}`);
await writeFile(OUT, `{\n"updated": ${JSON.stringify(new Date().toISOString())},\n"accounts": {\n${lines.join(",\n")}\n}}\n`);
console.log(`Wrote ${path.relative(ROOT, OUT)} (${lines.length} accounts).`);
