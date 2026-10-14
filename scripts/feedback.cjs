// Feedback tickets (sent from the site's Feedback mode, lib/feedback.js), read and closed with
// Jonah's Firebase login (firebase-tools), which the Firestore rules don't bind. The site
// can't read tickets; this is the way in. Nothing here builds anything from a ticket.
//
//   node scripts/feedback.cjs list                open tickets, oldest first
//   node scripts/feedback.cjs show FB-XXXXXX      one ticket in full; screenshots saved to .cache/feedback/, and a
//                                                 replay file for the local site: open the printed
//                                                 http://localhost:3000/?fbreview=FB-XXXXXX (npm start) to see the
//                                                 marks drawn on the real pages
//   node scripts/feedback.cjs done FB-XXXXXX "summary"
//                                                 delete the ticket and its items, log it in docs/feedback-log.md,
//                                                 delete its Discord post (when its message ID was recorded), and
//                                                 repost today's digest without it
//   node scripts/feedback.cjs check               JSON for the email task: tickets not emailed yet,
//                                                 and every open one if today's digest is due
//   node scripts/feedback.cjs emailed [--new FB-A,FB-B] [--digest]
//                                                 record what the email task sent
//   node scripts/feedback.cjs discord [--dry-run]  post tickets not sent yet, and the digest when due, to the
//                                                 Discord webhook in DISCORD_FEEDBACK_WEBHOOK (.env.local)
//   node scripts/feedback.cjs link FB-XXXXXX <account|none>
//                                                 show the ticket on that player's profile (none: take it off)
//
// Ticket status on profiles: a linked ticket gets a public feedback_status document (its ID, its
// first note trimmed, open or implemented) that the sender's profile lists. Tickets sent while
// signed in with Steam link themselves on the next `discord` run; others need `link`. `done` marks
// a linked ticket implemented, and profiles show that for a week; `discord` and `done` delete the
// older ones.
//
// Which tickets were sent (email or Discord), the Discord message IDs (so `done` and the next
// digest can delete them), and when the last digest went, is kept in .cache/feedback-state.json
// (gitignored; this machine only).
const fs = require("fs");
const path = require("path");
const { requireAuth } = require("firebase-tools/lib/requireAuth");
const { Client } = require("firebase-tools/lib/apiv2");

const PROJECT = "pistachio-kitchen";
const DOCS = `/projects/${PROJECT}/databases/(default)/documents`;
const BASE = `${DOCS}/scrimLeague/data`;
const ROOT = path.join(__dirname, "..");
const STATE = path.join(ROOT, ".cache", "feedback-state.json");
const SHOTS = path.join(ROOT, ".cache", "feedback");
const LOG = path.join(ROOT, "docs", "feedback-log.md");
// Replay files for lib/feedback.js on localhost. public/_dev/ is gitignored, so they never deploy.
const REVIEW = path.join(ROOT, "public", "_dev", "feedback");
const DIGEST_HOUR = 9; // local time; the daily digest goes on the first check at or after this hour

const displayId = (docId) => `FB-${docId.slice(0, 6).toUpperCase()}`;
const rel = (name) => name.replace(/^.*?\/documents/, DOCS);
// Firestore REST values → plain JS.
const val = (v) => {
  if (!v || "nullValue" in v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, val(x)]));
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(val);
  return null;
};
const plain = (doc) => Object.fromEntries(Object.entries(doc.fields ?? {}).map(([k, v]) => [k, val(v)]));

let client;
async function api() {
  if (client) return client;
  const acct = require("firebase-tools/lib/auth").getGlobalDefaultAccount();
  if (!acct) throw new Error("Not logged in to Firebase. Run: npx firebase login");
  await requireAuth({ project: PROJECT, user: acct.user, tokens: acct.tokens });
  return (client = new Client({ urlPrefix: "https://firestore.googleapis.com", apiVersion: "v1" }));
}
async function listAll(collectionPath, mask) {
  const c = await api();
  const out = [];
  let pageToken = "";
  do {
    const queryParams = { pageSize: 100, ...(pageToken ? { pageToken } : {}) };
    // mask.fieldPaths keeps the big screenshots out of listings.
    const q = new URLSearchParams(queryParams);
    for (const f of mask ?? []) q.append("mask.fieldPaths", f);
    const r = (await c.get(`${collectionPath}?${q}`)).body;
    out.push(...(r.documents ?? []));
    pageToken = r.nextPageToken ?? "";
  } while (pageToken);
  return out;
}

const ITEM_FIELDS = ["kind", "page", "league", "theme", "viewport", "note", "area", "target"];
async function tickets({ withShots = false } = {}) {
  const docs = await listAll(`${BASE}/feedback`);
  const out = [];
  for (const d of docs) {
    const t = plain(d);
    const docId = d.name.split("/").pop();
    const items = (await listAll(`${rel(d.name)}/items`, withShots ? null : ITEM_FIELDS))
      .map((it) => ({ n: Number(it.name.split("/").pop()), docName: it.name, ...plain(it) }))
      .sort((a, b) => a.n - b.n);
    out.push({ id: displayId(docId), docId, docName: d.name, name: t.name, uid: t.uid ?? null, createdAt: t.createdAt, items });
  }
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
async function findTicket(id, opts) {
  const want = id.toUpperCase().replace(/^(?!FB-)/, "FB-");
  const hit = (await tickets(opts)).filter((t) => t.id === want);
  if (!hit.length) throw new Error(`No open ticket ${want}.`);
  if (hit.length > 1) throw new Error(`${want} matches ${hit.length} tickets; use the full document ID.`);
  return hit[0];
}

const readState = () => {
  let s;
  try { s = JSON.parse(fs.readFileSync(STATE, "utf8")); } catch { s = {}; }
  return { emailed: {}, lastDigest: null, posts: {}, digestPosts: [], ...s };
};
const writeState = (s) => { fs.mkdirSync(path.dirname(STATE), { recursive: true }); fs.writeFileSync(STATE, JSON.stringify(s, null, 2)); };
const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local

// What a person (or the email task) needs to act on: no screenshots, no uid.
const summary = (t) => ({
  id: t.id, from: t.name, sent: t.createdAt,
  notes: t.items.map((it) => ({
    n: it.n + 1, kind: it.kind, page: it.page, note: it.note,
    ...(it.target ? { element: it.target.text || null, selector: it.target.sel } : {}),
    screen: it.viewport ? `${it.viewport.w}×${it.viewport.h} ${it.theme}` : null,
  })),
});

// ---------- ticket status on profiles ----------
const STATUS = `${BASE}/feedback_status`;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const steamOf = (t) => /^steam:(\d{1,10})$/.exec(t.uid ?? "")?.[1] ?? null;
async function getStatus(docId) {
  try { return plain((await (await api()).get(`${STATUS}/${docId}`)).body); }
  catch (e) { if (e.status === 404 || /404|not found/i.test(e.message)) return null; throw e; }
}
async function putStatus(t, account, status) {
  const note = (t.items[0]?.note ?? "").replace(/\s+/g, " ").trim();
  await (await api()).patch(`${STATUS}/${t.docId}`, { fields: {
    id: { stringValue: t.id }, account: { stringValue: String(account) },
    note: { stringValue: note.length > 160 ? `${note.slice(0, 157)}…` : note },
    status: { stringValue: status }, sent: { timestampValue: t.createdAt },
    done: status === "implemented" ? { timestampValue: new Date().toISOString() } : { nullValue: null },
  } });
}
// Implemented tickets show for a week; after that their status goes.
async function pruneStatus() {
  const c = await api();
  let n = 0;
  for (const d of await listAll(STATUS)) {
    const x = plain(d);
    if (x.status === "implemented" && x.done && Date.now() - Date.parse(x.done) > WEEK_MS) { await c.delete(rel(d.name)); n++; }
  }
  return n;
}
async function autolink(all) {
  let n = 0;
  for (const t of all) { const a = steamOf(t); if (a && !(await getStatus(t.docId))) { await putStatus(t, a, "open"); n++; } }
  return n;
}

const commands = {
  async link(id, account) {
    if (!id || !account || !/^(\d{1,10}|none)$/.test(account)) throw new Error("usage: link FB-XXXXXX <account id|none>");
    const t = await findTicket(id);
    if (account === "none") { await (await api()).delete(`${STATUS}/${t.docId}`).catch(() => {}); return console.log(`${t.id} is off profiles.`); }
    await putStatus(t, account, "open");
    console.log(`${t.id} (from ${t.name}) now shows as open on profile ${account}.`);
  },

  async list() {
    const all = await tickets();
    if (!all.length) return console.log("No open tickets.");
    for (const t of all) {
      console.log(`${t.id}  ${new Date(t.createdAt).toLocaleString()}  from ${t.name}  (${t.items.length} note${t.items.length === 1 ? "" : "s"})`);
      for (const it of t.items) console.log(`    ${it.n + 1}. [${it.kind}] ${new URL(it.page).pathname}${new URL(it.page).search}${new URL(it.page).hash}  ${it.note.replace(/\s+/g, " ").slice(0, 100)}`);
    }
  },

  async show(id) {
    if (!id) throw new Error("usage: show FB-XXXXXX");
    const t = await findTicket(id, { withShots: true });
    const dir = path.join(SHOTS, t.id);
    fs.mkdirSync(dir, { recursive: true });
    for (const it of t.items) {
      if (it.shot) fs.writeFileSync(path.join(dir, `${it.n + 1}-${it.kind}.jpg`), Buffer.from(it.shot.split(",")[1], "base64"));
    }
    fs.mkdirSync(REVIEW, { recursive: true });
    fs.writeFileSync(path.join(REVIEW, `${t.id}.json`), JSON.stringify({
      id: t.id, from: t.name, sent: t.createdAt,
      items: t.items.map(({ n, kind, page, league, theme, viewport, note, area, target, strokes, shot }) => ({ n, kind, page, league, theme, viewport, note, area, target, strokes, shot })),
    }));
    console.log(JSON.stringify(summary(t), null, 2));
    console.log(`Screenshots: ${dir}`);
    console.log(`Replay (with npm start running): http://localhost:3000/?fbreview=${t.id}`);
  },

  async done(id, ...words) {
    const note = words.join(" ").trim();
    if (!id || !note) throw new Error('usage: done FB-XXXXXX "short summary of what was done"');
    const t = await findTicket(id);
    const c = await api();
    // On the sender's profile it now reads implemented, for a week.
    const linked = (await getStatus(t.docId))?.account ?? steamOf(t);
    if (linked) await putStatus(t, linked, "implemented");
    await pruneStatus();
    // Deleting a document doesn't delete its subcollection: items first, then the ticket.
    for (const it of t.items) await c.delete(rel(it.docName));
    await c.delete(rel(t.docName));
    if (!fs.existsSync(LOG)) fs.writeFileSync(LOG, "# Feedback log\n\nCompleted feedback tickets: ID · date · what was done. Names stay out (this repo is public).\n\n");
    fs.appendFileSync(LOG, `- ${t.id} · ${today()} · ${note.replace(/\s+/g, " ")}\n`);
    fs.rmSync(path.join(SHOTS, t.id), { recursive: true, force: true });
    fs.rmSync(path.join(REVIEW, `${t.id}.json`), { force: true });
    const s = readState();
    const msg = s.posts[t.id];
    let discord = "no Discord post recorded for it; delete that one by hand";
    if (msg) {
      const hook = webhookUrl();
      if (hook) {
        try { await deleteWebhookMessage(hook, msg); discord = "deleted its Discord post"; }
        catch (e) { discord = `couldn't delete its Discord post (${e.message}); delete it by hand`; }
      }
      else discord = "no DISCORD_FEEDBACK_WEBHOOK, so its Discord post is still up";
    }
    delete s.emailed[t.id]; delete s.posts[t.id]; writeState(s);
    // Today's digest lists it too: replace the digest with the tickets still open (none: just delete it).
    if (s.digestPosts.length) {
      const hook = webhookUrl();
      if (hook) {
        try {
          const left = await postDigest(hook, s, (await tickets()).map(summary));
          discord += left ? `, and reposted today's digest with the ${left} still open` : ", and deleted today's digest";
        } catch (e) { discord += `; couldn't update today's digest (${e.message}), delete it by hand`; }
      }
    }
    console.log(`Deleted ${t.id} (${t.items.length} item${t.items.length === 1 ? "" : "s"}), logged it in docs/feedback-log.md, ${discord}.${linked ? ` Profile ${linked} shows it implemented for a week.` : ""}`);
  },

  async check() {
    const all = await tickets();
    const s = readState();
    const digestDue = new Date().getHours() >= DIGEST_HOUR && s.lastDigest !== today();
    console.log(JSON.stringify({
      new: all.filter((t) => !s.emailed[t.id]).map(summary),
      digestDue,
      open: digestDue ? all.map(summary) : [],
      openCount: all.length,
    }, null, 2));
  },

  async emailed(...args) {
    const s = readState();
    const i = args.indexOf("--new");
    const ids = i >= 0 ? (args[i + 1] ?? "").split(",").map((x) => x.trim()).filter(Boolean) : [];
    for (const id of ids) s.emailed[id] = new Date().toISOString();
    if (args.includes("--digest")) s.lastDigest = today();
    writeState(s);
    console.log(`Recorded: ${ids.length} new${args.includes("--digest") ? " + today's digest" : ""}.`);
  },

  async discord(...args) {
    const dry = args.includes("--dry-run");
    const hook = webhookUrl();
    if (!hook && !dry) throw new Error("No DISCORD_FEEDBACK_WEBHOOK. Put it in .env.local in the project folder.");
    const all = await tickets();
    if (!dry) { const linked = await autolink(all), pruned = await pruneStatus(); if (linked || pruned) console.log(`Profiles: linked ${linked} ticket(s), cleared ${pruned} older than a week.`); }
    const s = readState();
    const digestDue = new Date().getHours() >= DIGEST_HOUR && s.lastDigest !== today();
    const fresh = all.filter((t) => !s.emailed[t.id]).map(summary);
    const post = async (body) => (dry ? (console.log(JSON.stringify(body, null, 2)), null) : postWebhook(hook, body));

    // One message per ticket, recorded as soon as it posts, so a failure part way never double-posts the rest.
    for (const t of fresh) {
      const msg = await post({ content: `New site feedback: **${t.id}**`, embeds: [ticketEmbed(t, true)], allowed_mentions: { parse: [] } });
      if (!dry) { s.emailed[t.id] = new Date().toISOString(); if (msg?.id) s.posts[t.id] = msg.id; writeState(s); }
    }
    let digest = "not due";
    if (digestDue) {
      if (dry) for (const body of digestBodies(all.map(summary))) await post(body);
      else await postDigest(hook, s, all.map(summary));
      digest = all.length ? "sent" : "due, nothing open";
      if (!dry) { s.lastDigest = today(); writeState(s); }
    }
    console.log(`${dry ? "[dry run] " : ""}Posted ${fresh.length} new ticket${fresh.length === 1 ? "" : "s"}; digest ${digest}.`);
  },
};

// ---- Discord ----
// Ticket text comes from anonymous visitors: markdown is escaped and mentions are off on every post.
function webhookUrl() {
  if (!process.env.DISCORD_FEEDBACK_WEBHOOK) {
    try { process.loadEnvFile(path.join(ROOT, ".env.local")); } catch {}
  }
  const u = process.env.DISCORD_FEEDBACK_WEBHOOK?.trim();
  if (u && !/^https:\/\/(canary\.|ptb\.)?discord(app)?\.com\/api\/webhooks\//.test(u)) throw new Error("DISCORD_FEEDBACK_WEBHOOK isn't a Discord webhook URL.");
  return u;
}
const esc = (x) => String(x ?? "").replace(/[\\`*_~|>#\[\]()<@-]/g, "\\$&");
const clip = (x, n) => (x.length > n ? x.slice(0, n - 1) + "…" : x);
const pacific = (iso) => new Date(iso).toLocaleString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short" }) + " PT";
const FOOTER = (id) => `Review: \`node scripts/feedback.cjs show ${id}\`, then http://localhost:3000/?fbreview=${id} (npm start)\nClose: \`node scripts/feedback.cjs done ${id} "what was done"\``;

function ticketEmbed(t, withFooter) {
  const notes = t.notes.map((n) => {
    let page = n.page;
    try { const u = new URL(n.page); page = u.pathname + u.search + u.hash; } catch {}
    return [
      `**${n.n}. ${esc(n.kind)}** on ${esc(page)}`,
      `> ${clip(esc(n.note).replace(/\s+/g, " "), 400)}`,
      n.element !== undefined ? `Element: ${clip(esc(n.element ?? "(no text)"), 80)} · ${clip(esc(n.selector), 120)}` : null,
      n.screen ? `Screen: ${esc(n.screen)}` : null,
    ].filter(Boolean).join("\n");
  });
  let desc = "";
  for (const [i, block] of notes.entries()) {
    const next = (desc ? desc + "\n\n" : "") + block;
    if (next.length > 1500) { desc += `\n\n…and ${notes.length - i} more (run show).`; break; }
    desc = next;
  }
  return {
    title: `${t.id} from ${clip(t.from ?? "anonymous", 80)}`,
    description: withFooter ? `${desc}\n\n${FOOTER(t.id)}` : desc,
    footer: { text: `${t.notes.length} note${t.notes.length === 1 ? "" : "s"} · sent ${pacific(t.sent)}` },
    timestamp: t.sent,
    color: 0x5865f2,
  };
}

async function postWebhook(url, body, tries = 3) {
  const r = await fetch(url + "?wait=true", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (r.status === 429 && tries > 1) {
    const wait = Number((await r.json().catch(() => ({}))).retry_after ?? 2);
    await new Promise((res) => setTimeout(res, Math.ceil(wait * 1000) + 250));
    return postWebhook(url, body, tries - 1);
  }
  if (!r.ok) throw new Error(`Discord webhook ${r.status}: ${clip(await r.text(), 300)}`);
  return r.json(); // ?wait=true: the message, whose id `done` uses to delete it
}
// The digest: one line per open ticket, linking to its own post rather than repeating it, so a
// ticket's text only ever appears once in the channel. Lines are packed under Discord's
// 2000-character message cap.
const digestBodies = (open, posts = {}, where = null) => {
  const lines = open.map((t) => {
    const msg = posts[t.id];
    const link = msg && where ? ` · [see post](https://discord.com/channels/${where.guild}/${where.channel}/${msg})` : "";
    return `• **${t.id}** from ${clip(esc(t.from ?? "anonymous"), 80)} · ${t.notes.length} note${t.notes.length === 1 ? "" : "s"} · sent ${pacific(t.sent)}${link}`;
  });
  const out = [];
  let content = `Site feedback: **${open.length}** open ticket${open.length === 1 ? "" : "s"}\n${FOOTER("FB-XXXXXX")}`;
  for (const line of lines) {
    if (content.length + line.length + 1 > 1900) { out.push(content); content = line; }
    else content += `\n${line}`;
  }
  out.push(content);
  return out.map((c) => ({ content: c, allowed_mentions: { parse: [] } }));
};
// The webhook's server and channel, for message links. GET on a webhook URL needs no other auth.
async function webhookWhere(hook) {
  try {
    const r = await fetch(hook);
    const w = r.ok ? await r.json() : null;
    return w?.guild_id && w?.channel_id ? { guild: w.guild_id, channel: w.channel_id } : null;
  } catch { return null; }
}
// Each digest replaces the last one, so closed tickets don't linger in old digests. Returns how
// many tickets it lists.
async function postDigest(hook, s, open) {
  for (const id of s.digestPosts) await deleteWebhookMessage(hook, id);
  s.digestPosts = []; writeState(s);
  if (!open.length) return 0;
  const where = await webhookWhere(hook);
  for (const body of digestBodies(open, s.posts, where)) {
    const msg = await postWebhook(hook, body);
    if (msg?.id) { s.digestPosts.push(msg.id); writeState(s); }
  }
  return open.length;
}

// A webhook can delete its own messages. Already gone (404) counts as done.
async function deleteWebhookMessage(url, id, tries = 3) {
  const r = await fetch(`${url}/messages/${id}`, { method: "DELETE" });
  if (r.status === 429 && tries > 1) {
    const wait = Number((await r.json().catch(() => ({}))).retry_after ?? 2);
    await new Promise((res) => setTimeout(res, Math.ceil(wait * 1000) + 250));
    return deleteWebhookMessage(url, id, tries - 1);
  }
  if (!r.ok && r.status !== 404) throw new Error(`Discord delete ${r.status}: ${clip(await r.text(), 300)}`);
}

const [cmd, ...rest] = process.argv.slice(2);
if (!commands[cmd]) {
  console.error("usage: node scripts/feedback.cjs list | show FB-X | done FB-X \"summary\" | check | emailed [--new FB-A,FB-B] [--digest] | discord [--dry-run] | link FB-X <account|none>");
  process.exit(1);
}
commands[cmd](...rest).catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
