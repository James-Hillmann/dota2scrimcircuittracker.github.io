// Packs Fav gifts to players. Only the admin account can send them; the Worker checks the
// sender against the verified Steam sign-in, so the button showing in a browser grants nothing.
// The recipient's state keeps unseen gifts in `gifts` until they dismiss the notice.
import { TIERS } from './cosmetics-catalog.js';

export const ADMIN_ACCOUNT = '173365627';
export const MAX_GIFT_PACKS = 10;
const MAX_NOTE = 120;
export const isAdmin = account => String(account ?? '') === ADMIN_ACCOUNT;

export function giftPacks(state, { tier = 'common', count = 1, note = '' } = {}, now = Date.now()) {
  if (!TIERS.includes(tier)) throw new Error('Choose a pack rarity.');
  if (!Number.isInteger(count) || count < 1 || count > MAX_GIFT_PACKS) throw new Error(`Gift 1 to ${MAX_GIFT_PACKS} packs.`);
  const text = String(note ?? '').replace(/\s+/g, ' ').trim();
  if ([...text].length > MAX_NOTE || /[\u0000-\u001f\u007f<>]/.test(text)) throw new Error(`Notes are up to ${MAX_NOTE} characters, plain text.`);
  return {
    ...state,
    packs: [...(state.packs ?? []), ...Array(count).fill(tier)],
    gifts: [...(state.gifts ?? []), { tier, count, note: text || null, at: now }].slice(-20),
  };
}

export function clearGifts(state) {
  const { gifts, ...rest } = state;
  return rest;
}

// "2 Epic packs" / "a Common pack"
export function giftLabel({ tier, count }) {
  const name = tier[0].toUpperCase() + tier.slice(1);
  return count === 1 ? `a${/^[aeiou]/i.test(name) ? 'n' : ''} ${name} pack` : `${count} ${name} packs`;
}
