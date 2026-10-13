// One-time pack offer eligibility is earned by a completed action in this browser,
// then consumed atomically by the authenticated collection service.
const PREFIX = 'ad2l-pack-offer:';
const CLAIMED_PREFIX = 'ad2l-pack-offer-claimed:';
export function markPackOffer(source) {
  if (!['feedback', 'tour', 'discord'].includes(source)) return;
  try { localStorage.setItem(`${PREFIX}${source}`, '1'); } catch { /* storage blocked */ }
  dispatchEvent(new CustomEvent('pack-offer-change', { detail: { source } }));
  syncPackOfferBadges();
}
export function markPackOfferClaimed(source) {
  try { localStorage.setItem(`${CLAIMED_PREFIX}${source}`, '1');localStorage.removeItem(`${PREFIX}${source}`); } catch { /* storage blocked */ }
  syncPackOfferBadges();
}
export function syncPackOfferClaims(state) {
  for(const source of ['feedback','tour','discord'])if(state?.bonusPackClaims?.[source]||state?.bonusPackClaimed===source||state?.bonusPackClaimed===true)markPackOfferClaimed(source);
}
export function syncPackOfferBadges() {
  for (const source of ['feedback', 'tour', 'discord']) {
    let claimed = false;
    try { claimed = localStorage.getItem(`${CLAIMED_PREFIX}${source}`) === '1'; } catch { /* storage blocked */ }
    document.querySelectorAll(`[data-offer-badge="${source}"]`).forEach(el => { el.hidden = claimed; });
  }
}
export function packOfferSources() {
  const out = [];
  try { for (const source of ['feedback', 'tour', 'discord']) if (localStorage.getItem(`${PREFIX}${source}`) === '1'&&localStorage.getItem(`${CLAIMED_PREFIX}${source}`)!=='1') out.push(source); } catch { /* storage blocked */ }
  return out;
}

export function availablePackOffers(state) {
  const claimed = state?.bonusPackClaims ?? {};
  return packOfferSources().filter(source => !claimed[source] && state?.bonusPackClaimed !== source && state?.bonusPackClaimed!==true);
}
