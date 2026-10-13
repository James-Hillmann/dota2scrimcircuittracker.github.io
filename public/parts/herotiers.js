// Hero tier lists on the Heroes tab: the heroes themselves (by how well players do on them) and
// every player on every hero they've played enough (by hero rating), each ranked S–D. Click a
// card for its breakdown: every point of the rating.
import { heroTierList, heroPowerList, HERO_TIER_MIN, MIN_GAMES, K_HERO, TIERS } from "../lib/tiers.js";
import { info } from "../lib/glossary.js";
import { ordinal } from "../lib/ranks.js";
import { esc, portrait, heroLink, heroHref, playerLink, teamLink } from "../core.js";
import { tierBreakdown, tenths, meter } from "./tiers.js";

const SHOWN = 24; // chips per band before "+N more"
// open = tiers shown in full; cards = cards whose breakdown is open
const st = { role: "all", min: HERO_TIER_MIN, hero: "", open: new Set(), cards: new Set() };
const hs = { min: MIN_GAMES, open: new Set(), cards: new Set() };

// The S–D board: one band per tier, the first SHOWN chips, then a "+N more" toggle. An open
// card always shows, even past the cut.
function board(bands, chip, open, isOpen) {
  return `<div class="tier-board">${bands.map(({ tier, items }) => {
    const all = open.has(tier), cut = all ? items : items.filter((x, i) => i < SHOWN || isOpen(x)), more = items.length - cut.length;
    return `<div class="tier-band t-${tier}">
      <div class="tier-letter">${tier}</div>
      <div class="tier-chips">${cut.length ? cut.map(chip).join("") : `<div class="tier-empty">No heroes in ${tier} yet</div>`}
        ${more > 0 ? `<button type="button" class="hchip-more" data-tier="${tier}">+${more} more</button>` : all && items.length > SHOWN ? `<button type="button" class="hchip-more" data-tier="${tier}">Show fewer</button>` : ""}</div>
    </div>`;
  }).join("")}</div>`;
}
const wireMore = (el, open, draw) => el.querySelectorAll(".hchip-more").forEach((b) => (b.onclick = () => { const t = b.dataset.tier; open.has(t) ? open.delete(t) : open.add(t); draw(); }));
// Cards open and close on click or Enter/Space, except on their links and inside the breakdown.
function wireCards(el, cards, draw) {
  const toggle = (c) => {
    const k = c.dataset.key;
    cards.has(k) ? cards.delete(k) : cards.add(k);
    draw();
    el.querySelector(`.chip[data-key="${CSS.escape(k)}"]`)?.focus({ preventScroll: true });
  };
  el.querySelectorAll(".chip[data-key]").forEach((c) => {
    c.onclick = (e) => { if (!e.target.closest("a") && !e.target.closest(".bd")) toggle(c); };
    c.onkeydown = (e) => { if ((e.key === "Enter" || e.key === " ") && e.target === c) { e.preventDefault(); toggle(c); } };
  });
}
const cardAttrs = (key, open) => `data-key="${esc(key)}" tabindex="0" role="button" aria-expanded="${open}" title="${open ? "Click to close" : "Click for the breakdown"}"`;
const caret = (open) => `<div class="chip-caret" aria-hidden="true">${open ? "Close <b>▴</b>" : "Breakdown <b>▾</b>"}</div>`;
// Never open on an empty board: with few games, lower the floor until something shows.
const floorFor = (want, counts, steps) => { let min = want; while (min > 1 && !counts.some((n) => n >= min)) min = steps.filter((n) => n < min).pop(); return min; };
const minSelect = (id, steps, min) => `<select id="${id}">${steps.map((n) => `<option value="${n}" ${n === min ? "selected" : ""}>${n}</option>`).join("")}</select>`;
const signed = (v) => (Number(v) > 0 ? `+${v}` : Number(v) < 0 ? `−${String(v).replace("-", "")}` : "0.0");

// A hero's rating, point by point: each player's games × their hero rating, the padding games,
// the curve. The shown rows add up to the shown average and rating.
function heroBreakdown(src, h, curve) {
  const n = h.games + K_HERO;
  const parts = [...h.on.map((p) => (p.rating_exact * p.games) / n), (50 * K_HERO) / n];
  const shown = tenths(parts, h.avg), avgShown = h.avg.toFixed(1);
  const curveDelta = (h.rating - Number(avgShown)).toFixed(1);
  const widths = (h.avg - curve[0]) / curve[1];
  const tierOf = (p) => TIERS.find((t) => p.rating_exact >= t.min).tier;
  const row = (p, i) => `<tr>
      <td class="l">${playerLink(src, p)}${p.team ? `<small class="bd-raw">${teamLink(src, p.team)}</small>` : ""}</td>
      <td>${p.wins}–${p.games - p.wins}</td>
      <td class="bd-100 t-${tierOf(p)}"><b>${p.rating} <small class="bd-dim">${tierOf(p)}</small></b>${meter(p.rating_exact)}</td>
      <td class="bd-dim bd-wide">${p.games} × ${p.rating_exact.toFixed(1)}<small class="bd-raw">${Math.round((p.games / n) * 100)}% of the weight</small></td>
      <td class="bd-pts">${shown[i]}</td></tr>`;
  const best = h.on[0], worst = h.on[h.on.length - 1];
  return `<div class="bd hbd">
    <div class="bd-left">
    <div class="bd-sum">
      <div class="bd-total"><b>${h.rating}</b><small>rating</small></div>
      <div class="bd-eq">average <b>${avgShown}</b> = (games × hero rating, for each player, + ${K_HERO} × 50) ÷ (${h.games} + ${K_HERO} games)<br>
        <small>rating ${h.rating} = average ${avgShown} ${signed(curveDelta)} from the hero curve${info("hero_power_list")}</small></div>
    </div>
    <h4>Summary</h4>
    <ul class="how-list hbd-why">
      <li><b>${h.players}</b> player${h.players === 1 ? "" : "s"} played ${esc(h.hero)} in <b>${h.games}</b> game${h.games === 1 ? "" : "s"} (${h.wins}–${h.games - h.wins}). Their hero ratings, weighted by games, average <b>${avgShown}</b> after padding.</li>
      <li>The median hero's players average <b>${curve[0].toFixed(1)}</b>, so ${esc(h.hero)} sits <b>${Math.abs(widths).toFixed(2)}</b> width${Math.abs(widths).toFixed(2) === "1.00" ? "" : "s"} ${widths >= 0 ? "above" : "below"} it (a width = ${curve[1].toFixed(1)}): rating <b>${h.rating}</b>, ${ordinal(h.place)} of ${h.of} heroes shown.</li>
      ${h.players > 1 ? `<li>Best on it: ${playerLink(src, best)} (${best.rating} over ${best.games} game${best.games === 1 ? "" : "s"}). Lowest: ${playerLink(src, worst)} (${worst.rating} over ${worst.games}).</li>` : ""}
      <li>The ${K_HERO} padding games at 50 (the league's median player) pull small samples toward the middle (${Math.round((K_HERO / n) * 100)}% of the weight here).</li>
    </ul>
    </div>
    <div class="bd-right">
    <h4>Players <small>points = games × hero rating ÷ ${n}</small></h4>
    <table class="bd-table">
      <thead><tr><th scope="col" class="l">Player</th><th scope="col">W–L</th><th scope="col">Hero rating${info("hero_rating")}</th><th scope="col" class="bd-wide">Games × rating</th><th scope="col">Points</th></tr></thead>
      <tbody>${h.on.map(row).join("")}
        <tr class="bd-part"><td class="l">Padding<span class="bd-note"> ${K_HERO} average games</span></td><td></td><td class="bd-100"><b>50</b>${meter(50)}</td>
          <td class="bd-dim bd-wide">${K_HERO} × 50.0<small class="bd-raw">${Math.round((K_HERO / n) * 100)}% of the weight</small></td><td class="bd-pts">${shown[shown.length - 1]}</td></tr>
        <tr class="bd-sub"><td class="l">Average</td><td></td><td></td><td class="bd-wide"></td><td class="bd-pts">${avgShown}</td></tr>
        <tr class="bd-mult bd-curve"><td class="l">Hero curve<span class="bd-note"> compares it with the league's other heroes</span></td>
          <td></td><td></td><td class="bd-wide">${widths >= 0 ? "+" : "−"}${Math.abs(widths).toFixed(2)}<small class="bd-raw">widths ${widths >= 0 ? "above" : "below"} the median hero (${curve[0].toFixed(1)}, which rates 50)</small></td><td class="bd-pts">${signed(curveDelta)}</td></tr>
        <tr class="bd-total-row"><td class="l">Rating</td><td></td><td></td><td class="bd-wide"></td><td class="bd-pts">${h.rating}</td></tr>
      </tbody></table>
    </div>
  </div>`;
}

// The heroes themselves. `ratings` = heroRatings for the page's games.
export function heroPowerSection(src, ratings) {
  const steps = [1, 2, 3, 5, 10];
  let min = floorFor(hs.min, [...ratings.values()].map((ps) => ps.reduce((s, p) => s + p.games, 0)), steps);
  const draw = () => {
    const el = document.getElementById("hero-power");
    if (!el) return;
    const list = heroPowerList(ratings, { minGames: min });
    const bands = list.tiers.map(({ tier, heroes }) => ({ tier, items: heroes }));
    const total = bands.reduce((n, b) => n + b.items.length, 0);
    const chip = (h, i) => {
      const open = hs.cards.has(h.hero);
      return `<div class="chip hchip hpow${open ? " open" : ""}" style="--i:${i}" ${cardAttrs(h.hero, open)}>
        <a class="hchip-img" href="${heroHref(src, h.hero)}" title="${esc(h.hero)}">${portrait(h.hero)}</a>
        <div class="hchip-body">
          <div class="chip-top"><span class="chip-name">${heroLink(src, h.hero)}</span><span class="chip-rating">${h.rating}</span></div>
          <div class="chip-meta" title="Best player on it">Best: ${playerLink(src, h.best)} (${h.best.rating})</div>
          <div class="chip-foot"><span>${h.wins}–${h.games - h.wins}</span><span>${h.games} game${h.games === 1 ? "" : "s"}</span><span>${h.players} player${h.players === 1 ? "" : "s"}</span></div>
        </div>
        ${caret(open)}${open ? heroBreakdown(src, h, list.curve) : ""}
      </div>`;
    };
    el.innerHTML = `<div class="row segs hchip-bar"><label class="min-bar">Heroes picked at least ${minSelect("hp-min", steps, min)} times</label></div>
      ${total ? board(bands, chip, hs.open, (h) => hs.cards.has(h.hero)) : `<p class="table-note keep">No hero has ${min}+ games yet.</p>`}
      <p class="table-note">${total} hero${total === 1 ? "" : "es"}. Rating: the average hero rating of everyone who played it (weighted by games, padded with ${K_HERO} average games), on a curve fitted to the heroes. It ranks how well players do on the hero, not its win rate.</p>`;
    el.querySelector("#hp-min").onchange = (e) => { hs.min = min = +e.target.value; draw(); };
    wireMore(el, hs.open, draw);
    wireCards(el, hs.cards, draw);
  };
  const html = ratings.size ? `<h2 id="hero-power-list">Hero tier list${info("hero_power_list")}</h2>
    <p class="table-note wm-intro">Heroes ranked S–D by how well their players perform. Click a hero for its breakdown.</p>
    <div id="hero-power" class="reveal"></div>` : "";
  return { html, draw };
}

// Every player on every hero. `ratings` = heroRatings for the page's games.
export function heroTierSection(src, ratings) {
  const heroes = [...ratings.keys()].sort();
  if (!ratings.has(st.hero)) st.hero = ""; // a pick from another league's page
  const steps = [1, 2, 3, 5];
  let min = floorFor(st.min, [...ratings.values()].flat().map((p) => p.games), steps);
  const keyOf = (p) => `${p.key}|${p.hero}`;
  const draw = () => {
    const el = document.getElementById("hero-tiers");
    if (!el) return;
    const show = (p) => (st.role === "all" || p.role === st.role) && (!st.hero || p.hero === st.hero);
    const bands = heroTierList(ratings, { minGames: min }).map(({ tier, pairs }) => ({ tier, items: pairs.filter(show) }));
    const total = bands.reduce((n, b) => n + b.items.length, 0);
    const chip = (p, i) => {
      const open = st.cards.has(keyOf(p));
      return `<div class="chip hchip ${p.role}${open ? " open" : ""}" style="--i:${i}" ${cardAttrs(keyOf(p), open)}>
        <a class="hchip-img" href="${heroHref(src, p.hero)}" title="${esc(p.hero)}">${portrait(p.hero)}</a>
        <div class="hchip-body">
          <div class="chip-top"><span class="chip-name">${playerLink(src, p)}</span><span class="chip-rating">${p.rating}</span></div>
          <div class="chip-meta">${heroLink(src, p.hero)}${p.team ? ` · ${teamLink(src, p.team)}` : ""}</div>
          <div class="chip-foot"><span class="role-tag">${p.role === "core" ? "Core" : "Support"}</span><span>${p.wins}–${p.games - p.wins}</span><span>${p.games} game${p.games === 1 ? "" : "s"}</span></div>
        </div>
        ${caret(open)}${open ? `<p class="table-note keep hbd-lead">Tier rating from only ${esc(p.name)}'s ${p.games} game${p.games === 1 ? "" : "s"} on ${esc(p.hero)}.</p>${tierBreakdown(src, p)}` : ""}
      </div>`;
    };
    const seg = (k, label) => `<button type="button" class="seg${st.role === k ? " on" : ""}" data-role="${k}">${label}</button>`;
    el.innerHTML = `<div class="row segs hchip-bar">${seg("all", "Everyone")}${seg("core", "Cores")}${seg("support", "Supports")}
        <label class="min-bar">Hero <select id="ht-hero"><option value="">All heroes</option>${heroes.map((h) => `<option value="${esc(h)}" ${h === st.hero ? "selected" : ""}>${esc(h)}</option>`).join("")}</select></label>
        <label class="min-bar">At least ${minSelect("ht-min", steps, min)} games on the hero</label></div>
      ${total ? board(bands, chip, st.open, (p) => st.cards.has(keyOf(p))) : `<p class="table-note keep">Nobody has ${min}+ games on ${st.hero ? esc(st.hero) : "a hero"}${st.role === "all" ? "" : ` as a ${st.role}`} yet.</p>`}
      <p class="table-note">${total} player–hero pair${total === 1 ? "" : "s"}. Rating: the tier rating from their games on that hero only. A couple of games is a small sample.</p>`;
    el.querySelectorAll(".seg").forEach((b) => (b.onclick = () => { st.role = b.dataset.role; draw(); }));
    el.querySelector("#ht-hero").onchange = (e) => { st.hero = e.target.value; draw(); };
    el.querySelector("#ht-min").onchange = (e) => { st.min = min = +e.target.value; draw(); };
    wireMore(el, st.open, draw);
    wireCards(el, st.cards, draw);
  };
  const html = ratings.size ? `<h2 id="hero-tier-list">Players on heroes${info("hero_tier_list")}</h2>
    <p class="table-note wm-intro">Each player on each hero they've played, ranked S–D on their games with it. Click a card for its breakdown.</p>
    <div id="hero-tiers" class="reveal"></div>` : "";
  return { html, draw };
}
