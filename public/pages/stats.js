// Visit counts, Fav only: every page and route, hour by hour, from GoatCounter through the
// steam-auth Worker (src/stats.js keeps the API key and checks the account). Counts are
// GoatCounter's visitors: one per browser session per page, no cookies, nothing personal.
import { app, esc, pageHead, setTitle } from "../core.js";
import { steamAccount, steamIdToken, steamLoginUrl } from "../lib/store.js";
import { isAdmin } from "../lib/pack-gifts.js";
import { hoursOf, byHourOfDay } from "../lib/visits.js";

const WORKER = "https://steam-auth.ad2lstats.workers.dev/stats";
const RANGES = [["24h", "24 hours", 1], ["7d", "7 days", 7], ["30d", "30 days", 30], ["90d", "90 days", 90]];
const HOUR = 3600e3;
const fmt = (n) => Number(n).toLocaleString("en-US");
// The last good answer per range, kept in this browser: GoatCounter fails a load now and then,
// and the page shows the saved set instead of an error.
const SAVED = (range) => `stats-last:${range}`;
const saveLast = (range, data) => { try { localStorage.setItem(SAVED(range), JSON.stringify({ at: Date.now(), data })); } catch {} };
const loadLast = (range) => { try { return JSON.parse(localStorage.getItem(SAVED(range))); } catch { return null; } };


// Thin bar per hour; every bar has a title with day, hour and number.
function hourBars(stats, { height = 120 } = {}) {
  const rows = hoursOf(stats), max = Math.max(1, ...rows.map((r) => r.n)), W = Math.max(rows.length, 1);
  const bars = rows.map((r, i) => {
    const h = (r.n / max) * (height - 4);
    return `<rect x="${i}" y="${height - h}" width=".86" height="${h}"><title>${r.day} ${String(r.hour).padStart(2, "0")}:00 · ${fmt(r.n)}</title></rect>`;
  }).join("");
  const days = stats.map((s, i) => `<line x1="${i * 24}" x2="${i * 24}" y1="0" y2="${height}" class="day-line"/>`).join("");
  return `<svg class="stats-bars" viewBox="0 0 ${W} ${height}" preserveAspectRatio="none" role="img" aria-label="Visitors per hour, peak ${fmt(max)}">${days}${bars}</svg>`;
}

// Day × hour table with the number in every cell, shaded by size.
function hourGrid(stats) {
  const max = Math.max(1, ...stats.flatMap((s) => s.hourly)), prof = byHourOfDay(stats);
  const cell = (n) => `<td style="--a:${n ? 0.12 + 0.88 * (n / max) : 0}">${n || ""}</td>`;
  const head = `<tr><th>Day</th>${Array.from({ length: 24 }, (_, h) => `<th>${String(h).padStart(2, "0")}</th>`).join("")}<th>Total</th></tr>`;
  const rows = stats.map((s) => `<tr><th>${esc(s.day)}</th>${s.hourly.map(cell).join("")}<td class="sum">${fmt(s.hourly.reduce((a, b) => a + b, 0))}</td></tr>`).join("");
  const foot = `<tr class="sum"><th>All days</th>${prof.map((n) => `<td>${n || ""}</td>`).join("")}<td>${fmt(prof.reduce((a, b) => a + b, 0))}</td></tr>`;
  return `<div class="stats-grid-wrap"><table class="stats-grid">${head}${rows}${foot}</table></div>`;
}

function peak(stats) {
  const best = hoursOf(stats).reduce((a, r) => (r.n > (a?.n ?? 0) ? r : a), null);
  return best ? `${best.day} ${String(best.hour).padStart(2, "0")}:00 (${fmt(best.n)})` : "none yet";
}

export async function renderStats() {
  setTitle("Visit counts");
  app.innerHTML = `${pageHead("AD2L Stat Tracker", "Visit counts")}<div class="stats-page"><p class="muted">Checking your sign-in…</p></div>`;
  const box = app.querySelector(".stats-page");
  const account = await steamAccount();
  if (!account) { box.innerHTML = `<p>Only Fav can see this page. <a href="${esc(steamLoginUrl())}">Sign in with Steam</a>.</p>`; return; }
  if (!isAdmin(account)) { box.innerHTML = `<p>Only Fav can see this page.</p>`; return; }
  mountStats(box, async (q) => {
    const r = await fetch(`${WORKER}?${q}`, { headers: { Authorization: `Bearer ${await steamIdToken()}` } });
    const out = await r.json();
    if (!r.ok) throw new Error(out.error ?? `Error ${r.status}`);
    return out;
  });
}

// The page itself; getStats(query) returns the Worker's answer for a start/end query.
export function mountStats(box, getStats) {
  let range = "7d", filter = "", open = new Set(), data = null, stale = null;
  box.innerHTML = `
    <div class="stats-bar">
      <div class="stats-ranges">${RANGES.map(([k, label]) => `<button type="button" class="seg" data-range="${k}">${label}</button>`).join("")}</div>
      <input type="search" class="stats-filter" placeholder="Filter pages and routes" autocomplete="off">
    </div>
    <div class="stats-body"></div>`;
  const body = box.querySelector(".stats-body");

  const draw = () => {
    if (!data) return;
    const paths = data.paths.filter((p) => !filter || `${p.path} ${p.title}`.toLowerCase().includes(filter));
    body.innerHTML = `${stale ? `<p class="stats-stale">GoatCounter didn't answer (${esc(stale.error)}). Showing the last counts that loaded, from ${esc(new Date(stale.at).toLocaleString())}.</p>` : ""}
      <div class="stats-totals">
        <div><b>${fmt(data.total - data.events)}</b><span>visits</span></div>
        <div><b>${fmt(data.paths.filter((p) => !p.event).length)}</b><span>pages and routes</span></div>
        <div><b>${esc(peak(data.stats))}</b><span>busiest hour</span></div>
      </div>
      <h2>All pages, per hour</h2>
      ${hourBars(data.stats)}
      ${hourGrid(data.stats)}
      <h2>By page and route <small>${fmt(paths.length)} shown · click a row for its hours</small></h2>
      <table class="stats-paths">
        <thead><tr><th>Page / route</th><th class="n">Visits</th><th class="n">Peak hour</th><th>Per hour</th></tr></thead>
        <tbody>${paths.map((p, i) => `
          <tr class="stats-path${open.has(p.path) ? " open" : ""}" data-path="${esc(p.path)}">
            <td><code>${esc(p.path)}</code>${p.title ? `<div class="muted">${esc(p.title)}</div>` : ""}</td>
            <td class="n">${fmt(p.count)}</td><td class="n">${fmt(p.max)}</td>
            <td class="spark">${hourBars(p.stats, { height: 28 })}</td>
          </tr>${open.has(p.path) ? `<tr class="stats-detail"><td colspan="4">${hourGrid(p.stats)}</td></tr>` : ""}`).join("") || `<tr><td colspan="4" class="muted">Nothing counted in this range.</td></tr>`}</tbody>
      </table>
      <p class="muted">GoatCounter visitors: one per browser session per page. Hours are in the timezone set in GoatCounter's settings. Ad blockers stop some visits being counted. Range ${esc(data.range.start)} → ${esc(data.range.end)}.</p>`;
  };

  const load = async () => {
    box.querySelectorAll("[data-range]").forEach((b) => b.classList.toggle("on", b.dataset.range === range));
    body.innerHTML = `<p class="muted">Loading…</p>`;
    const days = RANGES.find(([k]) => k === range)[2], end = Math.ceil(Date.now() / HOUR) * HOUR;
    const q = new URLSearchParams({ start: new Date(end - days * 24 * HOUR).toISOString(), end: new Date(end).toISOString() });
    const asked = range;
    try {
      const out = await getStats(q);
      if (asked !== range) return;
      data = out; stale = null;
      saveLast(range, data);
    } catch (e) {
      if (asked !== range) return;
      const last = loadLast(range);
      if (!last?.data) { body.innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
      data = last.data; stale = { at: last.at, error: e.message };
    }
    draw();
  };

  box.addEventListener("click", (e) => {
    const b = e.target.closest("[data-range]");
    if (b) { range = b.dataset.range; load(); return; }
    const row = e.target.closest(".stats-path");
    if (row) { const p = row.dataset.path; open.has(p) ? open.delete(p) : open.add(p); draw(); }
  });
  box.querySelector(".stats-filter").addEventListener("input", (e) => { filter = e.target.value.trim().toLowerCase(); draw(); });
  load();
}
