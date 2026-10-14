// Shared Fantasy player cards, used by the picker, saved lineups, and tier list.
import { esc } from "../core.js";
import { playerKey } from "../lib/stats.js";
import { heroById, heroImg, heroVert, HERO_META } from "../lib/hero-meta.js";
import { cardArtwork } from "../lib/card-art.js";
import { teamLogoHtml } from "../lib/team-logos.js";
import { cosmeticAttributes, cosmeticLayers, playerEquipment, playerNickname } from '../lib/cosmetics.js';
import { BACK_STATS, backStats, partState } from '../lib/card-layout.js';
import { plusSlot } from "../lib/hero-levels.js";

// The cards' hero art filters. Each hero has its own art and style (lib/hero-art.js, picked by
// Fav; styles in style.css .ft-card[data-style]). The default, stencil, is a print to match the
// display type: a hard posterize (#ft-paint) flattens the art into a few flat inks with rigid
// edges. (Its worn speckle is a CSS mask, see .ft-art img; noise inside this filter redraws too
// slowly at card size.) Ember and frost are gradient maps (brightness to three colours); ink is
// flat colour with black outlines from an edge-detect pass.
// Each card offsets the grit tile differently, so the flecks don't repeat card to card.
const gritAt = (key) => { let h = 0; for (const c of String(key)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return `${-(h % 256)}px ${-((h >>> 8) % 256)}px`; };

export const PAINT_FILTER = `<svg class="ft-defs" aria-hidden="true" focusable="false"><filter id="ft-paint" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
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
export function mainPositions(matches) {
  const c = new Map();
  for (const m of matches) for (const p of m.players ?? []) {
    const account = p.account_id ?? playerKey(p);
    if (!p.position) continue;
    const k = c.get(account) ?? c.set(account, {}).get(account);
    k[p.position] = (k[p.position] ?? 0) + 1;
  }
  return new Map([...c].map(([a, k]) => [a, Number(Object.entries(k).sort((x, y) => y[1] - x[1] || x[0] - y[0])[0][0])]));
}

// Each rostered player's card numbers from the league's games: games, wins, average K/D/A, GPM,
// XPM, hero damage and last hits (cores), wards, dewards, stacks and healing (supports), games per
// position, latest medal, and their three most-played heroes.
export function cardStats(matches) {
  const by = new Map();
  for (const m of [...matches].sort((x, y) => (x.start_time ?? 0) - (y.start_time ?? 0))) for (const p of m.players ?? []) {
    const account = p.account_id ?? playerKey(p);
    const s = by.get(account) ?? by.set(account, { games: 0, wins: 0, k: 0, d: 0, a: 0, gpm: 0, xpm: 0, dmg: 0, lh: 0, obs: 0, sen: 0, dew: 0, stack: 0, heal: 0, pos: [0, 0, 0, 0, 0], rank: null, heroes: new Map() }).get(account);
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

export function createPlayerCards(matches, { cards = new Map(), teams = [], tiers = new Map(), locked = true } = {}) {
  const mainPos = mainPositions(matches), stats = cardStats(matches);
  const teamIdOf = new Map(teams.flatMap((t) => t.players.map((p) => [p.account_id, t.id])));
  const roleOf = (a, ov = cards.get(a)) => ov?.pos ?? mainPos.get(a);
  const card = (p, slot, { own = false, ov = cards.get(p.account), tier = null, nameHtml = null, equipmentOverride = null } = {}) => {
    const equipment=equipmentOverride??playerEquipment(p.account,ov?.cosmetics);
    if(equipment?.baseCard)ov={...ov,...equipment.baseCard};
    const st = stats.get(p.account), t = tier ?? tiers.get(String(p.account)), top = st?.top ?? [], g = st?.games ?? 0;
    const face = heroById(ov?.hero)?.name ?? top[0]?.hero, faceRec = face && st?.heroes.get(face);
    const ha = face && cardArtwork(face, ov), art = ha?.src ?? (face && heroVert(face)), wide = face && heroImg(face);
    const cropStyle = ha?.crop ? `--art-x:${ha.crop.x}%;--art-y:${ha.crop.y}%;--art-zoom:${ha.crop.zoom};` : "";
    const appearance=cosmeticAttributes(equipment).replace('style="',`style="${cropStyle}${equipment?.layout?.nameSize && equipment.layout.nameSize !== 100 ? `--name-size:${equipment.layout.nameSize / 100};` : ""}`);
    const avg = (v) => (g ? v / g : 0), one = (v) => (g ? avg(v).toFixed(1) : "—");
    const role = roleOf(p.account, ov), set = ov?.pos != null;
    const record = p.record ?? st;
    const recordHtml = record?.games ? `${record.wins}–${record.games - record.wins} <small>W–L</small>` : "No games yet";
    const kda = g ? `${one(st.k)}/${one(st.d)}/${one(st.a)}` : "—";
    const posMax = Math.max(1, ...(st?.pos ?? [0]));
    const teamMark = teamLogoHtml({ id: teamIdOf.get(p.account), name: p.team }, "ft-team-logo");
    const tierChip = `<span class="ft-tier">${t ? `${t.tier}<small>${t.rating}</small>` : "—"}</span>`;
    // The owner's layout (lib/card-layout.js): their own name, which front parts show and where,
    // and the back's stats. Every stat is rendered; the layout picks which show, in what order.
    // A card name of its own first, then the nickname the player shows (lib/cosmetics-engine.js).
    const nick = playerNickname(p.account) ?? ov?.cosmetics?.nickname ?? null;
    const layout = equipment?.layout ?? null, cardName = layout?.name ?? nick ?? p.name;
    const nameShown = layout?.name != null ? esc(layout.name) : nick != null ? esc(nick) : nameHtml ?? esc(p.name);
    const part = (key, cls, html, tag = "span", extra = "") => {
      const s = partState(layout, key);
      return `<${tag} class="${cls}${s.placed ? " ft-placed" : ""}" data-part="${key}"${s.show ? "" : " hidden"}${s.style ? ` style="${s.style}"` : ""}${extra}>${html}</${tag}>`;
    };
    const hero = (h) => `<span class="ft-hrow"><span class="ft-h">${heroImg(h.hero) ? `<img src="${esc(heroImg(h.hero))}" alt="" loading="lazy">` : ""}<b>${h.games}</b>${plusSlot(p.account, h.hero)}</span><span class="ft-hname">${esc(h.hero)}</span><span class="ft-hrec">${h.games}g · ${Math.round((100 * h.wins) / h.games)}%</span></span>`;
    // By default farm and damage for cores, vision, stacks and healing for supports.
    const statValue = {
      games: g, win: g ? Math.round((100 * st.wins) / g) + "%" : "—", kda,
      gpm: g ? Math.round(avg(st.gpm)) : "—", xpm: g ? Math.round(avg(st.xpm)) : "—", dmg: g ? kShort(avg(st.dmg)) : "—",
      lh: g ? Math.round(avg(st.lh)) : "—", wards: g ? `${one(st.obs)}/${one(st.sen)}` : "—", dewards: one(st?.dew),
      stacks: one(st?.stack), heal: g ? kShort(avg(st.heal)) : "—",
    };
    const shown = backStats(layout, role);
    const statsHtml = BACK_STATS.map(([key, label, wide]) => {
      const i = shown.indexOf(key);
      return `<span data-stat="${key}"${wide ? ' class="wide"' : ""}${i < 0 ? " hidden" : ` style="order:${i}"`}><b>${statValue[key]}</b>${label === "Hero damage" ? "Hero dmg" : label === "Win %" ? "Win" : label}</span>`;
    }).join("");
    const pill = role ? part("pos", `ft-pos${role === slot ? " here" : ""}${set ? " set" : ""}`, `Pos ${role}`, "span", set ? ` title="Role set by ${own ? "you" : esc(p.name)}"` : "") : "";
    // Pick buttons, front and back (the back's stays out of the tab order until it's turned up).
    // Signed out, they offer the Steam sign-in instead.
    const pickBtn = (cls, hidden) => `<button type="button" class="ft-pickbtn ${cls}"${hidden ? ' tabindex="-1"' : ""} ${locked ? 'data-act="signin">Sign in to pick' : `data-act="pick" aria-pressed="false">Pick for pos ${slot}`}</button>`;
    // The plate's parts; placed ones sit on the face itself, after the plate.
    const plateParts = [
      ["name", part("name", "ft-name", nameShown, "span", ` title="${esc(cardName)}"`)],
      ["record", part("record", "ft-record", recordHtml, "span", ' aria-label="Win-loss record"')],
      ["team", part("team", "ft-tm", `${teamMark}<span class="ft-team-name">${esc(p.team)}</span>`)],
      ["hero", face ? part("hero", "ft-sig", `${esc(face)}${faceRec ? ` · ${faceRec.games} game${faceRec.games === 1 ? "" : "s"}` : ""}`) : ""],
    ];
    const onPlate = plateParts.filter(([k]) => !partState(layout, k).placed).map(([, h]) => h).join("");
    const offPlate = plateParts.filter(([k]) => partState(layout, k).placed).map(([, h]) => h).join("");
    return `<div class="ft-card${t ? ` t-${t.tier}` : ""}${ha ? ` ${ha.cls}` : ""}${own ? " own" : ""}${ha?.crop ? " ft-custom-crop" : ""}${layout?.back?.positions === false ? " ft-no-posbars" : ""}${layout?.back?.heroes === false ? " ft-no-heroes" : ""}${partState(layout, "plus").show ? " ft-plus-on" : ""}"${appearance} data-role="${role ?? 0}"${layout?.name != null ? ' data-renamed="1"' : ""}${ha ? ` data-style="${ha.style}"` : ""} data-pick="${p.account}" data-player-name="${esc(p.name)}" data-auto-hero="${HERO_META.find(([,name])=>name===top[0]?.hero)?.[0]??0}" data-card-hero="${ov?.hero??0}" data-card-art="${esc(ov?.art??'')}" data-card-style="${esc(ov?.style??'')}" data-card-pos="${ov?.pos??0}" data-card-crop="${esc(JSON.stringify(ov?.crop??null))}">
      <div class="ft-tilt"><div class="ft-flip">
        <div class="ft-face ft-front" role="group" aria-label="${esc(p.name)}, ${esc(p.team)}${t ? `, tier ${t.tier}` : ""}${face ? `, ${esc(face)}` : ""}">
          <span class="ft-art" style="--grit:${gritAt(p.account)}">${art ? `<img src="${esc(art)}" alt="" loading="lazy" data-wide="${esc(wide)}">` : ""}</span>
          ${part("tier", "ft-tier", t ? `${t.tier}<small>${t.rating}</small>` : "—")}
          ${pill}
          ${face ? part("plus", "ft-plus", plusSlot(p.account, face)) : ""}
          <span class="ft-plate">
            ${onPlate}
            ${own ? "" : pickBtn("ft-fpick")}
          </span>
          ${offPlate}
          <span class="ft-shine"></span>
          ${cosmeticLayers(equipment,cardName)}
        </div>
        <div class="ft-face ft-back" aria-hidden="true">
          <span class="ft-bhead">${tierChip}<span class="ft-bname"><span class="ft-name" title="${esc(cardName)}">${nameShown}</span><span class="ft-tm">${teamMark}<span class="ft-team-name">${esc(p.team)}</span></span>${st?.rank ? `<span class="ft-medal">${esc(medal(st.rank))}${role ? ` · ${role >= 4 ? "Support" : "Core"}` : ""}</span>` : ""}</span></span>
          <span class="ft-stats">${statsHtml}</span>
          <span class="ft-label">Positions played</span>
          <span class="ft-posbars">${[1, 2, 3, 4, 5].map((n) => { const c = st?.pos[n - 1] ?? 0; return `<span class="${n === slot ? "here" : ""}" title="Pos ${n}: ${c} game${c === 1 ? "" : "s"}"><i style="height:${Math.round((100 * c) / posMax)}%"></i><b>${n}</b></span>`; }).join("")}</span>
          <span class="ft-label">Top heroes</span>
          <span class="ft-heroes">${top.length ? top.map(hero).join("") : `<span class="ft-note">No league games yet</span>`}</span>
          ${own ? "" : pickBtn("ft-bpick", true)}
        </div>
      </div>
      <button type="button" class="ft-expand" aria-label="Show ${esc(p.name)}'s card full size"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h6v2H7.4l3.3 3.3-1.4 1.4L6 7.4V10H4zm16 0v6h-2V7.4l-3.3 3.3-1.4-1.4L16.6 6H14V4zM4 20v-6h2v2.6l3.3-3.3 1.4 1.4L7.4 18H10v2zm16 0h-6v-2h2.6l-3.3-3.3 1.4-1.4 3.3 3.3V14h2z"/></svg></button>
      <button type="button" class="ft-turn" aria-label="Flip ${esc(p.name)}'s card for stats" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 0 1 13.7-5.6L20 4v6h-6l2.3-2.3A6 6 0 0 0 6 12zm16 0a8 8 0 0 1-13.7 5.6L4 20v-6h6l-2.3 2.3A6 6 0 0 0 18 12z"/></svg></button>
    </div></div>`;
  };

  return { card, stats, mainPos, roleOf };
}

export function flipPlayerCard(c, on) {
  c.classList.toggle("flipped", on);
  c.querySelector(".ft-turn").setAttribute("aria-expanded", String(on));
  c.querySelector(".ft-front").setAttribute("aria-hidden", String(on));
  c.querySelector(".ft-back").setAttribute("aria-hidden", String(!on));
  const fp = c.querySelector(".ft-fpick"), bp = c.querySelector(".ft-bpick");
  if (fp) fp.tabIndex = on ? -1 : 0;
  if (bp) bp.tabIndex = on ? 0 : -1;
}
// A card full size: a copy in a dialog that fills the screen, still flips, Esc or × to close.
export function showBigCard(c) {
  const dlg = document.createElement("dialog");
  dlg.className = "ft-big";
  dlg.setAttribute("aria-label", `${c.dataset.playerName ?? "Player"}'s card`);
  const copy = c.cloneNode(true);
  copy.classList.remove("picked", "pickup");
  copy.removeAttribute("data-taken");
  copy.querySelectorAll(".ft-pickbtn, .ft-expand").forEach((b) => b.remove());
  dlg.innerHTML = `<button type="button" class="ft-big-close" aria-label="Close">×</button>`;
  dlg.append(copy);
  document.body.append(dlg);
  wirePlayerCards(dlg);
  dlg.querySelector(".ft-big-close").onclick = () => dlg.close();
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener("close", () => { if (!dlg.open) dlg.remove(); });
  dlg.showModal();
  copy.querySelector(".ft-turn")?.focus();
}
const wired = new WeakSet();
export function wirePlayerCards(host) {
  if (wired.has(host)) return;
  wired.add(host);
  host.addEventListener("click", (ev) => {
    const c = ev.target.closest(".ft-card");
    if (c && ev.target.closest(".ft-expand")) { showBigCard(c); return; }
    if (!c || ev.target.closest("a, .ft-pickbtn, .card-autograph") || c.closest('[data-card-editor]')) return;
    flipPlayerCard(c, !c.classList.contains("flipped"));
  });
  host.addEventListener("error", (ev) => {
    const img = ev.target;
    if (img.dataset?.wide && img.src !== img.dataset.wide) img.src = img.dataset.wide;
  }, true);
}
