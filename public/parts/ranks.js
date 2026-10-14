// Ranks: stat leaders and hero ranks in the page's league and overall (every division).
import { playerLeaderboard, heroStats } from "../lib/stats.js";
import { MIN_GAMES, heroRatings, TIERS } from "../lib/tiers.js";
import { isPlayed, pubsSince, pubSummary } from "../lib/predict.js";
import { info } from "../lib/glossary.js";
import { withPerGame, RANK_STATS, RANK_GROUPS, placeOf, rankStat, ordinal, formatStat } from "../lib/ranks.js";
import { pubPrep } from "../lib/combat.js";
import { teamLeaderboard } from "../lib/teams.js";
import { statRowsCache, heroRankCache, heroRowsCache, allLeagues, floorOf, PLAYER_RANKS, esc, leagueShort, inLeague, overallBadge, LEAGUE_COUNT, heroVal, portrait, heroLink, playerLink, teamLink, HERO_PLAYERS_SHOWN, pubStart, PUB_DAYS, pubStartLabel, heroHref, pct, PREP_DAYS } from "../core.js";
import { plusSlot, plusTier, levelFrom } from "../lib/hero-levels.js";
import { heroById } from "../lib/hero-meta.js";

export const statRows = (matches) => statRowsCache.get(matches) ?? statRowsCache.set(matches, playerLeaderboard(matches).map(withPerGame)).get(matches);
export const heroRanks = (matches, model = null, minGames = MIN_GAMES) => heroRankCache.get(matches) ?? heroRankCache.set(matches, heroRatings(matches, { model, minGames })).get(matches);
export const heroKey = (hero) => `hero:${hero}`;
export function heroRows(matches) {
  if (heroRowsCache.has(matches)) return heroRowsCache.get(matches);
  const asHero = matches.map((m) => ({ ...m, players: m.players.map((p) => ({ ...p, player_key: heroKey(p.hero), name: p.hero, team_name: null })) }));
  const draft = new Map(heroStats(matches).map((r) => [r.hero, r]));
  const rows = playerLeaderboard(asHero).map(withPerGame).map((r) => {
    const d = draft.get(r.name);
    return { ...r, hero: r.name, pick_rate: d?.pick_rate ?? null, contest_rate: d?.contest_rate ?? null, ban_rate: d?.ban_rate ?? null };
  });
  heroRowsCache.set(matches, rows);
  return rows;
}
// Every league's player lines (tagged with the league), and every league's players on a hero,
// best rating first. Null for scrims or if a division can't load.
export async function overallStats(src) {
  if (!src.ad2l || src.all) return null;
  try { return (await allLeagues(src)).flatMap(({ key, matches }) => statRows(matches).map((r) => ({ ...r, league: key }))); }
  catch (e) { console.warn("overall ranks unavailable", e); return null; }
}
export async function overallHeroes(src) {
  if (!src.ad2l || src.all) return null;
  try {
    const leagues = await allLeagues(src);
    return (hero) => leagues.flatMap(({ key, matches }) => (heroRanks(matches, null, floorOf(src)).get(hero) ?? []).map((p) => ({ ...p, league: key })))
      .sort((a, b) => b.rating_exact - a.rating_exact);
  } catch (e) { console.warn("overall ranks unavailable", e); return null; }
}
export async function overallHeroRows(src) {
  if (!src.ad2l || src.all) return null;
  try { return (await allLeagues(src)).flatMap(({ key, matches }) => heroRows(matches).map((r) => ({ ...r, league: key }))); }
  catch (e) { console.warn("overall ranks unavailable", e); return null; }
}
// Teams ranked on the same terms (team page overview): every team's line, in this league and
// across every league.
const teamRowsCache = new WeakMap();
export const teamRows = (matches) => teamRowsCache.get(matches) ?? teamRowsCache.set(matches, teamLeaderboard(matches)).get(matches);
export async function overallTeamRows(src) {
  if (!src.ad2l || src.all) return null;
  try { return (await allLeagues(src)).flatMap(({ key, matches }) => teamRows(matches).map((r) => ({ ...r, league: key }))); }
  catch (e) { console.warn("overall ranks unavailable", e); return null; }
}
export const TEAM_RANKS = {
  stats: [
    { key: "win_rate", label: "Win % (with stats)", group: "results", fmt: "pct" },
    { key: "kill_diff", label: "Kill margin a game", group: "results", fmt: "+1" },
    { key: "kills_pg", label: "Kills a game", group: "results", fmt: "1" },
    { key: "deaths_pg", label: "Deaths a game", group: "results", fmt: "1", low: true },
    { key: "kda", label: "Team KDA", group: "results", fmt: "2" },
    { key: "team_gpm", label: "Team GPM", group: "economy", fmt: "0" },
    { key: "team_xpm", label: "Team XPM", group: "economy", fmt: "0" },
    { key: "lead10", label: "Gold lead at 10 min", group: "economy", fmt: "+0" },
    { key: "dmg_per_min", label: "Hero damage / min", group: "damage", fmt: "0" },
    { key: "fb_rate", label: "First blood rate", group: "combat", fmt: "pct" },
    { key: "obs_pg", label: "Observers a game", group: "support", fmt: "1" },
    { key: "sen_pg", label: "Sentries a game", group: "support", fmt: "1" },
    { key: "dewards_pg", label: "Dewards a game", group: "support", fmt: "1" },
    { key: "stacks_pg", label: "Stacks a game", group: "support", fmt: "1" },
    { key: "healing_pg", label: "Healing a game", group: "support", fmt: "0" },
    { key: "stuns_pg", label: "Stun seconds a game", group: "support", fmt: "1" },
    { key: "building_pg", label: "Building damage a game", group: "objectives", fmt: "0" },
    { key: "roshans_pg", label: "Roshans a game", group: "objectives", fmt: "2" },
    { key: "tormentors_pg", label: "Tormentors a game", group: "objectives", fmt: "2" },
  ],
  groups: RANK_GROUPS,
  id: "team-ranks", title: "Team ranks", tip: "team_ranks", unit: "games with stats",
};
export const HERO_RANKS = {
  stats: [
    { key: "pick_rate", label: "Pick rate", group: "draft", fmt: "pct" },
    { key: "contest_rate", label: "Contest rate", group: "draft", fmt: "pct" },
    { key: "ban_rate", label: "Ban rate", group: "draft", fmt: "pct" },
    ...RANK_STATS,
  ],
  groups: [["draft", "Draft"], ...RANK_GROUPS],
  id: "hero-ranks", title: "Hero ranks", tip: "hero_ranks", unit: "picks",
};
export function statRanksHtml(src, key, rows, overall, opt = PLAYER_RANKS) {
  const me = rows.find((r) => r.key === key);
  if (!me) return "";
  const ranked = me.games >= floorOf(src);
  const league = esc(leagueShort(src));
  const places = opt.stats.filter((s) => me[s.key] != null).map((stat) => {
    const val = (r) => r[stat.key];
    return {
      stat,
      pl: ranked ? placeOf(rankStat(rows, stat, floorOf(src)), (x) => x.key === key, val) : null,
      opl: ranked && overall ? placeOf(rankStat(overall, stat, floorOf(src)), inLeague(src, key), val) : null,
    };
  });
  // Tile: value, league place, overall place, and a meter for how far up the league they sit
  // (full = 1st, empty = last). Colour by league place: gold / silver / bronze for a top 3,
  // green for the top 10, a softer green for the top 25, ember for a bottom 3.
  const band = (q) => (!q ? "" : q.end === "top" ? ` sr-top sr-p${q.rank}` : q.end === "bottom" ? " sr-bottom" : q.rank <= 10 ? " sr-t10" : q.rank <= 25 ? " sr-t25" : "");
  const ovCls = (q) => (!q ? "" : q.end === "top" ? ` sr-p${q.rank}` : q.rank <= 10 ? " sr-t10" : q.rank <= 25 ? " sr-t25" : "");
  const tile = ({ stat, pl, opl }, i) => {
    const m = pl ? (pl.of > 1 ? (pl.of - pl.rank) / (pl.of - 1) : 1) : 0;
    const ov = !src.ad2l ? "" : !ranked ? "" : overall
      ? `<div class="sr-ov"><span class="sr-ov-place${ovCls(opl)}"><small>All leagues</small> ${opl ? `<b>${opl.tied > 1 ? "=" : ""}${ordinal(opl.rank)}</b><small>/${opl.of}</small>` : "—"}</span>${overallBadge(opl)}</div>`
      : `<div class="sr-ov"><small>All leagues: loading…</small></div>`;
    return `<div class="sr-tile${band(pl)}${opl?.end ? " ov" : ""}" style="--i:${i}; --m:${m.toFixed(3)}">
      <div class="sr-label">${esc(stat.label)}${stat.low ? " <small>fewer is better</small>" : ""}</div>
      <div class="sr-val">${formatStat(stat, me[stat.key])}</div>
      ${pl ? `<div class="sr-place"><b>${pl.tied > 1 ? "=" : ""}${ordinal(pl.rank)}</b><small>/${pl.of} in ${league}</small></div>` : `<div class="sr-place"><small>not ranked</small></div>`}
      ${ov}
      <div class="ld-meter"><i></i></div>
    </div>`;
  };
  const tops = places.filter((x) => x.pl?.end === "top").length, bottoms = places.filter((x) => x.pl?.end === "bottom").length;
  const ovTops = places.filter((x) => x.opl?.end === "top").length;
  const bands = opt.groups.map(([g, label]) => {
    const xs = places.filter((x) => x.stat.group === g);
    return xs.length ? `<div class="ld-band sr-band sr-g-${g}"><div class="ld-tag"><span>${label}</span></div>
      <div class="sr-tiles reveal">${xs.map(tile).join("")}</div></div>` : "";
  }).join("");
  return `<h2 id="${opt.id}">${opt.title}${info(opt.tip)}</h2>
    ${ranked ? `<div class="sr-summary">
      <div><b class="sr-sum-top">${tops}</b><small>top 3 in ${league}</small></div>
      <div><b class="sr-sum-bottom">${bottoms}</b><small>bottom 3 in ${league}</small></div>
      ${src.ad2l ? `<div><b class="sr-sum-ov">${overall ? ovTops : "…"}</b><small>top 3 across all ${LEAGUE_COUNT} leagues</small></div>` : ""}
    </div>` : `<p class="table-note keep wm-intro">Ranks need ${floorOf(src)}+ ${opt.unit}; ${esc(me.name)} has ${me.games}. The numbers so far:</p>`}
    <div class="ld-lists">${bands}</div>`;
}

// Player page: every hero they played, with their hero rating and place on it.
export function heroRanksHtml(src, key, h, ratings, overallOn) {
  const league = esc(leagueShort(src));
  // Only the top end counts here, and only when more than 3 played it ("2nd of 2" is no feat).
  const topOnly = (q) => q && { ...q, end: q.end === "top" && q.of > 3 ? "top" : null };
  const card = (x, i) => {
    const list = ratings.get(x.hero) ?? [];
    const pl = topOnly(placeOf(list, (p) => p.key === key, heroVal)), me = list.find((p) => p.key === key);
    const opl = overallOn ? topOnly(placeOf(overallOn(x.hero), inLeague(src, key), heroVal)) : null;
    const tier = me ? TIERS.find((t) => me.rating_exact >= t.min).tier : null;
    const place = (q, where) => (q ? `<div class="hp-place${q.end ? ` hp-p${q.rank}` : ""}"><b>${q.tied > 1 ? "=" : ""}${ordinal(q.rank)}</b><small>/${q.of} ${where}</small></div>` : "");
    return `<div class="hp-card${tier ? ` t-${tier}` : ""}${opl?.end ? " ov" : ""}" style="--i:${i}; --m:${me ? (me.rating_exact / 100).toFixed(3) : 0}">
      <div class="hp-banner">${portrait(x.hero, "hp-img")}${plusSlot(key, x.hero)}${tier ? `<span class="hp-tier">${tier}</span>` : ""}</div>
      <div class="hp-body">
        <div class="hp-name">${heroLink(src, x.hero)}</div>
        <div class="hp-rec"><span class="res ${x.wins * 2 >= x.games ? "w" : "l"}">${x.wins}–${x.games - x.wins}</span> · ${x.games} game${x.games === 1 ? "" : "s"} · KDA ${x.kda.toFixed(2)}</div>
        <div class="hp-rating"><b>${me ? me.rating : "—"}</b><small>hero<br>rating</small></div>
        <div class="hp-places">${place(pl, `in ${league}`)}${src.ad2l ? overallOn ? place(opl, "all leagues") : `<div class="hp-place"><small>All leagues: loading…</small></div>` : ""}</div>
        ${overallBadge(opl)}
      </div>
      <div class="ld-meter"><i></i></div>
    </div>`;
  };
  return `<h2 id="hero-pool">Hero pool${info("hero_rating")}</h2>
    <p class="table-note wm-intro">Hero rating: the tier rating from their games on that hero only. Place: among everyone in ${league} who played it${src.ad2l ? `, and across all ${LEAGUE_COUNT} leagues` : ""}. One or two games is a small sample.</p>
    <div class="hp-grid reveal">${h.heroes.map(card).join("")}</div>`;
}
// Player page, Heroes tab: every hero with a Dota Plus level (STRATZ lists them from level 11),
// highest first. `data` is the loaded hero-levels.json.
export function plusHeroesHtml(src, data, accountId) {
  const mine = data?.accounts?.[accountId];
  const list = Object.entries(mine ?? {}).map(([id, l]) => ({ hero: heroById(Number(id))?.name, level: levelFrom(l) }))
    .filter((x) => x.hero && x.level).sort((a, b) => b.level - a.level || a.hero.localeCompare(b.hero));
  if (!list.length) return "";
  return `<h2 id="plus-levels">Dota Plus hero levels${info("plus_level")}</h2>
    <div class="hero-chips plus-chips">${list.map((x) => `<div class="hero-chip">${portrait(x.hero)}${plusSlot(accountId, x.hero)}<span>${heroLink(src, x.hero)}</span><b>${plusTier(x.level)[2]}</b></div>`).join("")}</div>`;
}

export function heroPlayersHtml(src, hero, list, lines, overallList) {
  if (!list.length) return "";
  const league = esc(leagueShort(src));
  const topOnly = (q) => q && { ...q, end: q.end === "top" && q.of > 3 ? "top" : null };
  const card = (p, i) => {
    const line = lines.get(p.key);
    const pl = topOnly(placeOf(list, (x) => x.key === p.key, heroVal));
    const opl = overallList ? topOnly(placeOf(overallList, inLeague(src, p.key), heroVal)) : null;
    const tier = TIERS.find((t) => p.rating_exact >= t.min).tier;
    const place = (q, where) => (q ? `<div class="hp-place${q.end ? ` hp-p${q.rank}` : ""}"><b>${q.tied > 1 ? "=" : ""}${ordinal(q.rank)}</b><small>/${q.of} ${where}</small></div>` : "");
    return `<div class="hp-card hp-player t-${tier}${opl?.end ? " ov" : ""}" style="--i:${i}; --m:${(p.rating_exact / 100).toFixed(3)}">
      <span class="hp-tier">${tier}</span>
      <div class="hp-body">
        <div class="hp-name">${playerLink(src, p)}${plusSlot(p.key, hero)}</div>
        <div class="hp-rec"><span class="res ${p.wins * 2 >= p.games ? "w" : "l"}">${p.wins}–${p.games - p.wins}</span> · ${p.games} game${p.games === 1 ? "" : "s"}${line ? ` · KDA ${line.kda.toFixed(2)}` : ""}${p.team ? ` · ${teamLink(src, p.team)}` : ""}</div>
        <div class="hp-rating"><b>${p.rating}</b><small>hero<br>rating</small></div>
        <div class="hp-places">${place(pl, `in ${league}`)}${src.ad2l ? overallList ? place(opl, "all leagues") : `<div class="hp-place"><small>All leagues: loading…</small></div>` : ""}</div>
        ${overallBadge(opl)}
      </div>
      <div class="ld-meter"><i></i></div>
    </div>`;
  };
  const more = list.length - HERO_PLAYERS_SHOWN;
  return `<h2 id="hero-players">Players on it${info("hero_rating")}</h2>
    <p class="table-note wm-intro">Hero rating: the tier rating from their games on ${esc(hero)} only. Place: among the ${list.length} player${list.length === 1 ? "" : "s"} in ${league} who played it${src.ad2l ? `, and across all ${LEAGUE_COUNT} leagues` : ""}. One or two games is a small sample.</p>
    <div class="hp-grid reveal">${list.slice(0, HERO_PLAYERS_SHOWN).map(card).join("")}</div>
    ${more > 0 ? `<p class="table-note keep">${more} more in the Players table below.</p>` : ""}`;
}

// The last league night (Thursday), per the league's rhythm: predictions count pubs since
// then. Each division has its own league night: `d` is that division's data.
export const lastNight = (d) => Math.max(0, ...(d?.series ?? []).filter(isPlayed).map((s) => s.time ?? 0));
export const sinceLabel = (d) => new Date(lastNight(d) * 1000).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

// `d` is the division file, or a scout report (parts/scouted.js) for a player on no roster.
export function pubSection(src, accountId, d = src.cache()) {
  if (!d?.pubs || !accountId) return "";
  const games = pubsSince(d, accountId, pubStart(d));
  const ps = pubSummary(games);
  if (!ps) return `<h2>Recent pubs</h2><p class="table-note keep wm-intro">No public or ranked games in the ${PUB_DAYS} days before the last sync (since ${pubStartLabel(d)}), or their match history is private.</p>`;
  const ranked = games.filter((g) => g.ranked).length;
  const good = (wr) => (wr >= 0.5 ? "w" : "l");
  // Form: every game oldest -> newest, the hero with a win/loss bar under it.
  const form = [...games].reverse().map((g, i) => `<a class="pf pf-${g.won ? "w" : "l"}" href="${heroHref(src, g.hero)}" style="--i:${i}"
      title="${esc(g.hero)} · ${g.won ? "Won" : "Lost"} · ${g.kills}/${g.deaths}/${g.assists} · ${new Date(g.time * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" })}${g.ranked ? " · ranked" : ""}">${portrait(g.hero)}${plusSlot(accountId, g.hero, g.time)}${g.ranked ? '<span class="pf-r">R</span>' : ""}</a>`).join("");
  const heroCard = (x, i) => {
    const wr = x.wins / x.games;
    return `<div class="ph-card ph-${good(wr)}" style="--i:${i}; --m:${wr.toFixed(3)}">
      <div class="ph-banner">${portrait(x.hero, "ph-img")}${plusSlot(accountId, x.hero)}</div>
      <div class="ph-body">
        <div class="ph-name">${heroLink(src, x.hero)}</div>
        <div class="ph-wl">${x.wins}–${x.games - x.wins}</div>
        <div class="ph-sub">${pct(wr)} · ${x.games} game${x.games === 1 ? "" : "s"}</div>
      </div>
      <div class="ld-meter"><i></i></div>
    </div>`;
  };
  return `<h2>Recent pubs${info("recent_pubs")}</h2>
    <p class="table-note wm-intro">Public and ranked games in the ${PUB_DAYS} days before the last sync (since ${pubStartLabel(d)}), including smurf accounts on their PlayOn roster.</p>
    <div class="sr-summary pub-summary">
      <div><b class="res-${good(ps.win_rate)}">${ps.wins}–${ps.games - ps.wins}</b><small>record${info("pub_record")}</small></div>
      <div><b class="res-${good(ps.win_rate)}">${pct(ps.win_rate)}</b><small>win rate</small></div>
      <div><b>${ps.kda.toFixed(2)}</b><small>KDA${info("pub_kda")}</small></div>
      <div><b>${ps.games}</b><small>games · ${ranked} ranked</small></div>
    </div>
    <div class="pub-form">
      <div class="pub-form-label"><span>Form</span><small>oldest → newest · R = ranked</small></div>
      <div class="pub-form-row reveal">${form}</div>
    </div>
    <div class="ph-grid reveal">${ps.heroes.slice(0, 12).map(heroCard).join("")}</div>`;
}
// All-time hero totals for one player (the division's draft file, decodeTotals): every public and
// ranked game on record, and every practice-lobby game (league, scrims and inhouses together).
export function allTimeSection(src, list, accountId = null) {
  const block = (title, tip, rows, empty) => {
    const games = rows.reduce((n, x) => n + x.games, 0), wins = rows.reduce((n, x) => n + x.wins, 0);
    if (!games) return `<h3 class="hpool-sub">${title}</h3><p class="table-note keep wm-intro">${empty}</p>`;
    const good = (wr) => (wr >= 0.5 ? "w" : "l");
    const card = (x, i) => {
      const wr = x.wins / x.games;
      return `<div class="ph-card ph-${good(wr)}" style="--i:${i}; --m:${wr.toFixed(3)}"><div class="ph-banner">${portrait(x.hero, "ph-img")}${plusSlot(accountId, x.hero)}</div>
        <div class="ph-body"><div class="ph-name">${heroLink(src, x.hero)}</div><div class="ph-wl">${x.wins}–${x.games - x.wins}</div>
        <div class="ph-sub">${pct(wr)} · ${x.games.toLocaleString()} game${x.games === 1 ? "" : "s"}</div></div><div class="ld-meter"><i></i></div></div>`;
    };
    return `<h3 class="hpool-sub">${title}</h3><p class="table-note wm-intro">${tip}</p>
      <div class="sr-summary pub-summary"><div><b class="res-${good(wins / games)}">${wins.toLocaleString()}–${(games - wins).toLocaleString()}</b><small>record</small></div>
        <div><b class="res-${good(wins / games)}">${pct(wins / games)}</b><small>win rate</small></div>
        <div><b>${games.toLocaleString()}</b><small>games · ${rows.length} heroes</small></div></div>
      <div class="ph-grid reveal">${rows.slice(0, 12).map(card).join("")}</div>`;
  };
  return `<h2>All time</h2>
    ${block("Pubs", "Every public and ranked game on record for this account, most-played heroes first.", list.pubs, "No public or ranked totals synced for this account yet, or their match history is private.")}
    ${block("Esports", "Every practice-lobby game on record: league games plus scrims and inhouses. OpenDota can't tell them apart.", list.lobby, "No practice-lobby totals synced for this account yet.")}`;
}
export function pubPrepHtml(src, accountId, games) {
  const d = src.cache();
  if (!d?.pubs?.[accountId]) return "";
  const r = pubPrep(d.pubs[accountId], games, pubStart(d), PREP_DAYS);
  if (!r.games) return "";
  const line = (x) => (x.games ? `<b class="res-${x.wins * 2 >= x.games ? "w" : "l"}">${x.wins}–${x.games - x.wins}</b>` : "<b>—</b>");
  return `<h2>Pub practice${info("pub_prep")}</h2>
    <p class="table-note wm-intro">Their ${r.games} league game${r.games === 1 ? "" : "s"} since ${new Date((pubStart(d) + PREP_DAYS * 86400) * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" })} (pub history covers ${PUB_DAYS} days), split by whether they'd played that hero in pubs in the ${PREP_DAYS} days before.</p>
    <div class="sr-summary pub-summary">
      <div>${line(r.practiced)}<small>practised in pubs first</small></div>
      <div>${line(r.fresh)}<small>not played in pubs that week</small></div>
      ${r.heroes.length ? `<div><b>${r.heroes.slice(0, 4).map((h) => portrait(h.hero)).join("")}</b><small>${r.heroes.slice(0, 4).map((h) => `${esc(h.hero)} (${h.pubs} pub${h.pubs === 1 ? "" : "s"}, ${h.wins}–${h.games - h.wins})`).join(" · ")}</small></div>` : ""}
    </div>`;
}

// Hero page: the division's rostered players on this hero in their recent pubs (same window as
// the player page).
export function heroPubSection(src, hero, known) {
  const d = src.cache();
  if (!d?.pubs) return "";
  const roster = d.teams.flatMap((t) => t.players.filter((p) => p.account_id).map((p) => ({ ...p, team: t.name })));
  const who = roster.map((p) => ({ p, games: pubsSince(d, p.account_id, pubStart(d)).filter((g) => g.hero === hero) })).filter((x) => x.games.length);
  if (!who.length) return `<h2>Recent pubs</h2><p class="table-note keep wm-intro">Nobody in ${esc(leagueShort(src))} played ${esc(hero)} in public or ranked games in the ${PUB_DAYS} days before the last sync (since ${pubStartLabel(d)}), among players whose match history is public.</p>`;
  const ps = pubSummary(who.flatMap((x) => x.games));
  const good = (wr) => (wr >= 0.5 ? "w" : "l");
  const rows = who.map((x) => ({ ...x, s: pubSummary(x.games) })).sort((a, b) => b.s.games - a.s.games || b.s.wins - a.s.wins);
  const card = ({ p, s: x }, i) => `<div class="ph-card ph-plain ph-${good(x.win_rate)}" style="--i:${i}; --m:${x.win_rate.toFixed(3)}">
      <div class="ph-body">
        <div class="ph-name">${known.has(String(p.account_id)) ? playerLink(src, { key: String(p.account_id), name: p.name }) : esc(p.name)}</div>
        <div class="ph-wl">${x.wins}–${x.games - x.wins}</div>
        <div class="ph-sub">${pct(x.win_rate)} · KDA ${x.kda.toFixed(2)}<br>${esc(p.team)}</div>
      </div>
      <div class="ld-meter"><i></i></div>
    </div>`;
  return `<h2>Recent pubs${info("hero_pubs")}</h2>
    <p class="table-note wm-intro">${esc(leagueShort(src))} players on ${esc(hero)} in public and ranked games in the ${PUB_DAYS} days before the last sync (since ${pubStartLabel(d)}). Private match histories are missing.</p>
    <div class="sr-summary pub-summary">
      <div><b class="res-${good(ps.win_rate)}">${ps.wins}–${ps.games - ps.wins}</b><small>record</small></div>
      <div><b class="res-${good(ps.win_rate)}">${pct(ps.win_rate)}</b><small>win rate</small></div>
      <div><b>${ps.kda.toFixed(2)}</b><small>KDA</small></div>
      <div><b>${rows.length}</b><small>player${rows.length === 1 ? "" : "s"} · ${ps.games} games</small></div>
    </div>
    <div class="ph-grid reveal">${rows.slice(0, 12).map(card).join("")}</div>`;
}