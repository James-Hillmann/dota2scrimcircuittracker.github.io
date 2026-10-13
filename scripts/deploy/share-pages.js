// Write a page for every shareable route (see public/lib/share.js) into a built copy of
// public/: /heroic/week/index.html etc. Each is the app (index.html) with that page's own
// title, description, canonical and colour, for search engines and link previews; old
// /ad2l/... addresses forward to their /champion/... page, and the scrims' old /week/, /teams/…
// to /scrims/... . AD2L descriptions are built from the synced data, so they're as fresh as the
// last sync. Scrim games live in Firestore, so scrim pages get fixed descriptions.
// Usage: node scripts/deploy/share-pages.js <site dir>   (the deploy runs it on a copy of public/)
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { routeOf, sharePath } from "../../public/lib/share.js";
import { withNicknames } from "../../public/lib/nicknames.js";
import { SEASON, DIVISIONS, slugOf, fullName } from "../../public/lib/divisions.js";

const OUT = path.resolve(process.argv[2] ?? "_site");
const SITE = "https://dota2scrimcircuittracker.github.io";
const COLOR = { all: "#efe7da", scrim: "#5fd39b", ...Object.fromEntries(DIVISIONS.map((d) => [d.key, d.color])) };
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const TZ = "America/Los_Angeles";
const day = (sec) => new Date(sec * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: TZ });
const plural = (n, w) => `${n} ${n === 1 ? w : w === "hero" ? "heroes" : w === "series" ? w : `${w}s`}`;

const pages = [];
// image: the league's preview card, public/img/og/<image>.png (scripts/gen/gen-og-images.py).
const page = (p, title, description, color, image = "site") => {
  if (sharePath(`#/${p}`) !== (p ? `/${p}/` : "/")) throw new Error(`${p} isn't a shareable route in lib/share.js`);
  pages.push({ p, title, description, color, image, route: routeOf(p) });
};

// ---------- Scrim League ----------
// Under /scrims/ like a division. Teams (/scrims/) holds the table, the matches and the team grid.
const scrim = (tab, title, d) => page(tab ? `scrims/${tab}` : "scrims", `${title} · Scrim League`, d, COLOR.scrim, "scrim");
scrim("", "Teams", "Every scrim team ranked by game wins, with win %, kill difference, form and streak, then every match and team.");
scrim("content", "Weekly recap", "This week's scrims: every game, drafts in pick/ban order, player of the week and the standout games.");
scrim("players", "Players", "Scrim leaderboards and the tier list: KDA, GPM, damage, win rate and more.");
scrim("heroes", "Heroes", "Every hero picked in scrims: pick and ban rates, win rates and who plays them.");
scrim("predict", "Predictions", "Pick the winners of upcoming scrims and see how the model's picks have done.");
scrim("upload", "Upload a scrim", "Paste Dota 2 post-game screenshots and the stats are read for you.");
// The scrim pages used to sit at the top (/week/, /teams/…): those addresses forward, and so
// does /scrims/week/ (Content's old address).
for (const [old, now] of [["week", "scrims/content"], ["scrims/week", "scrims/content"], ["teams", "scrims"], ["players", "scrims/players"], ["heroes", "scrims/heroes"], ["predict", "scrims/predict"], ["upload", "scrims/upload"]])
  pages.push({ ...pages.find((x) => x.p === now), p: old, canonical: now });

// ---------- AD2L ----------
function standings(d) {
  const played = d.series.filter((s) => (s.home_score ?? 0) + (s.away_score ?? 0) > 0);
  return d.teams.map((t) => {
    let gw = 0, gl = 0, w = 0, tie = 0, l = 0;
    for (const s of played) {
      if (s.home !== t.id && s.away !== t.id) continue;
      const [us, them] = s.home === t.id ? [s.home_score, s.away_score] : [s.away_score, s.home_score];
      gw += us; gl += them;
      if (us > them) w++; else if (us < them) l++; else tie++;
    }
    return { t, gw, gl, w, tie, l };
  }).sort((a, b) => b.gw - a.gw || a.gl - b.gl);
}
function inDivision(d, div) {
  const ids = new Set(d.teams.filter((t) => t.division === div).map((t) => t.id));
  return { ...d, teams: d.teams.filter((t) => ids.has(t.id)), series: d.series.filter((s) => ids.has(s.home) && ids.has(s.away)), games: d.games.filter((g) => ids.has(g.team_a_id) && ids.has(g.team_b_id)) };
}

// brief: only the list tabs (All divisions has no Predict, Upload, team or game pages).
function league(root, key, name, d, view, { brief = false } = {}) {
  const label = view ? `${name} · ${view}` : name;
  const color = COLOR[key];
  const top = standings(d).slice(0, 3).map((r, i) => `${i + 1}. ${r.t.name} (${r.gw}–${r.gl})`).join(" · ");
  const games = d.games.length;
  page(root, `Teams · ${label}`, `${top}. Series results from PlayOn, stats from ${plural(games, "ticketed game")}.`, color, key);

  // Latest week: games in the 7 days up to the newest one.
  const newest = Math.max(0, ...d.games.map((g) => g.start_time));
  const recent = d.games.filter((g) => g.start_time > newest - 7 * 86400);
  page(`${root}/content`, `Weekly recap · ${label}`, recent.length
    ? `${plural(recent.length, "game")} through ${day(newest)}: drafts in pick/ban order, player of the week and the standout games.`
    : "Every week's games, drafts and highlights.", color, key);
  // Content's old address forwards, so links shared before the move still open it.
  pages.push({ ...pages.at(-1), p: `${root}/week`, canonical: `${root}/content` });

  const players = new Set(d.games.flatMap((g) => g.players.map((p) => p.player_key)));
  page(`${root}/players`, `Players · ${label}`, `Leaderboards and tier list for ${plural(players.size, "player")}: KDA, GPM, damage, win rate, pubs.`, color, key);

  const picks = new Map();
  for (const g of d.games) for (const p of g.players) picks.set(p.hero, (picks.get(p.hero) ?? 0) + 1);
  const most = [...picks].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([h, n]) => `${h} (${n})`).join(", ");
  page(`${root}/heroes`, `Heroes · ${label}`, `${plural(picks.size, "hero")} played${most ? `. Most picked: ${most}` : ""}. Pick, ban and win rates.`, color, key);

  if (brief) return;
  const upcoming = d.series.filter((s) => !((s.home_score ?? 0) + (s.away_score ?? 0)) && s.time && s.time * 1000 > Date.now() - 6 * 3600e3).length;
  page(`${root}/predict`, `Predictions · ${label}`, `${upcoming ? `${plural(upcoming, "series")} to call. ` : ""}Pick the winners and see how the model's picks have done.`, color, key);
  page(`${root}/drafter`, `Drafter · ${label}`, "Draft Captains Mode for any two teams, with the model scoring every hero at every step.", color, key);
  page(`${root}/upload`, `Upload a game · ${label}`, "Played without a league ticket? Upload the post-game screenshots so the game counts in the stats.", color, key);

  if (view) return;
  const table = standings(d);
  for (const t of d.teams) {
    const r = table.find((x) => x.t.id === t.id);
    const place = table.indexOf(r) + 1;
    const div = t.division ? ` · Division ${t.division}` : "";
    page(`${root}/teams/${t.id}`, `${t.name} · ${name}${div}`,
      `#${place} · series ${r.w}–${r.tie}–${r.l} · games ${r.gw}–${r.gl}. Roster: ${t.players.map((p) => p.name).join(", ")}.`, color, key);
  }
  for (const g of d.games) {
    const won = g.winner === "a" ? g.team_a : g.team_b;
    page(`${root}/game/${g.match_id}`, `${g.team_a} ${g.score_a}–${g.score_b} ${g.team_b}`,
      `${won} won · ${Math.round(g.duration_sec / 60)} min · ${day(g.start_time)} · ${name}. Draft, scoreboard, gold graph and ward map.`, color, key);
  }
}

const load = async (f) => withNicknames(JSON.parse(await readFile(path.join(OUT, "data", f), "utf8")));
const names = DIVISIONS.map((d) => d.name);
page("ad2l", "Pick a league · AD2L Stat Tracker", `Our scrims and AD2L ${SEASON.long}: ${names.slice(0, -1).join(", ")} and ${names.at(-1)}.`, COLOR.ad2l);
// Every division (lib/divisions.js), and each sub-division view (Heroic/Aegis A and B).
const every = [];
for (const dv of DIVISIONS) {
  const d = await load(`${dv.key}.json`);
  every.push(d);
  league(slugOf(dv), dv.key, `AD2L ${fullName(dv)}`, d, null);
  for (const v of dv.views ?? []) league(`${slugOf(dv)}/${v}`, dv.key, `AD2L ${fullName(dv)}`, inDivision(d, v.toUpperCase()), `Division ${v.toUpperCase()}`);
}
// Champion used to live at /ad2l/...: keep those links working by forwarding to /champion/....
for (const pg of pages.filter((x) => x.p.startsWith("champion/")))
  pages.push({ ...pg, p: pg.p.replace(/^champion/, "ad2l"), canonical: pg.p });
// Every division together (/all/): the files merged, as the app does.
league("all", "all", `AD2L ${SEASON.name} All Divisions`, { teams: every.flatMap((d) => d.teams), series: every.flatMap((d) => d.series), games: every.flatMap((d) => d.games) }, null, { brief: true });

// ---------- write ----------
// A page at its own address is the app itself (index.html) with that page's head: search
// engines drop everything after "#", so a forward to /#/... would read as the home page, and
// the app routes from the path anyway (core.js here()). Old /ad2l/... and scrim addresses forward.
const app = await readFile(path.join(OUT, "index.html"), "utf8");
const swap = (html, re, value) => {
  if (!re.test(html)) throw new Error(`index.html has no ${re}: update share-pages.js`);
  return html.replace(re, value);
};
const appPage = ({ title, description, color, image, url }) => [
  [/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`],
  [/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(description)}">`],
  [/<meta name="theme-color" content="[^"]*">/, `<meta name="theme-color" content="${color}">`],
  [/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(title)}">`],
  [/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(description)}">`],
  [/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">`],
  [/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${SITE}/img/og/${image}.png">`],
  [/<meta property="og:image:alt" content="[^"]*">/, `<meta property="og:image:alt" content="${esc(title)}">`],
  [/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url}">`],
].reduce((html, [re, v]) => swap(html, re, v), app);

for (const { p, title, description, color, image, route, canonical } of pages) {
  const url = `${SITE}/${canonical ?? p}/`;
  if (!canonical) {
    await mkdir(path.join(OUT, p), { recursive: true });
    await writeFile(path.join(OUT, p, "index.html"), appPage({ title, description, color, image, url }));
    continue;
  }
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:site_name" content="AD2L Stat Tracker">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/img/og/${image}.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta name="theme-color" content="${color}">
<link rel="canonical" href="${url}">
<meta http-equiv="refresh" content="0; url=/${esc(route)}">
<script>location.replace("/" + location.search + ${JSON.stringify(route)});</script>
</head>
<body><a href="/${esc(route)}">${esc(title)}</a></body>
</html>
`;
  await mkdir(path.join(OUT, p), { recursive: true });
  await writeFile(path.join(OUT, p, "index.html"), html);
}
console.log(`wrote ${pages.length} preview pages into ${path.relative(process.cwd(), OUT) || "."}`);

// sitemap.xml (named in public/robots.txt): the home page and every preview page's own
// address; the old /ad2l/... and scrim forwards are left out (their canonical is the new page).
const urls = [`${SITE}/`, ...pages.filter((x) => !x.canonical).map(({ p }) => `${SITE}/${p}/`)];
await writeFile(path.join(OUT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${esc(u)}</loc></url>`).join("\n")}
</urlset>
`);
console.log(`wrote sitemap.xml (${urls.length} addresses)`);
