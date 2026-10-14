// Firestore access. Matches live at scrimLeague/data/matches/{matchId} in the shared
// pistachio-kitchen project (rules: firebase/scrimleague.rules). Uploading signs in
// anonymously; reading needs no sign-in. The anonymous session persists in this browser,
// which is what lets an uploader delete their own scrim later.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, orderBy, limit, serverTimestamp, Timestamp, writeBatch,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { FIREBASE_CONFIG } from "../firebase-config.js";
import { matchId } from "./stats.js";
import { parseDuration } from "./validate.js";
import { DIVISIONS, collectionOf } from "./divisions.js";

const app = initializeApp(FIREBASE_CONFIG, "scrim-league");
const auth = getAuth(app);
const db = getFirestore(app);
// Scrims in `matches`; AD2L division games played without a league ticket, uploaded from
// screenshots the same way, in `<division>_unticketed` (`ad2l_unticketed` is Champion; see
// lib/divisions.js). Same document shape and rules for all of them; a new division's
// collection also needs adding to the rules' knownColl() by hand.
const COLLECTIONS = { scrim: "matches", ...Object.fromEntries(DIVISIONS.map((d) => [d.key, collectionOf(d.key)])) };
const coll = (league = "scrim") => collection(db, "scrimLeague", "data", COLLECTIONS[league]);

export const MAX_MATCHES = 500;

// Resolves once Firebase has restored any saved session from this browser.
const authReady = new Promise((resolve) => { const off = onAuthStateChanged(auth, () => { off(); resolve(); }); });
export async function currentUid() {
  await authReady;
  return auth.currentUser?.uid ?? null;
}

// Fantasy sign-in with Steam (workers/steam-auth): a second Firebase app with its own session,
// so signing in leaves the anonymous one above (which owns this browser's uploads) alone.
// The Worker sends the visitor back with #fantasy-token=<custom token> (app.js picks it up).
const fantasyApp = initializeApp(FIREBASE_CONFIG, "fantasy");
const fantasyAuth = getAuth(fantasyApp);
const fantasyReady = new Promise((resolve) => { const off = onAuthStateChanged(fantasyAuth, () => { off(); resolve(); }); });
export const steamLoginUrl = (ret = location.href) => `https://steam-auth.ad2lstats.workers.dev/login?return=${encodeURIComponent(ret)}`;
const steamOf = async (user) => (user ? (await user.getIdTokenResult()).claims.steam ?? null : null);
// The signed-in Dota account id (a number), or null.
export async function steamAccount() {
  await fantasyReady;
  return steamOf(fantasyAuth.currentUser);
}
export async function steamSignIn(token) {
  return steamOf((await signInWithCustomToken(fantasyAuth, token)).user);
}
export const steamSignOut = () => signOut(fantasyAuth);
export async function steamIdToken() {
  await fantasyReady;
  return fantasyAuth.currentUser?.getIdToken() ?? null;
}

// Fantasy entries (lib/fantasy.js): one per person per league per week, id
// "<league>_<week>_<account>", written through the Steam session so the rules can tie it to the
// account. updatedAt is the server's clock; scoring ignores entries saved after the week's lock.
const fantasyColl = collection(getFirestore(fantasyApp), "scrimLeague", "data", "fantasy");
export async function listFantasy(league) {
  const snap = await getDocs(query(collection(db, "scrimLeague", "data", "fantasy"), where("league", "==", league), limit(5000)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data(), updatedAt: d.data().updatedAt?.toDate?.() ?? null }));
}
export async function saveFantasy(league, week, picks, name, captain) {
  const account = await steamAccount();
  if (account == null) throw new Error("Sign in with Steam first.");
  if(!Number.isInteger(captain)||!picks.includes(captain))throw new Error("Choose a captain from your picks.");
  await setDoc(doc(fantasyColl, `${league}_${week}_${account}`), {
    v: 1, league, week, account, picks, captain, name: name.trim().slice(0, 24), uid: fantasyAuth.currentUser.uid, updatedAt: serverTimestamp(),
  });
}

// Player cards: each player's own choices for their Fantasy card, id "<account>", written only
// through that account's Steam session. hero: a hero id or null (their most played); pos: the role
// they play now, 1–5, or null (their most played position). A Map account -> { hero, pos }.
const cardColl = collection(getFirestore(fantasyApp), "scrimLeague", "data", "cards");
// A player's feedback tickets and whether Fav has implemented them (feedback_status, written by
// scripts/feedback.cjs). Implemented ones show for a week after they're done.
export async function ticketStatus(account) {
  const snap = await getDocs(query(collection(db, "scrimLeague", "data", "feedback_status"), where("account", "==", String(account)), limit(50)));
  const week = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return snap.docs.map((d) => d.data())
    .filter((t) => t.status === "open" || (t.status === "implemented" && t.done?.toMillis() > week))
    .sort((a, b) => (a.status === b.status ? b.sent?.toMillis() - a.sent?.toMillis() : a.status === "open" ? -1 : 1));
}
export async function listCards() {
  const snap = await getDocs(query(collection(db, "scrimLeague", "data", "cards"), limit(5000))).catch(()=>null);
  const cards=new Map((snap?.docs??[]).map((d) => [Number(d.data().account), { hero: d.data().hero ?? null, pos: d.data().pos ?? null, art: d.data().art ?? null, style: d.data().style ?? null, crop: d.data().crop ?? null }]));
  try {
    const {cosmeticAppearances}=await import('./cosmetics.js');
    for(const [id,cosmetics] of Object.entries(await cosmeticAppearances())) cards.set(Number(id),{...cards.get(Number(id)),...cosmetics.baseCard,cosmetics});
  } catch { /* Existing cards remain available if the collection service is offline. */ }
  return cards;
}
export async function saveCard({ hero = null, pos = null, art = null, style = null, crop = null }) {
  const { checkCardChoices } = await import("./card-art.js");
  const error = checkCardChoices({ hero, pos, art, style, crop });
  if (error) throw new Error(error);
  const account = await steamAccount();
  if (account == null) throw new Error("Sign in with Steam first.");
  await setDoc(doc(cardColl, String(account)), { v: 1, account, hero, pos, art, style, crop, uid: fantasyAuth.currentUser.uid, updatedAt: serverTimestamp() });
}

// Review-form draft → the stored document shape the rules validate.
// Private = results only: heroes, players and stats are never sent anywhere.
// seriesId: the PlayOn series an unticketed AD2L game fills (only that collection allows it).
export function toStored(draft, { isPrivate = false, seriesId = null } = {}) {
  const base = {
    ...(Number.isInteger(seriesId) ? { series_id: seriesId } : {}),
    v: 2,
    private: isPrivate,
    team_a: draft.team_a.trim(),
    team_b: draft.team_b.trim(),
    score_a: draft.score_a,
    score_b: draft.score_b,
    winner: draft.winner,
    duration_sec: parseDuration(draft.duration),
    game_mode: (draft.game_mode ?? "").trim(),
  };
  if (isPrivate) return base;
  // Saved only as a complete 1–10 set (the rules accept pick on all players or none).
  const picks = draft.players.map((p) => p.pick);
  const fullPicks = picks.every((v) => Number.isInteger(v) && v >= 1 && v <= 10) && new Set(picks).size === 10;
  return {
    ...base,
    players: draft.players.map((p) => ({
      team: p.team,
      name: p.name.trim(),
      tag: p.tag?.trim() || null,
      hero: p.hero,
      level: p.level, kills: p.kills, deaths: p.deaths, assists: p.assists,
      net_worth: p.net_worth, last_hits: p.last_hits, denies: p.denies,
      gpm: p.gpm, xpm: p.xpm, hero_damage: p.hero_damage, hero_healing: p.hero_healing,
      ...(fullPicks ? { pick: p.pick } : {}),
    })),
  };
}

// Returns { id } on success or { duplicateOf: id } if the game is already uploaded.
export async function submitMatch(draft, { isPrivate = false, league = "scrim", seriesId = null } = {}) {
  const data = toStored(draft, { isPrivate, seriesId: league !== "scrim" ? seriesId : null });
  const id = await matchId(data);
  const ref = doc(coll(league), id);
  if ((await getDoc(ref)).exists()) return { duplicateOf: id };
  await authReady;
  if (!auth.currentUser) await signInAnonymously(auth);
  try {
    await setDoc(ref, { ...data, uid: auth.currentUser.uid, createdAt: serverTimestamp() });
  } catch (e) {
    // Create-only rules: if someone saved the same game a moment ago this becomes a
    // denied update.
    if (e.code === "permission-denied" && (await getDoc(ref)).exists()) return { duplicateOf: id };
    throw e;
  }
  return { id };
}

// Any signed-in visitor may delete an upload (the rules allow it); the site asks for the
// league's shared password first. Signs in anonymously if this browser hasn't yet.
async function signedIn() {
  await authReady;
  if (!auth.currentUser) await signInAnonymously(auth);
}
export async function deleteMatch(id, league = "scrim") {
  await signedIn();
  await deleteDoc(doc(coll(league), id));
}

// Save corrections to an upload in place: same ID, uploader, upload time, private flag and
// series (the rules check all of that). Behind the same password as delete.
export async function editMatch(id, draft, league = "scrim") {
  await signedIn();
  const ref = doc(coll(league), id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("That game isn't there any more.");
  const { uid, createdAt, series_id, private: isPrivate } = snap.data();
  await setDoc(ref, { ...toStored(draft, { isPrivate, seriesId: series_id ?? null }), uid, createdAt });
}

// Put an unticketed upload in a PlayOn series (or take it out with null). Saved games are
// create-only, so this deletes the upload and saves it again with the new series_id, same
// ID (the ID doesn't depend on the series). Behind the same password as delete. If saving
// fails, the original is put back.
export async function moveMatch(id, seriesId, league = "ad2l") {
  await signedIn();
  const ref = doc(coll(league), id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("That game isn't there any more.");
  const { uid, createdAt, series_id, ...rest } = snap.data();
  await deleteDoc(ref);
  const save = (data) => setDoc(doc(coll(league), id), { ...data, uid: auth.currentUser.uid, createdAt: serverTimestamp() });
  try {
    await save(Number.isInteger(seriesId) ? { ...rest, series_id: seriesId } : rest);
  } catch (e) {
    await save(Number.isInteger(series_id) ? { ...rest, series_id } : rest).catch(() => {});
    throw e;
  }
}

const fromDoc = (d) => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.() ?? null });

export async function listMatches(league = "scrim") {
  const snap = await getDocs(query(coll(league), orderBy("createdAt", "desc"), limit(MAX_MATCHES)));
  return snap.docs.map(fromDoc);
}

export async function getMatch(id, league = "scrim") {
  const d = await getDoc(doc(coll(league), id));
  return d.exists() ? fromDoc(d) : null;
}

// ---------- predictions ----------
// One document per browser per series (id "<series>_<uid>"); saving again changes the pick.
// updatedAt is the server's clock, which is what scoring checks against the series start.
const predictions = collection(db, "scrimLeague", "data", "predictions");

export async function listPredictions() {
  const snap = await getDocs(query(predictions, limit(5000)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data(), updatedAt: d.data().updatedAt?.toDate?.() ?? null }));
}

// league "ad2l" (Champion), "heroic", "conqueror", "warrior", "challenger", "voyager" or "explorer": seriesId is a PlayOn series (number); "scrim": a
// fixture's document ID.
export async function savePrediction(seriesId, pick, name, league = "ad2l") {
  await signedIn();
  const uid = auth.currentUser.uid;
  await setDoc(doc(predictions, `${seriesId}_${uid}`), {
    v: 1, league, series_id: seriesId, pick, name: name.trim().slice(0, 24), uid, updatedAt: serverTimestamp(),
  });
  return uid;
}

// ---------- brackets ----------
// A person's playoff bracket picks (tiebreaker and bracket winners, from Predict's Bracket tab),
// one document per person per league, id "<league>_<uid>", shown on the Leaderboard. `picks` is
// the JSON of { key: winner team id }; their series calls are the predictions above.
const brackets = collection(db, "scrimLeague", "data", "brackets");
export async function listBrackets() {
  const snap = await getDocs(query(brackets, limit(500)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data(), updatedAt: d.data().updatedAt?.toDate?.() ?? null }));
}
export async function saveBracket(league, picks, name) {
  await signedIn();
  const uid = auth.currentUser.uid;
  await setDoc(doc(brackets, `${league}_${uid}`), {
    v: 1, league, name: name.trim().slice(0, 24), uid, picks: JSON.stringify(picks), updatedAt: serverTimestamp(),
  });
}

// ---------- scrim fixtures ----------
// Upcoming scrims anyone can put on the schedule: two team names, a start time and the
// format. Results aren't stored here; uploaded games settle a fixture (lib/fixtures.js).
const fixtures = collection(db, "scrimLeague", "data", "scrim_fixtures");
const fixtureFromDoc = (d) => ({ id: d.id, ...d.data(), start: d.data().start?.toDate?.() ?? null, createdAt: d.data().createdAt?.toDate?.() ?? null });

export async function listFixtures() {
  const snap = await getDocs(query(fixtures, orderBy("start", "desc"), limit(MAX_MATCHES)));
  return snap.docs.map(fixtureFromDoc);
}

export async function addFixture({ team_a, team_b, start, best_of }) {
  await signedIn();
  const ref = doc(fixtures); // random 20-character ID
  await setDoc(ref, {
    v: 1, team_a: team_a.trim(), team_b: team_b.trim(), start: Timestamp.fromDate(start), best_of,
    uid: auth.currentUser.uid, createdAt: serverTimestamp(),
  });
  return ref.id;
}

// Reschedule: only the start time and format can change.
export async function moveFixture(id, start, best_of) {
  await signedIn();
  await updateDoc(doc(fixtures, id), { start: Timestamp.fromDate(start), best_of });
}

export async function deleteFixture(id) {
  await signedIn();
  await deleteDoc(doc(fixtures, id));
}

// ---------- casts ----------
// Links to a cast of a game (YouTube, Twitch, …) with the caster's name, shown on the game
// page for anyone to click. `game` is the page's game ID (an OpenDota match ID or a 32-hex
// upload ID); `league` is the collection key ("scrim", "ad2l", "heroic", …). No edits:
// delete and add again.
const casts = collection(db, "scrimLeague", "data", "casts");
export const MAX_CASTS = 20;

export async function listCasts(game, league = "scrim") {
  const snap = await getDocs(query(casts, where("game", "==", String(game)), limit(MAX_CASTS)));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.() ?? null }))
    .filter((c) => c.league === league)
    .sort((a, b) => (a.createdAt ?? Infinity) - (b.createdAt ?? Infinity));
}

export async function addCast(game, league, { url, caster }) {
  await signedIn();
  const ref = doc(casts); // random 20-character ID
  await setDoc(ref, {
    v: 1, league, game: String(game), url, caster: caster.trim().slice(0, 40),
    uid: auth.currentUser.uid, createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function deleteCast(id) {
  await signedIn();
  await deleteDoc(doc(casts, id));
}

// ---------- feedback ----------
// A ticket (one review session from lib/feedback.js) with one item per mark. Anyone can
// send one; nobody can read them back from the site. The rules allow 5 per browser per
// rolling hour, kept in feedback_limits/{uid}: five timestamp slots used as a ring, `i` the
// next (and oldest) slot, empty slots at the 1970 epoch. Ticket, items and limiter go in one
// batch, so a refused ticket spends nothing.
const feedback = collection(db, "scrimLeague", "data", "feedback");
export const FEEDBACK_PER_HOUR = 5;
export const MAX_FEEDBACK_ITEMS = 10;

// Returns { id: "FB-XXXXXX" } or { retryAt: Date } when this browser has sent its 5 this hour.
export async function submitFeedback(name, items) {
  await signedIn();
  const uid = auth.currentUser.uid;
  const limitRef = doc(db, "scrimLeague", "data", "feedback_limits", uid);
  const lim = await getDoc(limitRef);
  const ticket = doc(feedback); // random 20-character ID
  const batch = writeBatch(db);
  if (!lim.exists()) {
    const empty = Timestamp.fromMillis(0);
    batch.set(limitRef, { t0: serverTimestamp(), t1: empty, t2: empty, t3: empty, t4: empty, i: 1, last: ticket.id });
  } else {
    const { i } = lim.data();
    const oldest = lim.data()[`t${i}`]?.toMillis?.() ?? 0;
    if (oldest > Date.now() - 3600e3) return { retryAt: new Date(oldest + 3600e3) };
    batch.update(limitRef, { [`t${i}`]: serverTimestamp(), i: (i + 1) % FEEDBACK_PER_HOUR, last: ticket.id });
  }
  batch.set(ticket, { v: 1, name: name.trim().slice(0, 40), uid, items: items.length, status: "open", createdAt: serverTimestamp() });
  items.forEach((it, n) => batch.set(doc(ticket, "items", String(n)), {
    v: 1, kind: it.kind, page: it.page, league: it.league, theme: it.theme, viewport: it.viewport,
    note: it.note, area: it.area, target: it.target ?? null, strokes: it.strokes ?? null, shot: it.shot ?? null,
    uid, createdAt: serverTimestamp(),
  }));
  await batch.commit();
  return { id: `FB-${ticket.id.slice(0, 6).toUpperCase()}` };
}
