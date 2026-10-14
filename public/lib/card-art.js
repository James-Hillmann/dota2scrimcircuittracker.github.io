import { heroById, HERO_META } from "./hero-meta.js";
import { heroArt } from "./hero-art.js";
import { CARD_ART } from "./card-art-data.js";
import { SCREEN_ART } from "./screen-art-data.js";
export const CARD_STYLES = [["stencil", "Stencil"], ["clean", "Clean"], ["cinema", "Cinematic"], ["ember", "Ember"], ["frost", "Frost"], ["comic", "Comic"], ["ink", "Ink"], ["noir", "Noir"]];
const byName = new Map(HERO_META.map(([id, name]) => [name, heroById(id)]));
const base = "https://cdn.cloudflare.steamstatic.com/apps/dota2";
const absolute = (src) => new URL(src, new URL("../", import.meta.url)).href;
// Loading screens from packs (cosmetics-engine.js rollScreens), by id. A screen with a hero shows
// only for that hero; event, team and courier screens fit any hero.
const screens = new Map(SCREEN_ART.map((s) => [s.id, s]));
export const SCREEN_COUNT = SCREEN_ART.length;
export function screenArt(id) {
  const s = screens.get(id);
  return s && { id: s.id, label: s.label, rarity: s.rarity, hero: s.hero ?? null, cls: "src-ls src-screen", src: `https://community.fastly.steamstatic.com/economy/image/${s.icon}` };
}
// owned: the player's pack screen ids; those for this hero (or none) follow the hero's own art.
export function cardArtOptions(hero, owned = []) {
  const h = typeof hero === "number" ? heroById(hero) : byName.get(hero);
  if (!h) return [];
  const def = heroArt(h.name);
  return [
    ...(def ? [{ id: null, label: "Site default", ...def }] : []),
    { id: "vert", label: "Portrait", cls: "src-vert", src: `${base}/images/heroes/${h.slug}_vert.jpg` },
    { id: "crop", label: "Cut-out crop", cls: "src-cut src-crop", src: `${base}/images/dota_react/heroes/crops/${h.slug}.png` },
    { id: "render", label: "Full render", cls: "src-cut src-render", src: `${base}/videos/dota_react/heroes/renders/${h.slug}.png` },
    ...(CARD_ART[h.name] ?? []).filter((x) => !/mini[\s_-]*heroes/i.test(x.label)),
    ...[...owned].reverse().map(screenArt).filter((s) => s && (s.hero == null || s.hero === h.name)),
  ].map((x) => ({ ...x, src: absolute(x.src) }));
}
export function cardArtwork(hero, choices = {}) {
  const options = cardArtOptions(hero, String(choices?.art ?? "").startsWith("scr:") ? [choices.art] : []);
  const art = options.find((x) => x.id === (choices?.art ?? null)) ?? options[0];
  if (!art) return null;
  const def = heroArt(typeof hero === "number" ? heroById(hero)?.name : hero);
  const style = CARD_STYLES.some(([id]) => id === choices?.style) ? choices.style : def?.style ?? "stencil";
  return { ...art, style, crop: validCardCrop(choices?.crop) ? choices.crop : null };
}
export function checkCardChoices({ hero = null, pos = null, art = null, style = null, crop = null }) {
  if (hero != null && !heroById(hero)) return "Choose a valid hero.";
  if (pos != null && ![1, 2, 3, 4, 5].includes(pos)) return "Choose a valid role.";
  if (style != null && !CARD_STYLES.some(([id]) => id === style)) return "Choose a valid filter.";
  if (art != null && !cardArtOptions(hero).some((x) => x.id === art)) return "Choose artwork for your selected hero.";
  if (crop != null && !validCardCrop(crop)) return "Choose a valid crop.";
  return null;
}

export function validCardCrop(crop) {
  return crop != null && typeof crop === "object" && !Array.isArray(crop)
    && Object.keys(crop).length === 3 && ["x", "y", "zoom"].every((key) => typeof crop[key] === "number" && Number.isFinite(crop[key]))
    && crop.x >= 0 && crop.x <= 100 && crop.y >= 0 && crop.y <= 100 && crop.zoom >= 1 && crop.zoom <= 3;
}
export function defaultCardCrop(art) {
  return { x: 50, y: art?.cls?.includes("src-crop") ? 0 : art?.cls?.includes("src-render") ? 20 : art?.cls?.includes("src-ls") ? 30 : 15, zoom: art?.cls?.includes("src-crop") ? 1.25 : art?.cls?.includes("src-render") ? 1.35 : 1.02 };
}
