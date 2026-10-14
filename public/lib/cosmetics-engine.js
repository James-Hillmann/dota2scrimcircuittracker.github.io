import { CATALOG, TIERS, PACK_ODDS, DEFAULT_EQUIPMENT, itemByKey } from './cosmetics-catalog.js';
import { heroById } from './hero-meta.js';
import { CARD_ART } from './card-art-data.js';
import { SCREEN_ART } from './screen-art-data.js';
const screenHero=new Map(SCREEN_ART.map(s=>[s.id,s.hero??null]));
import { CARD_STYLES, validCardCrop } from './card-art.js';
import { validLayout, MAX_NAME } from './card-layout.js';
import { LETTER_CASES } from './signatures.js';

export const PACK_INTERVAL_MS=8*60*60*1000;
export const NORMAL_PACK_CAP=3;
export function cardDesignState(state) {
  const designs=Array.from({length:3},(_,i)=>state.cardDesigns?.[i]??(i===0?state.equipment:null));
  return {cardDesigns:designs,primaryCard:state.primaryCard??0,shuffleCards:state.shuffleCards??false};
}
// The public look of a player's cards; nickname is the name they chose to show, else null.
export function cardAppearance(state) {
  const preferences=cardDesignState(state);
  return {...state.equipment,...preferences,nickname:shownNickname(state)};
}
// Your name on the site: a nickname, and whether it shows in place of your in-game name (on your
// cards and your profile, where the in-game name follows in brackets). Same rules as card names.
export function setNickname(state,{nickname=null,showNickname=false}={}) {
  if(typeof showNickname!=='boolean')throw new Error('Choose which name to show.');
  let name=nickname==null?'':String(nickname).replace(/\s+/g,' ').trim();
  if(name&&([...name].length>MAX_NAME||/[\u0000-\u001f\u007f<>]/.test(name)))throw new Error(`Nicknames are 1 to ${MAX_NAME} characters, plain text.`);
  if(showNickname&&!name)throw new Error('Type a nickname to show it.');
  return {...state,nickname:name||null,showNickname};
}
export const shownNickname=state=>state?.showNickname&&state.nickname?state.nickname:null;
// Your profile's background: one of your collected loading screens, or null for none. place is
// 'head' (behind your name) or 'page' (the whole profile); x, y and zoom frame it like a card
// crop; dim (0-90) darkens it so the page stays readable; style is a card image style (null for
// the plain image) and hue turns its colours (0-360). sig is your signature on it, or null: an
// owned signature style and modifier, placed at x, y (percent of the background), size and
// rotation like a card's. A bare screen id is the defaults.
export const PROFILE_BG_PLACES=['head','page'];
export function profileBackgroundOf(bg) {
  if(!bg)return null;
  const b=typeof bg==='string'?{id:bg}:bg;
  return {id:b.id,place:b.place??'head',x:b.x??50,y:b.y??30,zoom:b.zoom??1,dim:b.dim??(b.place==='page'?70:45),style:b.style??null,hue:b.hue??0,sig:b.sig?{translation:'none',x:50,y:50,size:5,rotation:-7,...b.sig}:null};
}
export function setProfileBackground(state,{background=null}={}) {
  if(background==null)return {...state,profileBackground:null};
  if(typeof background!=='object'||Array.isArray(background))throw new Error('Choose a valid background.');
  const bg=profileBackgroundOf(background);
  if(!(state.screens??[]).includes(bg.id))throw new Error('Collect this loading screen before using it as your background.');
  if(!PROFILE_BG_PLACES.includes(bg.place))throw new Error('Choose the header or the whole page.');
  if(!validCardCrop({x:bg.x,y:bg.y,zoom:bg.zoom}))throw new Error('Choose a valid framing.');
  if(typeof bg.dim!=='number'||!Number.isFinite(bg.dim)||bg.dim<0||bg.dim>90)throw new Error('Choose a valid dim level.');
  if(bg.style!=null&&!CARD_STYLES.some(([id])=>id===bg.style))throw new Error('Choose a valid image style.');
  if(typeof bg.hue!=='number'||!Number.isFinite(bg.hue)||bg.hue<0||bg.hue>360)throw new Error('Choose a valid hue.');
  if(bg.sig) {
    const owns=(type,id)=>typeof id==='string'&&!!itemByKey(`${type}:${id}`)&&state.inventory?.[`${type}:${id}`]>0;
    if(!owns('autograph',bg.sig.autograph))throw new Error('Collect this signature style before using it.');
    if(bg.sig.translation!=='none'&&!owns('translation',bg.sig.translation))throw new Error('Collect this modifier before using it.');
    for(const [k,min,max] of [['x',0,100],['y',0,100],['size',2,12],['rotation',-180,180]])
      if(typeof bg.sig[k]!=='number'||!Number.isFinite(bg.sig[k])||bg.sig[k]<min||bg.sig[k]>max)throw new Error('Invalid signature position or size.');
    const {autograph,translation,x,y,size,rotation,letterCase='lower'}=bg.sig;bg.sig={autograph,translation,x,y,size,rotation};
    if(!LETTER_CASES.includes(letterCase))throw new Error('Choose lower or upper case.');
    if(letterCase==='upper')bg.sig.letterCase='upper';
  }
  return {...state,profileBackground:bg};
}
export function saveCardDesign(state,raw,slot=state.primaryCard??0) {
  if(!Number.isInteger(slot)||slot<0||slot>2)throw new Error('Choose one of your three cards.');
  const preferences=cardDesignState(state);
  const validated=equipCosmetics({...state,equipment:preferences.cardDesigns[slot]??state.equipment},raw).equipment;
  preferences.cardDesigns[slot]=validated;
  return {...state,...preferences,equipment:preferences.cardDesigns[preferences.primaryCard]};
}
export function setCardPreferences(state,{primaryCard=state.primaryCard??0,shuffleCards=state.shuffleCards??false}) {
  const preferences=cardDesignState(state);
  if(!Number.isInteger(primaryCard)||primaryCard<0||primaryCard>2||!preferences.cardDesigns[primaryCard])throw new Error('Save this card before making it primary.');
  if(typeof shuffleCards!=='boolean')throw new Error('Choose a valid shuffle setting.');
  return {...state,...preferences,primaryCard,shuffleCards,equipment:preferences.cardDesigns[primaryCard]};
}
export function selectedCardDesign(appearance,own=false,random=0) {
  if(!appearance?.cardDesigns)return appearance;
  const saved=appearance.cardDesigns.filter(Boolean);
  return !own&&appearance.shuffleCards&&saved.length?saved[Math.min(saved.length-1,Math.floor(random*saved.length))]:appearance.cardDesigns[appearance.primaryCard??0]??appearance;
}
export function grantLogin(saved, now = new Date()) {
  const time=now.getTime();
  if (!saved) return {v:2, inventory:{}, packs:['common','common','common'], equipment:{...DEFAULT_EQUIPMENT}, nextPackAt:null};
  const state = structuredClone(saved), normal=state.packs.filter(p=>p==='common').length;
  // Preserve every existing pack during migration, even inventories above the new cap.
  if(state.v!==2) {state.v=2;state.nextPackAt=normal>=NORMAL_PACK_CAP?null:time+PACK_INTERVAL_MS;delete state.lastDay;}
  if(normal>=NORMAL_PACK_CAP) {state.nextPackAt=null;return state;}
  if(state.nextPackAt==null)state.nextPackAt=time+PACK_INTERVAL_MS;
  if(time>=state.nextPackAt) {
    const earned=Math.min(NORMAL_PACK_CAP-normal,1+Math.floor((time-state.nextPackAt)/PACK_INTERVAL_MS));
    state.packs.push(...Array(earned).fill('common'));
    state.nextPackAt=normal+earned>=NORMAL_PACK_CAP?null:state.nextPackAt+earned*PACK_INTERVAL_MS;
  }
  return state;
}
export function rollPack(state, packIndex, random = Math.random, now = new Date()) {
  if(!Number.isInteger(packIndex) || packIndex<0 || packIndex>=state.packs.length) throw new Error('Choose an available pack.');
  const next=grantLogin(state,now), min=TIERS.indexOf(next.packs[packIndex]), rewards=[];
  if(next.packs[packIndex]==='screens') {
    // A loading screen pack: five screens the player doesn't have, no cards.
    const screens=rollScreens(next.screens??[],random,SCREEN_PACK_SIZE);
    if(!screens.length)throw new Error('You already have every loading screen.');
    next.screens=[...(next.screens??[]),...screens];next.packs.splice(packIndex,1);
    return {state:next,rewards,screens};
  }
  const groups=TIERS.slice(min).map(rarity=>({rarity,weight:PACK_ODDS[rarity],items:CATALOG.filter(i=>i.rarity===rarity)}));
  if(groups.some(g=>!g.items.length)) throw new Error('The collection is missing a rarity.');
  for(let n=0;n<3;n++) {
    let r=random()*groups.reduce((s,g)=>s+g.weight,0), group=groups.at(-1);
    for(const g of groups) {r-=g.weight;if(r<0){group=g;break;}}
    const item=group.items[Math.min(group.items.length-1,Math.floor(random()*group.items.length))];
    rewards.push({key:item.key,duplicate:(next.inventory[item.key]??0)>0});
    next.inventory[item.key]=(next.inventory[item.key]??0)+1;
  }
  const screens=rollScreens(next.screens??[],random);
  if(screens.length)next.screens=[...(next.screens??[]),...screens];
  next.packs.splice(packIndex,1);
  if(next.nextPackAt==null && next.packs.filter(p=>p==='common').length<NORMAL_PACK_CAP)next.nextPackAt=now.getTime()+PACK_INTERVAL_MS;
  return {state:next,rewards,screens};
}
// Bonus loading screens (screen-art-data.js): two per pack, always ones the player doesn't have,
// until they own them all. Usable as card art with any hero.
export const SCREENS_PER_PACK=2, SCREEN_PACK_SIZE=5;
function rollScreens(owned,random,count=SCREENS_PER_PACK) {
  const have=new Set(owned),left=SCREEN_ART.filter(s=>!have.has(s.id)),picked=[];
  while(picked.length<count&&left.length)picked.push(left.splice(Math.min(left.length-1,Math.floor((random()||0)*left.length)),1)[0].id);
  return picked;
}
export const RECYCLE_COST=10;
export function recycleCards(state, selections) {
  if(!selections || typeof selections!=='object' || Array.isArray(selections)) throw new Error(`Choose ${RECYCLE_COST} duplicates.`);
  const entries=Object.entries(selections).filter(([,n])=>n!==0);
  if(entries.some(([,n])=>!Number.isSafeInteger(n)||n<1) || entries.reduce((s,[,n])=>s+n,0)!==RECYCLE_COST) throw new Error(`Choose exactly ${RECYCLE_COST} duplicates.`);
  const rarity=itemByKey(entries[0]?.[0])?.rarity, tier=TIERS.indexOf(rarity);
  if(tier<0 || tier===3) throw new Error('Legendary cards cannot be recycled into a higher tier.');
  const next=structuredClone(state);
  for(const [key,n] of entries) {
    if(itemByKey(key)?.rarity!==rarity) throw new Error(`Use ${RECYCLE_COST} duplicates of the same rarity.`);
    if(n>Math.max(0,(next.inventory[key]??0)-1)) throw new Error('Your last copy is protected.');
    next.inventory[key]-=n;
  }
  next.packs.push(TIERS[tier+1]);
  return {state:next,minimum:TIERS[tier+1]};
}
export function equipCosmetics(state, raw) {
  if(!raw || typeof raw!=='object') throw new Error('Choose your card cosmetics.');
  const equipment={...DEFAULT_EQUIPMENT};
  for(const type of ['border','finish','autograph','translation']) {
    const id=raw[type]??equipment[type];
    if(typeof id!=='string') throw new Error('Invalid cosmetic.');
    if(id!==DEFAULT_EQUIPMENT[type] && !(state.inventory[`${type}:${id}`]>0)) throw new Error('Collect this cosmetic before equipping it.');
    if(id!==DEFAULT_EQUIPMENT[type] && !itemByKey(`${type}:${id}`)) throw new Error('Unknown cosmetic.');
    equipment[type]=id;
  }
  // Signatures use the card's name: the player's, or the owner's own (layout.name, checked there).
  equipment.text='';
  const layout=validLayout(raw.layout!==undefined?raw.layout:state.equipment?.layout??null);
  if(layout)equipment.layout=layout;
  equipment.hue=raw.hue??state.equipment?.hue??0;
  if(!Number.isFinite(equipment.hue)||equipment.hue<0||equipment.hue>360)throw new Error('Choose a valid hue.');
  equipment.particleSpeed=raw.particleSpeed??state.equipment?.particleSpeed??DEFAULT_EQUIPMENT.particleSpeed;
  if(!Number.isInteger(equipment.particleSpeed)||equipment.particleSpeed<50||equipment.particleSpeed>200)throw new Error('Choose a particle speed from 50% to 200%.');
  // Lower or upper case for modifiers with capitals (lib/signatures.js); only upper is stored.
  const letterCase=raw.letterCase??state.equipment?.letterCase??'lower';
  if(!LETTER_CASES.includes(letterCase))throw new Error('Choose lower or upper case.');
  if(letterCase==='upper')equipment.letterCase='upper';
  // The border's corner symbol shows unless the owner turns it off; only false is stored.
  const emblem=raw.emblem??state.equipment?.emblem??true;
  if(typeof emblem!=='boolean')throw new Error('Choose whether to show the border symbol.');
  if(!emblem)equipment.emblem=false;
  const base=raw.baseCard??state.equipment?.baseCard;
  if(base!=null) {
    if(typeof base!=='object'||Array.isArray(base))throw new Error('Choose a valid base card.');
    const {hero=null,pos=null,art=null,style=null,crop=null}=base;
    if(hero!=null&&!heroById(hero))throw new Error('Choose a valid hero.');
    if(art!=null&&hero==null)throw new Error('Choose a hero for this artwork.');
    if(pos!=null&&![1,2,3,4,5].includes(pos))throw new Error('Choose a valid role.');
    if(style!=null&&!CARD_STYLES.some(([id])=>id===style))throw new Error('Choose a valid filter.');
    if(art!=null&&String(art).startsWith('scr:')) {
      if(!(state.screens??[]).includes(art))throw new Error('Collect this loading screen before using it.');
      const owner=screenHero.get(art);if(owner&&owner!==heroById(hero)?.name)throw new Error(`This loading screen is for ${owner}.`);
    }
    else if(art!=null&&!['vert','crop','render',...(CARD_ART[heroById(hero)?.name]??[]).filter(i=>!/mini[\s_-]*heroes/i.test(i.label)).map(i=>i.id)].includes(art))throw new Error('Choose artwork for your selected hero.');
    if(crop!=null&&!validCardCrop(crop))throw new Error('Choose a valid crop.');
    equipment.baseCard={hero,pos,art,style,crop};
  }
  for(const [k,min,max] of [['x',0,100],['y',0,100],['size',5,30],['rotation',-180,180]]) {
    const n=raw[k]??equipment[k];
    if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max) throw new Error('Invalid signature position or size.');
    equipment[k]=n;
  }
  return {...state,equipment};
}
// One-time grants, applied on the player's next visit (the Worker's session action) and to new
// players. Each shows in the "Fav sent you" notice (parts/pack-gifts.js).
export const PACK_GRANTS=[{id:'screens-2026-10',packs:['screens','screens','screens'],note:"Loading screens are here. Each pack has five you don't have yet."}];
export function applyPackGrants(state,now=Date.now()) {
  const due=PACK_GRANTS.filter(g=>!(state.grants??[]).includes(g.id));
  if(!due.length)return state;
  return {...state,packs:[...state.packs,...due.flatMap(g=>g.packs)],grants:[...(state.grants??[]),...due.map(g=>g.id)],
    gifts:[...(state.gifts??[]),...due.map(g=>({kind:'pack',tier:g.packs[0],count:g.packs.length,note:g.note,at:now}))].slice(-20)};
}
