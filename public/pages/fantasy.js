// Fantasy (AD2L divisions), the Predict page's Fantasy tab: this week's five picks and the season
// leaderboard. Rules and scoring in lib/fantasy.js; Steam sign-in through workers/steam-auth
// (lib/store.js, parts/me.js). Loaded when the tab is first shown.
import { SLOTS, GAMES_COUNTED, fantasyWeeks, openWeek, pickable, checkPicks, fantasyModels, scoreEntry, leaderboard } from "../lib/fantasy.js";
import { tierList, tierModel, NEXT } from "../lib/tiers.js";
import { HERO_META, heroById, heroImg, heroVert } from "../lib/hero-meta.js";
import { heroArt } from "../lib/hero-art.js";
import { listFantasy, saveFantasy, listCards, saveCard, steamAccount, steamSignOut } from "../lib/store.js";
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
const localParam = (k) => /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && Number(new URLSearchParams(location.search || location.hash.split("?")[1] || "").get(k));
const nowSec = () => localParam("fantasy_now") || Date.now() / 1000;
// Also on a local preview: ?fantasy_me=<account id> shows the page as that player sees it (their
// own card). Display only: saving still needs their Steam sign-in.

// The cards' hero art filters. Each hero has its own art and style (lib/hero-art.js, picked by
// Fav; styles in style.css .ft-card[data-style]). The default, stencil, is a print to match the
// display type: a hard posterize (#ft-paint) flattens the art into a few flat inks with rigid
// edges. (Its worn speckle is a CSS mask, see .ft-art img; noise inside this filter redraws too
// slowly at card size.) Ember and frost are gradient maps (brightness to three colours); ink is
// flat colour with black outlines from an edge-detect pass.
// Each card offsets the grit tile differently, so the flecks don't repeat card to card.
const gritAt = (key) => { let h = 0; for (const c of String(key)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return `${-(h % 256)}px ${-((h >>> 8) % 256)}px`; };

const PAINT_FILTER = `<svg class="ft-defs" aria-hidden="true" focusable="false"><filter id="ft-paint" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
  <feComponentTransfer>
    <feFuncR type="discrete" tableValues="0.04 0.3 0.58 0.84 1"/>
    <feFuncG type="discrete" tableValues="0.04 0.28 0.55 0.8 0.96"/>
    <feFuncB type="discrete" tableValues="0.05 0.27 0.52 0.76 0.92"/>
  </feComponentTransfer>
</filter>
<filter id="ft-ember" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
  <feColorMatrix type="matrix" values=".3 .59 .11 0 0  .3 .59 .11 0 0  .3 .59 .11 0 0  0 0 0 1 0"/>
  <feComponentTransfer>
    <feFuncR type="table" tableValues="0.04 0.45 0.85 1 1"/>
    <feFuncG type="table" tableValues="0.03 0.08 0.3 0.7 0.95"/>
    <feFuncB type="table" tableValues="0.05 0.08 0.1 0.25 0.8"/>
  </feComponentTransfer>
</filter>
<filter id="ft-frost" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
  <feColorMatrix type="matrix" values=".3 .59 .11 0 0  .3 .59 .11 0 0  .3 .59 .11 0 0  0 0 0 1 0"/>
  <feComponentTransfer>
    <feFuncR type="table" tableValues="0.02 0.05 0.2 0.6 0.95"/>
    <feFuncG type="table" tableValues="0.04 0.2 0.5 0.85 1"/>
    <feFuncB type="table" tableValues="0.08 0.35 0.7 0.95 1"/>
  </feComponentTransfer>
</filter>
<filter id="ft-ink" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
  <feComponentTransfer in="SourceGraphic" result="flat">
    <feFuncR type="discrete" tableValues="0.05 0.35 0.7 1"/>
    <feFuncG type="discrete" tableValues="0.05 0.33 0.66 0.95"/>
    <feFuncB type="discrete" tableValues="0.06 0.3 0.62 0.9"/>
  </feComponentTransfer>
  <feColorMatrix in="SourceGraphic" type="matrix" values=".3 .59 .11 0 0  .3 .59 .11 0 0  .3 .59 .11 0 0  0 0 0 1 0" result="grey"/>
  <feConvolveMatrix in="grey" order="3" kernelMatrix="-1 -1 -1 -1 8 -1 -1 -1 -1" preserveAlpha="true" result="edge"/>
  <feColorMatrix in="edge" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  2.5 0 0 0 0"/>
  <feComponentTransfer result="lines"><feFuncA type="discrete" tableValues="0 0 0.9 1"/></feComponentTransfer>
  <feMerge><feMergeNode in="flat"/><feMergeNode in="lines"/></feMerge>
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

// Each rostered player's card numbers from the league's games: games, wins, average K/D/A, GPM,
// XPM, hero damage and last hits (cores), wards, dewards, stacks and healing (supports), games per
// position, latest medal, and their three most-played heroes.
function cardStats(matches) {
  const by = new Map();
  for (const m of [...matches].sort((x, y) => (x.start_time ?? 0) - (y.start_time ?? 0))) for (const p of m.players ?? []) {
    if (!p.account_id) continue;
    const s = by.get(p.account_id) ?? by.set(p.account_id, { games: 0, wins: 0, k: 0, d: 0, a: 0, gpm: 0, xpm: 0, dmg: 0, lh: 0, obs: 0, sen: 0, dew: 0, stack: 0, heal: 0, pos: [0, 0, 0, 0, 0], rank: null, heroes: new Map() }).get(p.account_id);
    const won = m.winner != null && m.winner === p.team;
    s.games++; s.wins += won; s.k += p.kills ?? 0; s.d += p.deaths ?? 0; s.a += p.assists ?? 0; s.gpm += p.gpm ?? 0;
    s.xpm += p.xpm ?? 0; s.dmg += p.hero_damage ?? 0; s.lh += p.last_hits ?? 0;
    s.obs += p.obs_placed ?? 0; s.sen += p.sen_placed ?? 0; s.dew += (p.obs_killed ?? 0) + (p.sen_killed ?? 0); s.stack += p.camps_stacked ?? 0; s.heal += p.hero_healing ?? 0;
    if (p.position >= 1 && p.position <= 5) s.pos[p.position - 1]++;
    if (p.rank_tier) s.rank = p.rank_tier;
    if (p.hero) { const h = s.heroes.get(p.hero) ?? s.heroes.set(p.hero, { hero: p.hero, games: 0, wins: 0 }).get(p.hero); h.games++; h.wins += won; }
  }
  for (const s of by.values()) s.top = [...s.heroes.values()].sort((x, y) => y.games - x.games || y.wins - x.wins).slice(0, 3);
  return by;
}

const MEDALS = ["Herald", "Guardian", "Crusader", "Archon", "Legend", "Ancient", "Divine", "Immortal"];
const medal = (t) => (!t ? "—" : t >= 80 ? "Immortal" : `${MEDALS[Math.floor(t / 10) - 1] ?? "—"} ${t % 10 || ""}`.trim());
const kShort = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export async function mountFantasy(host, viewSrc) {
  const src = SOURCES[viewSrc.key]; // Heroic A/B views play the whole league's game
  let d, matches, entries, me, cards;
  try { [d, matches, me] = await Promise.all([src.data(), src.load(), steamAccount()]); }
  catch (e) { host.innerHTML = errorBox(e); return; }
  me = localParam("fantasy_me") || me;
  [entries, cards] = await Promise.all([
    listFantasy(src.key).catch((e) => { console.warn(e); return null; }),
    listCards().catch((e) => { console.warn(e); return new Map(); }),
  ]);

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
    ? `<button type="button" class="primary" id="ft-in">Sign in with Steam</button> <span class="ft-note">to make picks and set your own card. Only your Steam ID is shared.</span>`
    : `Signed in as <b>${esc(rosterName.get(me) ?? steamName(me) ?? nameOf(me))}</b> <button type="button" class="linkish" id="ft-out">Sign out</button>`;

  // The cards. Each player's role is the one they set on their card (a role swap), else the
  // position they've played most; the art is the hero they set, else their most played.
  const mainPos = mainPositions(matches);
  const stats = cardStats(matches);
  const tiers = new Map(tierList(matches, { model: tierModel(matches, { version: NEXT }) }).tiers.flatMap(({ tier, players }) => players.map((p) => [p.key, { tier, rating: p.rating }])));
  const locked = me == null;
  const roleOf = (a, ov = cards.get(a)) => ov?.pos ?? mainPos.get(a);
  // A player card: the front is the hero art in its frame, the back their league numbers (support
  // numbers for a pos 4 or 5). The turn button flips it; the front (or the back's Pick button)
  // picks. `own`: the signed-in player's card, which they edit rather than pick; `ov` stands in for
  // their saved choices while they try some.
  const card = (p, slot, { own = false, ov = cards.get(p.account) } = {}) => {
    const st = stats.get(p.account), t = tiers.get(String(p.account)), top = st?.top ?? [], g = st?.games ?? 0;
    const face = heroById(ov?.hero)?.name ?? top[0]?.hero, faceRec = face && st?.heroes.get(face);
    const ha = face && heroArt(face), art = ha?.src ?? (face && heroVert(face)), wide = face && heroImg(face);
    const avg = (v) => (g ? v / g : 0), one = (v) => (g ? avg(v).toFixed(1) : "—");
    const role = roleOf(p.account, ov), set = ov?.pos != null;
    const kda = g ? `${one(st.k)}/${one(st.d)}/${one(st.a)}` : "—";
    const posMax = Math.max(1, ...(st?.pos ?? [0]));
    const tierChip = `<span class="ft-tier">${t ? `${t.tier}<small>${t.rating}</small>` : "—"}</span>`;
    const stat = (v, label, wide) => `<span${wide ? ' class="wide"' : ""}><b>${v}</b>${label}</span>`;
    const hero = (h) => `<span class="ft-hrow"><span class="ft-h">${heroImg(h.hero) ? `<img src="${esc(heroImg(h.hero))}" alt="" loading="lazy">` : ""}<b>${h.games}</b></span><span class="ft-hname">${esc(h.hero)}</span><span class="ft-hrec">${h.games}g · ${Math.round((100 * h.wins) / h.games)}%</span></span>`;
    // Second stat row: farm and damage for cores, vision, stacks and healing for supports.
    const second = role >= 4
      ? `${stat(g ? `${one(st.obs)}/${one(st.sen)}` : "—", "Obs/Sen wards", true)}${stat(one(st.stack), "Stacks")}${stat(g ? kShort(avg(st.heal)) : "—", "Healing")}`
      : `${stat(g ? Math.round(avg(st.gpm)) : "—", "GPM")}${stat(g ? Math.round(avg(st.xpm)) : "—", "XPM")}${stat(g ? kShort(avg(st.dmg)) : "—", "Hero dmg")}${stat(g ? Math.round(avg(st.lh)) : "—", "Last hits")}`;
    const pill = role ? `<span class="ft-pos${role === slot ? " here" : ""}${set ? " set" : ""}"${set ? ` title="Role set by ${own ? "you" : esc(p.name)}"` : ""}>Pos ${role}</span>` : "";
    // Pick buttons, front and back (the back's stays out of the tab order until it's turned up).
    // Signed out, they offer the Steam sign-in instead.
    const pickBtn = (cls, hidden) => `<button type="button" class="ft-pickbtn ${cls}"${hidden ? ' tabindex="-1"' : ""} ${locked ? 'data-act="signin">Sign in to pick' : `data-act="pick" aria-pressed="false">Pick for pos ${slot}`}</button>`;
    return `<div class="ft-card${t ? ` t-${t.tier}` : ""}${ha ? ` ${ha.cls}` : ""}${own ? " own" : ""}"${ha ? ` data-style="${ha.style}"` : ""} data-pick="${p.account}">
      <div class="ft-tilt"><div class="ft-flip">
        <div class="ft-face ft-front" role="group" aria-label="${esc(p.name)}, ${esc(p.team)}${t ? `, tier ${t.tier}` : ""}${face ? `, ${esc(face)}` : ""}">
          <span class="ft-art" style="--grit:${gritAt(p.account)}">${art ? `<img src="${esc(art)}" alt="" loading="lazy" data-wide="${esc(wide)}">` : ""}</span>
          ${tierChip}
          ${pill}
          <span class="ft-plate">
            <span class="ft-name">${esc(p.name)}</span>
            <span class="ft-tm">${esc(p.team)}</span>
            ${face ? `<span class="ft-sig">${esc(face)}${faceRec ? ` · ${faceRec.games} game${faceRec.games === 1 ? "" : "s"}` : ""}</span>` : ""}
            ${own ? "" : pickBtn("ft-fpick")}
          </span>
          <span class="ft-shine"></span>
        </div>
        <div class="ft-face ft-back" aria-hidden="true">
          <span class="ft-bhead">${tierChip}<span class="ft-bname"><span class="ft-name">${esc(p.name)}</span><span class="ft-tm">${esc(p.team)}</span>${st?.rank ? `<span class="ft-medal">${esc(medal(st.rank))}${role ? ` · ${role >= 4 ? "Support" : "Core"}` : ""}</span>` : ""}</span></span>
          <span class="ft-stats">
            ${stat(g, "Games")}${stat(g ? Math.round((100 * st.wins) / g) + "%" : "—", "Win")}${stat(kda, "K/D/A", true)}
            ${second}
          </span>
          <span class="ft-label">Positions played</span>
          <span class="ft-posbars">${[1, 2, 3, 4, 5].map((n) => { const c = st?.pos[n - 1] ?? 0; return `<span class="${n === slot ? "here" : ""}" title="Pos ${n}: ${c} game${c === 1 ? "" : "s"}"><i style="height:${Math.round((100 * c) / posMax)}%"></i><b>${n}</b></span>`; }).join("")}</span>
          <span class="ft-label">Top heroes</span>
          <span class="ft-heroes">${top.length ? top.map(hero).join("") : `<span class="ft-note">No league games yet</span>`}</span>
          ${own ? "" : pickBtn("ft-bpick", true)}
        </div>
      </div>
      <button type="button" class="ft-turn" aria-label="Flip ${esc(p.name)}'s card for stats" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 0 1 13.7-5.6L20 4v6h-6l2.3-2.3A6 6 0 0 0 6 12zm16 0a8 8 0 0 1-13.7 5.6L4 20v-6h6l-2.3 2.3A6 6 0 0 0 18 12z"/></svg></button>
    </div></div>`;
  };

  // Your own card, when you're on one of this league's rosters: the hero on its front and the role
  // you play now. Only your Steam sign-in can save it (Firestore rules, cards).
  const meP = me != null && rosterName.has(me) ? { account: me, name: rosterName.get(me), team: teamOf.get(me) ?? "" } : null;
  let mineHtml = "";
  if (meP) {
    const mineNow = cards.get(me) ?? { hero: null, pos: null }, myTop = stats.get(me)?.top ?? [];
    const heroOpt = ([id, name]) => `<option value="${id}"${mineNow.hero === id ? " selected" : ""}>${esc(name)}</option>`;
    const topIds = new Set(myTop.map((h) => HERO_META.find((x) => x[1] === h.hero)?.[0]).filter(Boolean));
    const allHeroes = [...HERO_META].sort((x, y) => x[1].localeCompare(y[1]));
    mineHtml = `<section class="ft-mine"><h2>Your card</h2>
      <div class="ft-mine-row">
        <div class="ft-mine-card">${card(meP, roleOf(me), { own: true })}</div>
        <div class="ft-mine-form">
          <p class="ft-note">Only you can change your card. Everyone picking in Fantasy sees it.</p>
          <label>Hero on the front <select id="ft-hero">
            <option value="">Most played${myTop[0] ? ` (${esc(myTop[0].hero)})` : ""}</option>
            ${topIds.size ? `<optgroup label="Your most played">${allHeroes.filter((h) => topIds.has(h[0])).map(heroOpt).join("")}</optgroup>` : ""}
            <optgroup label="All heroes">${allHeroes.filter((h) => !topIds.has(h[0])).map(heroOpt).join("")}</optgroup>
          </select></label>
          <label>Role <select id="ft-role">
            <option value="">Most played${mainPos.get(me) ? ` (pos ${mainPos.get(me)})` : ""}</option>
            ${SLOTS.map((n) => `<option value="${n}"${mineNow.pos === n ? " selected" : ""}>${POS_NAME[n]}</option>`).join("")}
          </select></label>
          <p class="ft-note">Swapped roles? Set the one you play now. Your card moves to that position's picks and its back shows that role's numbers. Points don't change: every pick scores as the position it's picked for.</p>
          <div class="ft-mine-save"><button type="button" class="primary" id="ft-card-save">Save card</button><span class="ft-msg" id="ft-card-msg" role="status"></span></div>
        </div>
      </div>
    </section>`;
  }

  // This week's picker: a lineup bar (one tab per position) over a deck of player cards per
  // position. `picks` holds the choices until saved.
  let picker, picks = [], activeSlot = 1;
  if (!open) picker = `<div class="panel empty"><strong>No week open</strong>PlayOn hasn't posted the next series yet.</div>`;
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
          <div class="ft-case-title"><span>Your official picks</span></div>
          <div class="ft-lineup" role="tablist" aria-label="Your lineup">${SLOTS.map((s) => `<div class="ft-slot" data-slot="${s}"><div class="ft-stage"></div><button type="button" class="ft-plinth" role="tab" aria-selected="false"><span class="ft-slot-pos">Pos ${s}</span><span class="ft-slot-role">${POS_SHORT[s]}</span></button></div>`).join("")}</div>
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
    ${mineHtml}
    ${picker}
    ${lastHtml}
    <section class="ft-board-wrap"><h2>Season leaderboard</h2>${boardHtml}</section>`;

  const rerender = () => mountFantasy(host, viewSrc);
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
    for (const b of host.querySelectorAll(".ft-slot")) {
      const s = Number(b.dataset.slot), a = picks[s - 1], c = a != null && host.querySelector(`.ft-deck[data-deck="${s}"] [data-pick="${a}"]`);
      const tab = b.querySelector(".ft-plinth");
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
  const flip = (c, on) => {
    c.classList.toggle("flipped", on);
    c.querySelector(".ft-turn").setAttribute("aria-expanded", String(on));
    c.querySelector(".ft-front").setAttribute("aria-hidden", String(on));
    c.querySelector(".ft-back").setAttribute("aria-hidden", String(!on));
    const fp = c.querySelector(".ft-fpick"), bp = c.querySelector(".ft-bpick");
    if (fp) fp.tabIndex = on ? -1 : 0;
    if (bp) bp.tabIndex = on ? 0 : -1;
  };
  // Clicking a card anywhere but its pick button turns it over (the turn button does the same from
  // the keyboard). Signed out, the pick button starts the Steam sign-in.
  host.addEventListener("click", (ev) => {
    const c = ev.target.closest(".ft-card");
    if (!c) return;
    if (ev.target.closest("[data-act=signin]")) { startSteamSignIn(); return; }
    if (ev.target.closest("[data-act=pick]")) return; // the deck's handler picks
    flip(c, !c.classList.contains("flipped"));
  });

  // Your card: the choices show on it as you make them; Save card stores them.
  const mineBox = host.querySelector(".ft-mine-card");
  if (mineBox) {
    const chosenCard = () => ({ hero: Number(host.querySelector("#ft-hero").value) || null, pos: Number(host.querySelector("#ft-role").value) || null });
    const preview = () => {
      const ov = chosenCard(), flipped = mineBox.querySelector(".ft-card")?.classList.contains("flipped");
      mineBox.innerHTML = card(meP, roleOf(me, ov), { own: true, ov });
      if (flipped) flip(mineBox.querySelector(".ft-card"), true);
      host.querySelector("#ft-card-msg").textContent = "";
    };
    host.querySelector("#ft-hero").addEventListener("change", preview);
    // A new role shows the back, where the numbers change.
    host.querySelector("#ft-role").addEventListener("change", () => { preview(); flip(mineBox.querySelector(".ft-card"), true); });
    host.querySelector("#ft-card-save").addEventListener("click", async () => {
      const msg = host.querySelector("#ft-card-msg");
      msg.textContent = "Saving…";
      try { await saveCard(chosenCard()); rerender(); }
      catch (e) { console.warn(e); msg.textContent = `Couldn't save: ${e.code === "permission-denied" ? "the database refused it" : e.message.replace(/\.$/, "")}.`; }
    });
  }

  if (open) {
    sync();
    for (const b of host.querySelectorAll(".ft-slot")) b.addEventListener("click", () => { activeSlot = Number(b.dataset.slot); sync(); });
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
    const err = checkPicks(picks, pickable(d.teams, open, me), me) ?? (name ? null : "Type a name for the board.");
    if (err) { msg.textContent = err; return; }
    if (nowSec() >= open.lock) { msg.textContent = "Picks are locked for this week."; return; }
    msg.textContent = "Saving…";
    try { await saveFantasy(src.key, open.key, picks, name); rerender(); }
    catch (e) { console.warn(e); msg.textContent = `Couldn't save: ${e.code === "permission-denied" ? "the database refused it" : e.message.replace(/\.$/, "")}.`; }
  });
}
