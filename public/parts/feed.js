// The Feed tab of the collection (lib/feed.js): players' own posts (text, images, clips and
// highlighted games, parts/feed-compose.js), newly saved cards and epic or legendary pack pulls,
// newest first, loading more as you scroll. Signed-in players react with emojis and comment on
// any post. collection.js passes in its swatch drawing and the viewer.
import { esc, dur, SOURCES, allLoad } from '../core.js';
import { listCards } from '../lib/store.js';
import { feedPosts, feedMediaUrl, collectionState, cardRatings, myCardVotes } from '../lib/cosmetics.js';
import { designKey } from '../lib/card-ratings.js';
import { mountRating } from './card-rating.js';
import { shownNickname } from '../lib/cosmetics-engine.js';
import { itemByKey } from '../lib/cosmetics-catalog.js';
import { REACTIONS, REACTION_ART, topReaction, rankedReactions, reactionTally, commentThreads, MAX_COMMENT, clipEmbed, clipLink, canRemovePost, feedAutoOf, PULL_RARITIES, BAN_SCOPES, BAN_LABELS, banScope } from '../lib/feed.js';
import { screenArt } from '../lib/card-art.js';
import { playerLine, gameAchievements } from '../lib/highlights.js';
import { heroImg } from '../lib/hero-meta.js';
import { composerHtml, wireComposer } from './feed-compose.js';
import { dotaEmoticonSrc, dotaEmoticonLabel, emoticonParts, emoticonCompletion, insertEmoticon } from '../lib/dota-emoticons.js';
import { isAdmin } from '../lib/pack-gifts.js';
import { createPlayerCards, PAINT_FILTER, wirePlayerCards } from './player-card.js';
import { steamName } from './me.js';
import { strangerNames } from '../lib/scout.js';

// Loading screens in pull posts, in the colour of the screen pack.
const SCREEN_COLOR = '#7fd6c2';
// Your profile's auto-post settings: what the Worker posts for you from now on.
const autoFormHtml = (auto) => `<form class="feed-auto"><fieldset><legend>Auto-post to my feed</legend>
  <label><input type="checkbox" name="cards"${auto.cards ? ' checked' : ''}> New card designs</label>
  <span class="feed-auto-group">Pack pulls: ${PULL_RARITIES.map((r) => `<label><input type="checkbox" name="rarity-${r}"${auto.rarities.includes(r) ? ' checked' : ''}> ${r}</label>`).join('')}</span>
  <label><input type="checkbox" name="screens"${auto.screens ? ' checked' : ''}> Loading screens</label>
  <small class="feed-auto-note" role="status" aria-live="polite">Changes apply to new posts. Old posts stay until you delete them.</small></fieldset></form>`;

// account: one player's Feed (their profile's Feed tab, collection.js mountProfileFeed): only their
// posts, no post box, and on your own profile your auto-post settings (lib/feed.js feedAutoOf).
export async function drawFeed(body, { viewer, signIn, action, swatch, colors, typeLabel, ago, focus = null, account = null }) {
  const token = {}; body._feedToken = token;
  body.innerHTML = '<p>Loading feed…</p>';
  let first, focused = null, teams, matches, overrides;
  try {
    [first, focused, teams, matches, overrides] = await Promise.all([feedPosts({ account }), focus ? feedPosts({ post: focus }).catch(() => null) : null,
      SOURCES.all.data().then((d) => d.teams).catch(() => []), allLoad().catch(() => []), listCards().catch(() => new Map())]);
  } catch (e) { body.innerHTML = `<p>${esc(e.message)}</p>`; return; }
  if (!body.isConnected || body._feedToken !== token || body.dataset.collectionView !== 'feed') return;
  const me = viewer == null ? null : String(viewer), admin = isAdmin(viewer);
  const roster = new Map(teams.flatMap((t) => t.players.map((p) => [String(p.account_id), { name: p.name, team: t.name, league: t.league }])));
  const renderer = createPlayerCards(matches, { cards: overrides, teams });
  const nicknames = { ...first.nicknames, ...focused?.nicknames };
  // Players on no roster go by their Steam name (lib/scout.js); later pages fall back to it as known.
  const shown = [...(first.posts ?? []), ...(focused?.posts ?? [])].flatMap((p) => [p.account, ...(p.comments ?? []).map((c) => c.account)]);
  const strangers = await strangerNames([...new Set(shown.map(String))].filter((a) => !roster.has(a) && !nicknames[a])).catch(() => new Map());
  if (!body.isConnected || body._feedToken !== token) return;
  const nameOf = (a) => nicknames[a] ?? roster.get(String(a))?.name ?? strangers.get(String(a)) ?? steamName(Number(a)) ?? `Player ${a}`;
  const who = (a) => `<a href="${SOURCES[roster.get(String(a))?.league]?.root ?? '#/all'}/player/${a}">${esc(nameOf(a))}</a>`;
  const when = (at) => `<time datetime="${new Date(at).toISOString()}" title="${new Date(at).toLocaleString()}">${ago(at)}</time>`;
  const posts = new Map();
  // Players you unfollowed (lib/feed.js setFollow): their posts stay out of your Feed.
  if (me != null && !collectionState()) await action('session').catch(() => null);
  if (!body.isConnected || body._feedToken !== token) return;
  // A profile's Feed shows that player whether you follow them or not.
  const unfollowed = new Set((account == null && me != null && collectionState()?.unfollowed) || []);
  // A post's header buttons: Delete (yours, or any for Fav), Unfollow, and Ban for Fav.
  const toolsHtml = (p) => {
    if (me == null) return '';
    const other = String(p.account) !== me, out = [];
    if (canRemovePost(p.id, me, admin)) out.push('<button type="button" class="link-btn" data-remove-post>Delete</button>');
    if (other && account == null) out.push(`<button type="button" class="link-btn" data-unfollow="${esc(p.account)}" title="Hide ${esc(nameOf(p.account))}'s posts from your Feed">Unfollow</button>`);
    if (other && admin) out.push(`<button type="button" class="link-btn feed-ban" data-ban="${esc(p.account)}" data-ban-from="post">Ban</button>`);
    return out.length ? ` <span class="feed-tools">${out.join('')}</span>` : '';
  };

  const reactionIcon = (e) => {
    const art = REACTION_ART[e];
    return art ? `<img src="${art.src}" alt="${e}" draggable="false" loading="lazy">` : e;
  };
  const reactionButton = (e, list, cls = '') => {
    const mine = me != null && list.includes(me), art = REACTION_ART[e];
    return `<button type="button" class="${cls}" data-react="${e}" aria-label="${art?.label ?? e}${list.length ? `, ${list.length}` : ''}" aria-pressed="${mine}"${list.length ? ` title="${esc(list.map(nameOf).join(', '))}"` : ''}>${reactionIcon(e)}${list.length ? `<span>${list.length}</span>` : ''}</button>`;
  };
  // Every reaction on the post, most-used first. fitReacts caps the row at two lines.
  const reactsHtml = (p) => rankedReactions(p.reactions).map((e) => reactionButton(e, p.reactions[e])).join('');
  // Past two lines, the last chips hide behind a "+N" chip that shows them all.
  const fitReacts = (box) => {
    box.querySelector('[data-reacts-more]')?.remove();
    const chips = [...box.querySelectorAll('[data-react]')];
    chips.forEach((c) => { c.hidden = false; });
    if (box.dataset.open || !chips.length) return;
    const tops = [...new Set(chips.map((c) => c.offsetTop))];
    if (tops.length <= 2) return;
    const more = document.createElement('button');
    more.type = 'button'; more.dataset.reactsMore = ''; more.className = 'feed-reacts-more';
    box.append(more);
    let shown = chips.filter((c) => c.offsetTop <= tops[1]);
    chips.filter((c) => !shown.includes(c)).forEach((c) => { c.hidden = true; });
    const label = () => { const n = chips.length - shown.length; more.textContent = `+${n}`; more.setAttribute('aria-label', `Show ${n} more reactions`); };
    label();
    while (more.offsetTop > tops[1] && shown.length) { shown.pop().hidden = true; label(); }
  };
  const fitAllReacts = () => body.querySelectorAll('.feed-reacts').forEach(fitReacts);
  // The button shows your reaction on the post: the one you picked last, else heart. A tap
  // toggles the reaction it shows. Holding it opens all the Dota reactions. A comment's button
  // works the same way but falls back to its most-used reaction, so a tap adds to the crowd.
  const lastReaction = new Map();
  const shownReaction = (key, tally, fallback = '❤️') => {
    const mine = me == null ? [] : REACTIONS.filter((e) => tally[e]?.includes(me));
    const last = lastReaction.get(key);
    return mine.includes(last) ? last : mine.at(-1) ?? fallback;
  };
  const reactionControlHtml = (p) => {
    const e = shownReaction(p.id, p.reactions), list = p.reactions[e] ?? [], on = me != null && list.includes(me);
    const label = REACTION_ART[e]?.label ?? e;
    return `<div class="feed-react-control">
      <button type="button" class="feed-react-main" data-react-main="${e}" aria-label="${on ? `Remove ${label}` : 'Love this post'}; hold for more reactions" aria-pressed="${on}" aria-haspopup="menu" aria-expanded="false" title="${on ? `You reacted ${label} · click to remove` : 'Click to love'} · hold for Dota reactions">${reactionIcon(e)}${list.length ? `<span>${list.length}</span>` : ''}</button>
      <div class="feed-react-picker" role="menu" aria-label="Choose a Dota reaction" hidden></div>
    </div>`;
  };
  const commentReactHtml = (p, c) => {
    const tally = reactionTally(c.reactions), e = shownReaction(`${p.id} ${c.id}`, tally, topReaction(tally)?.emoji);
    const list = tally[e] ?? [], on = me != null && list.includes(me), label = REACTION_ART[e]?.label ?? e;
    const others = Object.entries(tally).filter(([x]) => x !== e).reduce((n, [, l]) => n + l.length, 0);
    const tip = Object.entries(tally).map(([x, l]) => `${REACTION_ART[x]?.label ?? x}: ${l.map(nameOf).join(', ')}`).join('\n');
    return `<div class="feed-react-control feed-comment-react${list.length ? '' : ' feed-comment-react-none'}">
      <button type="button" class="feed-react-main" data-react-main="${e}" aria-label="${on ? `Remove ${label}` : `React ${label}`}; hold for more reactions" aria-pressed="${on}" aria-haspopup="menu" aria-expanded="false" title="${tip ? `${esc(tip)}\n` : ''}${on ? 'Click to remove' : 'Click to react'} · hold for Dota reactions">${reactionIcon(e)}${list.length ? `<span>${list.length}</span>` : ''}${others ? `<small>+${others}</small>` : ''}</button>
      <div class="feed-react-picker" role="menu" aria-label="Choose a Dota reaction" hidden></div>
    </div>`;
  };
  const commentTextHtml = (text) => emoticonParts(text).map((part) => typeof part === 'string' ? esc(part)
    : `<img class="feed-inline-emote" src="${dotaEmoticonSrc(part.name)}" alt=":${esc(part.name)}:" title="${esc(dotaEmoticonLabel(part.name))}" loading="lazy">`).join('');
  // Threads are one level deep (lib/feed.js commentThreads): replies sit under their comment. A
  // removed comment that still has replies shows as a placeholder.
  const commentLineHtml = (p, c) => c.removed ? `<div class="feed-comment feed-comment-removed"><em>Comment removed</em></div>`
    : `<div class="feed-comment">${who(c.account)} <span class="feed-text">${commentTextHtml(c.text)}</span> ${when(c.at)}${commentReactHtml(p, c)}${me != null ? ` <button type="button" class="link-btn" data-reply-to="${esc(c.id)}">Reply</button>` : ''}${me != null && (c.account === me || p.account === me || admin) ? ' <button type="button" class="link-btn" data-remove>Remove</button>' : ''}${admin && c.account !== me ? ` <button type="button" class="link-btn feed-ban" data-ban="${esc(c.account)}" data-ban-from="comment">Ban</button>` : ''}</div>`;
  const threadsHtml = (p) => {
    const threads = commentThreads(p.comments);
    return threads.length ? `<ol>${threads.map((c) => `<li data-comment="${esc(c.id)}">${commentLineHtml(p, c)}${c.replies.length ? `<ol class="feed-replies">${c.replies.map((r) => `<li data-comment="${esc(r.id)}">${commentLineHtml(p, r)}</li>`).join('')}</ol>` : ''}</li>`).join('')}</ol>` : '';
  };
  const replyFormHtml = (reply = null) => `<form class="feed-reply${reply ? ' feed-reply-thread' : ''}"${reply ? ` data-reply="${esc(reply.id)}"` : ''}><div class="feed-reply-compose"><input name="text" maxlength="${MAX_COMMENT}" placeholder="${reply ? `Reply to ${esc(nameOf(reply.account))}` : 'Add a comment'} · type : for Dota emoticons" aria-label="${reply ? 'Write a reply' : 'Add a comment'}" aria-autocomplete="list" aria-expanded="false" autocomplete="off" required><div class="feed-emote-suggest" role="listbox" aria-label="Dota emoticon suggestions" hidden></div></div><button type="submit">${reply ? 'Reply' : 'Post'}</button></form>`;
  const commentsHtml = (p) => `<div class="feed-threads">${threadsHtml(p)}</div>
    ${me == null ? '<p class="feed-signin"><button type="button" class="linkish" data-signin>Sign in with Steam</button> to react and comment.</p>' : replyFormHtml()}`;
  const badgesHtml = (list) => list.map((a) => `<span class="feed-badge feed-badge-${a.tier}" title="${esc(a.tip)}">${esc(a.label)}</span>`).join('');
  const byId = new Map(matches.map((m) => [String(m.id), m]));
  // A highlighted game: the poster's hero and line, the result, and the badges it earned.
  function gameHtml(p) {
    const m = byId.get(p.game), line = m && playerLine(m, p.account);
    if (!line) return `<p class="feed-game feed-game-missing">Highlighted game ${esc(p.game)} (not in this season's data).</p>`;
    const won = line.team === m.winner, opp = line.team === 'a' ? m.team_b : m.team_a, img = heroImg(line.hero);
    return `<a class="feed-game${won ? ' feed-game-won' : ''}" href="${SOURCES.all.link(m)}">
      ${img ? `<img src="${img}" alt="" loading="lazy">` : ''}
      <span class="feed-game-main"><strong>${esc(line.hero)} · ${line.kills}/${line.deaths}/${line.assists}</strong>
        <small>${won ? 'Won' : 'Lost'} vs ${esc(opp ?? 'unknown')}${m.duration_sec ? ` · ${dur(m.duration_sec)}` : ''} · ${line.gpm ?? '–'} GPM · ${((line.hero_damage ?? 0) / 1000).toFixed(1)}k damage</small>
        <span class="feed-badges">${badgesHtml(gameAchievements(matches, m, p.account))}</span></span></a>`;
  }
  // A clip waits behind a play button so a long feed doesn't load every player.
  function clipHtml(clip) {
    const embed = clipEmbed(clip, location.hostname), site = { youtube: 'YouTube', twitch: 'Twitch', streamable: 'Streamable', medal: 'Medal', allstar: 'Allstar' }[clip.site];
    if (!embed) return `<a class="feed-clip feed-clip-link" href="${esc(clipLink(clip))}" target="_blank" rel="noopener noreferrer">▶ Watch the clip on ${site} ↗</a>`;
    const thumb = clip.site === 'youtube' ? `<img src="https://i.ytimg.com/vi/${clip.id}/hqdefault.jpg" alt="" loading="lazy">` : '';
    return `<button type="button" class="feed-clip" data-play-clip="${esc(embed)}" aria-label="Play the ${site} clip">${thumb}<span class="feed-clip-play">▶</span><small>${site} clip</small></button>`;
  }
  const postTextHtml = (text) => text ? `<p class="feed-post-text">${commentTextHtml(text).replace(/\n/g, '<br>')}</p>` : '';
  function userPostHtml(p) {
    const imgs = p.images ?? [];
    return `${postTextHtml(p.text)}
      ${p.game ? gameHtml(p) : ''}
      ${p.clip ? clipHtml(p.clip) : ''}
      ${imgs.length ? `<div class="feed-images feed-images-${imgs.length}">${imgs.map((_, i) => `<button type="button" data-zoom="${esc(feedMediaUrl(p.id, i))}" aria-label="Open image ${i + 1}"><img src="${esc(feedMediaUrl(p.id, i))}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}`;
  }
  function postHtml(p, pinned = false) {
    let media, what, rarity = '#c4b9cf';
    if (p.kind === 'user') {
      return `<article class="feed-post feed-user${pinned ? ' feed-pinned' : ''}" data-post="${esc(p.id)}" data-account="${esc(p.account)}" style="--rarity:#6f6280">
      ${pinned ? '<p class="feed-pin-note">From your notifications</p>' : ''}
      <header>${who(p.account)} <span>${p.game ? 'highlighted a game' : p.clip ? 'shared a clip' : p.images?.length ? 'posted' : 'wrote'}</span> ${when(p.at)}${toolsHtml(p)}</header>
      <div class="feed-user-body">${userPostHtml(p)}</div>
      <div class="feed-user-foot"><div class="feed-reacts" role="group" aria-label="Reactions">${reactsHtml(p)}</div>${reactionControlHtml(p)}</div>
      <div class="feed-comments">${commentsHtml(p)}</div>
      <p class="feed-error" role="status" aria-live="polite"></p>
    </article>`;
    }
    if (p.kind === 'card') {
      const r = roster.get(String(p.account)), player = { account: Number(p.account), name: nameOf(p.account), team: r?.team ?? 'AD2L' };
      media = renderer.card(player, null, { own: true, equipmentOverride: p.design }).replace('data-pick=', `data-design-slot="${p.slot}" data-pick=`);
      what = `saved a new look for card ${p.slot + 1}`;
    } else {
      // A pull: the cards of the rarities the player auto-posts, and loading screens if they post those.
      const items = (p.items ?? []).map(itemByKey).filter(Boolean), screens = (p.screens ?? []).map(screenArt).filter(Boolean);
      const top = PULL_RARITIES.findLast((r) => items.some((i) => i.rarity === r));
      rarity = top ? colors[top] : SCREEN_COLOR;
      media = `<ul class="feed-pulls">${items.map((i) => `<li style="--rarity:${colors[i.rarity]}">${swatch(i, nameOf(p.account))}<span><strong>${esc(i.name)}</strong><small>${i.rarity} ${esc(typeLabel(i.type))}</small></span></li>`).join('')}${screens.map((sc) => `<li class="feed-pull-screen" style="--rarity:${SCREEN_COLOR}"><img src="${esc(sc.src)}" alt="" loading="lazy" decoding="async"><span><strong>${esc(sc.label)}</strong><small>loading screen</small></span></li>`).join('')}</ul>`;
      const got = [items.length === 1 ? `a${items[0].rarity === 'epic' ? 'n' : ''} ${items[0].rarity}` : items.length ? `${items.length} cards` : '',
        screens.length ? `${screens.length === 1 ? 'a' : screens.length} loading screen${screens.length === 1 ? '' : 's'}` : ''].filter(Boolean);
      what = `pulled ${got.join(' and ') || 'something'} from a pack`;
    }
    return `<article class="feed-post${pinned ? ' feed-pinned' : ''}" data-post="${esc(p.id)}" data-account="${esc(p.account)}" style="--rarity:${rarity}">
      ${pinned ? '<p class="feed-pin-note">From your notifications</p>' : ''}
      <header>${who(p.account)} <span>${what}</span> ${when(p.at)}${toolsHtml(p)}</header>
      <div class="feed-media-wrap${p.kind === 'card' ? ' feed-card-wrap' : ''}"><div class="feed-media${p.kind === 'card' ? ' feed-card' : ''}">${media}</div>${reactionControlHtml(p)}</div>
      ${p.kind === 'card' ? `<div class="feed-card-rating" data-rate-post="${esc(p.id)}"></div>` : ''}
      <div class="feed-reacts" role="group" aria-label="Reactions">${reactsHtml(p)}</div>
      <div class="feed-comments">${commentsHtml(p)}</div>
      <p class="feed-error" role="status" aria-live="polite"></p>
    </article>`;
  }

  // Rating a card post (parts/card-rating.js): the Worker rates the card's current look, so only a
  // post that still shows that look gets the buttons; an older look says it was replaced.
  const ratingsOf = new Map();
  let myVotes = null;
  async function mountCardRatings() {
    const slots = [...list.querySelectorAll('.feed-card-rating[data-rate-post]:not([data-mounted])')];
    if (!slots.length) return;
    slots.forEach((el) => { el.dataset.mounted = ''; });
    myVotes ??= me == null ? Promise.resolve({}) : myCardVotes().catch(() => ({}));
    const votes = await myVotes;
    await Promise.all(slots.map(async (el) => {
      const p = posts.get(el.dataset.ratePost);
      if (!p) return;
      if (!ratingsOf.has(p.account)) ratingsOf.set(p.account, cardRatings(p.account).catch(() => null));
      const r = (await ratingsOf.get(p.account))?.[p.slot];
      if (!el.isConnected) return;
      if (r && r.key === designKey(p.design)) mountRating(el, p.account, r, { viewer: me, votes, onVote: (next) => Object.assign(r, next) });
      else if (r !== undefined) el.innerHTML = '<p class="feed-card-rating-old">This look has since been replaced, so it can\'t be rated.</p>';
    }));
  }

  const mine = account != null && account === me;
  body.innerHTML = `${account == null ? `<div class="feed-head"><h3>Feed</h3><p>Posts, clips and highlights from players, plus new cards and epic or legendary pulls from around the league. Tap the reaction to love a post, or hold for Dota reactions.</p></div>
    ${me == null ? '<p class="feed-compose-signin"><button type="button" class="linkish" data-signin>Sign in with Steam</button> to post screenshots, clips and your best games.</p>' : composerHtml(matches, me)}`
    : `<div class="feed-head"><h3>${mine ? 'Your feed' : `${esc(nameOf(account))}'s feed`}</h3><p>${mine ? 'Your posts, card designs and pack pulls. Delete any of them here.' : `Posts, card designs and pack pulls by ${esc(nameOf(account))}.`} <a href="${SOURCES[roster.get(account)?.league]?.root ?? '#/all'}/cards">${mine ? 'Write a post in Cards › Feed' : 'The whole league in Cards › Feed'}</a></p></div>
    ${mine ? autoFormHtml(feedAutoOf(collectionState())) : ''}`}
    <div class="feed-hidden"></div>${admin ? `<div class="feed-bans"></div>
    <dialog class="feed-ban-dialog" aria-label="Ban a player"><form method="dialog">
      <h4>Ban <span></span></h4>
      <fieldset><legend>Stop them</legend>${BAN_SCOPES.map((k) => `<label><input type="checkbox" name="${k}"> ${{ post: 'Posting', comment: 'Commenting', react: 'Reacting' }[k]}</label>`).join('')}</fieldset>
      <label>For <input name="days" type="number" min="1" max="365" step="1" placeholder="until lifted"> days</label>
      <p class="feed-ban-note" role="alert"></p>
      <div class="feed-ban-buttons"><button value="cancel" formnovalidate>Cancel</button><button value="ban" class="feed-ban-go">Ban</button></div>
    </form></dialog>` : ''}
    ${PAINT_FILTER}<div class="feed-list"></div><div class="feed-more" aria-live="polite"></div>
    <dialog class="feed-zoom" aria-label="Image"><form method="dialog"><button aria-label="Close">×</button></form><img alt=""></dialog>`;
  const list = body.querySelector('.feed-list'), moreBox = body.querySelector('.feed-more');
  // Your auto-post settings save as soon as a box changes (lib/feed.js setFeedAuto).
  const autoForm = body.querySelector('.feed-auto');
  if (autoForm) autoForm.onchange = async () => {
    const f = autoForm.elements, note = autoForm.querySelector('.feed-auto-note');
    const settings = { cards: f.namedItem('cards').checked, screens: f.namedItem('screens').checked, rarities: PULL_RARITIES.filter((r) => f.namedItem(`rarity-${r}`).checked) };
    note.textContent = 'Saving…';
    try { await action('feed-auto', settings); note.textContent = 'Saved. New posts follow these settings.'; }
    catch (err) {
      const auto = feedAutoOf(collectionState());
      f.namedItem('cards').checked = auto.cards; f.namedItem('screens').checked = auto.screens;
      for (const r of PULL_RARITIES) f.namedItem(`rarity-${r}`).checked = auto.rarities.includes(r);
      note.textContent = err.message;
    }
  };
  const composer = body.querySelector('.feed-compose');
  if (composer) wireComposer(composer, { matches, me, badgesHtml, onPosted: (p, state) => {
    if (!(me in nicknames)) nicknames[me] = shownNickname(state);
    posts.set(p.id, p);
    list.insertAdjacentHTML('afterbegin', postHtml(p));
    mountCardRatings();
    fitAllReacts();
    moreBox.querySelector('p:only-child')?.remove();
  } });
  let oldest = Infinity, more = false, loading = false;
  // The players you unfollowed, each with a Follow button to bring them back.
  const hiddenBox = body.querySelector('.feed-hidden');
  const drawHidden = () => {
    hiddenBox.innerHTML = unfollowed.size ? `<details><summary>${unfollowed.size} unfollowed player${unfollowed.size === 1 ? '' : 's'} hidden from your Feed</summary><ul>${[...unfollowed].map((a) => `<li>${who(a)} <button type="button" class="link-btn" data-follow="${esc(a)}">Follow</button></li>`).join('')}</ul></details>` : '';
  };
  drawHidden();
  // Fav: who is banned from the Feed and from what, with Change and Unban.
  const bansBox = body.querySelector('.feed-bans');
  let bans = {};
  const scopeText = (b) => banScope(b).length === BAN_SCOPES.length ? 'everything' : banScope(b).map((k) => BAN_LABELS[k]).join(' and ');
  const drawBans = async () => {
    if (!bansBox) return;
    let data;
    try { data = await action('feed-bans'); } catch (e) { bansBox.innerHTML = `<p>${esc(e.message)}</p>`; return; }
    Object.assign(nicknames, Object.fromEntries(Object.entries(data.nicknames ?? {}).filter(([, v]) => v)));
    bans = data.bans ?? {};
    const rows = Object.entries(bans).filter(([, b]) => b.until == null || b.until > Date.now());
    bansBox.innerHTML = rows.length ? `<details><summary>${rows.length} player${rows.length === 1 ? '' : 's'} banned in the Feed</summary><ul>${rows.map(([a, b]) => `<li>${who(a)} <small>from ${scopeText(b)} · ${b.until ? `until ${new Date(b.until).toLocaleDateString()}` : 'until lifted'}</small> <button type="button" class="link-btn" data-ban="${esc(a)}">Change</button> <button type="button" class="link-btn" data-unban="${esc(a)}">Unban</button></li>`).join('')}</ul></details>` : '';
  };
  // The ban form: what to stop them doing (ticked from their current ban, plus posting or
  // commenting when opened from a post or a comment) and for how many days.
  const banDialog = body.querySelector('.feed-ban-dialog');
  const openBan = (target, from) => {
    const form = banDialog.querySelector('form'), f = form.elements, now = bans[target], live = now && (now.until == null || now.until > Date.now());
    banDialog.querySelector('h4 span').textContent = nameOf(target);
    for (const k of BAN_SCOPES) f.namedItem(k).checked = live ? banScope(now).includes(k) || k === from : k === from;
    f.namedItem('days').value = live && now.until ? Math.max(1, Math.ceil((now.until - Date.now()) / 86400000)) : '';
    banDialog.querySelector('.feed-ban-note').textContent = '';
    form.onsubmit = async (e) => {
      if (e.submitter?.value !== 'ban') return;
      e.preventDefault();
      const note = banDialog.querySelector('.feed-ban-note'), scope = BAN_SCOPES.filter((k) => f.namedItem(k).checked);
      const days = f.namedItem('days').value.trim() ? Number(f.namedItem('days').value) : null;
      if (!scope.length) { note.textContent = 'Tick at least one.'; return; }
      if (days != null && !(Number.isInteger(days) && days >= 1 && days <= 365)) { note.textContent = 'Enter 1 to 365 days, or leave it empty.'; return; }
      note.textContent = 'Saving…';
      try { await action('ban', { target, banned: true, days, scope }); } catch (err) { note.textContent = err.message; return; }
      banDialog.close(); drawBans();
    };
    banDialog.showModal();
  };
  drawBans();
  function add(batch, pinned = false) {
    for (const p of batch) {
      if (!pinned) oldest = Math.min(oldest, p.at);
      if (!pinned && unfollowed.has(String(p.account))) continue;
      if (posts.has(p.id) && !pinned) continue;
      posts.set(p.id, p);
      list.insertAdjacentHTML(pinned ? 'afterbegin' : 'beforeend', postHtml(p, pinned));
      if (!pinned) oldest = Math.min(oldest, p.at);
    }
    wirePlayerCards(list, { openOnCard: true });
    mountCardRatings();
    fitAllReacts();
  }
  const drawMore = () => { moreBox.innerHTML = more ? '<button type="button" data-more>Load more</button>' : posts.size ? '<p>You reached the start of the feed.</p>' : account != null ? '<p>No posts yet.</p>' : '<p>Nothing here yet. Write the first post, save a card design or open a pack.</p>'; };
  async function loadMore() {
    if (loading || !more) return;
    loading = true; moreBox.innerHTML = '<p>Loading…</p>';
    try { const page = await feedPosts({ before: oldest, account }); Object.assign(nicknames, page.nicknames); more = page.more; add(page.posts); }
    catch (e) { moreBox.innerHTML = `<p>${esc(e.message)}</p>`; loading = false; return; }
    loading = false; drawMore();
  }
  if (focused?.posts?.[0]) add(focused.posts, true);
  more = first.more; add(first.posts); drawMore();
  // Scrolling near the end loads the next page; the button is there for when it doesn't.
  const watch = new IntersectionObserver((entries) => { if (!body.contains(moreBox)) watch.disconnect(); else if (entries.some((e) => e.isIntersecting)) loadMore(); }, { rootMargin: '400px' });
  watch.observe(moreBox);
  if (focus) body.querySelector('.feed-pinned')?.scrollIntoView({ block: 'start' });

  const fail = (article, msg) => { article.querySelector('.feed-error').textContent = msg; };
  const closePickers = (except = null) => body.querySelectorAll('.feed-react-picker:not([hidden])').forEach((picker) => {
    if (picker === except) return;
    picker.hidden = true;
    picker.removeAttribute('style');
    picker.replaceChildren(); // don't keep 100 animated GIFs alive for every post
    picker.previousElementSibling?.setAttribute('aria-expanded', 'false');
  });
  const closeSuggestions = (except = null) => body.querySelectorAll('.feed-emote-suggest:not([hidden])').forEach((box) => {
    if (box === except) return;
    box.hidden = true;
    box.previousElementSibling?.setAttribute('aria-expanded', 'false');
  });
  const drawSuggestions = (input) => {
    const box = input.nextElementSibling;
    const completion = emoticonCompletion(input.value, input.selectionStart ?? input.value.length);
    input._emoteCompletion = completion;
    if (!completion) { box.hidden = true; input.setAttribute('aria-expanded', 'false'); return; }
    box.innerHTML = completion.matches.map((name, i) => `<button type="button" role="option" data-emote-code="${name}" aria-selected="${i === 0}"><img src="${dotaEmoticonSrc(name)}" alt="" loading="lazy"><span>:${name}:</span></button>`).join('');
    box.dataset.active = '0';
    closeSuggestions(box);
    box.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  };
  const chooseSuggestion = (input, name) => {
    if (!input._emoteCompletion) return;
    const next = insertEmoticon(input.value, input._emoteCompletion, name);
    input.value = next.value;
    input.setSelectionRange(next.caret, next.caret);
    input.focus();
    drawSuggestions(input);
  };
  // The post, and the comment when the element sits in one.
  const targetOf = (el) => {
    const p = posts.get(el.closest('[data-post]').dataset.post), cid = el.closest('[data-comment]')?.dataset.comment;
    return { p, c: cid == null ? null : p.comments.find((x) => x.id === cid) ?? null };
  };
  const openPicker = (button) => {
    const picker = button.nextElementSibling, { p, c } = targetOf(button), tally = c ? reactionTally(c.reactions) : p.reactions;
    closePickers(picker);
    if (!picker.childElementCount) picker.innerHTML = REACTIONS.map((e) => reactionButton(e, tally[e] ?? [], 'feed-react-choice')).join('');
    picker.hidden = false; button.setAttribute('aria-expanded', 'true');
    placePicker(button, picker);
    picker.querySelector('button')?.focus({ preventScroll: true });
  };
  // Posts clip what spills out of them, so an open picker is fixed to the screen instead: above
  // its button, or below when there's more room there, kept inside the window. Measured at 0,0
  // first in case an ancestor makes the fixed box relative to itself.
  const placePicker = (button, picker) => {
    const edge = 8, gap = 6;
    Object.assign(picker.style, { position: 'fixed', top: '0px', left: '0px', right: 'auto', bottom: 'auto', animation: 'none', maxHeight: '' });
    const origin = picker.getBoundingClientRect(), b = button.getBoundingClientRect();
    const roomAbove = b.top - gap - edge, roomBelow = innerHeight - b.bottom - gap - edge;
    const above = origin.height <= roomAbove || roomAbove >= roomBelow, h = Math.min(origin.height, Math.max(80, above ? roomAbove : roomBelow));
    const left = Math.min(Math.max(edge, b.right - origin.width), innerWidth - edge - origin.width);
    Object.assign(picker.style, { maxHeight: `${h}px`, top: `${(above ? b.top - gap - h : b.bottom + gap) - origin.top}px`, left: `${left - origin.left}px`, animation: '' });
  };
  // A fixed picker would float while the page scrolls under it, so scrolling closes it.
  const onScroll = (e) => {
    if (!body.isConnected) return body._feedScroll?.();
    if (!e.target?.closest?.('.feed-react-picker')) closePickers();
  };
  body._feedScroll?.(); // a redraw of the same Feed replaces the last listeners
  addEventListener('scroll', onScroll, { capture: true, passive: true });
  const onResize = (e) => { onScroll(e); if (body.isConnected) fitAllReacts(); };
  addEventListener('resize', onResize);
  body._feedScroll = () => { removeEventListener('scroll', onScroll, true); removeEventListener('resize', onResize); body._feedScroll = null; };
  const refresh = (id, part) => body.querySelectorAll(`[data-post="${CSS.escape(id)}"]`).forEach((article) => {
    const p = posts.get(id);
    if (part === 'reacts') {
      const box = article.querySelector('.feed-reacts');
      box.innerHTML = reactsHtml(p); fitReacts(box);
      article.querySelector('.feed-react-control:not(.feed-comment-react)').outerHTML = reactionControlHtml(p);
    } else if (part === 'comments') article.querySelector('.feed-threads').innerHTML = threadsHtml(p);
    else {
      // One comment's reaction button, so drafts in the reply boxes stay put.
      const c = p.comments.find((x) => x.id === part);
      const line = c && article.querySelector(`[data-comment="${CSS.escape(part)}"] > .feed-comment > .feed-comment-react`);
      if (line) line.outerHTML = commentReactHtml(p, c);
    }
  });
  const reactTo = async (article, emoji, comment = null) => {
    if (me == null) { signIn(); return; }
    const id = article.dataset.post, p = posts.get(id);
    fail(article, '');
    if (comment != null) {
      try { p.comments = (await action('comment-react', { post: id, comment, emoji })).comments; lastReaction.set(`${id} ${comment}`, emoji); } catch (err) { fail(article, err.message); }
      return refresh(id, comment);
    }
    try { p.reactions = (await action('react', { post: id, emoji })).reactions; lastReaction.set(id, emoji); } catch (err) { fail(article, err.message); }
    refresh(id, 'reacts');
  };
  let holdTimer = null;
  const cancelHold = () => { if (holdTimer) clearTimeout(holdTimer); holdTimer = null; };
  body.onpointerdown = (e) => {
    const button = e.target.closest('[data-react-main]'); if (!button) return;
    cancelHold();
    holdTimer = setTimeout(() => { button.dataset.held = 'true'; openPicker(button); holdTimer = null; }, 380);
  };
  body.onpointerup = cancelHold;
  body.onpointercancel = cancelHold;
  body.oncontextmenu = (e) => {
    const button = e.target.closest('[data-react-main]'); if (!button) return;
    e.preventDefault(); cancelHold(); button.dataset.held = 'true'; openPicker(button);
  };
  body.onkeydown = (e) => {
    const input = e.target.closest('.feed-reply input[name="text"]');
    if (input) {
      const box = input.nextElementSibling, choices = [...box.querySelectorAll('[data-emote-code]')];
      if (!box.hidden && choices.length && ['ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        const active = (Number(box.dataset.active) + step + choices.length) % choices.length;
        box.dataset.active = String(active);
        choices.forEach((choice, i) => choice.setAttribute('aria-selected', String(i === active)));
        choices[active].scrollIntoView({ block: 'nearest' });
        return;
      }
      if (!box.hidden && choices.length && ['Enter', 'Tab'].includes(e.key)) {
        e.preventDefault();
        chooseSuggestion(input, choices[Number(box.dataset.active) || 0].dataset.emoteCode);
        return;
      }
      if (e.key === 'Escape' && !box.hidden) { e.preventDefault(); box.hidden = true; input.setAttribute('aria-expanded', 'false'); return; }
    }
    const button = e.target.closest('[data-react-main]');
    if (button && ['ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); openPicker(button); }
    if (e.key === 'Escape') { closePickers(); button?.focus(); }
  };
  body.oninput = (e) => {
    const input = e.target.closest('.feed-reply input[name="text"]');
    if (input) drawSuggestions(input);
  };
  body.onclick = async (e) => {
    const suggestion = e.target.closest('[data-emote-code]');
    if (suggestion) {
      const input = suggestion.closest('.feed-reply-compose').querySelector('input');
      chooseSuggestion(input, suggestion.dataset.emoteCode);
      return;
    }
    if (!e.target.closest('.feed-reply-compose')) closeSuggestions();
    if (!e.target.closest('.feed-react-control')) closePickers();
    if (e.target.closest('[data-more]')) return loadMore();
    const reactsMore = e.target.closest('[data-reacts-more]');
    if (reactsMore) { const box = reactsMore.parentElement; box.dataset.open = 'true'; return fitReacts(box); }
    if (e.target.closest('[data-signin]')) return signIn();
    const ban = e.target.closest('[data-ban]'), unban = e.target.closest('[data-unban]');
    if (ban) return openBan(ban.dataset.ban, ban.dataset.banFrom ?? null);
    if (unban) {
      try { await action('ban', { target: unban.dataset.unban, banned: false }); } catch (err) { bansBox.insertAdjacentHTML('beforeend', `<p>${esc(err.message)}</p>`); return; }
      return drawBans();
    }
    const unfollow = e.target.closest('[data-unfollow]'), follow = e.target.closest('[data-follow]');
    if (unfollow || follow) {
      const target = (unfollow ?? follow).dataset[unfollow ? 'unfollow' : 'follow'];
      (unfollow ?? follow).disabled = true;
      try { await action('follow', { target, follow: !!follow }); }
      catch (err) { (unfollow ?? follow).disabled = false; const a = e.target.closest('[data-post]'); if (a) fail(a, err.message); return; }
      // Following again redraws the Feed so their posts come back in place.
      if (follow) return drawFeed(body, { viewer, signIn, action, swatch, colors, typeLabel, ago });
      unfollowed.add(target); drawHidden();
      list.querySelectorAll(`[data-account="${CSS.escape(target)}"]:not(.feed-pinned)`).forEach((a) => a.remove());
      if (!list.childElementCount) loadMore();
      return;
    }
    if (e.target.closest('a[href]')) { body.closest('dialog.collection-dialog')?.close(); return; }
    const zoom = e.target.closest('[data-zoom]');
    if (zoom) {
      const dialog = body.querySelector('.feed-zoom');
      dialog.querySelector('img').src = zoom.dataset.zoom; dialog.showModal(); return;
    }
    if (e.target.matches('.feed-zoom')) { e.target.close(); return; }
    const play = e.target.closest('[data-play-clip]');
    if (play) {
      play.outerHTML = `<div class="feed-clip feed-clip-live"><iframe src="${esc(play.dataset.playClip)}" title="Clip" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
      return;
    }
    const article = e.target.closest('[data-post]'); if (!article) return;
    const id = article.dataset.post, p = posts.get(id);
    fail(article, '');
    if (e.target.closest('[data-remove-post]')) {
      if (!confirm('Delete this post? Its images, reactions and comments go too.')) return;
      try { await action('post-delete', { post: id }); posts.delete(id); article.remove(); } catch (err) { fail(article, err.message); }
      return;
    }
    const main = e.target.closest('[data-react-main]');
    if (main) {
      if (main.dataset.held) { delete main.dataset.held; return; }
      return reactTo(article, main.dataset.reactMain, main.closest('[data-comment]')?.dataset.comment);
    }
    const react = e.target.closest('[data-react]');
    if (react) {
      const comment = react.closest('[data-comment]')?.dataset.comment; // before closing empties the picker
      closePickers(); react.disabled = true;
      return reactTo(article, react.dataset.react, comment);
    }
    // Reply opens a box under the thread; replying to a reply joins the same thread.
    const replyTo = e.target.closest('[data-reply-to]');
    if (replyTo) {
      const { c } = targetOf(replyTo), thread = replyTo.closest('.feed-threads > ol > li');
      if (!c || !thread) return;
      thread.querySelector(':scope > .feed-reply-thread')?.remove();
      thread.insertAdjacentHTML('beforeend', replyFormHtml(c));
      thread.querySelector(':scope > .feed-reply-thread input').focus();
      return;
    }
    const remove = e.target.closest('[data-remove]');
    if (remove) {
      remove.disabled = true;
      try { p.comments = (await action('comment-delete', { post: id, comment: remove.closest('[data-comment]').dataset.comment })).comments; } catch (err) { fail(article, err.message); }
      refresh(id, 'comments');
    }
  };
  body.onsubmit = async (e) => {
    const form = e.target.closest('.feed-reply'); if (!form) return;
    e.preventDefault();
    const article = form.closest('[data-post]'), id = article.dataset.post, input = form.elements.namedItem('text'), button = form.querySelector('button[type="submit"]');
    button.disabled = true; fail(article, '');
    try {
      const data = await action('comment', { post: id, text: input.value, ...(form.dataset.reply ? { reply: form.dataset.reply } : {}) });
      posts.get(id).comments = data.comments;
      if (me != null && !(me in nicknames)) nicknames[me] = shownNickname(data.state);
      if (!form.dataset.reply) { input.value = ''; button.disabled = false; }
      refresh(id, 'comments');
    } catch (err) { button.disabled = false; fail(article, err.message); }
  };
}
