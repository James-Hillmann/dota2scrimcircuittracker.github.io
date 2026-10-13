// Link previews (Discord, iMessage, Slack) read a page's HTML and never see the part of a
// link after "#", so every #/... route looked like the home page. At deploy time
// scripts/deploy/share-pages.js writes a tiny page at a real path for each shareable route
// (/heroic/week/, /champion/teams/123/, ...) with that page's own title and description,
// which then forwards to the #/ route. These two functions are the mapping both ways.

import { DIVISIONS, slugOf } from "./divisions.js";

// / (and /ad2l/) is the league picker, the scrims are /scrims/ (Teams) and /scrims/<tab>/,
// Champion is /champion/. /all/ (every division together) has only its list tabs: no Predict,
// Upload, team or game pages. The scrims' old /week/, /teams/… are forwards (share-pages.js).
const TABS = "content|week|players|heroes|predict|upload";
const DIV_TABS = `${TABS}|drafter`; // the Drafter is AD2L only: scrims have no draft
// Division addresses (lib/divisions.js). A division played in sub-divisions (Heroic/Aegis) also
// has /<slug>/<view>/ (a, b), with the same tabs but no team or game pages of its own.
const LEAGUES = DIVISIONS.map(slugOf).join("|");
const VIEWED = DIVISIONS.filter((d) => d.views).map(slugOf).join("|") || "(?!)";
const VIEWS = [...new Set(DIVISIONS.flatMap((d) => d.views ?? []))].join("") || "a";
const SHAREABLE = new RegExp(`^(?:scrims(?:/(?:${TABS}))?|ad2l|all(?:/(?:content|week|players|heroes))?|(?:${LEAGUES}|(?:${VIEWED})/[${VIEWS}])(?:/(?:${DIV_TABS}))?|(?:${LEAGUES})/(?:teams|game)/\\d+)?$`);

// "#/heroic/b/week" -> "/heroic/b/week/"; null when the route has no preview page.
export function sharePath(hash) {
  const p = String(hash || "#/").replace(/^#\/?/, "").replace(/\/+$/, "");
  return SHAREABLE.test(p) ? (p ? `/${p}/` : "/") : null;
}

// "heroic/b/week" -> "#/heroic/b/week"; a bare league root keeps its trailing slash.
export function routeOf(path) {
  const p = path.replace(/^\/+|\/+$/g, "");
  return new RegExp(`^(?:ad2l|all|${LEAGUES}|(?:${VIEWED})/[${VIEWS}])$`).test(p) ? `#/${p}/` : `#/${p}`;
}
