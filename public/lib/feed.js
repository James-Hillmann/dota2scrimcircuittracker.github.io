// The Feed (collection Feed tab, parts/feed.js): newly saved cards and epic or legendary pack
// pulls, newest first. Signed-in players react with emojis and comment on any post; a comment
// on your post leaves you a notice. The collection Worker (workers/steam-auth/src/cosmetics.js)
// stores it all and runs these rules; the browser only renders.
//
// Post ids: "c:<account>:<slot>:<first saved ms>" for a card, "p:<pull key after 'pull:'>" for a
// pack pull (cosmetics.js pullKey), "u:<account>:<ms>" for a player's own post. All name the
// poster, who gets the comment notices.

import { DOTA_EMOTICONS, dotaEmoticonLabel, dotaEmoticonSrc } from './dota-emoticons.js';
import { checkText } from './moderation.js';

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

const POST_RE = /^(c:\d{1,10}:[0-2]:\d{1,15}|u:\d{1,10}:\d{1,15}|p:\d{15}:\d{1,10}:[\w-]{16,80})$/;
export const isPostId = (id) => typeof id === 'string' && POST_RE.test(id);
export function postOwner(id) {
  if (!isPostId(id)) throw new Error('Choose a post.');
  return id.split(':')[id.startsWith('p:') ? 2 : 1];
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
// Every reaction a post has, most-used first. Ties follow the picker order.
export function rankedReactions(tally) {
  return REACTIONS.filter((e) => tally?.[e]?.length).sort((a, b) => tally[b].length - tally[a].length);
}

// The Feed's filters: which kind of post to show. 'all' shows everything.
export const FEED_TYPES = Object.freeze({
  all: { label: 'Everything', match: () => true },
  posts: { label: 'Posts', match: (p) => p.kind === 'user' },
  clips: { label: 'Clips', match: (p) => p.kind === 'user' && !!p.clip },
  games: { label: 'Games', match: (p) => p.kind === 'user' && !!p.game },
  images: { label: 'Screenshots', match: (p) => p.kind === 'user' && !!p.images?.length },
  cards: { label: 'Card designs', match: (p) => p.kind === 'card' },
  pulls: { label: 'Pack pulls', match: (p) => p.kind === 'pull' },
});
// Newest first; Top by score; Trending by score that fades with age (half after about a day).
export const FEED_SORTS = Object.freeze({ new: 'Newest', trending: 'Trending', top: 'Top' });
export const feedTypeOf = (t) => Object.hasOwn(FEED_TYPES, t) ? t : 'all';
export const feedSortOf = (s) => Object.hasOwn(FEED_SORTS, s) ? s : 'new';
// A post's score: one point per player who reacted, however many emojis they picked, and two per comment.
export function postScore(rawReactions, comments) {
  const reactors = Object.values(rawReactions ?? {}).filter((list) => list?.length).length;
  return reactors + 2 * (comments ?? []).filter((c) => !c.removed).length;
}
export const trendScore = (score, at, now) => score / Math.pow(Math.max(0, now - at) / 3600000 + 2, 1.5);
// Sorts posts carrying .score (and .at) for one Feed sort. Ties go to the newer post.
export function sortFeed(posts, sort, now) {
  const key = sort === 'top' ? (p) => p.score : sort === 'trending' ? (p) => trendScore(p.score, p.at, now) : () => 0;
  return [...posts].sort((a, b) => key(b) - key(a) || b.at - a.at);
}

// One line of text: whitespace runs fold to a space; empty or too long is refused.
export function cleanComment(text) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) throw new Error('Write a comment first.');
  if (clean.length > MAX_COMMENT) throw new Error(`Keep comments to ${MAX_COMMENT} characters.`);
  return checkText(clean);
}
// Threads are one level deep: a comment may carry `reply`, the id of the top-level comment it
// answers. Replying to a reply joins the same thread. `parent` is the comment being answered, so
// the caller can tell its writer.
export function addComment(comments, { account, text, at, reply = null }) {
  const list = comments ?? [];
  let parent = null, thread = null;
  if (reply != null && reply !== '') {
    parent = list.find((x) => x.id === String(reply));
    if (!parent || parent.removed) throw new Error('That comment is gone.');
    thread = parent.reply ?? parent.id;
  }
  const comment = { id: `${at.toString(36)}-${account}`, account, text: cleanComment(text), at, ...(thread ? { reply: thread } : {}) };
  return { comments: [...list, comment].slice(-MAX_COMMENTS), comment, parent };
}
// The writer, the post's owner or Fav can remove a comment. One with replies stays as a
// "removed" placeholder so the thread keeps its place; it goes once its last reply does.
export function deleteComment(comments, commentId, account, { owner, admin = false }) {
  const c = (comments ?? []).find((x) => x.id === commentId);
  if (!c || c.removed) throw new Error('That comment is gone.');
  if (c.account !== account && owner !== account && !admin) throw new Error('Only the writer or the post owner can remove a comment.');
  const hasReplies = (id, list) => list.some((x) => x.reply === id);
  if (!c.reply && hasReplies(c.id, comments)) return comments.map((x) => x === c ? { id: c.id, account: c.account, at: c.at, removed: true } : x);
  const rest = comments.filter((x) => x !== c);
  return c.reply ? rest.filter((x) => !(x.id === c.reply && x.removed && !hasReplies(x.id, rest))) : rest;
}
// Comment reactions work like a post's: account → emojis, stored on the comment.
export function reactToComment(comments, commentId, account, emoji) {
  const c = (comments ?? []).find((x) => x.id === commentId);
  if (!c || c.removed) throw new Error('That comment is gone.');
  const reactions = toggleReaction(c.reactions, account, emoji);
  return comments.map((x) => x === c ? { ...x, reactions } : x);
}
// The comments as threads for display: top-level comments in order, each with its replies. A
// reply whose comment fell off the end of the list shows on its own.
export function commentThreads(comments) {
  const list = comments ?? [], ids = new Set(list.map((c) => c.id));
  return list.filter((c) => !c.reply || !ids.has(c.reply))
    .map((c) => ({ ...c, replies: c.reply ? [] : list.filter((r) => r.reply === c.id) }));
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

// Player posts ("u:<account>:<ms>"): text, up to MAX_IMAGES images, a clip link and a highlighted
// league game, any mix but not empty. The Worker stores each image as its own row and serves it
// at /cosmetics/media/<post>/<n>; the browser shrinks images first (parts/feed-compose.js).
export const MAX_POST_TEXT = 1000;
export const MAX_IMAGES = 4;
// Per image, after the browser shrinks it. A GIF keeps its animation, so it is sent as is.
export const MAX_IMAGE_BYTES = 700 * 1024;
// The shortest gap between one player's posts.
export const POST_GAP = 30 * 1000;
export const userPostId = (account, at) => `u:${account}:${at}`;

// Line breaks stay (three or more fold to two); spaces within a line fold to one.
export function cleanPostText(text) {
  const clean = String(text ?? '').replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/[ \t\f\v]+/g, ' ').trim())
    .join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (clean.length > MAX_POST_TEXT) throw new Error(`Keep posts to ${MAX_POST_TEXT} characters.`);
  return checkText(clean);
}

// Clip links: YouTube, Twitch clips and Streamable play in the post; Medal and Allstar show as a
// link. Anything else is refused, so a post can't point at an arbitrary site.
export function parseClip(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  let u;
  try { u = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`); } catch { throw new Error('That clip link is not a web address.'); }
  const host = u.hostname.replace(/^(www|m)\./, ''), parts = u.pathname.split('/').filter(Boolean);
  let m;
  if (host === 'youtu.be' && /^[\w-]{11}$/.test(parts[0] ?? '')) return { site: 'youtube', id: parts[0] };
  if (host === 'youtube.com') {
    const id = u.searchParams.get('v') ?? (['shorts', 'embed', 'live'].includes(parts[0]) ? parts[1] : null);
    if (/^[\w-]{11}$/.test(id ?? '')) return { site: 'youtube', id };
  }
  if (host === 'clips.twitch.tv' && /^[\w-]{4,100}$/.test(parts[0] ?? '')) return { site: 'twitch', id: parts[0] };
  if (host === 'twitch.tv' && parts[1] === 'clip' && /^[\w-]{4,100}$/.test(parts[2] ?? '')) return { site: 'twitch', id: parts[2] };
  if (host === 'streamable.com' && /^[a-z0-9]{3,20}$/i.test((m = parts[0] === 'e' ? parts[1] : parts[0]) ?? '')) return { site: 'streamable', id: m };
  if (['medal.tv', 'allstar.gg'].includes(host) && parts.length) return { site: host.split('.')[0], url: `https://${host}${u.pathname.replace(/[^\w\-/.]/g, '')}` };
  throw new Error('Clips can be YouTube, Twitch, Streamable, Medal or Allstar links.');
}
// Where a clip plays. Twitch needs the page's own hostname as "parent".
export function clipEmbed(clip, parent) {
  if (clip?.site === 'youtube') return `https://www.youtube-nocookie.com/embed/${clip.id}?autoplay=1`;
  if (clip?.site === 'twitch') return `https://clips.twitch.tv/embed?clip=${encodeURIComponent(clip.id)}&parent=${encodeURIComponent(parent)}&autoplay=true`;
  if (clip?.site === 'streamable') return `https://streamable.com/e/${clip.id}?autoplay=1`;
  return null;
}
export function clipLink(clip) {
  if (clip?.site === 'youtube') return `https://www.youtube.com/watch?v=${clip.id}`;
  if (clip?.site === 'twitch') return `https://clips.twitch.tv/${encodeURIComponent(clip.id)}`;
  if (clip?.site === 'streamable') return `https://streamable.com/${clip.id}`;
  return clip?.url ?? null;
}

// An image's real type from its first bytes; anything else (SVG, HTML…) is refused.
export function imageType(bytes) {
  const b = bytes ?? [];
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}

// The stored post, from what the browser sent. images is the decoded bytes of each image.
export function buildUserPost({ account, at, text, clip, game, images = [] }) {
  const body = cleanPostText(text), parsed = parseClip(clip);
  if (images.length > MAX_IMAGES) throw new Error(`Add up to ${MAX_IMAGES} images.`);
  const media = images.map((bytes) => {
    const type = imageType(bytes);
    if (!type) throw new Error('Images can be JPEG, PNG, GIF or WebP.');
    if (bytes.length > MAX_IMAGE_BYTES) throw new Error(`Each image must be under ${Math.round(MAX_IMAGE_BYTES / 1024)} KB.`);
    return { type, size: bytes.length };
  });
  const match = game == null || game === '' ? null : String(game);
  if (match != null && !/^\d{1,20}$/.test(match)) throw new Error('Choose one of your games.');
  if (!body && !parsed && !match && !media.length) throw new Error('Write something, or add an image, clip or game.');
  return { kind: 'user', account, at, text: body, ...(parsed ? { clip: parsed } : {}), ...(match ? { game: match } : {}), ...(media.length ? { images: media } : {}) };
}
// The poster can remove any of their own posts (saved cards and pulls included); Fav can remove any post.
export function canRemovePost(id, account, admin = false) {
  return isPostId(id) && (admin || postOwner(id) === String(account));
}

// Auto-posts: what each player lets the Worker post for them (their profile's Feed tab). Stored on
// their collection as `feedAuto`; changes decide future posts only. The defaults are what always
// posted before the setting existed.
export const PULL_RARITIES = ['common', 'rare', 'epic', 'legendary'];
export const FEED_AUTO_DEFAULT = Object.freeze({ cards: true, rarities: Object.freeze(['epic', 'legendary']), screens: false });
export function feedAutoOf(state) {
  const a = state?.feedAuto ?? {};
  return {
    cards: typeof a.cards === 'boolean' ? a.cards : FEED_AUTO_DEFAULT.cards,
    rarities: Array.isArray(a.rarities) ? PULL_RARITIES.filter((r) => a.rarities.includes(r)) : [...FEED_AUTO_DEFAULT.rarities],
    screens: typeof a.screens === 'boolean' ? a.screens : FEED_AUTO_DEFAULT.screens,
  };
}
export function setFeedAuto(state, { cards, rarities, screens } = {}) {
  if (typeof cards !== 'boolean' || typeof screens !== 'boolean') throw new Error('Choose on or off for each kind.');
  if (!Array.isArray(rarities) || rarities.some((r) => !PULL_RARITIES.includes(r))) throw new Error('Choose rarities from common, rare, epic and legendary.');
  return { ...state, feedAuto: { cards, rarities: PULL_RARITIES.filter((r) => rarities.includes(r)), screens } };
}
// What a freshly opened pack posts: the cards of the rarities switched on, and the loading screens
// when those are on. Null when there's nothing to post.
export function pullPost(rewards, screens, auto, rarityOf) {
  const items = (rewards ?? []).map((r) => r.key).filter((k) => auto.rarities.includes(rarityOf(k)));
  const shown = auto.screens ? [...(screens ?? [])] : [];
  return items.length || shown.length ? { items, ...(shown.length ? { screens: shown } : {}) } : null;
}

// Bans: Fav stops a player posting, commenting or reacting, any mix of the three. Stored on the
// vault as one "feed-bans" row: account → { at, until, scope } (until null = until lifted; a row
// with no scope, from before scopes, bans all three).
export const BAN_SCOPES = ['post', 'comment', 'react'];
export const BAN_LABELS = { post: 'posts', comment: 'comments', react: 'reactions' };
export function setBan(bans, target, banned, { at, days = null, scope = BAN_SCOPES } = {}) {
  const who = String(target ?? '');
  if (!/^\d{1,10}$/.test(who)) throw new Error('Choose a player.');
  const next = { ...(bans ?? {}) };
  if (!banned) { delete next[who]; return next; }
  const kinds = BAN_SCOPES.filter((k) => Array.isArray(scope) && scope.includes(k));
  if (!kinds.length) throw new Error('Choose what to ban them from.');
  next[who] = { at, until: days ? at + days * 86400000 : null, scope: kinds };
  return next;
}
export const banScope = (b) => (Array.isArray(b?.scope) && b.scope.length ? b.scope : BAN_SCOPES);
// Banned at all (no kind), or from that kind of action.
export const isBanned = (bans, account, now, kind = null) => {
  const b = bans?.[String(account)];
  return !!b && (b.until == null || b.until > now) && (kind == null || banScope(b).includes(kind));
};

// Following: everyone in the league is followed to start with. Unfollowing a player hides their
// posts (their own, saved cards and pulls) from your Feed; following again brings them back.
// Stored on your collection as `unfollowed`, newest last.
export const MAX_UNFOLLOWED = 500;
export function setFollow(state, account, target, follow) {
  const who = String(target ?? '');
  if (!/^\d{1,10}$/.test(who)) throw new Error('Choose a player.');
  if (who === String(account)) throw new Error("You can't unfollow yourself.");
  const rest = (state.unfollowed ?? []).filter((a) => a !== who);
  return { ...state, unfollowed: follow ? rest : [...rest, who].slice(-MAX_UNFOLLOWED) };
}
export const isFollowing = (state, target) => !(state?.unfollowed ?? []).includes(String(target));
