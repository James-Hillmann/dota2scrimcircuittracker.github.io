// A baseline filter for Feed posts and comments (lib/feed.js): slurs and explicit sexual terms are
// refused, with common disguises undone first (leetspeak, repeated letters, accents, letters
// spaced or dotted apart). Ordinary swearing is allowed. It is a floor, not a moderator: images
// and clips aren't checked, so Fav removes posts and bans players (cosmetics.js 'ban').

// Stems: a word starting with one is refused. Kept short and specific so normal words don't trip it.
const STEMS = [
  'nigg', 'niga', 'niger', 'nignog', 'faggot', 'fagot', 'fags', 'dyke', 'tranny', 'trannie', 'retard', 'kike', 'chink',
  'spic', 'spick', 'wetback', 'beaner', 'gook', 'coon', 'raghead', 'towelhead', 'sandnig', 'paki', 'gyp', 'shemale',
  'rapist', 'rape', 'raping', 'molest', 'pedophil', 'paedophil', 'pedo', 'loli', 'porn', 'hentai', 'blowjob', 'handjob', 'cum',
  'jizz', 'dildo', 'anal', 'kys', 'killyourself', 'heil',
];
// Stems that are only refused as the whole word (they start ordinary words: spice, cucumber, analysis…).
const WHOLE = new Set(['spic', 'spick', 'coon', 'gyp', 'paki', 'pedo', 'cum', 'anal', 'fags', 'rape', 'kys', 'gook', 'niger', 'heil', 'dyke', 'loli']);
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '!': 'i', '|': 'i', '+': 't' };

const plain = (text) => String(text ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[0134578@$!|+]/g, (c) => LEET[c]);
// Words as letters only, each with letter runs folded to one ("niiice" → "nice") and as written.
function words(text) {
  const base = plain(text);
  const split = base.split(/[^a-z]+/).filter(Boolean);
  // Letters spaced or dotted apart ("k y s", "f.a.g"): runs of one-letter words joined up.
  const joined = base.replace(/\b([a-z])[\s._*-]+(?=[a-z]\b)/g, '$1').split(/[^a-z]+/).filter(Boolean);
  return new Set([...split, ...joined].flatMap((w) => [w, w.replace(/(.)\1+/g, '$1')]));
}
export function blockedTerm(text) {
  for (const w of words(text)) for (const stem of STEMS) {
    if (WHOLE.has(stem) ? w === stem : w.startsWith(stem)) return stem;
  }
  return null;
}
export function checkText(text) {
  if (blockedTerm(text)) throw new Error("That has language the Feed doesn't allow. Reword it and try again.");
  return text;
}
