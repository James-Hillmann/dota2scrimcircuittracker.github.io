// The Steam sign-in in the top bar (right, before the settings cog). Signed out: "Sign in". Signed
// in: your Steam avatar, which opens your player page in the first league whose roster has you
// (the league you're viewing first). A player on no roster saves a scout of their OpenDota history
// and their Steam name on the Worker (lib/scout.js), and their page shows it. Avatar and Steam
// name come from OpenDota's public profile, kept in this browser for a day.
import { esc, DIVISIONS, SOURCES, divLite, playerHref, navigate, here, bySlug, myTeam, setMyTeam, myTeamAutoOk } from "../core.js";
import { steamAccount, steamLoginUrl } from "../lib/store.js";
import { saveMyScout } from "../lib/scout.js";

const PROFILE_KEY = "steam-profile";
const DAY = 864e5;

async function profileOf(account) {
  try {
    const c = JSON.parse(localStorage.getItem(PROFILE_KEY));
    if (c?.account === account && Date.now() - c.at < DAY) return c;
  } catch { /* storage blocked or empty */ }
  let p = { account, name: null, avatar: null, at: Date.now() };
  try {
    const r = await fetch(`https://api.opendota.com/api/players/${account}`);
    const j = r.ok ? await r.json() : null;
    p = { ...p, name: j?.profile?.personaname ?? null, avatar: j?.profile?.avatarmedium ?? null };
  } catch { /* offline or OpenDota down: initials instead */ }
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch { /* not remembered */ }
  return p;
}

// The Steam name saved for `account` (OpenDota profile), or null.
export function steamName(account) {
  try { const c = JSON.parse(localStorage.getItem(PROFILE_KEY)); return c?.account === account ? c.name : null; } catch { return null; }
}

// Leaves the visitor where they are after Steam sends them back (app.js puts the route back).
export function startSteamSignIn() {
  try { sessionStorage.setItem("steam-back", location.hash); } catch { /* lands on the path */ }
  location.href = steamLoginUrl(location.origin + location.pathname + location.search);
}

// The AD2L division being viewed (not All), or null.
function viewedDiv() {
  const k = bySlug[/^#\/([^/?]+)/.exec(here())?.[1]];
  return DIVISIONS[k] ? k : null;
}
// The team whose roster has you: the league being viewed first, then every division in menu
// order. { div, team } or null.
async function myRoster(account, first = viewedDiv()) {
  for (const k of [...new Set([first, ...Object.keys(DIVISIONS)].filter(Boolean))]) {
    try {
      const t = (await divLite(k)).teams.find((x) => x.players.some((p) => p.account_id === account));
      if (t) return { div: k, team: t };
    } catch { /* that division didn't load: try the next */ }
  }
  return null;
}
// Your player page: in the division whose roster has you, else the one being viewed (your scout
// report).
async function myPage(account) {
  const r = await myRoster(account);
  return playerHref(SOURCES[r?.div ?? viewedDiv() ?? Object.keys(DIVISIONS)[0]], String(account));
}
// My team follows your roster unless you've picked one (or None) by hand under the cog. The
// division searched first is the one My team already points at, so a player on two rosters
// keeps the one it had.
async function autoMyTeam(account) {
  if (!myTeamAutoOk()) return;
  const r = await myRoster(account, myTeam()?.div ?? viewedDiv());
  const cur = myTeam();
  if (r && (cur?.div !== r.div || cur?.id !== r.team.id)) setMyTeam({ div: r.div, id: r.team.id, name: r.team.name }, { auto: true });
}

export async function mountMe() {
  const el = document.getElementById("me");
  if (!el) return;
  const account = await steamAccount().catch(() => null);
  if (account == null) {
    el.innerHTML = `<button type="button" class="me-in" title="Sign in with Steam (for Fantasy)">Sign in</button>`;
    el.querySelector("button").onclick = startSteamSignIn;
    return;
  }
  autoMyTeam(account).catch((e) => console.warn("my team from sign-in", e));
  const p = await profileOf(account);
  // On no roster: save their scout and Steam name (re-scouted at most every few hours), so their
  // profile, the Gallery, Feed and search show them.
  myRoster(account).then((r) => r || saveMyScout(account, p)).catch((e) => console.warn("scout", e));
  const label = p.name ?? `Account ${account}`;
  el.innerHTML = `<a class="me-av" href="#" title="${esc(label)}: your page" aria-label="Your page (${esc(label)})">${p.avatar
    ? `<img src="${esc(p.avatar)}" alt="" width="30" height="30" referrerpolicy="no-referrer">`
    : `<span>${esc(label.slice(0, 1).toUpperCase())}</span>`}</a>`;
  el.querySelector("a").onclick = async (e) => { e.preventDefault(); navigate(await myPage(account)); };
}
