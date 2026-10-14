// Card ratings: signed-in players rate other players' saved card designs common, rare, epic or
// legendary. Votes belong to a design, not a card slot: designKey fingerprints the saved design,
// so changing a card starts it at no votes, and changing it back brings its old votes back.
// The collection Worker (workers/steam-auth/src/cosmetics.js) stores them, one per voter.

export const RATINGS = ['common', 'rare', 'epic', 'legendary'];

// A stable text form (keys sorted) of a saved design, hashed. Not a security boundary: the Worker
// computes it from the stored design, never from the browser.
const stable = (v) => Array.isArray(v) ? `[${v.map(stable).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`
  : JSON.stringify(v ?? null);
export function designKey(design) {
  const text = stable(design);
  let a = 0x811c9dc5, b = 0x01000193 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0; b ^= b >>> 13;
  }
  return a.toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

// One vote per voter: a new rating replaces theirs, null takes it back.
export function castVote(votes, voter, rating) {
  if (rating != null && !RATINGS.includes(rating)) throw new Error('Choose common, rare, epic or legendary.');
  const next = { ...(votes ?? {}) };
  if (rating == null) delete next[voter]; else next[voter] = rating;
  return next;
}

// Counts per rating, the total, and the community's pick: the most votes, ties to the rarer.
export function tally(votes) {
  const counts = Object.fromEntries(RATINGS.map((r) => [r, 0]));
  for (const r of Object.values(votes ?? {})) if (r in counts) counts[r]++;
  const total = RATINGS.reduce((s, r) => s + counts[r], 0);
  const pick = total ? RATINGS.reduce((best, r) => (counts[r] >= counts[best] ? r : best), RATINGS[0]) : null;
  return { counts, total, pick };
}
