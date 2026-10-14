// Gifts from Fav to players. Only the admin account can send them; the Worker checks the
// sender against the verified Steam sign-in, so the button showing in a browser grants nothing.
// The recipient's state keeps unseen gifts in `gifts` until they dismiss the notice.
// A gift is one of: packs (any card rarity, or a loading screen pack), copies of one card item
// (border, finish, signature, name rendering), or one loading screen.
import { TIERS, itemByKey } from './cosmetics-catalog.js';
import { SCREEN_ART } from './screen-art-data.js';

export const ADMIN_ACCOUNT = '173365627';
export const MAX_GIFT_PACKS = 10;
export const GIFT_PACKS = [...TIERS, 'screens'];
const MAX_NOTE = 120;
export const isAdmin = account => String(account ?? '') === ADMIN_ACCOUNT;

export function giftPacks(state, { kind = 'pack', tier = 'common', item = null, count = 1, note = '' } = {}, now = Date.now()) {
  const text = String(note ?? '').replace(/\s+/g, ' ').trim();
  if ([...text].length > MAX_NOTE || /[\u0000-\u001f\u007f<>]/.test(text)) throw new Error(`Notes are up to ${MAX_NOTE} characters, plain text.`);
  const record = { kind, count: 1, note: text || null, at: now };
  const next = { ...state };
  if (kind === 'screen') {
    if (!SCREEN_ART.some((s) => s.id === item)) throw new Error('Choose a loading screen.');
    if ((state.screens ?? []).includes(item)) throw new Error('They already have that loading screen.');
    next.screens = [...(state.screens ?? []), item];
    record.item = item;
  } else {
    if (!Number.isInteger(count) || count < 1 || count > MAX_GIFT_PACKS) throw new Error(`Gift 1 to ${MAX_GIFT_PACKS} at a time.`);
    record.count = count;
    if (kind === 'item') {
      if (!itemByKey(item)) throw new Error('Choose a card item.');
      next.inventory = { ...state.inventory, [item]: (state.inventory?.[item] ?? 0) + count };
      record.item = item;
    } else if (kind === 'pack') {
      if (!GIFT_PACKS.includes(tier)) throw new Error('Choose a pack type.');
      next.packs = [...(state.packs ?? []), ...Array(count).fill(tier)];
      record.tier = tier;
    } else throw new Error('Choose what to gift.');
  }
  next.gifts = [...(state.gifts ?? []), record].slice(-20);
  return next;
}

export function clearGifts(state) {
  const { gifts, ...rest } = state;
  return rest;
}

const capital = (s) => s[0].toUpperCase() + s.slice(1);
const article = (s) => `a${/^[aeiou]/i.test(s) ? 'n' : ''} ${s}`;
const ITEM_TYPES = { border: 'border', finish: 'finish', autograph: 'signature', translation: 'modifier' };
// "2 Epic packs" / "a loading screen pack" / "the Gold border" / "the Chemical Rage loading screen"
export function giftLabel({ kind = 'pack', tier, item, count = 1 }) {
  if (kind === 'screen') return `the ${SCREEN_ART.find((s) => s.id === item)?.label ?? 'new'} loading screen`;
  if (kind === 'item') {
    const it = itemByKey(item), name = `${it?.name ?? 'card'} ${ITEM_TYPES[it?.type] ?? 'item'}`;
    return count === 1 ? `the ${name}` : `${count} × the ${name}`;
  }
  const name = tier === 'screens' ? 'loading screen pack' : `${capital(tier)} pack`;
  return count === 1 ? article(name) : `${count} ${name}s`;
}
