// Evaluate the merged rules against simulated requests with the Firebase Rules test API
// (projects.test) — nothing is deployed. Usage: node scripts/rules/rules-dry-test.cjs <firestore.rules>
const fs = require("fs");
const { requireAuth } = require("firebase-tools/lib/requireAuth");
const { Client } = require("firebase-tools/lib/apiv2");

const source = fs.readFileSync(process.argv[2], "utf8");
const PATH = "/databases/(default)/documents/scrimLeague/data/matches/00000000000000000000000000000001";
const NOW = "2026-09-24T04:00:00Z";

const player = (i) => ({
  team: i < 5 ? "a" : "b", name: `Rules Test Player ${i + 1}`, tag: null, hero: "Kez",
  level: 20, kills: 2, deaths: 2, assists: 5, net_worth: 15000, last_hits: 200, denies: 5,
  gpm: 450, xpm: 600, hero_damage: 15000, hero_healing: 0,
});
const match = (extra = {}) => ({
  v: 2, private: false, team_a: "Rules Test A", team_b: "Rules Test B", score_a: 10, score_b: 10, winner: "a",
  duration_sec: 2400, game_mode: "Captains Mode", players: [...Array(10)].map((_, i) => player(i)),
  uid: "u1", createdAt: NOW, ...extra,
});
const privateMatch = (extra = {}) => { const m = match({ private: true, ...extra }); delete m.players; return m; };
const req = (data, auth = { uid: "u1" }) => ({ auth, method: "create", path: PATH, time: NOW, resource: { data } });
// Delete: `existing` is the stored document the rule sees as `resource`.
const del = (existing, auth) => ({ request: { auth, method: "delete", path: PATH, time: NOW }, resource: { data: existing } });

// Update: `existing` is the stored document, `data` what the edit writes.
const upd = (existing, data, auth = { uid: "u2" }, path = PATH) => ({ request: { auth, method: "update", path, time: "2026-09-25T04:00:00Z", resource: { data } }, resource: { data: existing } });
const UNT_PATH = PATH.replace("/matches/", "/ad2l_unticketed/");
const PRED_PATH = "/databases/(default)/documents/scrimLeague/data/predictions/20621_u1";
const pred = (extra = {}) => ({ v: 1, league: "ad2l", series_id: 20621, pick: "home", name: "Rules Test", uid: "u1", updatedAt: NOW, ...extra });
const predReq = (data, auth = { uid: "u1" }) => ({ auth, method: "create", path: PRED_PATH, time: NOW, resource: { data } });
const BR_PATH = "/databases/(default)/documents/scrimLeague/data/brackets/ad2l_u1";
const bracket = (extra = {}) => ({ v: 1, league: "ad2l", name: "Rules Test", uid: "u1", picks: '{"tb:3-5":5,"pick":4}', updatedAt: NOW, ...extra });
const brReq = (data, auth = { uid: "u1" }, path = BR_PATH) => ({ auth, method: "create", path, time: NOW, resource: { data } });
const FAN_PATH = "/databases/(default)/documents/scrimLeague/data/fantasy/ad2l_2026-10-12_173365627";
const STEAM = { uid: "steam:173365627", token: { steam: 173365627 } };
const fantasy = (extra = {}) => ({ v: 1, league: "ad2l", week: "2026-10-12", account: 173365627, picks: [75379546, 192871338, 66653545, 349392031, 239724237], name: "Rules Test", uid: "steam:173365627", updatedAt: NOW, ...extra });
const fanReq = (data, auth = STEAM, path = FAN_PATH) => ({ auth, method: "create", path, time: NOW, resource: { data } });
const CARD_PATH = "/databases/(default)/documents/scrimLeague/data/cards/173365627";
const card = (extra = {}) => ({ v: 1, account: 173365627, hero: 87, pos: 4, uid: "steam:173365627", updatedAt: NOW, ...extra });
const cardReq = (data, auth = STEAM, path = CARD_PATH) => ({ auth, method: "create", path, time: NOW, resource: { data } });
const FIX_ID = "AbCdEfGhIjKlMnOpQrSt";
const FIX_PATH = `/databases/(default)/documents/scrimLeague/data/scrim_fixtures/${FIX_ID}`;
const fixture = (extra = {}) => ({ v: 1, team_a: "Rules Test A", team_b: "Rules Test B", start: "2026-09-26T02:00:00Z", best_of: 2, uid: "u1", createdAt: NOW, ...extra });
const fixReq = (data, auth = { uid: "u1" }, path = FIX_PATH) => ({ auth, method: "create", path, time: NOW, resource: { data } });
const fixUpd = (existing, data, auth = { uid: "u2" }) => ({ request: { auth, method: "update", path: FIX_PATH, time: NOW, resource: { data } }, resource: { data: existing } });
const SCRIM_PRED_PATH = `/databases/(default)/documents/scrimLeague/data/predictions/${FIX_ID}_u1`;
const CAST_PATH = `/databases/(default)/documents/scrimLeague/data/casts/${FIX_ID}`;
const cast = (extra = {}) => ({ v: 1, league: "ad2l", game: "8412345678", url: "https://www.youtube.com/watch?v=abc123", caster: "Rules Test", uid: "u1", createdAt: NOW, ...extra });
const castReq = (data, auth = { uid: "u1" }, path = CAST_PATH) => ({ auth, method: "create", path, time: NOW, resource: { data } });
// Feedback: batched writes, so the other documents in the batch are mocked (exists = before
// the batch, existsAfter/getAfter = after it).
const DOCS = "/databases/(default)/documents/scrimLeague/data";
const TICKET_ID = "FbTicket0123456789Ab";
const TICKET_PATH = `${DOCS}/feedback/${TICKET_ID}`;
const LIMIT_PATH = `${DOCS}/feedback_limits/u1`;
const mock = (fn, value) => ({ function: fn, args: [{ anyValue: {} }], result: { value } });
const ticket = (extra = {}) => ({ v: 1, name: "Rules Test", uid: "u1", items: 2, status: "open", createdAt: NOW, ...extra });
const ticketReq = (data, { last = TICKET_ID, auth = { uid: "u1" }, path = TICKET_PATH } = {}) => ({
  request: { auth, method: "create", path, time: NOW, resource: { data } },
  functionMocks: [mock("getAfter", { data: { last } })],
});
const fbItem = (extra = {}) => ({
  v: 1, kind: "snip", page: "https://dota2scrimcircuittracker.github.io/warrior/players/?tab=tiers", league: "warrior", theme: "dark", viewport: { w: 1440, h: 900 },
  note: "Make the tier letters bigger", area: { x: 10, y: 300, w: 600, h: 240 }, target: null, strokes: null,
  shot: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD=", uid: "u1", createdAt: NOW, ...extra,
});
const itemReq = (data, { n = "1", before = false, parent = ticket(), auth = { uid: "u1" } } = {}) => ({
  request: { auth, method: "create", path: `${TICKET_PATH}/items/${n}`, time: NOW, resource: { data } },
  functionMocks: [mock("exists", before), mock("getAfter", { data: parent })],
});
const HOUR_AGO = "2026-09-24T02:59:00Z";
const EPOCH = "1970-01-01T00:00:00Z";
const limits = (extra = {}) => ({ t0: NOW, t1: EPOCH, t2: EPOCH, t3: EPOCH, t4: EPOCH, i: 1, last: TICKET_ID, ...extra });
const limitReq = (method, data, existing, { before = false, after = true, auth = { uid: "u1" } } = {}) => ({
  request: { auth, method, path: LIMIT_PATH, time: NOW, resource: { data } },
  ...(existing ? { resource: { data: existing } } : {}),
  functionMocks: [mock("exists", before), mock("existsAfter", after)],
});
const fullRing = { t0: HOUR_AGO, t1: "2026-09-24T03:10:00Z", t2: "2026-09-24T03:20:00Z", t3: "2026-09-24T03:30:00Z", t4: "2026-09-24T03:40:00Z", i: 0, last: "OldTicket00000000000" };
const feedbackCases = [
  ["feedback: ticket", ticketReq(ticket()), "ALLOW"],
  ["feedback: ticket without the limiter naming it", ticketReq(ticket(), { last: "OtherTicket000000000" }), "DENY"],
  ["feedback: ticket signed out", ticketReq(ticket(), { auth: null }), "DENY"],
  ["feedback: ticket for another uid", ticketReq(ticket({ uid: "u2" })), "DENY"],
  ["feedback: ticket, empty name", ticketReq(ticket({ name: "" })), "DENY"],
  ["feedback: ticket, 41-char name", ticketReq(ticket({ name: "N".repeat(41) })), "DENY"],
  ["feedback: ticket, 11 items", ticketReq(ticket({ items: 11 })), "DENY"],
  ["feedback: ticket, status done", ticketReq(ticket({ status: "done" })), "DENY"],
  ["feedback: ticket, client createdAt", ticketReq(ticket({ createdAt: "2020-01-01T00:00:00Z" })), "DENY"],
  ["feedback: ticket, extra field", ticketReq(ticket({ email: "x@y.z" })), "DENY"],
  ["feedback: ticket, bad id", ticketReq(ticket(), { path: TICKET_PATH.replace(TICKET_ID, "short") }), "DENY"],
  ["feedback: anonymous read denied", { request: { auth: { uid: "u1" }, method: "get", path: TICKET_PATH, time: NOW }, resource: { data: ticket() } }, "DENY"],
  ["feedback: signed-out list denied", { request: { auth: null, method: "list", path: TICKET_PATH, time: NOW } }, "DENY"],
  ["feedback: admin read", { request: { auth: { uid: "admin", token: { email: "jonahbyu@gmail.com" } }, method: "get", path: TICKET_PATH, time: NOW }, resource: { data: ticket() } }, "ALLOW"],
  ["feedback: anonymous delete denied", { request: { auth: { uid: "u1" }, method: "delete", path: TICKET_PATH, time: NOW }, resource: { data: ticket() } }, "DENY"],
  ["feedback: update denied", { request: { auth: { uid: "u1" }, method: "update", path: TICKET_PATH, time: NOW, resource: { data: ticket({ name: "X" }) } }, resource: { data: ticket() } }, "DENY"],
  ["feedback: snip item", itemReq(fbItem()), "ALLOW"],
  ["feedback: click item", itemReq(fbItem({ kind: "click", target: { sel: "#tiers > div:nth-of-type(2)", text: "S tier" } })), "ALLOW"],
  ["feedback: draw item, no shot", itemReq(fbItem({ kind: "draw", strokes: "M10 10L20 20", shot: null })), "ALLOW"],
  ["feedback: biggest item", itemReq(fbItem({ note: "N".repeat(1000), strokes: "M".repeat(20000), shot: "data:image/jpeg;base64," + "A".repeat(699000) })), "ALLOW"],
  ["feedback: item added to an existing ticket", itemReq(fbItem(), { before: true }), "DENY"],
  ["feedback: item past the ticket's count", itemReq(fbItem(), { n: "2" }), "DENY"],
  ["feedback: item on someone else's ticket", itemReq(fbItem(), { parent: ticket({ uid: "u2" }) }), "DENY"],
  ["feedback: item for another uid", itemReq(fbItem({ uid: "u2" })), "DENY"],
  ["feedback: item, empty note", itemReq(fbItem({ note: "" })), "DENY"],
  ["feedback: item, oversize shot", itemReq(fbItem({ shot: "data:image/jpeg;base64," + "A".repeat(700000) })), "DENY"],
  ["feedback: item, png shot", itemReq(fbItem({ shot: "data:image/png;base64,AAAA" })), "DENY"],
  ["feedback: item, shot with markup", itemReq(fbItem({ shot: "data:image/jpeg;base64,AA<script>" })), "DENY"],
  ["feedback: item, unknown kind", itemReq(fbItem({ kind: "video" })), "DENY"],
  ["feedback: item, extra field", itemReq(fbItem({ ip: "1.2.3.4" })), "DENY"],
  ["feedback: item, localhost page", itemReq(fbItem({ page: "http://localhost:3000/scrims/" })), "ALLOW"],
  ["feedback: item, other site", itemReq(fbItem({ page: "https://evil.example/" })), "DENY"],
  ["feedback: item, lookalike host", itemReq(fbItem({ page: "https://dota2scrimcircuittracker.github.io.evil.example/" })), "DENY"],
  ["feedback: limiter, first ticket with null slots", limitReq("create", limits({ t1: null })), "DENY"],
  ["feedback: item, bad n", itemReq(fbItem(), { n: "x" }), "DENY"],
  ["feedback: limiter, first ticket", limitReq("create", limits()), "ALLOW"],
  ["feedback: limiter, first ticket without a new ticket", limitReq("create", limits(), null, { after: false }), "DENY"],
  ["feedback: limiter, first ticket naming an old one", limitReq("create", limits(), null, { before: true }), "DENY"],
  ["feedback: limiter, first ticket, client time", limitReq("create", limits({ t0: "2020-01-01T00:00:00Z" })), "DENY"],
  ["feedback: limiter, another browser's", limitReq("create", limits(), null, { auth: { uid: "u2" } }), "DENY"],
  ["feedback: limiter, 2nd ticket", limitReq("update", limits({ t0: "2026-09-24T03:50:00Z", t1: NOW, i: 2 }), limits({ t0: "2026-09-24T03:50:00Z", last: "OldTicket00000000000" })), "ALLOW"],
  ["feedback: limiter, 6th ticket after an hour", limitReq("update", { ...fullRing, t0: NOW, i: 1, last: TICKET_ID }, fullRing), "ALLOW"],
  ["feedback: limiter, 6th ticket within the hour", limitReq("update", { ...fullRing, t0: NOW, i: 1, last: TICKET_ID }, { ...fullRing, t0: "2026-09-24T03:05:00Z" }), "DENY"],
  ["feedback: limiter, skipping a slot", limitReq("update", { ...fullRing, t1: NOW, i: 2, last: TICKET_ID }, fullRing), "DENY"],
  ["feedback: limiter, wiping the slots", limitReq("update", { ...fullRing, t0: NOW, t1: EPOCH, t2: EPOCH, t3: EPOCH, t4: EPOCH, i: 1, last: TICKET_ID }, fullRing), "DENY"],
  ["feedback: limiter, not advancing i", limitReq("update", { ...fullRing, t0: NOW, last: TICKET_ID }, fullRing), "DENY"],
  ["feedback: limiter, own read", { request: { auth: { uid: "u1" }, method: "get", path: LIMIT_PATH, time: NOW }, resource: { data: limits() } }, "ALLOW"],
  ["feedback: limiter, someone else's read", { request: { auth: { uid: "u2" }, method: "get", path: LIMIT_PATH, time: NOW }, resource: { data: limits() } }, "DENY"],
  ["feedback: limiter, delete denied", { request: { auth: { uid: "u1" }, method: "delete", path: LIMIT_PATH, time: NOW }, resource: { data: limits() } }, "DENY"],
];
const withPlayer = (i, change) => ({ ...match(), players: match().players.map((p, j) => (j === i ? change({ ...p }) : p)) });
const cases = [
  ["valid match", req(match()), "ALLOW"],
  ["valid, long names + max level + big numbers", req(withPlayer(9, (p) => ({ ...p, name: "N".repeat(32), hero: "Vengeful Spirit", level: 30, hero_damage: 150000, tag: "TAG" }))), "ALLOW"],
  ["no auth", req(match(), null), "DENY"],
  ["someone else's uid", req(match({ uid: "u2" })), "DENY"],
  ["client createdAt", req(match({ createdAt: "2020-01-01T00:00:00Z" })), "DENY"],
  ["extra top-level field", req(match({ admin: true })), "DENY"],
  ["v missing", req((() => { const m = match(); delete m.v; return m; })()), "DENY"],
  ["same team twice", req(match({ team_b: "rules test a" })), "DENY"],
  ["winner 'c'", req(match({ winner: "c" })), "DENY"],
  ["duration 30s", req(match({ duration_sec: 30 })), "DENY"],
  ["score as string", req(match({ score_a: "10" })), "DENY"],
  ["9 players", req({ ...match(), players: match().players.slice(0, 9) }), "DENY"],
  ["level 99", req(withPlayer(3, (p) => ({ ...p, level: 99 }))), "DENY"],
  ["kills as string", req(withPlayer(0, (p) => ({ ...p, kills: "9" }))), "DENY"],
  ["gpm as float", req(withPlayer(2, (p) => ({ ...p, gpm: 450.5 }))), "DENY"],
  ["extra player field", req(withPlayer(1, (p) => ({ ...p, mmr: 5000 }))), "DENY"],
  ["missing player field", req(withPlayer(1, (p) => { delete p.denies; return p; })), "DENY"],
  ["team B slot marked a", req(withPlayer(6, (p) => ({ ...p, team: "a" }))), "DENY"],
  ["hero name 100 chars", req(withPlayer(5, (p) => ({ ...p, hero: "H".repeat(100) }))), "DENY"],
  ["name is a number", req(withPlayer(4, (p) => ({ ...p, name: 42 }))), "DENY"],
  ["old v1 shape", req(match({ v: 1 })), "DENY"],
  ["private: results only", req(privateMatch()), "ALLOW"],
  ["private but with players", req(match({ private: true })), "DENY"],
  ["public but without players", req((() => { const m = match(); delete m.players; return m; })()), "DENY"],
  ["private flag missing", req((() => { const m = privateMatch(); delete m.private; return m; })()), "DENY"],
  ["private flag not a bool", req(privateMatch({ private: "yes" })), "DENY"],
  ["private with extra field", req(privateMatch({ heroes: "Kez" })), "DENY"],
  ["private, bad winner", req(privateMatch({ winner: "c" })), "DENY"],
  ["valid match with pick order", req({ ...match(), players: match().players.map((p, i) => ({ ...p, pick: i + 1 })) }), "ALLOW"],
  ["unticketed with pick order", { ...req({ ...match({ series_id: 20690 }), players: match().players.map((p, i) => ({ ...p, pick: 10 - i })) }), path: PATH.replace("/matches/", "/ad2l_unticketed/") }, "ALLOW"],
  ["worst case: long names + big numbers + pick order", req({ ...match(), players: match().players.map((p, i) => ({ ...p, name: "N".repeat(32), hero: "Vengeful Spirit", level: 30, hero_damage: 150000, tag: "TAG", pick: i + 1 })) }), "ALLOW"],
  ["pick as float", req(withPlayer(2, (p) => ({ ...p, pick: 2.5 }))), "DENY"],
  ["pick as string", req(withPlayer(2, (p) => ({ ...p, pick: "3" }))), "DENY"],
  ["pick in place of a stat", req(withPlayer(2, (p) => { delete p.denies; return { ...p, pick: 3 }; })), "DENY"],
  ["pick plus an extra field", req(withPlayer(2, (p) => ({ ...p, pick: 3, mmr: 1 }))), "DENY"],
  ["unticketed with series_id", { ...req(match({ series_id: 20690 })), path: PATH.replace("/matches/", "/ad2l_unticketed/") }, "ALLOW"],
  ["worst case: unticketed + series_id + long names + pick order", { ...req({ ...match({ series_id: 20690 }), players: match().players.map((p, i) => ({ ...p, name: "N".repeat(32), hero: "Vengeful Spirit", level: 30, hero_damage: 150000, tag: "TAG", pick: i + 1 })) }), path: PATH.replace("/matches/", "/ad2l_unticketed/") }, "ALLOW"],
  ["scrim with series_id", req(match({ series_id: 20690 })), "DENY"],
  ["unticketed, series_id as string", { ...req(match({ series_id: "20690" })), path: PATH.replace("/matches/", "/ad2l_unticketed/") }, "DENY"],
  ["unticketed, series_id plus extra field", { ...req(match({ series_id: 20690, admin: true })), path: PATH.replace("/matches/", "/ad2l_unticketed/") }, "DENY"],
  ["private scrim with series_id", req(privateMatch({ series_id: 20690 })), "DENY"],
  ["uploader deletes own scrim", del(match(), { uid: "u1" }), "ALLOW"],
  ["someone else deletes it (anyone signed in may)", del(match(), { uid: "u2" }), "ALLOW"],
  ["delete in an unknown collection", { ...del(match(), { uid: "u1" }), request: { ...del(match(), { uid: "u1" }).request, path: PATH.replace("/matches/", "/anything/") } }, "DENY"],
  ["signed-out delete", del(match(), null), "DENY"],
  ["admin deletes any", del(match(), { uid: "admin", token: { email: "jonahbyu@gmail.com" } }), "ALLOW"],
  ["unticketed AD2L game", { ...req(match({ series_id: 20690 })), path: PATH.replace("/matches/", "/ad2l_unticketed/") }, "ALLOW"],
  ["unticketed without series_id", { ...req(match()), path: PATH.replace("/matches/", "/ad2l_unticketed/") }, "DENY"],
  ["unticketed, bad shape", { ...req(match({ series_id: 20690, admin: true })), path: PATH.replace("/matches/", "/ad2l_unticketed/") }, "DENY"],
  ["unknown collection", { ...req(match()), path: PATH.replace("/matches/", "/anything/") }, "DENY"],
  ["prediction: valid", predReq(pred()), "ALLOW"],
  ["prediction: change own pick (update)", { ...predReq(pred({ pick: "tie" })), method: "update" }, "ALLOW"],
  ["bracket: own, valid", brReq(bracket()), "ALLOW"],
  ["bracket: not signed in", brReq(bracket(), null), "DENY"],
  ["bracket: id for another uid", brReq(bracket(), { uid: "u1" }, BR_PATH.replace("_u1", "_u2")), "DENY"],
  ["bracket: id with another league", brReq(bracket({ league: "heroic" })), "DENY"],
  ["bracket: unknown league", brReq(bracket({ league: "scrim" }), { uid: "u1" }, BR_PATH.replace("ad2l", "scrim")), "DENY"],
  ["bracket: picks not text", brReq(bracket({ picks: { pick: 4 } })), "DENY"],
  ["bracket: picks too long", brReq(bracket({ picks: "x".repeat(3001) })), "DENY"],
  ["bracket: stale updatedAt", brReq(bracket({ updatedAt: "2026-01-01T00:00:00Z" })), "DENY"],
  ["fantasy: own, valid", fanReq(fantasy()), "ALLOW"],
  ["fantasy: captain in lineup", fanReq(fantasy({ captain: 75379546 })), "ALLOW"],
  ["fantasy: captain outside lineup", fanReq(fantasy({ captain: 999 })), "DENY"],
  ["fantasy: captain must be integer", fanReq(fantasy({ captain: "75379546" })), "DENY"],
  ["fantasy: shared test league", fanReq(fantasy({ league: "all" }), STEAM, FAN_PATH.replace("ad2l", "all")), "ALLOW"],
  ["fantasy: anonymous sign-in", fanReq(fantasy({ uid: "u1" }), { uid: "u1" }), "DENY"],
  ["fantasy: uid not the steam account", fanReq(fantasy({ uid: "steam:1" }), { uid: "steam:1", token: { steam: 173365627 } }), "DENY"],
  ["fantasy: someone else's account", fanReq(fantasy({ account: 1 }), STEAM, FAN_PATH.replace("_173365627", "_1")), "DENY"],
  ["fantasy: id for another week", fanReq(fantasy(), STEAM, FAN_PATH.replace("2026-10-12", "2026-10-19")), "DENY"],
  ["fantasy: picks themselves", fanReq(fantasy({ picks: [173365627, 192871338, 66653545, 349392031, 239724237] })), "DENY"],
  ["fantasy: same player twice", fanReq(fantasy({ picks: [75379546, 75379546, 66653545, 349392031, 239724237] })), "DENY"],
  ["fantasy: four picks", fanReq(fantasy({ picks: [75379546, 192871338, 66653545, 349392031] })), "DENY"],
  ["fantasy: pick not a number", fanReq(fantasy({ picks: ["75379546", 192871338, 66653545, 349392031, 239724237] })), "DENY"],
  ["fantasy: unknown league", fanReq(fantasy({ league: "scrim" }), STEAM, FAN_PATH.replace("ad2l", "scrim")), "DENY"],
  ["fantasy: stale updatedAt", fanReq(fantasy({ updatedAt: "2026-01-01T00:00:00Z" })), "DENY"],
  ["fantasy: extra field", fanReq(fantasy({ score: 999 })), "DENY"],
  ["card: own, valid", cardReq(card()), "ALLOW"],
  ["card: back to auto (nulls)", cardReq(card({ hero: null, pos: null })), "ALLOW"],
  ["card: own crop", cardReq(card({ crop: { x: 20, y: 70, zoom: 1.5 } })), "ALLOW"],
  ["card: default crop", cardReq(card({ crop: null })), "ALLOW"],
  ["card: excessive zoom", cardReq(card({ crop: { x: 50, y: 50, zoom: 4 } })), "DENY"],
  ["card: negative pan", cardReq(card({ crop: { x: -1, y: 50, zoom: 1 } })), "DENY"],
  ["card: incomplete crop", cardReq(card({ crop: { x: 50, zoom: 1 } })), "DENY"],
  ["card: extra crop field", cardReq(card({ crop: { x: 50, y: 50, zoom: 1, admin: true } })), "DENY"],
  ["card: own art and filter", cardReq(card({ art: "ls:123456abcdef", style: "frost" })), "ALLOW"],
  ["card: default art and filter", cardReq(card({ art: null, style: null })), "ALLOW"],
  ["card: custom URL denied", cardReq(card({ art: "https://example.com/logo.png", style: "clean" })), "DENY"],
  ["card: unknown filter", cardReq(card({ art: "crop", style: "unknown" })), "DENY"],
  ["card: art choice as number", cardReq(card({ art: 123 })), "DENY"],
  ["card: someone else's card", cardReq(card({ account: 1 }), STEAM, CARD_PATH.replace("173365627", "1")), "DENY"],
  ["card: id not the signed-in account", cardReq(card(), STEAM, CARD_PATH.replace("173365627", "1")), "DENY"],
  ["card: anonymous sign-in", cardReq(card({ uid: "u1" }), { uid: "u1" }), "DENY"],
  ["card: pos 6", cardReq(card({ pos: 6 })), "DENY"],
  ["card: hero as a name", cardReq(card({ hero: "Disruptor" })), "DENY"],
  ["card: stale updatedAt", cardReq(card({ updatedAt: "2026-01-01T00:00:00Z" })), "DENY"],
  ["card: extra field", cardReq(card({ tier: "S" })), "DENY"],
  ["bracket: extra field", brReq(bracket({ admin: true })), "DENY"],
  ["bracket: empty name", brReq(bracket({ name: "" })), "DENY"],
  ["prediction: id for another uid", { ...predReq(pred()), path: PRED_PATH.replace("_u1", "_u2") }, "DENY"],
  ["prediction: id for another series", { ...predReq(pred({ series_id: 99 })) }, "DENY"],
  ["prediction: client timestamp", predReq(pred({ updatedAt: "2020-01-01T00:00:00Z" })), "DENY"],
  ["prediction: bad pick", predReq(pred({ pick: "2-0" })), "DENY"],
  ["prediction: empty name", predReq(pred({ name: "" })), "DENY"],
  ["prediction: 40-char name", predReq(pred({ name: "N".repeat(40) })), "DENY"],
  ["prediction: extra field", predReq(pred({ points: 99 })), "DENY"],
  ["prediction: signed out", predReq(pred(), null), "DENY"],
  ["prediction: scrim fixture", { ...predReq(pred({ league: "scrim", series_id: FIX_ID })), path: SCRIM_PRED_PATH }, "ALLOW"],
  ["prediction: scrim with a number id", { ...predReq(pred({ league: "scrim" })) }, "DENY"],
  ["prediction: ad2l with a fixture id", { ...predReq(pred({ series_id: FIX_ID })), path: SCRIM_PRED_PATH }, "DENY"],
  ["prediction: unknown league", predReq(pred({ league: "nba" })), "DENY"],
  ["fixture: valid", fixReq(fixture()), "ALLOW"],
  ["fixture: Bo3 two days ahead", fixReq(fixture({ best_of: 3 })), "ALLOW"],
  ["fixture: signed out", fixReq(fixture(), null), "DENY"],
  ["fixture: someone else's uid", fixReq(fixture({ uid: "u2" })), "DENY"],
  ["fixture: client createdAt", fixReq(fixture({ createdAt: "2020-01-01T00:00:00Z" })), "DENY"],
  ["fixture: same team twice", fixReq(fixture({ team_b: "rules test a" })), "DENY"],
  ["fixture: Bo5", fixReq(fixture({ best_of: 5 })), "DENY"],
  ["fixture: start as string", fixReq(fixture({ start: "tomorrow" })), "DENY"],
  ["fixture: start a year out", fixReq(fixture({ start: "2027-09-26T02:00:00Z" })), "DENY"],
  ["fixture: start a week ago", fixReq(fixture({ start: "2026-09-17T02:00:00Z" })), "DENY"],
  ["fixture: extra field", fixReq(fixture({ winner: "a" })), "DENY"],
  ["fixture: empty team", fixReq(fixture({ team_a: "" })), "DENY"],
  ["fixture: bad id", fixReq(fixture(), undefined, FIX_PATH.replace(FIX_ID, "short")), "DENY"],
  ["fixture: reschedule", fixUpd(fixture(), fixture({ start: "2026-09-27T02:00:00Z", best_of: 3 })), "ALLOW"],
  ["fixture: rename team on update", fixUpd(fixture(), fixture({ team_a: "Other" })), "DENY"],
  ["fixture: change uploader on update", fixUpd(fixture(), fixture({ uid: "u2" })), "DENY"],
  ["fixture: delete (anyone signed in)", { request: { auth: { uid: "u2" }, method: "delete", path: FIX_PATH, time: NOW }, resource: { data: fixture() } }, "ALLOW"],
  ["fixture: signed-out delete", { request: { auth: null, method: "delete", path: FIX_PATH, time: NOW }, resource: { data: fixture() } }, "DENY"],
  ["edit: fix a player name", upd(match(), withPlayer(3, (p) => ({ ...p, name: "Fixed Name" }))), "ALLOW"],
  ["edit: worst case (long names + pick order)", upd(match(), { ...match(), players: match().players.map((p, i) => ({ ...p, name: "N".repeat(32), hero: "Vengeful Spirit", level: 30, hero_damage: 150000, tag: "TAG", pick: i + 1 })) }), "ALLOW"],
  ["edit: private result, rename team", upd(privateMatch(), privateMatch({ team_a: "Renamed" })), "ALLOW"],
  ["edit: unticketed, same series", upd(match({ series_id: 20690 }), match({ series_id: 20690, team_a: "Renamed" }), undefined, UNT_PATH), "ALLOW"],
  ["edit: signed out", upd(match(), match({ team_a: "Renamed" }), null), "DENY"],
  ["edit: change uploader", upd(match(), match({ uid: "u2" })), "DENY"],
  ["edit: change upload time", upd(match(), match({ createdAt: "2026-09-25T04:00:00Z" })), "DENY"],
  ["edit: public to private", upd(match(), privateMatch()), "DENY"],
  ["edit: change series", upd(match({ series_id: 20690 }), match({ series_id: 20691 }), undefined, UNT_PATH), "DENY"],
  ["edit: bad shape", upd(match(), match({ admin: true })), "DENY"],
  ["edit: level 99", upd(match(), withPlayer(3, (p) => ({ ...p, level: 99 }))), "DENY"],
  ["uploader deletes own unticketed game", { ...del(match(), { uid: "u1" }), request: { ...del(match(), { uid: "u1" }).request, path: PATH.replace("/matches/", "/ad2l_unticketed/") } }, "ALLOW"],
  // Heroic/Aegis: same rules in its own collection; picks with league "heroic".
  ["heroic: unticketed game", { ...req(match({ series_id: 20690 })), path: PATH.replace("/matches/", "/heroic_unticketed/") }, "ALLOW"],
  ["heroic: worst case (budget)", { ...req({ ...match({ series_id: 20690 }), players: match().players.map((p, i) => ({ ...p, name: "N".repeat(32), hero: "Vengeful Spirit", level: 30, hero_damage: 150000, tag: "TAG", pick: i + 1 })) }), path: PATH.replace("/matches/", "/heroic_unticketed/") }, "ALLOW"],
  ["heroic: unticketed without series_id", { ...req(match()), path: PATH.replace("/matches/", "/heroic_unticketed/") }, "DENY"],
  ["heroic: edit, same series", upd(match({ series_id: 20690 }), match({ series_id: 20690, team_a: "Renamed" }), undefined, PATH.replace("/matches/", "/heroic_unticketed/")), "ALLOW"],
  ["heroic: delete", { ...del(match(), { uid: "u1" }), request: { ...del(match(), { uid: "u1" }).request, path: PATH.replace("/matches/", "/heroic_unticketed/") } }, "ALLOW"],
  ["heroic: unknown collection still denied", { ...req(match({ series_id: 20690 })), path: PATH.replace("/matches/", "/aegis_unticketed/") }, "DENY"],
  ["prediction: heroic", predReq(pred({ league: "heroic" })), "ALLOW"],
  // Conqueror: same again.
  ["conqueror: unticketed game", { ...req(match({ series_id: 20690 })), path: PATH.replace("/matches/", "/conqueror_unticketed/") }, "ALLOW"],
  ["conqueror: unticketed without series_id", { ...req(match()), path: PATH.replace("/matches/", "/conqueror_unticketed/") }, "DENY"],
  ["conqueror: delete", { ...del(match(), { uid: "u1" }), request: { ...del(match(), { uid: "u1" }).request, path: PATH.replace("/matches/", "/conqueror_unticketed/") } }, "ALLOW"],
  ["prediction: conqueror", predReq(pred({ league: "conqueror" })), "ALLOW"],
  ["warrior: unticketed game", { ...req(match({ series_id: 20690 })), path: PATH.replace("/matches/", "/warrior_unticketed/") }, "ALLOW"],
  ["warrior: worst case (budget)", { ...req({ ...match({ series_id: 20690 }), players: match().players.map((p, i) => ({ ...p, name: "N".repeat(32), hero: "Vengeful Spirit", level: 30, hero_damage: 150000, tag: "TAG", pick: i + 1 })) }), path: PATH.replace("/matches/", "/warrior_unticketed/") }, "ALLOW"],
  // knownColl() is a regex: it must match whole names only.
  ["collection: prefix of a known name denied", { ...req(match({ series_id: 20690 })), path: PATH.replace("/matches/", "/warrior_unticketedx/") }, "DENY"],
  ["collection: suffix match denied", { ...req(match()), path: PATH.replace("/matches/", "/xmatches/") }, "DENY"],
  ["collection: bare division name denied", { ...req(match({ series_id: 20690 })), path: PATH.replace("/matches/", "/warrior/") }, "DENY"],
  ["warrior: unticketed without series_id", { ...req(match()), path: PATH.replace("/matches/", "/warrior_unticketed/") }, "DENY"],
  ["prediction: warrior", predReq(pred({ league: "warrior" })), "ALLOW"],
  ["challenger: unticketed game", { ...req(match({ series_id: 20690 })), path: PATH.replace("/matches/", "/challenger_unticketed/") }, "ALLOW"],
  ["challenger: worst case (budget)", { ...req({ ...match({ series_id: 20690 }), players: match().players.map((p, i) => ({ ...p, name: "N".repeat(32), hero: "Vengeful Spirit", level: 30, hero_damage: 150000, tag: "TAG", pick: i + 1 })) }), path: PATH.replace("/matches/", "/challenger_unticketed/") }, "ALLOW"],
  ["prediction: challenger", predReq(pred({ league: "challenger" })), "ALLOW"],
  ["voyager: unticketed game", { ...req(match({ series_id: 20690 })), path: PATH.replace("/matches/", "/voyager_unticketed/") }, "ALLOW"],
  ["explorer: worst case (budget)", { ...req({ ...match({ series_id: 20690 }), players: match().players.map((p, i) => ({ ...p, name: "N".repeat(32), hero: "Vengeful Spirit", level: 30, hero_damage: 150000, tag: "TAG", pick: i + 1 })) }), path: PATH.replace("/matches/", "/explorer_unticketed/") }, "ALLOW"],
  ["prediction: voyager", predReq(pred({ league: "voyager" })), "ALLOW"],
  ["prediction: explorer", predReq(pred({ league: "explorer" })), "ALLOW"],
  ["prediction: unknown league", predReq(pred({ league: "knight" })), "DENY"],
  ["cast: valid", castReq(cast()), "ALLOW"],
  ["cast: scrim upload id", castReq(cast({ league: "scrim", game: "0123456789abcdef0123456789abcdef" })), "ALLOW"],
  ["cast: twitch, 40-char caster", castReq(cast({ url: "https://www.twitch.tv/videos/123", caster: "C".repeat(40) })), "ALLOW"],
  ["cast: signed out", castReq(cast(), null), "DENY"],
  ["cast: someone else's uid", castReq(cast({ uid: "u2" })), "DENY"],
  ["cast: client createdAt", castReq(cast({ createdAt: "2020-01-01T00:00:00Z" })), "DENY"],
  ["cast: http url", castReq(cast({ url: "http://youtube.com/x" })), "DENY"],
  ["cast: javascript url", castReq(cast({ url: "javascript:alert(1)" })), "DENY"],
  ["cast: url with a space", castReq(cast({ url: "https://a.com/x y" })), "DENY"],
  ["cast: url with a quote", castReq(cast({ url: 'https://a.com/x"onclick=1' })), "DENY"],
  ["cast: 400-char url", castReq(cast({ url: "https://a.com/" + "x".repeat(390) })), "DENY"],
  ["cast: empty caster", castReq(cast({ caster: "" })), "DENY"],
  ["cast: 41-char caster", castReq(cast({ caster: "C".repeat(41) })), "DENY"],
  ["cast: bad game id", castReq(cast({ game: "../matches/x" })), "DENY"],
  ["cast: game as number", castReq(cast({ game: 8412345678 })), "DENY"],
  ["cast: unknown league", castReq(cast({ league: "nba" })), "DENY"],
  ["cast: extra field", castReq(cast({ views: 9 })), "DENY"],
  ["cast: bad id", castReq(cast(), undefined, CAST_PATH.replace(FIX_ID, "short")), "DENY"],
  ["cast: update denied", { request: { auth: { uid: "u1" }, method: "update", path: CAST_PATH, time: NOW, resource: { data: cast({ caster: "Other" }) } }, resource: { data: cast() } }, "DENY"],
  ["cast: delete (anyone signed in)", { request: { auth: { uid: "u2" }, method: "delete", path: CAST_PATH, time: NOW }, resource: { data: cast() } }, "ALLOW"],
  ["cast: signed-out delete", { request: { auth: null, method: "delete", path: CAST_PATH, time: NOW }, resource: { data: cast() } }, "DENY"],
  ["prediction: heroic with a fixture id", { ...predReq(pred({ league: "heroic", series_id: FIX_ID })), path: SCRIM_PRED_PATH }, "DENY"],
  ...feedbackCases,
];

(async () => {
  const acct = require("firebase-tools/lib/auth").getGlobalDefaultAccount();
  await requireAuth({ project: "pistachio-kitchen", user: acct.user, tokens: acct.tokens });
  const c = new Client({ urlPrefix: "https://firebaserules.googleapis.com", apiVersion: "v1" });
  const body = {
    source: { files: [{ name: "firestore.rules", content: source }] },
    testSuite: {
      testCases: cases.map(([, r, expectation]) => ({
        ...(r.request ? r : { request: r }), expectation, expressionReportLevel: "VISITED",
      })),
    },
  };
  const res = (await c.post("/projects/pistachio-kitchen:test", body)).body;
  for (const issue of res.issues ?? []) console.log("ISSUE:", issue.severity, issue.description, JSON.stringify(issue.sourcePosition));
  res.testResults?.forEach((r, i) => {
    console.log(`${r.state === "SUCCESS" ? "PASS" : "FAIL"}  ${cases[i][0]} (want ${cases[i][2]})`);
    if (r.state !== "SUCCESS") {
      console.log("   debug:", JSON.stringify(r.debugMessages ?? []).slice(0, 600));
      const falses = (r.visitedExpressions ?? []).filter((e) => e.value?.boolValue === false).slice(0, 12);
      for (const e of falses) console.log("   false at line", e.sourcePosition?.line, "col", e.sourcePosition?.column);
      if (r.errorPosition) console.log("   error at", JSON.stringify(r.errorPosition));
      if (process.env.RULES_DEBUG) {
        // The innermost expressions that came out false or errored, with their source text.
        const leaves = [];
        const walk = (n) => { const bad = (n.values ?? []).some((v) => v.value === false || (typeof v.value === "string" && v.value.startsWith("||"))); const kids = (n.children ?? []).filter((c) => (c.values ?? []).some((v) => v.value === false || (typeof v.value === "string" && v.value.startsWith("||")))); if (bad && !kids.length) leaves.push(n); kids.forEach(walk); };
        (r.expressionReports ?? []).forEach(walk);
        for (const l of leaves.slice(0, 8)) console.log("   leaf:", JSON.stringify(l.values), source.slice(l.sourcePosition.currentOffset, l.sourcePosition.endOffset).slice(0, 160));
      }
    }
  });
})().catch((e) => { console.error("FAILED:", e.message, JSON.stringify(e.context?.body ?? "").slice(0, 800)); process.exit(1); });
