// Player card packs for Fantasy: the bare bones, not wired to the site or the collection Worker yet.
// A pack pulls three league players' cards. A card's rarity comes from the player's tier, and
// rarities roll with the cosmetics packs' odds (cosmetics-catalog.js PACK_ODDS), skipping any
// rarity no player has. Pulled cards count in the inventory as player:<account>.
// Still to decide before it goes live: which league's pool a pack draws from, whether the
// community's card ratings (card-ratings.js) should feed rarity, and what pulled cards unlock.
import { TIERS, PACK_ODDS } from './cosmetics-catalog.js';

export const TIER_RARITY = { S: 'legendary', A: 'epic', B: 'rare', C: 'common', D: 'common' };

// The pool: one entry per tiered player.
export function playerCardPool(tiers) {
  return [...tiers].filter(([, t]) => TIER_RARITY[t?.tier]).map(([account, t]) => ({ account: String(account), rarity: TIER_RARITY[t.tier] }));
}

export function rollPlayerPack(pool, random = Math.random) {
  const groups = TIERS.map((rarity) => ({ rarity, weight: PACK_ODDS[rarity], cards: pool.filter((c) => c.rarity === rarity) })).filter((g) => g.cards.length);
  if (!groups.length) throw new Error('No player cards to pull yet.');
  const total = groups.reduce((s, g) => s + g.weight, 0), pulls = [];
  for (let n = 0; n < 3; n++) {
    let r = random() * total, group = groups.at(-1);
    for (const g of groups) { r -= g.weight; if (r < 0) { group = g; break; } }
    const card = group.cards[Math.min(group.cards.length - 1, Math.floor(random() * group.cards.length))];
    pulls.push({ key: `player:${card.account}`, account: card.account, rarity: card.rarity });
  }
  return pulls;
}

export function addPlayerCards(state, pulls) {
  const inventory = { ...(state.inventory ?? {}) };
  const rewards = pulls.map((p) => { const duplicate = (inventory[p.key] ?? 0) > 0; inventory[p.key] = (inventory[p.key] ?? 0) + 1; return { ...p, duplicate }; });
  return { state: { ...state, inventory }, rewards };
}
