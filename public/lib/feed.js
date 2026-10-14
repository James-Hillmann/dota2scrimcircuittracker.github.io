// The Feed (collection Feed tab, parts/feed.js): newly saved cards and epic or legendary pack
// pulls, newest first. Signed-in players react with emojis and comment on any post; a comment
// on your post leaves you a notice. The collection Worker (workers/steam-auth/src/cosmetics.js)
// stores it all and runs these rules; the browser only renders.
//
// Post ids: "c:<account>:<slot>:<first saved ms>" for a card, "p:<pull key after 'pull:'>" for a
// pack pull (cosmetics.js pullKey). Both name the poster, who gets the comment notices.

import { DOTA_EMOTICONS, dotaEmoticonLabel, dotaEmoticonSrc } from './dota-emoticons.js';

const CORE_REACTIONS = ['❤️', '🔥', '😂', '😮', '👏', '💀', '😡', '😢', '😎', '🤦', '😭', '🏳️'];
// The larger in-game catalog uses its Dota chat code as the stored key. Keeping the original
// twelve Unicode keys first preserves existing reactions and keeps heart the default.
const CORE_DOTA_NAMES = new Set([
  'brood_love', 'bc_fire', 'axe_laugh', 'charm_surprise', 'charm_highfive', 'dead_eyes',
  'charm_rage', 'charm_sad', 'charm_cool', 'charm_facepalm', 'charm_cry', 'gg',
]);
const EXTRA_DOTA_REACTIONS = DOTA_EMOTICONS.filter((name) => !CORE_DOTA_NAMES.has(name));
export const REACTIONS = Object.freeze([...CORE_REACTIONS, ...EXTRA_DOTA_REACTIONS.map((name) => `:${name}:`)]);
// Keep the Unicode values as the stored reaction keys, but draw the matching animated Dota 2
// chat emoticons. These small assets come from the game's panorama/images/emoticons set.
export const REACTION_ART = Object.freeze({
  '❤️': { label: 'Love', src: 'img/emoticons/brood_love.gif', code: ':brood_love:' },
  '🔥': { label: 'Fire', src: 'img/emoticons/bc_fire.gif', code: ':bc_fire:' },
  '😂': { label: 'Laugh', src: 'img/emoticons/axe_laugh.gif', code: ':axe_laugh:' },
  '😮': { label: 'Wow', src: 'img/emoticons/charm_surprise.gif', code: ':charm_surprise:' },
  '👏': { label: 'High five', src: 'img/emoticons/charm_highfive.gif', code: ':charm_highfive:' },
  '💀': { label: 'Dead', src: 'img/emoticons/dead_eyes.gif', code: ':dead_eyes:' },
  '😡': { label: 'Rage', src: 'img/emoticons/charm_rage.gif', code: ':charm_rage:' },
  '😢': { label: 'Sad', src: 'img/emoticons/charm_sad.gif', code: ':charm_sad:' },
  '😎': { label: 'Cool', src: 'img/emoticons/charm_cool.gif', code: ':charm_cool:' },
  '🤦': { label: 'Facepalm', src: 'img/emoticons/charm_facepalm.gif', code: ':charm_facepalm:' },
  '😭': { label: 'Cry', src: 'img/emoticons/charm_cry.gif', code: ':charm_cry:' },
  '🏳️': { label: 'GG', src: 'img/emoticons/gg.gif', code: ':gg:' },
  ...Object.fromEntries(EXTRA_DOTA_REACTIONS.map((name) => [`:${name}:`, {
    label: dotaEmoticonLabel(name), src: dotaEmoticonSrc(name), code: `:${name}:`,
  }])),
});
export const MAX_COMMENT = 280;
export const MAX_COMMENTS = 200;
export const MAX_NOTICES = 30;
export const FEED_PAGE = 15;
// A card saved again within this window, with no reactions or comments yet, updates its post
// instead of adding another, so tweaking a design doesn't flood the feed.
export const REPOST_WINDOW = 30 * 60 * 1000;
// The shortest gap between one player's comments.
export const COMMENT_GAP = 3000;

const POST_RE = /^(c:\d{1,10}:[0-2]:\d{1,15}|p:\d{15}:\d{1,10}:[\w-]{16,80})$/;
export const isPostId = (id) => typeof id === 'string' && POST_RE.test(id);
export function postOwner(id) {
  if (!isPostId(id)) throw new Error('Choose a post.');
  return id.split(':')[id.startsWith('c:') ? 1 : 2];
}

// Reactions: account → the emojis they picked. Picking one again takes it back.
export function toggleReaction(reactions, account, emoji) {
  if (!REACTIONS.includes(emoji)) throw new Error('Choose one of the reactions.');
  const next = { ...(reactions ?? {}) }, mine = new Set(next[account] ?? []);
  if (mine.has(emoji)) mine.delete(emoji); else mine.add(emoji);
  if (mine.size) next[account] = REACTIONS.filter((e) => mine.has(e)); else delete next[account];
  return next;
}
// emoji → the accounts that picked it, in REACTIONS order, empty ones left out.
export function reactionTally(reactions) {
  const out = {};
  for (const e of REACTIONS) {
    const who = Object.entries(reactions ?? {}).filter(([, list]) => list.includes(e)).map(([a]) => a);
    if (who.length) out[e] = who;
  }
  return out;
}
// The one reaction displayed under a post. Ties follow the picker order, so heart wins a tie.
export function topReaction(tally) {
  let top = null, count = 0;
  for (const emoji of REACTIONS) {
    const n = tally?.[emoji]?.length ?? 0;
    if (n > count) { top = emoji; count = n; }
  }
  return top == null ? null : { emoji: top, count };
}

// One line of text: whitespace runs fold to a space; empty or too long is refused.
export function cleanComment(text) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) throw new Error('Write a comment first.');
  if (clean.length > MAX_COMMENT) throw new Error(`Keep comments to ${MAX_COMMENT} characters.`);
  return clean;
}
export function addComment(comments, { account, text, at }) {
  const comment = { id: `${at.toString(36)}-${account}`, account, text: cleanComment(text), at };
  return { comments: [...(comments ?? []), comment].slice(-MAX_COMMENTS), comment };
}
// The writer, the post's owner or Fav can remove a comment.
export function deleteComment(comments, commentId, account, { owner, admin = false }) {
  const c = (comments ?? []).find((x) => x.id === commentId);
  if (!c) throw new Error('That comment is gone.');
  if (c.account !== account && owner !== account && !admin) throw new Error('Only the writer or the post owner can remove a comment.');
  return comments.filter((x) => x !== c);
}

// Notices: the newest MAX_NOTICES, unread until the owner marks them seen.
export const pushNotice = (state, notice) => ({ ...state, notices: [...(state.notices ?? []), notice].slice(-MAX_NOTICES) });
export const unreadNotices = (state) => (state?.notices ?? []).filter((n) => n.at > (state.noticesSeenAt ?? 0));
export const markNoticesSeen = (state, now) => ({ ...state, noticesSeenAt: now });

// Which post a freshly saved card goes in: the slot's last post when it is recent and untouched,
// else a new one.
export function cardPostId(account, slot, now, last) {
  if (last && now - last.at < REPOST_WINDOW && !last.touched) return last.id;
  return `c:${account}:${slot}:${now}`;
}
