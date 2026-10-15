// Mentions in Feed posts and comments: "@" then a player or a team from the league rosters
// (parts/feed-mentions.js suggests them as you type, parts/feed.js draws them as links). The text
// keeps each as "@[Name](p:<account>)" or "@[Team](t:<league>:<team id>)", so the name shown is the
// one picked. The collection Worker (workers/steam-auth/src/cosmetics.js, pingTargets) leaves each
// pinged player a notice. A team ping reaches its whole roster: the browser sends those accounts,
// since the Worker has no rosters, and the Worker only takes them when the text names a team.

// Same as players.js nameKey, kept here so the Worker doesn't bundle the name matcher.
const nameKey = (s) => (s ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');

export const MAX_PINGS = 25;
const MAX_NAME = 40;
const TOKEN = String.raw`@\[([^\[\]()\n]{1,${MAX_NAME}})\]\((p:\d{1,10}|t:[a-z0-9-]{1,20}:\d{1,10})\)`;
const tokens = () => new RegExp(TOKEN, 'g');

// A name as it may sit inside a token.
export const mentionName = (s) => String(s ?? '').replace(/[[\]()\n]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);

export function mentionToken(entry) {
  const name = mentionName(entry.name);
  return entry.kind === 'p' ? `@[${name}](p:${entry.account})` : `@[${name}](t:${entry.league}:${entry.id})`;
}

// The text in pieces: strings, and { kind: 'p', name, account } or { kind: 't', name, league, id }.
export function mentionParts(text) {
  const s = String(text ?? ''), parts = [], re = tokens();
  let from = 0, m;
  while ((m = re.exec(s))) {
    if (m.index > from) parts.push(s.slice(from, m.index));
    const [kind, a, b] = m[2].split(':');
    parts.push(kind === 'p' ? { kind, name: m[1], account: a } : { kind, name: m[1], league: a, id: b });
    from = re.lastIndex;
  }
  if (from < s.length) parts.push(s.slice(from));
  return parts;
}

// The text as read: "@Name" for each mention. Lengths are counted on this.
export const plainMentions = (text) => String(text ?? '').replace(tokens(), '@$1');

// The roster players and teams to suggest, from every division's teams (core.js SOURCES.all).
// A player on two rosters is listed once.
export function mentionDirectory(teams) {
  const out = [], seen = new Set();
  for (const t of teams ?? []) {
    const members = t.players.map((p) => String(p.account_id)).filter((a) => /^\d{1,10}$/.test(a));
    out.push({ kind: 't', name: mentionName(t.name), league: t.league, id: t.id, sub: t.division ?? '', members, key: nameKey(t.name) });
    for (const p of t.players) {
      const account = String(p.account_id);
      if (!/^\d{1,10}$/.test(account) || seen.has(account)) continue;
      seen.add(account);
      out.push({ kind: 'p', name: mentionName(p.name), account, sub: t.name, members: [account], key: nameKey(p.name) });
    }
  }
  return out.filter((e) => e.name && e.key);
}

// The "@query" just before the caret and the entries it matches: names starting with it first,
// then names with a word starting with it. Spaces are allowed ("@No Imm"), but a name already
// typed out in full with a space after it is done.
export function mentionCompletion(value, caret, directory, limit = 8) {
  const before = String(value ?? '').slice(0, caret);
  const m = before.match(/(^|[\s(])@([^@\n[\]()]{0,30})$/);
  if (!m) return null;
  const query = m[2], key = nameKey(query);
  if (/\s$/.test(query) && directory.some((e) => e.key === key)) return null;
  const words = (e) => e.name.toLowerCase().split(/[\s._-]+/).map(nameKey);
  const first = [], second = [];
  for (const e of directory) {
    if (e.key.startsWith(key)) first.push(e);
    else if (key && words(e).some((w) => w.startsWith(key))) second.push(e);
  }
  const byName = (a, b) => a.name.localeCompare(b.name);
  const matches = [...first.sort(byName), ...second.sort(byName)].slice(0, limit);
  return matches.length ? { start: caret - query.length - 1, end: caret, query, matches } : null;
}

// Puts "@Name " in place of the query; the token is only written on send (encodeMentions).
export function insertMention(value, completion, entry) {
  const text = String(value ?? ''), inserted = `@${entry.name} `;
  return { value: text.slice(0, completion.start) + inserted + text.slice(completion.end), caret: completion.start + inserted.length };
}

// The text to send: each "@Name" picked from the suggestions becomes its token (longest names
// first, so "@Brown Bear" wins over "@Brown"), and `pings` is every account they reach.
export function encodeMentions(text, picked = []) {
  let out = String(text ?? '');
  const used = [];
  const list = [...new Map(picked.map((e) => [mentionToken(e), e])).values()].sort((a, b) => b.name.length - a.name.length);
  for (const e of list) {
    const plain = `@${e.name}`, token = mentionToken(e);
    let i = 0, hit = false;
    while ((i = out.indexOf(plain, i)) !== -1) {
      const next = out[i + plain.length];
      if (next != null && /[\p{L}\p{N}_]/u.test(next)) { i += plain.length; continue; }
      out = out.slice(0, i) + token + out.slice(i + plain.length);
      i += token.length; hit = true;
    }
    if (hit) used.push(e);
  }
  const pings = [...new Set(used.flatMap((e) => e.members))].slice(0, MAX_PINGS);
  return { text: out, pings };
}

// Who a post or comment pings (the Worker): the players it names, and the accounts the browser
// sent for its teams when it names one. Never the writer; at most MAX_PINGS.
export function pingTargets(text, sent, writer) {
  const parts = mentionParts(text).filter((p) => typeof p !== 'string');
  const named = parts.filter((p) => p.kind === 'p').map((p) => p.account);
  const teams = parts.some((p) => p.kind === 't') && Array.isArray(sent) ? sent.map(String).filter((a) => /^\d{1,10}$/.test(a)) : [];
  return [...new Set([...named, ...teams])].filter((a) => a !== String(writer)).slice(0, MAX_PINGS);
}
