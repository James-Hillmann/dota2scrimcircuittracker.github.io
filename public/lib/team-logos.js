// Team identity uses PlayOn IDs. Name lookup also supports Champion teams on scrim pages.
import { TEAM_LOGOS } from "./team-logo-data.js";
const normalized = (name) => String(name ?? "").trim().toLowerCase();
const byName = new Map(Object.entries(TEAM_LOGOS).map(([id, t]) => [normalized(t.name), id]));
const escape = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export function teamLogoHtml(team, className = "") {
  const logo = TEAM_LOGOS[team?.id ?? byName.get(normalized(team?.name))];
  if (!logo) return "";
  // Resolve from this module so links work on both hash routes and deployed share pages.
  const url = new URL(`../${logo.file}`, import.meta.url).href;
  return `<img class="team-logo ${escape(className)}" src="${escape(url)}" alt="${escape(team.name ?? logo.name)} logo" width="128" height="128" loading="lazy" decoding="async">`;
}
