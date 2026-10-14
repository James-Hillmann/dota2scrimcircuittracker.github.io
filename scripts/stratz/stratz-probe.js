// Find where STRATZ keeps Dota Plus hero levels before the sync relies on it.
// 1. Introspects the schema and prints every field whose name looks like Dota Plus / hero XP /
//    hero level, with the type it sits on and the path from Query to it.
// 2. Asks for one player's basics, to show the token and account work.
// Output goes to the log only; nothing is written.
//
// Usage: STRATZ_API_KEY=... node scripts/stratz/stratz-probe.js [account_id]
// The account defaults to the first player in public/data/ad2l.json.
// In Actions: run "STRATZ probe" from the Actions tab (.github/workflows/stratz-probe.yml).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stratz } from "./stratz.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const MATCH = /plus|herox?p|heroxp|herolevel|badge|relic|prestige/i;
const MAX_DEPTH = 4;

const account = Number(process.argv[2]) || JSON.parse(await readFile(path.join(ROOT, "public", "data", "ad2l.json"), "utf8")).teams[0].players[0].account_id;

const TYPE_REF = "kind name ofType { kind name ofType { kind name ofType { kind name } } }";
const schema = (await stratz(`{ __schema { queryType { name } types { name kind fields { name args { name } type { ${TYPE_REF} } } } } }`)).__schema;
const types = new Map(schema.types.map((t) => [t.name, t]));
const named = (t) => { while (t?.ofType) t = t.ofType; return t?.name; };

// Walk from Query, breadth first, so each hit is reported with its shortest path.
const seen = new Set([schema.queryType.name]), hits = [];
let frontier = [{ type: schema.queryType.name, path: [] }];
for (let depth = 0; depth < MAX_DEPTH && frontier.length; depth++) {
  const next = [];
  for (const { type, path: p } of frontier) {
    for (const f of types.get(type)?.fields ?? []) {
      const target = named(f.type), step = f.args.length ? `${f.name}(${f.args.map((a) => a.name).join(", ")})` : f.name;
      if (MATCH.test(f.name)) hits.push(`${[...p, step].join(" > ")}  :  ${type}.${f.name} -> ${target}`);
      if (types.get(target)?.kind === "OBJECT" && !seen.has(target)) { seen.add(target); next.push({ type: target, path: [...p, step] }); }
    }
  }
  frontier = next;
}
// Types the walk didn't reach (only via deeper paths) still get listed, without a path.
for (const t of schema.types) {
  if (t.name.startsWith("__") || seen.has(t.name)) continue;
  for (const f of t.fields ?? []) if (MATCH.test(f.name)) hits.push(`(deeper)  :  ${t.name}.${f.name} -> ${named(f.type)}`);
}

console.log(`Fields that look like Dota Plus / hero level (${hits.length}):`);
for (const h of hits) console.log(`  ${h}`);

const me = await stratz(`query ($id: Long!) { player(steamAccountId: $id) { steamAccount { id name } matchCount } }`, { id: account })
  .catch((e) => ({ error: e.message }));
console.log(`\nPlayer ${account}:`, JSON.stringify(me));
