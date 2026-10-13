import { test } from "node:test";
import assert from "node:assert/strict";
import { tagContext, gameTags, tagCells, STOMP_LEAD } from "../public/lib/gametags.js";

const ids = (tags) => tags.map((t) => t.id);
const game = (o) => ({ winner: "a", duration_sec: 2400, players: [], ...o });

test("stomp: a big lead and the loser never ahead", () => {
  assert.deepEqual(ids(gameTags(game({ gold_adv: [0, 3000, 9000, STOMP_LEAD] }), null)), ["stomp"]);
  // The loser led at one minute: not a stomp.
  assert.deepEqual(ids(gameTags(game({ gold_adv: [0, -500, 9000, STOMP_LEAD] }), null)), []);
});

test("comeback or throw, read from a side", () => {
  const m = game({ gold_adv: [0, -6000, -2000, 4000] });
  assert.deepEqual(ids(gameTags(m, null)), ["comeback"]);
  assert.deepEqual(ids(gameTags(m, null, "a")), ["comeback"]);
  assert.deepEqual(ids(gameTags(m, null, "b")), ["throw"]);
});

test("rampage outranks ultra kill; length tags use the league's tenths", () => {
  const p = (multi) => ({ hero: "Lina", name: "x", multi });
  assert.deepEqual(ids(gameTags(game({ players: [p([0, 0, 1, 0]), p([0, 0, 0, 1])] }), null)), ["rampage"]);
  assert.deepEqual(ids(gameTags(game({ players: [p([0, 0, 1, 0])] }), null)), ["ultra"]);
  const league = Array.from({ length: 20 }, (_, i) => ({ duration_sec: 1500 + i * 100 }));
  const ctx = tagContext(league);
  assert.deepEqual(ids(gameTags(game({ duration_sec: 1500 }), ctx)), ["short"]);
  assert.deepEqual(ids(gameTags(game({ duration_sec: 3400 }), ctx)), ["long"]);
  assert.deepEqual(ids(gameTags(game({ duration_sec: 2400 }), ctx)), []);
  // Too few games: no length tags.
  assert.deepEqual(tagContext(league.slice(0, 5)), { short: null, long: null });
});

test("tagCells gives a sortable label string", () => {
  assert.equal(tagCells([{ label: "Stomp" }, { label: "Long game" }]).tags, "Stomp, Long game");
});
