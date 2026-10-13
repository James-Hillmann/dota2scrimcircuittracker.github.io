// Fantasy (AD2L divisions), the Predict page's Fantasy tab: this week's five picks and the season
// leaderboard. Rules and scoring in lib/fantasy.js; Steam sign-in through workers/steam-auth
// (lib/store.js, parts/me.js). Loaded when the tab is first shown.
import { SLOTS, GAMES_COUNTED, fantasyWeeks, openWeek, pickable, checkPicks, fantasyModels, scoreEntry, leaderboard } from "../lib/fantasy.js";
import { tierList, tierModel, NEXT } from "../lib/tiers.js";
import { heroImg, heroVert } from "../lib/hero-meta.js";
import { listFantasy, saveFantasy, steamAccount, steamSignOut } from "../lib/store.js";
import { esc, playerLink, SOURCES } from "../core.js";
import { errorBox } from "../parts/lanes.js";
import { withAnnounced } from "../lib/divisions.js";
import { startSteamSignIn, mountMe, steamName } from "../parts/me.js";

const POS_SHORT = { 1: "Carry", 2: "Mid", 3: "Offlane", 4: "Soft support", 5: "Hard support" };
const POS_NAME = { 1: "Pos 1 · Carry", 2: "Pos 2 · Mid", 3: "Pos 3 · Offlane", 4: "Pos 4 · Soft support", 5: "Pos 5 · Hard support" };
const at = (t) => new Date(t * 1000).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const weekLabel = (key) => `Week of ${new Date(`${key}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}`;
// The clock: on a local preview, ?fantasy_now=<unix seconds> stands in for now (to see an open
// week out of season).
const nowSec = () => {
  const q = location.search || location.hash.split("?")[1] || "";
  const o = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && Number(new URLSearchParams(q).get("fantasy_now"));
  return o || Date.now() / 1000;
};

// The cards' hero art filter, a stencil print to match the display type: a hard posterize
// flattens the art into a few flat inks with rigid edges. (The worn speckle is a CSS mask, see
// .ft-art img; noise inside this filter redraws too slowly at card size.)
// Each card offsets the grit tile differently, so the flecks don't repeat card to card.
const gritAt = (key) => { let h = 0; for (const c of String(key)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return `${-(h % 256)}px ${-((h >>> 8) % 256)}px`; };

const PAINT_FILTER = `<svg class="ft-defs" aria-hidden="true" focusable="false"><filter id="ft-paint" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
  <feComponentTransfer>
    <feFuncR type="discrete" tableValues="0.04 0.3 0.58 0.84 1"/>
    <feFuncG type="discrete" tableValues="0.04 0.28 0.55 0.8 0.96"/>
    <feFuncB type="discrete" tableValues="0.05 0.27 0.52 0.76 0.92"/>
  </feComponentTransfer>
</filter></svg>`;

// Each rostered player's most-played position in the league's games (ties: the lower number).
function mainPositions(matches) {
  const c = new Map();
  for (const m of matches) for (const p of m.players ?? []) {
    if (!p.account_id || !p.position) continue;
    const k = c.get(p.account_id) ?? c.set(p.account_id, {}).get(p.account_id);
    k[p.position] = (k[p.position] ?? 0) + 1;
  }
  return new Map([...c].map(([a, k]) => [a, Number(Object.entries(k).sort((x, y) => y[1] - x[1] || x[0] - y[0])[0][0])]));
}

// Each rostered player's card numbers from the league's games: games, wins, average K/D/A and
// GPM, and their three most-played heroes.
function cardStats(matches) {
  const by = new Map();
  for (const m of matches) for (const p of m.players ?? []) {
    if (!p.account_id) continue;
    const s = by.get(p.account_id) ?? by.set(p.account_id, { games: 0, wins: 0, k: 0, d: 0, a: 0, gpm: 0, heroes: new Map() }).get(p.account_id);
    const won = m.winner != null && m.winner === p.team;
    s.games++; s.wins += won; s.k += p.kills ?? 0; s.d += p.deaths ?? 0; s.a += p.assists ?? 0; s.gpm += p.gpm ?? 0;
    if (p.hero) { const h = s.heroes.get(p.hero) ?? s.heroes.set(p.hero, { hero: p.hero, games: 0, wins: 0 }).get(p.hero); h.games++; h.wins += won; }
  }
  for (const s of by.values()) s.top = [...s.heroes.values()].sort((x, y) => y.games - x.games || y.wins - x.wins).slice(0, 3);
  return by;
}

export async function mountFantasy(host, viewSrc) {
  const src = SOURCES[viewSrc.key]; // Heroic A/B views play the whole league's game
  let d, matches, entries, me;
  try { [d, matches, me] = await Promise.all([src.data(), src.load(), steamAccount()]); }
  catch (e) { host.innerHTML = errorBox(e); return; }
  try { entries = await listFantasy(src.key); } catch (e) { console.warn(e); entries = null; }

  const now = nowSec();
  const weeks = fantasyWeeks(withAnnounced(src.key, d.series)), open = openWeek(weeks, now);
  const models = fantasyModels(matches);
  const rosterName = new Map(d.teams.flatMap((t) => t.players.map((p) => [p.account_id, p.name])));
  const teamOf = new Map(d.teams.flatMap((t) => t.players.map((p) => [p.account_id, t.name])));
  const nameOf = (a) => rosterName.get(a) ?? `#${a}`;
  const pLink = (a) => (rosterName.has(a) ? playerLink(viewSrc, { name: rosterName.get(a), key: String(a) }) : esc(nameOf(a)));
  const mine = (entries ?? []).filter((e) => e.account === me);
  const current = open && mine.find((e) => e.week === open.key);
  // The most recent locked week (in progress or done) with an entry of mine.
  const lastLocked = [...weeks].reverse().find((w) => w.lock <= now && mine.some((e) => e.week === w.key));
  const board = entries ? leaderboard(entries, weeks, matches, now, models) : [];

  // Sign-in bar.
  const signIn = me == null
    ? `<button type="button" class="primary" id="ft-in">Sign in with Steam</button> <span class="ft-note">to make picks. Only your Steam ID is shared.</span>`
    : `Signed in as <b>${esc(rosterName.get(me) ?? steamName(me) ?? nameOf(me))}</b> <button type="button" class="linkish" id="ft-out">Sign out</button>`;

  // This week's picker: a lineup bar (one tab per position) over a deck of player cards per
  // position. `picks` holds the choices until saved.
  let picker, picks = [], activeSlot = 1;
  if (!open) picker = `<div class="panel empty"><strong>No week open</strong>PlayOn hasn't posted the next series yet.</div>`;
  else {
    const pool = pickable(d.teams, open, me);
    const mainPos = mainPositions(matches);
    const chosen = current?.picks ?? [];
    const stats = cardStats(matches);
    const tiers = new Map(tierList(matches, { model: tierModel(matches, { version: NEXT }) }).tiers.flatMap(({ tier, players }) => players.map((p) => [p.key, { tier, rating: p.rating }])));
    const byAcc = new Map(pool.map((p) => [p.account, p]));
    const locked = me == null;
    const card = (p, slot) => {
      const st = stats.get(p.account), t = tiers.get(String(p.account)), top = st?.top ?? [];
      const art = top[0] && heroVert(top[0].hero), wide = top[0] && heroImg(top[0].hero);
      const kda = st?.games ? `${(st.k / st.games).toFixed(1)}/${(st.d / st.games).toFixed(1)}/${(st.a / st.games).toFixed(1)}` : "—";
      return `<button type="button" class="ft-card${t ? ` t-${t.tier}` : ""}" data-pick="${p.account}" aria-pressed="false"${locked ? " disabled" : ""}>
        <span class="ft-art" style="--grit:${gritAt(p.account)}">${art ? `<img src="${esc(art)}" alt="" loading="lazy" data-wide="${esc(wide)}">` : ""}</span>
        <span class="ft-tier">${t ? `${t.tier}<small>${t.rating}</small>` : "—"}</span>
        ${mainPos.get(p.account) === slot ? `<span class="ft-main">Plays pos ${slot}</span>` : ""}
        <span class="ft-name">${esc(p.name)}</span>
        <span class="ft-tm">${esc(p.team)}</span>
        <span class="ft-heroes">${top.length ? top.map((h) => `<span class="ft-h" title="${esc(h.hero)}: ${h.games} games, ${h.wins} won">${heroImg(h.hero) ? `<img src="${esc(heroImg(h.hero))}" alt="${esc(h.hero)}" loading="lazy">` : esc(h.hero)}<b>${h.games}</b></span>`).join("") : `<span class="ft-note">No league games yet</span>`}</span>
        <span class="ft-stats">
          <span><b>${st?.games ?? 0}</b>Games</span>
          <span><b>${st?.games ? Math.round((100 * st.wins) / st.games) + "%" : "—"}</b>Win</span>
          <span><b>${kda}</b>K/D/A</span>
          <span><b>${st?.games ? Math.round(st.gpm / st.games) : "—"}</b>GPM</span>
        </span>
      </button>`;
    };
    const slotDeck = (slot) => {
      const here = pool.filter((p) => mainPos.get(p.account) === slot), rest = pool.filter((p) => mainPos.get(p.account) !== slot);
      const rank = (a, b) => (tiers.get(String(b.account))?.rating ?? -1) - (tiers.get(String(a.account))?.rating ?? -1);
      return `<div class="ft-deck" data-deck="${slot}" role="tabpanel" aria-label="${POS_NAME[slot]}" hidden>
        ${here.length ? `<div class="ft-grid">${[...here].sort(rank).map((p) => card(p, slot)).join("")}</div>` : ""}
        ${rest.length ? `<details class="ft-rest"${here.length ? "" : " open"}><summary>${here.length ? `Everyone else (${rest.length})` : "Players"}</summary><div class="ft-grid">${[...rest].sort(rank).map((p) => card(p, slot)).join("")}</div></details>` : ""}
      </div>`;
    };
    picker = `<section class="ft-week">
        <h2>${weekLabel(open.key)} <span class="ft-lock">Picks lock ${esc(at(open.lock))}</span></h2>
        <div class="ft-lineup" role="tablist" aria-label="Your lineup">${SLOTS.map((s) => `<button type="button" class="ft-slot" role="tab" data-slot="${s}" aria-selected="false"><span class="ft-slot-pos">Pos ${s}</span><span class="ft-slot-role">${POS_SHORT[s]}</span><span class="ft-slot-pick"></span></button>`).join("")}</div>
        ${SLOTS.map(slotDeck).join("")}
        <div class="ft-save">
          <label>Name on the board <input id="ft-name" maxlength="24" value="${esc(current?.name ?? (me != null ? rosterName.get(me) ?? steamName(me) ?? "" : ""))}"${locked ? " disabled" : ""}></label>
          <button type="button" class="primary" id="ft-save"${locked ? " disabled" : ""}>${current ? "Update picks" : "Save picks"}</button>
          <span class="ft-msg" id="ft-msg" role="status">${current ? `Saved ${esc(current.updatedAt?.toLocaleString() ?? "")}` : ""}</span>
        </div>
      </section>`;
    // Picks live here until saved; the lineup bar and the cards show them.
    picks = SLOTS.map((s) => (byAcc.has(chosen[s - 1]) ? chosen[s - 1] : null));
    activeSlot = picks.indexOf(null) + 1 || 1;
  }

  // My most recent locked week, pick by pick.
  const lastHtml = lastLocked ? (() => {
    const s = scoreEntry(mine.find((e) => e.week === lastLocked.key), lastLocked, matches, models);
    if (!s) return `<section class="ft-last"><h2>${weekLabel(lastLocked.key)}</h2><p class="ft-note">Saved after the lock, so it doesn't count.</p></section>`;
    return `<section class="ft-last"><h2>Your ${weekLabel(lastLocked.key).toLowerCase()} <span class="ft-total">${s.points}</span></h2>
      <div class="table-wrap"><table class="ft-table"><thead><tr><th scope="col">Position</th><th scope="col">Player</th><th scope="col" class="num">Games</th><th scope="col" class="num">Points</th></tr></thead><tbody>
      ${s.picks.map((p) => `<tr><td>${POS_NAME[p.pos]}</td><td>${pLink(p.account)} <span class="ft-team">${esc(teamOf.get(p.account) ?? "")}</span></td>
        <td class="num">${p.games.length ? p.games.map((g) => `<span class="${g.counted ? "ft-counted" : "ft-dropped"}">${g.score}</span>`).join(" ") : "—"}</td><td class="num"><b>${p.points}</b></td></tr>`).join("")}
      </tbody></table></div></section>`;
  })() : "";

  const boardHtml = entries == null ? `<div class="panel empty">Couldn't load the leaderboard.</div>`
    : !board.length ? `<div class="panel empty"><strong>No scores yet</strong>The board fills in once the first week with entries locks.</div>`
    : `<div class="table-wrap"><table class="ft-table ft-board"><thead><tr><th scope="col">#</th><th scope="col">Name</th><th scope="col" class="num">Weeks</th><th scope="col" class="num">Last week</th><th scope="col" class="num">Points</th></tr></thead><tbody>
      ${board.map((r, i) => `<tr${r.account === me ? ' class="ft-me"' : ""}><td>${i + 1}</td><td><details><summary>${esc(r.name)}</summary>
        ${r.weeks.map((w) => `<div class="ft-wk"><b>${weekLabel(w.week)}: ${w.points}</b> ${w.picks.map((p) => `${esc(nameOf(p.account))} ${p.points}`).join(" · ")}</div>`).join("")}</details></td>
        <td class="num">${r.weeks.length}</td><td class="num">${r.weeks[0]?.points ?? "—"}</td><td class="num"><b>${r.points}</b></td></tr>`).join("")}
      </tbody></table></div>`;

  host.innerHTML = `${PAINT_FILTER}<p class="ft-intro">Five players, one per position, from teams playing that week. Each scores their best ${GAMES_COUNTED} games on the playoff tier model, read as the position you picked them for. You can't pick yourself.</p>
    <div class="ft-sign">${signIn}</div>
    ${picker}
    ${lastHtml}
    <section class="ft-board-wrap"><h2>Season leaderboard</h2>${boardHtml}</section>`;

  const rerender = () => mountFantasy(host, viewSrc);
  // The lineup bar shows each slot's pick; the active slot's deck shows; a card picked for another
  // slot says which.
  const sync = () => {
    for (const b of host.querySelectorAll(".ft-slot")) {
      const s = Number(b.dataset.slot), a = picks[s - 1], c = a != null && host.querySelector(`.ft-deck[data-deck="${s}"] [data-pick="${a}"]`);
      b.setAttribute("aria-selected", String(s === activeSlot));
      b.classList.toggle("filled", a != null);
      b.querySelector(".ft-slot-pick").innerHTML = c ? `${c.querySelector(".ft-h")?.innerHTML.replace(/<b>.*<\/b>/, "") ?? ""}<b>${c.querySelector(".ft-name").innerHTML}</b>` : "Empty";
    }
    for (const dk of host.querySelectorAll(".ft-deck")) {
      const s = Number(dk.dataset.deck);
      dk.hidden = s !== activeSlot;
      for (const c of dk.querySelectorAll("[data-pick]")) {
        const a = Number(c.dataset.pick), at = picks.indexOf(a) + 1;
        c.setAttribute("aria-pressed", String(at === s));
        c.dataset.taken = at && at !== s ? `In pos ${at}` : "";
      }
    }
  };
  if (open) {
    // A hero without portrait art falls back to its wide image.
    host.addEventListener("error", (ev) => {
      const img = ev.target;
      if (img.dataset?.wide && img.src !== img.dataset.wide) img.src = img.dataset.wide;
    }, true);
    sync();
    for (const b of host.querySelectorAll(".ft-slot")) b.addEventListener("click", () => { activeSlot = Number(b.dataset.slot); sync(); });
    host.querySelectorAll(".ft-deck").forEach((dk) => dk.addEventListener("click", (ev) => {
      const c = ev.target.closest("[data-pick]");
      if (!c || c.disabled) return;
      const a = Number(c.dataset.pick), s = Number(dk.dataset.deck);
      if (picks[s - 1] === a) { picks[s - 1] = null; sync(); return; }
      const was = picks.indexOf(a);
      if (was >= 0) picks[was] = null;
      picks[s - 1] = a;
      // On to the next empty slot, if any.
      const next = picks.findIndex((x, i) => x == null && i > s - 1);
      const any = next >= 0 ? next : picks.indexOf(null);
      if (any >= 0) { activeSlot = any + 1; sync(); host.querySelector(".ft-lineup").scrollIntoView({ block: "nearest", behavior: "smooth" }); }
      else sync();
    }));
  }
  host.querySelector("#ft-in")?.addEventListener("click", startSteamSignIn);
  host.querySelector("#ft-out")?.addEventListener("click", async () => { await steamSignOut(); mountMe(); rerender(); });
  document.getElementById("ft-save")?.addEventListener("click", async () => {
    const msg = document.getElementById("ft-msg");
    const name = document.getElementById("ft-name").value.trim();
    const err = checkPicks(picks, pickable(d.teams, open, me), me) ?? (name ? null : "Type a name for the board.");
    if (err) { msg.textContent = err; return; }
    if (nowSec() >= open.lock) { msg.textContent = "Picks are locked for this week."; return; }
    msg.textContent = "Saving…";
    try { await saveFantasy(src.key, open.key, picks, name); rerender(); }
    catch (e) { console.warn(e); msg.textContent = `Couldn't save: ${e.code === "permission-denied" ? "the database refused it" : e.message}.`; }
  });
}
