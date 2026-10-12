// Every AD2L division the site shows, in one place. The league menu, routes and share paths,
// colours, data files, Firestore collections for unticketed uploads, the sync's PlayOn season
// ids, the preview pages and the preview cards all read this file.
// New season or new division: edit this file, sync, and redraw the preview cards
// (scripts/gen/gen-og-images.py). By hand: the Firestore rules (firebase/scrimleague.rules,
// deployed from the Cookbook copy: collection regex and league lists) and docs/maintaining.md.

// The season every division belongs to. dotaLeague: the Dota league id the sync checks
// each match against.
// phase: "regular" or "playoffs" (the top bar's Playoffs stamp, playoff Up next and Predict).
// regularEnd: when the group stage ended (unix seconds). Series starting after it are the
// postseason (week 8 tiebreakers, then the bracket): kept out of the group-stage table, SoS and
// records, and read as best-of-3 with no tie on Up next and Predict. A group-stage make-up
// played after it would read as postseason: list its PlayOn series id in regularIds.
// New season: phase "regular", regularEnd null, regularIds [].
export const SEASON = {
  name: "S48", long: "Season 48", dotaLeague: 20077,
  phase: "playoffs", regularEnd: Date.UTC(2026, 9, 12) / 1000, regularIds: [],
};
export const playoffs = SEASON.phase === "playoffs";
export const isPostseason = (s) => SEASON.regularEnd != null && (s.time ?? 0) > SEASON.regularEnd && !SEASON.regularIds.includes(s.id);
export const groupStage = (series) => series.filter((s) => !isPostseason(s));

// Menu order: lowest division first.
// key: the id in data files (public/data/<key>.json), Firestore and predictions.
// slug: the address when it isn't the key (Champion is keyed "ad2l" but lives at /champion/).
// season: PlayOn season id. views: sub-divisions played inside it (Heroic/Aegis: A and B).
// Colours: color (dark theme accent, menu and the brand mark's first half), dark (the mark's
// second half), text (the header's league name; none = the default), light (accent in the
// light theme), mark (the mark's first half, when it isn't `color`).
export const DIVISIONS = [
  { key: "explorer", name: "Explorer", season: 670, color: "#3cc6c6", dark: "#1f8585", text: "#9fe6e6", light: "#1e9a9a" },
  { key: "voyager", name: "Voyager", season: 671, color: "#ef6b73", dark: "#a83a44", text: "#f7b3b8", light: "#d9434d" },
  { key: "challenger", name: "Challenger", season: 672, color: "#9bd34a", dark: "#5e8f22", text: "#c2e88e", light: "#5e9a1c" },
  { key: "warrior", name: "Warrior", season: 673, color: "#ff9a3c", dark: "#c4671c", text: "#ffb870", light: "#d9731a" },
  { key: "conqueror", name: "Conqueror", season: 674, color: "#5aa9e6", dark: "#2f78b5", text: "#8cc4f0", light: "#2f84c8" },
  { key: "ad2l", slug: "champion", name: "Champion", season: 675, color: "#e8b64c", dark: "#b98a2e", light: "#bf8514", mark: "var(--gold)" },
  { key: "heroic", name: "Heroic/Aegis", season: 676, views: ["a", "b"], color: "#a58bff", dark: "#6a4fd6", text: "#b9a6ff", light: "#7b5ce6" },
];

export const division = (key) => DIVISIONS.find((d) => d.key === key) ?? null;
export const slugOf = (d) => d.slug ?? d.key;
// "S48 Warrior", as the pages and titles name a division.
export const fullName = (d) => `${SEASON.name} ${d.name}`;
// Firestore collection for a division's unticketed uploads.
export const collectionOf = (key) => `${key}_unticketed`;

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ");
// Each division's colours as CSS: the page accent (both themes), the brand mark, the header's
// league name, and the division's links in the league menu, league picker and search chips.
// app.js adds it to the page at start.
export function divisionCss() {
  return DIVISIONS.map((d) => {
    const k = `[data-league="${d.key}"]`, chip = `.lg-chip[data-lg="${d.key}"]`;
    return [
      `body${k} { --accent: ${d.color}; --accent-rgb: ${rgb(d.color)}; }`,
      `html.light body${k} { --accent: ${d.light}; --accent-rgb: ${rgb(d.light)}; }`,
      `body${k} .brand-mark i { background: ${d.mark ?? d.color}; }`,
      `body${k} .brand-mark i + i { background: ${d.dark}; }`,
      d.text ? `body${k} .brand-word b { color: ${d.text}; }` : "",
      `.league-menu a${k}, .hub-list a${k}, ${chip} { --lc: ${d.color}; --lc-rgb: ${rgb(d.color)}; }`,
      `html.light :is(.league-menu, .hub-list) a${k}, html.light ${chip} { --lc: ${d.light}; --lc-rgb: ${rgb(d.light)}; }`,
    ].filter(Boolean).join("\n");
  }).join("\n");
}
