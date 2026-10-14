// A card design's layout: the owner's own name text and size, which front parts show and where,
// and which stats the back lists. Saved as equipment.layout and checked by validLayout, which the
// collection Worker runs too (cosmetics-engine.js), so a browser can't save anything else.
// null anywhere means the site default; a card with no layout looks exactly as before.

// Front parts, in their default order. Placed parts (x/y set) leave the bottom plate and sit
// centred on that point of the face, in percent.
export const FRONT_PARTS = [
  ['tier', 'Tier'], ['pos', 'Position'], ['name', 'Name'], ['record', 'Record'], ['team', 'Team'], ['hero', 'Hero line'],
];
// Back stats. Wide ones take two columns.
export const BACK_STATS = [
  ['games', 'Games'], ['win', 'Win %'], ['kda', 'K/D/A', true], ['gpm', 'GPM'], ['xpm', 'XPM'], ['dmg', 'Hero damage'],
  ['lh', 'Last hits'], ['wards', 'Obs/Sen wards', true], ['dewards', 'Dewards'], ['stacks', 'Stacks'], ['heal', 'Healing'],
];
export const MAX_BACK_STATS = 8;
export const MAX_NAME = 24;
const CORE = ['games', 'win', 'kda', 'gpm', 'xpm', 'dmg', 'lh'], SUPPORT = ['games', 'win', 'kda', 'wards', 'stacks', 'heal'];
export const defaultStats = (role) => (role >= 4 ? SUPPORT : CORE);

const num = (n, min, max) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;

export function validLayout(raw) {
  if (raw == null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Choose a valid card layout.');
  const out = { name: null, nameSize: 100, front: {}, back: { stats: null, positions: true, heroes: true } };
  if (raw.name != null && raw.name !== '') {
    // Plain text: no control characters or markup, at most 24 characters.
    const name = String(raw.name).replace(/\s+/g, ' ').trim();
    if (!name || [...name].length > MAX_NAME || /[\u0000-\u001f\u007f<>]/.test(name)) throw new Error(`Card names are 1 to ${MAX_NAME} characters, plain text.`);
    out.name = name;
  }
  if (raw.nameSize != null) {
    if (!num(raw.nameSize, 40, 160)) throw new Error('Choose a valid name size.');
    out.nameSize = Math.round(raw.nameSize);
  }
  const front = raw.front ?? {};
  if (typeof front !== 'object' || Array.isArray(front)) throw new Error('Choose a valid card layout.');
  for (const [key] of FRONT_PARTS) {
    const p = front[key];
    if (p == null) continue;
    if (typeof p !== 'object' || Array.isArray(p)) throw new Error('Choose a valid card layout.');
    const part = { show: p.show !== false, x: null, y: null, size: 100 };
    if (p.show != null && typeof p.show !== 'boolean') throw new Error('Choose a valid card layout.');
    if (p.x != null || p.y != null) {
      if (!num(p.x, 0, 100) || !num(p.y, 0, 100)) throw new Error('Card text must stay on the card.');
      part.x = Math.round(p.x * 10) / 10; part.y = Math.round(p.y * 10) / 10;
    }
    if (p.size != null) {
      if (!num(p.size, 40, 250)) throw new Error('Choose a valid text size.');
      part.size = Math.round(p.size);
    }
    if (!part.show || part.x != null || part.size !== 100) out.front[key] = part;
  }
  const back = raw.back ?? {};
  if (typeof back !== 'object' || Array.isArray(back)) throw new Error('Choose a valid card layout.');
  if (back.stats != null) {
    const keys = new Set(BACK_STATS.map(([k]) => k));
    if (!Array.isArray(back.stats) || back.stats.length > MAX_BACK_STATS || back.stats.some((k) => !keys.has(k)) || new Set(back.stats).size !== back.stats.length) throw new Error(`Choose up to ${MAX_BACK_STATS} different stats.`);
    out.back.stats = [...back.stats];
  }
  for (const k of ['positions', 'heroes']) {
    if (back[k] == null) continue;
    if (typeof back[k] !== 'boolean') throw new Error('Choose a valid card layout.');
    out.back[k] = back[k];
  }
  return out;
}

// The stats a card's back lists, in order.
export const backStats = (layout, role) => layout?.back?.stats ?? defaultStats(role);

// A front part's inline style and whether it's placed off the plate.
export function partState(layout, key) {
  const p = layout?.front?.[key];
  const placed = p?.x != null;
  const size = key === 'name' ? (p?.size ?? 100) * (layout?.nameSize ?? 100) / 100 : (p?.size ?? 100);
  const style = `${placed ? `left:${p.x}%;top:${p.y}%;` : ''}${size !== 100 ? `--part-size:${size / 100};` : ''}`;
  return { show: p?.show !== false, placed, style };
}

// The live editor and saved-design updates: apply a layout to a rendered card in place.
export function applyLayout(card, layout, playerName) {
  const front = card.querySelector('.ft-front'), plate = front?.querySelector('.ft-plate');
  if (!front || !plate) return;
  // Leave the rendered name (it may carry search highlights) unless a name was or is set.
  if (layout?.name != null || card.dataset.renamed) {
    const name = layout?.name ?? playerName;
    card.querySelectorAll('.ft-name').forEach((n) => { n.textContent = name; n.title = name; });
    if (layout?.name != null) card.dataset.renamed = '1'; else delete card.dataset.renamed;
  }
  for (const [key] of FRONT_PARTS) {
    const el = front.querySelector(`[data-part="${key}"]`);
    if (!el) continue;
    const s = partState(layout, key);
    el.hidden = !s.show;
    el.classList.toggle('ft-placed', s.placed);
    el.style.left = ''; el.style.top = ''; el.style.removeProperty('--part-size');
    if (s.style) el.style.cssText += s.style;
    // Plate parts go back to the plate in default order, placed ones sit on the face itself.
    if (['name', 'record', 'team', 'hero'].includes(key)) {
      if (s.placed && el.parentElement !== front) front.append(el);
      else if (!s.placed && el.parentElement !== plate) {
        const order = ['name', 'record', 'team', 'hero'], after = order.slice(order.indexOf(key) + 1).map((k) => plate.querySelector(`:scope > [data-part="${k}"]`)).find(Boolean);
        plate.insertBefore(el, after ?? plate.querySelector('.ft-pickbtn'));
      }
    }
  }
  const stats = card.querySelector('.ft-stats');
  if (stats) {
    const shown = backStats(layout, Number(card.dataset.role) || 0);
    stats.querySelectorAll('[data-stat]').forEach((s) => {
      const i = shown.indexOf(s.dataset.stat);
      s.hidden = i < 0; s.style.order = i < 0 ? '' : i;
    });
  }
  if (layout?.nameSize && layout.nameSize !== 100) card.style.setProperty('--name-size', layout.nameSize / 100); else card.style.removeProperty('--name-size');
  card.classList.toggle('ft-no-posbars', layout?.back?.positions === false);
  card.classList.toggle('ft-no-heroes', layout?.back?.heroes === false);
}
