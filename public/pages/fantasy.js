// Fantasy (AD2L divisions), the Predict page's Fantasy tab: this week's five picks and the season
// leaderboard. Rules and scoring in lib/fantasy.js; Steam sign-in through workers/steam-auth
// (lib/store.js, parts/me.js). Loaded when the tab is first shown.
import { SLOTS, GAMES_COUNTED, weekKey, TEST_WEEK, FANTASY_POINTS, playoffWeeks, testWeek, openWeek, pickable, checkPicks, scoreEntry, leaderboard, weekBoard } from "../lib/fantasy.js";
import { createPlayerCards, PAINT_FILTER, flipPlayerCard, showBigCard } from "../parts/player-card.js";
import { tierList, tierModel, NEXT } from "../lib/tiers.js";
import { listFantasy, saveFantasy, listCards, steamAccount, steamSignOut } from "../lib/store.js";
import { esc, playerLink, SOURCES } from "../core.js";
import { errorBox } from "../parts/lanes.js";
import { startSteamSignIn, mountMe, steamName } from "../parts/me.js";
import { openCollection } from "../parts/collection.js";

const POS_SHORT = { 1: "Carry", 2: "Mid", 3: "Offlane", 4: "Soft support", 5: "Hard support" };
const POS_NAME = { 1: "Pos 1 · Carry", 2: "Pos 2 · Mid", 3: "Pos 3 · Offlane", 4: "Pos 4 · Soft support", 5: "Pos 5 · Hard support" };
const at = (t) => new Date(t * 1000).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const weekLabel = (key) => `Week of ${new Date(`${key}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}`;
// The clock: on a local preview, ?fantasy_now=<unix seconds> stands in for now (to see an open
// week out of season).
const localParam = (k) => /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && Number(new URLSearchParams(location.search || location.hash.split("?")[1] || "").get(k));
const nowSec = () => localParam("fantasy_now") || Date.now() / 1000;
// Also on a local preview: ?fantasy_me=<account id> shows the page as that player sees it (their
// own card). Display only: saving still needs their Steam sign-in.

const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export async function mountFantasy(host, viewSrc, scope = null) {
  const src = SOURCES[viewSrc.key]; // Heroic A/B views play the whole league's game
  const now = nowSec();
  scope ??= TEST_WEEK && weekKey(now) <= TEST_WEEK.key ? "all" : src.key;
  const shared = scope === "all";
  const sources = shared ? TEST_WEEK.leagues.map((key) => SOURCES[key]) : [src];
  let d, matches, entries, me, cards, weeks;
  const sourceOf = new Map();
  try {
    const [loaded, account, saved, overrides] = await Promise.all([
      Promise.all(sources.map(async (source) => {
        const [data, games] = await Promise.all([source.data(), source.load()]);
        for (const t of data.teams) for (const p of t.players) sourceOf.set(p.account_id, source);
        return { ...data, key: source.key, games: games.map((m) => ({ ...m, league: source.key })) };
      })), steamAccount(),
      listFantasy(scope).catch((e) => { console.warn(e); return null; }),
      listCards().catch((e) => { console.warn(e); return new Map(); }),
    ]);
    d = { teams: loaded.flatMap((x) => x.teams) };
    matches = loaded.flatMap((x) => x.games);
    me = localParam("fantasy_me") || account;
    entries = saved; cards = overrides;
    weeks = shared ? [testWeek(loaded)].filter(Boolean) : playoffWeeks(src.key, loaded[0].series);
    for (const week of weeks) week.eligible = new Set(pickable(d.teams, week).map((p) => p.account));
  } catch (e) { host.innerHTML = errorBox(e); return; }
  const open = openWeek(weeks, now);
  const rosterName = new Map(d.teams.flatMap((t) => t.players.map((p) => [p.account_id, p.name])));
  const teamOf = new Map(d.teams.flatMap((t) => t.players.map((p) => [p.account_id, t.name])));
  const nameOf = (a) => rosterName.get(a) ?? `#${a}`;
  const pLink = (a) => (rosterName.has(a) ? playerLink(sourceOf.get(a) ?? viewSrc, { name: rosterName.get(a), key: String(a) }) : esc(nameOf(a)));
  const mine = (entries ?? []).filter((e) => e.account === me);
  const current = open && mine.find((e) => e.week === open.key);
  const board = entries ? leaderboard(entries, weeks, matches, now) : [];

  // Sign-in bar.
  const signIn = me == null
    ? `<button type="button" class="primary" id="ft-in">Sign in with Steam</button> <span class="ft-note">to make picks and set your own card. Only your Steam ID is shared.</span>`
    : `Signed in as <b>${esc(rosterName.get(me) ?? steamName(me) ?? nameOf(me))}</b> <button type="button" class="linkish" id="ft-out">Sign out</button>`;

  // The cards. Each player's role is the one they set on their card (a role swap), else the
  // position they've played most; the art is the hero they set, else their most played.
  const tiers = new Map(tierList(matches, { model: tierModel(matches, { version: NEXT }) }).tiers.flatMap(({ tier, players }) => players.map((p) => [p.key, { tier, rating: p.rating }])));
  const locked = me == null;
  const { card, stats, mainPos, roleOf } = createPlayerCards(matches, { cards, teams: d.teams, tiers, locked });
  const meP = me != null ? { account: me, name: rosterName.get(me) ?? steamName(me) ?? nameOf(me), team: teamOf.get(me) ?? "" } : null;
  const mineHtml = meP ? '<p><button type="button" class="linkish" id="ft-collection">Customize your cards in Collection</button></p>' : '';

  // This week's picker: a lineup bar (one tab per position) over a deck of player cards per
  // position. `picks` holds the choices until saved.
  let picker, picks = [], activeSlot = 1, captain = current?.captain ?? null;
  if (!open) picker = `<div class="panel empty"><strong>No week open</strong>${shared ? "The test week is locked. View saved lineups and scores below." : "PlayOn hasn't posted the next playoff series yet."}</div>`;
  else {
    const pool = pickable(d.teams, open, me);
    const chosen = current?.picks ?? [];
    const byAcc = new Map(pool.map((p) => [p.account, p]));
    const slotDeck = (slot) => {
      const here = pool.filter((p) => roleOf(p.account) === slot), rest = pool.filter((p) => roleOf(p.account) !== slot);
      const rank = (a, b) => (tiers.get(String(b.account))?.rating ?? -1) - (tiers.get(String(a.account))?.rating ?? -1);
      return `<div class="ft-deck" data-deck="${slot}" role="tabpanel" aria-label="${POS_NAME[slot]}" hidden>
        ${here.length ? `<div class="ft-grid">${[...here].sort(rank).map((p) => card(p, slot)).join("")}</div>` : ""}
        ${rest.length ? `<details class="ft-rest"${here.length ? "" : " open"}><summary>${here.length ? `Everyone else (${rest.length})` : "Players"}</summary><div class="ft-grid">${[...rest].sort(rank).map((p) => card(p, slot)).join("")}</div></details>` : ""}
      </div>`;
    };
    picker = `<section class="ft-week">
        <h2>${weekLabel(open.key)} <span class="ft-lock">Picks lock ${esc(at(open.lock))}</span></h2>
        <div class="ft-case">
          <div class="ft-case-title"><span>Your picks</span><span>Choose one captain for 2× points</span></div>
          <div class="ft-lineup" role="tablist" aria-label="Your lineup">${SLOTS.map((s) => `<div class="ft-slot" data-slot="${s}"><div class="ft-stage"></div><button type="button" class="ft-plinth" role="tab" aria-selected="false"><span class="ft-slot-pos">Pos ${s}</span><span class="ft-slot-role">${POS_SHORT[s]}</span></button><button type="button" class="ft-captain" data-captain-slot="${s}" disabled>Make captain</button></div>`).join("")}</div>
        </div>
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

  const lineupHtml = (entry, week) => {
    const scored = week.lock <= now ? scoreEntry(entry, week, matches) : null;
    const lineup = scored?.picks ?? entry.picks.map((account, i) => ({ account, pos: SLOTS[i], captain: account===entry.captain, points: null, games: [] }));
    return `<div class="ft-view-lineup">${lineup.map((p) => {
      const player = { account: p.account, name: nameOf(p.account), team: teamOf.get(p.account) ?? "" };
      return `<div class="ft-view-pick">${card(player, p.pos, { own: true })}
        <div class="ft-pick-score">${POS_SHORT[p.pos]}${p.captain?' · Captain 2×':''} · <b>${p.points == null ? (week.lock > now ? "Pending" : "Not counted") : `${p.points.toFixed(1)} fantasy points`}</b></div></div>`;
    }).join("")}</div>
    <details class="ft-breakdown"><summary>Weekly score breakdown${scored ? ` · ${scored.points.toFixed(1)} fantasy points` : (week.lock > now ? " · pending" : " · not counted")}</summary>
      ${scored ? lineup.map((p) => `<div class="ft-wk"><h3>${pLink(p.account)}${p.captain?' · Captain 2×':''} · ${p.points.toFixed(1)} fantasy points</h3>${p.captain?`<p class="ft-note">${p.basePoints.toFixed(1)} base points × 2. Game contributions below show points before the captain bonus.</p>`:''}
        ${p.games.length ? p.games.map((g) => `<details><summary>${esc(at(g.time))} · ${g.score.toFixed(1)} points · ${g.counted ? "Counted" : "Dropped"}</summary>
          <a href="${esc((sourceOf.get(p.account) ?? src).link(g.match))}">View game</a>
          <div class="table-wrap"><table class="ft-table"><thead><tr><th>Stat</th><th class="num">Value</th><th class="num">Fantasy points</th></tr></thead>
          <tbody>${g.parts.map((x) => `<tr><td>${esc(x.label)}</td><td class="num">${Number(x.value.toFixed(3))}</td><td class="num">${x.points.toFixed(3)}</td></tr>`).join("")}</tbody></table></div></details>`).join("") : `<p class="ft-note">No games recorded this week.</p>`}</div>`).join("")
        : `<p class="ft-note">${week.lock > now ? "Scoring starts when picks lock." : "Saved after the lock or invalid; this entry does not count."}</p>`}
    </details>`;
  };
  const savedWeeks = [...weeks].reverse().filter((w) => entries?.some((e) => e.week === w.key));
  const lineupsHtml = entries == null ? `<div class="panel empty">Couldn't load saved lineups.</div>`
    : !savedWeeks.length ? `<div class="panel empty">No saved lineups yet.</div>`
    : savedWeeks.map((w) => `<details class="ft-saved-week"${w === savedWeeks[0] ? " open" : ""}><summary>${weekLabel(w.key)}</summary>
      ${entries.filter((e) => e.week === w.key).sort((a, b) => a.name.localeCompare(b.name)).map((e) => {
        const score = w.lock <= now && scoreEntry(e, w, matches);
        return `<details class="ft-entry"${e.account === me ? " open" : ""}><summary>${esc(e.name)}${e.account === me ? " · You" : ""}
          <span class="ft-total">${w.lock > now ? "Pending" : score ? `${score.points.toFixed(1)} fantasy points` : "Not counted"}</span></summary>${lineupHtml(e, w)}</details>`;
      }).join("")}</details>`).join("");
  const boardHtml = entries == null ? `<div class="panel empty">Couldn't load the leaderboard.</div>`
    : !board.length ? `<div class="panel empty"><strong>No scores yet</strong>The board fills in once the first week with entries locks.</div>`
    : `<div class="table-wrap"><table class="ft-table ft-board"><thead><tr><th scope="col">#</th><th scope="col">Name</th><th scope="col" class="num">Weeks</th><th scope="col" class="num">Last week</th><th scope="col" class="num">Fantasy points</th></tr></thead><tbody>
      ${board.map((r, i) => `<tr${r.account === me ? ' class="ft-me"' : ""}><td>${i + 1}</td><td>${esc(r.name)}</td><td class="num">${r.weeks.length}</td><td class="num">${r.weeks[0]?.points.toFixed(1) ?? "—"}</td><td class="num"><b>${r.points.toFixed(1)}</b></td></tr>`).join("")}
      </tbody></table></div>`;
  const weeklyBoards = entries ? [...weeks].reverse().filter((w) => w.lock <= now).map((w) => {
    const rows = weekBoard(entries, w, matches);
    return `<h3>${weekLabel(w.key)}</h3>${rows.length ? `<div class="table-wrap"><table class="ft-table"><thead><tr><th>#</th><th>Name</th><th class="num">Fantasy points</th></tr></thead><tbody>${rows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.name)}</td><td class="num">${r.points.toFixed(1)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="ft-note">No scores yet.</p>`}`;
  }).join("") : "";
  host.innerHTML = `${PAINT_FILTER}
    <div class="ft-sign"><label>Fantasy <select id="ft-scope">${TEST_WEEK ? `<option value="all"${shared ? " selected" : ""}>Cross-division tiebreaker test</option>` : ""}<option value="${src.key}"${!shared ? " selected" : ""}>${esc(src.division)} playoffs</option></select></label>
    <details class="ft-rules"><summary>ⓘ Fantasy scoring and rules</summary><p>Five players, one per position. ${shared ? "This first test week combines Challenger, Champion, and Heroic/Aegis tiebreakers." : "After the test week, picks are limited to this division's playoff bracket."} You can't pick yourself. Picks lock at the first series start.</p>
      <p>Fantasy points are raw stat points, with no curve or comparison to other players. Each pick counts their best ${GAMES_COUNTED} games of the week. Choose one captain from your five picks to double their weekly points. Position does not change the score. Missing stats count as zero; scores update as games are synced.</p>
      <ul>${FANTASY_POINTS.map(([label, per, unit]) => `<li>${esc(label)}: ${per} per ${esc(unit)}</li>`).join("")}</ul></details></div>
    <div class="ft-sign">${signIn}</div>${mineHtml}${picker}
    <section class="ft-last"><h2>Player lineups</h2>${lineupsHtml}</section>
    <section class="ft-board-wrap"><h2>${shared ? "Test week" : "Playoff"} leaderboard</h2>${boardHtml}</section>
    <section class="ft-board-wrap"><h2>Weekly leaderboards</h2>${weeklyBoards || `<p class="ft-note">Scores appear after picks lock.</p>`}</section>`;
  host.querySelector("#ft-scope").addEventListener("change", (e) => mountFantasy(host, viewSrc, e.target.value));

  const rerender = () => mountFantasy(host, viewSrc, scope);
  // The display case shows each slot's pick standing on its pedestal: a copy of the deck card
  // without the pick buttons, face up, that turns over when clicked. The active slot's deck shows;
  // a card picked for another slot says which.
  const mini = (c) => {
    const m = c.cloneNode(true);
    m.classList.remove("picked", "flipped", "pickup");
    m.classList.add("ft-mini");
    m.removeAttribute("data-pick"); m.removeAttribute("data-taken"); m.removeAttribute("style");
    m.querySelectorAll(".ft-pickbtn").forEach((x) => x.remove());
    m.querySelector(".ft-turn").setAttribute("aria-expanded", "false");
    m.querySelector(".ft-front").removeAttribute("aria-hidden");
    m.querySelector(".ft-back").setAttribute("aria-hidden", "true");
    return m.outerHTML;
  };
  const sync = () => {
    if(!picks.includes(captain))captain=null;
    for (const b of host.querySelectorAll(".ft-slot")) {
      const s = Number(b.dataset.slot), a = picks[s - 1], c = a != null && host.querySelector(`.ft-deck[data-deck="${s}"] [data-pick="${a}"]`);
      const tab = b.querySelector(".ft-plinth");
      const captainButton=b.querySelector('[data-captain-slot]');
      captainButton.disabled=locked||!c;
      captainButton.setAttribute('aria-pressed',String(a!=null&&a===captain));
      captainButton.textContent=a!=null&&a===captain?'Captain · 2×':'Make captain';
      captainButton.setAttribute('aria-label',c?`${a===captain?'Captain, double points:':'Make captain:'} ${nameOf(a)}`:`Pick a player in position ${s} before choosing a captain`);
      tab.setAttribute("aria-selected", String(s === activeSlot));
      b.classList.toggle("active", s === activeSlot);
      b.classList.toggle("filled", !!c);
      tab.setAttribute("aria-label", `Pos ${s}, ${POS_SHORT[s]}: ${c ? c.querySelector(".ft-name").textContent : "empty"}`);
      if (b.dataset.acc !== String(c ? a : "")) {
        b.dataset.acc = c ? a : "";
        b.querySelector(".ft-stage").innerHTML = c ? mini(c) : `<span class="ft-empty" aria-hidden="true"><b>${s}</b>Open</span>`;
      }
    }
    for (const dk of host.querySelectorAll(".ft-deck")) {
      const s = Number(dk.dataset.deck);
      dk.hidden = s !== activeSlot;
      for (const c of dk.querySelectorAll("[data-pick]")) {
        const a = Number(c.dataset.pick), at = picks.indexOf(a) + 1;
        c.classList.toggle("picked", at === s);
        for (const btn of c.querySelectorAll("[data-act=pick]")) {
          btn.setAttribute("aria-pressed", String(at === s));
          btn.textContent = at === s ? "Picked · tap to drop" : at ? `In pos ${at} · move here` : `Pick for pos ${s}`;
        }
        c.dataset.taken = at && at !== s ? `In pos ${at}` : "";
      }
    }
  };
  // Card art that fails to load falls back to the hero's wide image.
  host.addEventListener("error", (ev) => {
    const img = ev.target;
    if (img.dataset?.wide && img.src !== img.dataset.wide) img.src = img.dataset.wide;
  }, true);
  // Flip a card, keeping the hidden face's button out of the tab order.
  const flip = flipPlayerCard;

  // Clicking a card anywhere but its pick button turns it over (the turn button does the same from
  // the keyboard). Signed out, the pick button starts the Steam sign-in.
  host.addEventListener("click", (ev) => {
    const c = ev.target.closest(".ft-card");
    if (!c) return;
    if (ev.target.closest("[data-act=signin]")) { startSteamSignIn(); return; }
    if (ev.target.closest("[data-act=pick]")) return; // the deck's handler picks
    if (ev.target.closest(".ft-expand")) { showBigCard(c); return; }
    if (ev.target.closest(".ft-mine-card .ft-front")) return;
    flip(c, !c.classList.contains("flipped"));
  });

  host.querySelector('#ft-collection')?.addEventListener('click',()=>openCollection({tab:'customize',name:meP.name,cardHtml:card(meP,roleOf(me),{own:true})}));

  if (open) {
    sync();
    for (const b of host.querySelectorAll(".ft-slot")) b.addEventListener("click", (e) => {
      if(e.target.closest('[data-captain-slot]')){captain=picks[Number(b.dataset.slot)-1];sync();return;}
      activeSlot = Number(b.dataset.slot); sync();
    });
    host.querySelectorAll(".ft-deck").forEach((dk) => dk.addEventListener("click", (ev) => {
      const c = ev.target.closest("[data-pick]");
      const btn = ev.target.closest("[data-act=pick]");
      if (!btn || btn.disabled) return;
      const a = Number(c.dataset.pick), s = Number(dk.dataset.deck);
      if (picks[s - 1] === a) { picks[s - 1] = null; sync(); return; }
      const was = picks.indexOf(a);
      if (was >= 0) picks[was] = null;
      picks[s - 1] = a;
      // The pick-up: the card lifts off the table and turns face up; the slot it filled pops.
      flip(c, false);
      c.classList.remove("pickup"); void c.offsetWidth; c.classList.add("pickup");
      const slotBtn = host.querySelector(`.ft-slot[data-slot="${s}"]`);
      if (slotBtn) { slotBtn.classList.remove("pop"); void slotBtn.offsetWidth; slotBtn.classList.add("pop"); }
      sync();
      // On to the next empty slot, if any, once the pick-up has played (unless something changed meanwhile).
      const next = picks.findIndex((x, i) => x == null && i > s - 1);
      const any = next >= 0 ? next : picks.indexOf(null);
      if (any >= 0) setTimeout(() => {
        if (picks[s - 1] !== a || activeSlot !== s) return;
        activeSlot = any + 1; sync(); host.querySelector(".ft-lineup").scrollIntoView({ block: "nearest", behavior: "smooth" });
      }, reduceMotion() ? 0 : 750);
    }));
  }
  // Cards tilt toward the mouse and catch the light; touch and reduced-motion views stay flat.
  {
    host.addEventListener("pointermove", (ev) => {
      const t = ev.pointerType === "mouse" && !reduceMotion() && ev.target.closest?.(".ft-card");
      if (!t) return;
      const r = t.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
      t.style.setProperty("--ry", `${((x - 0.5) * 14).toFixed(2)}deg`);
      t.style.setProperty("--rx", `${((0.5 - y) * 12).toFixed(2)}deg`);
      t.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
      t.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
    });
    host.addEventListener("pointerout", (ev) => {
      const t = ev.target.closest?.(".ft-card");
      if (t && !t.contains(ev.relatedTarget)) for (const v of ["--rx", "--ry", "--mx", "--my"]) t.style.removeProperty(v);
    });
    host.addEventListener("animationend", (ev) => {
      if (ev.animationName === "ft-pickup") ev.target.closest(".ft-card")?.classList.remove("pickup");
      if (ev.animationName === "ft-land") ev.target.closest(".ft-slot")?.classList.remove("pop");
    });
  }
  host.querySelector("#ft-in")?.addEventListener("click", startSteamSignIn);
  host.querySelector("#ft-out")?.addEventListener("click", async () => { await steamSignOut(); mountMe(); rerender(); });
  document.getElementById("ft-save")?.addEventListener("click", async () => {
    const msg = document.getElementById("ft-msg");
    const name = document.getElementById("ft-name").value.trim();
    const err = checkPicks(picks, pickable(d.teams, open, me), me) ?? (Number.isInteger(captain)&&picks.includes(captain)?null:"Choose a captain for double points.") ?? (name ? null : "Type a name for the board.");
    if (err) { msg.textContent = err; return; }
    if (nowSec() >= open.lock) { msg.textContent = "Picks are locked for this week."; return; }
    msg.textContent = "Saving…";
    try { await saveFantasy(scope, open.key, picks, name, captain); rerender(); }
    catch (e) { console.warn(e); msg.textContent = `Couldn't save: ${e.code === "permission-denied" ? "the database refused it" : e.message.replace(/\.$/, "")}.`; }
  });
}
