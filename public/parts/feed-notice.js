// "New comments on your posts" (lib/feed.js notices), from the session state any page loads, like
// the pack-gift notice (pack-gifts.js). It stays until opened or dismissed, either of which marks
// the comments seen.
import { esc } from '../core.js';
import { collectionAction } from '../lib/cosmetics.js';
import { unreadNotices } from '../lib/feed.js';
import { steamName } from './me.js';

let shown = '';
function showCommentNotice(state) {
  const unread = unreadNotices(state).filter((n) => n.kind === 'comment');
  const id = unread.map((n) => n.at).join(',');
  if (!unread.length) { document.querySelector('.comment-notice')?.remove(); shown = ''; return; }
  if (id === shown) return;
  shown = id;
  document.querySelector('.comment-notice')?.remove();
  const last = unread.at(-1), from = last.fromName ?? steamName(Number(last.from)) ?? 'Someone';
  const box = document.createElement('aside');
  box.className = 'gift-notice comment-notice';
  box.setAttribute('role', 'status');
  box.innerHTML = `<strong>${unread.length === 1 ? `${esc(from)} commented on your post` : `${unread.length} new comments on your posts`}</strong>
    <q>${esc(last.text)}</q>
    <div><button type="button" data-notice-open>View</button><button type="button" class="link-btn" data-notice-dismiss>Dismiss</button></div>`;
  document.body.append(box);
  const seen = () => { box.remove(); collectionAction('notices-seen').catch(() => {}); };
  box.querySelector('[data-notice-dismiss]').onclick = seen;
  box.querySelector('[data-notice-open]').onclick = async () => {
    seen();
    const { openCollection } = await import('./collection.js');
    await openCollection({ tab: 'feed', focus: last.post });
  };
}
addEventListener('collection-change', (e) => showCommentNotice(e.detail.state));
