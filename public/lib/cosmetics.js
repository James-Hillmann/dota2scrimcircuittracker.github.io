import { CATALOG, DEFAULT_EQUIPMENT, itemByKey } from './cosmetics-catalog.js';
import { signatureHtml } from './signatures.js';
import { steamAccount, steamIdToken } from './store.js';
import { cardArtwork } from './card-art.js';
import { heroById, heroImg } from './hero-meta.js';
import { cardAppearance, selectedCardDesign, shownNickname } from './cosmetics-engine.js';
import { syncPackOfferClaims } from './bonus-offers.js';
import { applyLayout } from './card-layout.js';

export const COLLECTION_API='https://steam-auth.ad2lstats.workers.dev/cosmetics';
let account=null, state=null, pending=null;
const appearances=new Map();
let viewerSeed;
try {viewerSeed=Number(sessionStorage.getItem('ad2l-card-shuffle-seed'));if(!viewerSeed){viewerSeed=Math.random();sessionStorage.setItem('ad2l-card-shuffle-seed',String(viewerSeed));}}catch {viewerSeed=Math.random();}
export function playerEquipment(id,fallback) {
  let hash=Math.floor(viewerSeed*4294967296);for(const c of String(id))hash=Math.imul(hash^c.charCodeAt(0),16777619)>>>0;
  return selectedCardDesign(appearances.get(String(id))??fallback,String(id)===String(account),hash/4294967296);
}
export const collectionState=()=>state;
// The nickname a player shows in place of their in-game name, or null (cosmetics-engine.js).
export const playerNickname=id=>appearances.get(String(id))?.nickname??null;
export async function collectionAction(action,details={}) {
  const token=await steamIdToken();if(!token)throw new Error('Sign in with Steam to collect cards.');
  account=await steamAccount();
  // Keep a failed request's ID for safe retry after a lost response.
  const payload=JSON.stringify({action,...details});
  const retryKey=`ad2l-collection-request:${account}:${payload}`;
  let previous;try {previous=localStorage.getItem(retryKey);}catch{}
  if(pending?.payload!==payload)pending={payload,id:previous??crypto.randomUUID()};
  if(action!=='session')try {localStorage.setItem(retryKey,pending.id);}catch{}
  const r=await fetch(COLLECTION_API,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({action,...details,requestId:pending.id})});
  const data=await r.json();
  if(!r.ok){if(r.status<500){try {localStorage.removeItem(retryKey);}catch{}pending=null;}throw new Error(data.error??'Could not update your collection.');}
  try {localStorage.removeItem(retryKey);}catch{}
  pending=null;state=data.state;
  syncPackOfferClaims(state);
  appearances.set(String(account),cardAppearance(state));
  document.querySelectorAll(`.ft-card[data-pick="${account}"]`).forEach(card=>applyEquipment(card,card.dataset.designSlot!=null?(state.cardDesigns?.[Number(card.dataset.designSlot)]??state.equipment):state.equipment,shownNickname(state)??card.dataset.playerName??'Your Name'));
  document.querySelectorAll(`.fantasy-tier-chip.open[data-expanded-account="${account}"]`).forEach(panel=>applyExpandedEquipment(panel,state.equipment,panel.dataset.playerName));
  dispatchEvent(new CustomEvent('collection-change',{detail:{state,account}}));
  return data;
}
export async function publicCollection(account) {
  const r=await fetch(`${COLLECTION_API}/collection/${account}`);if(!r.ok)throw new Error('Could not load this collection.');return r.json();
}
// Each saved design's rating counts (lib/card-ratings.js); rating one is the 'rate' action.
export async function cardRatings(account) {
  const r=await fetch(`${COLLECTION_API}/ratings/${account}`);if(!r.ok)throw new Error('Ratings unavailable.');return (await r.json()).cards;
}
// Every changed saved design in the league, with its ratings (the Gallery).
export async function galleryCards() {
  const r=await fetch(`${COLLECTION_API}/gallery`);if(!r.ok)throw new Error('Gallery unavailable.');return (await r.json()).cards;
}
// The signed-in player's own votes, "<owner>:<design key>" → rating; empty when signed out.
export async function myCardVotes() {
  const token=await steamIdToken().catch(()=>null);if(!token)return {};
  const r=await fetch(COLLECTION_API,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({action:'my-votes'})});
  if(!r.ok)throw new Error('Your ratings are unavailable.');return (await r.json()).votes;
}
export async function cosmeticAppearances() {
  const r=await fetch(`${COLLECTION_API}/appearances`);if(!r.ok)throw new Error('Collection service unavailable.');const data=await r.json();
  for(const [id,equipment] of Object.entries(data))appearances.set(id,String(account)===id&&state?.equipment?cardAppearance(state):equipment);
  return data;
}
export function cosmeticAttributes(raw) {
  const e={...DEFAULT_EQUIPMENT,...raw}, border=itemByKey(`border:${e.border}`);
  return ` data-cosmetic="true" data-texture="${border?.texture??'metal'}" data-finish="${itemByKey(`finish:${e.finish}`)?.id??'none'}" data-rarity="${border?.rarity??'free'}" style="--a:${border?.a??'#92969c'};--b:${border?.b??'#41454c'};--art-hue:${Number(e.hue)||0}deg"`;
}
export function cosmeticLayers(e,name) {
  const equipment={...DEFAULT_EQUIPMENT,...e}, border=itemByKey(`border:${equipment.border}`);
  const symbol=equipment.emblem===false?'':border?.symbol??'';
  const particles=['inferno','blizzard','cosmic','diamond','stars','goldust','starlight'].includes(equipment.finish)?`<span class="particles" aria-hidden="true">${Array.from({length:24},(_,i)=>`<i style="--i:${i};left:${(i*43+13)%100}%;top:${(i*29+7)%100}%;animation-delay:-${i*.39}s"></i>`).join('')}</span>`:'';
  return `<span class="cosmetic-overlay" aria-hidden="true"></span>${particles}${symbol?`<span class="cosmetic-emblem" aria-hidden="true">${symbol}</span>`:''}${signatureHtml(equipment,name)}`;
}
export function applyEquipment(card,e,name) {
  if(!card)return;
  const border=itemByKey(`border:${e.border}`);
  card.dataset.cosmetic='true';card.dataset.texture=border?.texture??'metal';card.dataset.finish=e.finish;card.dataset.rarity=border?.rarity??'free';
  card.style.setProperty('--a',border?.a??'#92969c');card.style.setProperty('--b',border?.b??'#41454c');
  card.style.setProperty('--art-hue',`${Number(e.hue)||0}deg`);
  if(e.baseCard) {
    const base=e.baseCard,hero=base.hero??Number(card.dataset.autoHero),art=cardArtwork(hero,base);
    if(art) {
      [...card.classList].filter(c=>c.startsWith('src-')).forEach(c=>card.classList.remove(c));
      for(const c of art.cls?.split(' ')??[])if(c)card.classList.add(c);
      card.dataset.style=art.style;
      const host=card.querySelector('.ft-art');let img=host.querySelector('img');
      if(!img){img=document.createElement('img');img.alt='';host.append(img);}img.src=art.src;img.dataset.wide=heroImg(heroById(hero)?.name)??'';
      card.classList.toggle('ft-custom-crop',!!art.crop);
      if(art.crop)for(const [k,v] of Object.entries(art.crop))card.style.setProperty(k==='zoom'?'--art-zoom':`--art-${k}`,k==='zoom'?v:`${v}%`);
      const label=card.querySelector('.ft-sig');if(label)label.textContent=heroById(hero)?.name??'';
    }
  }
  applyLayout(card,e.layout??null,name);
  // No card name of its own: the player's shown name (their nickname, else in-game name).
  if(e.layout?.name==null&&name)card.querySelectorAll('.ft-name').forEach(n=>{if(n.textContent!==name){n.textContent=name;n.title=name;}});
  const face=card.querySelector('.ft-front');face.querySelectorAll('.card-autograph,.cosmetic-overlay,.cosmetic-emblem,.particles').forEach(n=>n.remove());
  face.insertAdjacentHTML('beforeend',cosmeticLayers(e,e.layout?.name??name));
}
export function applyExpandedEquipment(panel,raw,name) {
  const e={...DEFAULT_EQUIPMENT,...raw},border=itemByKey(`border:${e.border}`);
  panel.dataset.cosmetic='true';panel.dataset.texture=border?.texture??'metal';
  panel.style.setProperty('--a',border?.a??'#92969c');panel.style.setProperty('--b',border?.b??'#41454c');
  panel.style.setProperty('--art-hue',`${Number(e.hue)||0}deg`);
  panel.style.setProperty('--expanded-signature-size',`clamp(18px,${e.size/5}cqi,64px)`);
  panel.querySelector(':scope > .tier-expanded-signature')?.remove();
  const html=signatureHtml(e,name);
  if(html) {const layer=document.createElement('div');layer.className='tier-expanded-signature';layer.setAttribute('aria-hidden','true');layer.innerHTML=html;panel.append(layer);}
  const art=panel.querySelector('.tier-card-main .ft-art img');
  if(art?.src)panel.style.setProperty('--tier-art',`url(${JSON.stringify(art.src)})`);
}
export { CATALOG, DEFAULT_EQUIPMENT };
