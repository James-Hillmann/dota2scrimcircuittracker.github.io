// Dota Plus hero levels (public/data/hero-levels.json, from STRATZ: scripts/stratz/hero-levels.js).
// Pages don't wait for them: anything that shows a player on a hero writes plusSlot(...), an
// empty <i class="plus">, and once the file loads every slot on the page (and any drawn later)
// gets the in-game style badge: the tier's crest with the level on it, or stays empty when the
// level isn't known (a private profile, no Dota Plus, or a level STRATZ doesn't list).
// A game's slot passes its start time, so it shows the level the player had then; elsewhere
// it's the current level.
import { HERO_META } from "./hero-meta.js";

// The game's six badge tiers (dota_english.txt DOTA_HeroLevelBadgeTier_*), from the level each
// starts at. Grandmaster is level 30 (the Winter 2020 Dota Plus update).
export const PLUS_TIERS = [
  [30, "grandmaster", "Grandmaster"], [25, "master", "Master"], [18, "platinum", "Platinum"],
  [12, "gold", "Gold"], [6, "silver", "Silver"], [1, "bronze", "Bronze"],
];
export const plusTier = (level) => (level >= 1 ? PLUS_TIERS.find(([min]) => level >= min) : null);

const idByName = new Map(HERO_META.map(([id, name]) => [name.toLowerCase(), id]));
const heroIdOf = (hero) => (typeof hero === "number" ? hero : idByName.get(String(hero ?? "").toLowerCase()) ?? null);

// One account's level on a hero, from its [level, hour, ...] list: the latest, or the one it had
// at `at` (unix seconds). Before the first level STRATZ lists, it's unknown (null).
export function levelFrom(list, at = null) {
  if (!list?.length) return null;
  if (at == null) return list[list.length - 2];
  let level = null;
  for (let i = 0; i < list.length; i += 2) if (list[i + 1] * 3600 <= at) level = list[i];
  return level;
}
export const plusLevel = (data, account, hero, at = null) => levelFrom(data?.accounts?.[account]?.[heroIdOf(hero)], at);

// The empty slot a page writes next to a hero; "" when there's no Dota account to look up.
export function plusSlot(account, hero, at = null) {
  const a = Number(account), h = heroIdOf(hero);
  if (!Number.isInteger(a) || a <= 0 || !h) return "";
  return `<i class="plus" data-pa="${a}" data-ph="${h}"${at ? ` data-pt="${Math.floor(at)}"` : ""}></i>`;
}

// The badge itself: a crest in the tier's colours with the level on it.
export function plusBadge(level) {
  const t = plusTier(level);
  if (!t) return "";
  return `<svg viewBox="0 0 26 28" aria-hidden="true"><path class="plus-rim" d="M13 1 24 5.5v8.2c0 6.3-4.6 11-11 13.3C6.6 24.7 2 20 2 13.7V5.5Z"/><path class="plus-face" d="M13 3.6 21.6 7.1v6.6c0 5-3.6 8.8-8.6 10.7-5-1.9-8.6-5.7-8.6-10.7V7.1Z"/><path class="plus-shine" d="M13 3.6 21.6 7.1v3.4C17.5 9 8.5 9 4.4 10.5V7.1Z"/><text x="13" y="17.6">${level}</text></svg>`;
}

function fill(slot, data) {
  const level = plusLevel(data, slot.dataset.pa, Number(slot.dataset.ph), slot.dataset.pt ? Number(slot.dataset.pt) : null);
  slot.dataset.done = "1";
  const t = plusTier(level);
  if (!t) return;
  slot.className = `plus t-${t[1]}`;
  slot.title = `Dota Plus hero level ${level} (${t[2]})${slot.dataset.pt ? " at the time" : ""}`;
  slot.setAttribute("role", "img");
  slot.setAttribute("aria-label", slot.title);
  slot.innerHTML = plusBadge(level);
}
const fillIn = (root, data) => {
  if (root.matches?.("i.plus[data-pa]:not([data-done])")) fill(root, data);
  root.querySelectorAll?.("i.plus[data-pa]:not([data-done])").forEach((s) => fill(s, data));
};

let started = null;
// Load the levels once and keep every slot on the page filled. Safe to call more than once.
export function startPlusLevels(url = "data/hero-levels.json") {
  started ??= fetch(url, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((data) => {
    if (!data?.accounts) return null;
    fillIn(document.body, data);
    new MutationObserver((records) => {
      for (const r of records) for (const n of r.addedNodes) if (n.nodeType === 1) fillIn(n, data);
    }).observe(document.body, { childList: true, subtree: true });
    return data;
  });
  return started;
}
