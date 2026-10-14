// The Feed tab of the collection (lib/feed.js): newly saved cards and epic or legendary pack
// pulls, newest first, loading more as you scroll. Signed-in players react with emojis and
// comment on any post. collection.js passes in its swatch drawing and the viewer.
import { esc, SOURCES, allLoad } from '../core.js';
import { listCards } from '../lib/store.js';
import { feedPosts } from '../lib/cosmetics.js';
import { shownNickname } from '../lib/cosmetics-engine.js';
import { itemByKey } from '../lib/cosmetics-catalog.js';
import { REACTIONS, REACTION_ART, topReaction, MAX_COMMENT } from '../lib/feed.js';
import { dotaEmoticonSrc, dotaEmoticonLabel, emoticonParts, emoticonCompletion, insertEmoticon } from '../lib/dota-emoticons.js';
import { isAdmin } from '../lib/pack-gifts.js';
import { createPlayerCards, PAINT_FILTER, wirePlayerCards } from './player-card.js';
import { steamName } from './me.js';
import { strangerNames } from '../lib/scout.js';

export async function drawFeed(body, { viewer, signIn, action, swatch, colors, typeLabel, ago, focus = null }) {
  const token = {}; body._feedToken = token;
  body.innerHTML = '<p>Loading feed…</p>';
  let first, focused = null, teams, matches, overrides;
  try {
    [first, focused, teams, matches, overrides] = await Promise.all([feedPosts(), focus ? feedPosts({ post: focus }).catch(() => null) : null,
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

  const reactionIcon = (e) => {
    const art = REACTION_ART[e];
    return art ? `<img src="${art.src}" alt="${e}" draggable="false" loading="lazy">` : e;
  };
  const reactionButton = (e, list, cls = '') => {
    const mine = me != null && list.includes(me), art = REACTION_ART[e];
    return `<button type="button" class="${cls}" data-react="${e}" aria-label="${art?.label ?? e}${list.length ? `, ${list.length}` : ''}" aria-pressed="${mine}"${list.length ? ` title="${esc(list.map(nameOf).join(', '))}"` : ''}>${reactionIcon(e)}${list.length ? `<span>${list.length}</span>` : ''}</button>`;
  };
  // Keep the post compact: only its most-used reaction is shown below the media. All choices
  // remain in the hold picker; ties follow REACTIONS order, where heart is first.
  const reactsHtml = (p) => {
    const top = topReaction(p.reactions);
    return top ? reactionButton(top.emoji, p.reactions[top.emoji]) : '';
  };
  // A tap on the button is the familiar heart action. Holding it opens all six Dota reactions.
  const reactionControlHtml = (p) => {
    const hearts = p.reactions['❤️'] ?? [], loved = me != null && hearts.includes(me);
    return `<div class="feed-react-control">
      <button type="button" class="feed-react-main" data-react-main aria-label="${loved ? 'Remove love' : 'Love this post'}; hold for more reactions" aria-pressed="${loved}" aria-haspopup="menu" aria-expanded="false" title="Click to love · hold for Dota reactions">${reactionIcon('❤️')}${hearts.length ? `<span>${hearts.length}</span>` : ''}</button>
      <div class="feed-react-picker" role="menu" aria-label="Choose a Dota reaction" hidden></div>
    </div>`;
  };
  const commentTextHtml = (text) => emoticonParts(text).map((part) => typeof part === 'string' ? esc(part)
    : `<img class="feed-inline-emote" src="${dotaEmoticonSrc(part.name)}" alt=":${esc(part.name)}:" title="${esc(dotaEmoticonLabel(part.name))}" loading="lazy">`).join('');
  const commentsHtml = (p) => `${p.comments.length ? `<ol>${p.comments.map((c) => `<li data-comment="${esc(c.id)}">${who(c.account)} <span class="feed-text">${commentTextHtml(c.text)}</span> ${when(c.at)}${me != null && (c.account === me || p.account === me || admin) ? ' <button type="button" class="link-btn" data-remove>Remove</button>' : ''}</li>`).join('')}</ol>` : ''}
    ${me == null ? '<p class="feed-signin"><button type="button" class="linkish" data-signin>Sign in with Steam</button> to react and comment.</p>'
      : `<form class="feed-reply"><div class="feed-reply-compose"><input name="text" maxlength="${MAX_COMMENT}" placeholder="Add a comment · type : for Dota emoticons" aria-label="Add a comment" aria-autocomplete="list" aria-expanded="false" autocomplete="off" required><div class="feed-emote-suggest" role="listbox" aria-label="Dota emoticon suggestions" hidden></div></div><button type="submit">Post</button></form>`}`;
  function postHtml(p, pinned = false) {
    let media, what, rarity = '#c4b9cf';
    if (p.kind === 'card') {
      const r = roster.get(String(p.account)), player = { account: Number(p.account), name: nameOf(p.account), team: r?.team ?? 'AD2L' };
      media = renderer.card(player, null, { own: true, equipmentOverride: p.design }).replace('data-pick=', `data-design-slot="${p.slot}" data-pick=`);
      what = `saved a new look for card ${p.slot + 1}`;
    } else {
      const items = p.items.map(itemByKey).filter(Boolean);
      rarity = colors[items.some((i) => i.rarity === 'legendary') ? 'legendary' : 'epic'];
      media = `<ul class="feed-pulls">${items.map((i) => `<li style="--rarity:${colors[i.rarity]}">${swatch(i, nameOf(p.account))}<span><strong>${esc(i.name)}</strong><small>${i.rarity} ${esc(typeLabel(i.type))}</small></span></li>`).join('')}</ul>`;
      what = `pulled ${items.length === 1 ? `a${items[0].rarity === 'epic' ? 'n' : ''} ${items[0].rarity}` : `${items.length} rare finds`} from a pack`;
    }
    return `<article class="feed-post${pinned ? ' feed-pinned' : ''}" data-post="${esc(p.id)}" style="--rarity:${rarity}">
      ${pinned ? '<p class="feed-pin-note">From your notifications</p>' : ''}
      <header>${who(p.account)} <span>${what}</span> ${when(p.at)}</header>
      <div class="feed-media-wrap${p.kind === 'card' ? ' feed-card-wrap' : ''}"><div class="feed-media${p.kind === 'card' ? ' feed-card' : ''}">${media}</div>${reactionControlHtml(p)}</div>
      <div class="feed-reacts" role="group" aria-label="Reactions">${reactsHtml(p)}</div>
      <div class="feed-comments">${commentsHtml(p)}</div>
      <p class="feed-error" role="status" aria-live="polite"></p>
    </article>`;
  }

  body.innerHTML = `<div class="feed-head"><h3>Feed</h3><p>New cards and epic or legendary pulls from around the league. Tap a card for full screen. Tap the reaction to love it, or hold for Dota reactions.</p></div>
    ${PAINT_FILTER}<div class="feed-list"></div><div class="feed-more" aria-live="polite"></div>`;
  const list = body.querySelector('.feed-list'), moreBox = body.querySelector('.feed-more');
  let oldest = Infinity, more = false, loading = false;
  function add(batch, pinned = false) {
    for (const p of batch) {
      if (posts.has(p.id) && !pinned) continue;
      posts.set(p.id, p);
      list.insertAdjacentHTML(pinned ? 'afterbegin' : 'beforeend', postHtml(p, pinned));
      if (!pinned) oldest = Math.min(oldest, p.at);
    }
    wirePlayerCards(list, { openOnCard: true });
  }
  const drawMore = () => { moreBox.innerHTML = more ? '<button type="button" data-more>Load more</button>' : posts.size ? '<p>You reached the start of the feed.</p>' : '<p>Nothing here yet. Save a card design or open a pack.</p>'; };
  async function loadMore() {
    if (loading || !more) return;
    loading = true; moreBox.innerHTML = '<p>Loading…</p>';
    try { const page = await feedPosts({ before: oldest }); Object.assign(nicknames, page.nicknames); more = page.more; add(page.posts); }
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
  const openPicker = (button) => {
    const picker = button.nextElementSibling, p = posts.get(button.closest('[data-post]').dataset.post);
    closePickers(picker);
    if (!picker.childElementCount) picker.innerHTML = REACTIONS.map((e) => reactionButton(e, p.reactions[e] ?? [], 'feed-react-choice')).join('');
    picker.hidden = false; button.setAttribute('aria-expanded', 'true');
    picker.querySelector('button')?.focus({ preventScroll: true });
  };
  const refresh = (id, part) => body.querySelectorAll(`[data-post="${CSS.escape(id)}"]`).forEach((article) => {
    const p = posts.get(id);
    if (part === 'reacts') {
      article.querySelector('.feed-reacts').innerHTML = reactsHtml(p);
      article.querySelector('.feed-react-control').outerHTML = reactionControlHtml(p);
    } else article.querySelector('.feed-comments').innerHTML = commentsHtml(p);
  });
  const reactTo = async (article, emoji) => {
    if (me == null) { signIn(); return; }
    const id = article.dataset.post, p = posts.get(id);
    fail(article, '');
    try { p.reactions = (await action('react', { post: id, emoji })).reactions; } catch (err) { fail(article, err.message); }
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
    if (e.target.closest('[data-signin]')) return signIn();
    if (e.target.closest('a[href]')) { body.closest('dialog.collection-dialog')?.close(); return; }
    const article = e.target.closest('[data-post]'); if (!article) return;
    const id = article.dataset.post, p = posts.get(id);
    fail(article, '');
    const main = e.target.closest('[data-react-main]');
    if (main) {
      if (main.dataset.held) { delete main.dataset.held; return; }
      return reactTo(article, '❤️');
    }
    const react = e.target.closest('[data-react]');
    if (react) {
      closePickers(); react.disabled = true;
      return reactTo(article, react.dataset.react);
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
    const article = form.closest('[data-post]'), id = article.dataset.post, input = form.elements.namedItem('text'), button = form.querySelector('button');
    button.disabled = true; fail(article, '');
    try {
      const data = await action('comment', { post: id, text: input.value });
      posts.get(id).comments = data.comments;
      if (me != null && !(me in nicknames)) nicknames[me] = shownNickname(data.state);
      refresh(id, 'comments');
    } catch (err) { button.disabled = false; fail(article, err.message); }
  };
}
