// Visitor counts with GoatCounter (goatcounter.com): no cookies, no personal data, one small
// script. Each page change counts as one view of its address (path + #route, no query).
// The guided tour's automatic page moves don't count. Off until SITE_CODE is set; GoatCounter
// itself ignores localhost. To stop counting your own browser, open the site once with
// #toggle-goatcounter on the end of the address.
export const SITE_CODE = "jonahbyu"; // https://jonahbyu.goatcounter.com
// GoatCounter's versioned script (its plain count.js changes without notice) and its hash: the
// browser refuses a copy that doesn't match. scripts/gen/cdn-integrity.js refreshes the hash.
const COUNT_JS = "https://gc.zgo.at/count.v5.js";
const COUNT_JS_INTEGRITY = "sha384-atnOLvQb9t+jTSipvd75X2yginT4PjVbqDdlJAmxMm+wYElFmeR6EmLP5bYeoRVQ";

let loading = null;
function load() {
  if (!SITE_CODE) return null;
  loading ??= new Promise((resolve) => {
    window.goatcounter = { no_onload: true };
    const s = document.createElement("script");
    s.async = true;
    s.src = COUNT_JS;
    s.integrity = COUNT_JS_INTEGRITY;
    s.crossOrigin = "anonymous";
    s.dataset.goatcounter = `https://${SITE_CODE}.goatcounter.com/count`;
    s.onload = () => resolve(window.goatcounter);
    s.onerror = () => resolve(null); // blocked by an ad blocker: count nothing
    document.head.append(s);
  });
  return loading;
}

let last = null;
export function countVisit() {
  if (document.body.classList.contains("touring")) return;
  const path = (location.pathname + location.hash) || "/";
  if (path.endsWith("#/stats")) return; // Fav reading the counts
  if (path === last) return;
  last = path;
  load()?.then((gc) => gc?.count?.({ path }));
}

// For Fav's /stats page (pages/stats.js), from GoatCounter's per-day "hourly" arrays:
// every hour as { day, hour, n }, and the 24-hour profile summed over all days.
export const hoursOf = (stats) => stats.flatMap(({ day, hourly }) => hourly.map((n, hour) => ({ day, hour, n })));
export const byHourOfDay = (stats) => stats.reduce((acc, { hourly }) => (hourly.forEach((n, h) => { acc[h] += n; }), acc), Array(24).fill(0));
