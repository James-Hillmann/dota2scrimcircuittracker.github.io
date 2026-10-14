// Bonus loading screens for packs (lib/cosmetics-engine.js rollPack). Source: a scan of league
// players' public Dota 2 inventories that keeps the art and never the owners. Screens already in a
// hero's free gallery (card-art-data.js) are left out, so packs only hold art nobody had before.
// Usage: node scripts/gen/gen-screen-art.js <scan-state.json> [items_game.txt items_english.txt]
// With the schema files, heroes are re-derived (screen-heroes.js) and saved to screen-heroes.json;
// without them, the saved tags are reused.
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { CARD_ART } from "../../public/lib/card-art-data.js";
import { screenHeroes } from "./screen-heroes.js";
const scan = JSON.parse(await readFile(process.argv[2], "utf8"));
// "Genuine Crack Shot" and "Fall 2016 Battle Pass Loading Screen II" are the free "Crack Shot" and
// "Fall 2016 Battle Pass II": drop quality prefixes and the words "loading screen (of)".
const norm = (x) => x.toLowerCase().replace(/^(genuine|autographed|inscribed|heroic|frozen|corrupted|exalted|unusual|elder|cursed|auspicious)\s+/, "").replace(/loading screen( of)?/g, "").replace(/[^a-z0-9]/g, "");
const free = new Set(Object.values(CARD_ART).flat().map((a) => norm(a.label)));
// Screens already published come first in every repeat check, so a new find never displaces one
// that players may own.
const idOf = (key) => `scr:${createHash("sha1").update(key).digest("hex").slice(0, 12)}`;
const previous = new Set((await import("../../public/lib/screen-art-data.js").catch(() => ({ SCREEN_ART: [] }))).SCREEN_ART.map((s) => s.id));
const icons = new Set(), screens = [];
for (const [key, a] of Object.entries(scan.art).sort(([a], [b]) => previous.has(idOf(b)) - previous.has(idOf(a)) || a.localeCompare(b))) {
  if (!a.icon || free.has(norm(a.name)) || icons.has(a.icon)) continue;
  icons.add(a.icon);
  const label = a.name.replace(/\s*[-:]?\s*Loading Screen$/, "").replace(/ Loading Screen - /, ": ").trim();
  screens.push({ id: idOf(key), key, label, rarity: a.rarity ?? "Common", icon: a.icon });
}
// Same picture under another name (a re-released team wallpaper, a "- Proximity" copy): compare
// 64-bit difference hashes and keep the first. Distance 0 or 1 only; series that share a frame
// (Frostivus 2024, Aghanim's Labyrinth) differ by 2+ and are different art.
const steam = (icon) => `https://community.fastly.steamstatic.com/economy/image/${icon}/360fx240f`;
async function dhash(src) {
  try {
    const buf = /^https?:/.test(src) ? Buffer.from(await (await fetch(src)).arrayBuffer()) : await readFile(new URL(`../../public/${src}`, import.meta.url));
    const px = await sharp(buf).resize(9, 8, { fit: "fill" }).grayscale().raw().toBuffer();
    let bits = 0n;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits = (bits << 1n) | (px[y * 9 + x] > px[y * 9 + x + 1] ? 1n : 0n);
    return bits;
  } catch { return null; }
}
const hashes = async (srcs) => { const out = []; for (let i = 0; i < srcs.length; i += 16) out.push(...await Promise.all(srcs.slice(i, i + 16).map(dhash))); return out; };
const near = (a, b) => { let x = a ^ b, n = 0; while (x) { n += Number(x & 1n); x >>= 1n; } return n <= 1; };
const kept = (await hashes(Object.values(CARD_ART).flat().filter((a) => a.cls === "src-ls").map((a) => a.src))).filter((h) => h != null);
const screenHashes = await hashes(screens.map((s) => steam(s.icon)));
for (let i = screens.length - 1; i >= 0; i--) {
  const h = screenHashes[i];
  if (h != null && (kept.some((k) => near(h, k)) || screenHashes.slice(0, i).some((k) => k != null && near(h, k)))) { console.log(`Same image: ${screens[i].label}`); screens.splice(i, 1); }
}
const lost = [...previous].filter((id) => !screens.some((s) => s.id === id));
if (lost.length) throw new Error(`Published screens would be dropped: ${lost.join(", ")}`);
screens.sort((a, b) => a.key.localeCompare(b.key));
for (const s of screens) delete s.key;
const tagsFile = new URL("screen-heroes.json", import.meta.url);
let heroes = {};
if (process.argv[4]) {
  heroes = screenHeroes(screens.map((s) => s.label), process.argv[3], process.argv[4], norm);
  await writeFile(tagsFile, JSON.stringify(heroes, Object.keys(heroes).sort(), 1) + "\n");
} else try { heroes = JSON.parse(await readFile(tagsFile, "utf8")); } catch {}
// Hand-sorted on public/_dev/screen-sort.html: a hero name, or null for event, team and other
// screens with no one hero. These win over the derived tags.
const manual = JSON.parse(await readFile(new URL("screen-heroes-manual.json", import.meta.url), "utf8"));
for (const [label, hero] of Object.entries(manual)) if (hero) heroes[label] = hero; else delete heroes[label];
for (const s of screens) if (heroes[s.label]) s.hero = heroes[s.label];
console.log(`${screens.filter((s) => s.hero).length} with a hero.`);
await writeFile(new URL("../../public/lib/screen-art-data.js", import.meta.url), `// Generated by scripts/gen/gen-screen-art.js. Loading screens found in packs, not in any free gallery;
// icon is a Steam economy image path (lib/card-art.js builds the URL); hero is unset for event,
// team and courier screens.
export const SCREEN_ART = ${JSON.stringify(screens)};
`);
console.log(`${screens.length} pack loading screens (${Object.keys(scan.art).length} scanned).`);
