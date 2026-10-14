// Pack gifts (lib/pack-gifts.js). Fav sees a "Gift packs" box on other players' profiles; the
// recipient gets a notice on their next page load, which stays until they open or dismiss it.
import { esc } from '../core.js';
import { steamAccount } from '../lib/store.js';
import { collectionAction } from '../lib/cosmetics.js';
import { TIERS } from '../lib/cosmetics-catalog.js';
import { isAdmin, giftLabel, MAX_GIFT_PACKS } from '../lib/pack-gifts.js';

export async function mountGiftPanel(host, account, name) {
  const me = await steamAccount().catch(() => null);
  if (!isAdmin(me) || !host.isConnected || host.querySelector('.gift-panel')) return;
  const section = document.createElement('section');
  section.className = 'gift-panel panel';
  section.innerHTML = `<h3>Gift packs</h3><p class="muted">Only you see this. ${esc(name)} gets a notice next time they visit.</p>
    <form class="gift-form">
      <label>Packs <input type="number" name="count" min="1" max="${MAX_GIFT_PACKS}" value="1" required></label>
      <label>Rarity <select name="tier">${TIERS.map((t) => `<option value="${t}">${t[0].toUpperCase() + t.slice(1)}${t === 'common' ? '' : ' or better'}</option>`).join('')}</select></label>
      <label class="gift-note">Note <input name="note" maxlength="120" placeholder="Optional, shown to them"></label>
      <button type="submit">Send gift</button>
      <span class="gift-msg" role="status" aria-live="polite"></span>
    </form>`;
  (host.querySelector('.profile-collection') ?? host.querySelector('.page-head'))?.after(section);
  const form = section.querySelector('form'), msg = section.querySelector('.gift-msg');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const gift = { tier: form.tier.value, count: Number(form.count.value), note: form.note.value };
    const button = form.querySelector('button');
    button.disabled = true; msg.textContent = 'Sending…';
    try {
      await collectionAction('gift', { target: String(account), ...gift });
      msg.textContent = `Sent ${giftLabel(gift)} to ${name}.`;
      form.note.value = '';
    } catch (err) { msg.textContent = err.message; }
    button.disabled = false;
  };
}

// The recipient's notice, from the session state any page loads (collection.js mountGift).
let shown = '';
function showGiftNotice(state) {
  const gifts = state?.gifts ?? [];
  const id = gifts.map((g) => g.at).join(',');
  if (!gifts.length) { document.querySelector('.gift-notice')?.remove(); shown = ''; return; }
  if (id === shown) return;
  shown = id;
  document.querySelector('.gift-notice')?.remove();
  const notes = gifts.map((g) => g.note).filter(Boolean);
  const box = document.createElement('aside');
  box.className = 'gift-notice';
  box.setAttribute('role', 'status');
  box.innerHTML = `<strong>Fav sent you ${gifts.length === 1 ? giftLabel(gifts[0]) : `${gifts.reduce((n, g) => n + g.count, 0)} packs`}</strong>
    ${notes.map((n) => `<q>${esc(n)}</q>`).join('')}
    <div><button type="button" data-gift-open>Open packs</button><button type="button" class="link-btn" data-gift-dismiss>Dismiss</button></div>`;
  document.body.append(box);
  const seen = () => { box.remove(); collectionAction('gifts-seen').catch(() => {}); };
  box.querySelector('[data-gift-dismiss]').onclick = seen;
  box.querySelector('[data-gift-open]').onclick = () => { seen(); document.getElementById('collection-gift')?.click(); };
}
addEventListener('collection-change', (e) => showGiftNotice(e.detail.state));
