// Which hero a pack loading screen belongs to, from Valve's item schema (items_game.txt, e.g. the
// dotabuff/d2vpkr mirror) and its English names (items_english.txt). Steam's own Hero tag says
// "Other" for every loading screen. A screen gets a hero when, in this order:
//  1. it lists exactly one hero in used_by_heroes;
//  2. its set, store bundle or "<Set> - <Slot>" siblings are all for one hero;
//  3. its image path names one hero ("dota_keyart_alchemist_loadingscreen").
// Event, team, courier and ward screens have none.
import { readFileSync } from "node:fs";
import { HERO_META } from "../../public/lib/hero-meta.js";

// Valve KeyValues: nested "key" "value" / "key" { ... }. Repeated keys keep the last value.
function parseKV(text) {
  const re = /"((?:[^"\\]|\\.)*)"|([{}])|\/\/[^\n]*/g, stack = [{}];
  let key = null, m;
  while ((m = re.exec(text))) {
    if (m[0].startsWith("//")) continue;
    const top = stack.at(-1);
    if (m[2] === "{") { const o = {}; top[key ?? ""] = o; stack.push(o); key = null; }
    else if (m[2] === "}") { stack.pop(); key = null; }
    else if (key == null) key = m[1];
    else { top[key] = m[1]; key = null; }
  }
  return stack[0];
}

export function screenHeroes(labels, itemsGamePath, englishPath, norm) {
  const { items, item_sets } = parseKV(readFileSync(itemsGamePath, "utf8")).items_game;
  const english = new Map([...readFileSync(englishPath, "utf8").matchAll(/^\s*"([^"]+)"\s+"((?:[^"\\]|\\.)*)"/gm)].map((m) => [m[1].toLowerCase(), m[2]]));
  const slugToName = new Map(HERO_META.map(([, name, slug]) => [slug, name]));
  const slugs = [...slugToName.keys()].sort((a, b) => b.length - a.length);
  const heroInPath = (p) => { const t = `_${String(p ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_")}_`; const s = slugs.find((s) => t.includes(`_${s}_`)); return s ? slugToName.get(s) : null; };
  const usedBy = (it) => typeof it?.used_by_heroes === "object" ? Object.keys(it.used_by_heroes).map((k) => slugToName.get(k.replace(/^npc_dota_hero_/, ""))).filter(Boolean) : [];
  const push = (map, k, v) => (map.get(k) ?? map.set(k, []).get(k)).push(v);
  const byName = new Map(), groups = new Map(), byPrefix = new Map(), screens = new Map();
  for (const it of Object.values(items)) {
    if (!it?.name) continue;
    byName.set(it.name, it);
    if (typeof it.bundle === "object") for (const n of Object.keys(it.bundle)) push(groups, n, Object.keys(it.bundle));
    const prefix = /^(.+?) - /.exec(it.name)?.[1];
    if (prefix) push(byPrefix, prefix, it.name);
    if (it.prefab === "loading_screen") for (const n of [english.get(String(it.item_name ?? "").replace(/^#/, "").toLowerCase()), it.name]) if (n) push(screens, norm(n), it);
  }
  for (const set of Object.values(item_sets)) for (const n of Object.keys(set.items ?? {})) push(groups, n, Object.keys(set.items));
  const heroes = {};
  for (const label of labels) {
    for (const it of screens.get(norm(label)) ?? []) {
      const direct = usedBy(it);
      const siblings = [...(groups.get(it.name) ?? []).flat(), ...(byPrefix.get(/^(.+?) - /.exec(it.name)?.[1]) ?? [])];
      const viaSet = [...new Set(siblings.flatMap((n) => usedBy(byName.get(n))))];
      const hero = direct.length === 1 ? direct[0] : viaSet.length === 1 ? viaSet[0] : heroInPath(it.image_inventory) ?? heroInPath(JSON.stringify(it.visuals ?? ""));
      if (hero) { heroes[label] = hero; break; }
    }
  }
  return heroes;
}
