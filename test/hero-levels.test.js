import { test } from "node:test";
import assert from "node:assert/strict";
import { plusTier, levelFrom, plusLevel, plusSlot, plusBadge } from "../public/lib/hero-levels.js";

test("levels map to the game's six badge tiers", () => {
  assert.equal(plusTier(0), null);
  assert.deepEqual([1, 5, 6, 11, 12, 17, 18, 24, 25, 29, 30].map((l) => plusTier(l)[1]),
    ["bronze", "bronze", "silver", "silver", "gold", "gold", "platinum", "platinum", "master", "master", "grandmaster"]);
});

test("a game shows the level the player had when it started", () => {
  const list = [11, 100, 12, 200, 13, 300]; // [level, unix hour, ...]
  assert.equal(levelFrom(list), 13);
  assert.equal(levelFrom(list, 99 * 3600), null); // before the first level STRATZ lists: unknown
  assert.equal(levelFrom(list, 100 * 3600), 11);
  assert.equal(levelFrom(list, 250 * 3600), 12);
  assert.equal(levelFrom(list, 999 * 3600), 13);
  assert.equal(levelFrom([]), null);
});

test("lookups take a hero name or id", () => {
  const data = { accounts: { 75379546: { 12: [11, 100, 16, 200] } } };
  assert.equal(plusLevel(data, 75379546, "Phantom Lancer"), 16);
  assert.equal(plusLevel(data, "75379546", 12, 150 * 3600), 11);
  assert.equal(plusLevel(data, 1, 12), null);
  assert.equal(plusLevel(null, 75379546, 12), null);
});

test("slots need a Dota account and a known hero", () => {
  assert.equal(plusSlot(75379546, "Phantom Lancer", 1700000000.5), '<i class="plus" data-pa="75379546" data-ph="12" data-pt="1700000000"></i>');
  assert.equal(plusSlot("Some Scrim Name", "Phantom Lancer"), "");
  assert.equal(plusSlot(75379546, "Not A Hero"), "");
  assert.match(plusBadge(30), /<text[^>]*>30<\/text>/);
  assert.equal(plusBadge(0), "");
});
