import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSearchIndex, searchIndex, fold } from "../public/lib/search.js";

const champ = {
  teams: [
    { id: 1, name: "Void Walkers", players: [{ name: "Hex", captain: true, account_id: 11 }, { name: "Dops32", account_id: 12 }] },
    { id: 2, name: "Hexagon Club", players: [{ name: "Rune", account_id: 21 }] },
  ],
  games: [
    { start_time: 100, team_a: "Void Walkers", team_b: "Hexagon Club", team_a_id: 1, team_b_id: 2, players: [
      { team: "a", name: "HexOnSteam", player_key: "11", team_name: "Void Walkers" },
      { team: "b", name: "Ringer", player_key: "99", team_name: "Hexagon Club", standin: true },
      { team: "b", name: "account 5", player_key: "5" },
    ] },
  ],
};
const heroic = {
  teams: [{ id: 7, name: "Aegis Hex", division: "B", players: [{ name: "Hexley", account_id: 70 }] }],
  games: [],
};
const leagues = [
  { key: "ad2l", label: "Champion", root: "#/champion", data: champ },
  { key: "heroic", label: "Heroic/Aegis", root: "#/heroic", data: heroic, views: ["a", "b"] },
];
const scrims = { label: "Scrims", matches: [{ createdAt: 5, team_a: "Void Walkers", team_b: "Pub Stars", players: [{ team: "b", name: "Solo Andy" }] }] };
const idx = buildSearchIndex(leagues, scrims);

test("players carry their team and league; teams their league", () => {
  const hex = searchIndex(idx, "hex").find((r) => r.kind === "player" && r.name === "Hex");
  assert.equal(hex.team, "Void Walkers");
  assert.equal(hex.leagueLabel, "Champion");
  assert.equal(hex.captain, true);
  assert.equal(hex.href, "#/champion/player/11");
  assert.equal(hex.teamHref, "#/champion/teams/1");
});

test("sub-division teams and players link into their division", () => {
  const [t] = searchIndex(idx, "aegis hex");
  assert.equal(t.href, "#/heroic/b/teams/7");
  assert.equal(t.leagueLabel, "Heroic/Aegis · Div B");
  const p = searchIndex(idx, "hexley")[0];
  assert.equal(p.href, "#/heroic/b/player/70");
  assert.equal(p.team, "Aegis Hex");
});

test("stand-ins from games, tagged with the team they played for; junk names skipped", () => {
  const r = searchIndex(idx, "ringer")[0];
  assert.equal(r.standin, true);
  assert.equal(r.team, "Hexagon Club");
  assert.equal(searchIndex(idx, "account").length, 0);
});

test("in-game names find the rostered player", () => {
  const r = searchIndex(idx, "hexonsteam")[0];
  assert.equal(r.name, "Hex");
  assert.equal(r.alias, "HexOnSteam");
});

test("exact and prefix matches rank first; the same team shows once per league", () => {
  const names = searchIndex(idx, "hex").map((r) => `${r.name}|${r.league}`);
  assert.equal(names[0], "Hex|ad2l");
  const voids = searchIndex(idx, "void").map((r) => r.league);
  assert.deepEqual(voids.sort(), ["ad2l", "scrim"]);
});

test("scrim players and teams", () => {
  const p = searchIndex(idx, "solo")[0];
  assert.equal(p.leagueLabel, "Scrims");
  assert.equal(p.team, "Pub Stars");
  assert.equal(p.href, "#/scrims/player/solo%20andy");
  assert.equal(p.teamHref, "#/scrims/teams/pub-stars");
  const t = searchIndex(idx, "pub stars").find((r) => r.kind === "team");
  assert.deepEqual(t.players, ["Solo Andy"]);
});

test("fold ignores case and accents", () => {
  assert.equal(fold("  ÉLAN "), "elan");
});
