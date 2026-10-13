import { test } from "node:test";
import assert from "node:assert/strict";
import { cardArtOptions, cardArtwork, checkCardChoices, CARD_STYLES } from "../public/lib/card-art.js";
import { heroArt } from "../public/lib/hero-art.js";

test("existing cards keep the site's art and style; saved filters override it", () => {
  assert.equal(cardArtwork("Windranger").style, heroArt("Windranger").style);
  assert.equal(cardArtwork("Windranger", { style: "frost" }).style, "frost");
  assert.equal(cardArtwork("Windranger", { style: "untrusted" }).style, heroArt("Windranger").style);
  assert.equal(CARD_STYLES.length, 8);
});

test("art belongs to the selected hero and unrecognized choices fall back", () => {
  const artwork = cardArtOptions(22).find((x) => x.id?.startsWith("ls:"));
  assert.ok(artwork);
  assert.equal(checkCardChoices({ hero: 22, art: artwork.id, style: "ink" }), null);
  assert.equal(cardArtwork(22, { art: artwork.id }).src, artwork.src);
  assert.equal(checkCardChoices({ hero: 1, art: artwork.id }), "Choose artwork for your selected hero.");
  assert.equal(cardArtwork(1, { art: artwork.id }).id, null);
  assert.equal(checkCardChoices({ hero: 22, art: "https://example.com/image.png" }), "Choose artwork for your selected hero.");
  assert.equal(checkCardChoices({ hero: 999 }), "Choose a valid hero.");
  assert.equal(checkCardChoices({ pos: 6 }), "Choose a valid role.");
  assert.equal(checkCardChoices({ style: "bad" }), "Choose a valid filter.");
  assert.equal(checkCardChoices({}), null);
});

import { HERO_META } from "../public/lib/hero-meta.js";

test("Mini Heroes is absent from every hero gallery", () => {
  for (const [id] of HERO_META) assert.ok(cardArtOptions(id).every((art) => !/mini[\s_-]*heroes/i.test(art.label)));
});
test("saved framing is bounded, compatible with old cards, and ignores malformed data", () => {
  const crop = { x: 0, y: 100, zoom: 3 };
  assert.equal(checkCardChoices({ hero: 22, crop }), null);
  assert.deepEqual(cardArtwork(22, { crop }).crop, crop);
  assert.equal(cardArtwork(22).crop, null);
  for (const invalid of [{ x: -1, y: 50, zoom: 1 }, { x: 50, y: 101, zoom: 1 }, { x: 50, y: 50, zoom: 0.9 },
    { x: 50, y: 50, zoom: 3.1 }, { x: 50, y: 50, zoom: Infinity }, { x: "50", y: 50, zoom: 1 }, { ...crop, url: "bad" }]) {
    assert.equal(checkCardChoices({ hero: 22, crop: invalid }), "Choose a valid crop.");
    assert.equal(cardArtwork(22, { crop: invalid }).crop, null);
  }
});
