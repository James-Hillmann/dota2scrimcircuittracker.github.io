import test from "node:test";
import assert from "node:assert/strict";
import { routeOf, sharePath } from "../public/lib/share.js";

test("shareable routes map to preview paths and back", () => {
  for (const [hash, path] of [
    ["#/", "/"], ["", "/"], ["#/scrims/week", "/scrims/week/"], ["#/scrims", "/scrims/"], ["#/scrims/", "/scrims/"], ["#/scrims/upload", "/scrims/upload/"], ["#/ad2l/", "/ad2l/"], ["#/champion/", "/champion/"], ["#/champion/players", "/champion/players/"], ["#/heroic/b/week", "/heroic/b/week/"], ["#/champion/content", "/champion/content/"], ["#/scrims/content", "/scrims/content/"], ["#/heroic/b/content", "/heroic/b/content/"], ["#/all/content", "/all/content/"],
    ["#/heroic/a/", "/heroic/a/"], ["#/heroic/teams/14999", "/heroic/teams/14999/"], ["#/champion/game/8969465019", "/champion/game/8969465019/"],
    ["#/conqueror/", "/conqueror/"], ["#/conqueror/players", "/conqueror/players/"], ["#/conqueror/teams/14095", "/conqueror/teams/14095/"],
    ["#/warrior/", "/warrior/"], ["#/warrior/week", "/warrior/week/"], ["#/challenger/players", "/challenger/players/"],
    ["#/voyager/", "/voyager/"], ["#/explorer/predict", "/explorer/predict/"], ["#/voyager/teams/15000", "/voyager/teams/15000/"],
    ["#/all/", "/all/"], ["#/all/players", "/all/players/"], ["#/all/week", "/all/week/"], ["#/all/heroes", "/all/heroes/"],
  ]) {
    assert.equal(sharePath(hash), path, hash);
    if (path !== "/") assert.equal(sharePath(routeOf(path)), path, `round trip ${path}`);
  }
  assert.equal(routeOf("/heroic/b/"), "#/heroic/b/");
  assert.equal(routeOf("/heroic/b/week/"), "#/heroic/b/week");
  assert.equal(routeOf("/ad2l/"), "#/ad2l/");
  assert.equal(routeOf("/champion/"), "#/champion/");
  assert.equal(routeOf("/conqueror/"), "#/conqueror/");
  assert.equal(routeOf("/warrior/"), "#/warrior/");
  assert.equal(routeOf("/challenger/"), "#/challenger/");
  assert.equal(routeOf("/voyager/"), "#/voyager/");
  assert.equal(routeOf("/explorer/"), "#/explorer/");
  assert.equal(routeOf("/all/"), "#/all/");
});

test("routes without a preview page return null", () => {
  for (const hash of ["#/week", "#/teams", "#/scrims/drafter", "#/scrims/teams/pub-stars", "#/scrims/match/abc", "#/heroic/a/game/123", "#/player/abc", "#/heroic/game/0123456789abcdef0123456789abcdef", "#/heroic/week/2", "#/champion/player/1", "#/ad2l/week", "#/ad2l/teams/1", "#/match/abc", "#/all/predict", "#/all/upload", "#/all/teams/15000", "#/all/game/8969465019"])
    assert.equal(sharePath(hash), null, hash);
});
