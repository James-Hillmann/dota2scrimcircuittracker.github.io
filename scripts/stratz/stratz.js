// STRATZ GraphQL client (api.stratz.com/graphql). Needs a token from stratz.com/api in
// STRATZ_API_KEY (a repo secret in Actions, .env or the shell locally).
// STRATZ sits behind Cloudflare and turns away requests without its own user-agent, so every
// call sends "STRATZ_API". The free tier allows a handful of calls a second, so calls are
// spaced and 429s wait and retry.
const URL = "https://api.stratz.com/graphql";
const GAP_MS = 350;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let last = 0, waitedForIp = false;

export function hasToken() { return Boolean(process.env.STRATZ_API_KEY); }

export async function stratz(query, variables = {}, tries = 5) {
  const token = process.env.STRATZ_API_KEY;
  if (!token) throw new Error("STRATZ_API_KEY is not set (get one at stratz.com/api).");
  for (let attempt = 0; attempt < tries; attempt++) {
    await sleep(Math.max(0, GAP_MS - (Date.now() - last)));
    last = Date.now();
    const res = await fetch(URL, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "STRATZ_API", authorization: `Bearer ${token}` },
      body: JSON.stringify({ query, variables }),
    }).catch((e) => { if (attempt === tries - 1) throw e; return { status: 599, error: e }; });
    if ((res.status === 429 || res.status >= 500) && attempt < tries - 1) {
      const wait = 5e3 * (attempt + 1);
      console.log(`  STRATZ HTTP ${res.status}; retrying in ${wait / 1000}s`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) {
      const text = (await res.text()).slice(0, 300);
      // A key may be used from 2 IP addresses per 15 minutes, and every Actions run is a new
      // one. STRATZ says when one frees up ("... at 2026-10-14 19:50:22 UTC"): wait for it, once.
      const free = res.status === 403 && /IP Address/i.test(text) && text.match(/at (\d{4}-\d\d-\d\d \d\d:\d\d:\d\d) UTC/);
      if (free && !waitedForIp) {
        waitedForIp = true;
        const wait = Math.min(16 * 60e3, Math.max(0, Date.parse(`${free[1].replace(" ", "T")}Z`) - Date.now()) + 5e3);
        console.log(`  STRATZ: this key's 2 IP addresses are in use; waiting ${Math.round(wait / 1000)}s for one to free up`);
        await sleep(wait);
        attempt--;
        continue;
      }
      throw new Error(`STRATZ HTTP ${res.status}: ${text}`);
    }
    const body = await res.json();
    if (body.errors?.length) throw new Error(`STRATZ: ${body.errors.map((e) => e.message).join("; ")}`);
    return body.data;
  }
}
