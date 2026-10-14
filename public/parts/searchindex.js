// The search index over every league: each division's trimmed file, the saved scrims and the
// Steam players on no roster, loaded once (the pages reuse the files). A division that can't load
// is left out rather than failing the search. The header pop-up and the results page share it.
import { DIVISIONS, SOURCES, divLite, allMatches } from "../core.js";
import { buildSearchIndex } from "../lib/search.js";
import { loadNicknames } from "../lib/nicknames.js";
import { steamPlayers } from "../lib/scout.js";

let ready = null;
addEventListener('player-names-change', () => { ready = null; });
export function loadSearch() {
  ready ??= Promise.all([
    Promise.all(Object.entries(DIVISIONS).map(async ([key, dv]) => {
      try { return { key, label: dv.short, root: SOURCES[key].root, views: dv.views, data: await divLite(key) }; }
      catch (e) { console.warn(`search: ${key} unavailable`, e); return null; }
    })),
    allMatches().catch((e) => { console.warn("search: scrims unavailable", e); return null; }),
    loadNicknames(),
    steamPlayers(),
  ]).then(([leagues, scrims, , steam]) => buildSearchIndex(leagues.filter(Boolean), scrims && { label: "Scrims", matches: scrims },
    { label: "Not in a league", root: SOURCES[Object.keys(DIVISIONS)[0]].root, players: [...steam.values()] }))
    .catch((e) => { ready = null; throw e; });
  return ready;
}
