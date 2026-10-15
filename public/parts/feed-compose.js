// The Feed's post box (parts/feed.js): text, up to MAX_IMAGES images (picked, dropped or pasted),
// a clip link, one of your league games to highlight and a poll (the text is its question). Images are shrunk here before upload;
// the Worker checks everything again (lib/feed.js buildUserPost).
import { esc, dur } from '../core.js';
import { createFeedPost } from '../lib/cosmetics.js';
import { MAX_POST_TEXT, MAX_IMAGES, MAX_IMAGE_BYTES, parseClip, MIN_POLL_OPTIONS, MAX_POLL_OPTIONS, MAX_POLL_OPTION, POLL_HOURS, DEFAULT_POLL_HOURS, buildPoll } from '../lib/feed.js';
import { highlightableGames, playerLine, gameAchievements } from '../lib/highlights.js';
import { wireMentions, mentionsOf, forgetMentions } from './feed-mentions.js';

const MAX_SIDE = 1600;

// A picked file as upload bytes: GIFs stay as they are (to keep the animation) when small enough;
// everything else is redrawn at most MAX_SIDE wide or tall, as WebP (JPEG where WebP can't be made),
// stepping quality and size down until it fits.
export async function shrinkImage(file) {
  if (file.type === 'image/gif' && file.size <= MAX_IMAGE_BYTES) return file;
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error(`${file.name || 'That file'} isn't an image this browser can read.`); }
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
  for (const [side, quality] of [[MAX_SIDE, 0.85], [MAX_SIDE, 0.7], [1280, 0.7], [1024, 0.6], [800, 0.55]]) {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let blob = await new Promise((done) => canvas.toBlob(done, 'image/webp', quality));
    if (!blob || blob.type !== 'image/webp') blob = await new Promise((done) => canvas.toBlob(done, 'image/jpeg', quality));
    if (blob && blob.size <= MAX_IMAGE_BYTES) { bitmap.close?.(); return blob; }
  }
  bitmap.close?.();
  throw new Error(`${file.name || 'That image'} is too large even after shrinking.`);
}
const base64 = (blob) => new Promise((done, fail) => {
  const r = new FileReader();
  r.onload = () => done(String(r.result).split(',')[1]); r.onerror = () => fail(new Error('That image could not be read.'));
  r.readAsDataURL(blob);
});

// One game as a picker label: "Won · Axe 12/3/9 vs Team · Oct 3".
export function gameLabel(m, account) {
  const p = playerLine(m, account), opp = p.team === 'a' ? m.team_b : m.team_a;
  const day = m.start_time ? new Date(m.start_time * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
  return `${p.team === m.winner ? 'Won' : 'Lost'} · ${p.hero} ${p.kills}/${p.deaths}/${p.assists} vs ${opp ?? 'unknown'}${day ? ` · ${day}` : ''}${m.duration_sec ? ` · ${dur(m.duration_sec)}` : ''}`;
}

const pollChoiceHtml = (i) => `<li><input name="poll-choice" maxlength="${MAX_POLL_OPTION}" placeholder="Choice ${i + 1}" aria-label="Poll choice ${i + 1}">${i >= MIN_POLL_OPTIONS ? `<button type="button" data-drop-choice aria-label="Remove choice ${i + 1}">×</button>` : ''}</li>`;

export function composerHtml(matches, me) {
  const games = highlightableGames(matches, me).slice(0, 60);
  return `<form class="feed-compose" novalidate>
    <label class="sr-only" for="feed-compose-text">Write a post</label>
    <div class="feed-compose-text"><textarea id="feed-compose-text" name="text" maxlength="${MAX_POST_TEXT}" rows="2" placeholder="Share a highlight, a clip or a screenshot… @ to mention a player or team"></textarea></div>
    <div class="feed-compose-images" hidden></div>
    <div class="feed-compose-extra" data-extra="clip" hidden><input name="clip" type="url" inputmode="url" placeholder="YouTube, Twitch, Streamable, Medal or Allstar link" aria-label="Clip link"></div>
    <div class="feed-compose-extra" data-extra="game" hidden>
      <select name="game" aria-label="Highlight one of your games"><option value="">Pick one of your games…</option>${games.map((m) => `<option value="${esc(m.id)}">${esc(gameLabel(m, me))}</option>`).join('')}</select>
      <p class="feed-compose-badges"></p>
    </div>
    <div class="feed-compose-extra feed-compose-poll" data-extra="poll" hidden>
      <ol class="feed-poll-choices">${Array.from({ length: MIN_POLL_OPTIONS }, (_, i) => pollChoiceHtml(i)).join('')}</ol>
      <div class="feed-poll-setup">
        <button type="button" class="feed-compose-tool" data-add-choice>+ Add a choice</button>
        <label>Ends in <select name="poll-hours">${Object.entries(POLL_HOURS).map(([h, label]) => `<option value="${h}"${Number(h) === DEFAULT_POLL_HOURS ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
      </div>
    </div>
    <div class="feed-compose-bar">
      <label class="feed-compose-tool" title="Add images (or paste / drop them)"><input type="file" name="files" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden>Image</label>
      <button type="button" class="feed-compose-tool" data-toggle="clip" aria-pressed="false">Clip</button>
      <button type="button" class="feed-compose-tool" data-toggle="poll" aria-pressed="false">Poll</button>
      <button type="button" class="feed-compose-tool" data-toggle="game" aria-pressed="false"${games.length ? '' : ' disabled title="No league games found for your account"'}>Highlight a game</button>
      <span class="feed-compose-count" aria-live="polite"></span>
      <button type="submit" class="feed-compose-post">Post</button>
    </div>
    <p class="feed-compose-error" role="status" aria-live="polite"></p>
  </form>`;
}

// onPosted(post) gets the new post as the Worker stored it.
export function wireComposer(form, { matches, me, onPosted, badgesHtml, mentions = [] }) {
  const images = [], draft = {};
  const box = form.querySelector('.feed-compose-images'), error = form.querySelector('.feed-compose-error');
  const text = form.elements.namedItem('text'), count = form.querySelector('.feed-compose-count');
  const say = (msg) => { error.textContent = msg; };
  const changed = () => { draft.requestId = null; };
  const drawImages = () => {
    box.hidden = !images.length;
    box.innerHTML = images.map((img, i) => `<figure><img src="${img.url}" alt=""><button type="button" data-unpick="${i}" aria-label="Remove image ${i + 1}">×</button></figure>`).join('');
  };
  const addFiles = async (files) => {
    const list = [...files].filter((f) => f.type.startsWith('image/'));
    if (!list.length) return;
    say('');
    for (const file of list) {
      if (images.length >= MAX_IMAGES) { say(`Add up to ${MAX_IMAGES} images.`); break; }
      try { const blob = await shrinkImage(file); images.push({ blob, url: URL.createObjectURL(blob) }); } catch (e) { say(e.message); }
    }
    changed(); drawImages();
  };
  wireMentions(text, mentions);
  const autosize = () => { text.style.height = 'auto'; text.style.height = `${Math.min(text.scrollHeight, 320)}px`; };
  text.addEventListener('input', () => {
    autosize(); changed();
    count.textContent = text.value.length > MAX_POST_TEXT - 100 ? `${MAX_POST_TEXT - text.value.length}` : '';
  });
  text.addEventListener('paste', (e) => { const files = [...(e.clipboardData?.files ?? [])]; if (files.length) { e.preventDefault(); addFiles(files); } });
  form.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.types ?? [])].includes('Files')) { e.preventDefault(); form.classList.add('feed-compose-drop'); } });
  form.addEventListener('dragleave', () => form.classList.remove('feed-compose-drop'));
  form.addEventListener('drop', (e) => { form.classList.remove('feed-compose-drop'); if (e.dataTransfer?.files?.length) { e.preventDefault(); addFiles(e.dataTransfer.files); } });
  form.elements.namedItem('files').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
  form.elements.namedItem('clip').addEventListener('input', changed);
  const select = form.elements.namedItem('game');
  select.addEventListener('change', () => {
    changed();
    const m = matches.find((g) => g.id === select.value);
    form.querySelector('.feed-compose-badges').innerHTML = m ? badgesHtml(gameAchievements(matches, m, me)) || '<small>No badges in this one, but you can still share it.</small>' : '';
  });
  // The poll: its choices (empty ones are left out) and time limit, or null when the Poll box is shut.
  const pollBox = form.querySelector('[data-extra="poll"]'), choices = pollBox.querySelector('.feed-poll-choices');
  const pollOf = () => pollBox.hidden ? null : { options: [...choices.querySelectorAll('input')].map((i) => i.value), hours: Number(form.elements.namedItem('poll-hours').value) };
  const resetPoll = () => {
    choices.innerHTML = Array.from({ length: MIN_POLL_OPTIONS }, (_, i) => pollChoiceHtml(i)).join('');
    form.querySelector('[data-add-choice]').hidden = false;
    text.placeholder = 'Share a highlight, a clip or a screenshot… @ to mention a player or team';
  };
  const renumber = () => {
    choices.querySelectorAll('li').forEach((li, i) => {
      const input = li.querySelector('input'); input.placeholder = `Choice ${i + 1}`; input.setAttribute('aria-label', `Poll choice ${i + 1}`);
      li.querySelector('[data-drop-choice]')?.setAttribute('aria-label', `Remove choice ${i + 1}`);
    });
    form.querySelector('[data-add-choice]').hidden = choices.childElementCount >= MAX_POLL_OPTIONS;
  };
  pollBox.addEventListener('input', changed);
  form.addEventListener('click', (e) => {
    if (e.target.closest('[data-add-choice]')) {
      if (choices.childElementCount < MAX_POLL_OPTIONS) choices.insertAdjacentHTML('beforeend', pollChoiceHtml(choices.childElementCount));
      renumber(); choices.lastElementChild.querySelector('input').focus(); changed(); return;
    }
    const drop = e.target.closest('[data-drop-choice]');
    if (drop) { drop.closest('li').remove(); renumber(); changed(); return; }
    const unpick = e.target.closest('[data-unpick]');
    if (unpick) { const [img] = images.splice(Number(unpick.dataset.unpick), 1); URL.revokeObjectURL(img.url); changed(); drawImages(); return; }
    const toggle = e.target.closest('[data-toggle]');
    if (toggle) {
      const extra = form.querySelector(`[data-extra="${toggle.dataset.toggle}"]`), open = extra.hidden;
      extra.hidden = !open; toggle.setAttribute('aria-pressed', String(open));
      if (toggle.dataset.toggle === 'poll') {
        changed();
        if (open) { text.placeholder = 'Ask a question…'; choices.querySelector('input').focus(); } else resetPoll();
        return;
      }
      if (open) extra.querySelector('input,select').focus();
      else {
        extra.querySelector('input,select').value = ''; changed();
        if (toggle.dataset.toggle === 'game') form.querySelector('.feed-compose-badges').innerHTML = '';
      }
    }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); say('');
    const clip = form.elements.namedItem('clip').value.trim();
    const poll = pollOf();
    try { parseClip(clip); if (poll) { buildPoll(poll, Date.now()); if (!text.value.trim()) throw new Error("Write the poll's question."); } } catch (err) { say(err.message); return; }
    const button = form.querySelector('.feed-compose-post');
    button.disabled = true; button.textContent = 'Posting…';
    try {
      const { text: body, pings } = mentionsOf(text);
      const data = await createFeedPost(draft, { text: body, mentions: pings, clip, game: select.value || null, images: await Promise.all(images.map((i) => base64(i.blob))), poll });
      images.splice(0).forEach((i) => URL.revokeObjectURL(i.url));
      form.reset(); forgetMentions(text); drawImages(); autosize(); count.textContent = '';
      form.querySelectorAll('[data-extra]').forEach((x) => { x.hidden = true; });
      form.querySelectorAll('[data-toggle]').forEach((x) => x.setAttribute('aria-pressed', 'false'));
      form.querySelector('.feed-compose-badges').innerHTML = '';
      resetPoll();
      onPosted(data.post, data.state);
    } catch (err) { say(err.message); }
    button.disabled = false; button.textContent = 'Post';
  });
}
