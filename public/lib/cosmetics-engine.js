import { CATALOG, TIERS, PACK_ODDS, DEFAULT_EQUIPMENT, itemByKey } from './cosmetics-catalog.js';
import { heroById } from './hero-meta.js';
import { CARD_ART } from './card-art-data.js';
import { CARD_STYLES, validCardCrop } from './card-art.js';
import { validLayout, MAX_NAME } from './card-layout.js';

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
  const groups=TIERS.slice(min).map(rarity=>({rarity,weight:PACK_ODDS[rarity],items:CATALOG.filter(i=>i.rarity===rarity)}));
  if(groups.some(g=>!g.items.length)) throw new Error('The collection is missing a rarity.');
  for(let n=0;n<3;n++) {
    let r=random()*groups.reduce((s,g)=>s+g.weight,0), group=groups.at(-1);
    for(const g of groups) {r-=g.weight;if(r<0){group=g;break;}}
    const item=group.items[Math.min(group.items.length-1,Math.floor(random()*group.items.length))];
    rewards.push({key:item.key,duplicate:(next.inventory[item.key]??0)>0});
    next.inventory[item.key]=(next.inventory[item.key]??0)+1;
  }
  next.packs.splice(packIndex,1);
  if(next.nextPackAt==null && next.packs.filter(p=>p==='common').length<NORMAL_PACK_CAP)next.nextPackAt=now.getTime()+PACK_INTERVAL_MS;
  return {state:next,rewards};
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
  const base=raw.baseCard??state.equipment?.baseCard;
  if(base!=null) {
    if(typeof base!=='object'||Array.isArray(base))throw new Error('Choose a valid base card.');
    const {hero=null,pos=null,art=null,style=null,crop=null}=base;
    if(hero!=null&&!heroById(hero))throw new Error('Choose a valid hero.');
    if(art!=null&&hero==null)throw new Error('Choose a hero for this artwork.');
    if(pos!=null&&![1,2,3,4,5].includes(pos))throw new Error('Choose a valid role.');
    if(style!=null&&!CARD_STYLES.some(([id])=>id===style))throw new Error('Choose a valid filter.');
    if(art!=null&&!['vert','crop','render',...(CARD_ART[heroById(hero)?.name]??[]).filter(i=>!/mini[\s_-]*heroes/i.test(i.label)).map(i=>i.id)].includes(art))throw new Error('Choose artwork for your selected hero.');
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
