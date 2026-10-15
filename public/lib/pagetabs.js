// The tabs on the team, player, hero and standings pages, in order: the one list both the page
// (its tab bar) and, for the league pages, the nav dropdowns read, so the two can't drift apart.
// Each entry: [id, label or (src) => label, { ad2l: true } if the tab only exists on AD2L].
// A page may still hide a tab for one team or player when it has nothing to show (core.js
// playerTabs drops empty panels).
// Team Draft: the hero grid (prep sheet), side and pick order, draft by phase, the model's
// drafts. Team Resources: the gold block (curve, leads, comebacks), which needs AD2L timelines.
export const TEAM_TABS = [
  ["overview", "Overview"], ["roster", "Roster"], ["games", (src) => (src.ad2l ? "Series" : "Games")], ["heroes", "Heroes"],
  ["draft", "Draft"], ["chances", "Outcomes", { ad2l: true }], ["lanes", "Laning", { ad2l: true }],
  ["resources", "Resources", { ad2l: true }], ["map", "Map"],
];
// Games is the list; game analysis sits under Stats (a row's ANALYZE opens it on that game).
export const PLAYER_TABS = [
  ["feed", "Feed"], ["stats", "Stats"], ["compare", "Compare"], ["heroes", "Heroes"], ["combat", "Combat"],
  ["lanes", "Laning", { ad2l: true }], ["items", "Items"], ["map", "Map"], ["games", "Games"],
];
export const HERO_TABS = [
  ["stats", "Stats"], ["players", "Players"], ["draft", "Draft"], ["matchups", "Matchups"], ["combat", "Combat"],
  ["lanes", "Laning", { ad2l: true }], ["items", "Items & skills"], ["map", "Map"], ["games", "Games"], ["analysis", "Analysis"],
];
// The league's Players page. Laning and Medal vs rating need AD2L's replays and medals.
export const PLAYERS_PAGE_TABS = [
  ["tiers", "Tier list"], ["leaders", "Stat leaders"], ["lanes", "Laning", { ad2l: true }],
  ["medal", "Medal vs rating", { ad2l: true }], ["stats", "All stats"],
];
// The league's Heroes page.
export const HEROES_PAGE_TABS = [["tiers", "Hero tiers"], ["players", "Players on heroes"], ["table", "All heroes"]];
// AD2L's Predict page (the scrim one has no tabs).
export const PREDICT_TABS = [["calls", "Predictions"], ["board", "Leaderboard"], ["bracket", "Bracket"], ["odds", "Seeding"], ["fantasy", "Fantasy"]];
// The Drafter's starting points (buttons on the page, not tabs, but linked the same way).
export const DRAFTER_MODES = [["upcoming", "Upcoming series"], ["teams", "Any two teams"], ["game", "Past game"]];
// The scrims' Teams page: the table built from the games, every match, and the team cards.
export const SCRIM_TEAMS_TABS = [["table", "Table"], ["matches", "Matches"], ["teams", "Teams"]];
// Race: AD2L divisions only, not All (sixty lines on one chart), once two league nights are in.
export const STANDINGS_TABS = [
  ["table", "Table"], ["matches", "Matches"], ["cross", "Crosstable"], ["race", "Race", { div: true }],
];

const exists = (src, opts = {}) => (!opts.ad2l || !!src.ad2l) && (!opts.div || (!!src.ad2l && !src.all));
const labelOf = (label, src) => (typeof label === "function" ? label(src) : label);

// The tabs this source can have, as [id, label].
export const tabList = (list, src) => list.filter(([, , o]) => exists(src, o)).map(([id, label]) => [id, labelOf(label, src)]);

// A page's tabs for core.js playerTabs: the list's order and labels, this page's panels.
// panels: [[id, html | { html, label }]] (label overrides, e.g. "Up next · 3"). Every tab in
// the list needs a panel and every panel a tab, so adding one in one place and not the other
// fails loudly instead of quietly drifting.
export function pageTabs(list, src, panels) {
  const byId = new Map(panels), ids = new Set(list.map(([id]) => id));
  const stray = [...byId.keys()].filter((id) => !ids.has(id));
  const missing = list.filter(([id, , o]) => exists(src, o) && !byId.has(id)).map(([id]) => id);
  if (stray.length || missing.length) throw new Error(`Page tabs out of step with lib/pagetabs.js: ${[...stray.map((s) => `+${s}`), ...missing.map((s) => `-${s}`)].join(" ")}`);
  return tabList(list, src).map(([id, label]) => {
    const p = byId.get(id) ?? "";
    return typeof p === "object" ? [id, p.label ?? label, p.html ?? ""] : [id, label, p];
  });
}
