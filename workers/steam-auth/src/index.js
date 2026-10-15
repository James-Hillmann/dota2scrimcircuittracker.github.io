// Steam sign-in for the fantasy league (Cloudflare Worker).
//
//   GET /login?return=<page url>  → sends the visitor to Steam's sign-in page.
//   GET /callback                 → Steam sends them back here; we ask Steam to confirm the reply,
//                                   then mint a Firebase custom token for uid "steam:<account id>"
//                                   and send them back to the page with it in the address fragment
//                                   (#fantasy-token=…; a fragment never reaches any server's logs).
//
// Secret FIREBASE_SA: a service account's JSON key ({ client_email, private_key }). Set it with
// `npx wrangler secret put FIREBASE_SA`; it never lives in this repo. Use an account made only for
// this, with no IAM roles: signing a custom token needs its private key, not permissions.

import { cosmeticsRequest } from './cosmetics.js';
export { CosmeticsVault } from './cosmetics.js';
import { scoutRequest } from './scout.js';
export { ScoutStore } from './scout.js';
const STEAM_OPENID = "https://steamcommunity.com/openid/login";
const STEAM_ID_RE = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;
const STEAM64_BASE = 76561197960265728n;
const TOKEN_AUD = "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit";
// Pages allowed to receive a token. Anything else is refused, so the Worker can't be used to hand a
// token to someone else's site.
export const ALLOWED_ORIGINS = [
  "https://dota2scrimcircuittracker.github.io",
  "http://localhost:3000",
  "http://localhost:56145",
];

export const allowedReturn = (ret) => {
  try { return ALLOWED_ORIGINS.includes(new URL(ret).origin); } catch { return false; }
};

// The Steam sign-in address for a visitor who should come back to `callback`.
export function steamLoginUrl(callback) {
  const realm = new URL(callback).origin;
  const p = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": callback,
    "openid.realm": realm,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  });
  return `${STEAM_OPENID}?${p}`;
}

// The 32-bit Dota account id (what OpenDota and the site use) from Steam's reply, or null.
export function accountIdOf(claimedId) {
  const m = STEAM_ID_RE.exec(claimedId ?? "");
  return m ? String(BigInt(m[1]) - STEAM64_BASE) : null;
}

// Ask Steam whether the reply it sent really came from it (OpenID check_authentication).
async function steamConfirms(params) {
  const body = new URLSearchParams(params);
  body.set("openid.mode", "check_authentication");
  const r = await fetch(STEAM_OPENID, { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded" } });
  return /is_valid\s*:\s*true/.test(await r.text());
}

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlJson = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));

// A Firebase custom token (RS256 JWT signed with the service account's key), valid for an hour.
export async function firebaseToken(sa, uid, claims = {}, now = Math.floor(Date.now() / 1000)) {
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const head = b64urlJson({ alg: "RS256", typ: "JWT" });
  const body = b64urlJson({ iss: sa.client_email, sub: sa.client_email, aud: TOKEN_AUD, iat: now, exp: now + 3600, uid, claims });
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(sig)}`;
}

const text = (msg, status = 400) => new Response(msg, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if(url.pathname.startsWith('/cosmetics')) return cosmeticsRequest(req,env,ALLOWED_ORIGINS);
    if(url.pathname === '/scout' || url.pathname.startsWith('/scout/')) return scoutRequest(req,env,ALLOWED_ORIGINS);
    if (url.pathname === "/login") {
      const ret = url.searchParams.get("return");
      if (!allowedReturn(ret)) return text("Unknown return page.");
      const cb = new URL("/callback", url.origin);
      cb.searchParams.set("return", ret);
      return Response.redirect(steamLoginUrl(cb.toString()), 302);
    }
    if (url.pathname === "/callback") {
      const ret = url.searchParams.get("return");
      if (!allowedReturn(ret)) return text("Unknown return page.");
      const params = Object.fromEntries([...url.searchParams].filter(([k]) => k.startsWith("openid.")));
      // The reply must be addressed to this very callback and come from Steam's endpoint.
      const expected = new URL(url); for (const k of [...expected.searchParams.keys()]) if (k.startsWith("openid.")) expected.searchParams.delete(k);
      if (params["openid.mode"] !== "id_res" || params["openid.op_endpoint"] !== STEAM_OPENID || params["openid.return_to"] !== expected.toString()) return text("Steam sign-in didn't complete.");
      const account = accountIdOf(params["openid.claimed_id"]);
      if (!account || !(await steamConfirms(params))) return text("Steam couldn't confirm the sign-in.", 401);
      const token = await firebaseToken(JSON.parse(env.FIREBASE_SA), `steam:${account}`, { steam: Number(account) });
      const back = new URL(ret); back.hash = `fantasy-token=${token}`;
      return Response.redirect(back.toString(), 302);
    }
    return text("Not found.", 404);
  },
};
