import { esc, SOURCES, allLoad } from '../core.js';
import { steamAccount, steamLoginUrl, listCards } from '../lib/store.js';
import { CATALOG, DEFAULT_EQUIPMENT, PARTICLE_FINISHES, collectionState, collectionAction, publicCollection, applyEquipment, cardRatings, galleryCards, myCardVotes } from '../lib/cosmetics.js';
import { RATINGS } from '../lib/card-ratings.js';
import { TIERS, itemByKey } from '../lib/cosmetics-catalog.js';
import { signatureHtml, renderedName } from '../lib/signatures.js';
import { createPlayerCards, PAINT_FILTER, wirePlayerCards } from './player-card.js';
import { startSteamSignIn, steamName } from './me.js';
import { HERO_META } from '../lib/hero-meta.js';
import { cardArtOptions, CARD_STYLES, defaultCardCrop, cardArtwork, screenArt, SCREEN_COUNT } from '../lib/card-art.js';
import { cardDesignState, shownNickname, RECYCLE_COST } from '../lib/cosmetics-engine.js';
import { availablePackOffers, completedPackOffers, markPackOfferClaimed } from '../lib/bonus-offers.js';
import { startFeedback } from '../lib/feedback.js';
import { FRONT_PARTS, BACK_STATS, MAX_BACK_STATS, MAX_NAME, backStats, applyLayout } from '../lib/card-layout.js';
import './pack-gifts.js'; // the "Fav sent you packs" notice
import { SCREEN_ART } from '../lib/screen-art-data.js';

const gift=`<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 13h24v6H4zm2 6h20v11H6zm10-6v17M16 13C4 13 5 2 11 4c4 1 5 9 5 9zm0 0c12 0 11-11 5-9-4 1-5 9-5 9z"/></svg>`;
const colors={common:'#abb3be',rare:'#80c4ff',epic:'#d7a3ff',legendary:'#ffd879'};
// `translation` is the legacy save/inventory key; players know these as modifiers.
const typeLabel=type=>type==='translation'?'modifier':type;
function swatch(item,name='Scionara') {
  if(item.type==='autograph') return `<span class="collection-swatch signature-sample">${signatureHtml({...DEFAULT_EQUIPMENT,autograph:item.id,text:name},name).replace('card-autograph','collection-signature')}</span>`;
  if(item.type==='translation')return `<span class="collection-swatch translation-swatch ${item.id}">${esc(item.preview)}</span>`;
  return `<span class="collection-swatch ${item.type==='finish'?'finish-swatch':''}" data-texture="${item.texture??'metal'}" data-finish="${item.id}" style="--a:${item.a??'#536282'};--b:${item.b??'#151a29'}">${item.symbol??''}</span>`;
}
// Grouped by type (catalog order), common to legendary within each type.
const TYPE_ORDER=[...new Set(CATALOG.map(i=>i.type))];
const DEX_ORDER=[...CATALOG].sort((a,b)=>TYPE_ORDER.indexOf(a.type)-TYPE_ORDER.indexOf(b.type)||TIERS.indexOf(a.rarity)-TIERS.indexOf(b.rarity));
const dexHtml=(inventory,filter='all',status='all',name,equipment=DEFAULT_EQUIPMENT,editable=false,rarity='all')=>DEX_ORDER.filter(i=>(filter==='all'||i.type===filter)&&(rarity==='all'||i.rarity===rarity)&&(status==='all'||(status==='owned'?(inventory[i.key]??0)>0:!inventory[i.key]))).map((i)=>{
  const n=inventory[i.key]??0;
  const equipped=equipment[i.type]===i.id;
  return `<article class="dex-item ${n?'collected':'uncollected'}${equipped?' equipped':''}" style="--rarity:${colors[i.rarity]}"><button type="button" class="dex-preview-choice" data-preview="${i.key}" aria-label="Preview ${esc(i.name)}">${swatch(i,name)}<span>Preview</span></button><small>${esc(typeLabel(i.type))} · ${i.rarity}</small><strong>${esc(i.name)}</strong><span>${n?`Owned ×${n}`:'Not collected'}</span>${equipped?'<span class="equipped-label">Equipped</span>':''}${n&&editable?`<button type="button" data-equip="${i.key}" ${equipped?'disabled aria-pressed="true"':'aria-pressed="false"'}>${equipped?'Equipped':'Equip'}</button>`:''}</article>`;
}).join('');
// Pack loading screens in the Collection tab ("loading screens" type): every one, collected or not,
// each previewable on the card. Steam rarities, so the hero filter stands in for the rarity one.
const SCREEN_PACK_COLOR='#7fd6c2';
const SCREEN_HEROES=[...new Set(SCREEN_ART.map(s=>s.hero).filter(Boolean))].sort();
const screenDexHtml=(owned,status,hero,preview)=>SCREEN_ART.filter(s=>(hero==='all'||(hero==='any'?!s.hero:s.hero===hero))&&(status==='all'||(status==='owned')===owned.has(s.id))).map(s=>{
  const art=screenArt(s.id),have=owned.has(s.id);
  return `<article class="dex-item dex-screen ${have?'collected':'uncollected'}" style="--rarity:${SCREEN_PACK_COLOR}"><button type="button" class="dex-preview-choice" data-preview-screen="${s.id}" aria-pressed="${preview===s.id}" aria-label="Preview ${esc(s.label)}"><img src="${esc(art.src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"><span>Preview</span></button><small>${esc(s.hero??'Any hero')}</small><strong>${esc(s.label)}</strong><span>${have?'Collected':'Not collected'}</span></article>`;
}).join('')||'<p>No loading screens match.</p>';

// The collection as a dialog, or with `page` (an element) as a full page: the Gallery tab
// (pages/gallery.js), whose own sub-tab bar (`tabBar`, the site's tabs, [data-tab] buttons)
// switches the sections. onTab hears each tab change so the address can follow it.
export async function openCollection({tab='packs',viewAccount=null,cardHtml=null,name=null,adapter=null,page=null,tabBar=null,onTab=null}={}) {
  const own=adapter?.account??await steamAccount().catch(()=>null), target=viewAccount??own, editable=target!=null&&target===own;
  name=name??steamName(target)??'Your Name';
  let state=editable?(adapter?.state??collectionState()):null, inventory={}, busy=false, filter='all', rarity='all', status='all', rewards=[], rewardScreens=[], resultVisible=false;
  const action=adapter?.action??collectionAction;
  let selectedSlot=state?.primaryCard??0, publicDesigns=null, previewItem=null, previewScreen=null, screenHero='all';
  const designs=()=>cardDesignState(state??publicDesigns??{equipment});
  const selectedEquipment=()=>({...DEFAULT_EQUIPMENT,...(designs().cardDesigns[selectedSlot]??state?.equipment??equipment)});
  let clockOffset=0, timerRetryAt=0;
  const dialog=document.createElement(page?'section':'dialog');dialog.className=page?'collection-dialog collection-page':'collection-dialog';dialog.setAttribute('aria-labelledby','collection-title');
  const closeView=()=>{if(!page)dialog.close();}, tabsHost=tabBar??dialog;
  const shownName=()=>shownNickname(state)??name;
  dialog.innerHTML=`${page?'':`<div class="collection-head"><div><small>AD2L COLLECTION</small><h2 id="collection-title">Your collection</h2></div><div class="collection-head-actions"><button type="button" data-feedback title="Suggest a change: mark up the collection and say what you'd change">Feedback</button><button type="button" data-close aria-label="Close collection">×</button></div></div><nav class="collection-tabs" aria-label="Collection sections">${['packs','collection','customize','recycle','gallery'].map(t=>`<button type="button" data-tab="${t}">${t[0].toUpperCase()+t.slice(1)}</button>`).join('')}</nav>`}${page?'<p class="collection-message" role="status" aria-live="polite"></p><div class="collection-body"></div>':'<div class="collection-body"></div><p class="collection-message" role="status" aria-live="polite"></p>'}`;
  if(page)page.replaceChildren(dialog);
  else {document.querySelector('dialog.collection-dialog')?.close();document.querySelector('dialog.collection-dialog')?.remove();document.body.append(dialog);dialog.showModal();}
  const body=dialog.querySelector('.collection-body'), message=dialog.querySelector('.collection-message');
  if(target!=null&&!editable) {
    dialog.querySelector('#collection-title').textContent=`${name}'s collection`;
    tabsHost.querySelectorAll('[data-tab="packs"],[data-tab="recycle"]').forEach(b=>b.remove());
    if(tab==='packs'||tab==='recycle')tab='collection';
  }
  body.innerHTML='<p>Loading collection…</p>';
  tabsHost.querySelectorAll('[data-tab]').forEach(b=>b.disabled=true);
  let equipment={...DEFAULT_EQUIPMENT,...state?.equipment}, initialEquipment=JSON.stringify(equipment);
  const say=text=>{
    message.textContent=text;
    if(['Your Steam session expired. Sign in again.','Sign in with Steam first.','Sign in with Steam to collect cards.'].includes(text)) {
      const link=document.createElement('a');
      link.href=steamLoginUrl(location.origin+location.pathname+location.search);
      link.textContent=text;
      link.onclick=e=>{e.preventDefault();closeView();startSteamSignIn();};
      message.replaceChildren(link);
    }
  };
  const disabledBefore=new WeakMap();
  const setBusy=value=>{busy=value;[dialog,tabBar].filter(Boolean).flatMap(el=>[...el.querySelectorAll('button:not([data-close]),input,select')]).forEach(b=>{if(value){disabledBefore.set(b,b.disabled);b.disabled=true;}else if(disabledBefore.has(b)){b.disabled=disabledBefore.get(b);disabledBefore.delete(b);}});};
  const run=async(actionName,details,success)=>{
    if(busy)return;setBusy(true);say('Saving…');
    if(actionName==='equip')details={...details,cardSlot:selectedSlot};
    try {const data=await action(actionName,details);if(data.serverNow)clockOffset=data.serverNow-Date.now();state=data.state;inventory=state.inventory;success?.(data);say('');return data;}
    catch(e){say(e.message);return null;}finally{setBusy(false);}
  };
  dialog.querySelector('[data-close]')?.addEventListener('click',()=>dialog.close());
  dialog.querySelector('[data-feedback]')?.addEventListener('click',()=>startFeedback());
  dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
  dialog.addEventListener('close',()=>{if(dialog.open)return;/* feedback mode reopening it */if(dialog._revealTimer)clearTimeout(dialog._revealTimer);clearInterval(dialog._packTimer);dialog.remove();});
  tabsHost.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;onTab?.(tab);draw();});
  try {
    if(editable) {const data=adapter?{state:adapter.state}:await action('session');if(data.serverNow)clockOffset=data.serverNow-Date.now();state=data.state;selectedSlot=state.primaryCard??0;inventory=state.inventory;equipment=selectedEquipment();initialEquipment=JSON.stringify(equipment);}
    else if(target!=null) {const data=await publicCollection(target);publicDesigns=data;selectedSlot=data.primaryCard??0;inventory=data.inventory;equipment={...DEFAULT_EQUIPMENT,...data.equipment};}
  } catch(e){say(e.message);}
  // Use the site's existing shared card, including its artwork choices and crop.
  if(!cardHtml) {
    const existing=document.querySelector(`.ft-card[data-pick="${target}"]`);
    if(existing)cardHtml=existing.outerHTML;
    else {
      // Your record, heroes and team from every division's games and rosters, as on Fantasy.
      const [cards,matches,teams]=target==null?[new Map(),[],[]]:await Promise.all([listCards().catch(()=>new Map()),allLoad().catch(()=>[]),SOURCES.all.data().then(d=>d.teams).catch(()=>[])]);
      const team=teams.find(t=>t.players.some(p=>p.account_id===Number(target)));
      const renderer=createPlayerCards(matches,{cards,teams});
      name=team?.players.find(p=>p.account_id===Number(target))?.name??name; // the name the site shows for you
      cardHtml=PAINT_FILTER+renderer.card({account:Number(target??0),name,team:team?.name??'AD2L'},null,{own:true});
    }
  }
  const signIn=()=>{closeView();startSteamSignIn();};
  function cardSlotsHtml() {
    const prefs=designs();
    return `<div class="card-slots" aria-label="Saved card designs">${prefs.cardDesigns.map((design,i)=>`<button type="button" data-card-slot="${i}" aria-pressed="${i===selectedSlot}">Card ${i+1}<small>${i===prefs.primaryCard?'Primary':design?'Saved':editable?'Create design':'Empty'}</small></button>`).join('')}</div>${editable?`<div class="card-preferences"><button type="button" data-primary ${selectedSlot===prefs.primaryCard||!prefs.cardDesigns[selectedSlot]?'disabled':''}>${selectedSlot===prefs.primaryCard?'Primary card':'Make primary'}</button><label><input type="checkbox" data-shuffle ${prefs.shuffleCards?'checked':''}> Shuffle saved cards for other viewers</label></div>`:''}`;
  }
  function wireCardSlots() {
    body.querySelectorAll('[data-card-slot]').forEach(b=>{b.disabled=busy||(!editable&&!designs().cardDesigns[Number(b.dataset.cardSlot)]);b.onclick=()=>{
      previewItem=null;selectedSlot=Number(b.dataset.cardSlot);equipment=structuredClone(selectedEquipment());initialEquipment=JSON.stringify(equipment);
      if(editable&&!designs().cardDesigns[selectedSlot])tab='customize';draw();
    };});
    body.querySelector('[data-primary]')?.addEventListener('click',async()=>{const data=await run('card-settings',{primaryCard:selectedSlot});if(data){draw();say(`Card ${selectedSlot+1} is now primary.`);}});
    body.querySelector('[data-shuffle]')?.addEventListener('change',async e=>{const enabled=e.target.checked;const data=await run('card-settings',{shuffleCards:enabled});draw();if(data)say(enabled?'Other viewers will see a shuffled saved design.':'Other viewers will see your primary card.');});
  }
  function draw() {
    tabsHost.querySelectorAll('[data-tab]').forEach(b=>{b.setAttribute(tabBar?'aria-selected':'aria-pressed',String(b.dataset.tab===tab));if(tabBar)b.tabIndex=b.dataset.tab===tab?0:-1;b.disabled=busy;});
    if(tab==='packs')drawPacks();else if(tab==='collection')drawDex();else if(tab==='customize')drawEditor();else if(tab==='gallery')drawGallery(body,{viewer:own,signIn});else drawRecycle();
  }
  function drawPacks() {
    const packs=state?.packs??[],normal=packs.filter(p=>p==='common').length;
    const offers=editable?availablePackOffers(state):[];
    const done=completedPackOffers(state),steps=[['feedback','Send Feedback','Use the Feedback button in the top bar.'],['tour','Take the New here? tour','Finish the basic site tour.'],['discord','Join the Discord','Use the Discord link in the footer.']].filter(([s])=>!done.has(s));
    const offerGuide=steps.length?`<aside class="pack-offer-guide"><strong>Earn ${steps.length===1?'1 more bonus pack':`up to ${steps.length} bonus packs`}</strong><span>Complete each action once. Every one gives you an extra pack.</span><div class="pack-offer-steps" style="--steps:${steps.length}">${steps.map(([,t,d],i)=>`<div><b>${i+1}</b><strong>${t}</strong><small>${d}</small></div>`).join('')}</div></aside>`:'';
    const offerLabel=offers.map(s=>s==='feedback'?'feedback':s==='tour'?'the basic site tour':'joining Discord').join(' · ');
    body.innerHTML=`<div class="pack-intro"><div class="gift-hero">${gift}</div><h3>${editable?`${packs.length} packs ready`:'Collect your first cards'}</h3><p>Three cards in every pack. Any mix of borders, finishes, signature styles and legendary name rendering. Plus two loading screens you don't have yet, to use as card art.</p><p class="pack-odds">69% Common · 17% Rare · 10% Epic · 4% Legendary <small>Odds per card in a normal pack.</small></p><p>Three welcome packs when you first connect Steam. Earn one normal pack every eight hours, stored up to three. Upgrade packs are stored separately.</p>${offerLabel?`<aside class="pack-offer" role="status"><strong>Bonus pack unlocked</strong><span>You completed ${offerLabel}. Claim your one-time extra pack.</span><button type="button" data-claim-bonus>Claim bonus pack</button></aside>`:''}</div>${editable?`<div class="pack-list">${packs.map((min,i)=>`<button type="button" data-open="${i}" class="pack-box available" style="--rarity:${min==='screens'?SCREEN_PACK_COLOR:colors[min]}">${gift}<strong>${min==='screens'?'Loading screen pack':min==='common'?'Normal / welcome pack':`${min} upgrade pack`}</strong><small>${min==='screens'?'5 new loading screens':'3 cards + 2 screens'}</small></button>`).join('')}${normal<3?`<div class="pack-box charging" style="--rarity:${colors.common}">${gift}<strong>Next pack</strong><b data-pack-timer>--:--:--</b><small>${normal} / 3 normal packs stored</small></div>`:''}</div>`:'<button type="button" data-signin>Connect Steam</button>'}${editable?'<p class="pack-countdown" data-pack-countdown></p>':''}<div class="pack-results" aria-live="polite"></div>`;
    body.querySelector('.pack-intro')?.insertAdjacentHTML('beforeend',offerGuide);
    body.querySelector('[data-signin]')?.addEventListener('click',signIn);
    body.querySelector('[data-claim-bonus]')?.addEventListener('click',async()=>{const source=offers[0],data=await run('claim-bonus',{source});if(data){try{localStorage.removeItem(`ad2l-pack-offer:${source}`);}catch{}markPackOfferClaimed(source);drawPacks();say(data.alreadyClaimed?'This bonus was already claimed. Your collection is up to date.':'Bonus pack added to your collection.');}});
    body.querySelectorAll('[data-open]').forEach(b=>b.onclick=async()=>{
      const data=await run('open',{packIndex:Number(b.dataset.open)});if(!data)return;
      rewards=data.rewards;rewardScreens=data.screens??[];resultVisible=false;
      drawPacks();body.querySelector('.pack-results').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'nearest'});
    });
    updateCountdown();
    if(rewards.length||rewardScreens.length)showRewards();
  }
  function updateCountdown() {
    const label=body.querySelector('[data-pack-countdown]');if(!label||!state)return;
    const count=state.packs.filter(p=>p==='common').length;
    if(count>=3){label.textContent=`Normal packs: ${count} / 3. Storage full. Open one to start the eight-hour countdown.`;return;}
    label.textContent='';
    const timer=body.querySelector('[data-pack-timer]');
    if(state.nextPackAt==null){if(timer)timer.textContent='Soon';return;}
    const seconds=Math.max(0,Math.ceil((state.nextPackAt-Date.now()-clockOffset)/1000));
    const parts=[Math.floor(seconds/3600),Math.floor(seconds%3600/60),seconds%60].map(n=>String(n).padStart(2,'0'));
    if(timer)timer.textContent=parts.join(':');
    if(!seconds&&!busy&&Date.now()>timerRetryAt){timerRetryAt=Date.now()+15000;run('session',{}).then(data=>{if(data&&dialog.isConnected&&tab==='packs')drawPacks();});}
  }
  dialog._packTimer=setInterval(()=>{if(!dialog.isConnected){clearInterval(dialog._packTimer);clearTimeout(dialog._revealTimer);return;}updateCountdown();},1000);
  function showRewards() {
    const host=body.querySelector('.pack-results');if(!host)return;
    host.innerHTML=`<h3>Your pack</h3>${rewards.length?`<div class="reward-three ${resultVisible?'revealed':''}">${rewards.map((r,i)=>{const item=itemByKey(r.key);return `<button type="button" class="reward-card" style="--rarity:${colors[item.rarity]};--delay:${i*220}ms" aria-label="Reveal card ${i+1}" data-reveal><span class="reward-back">${gift}<b>AD2L</b></span><span class="reward-front">${swatch(item,name)}<small>${item.rarity} · ${item.type}</small><strong>${esc(item.name)}</strong><span>${r.duplicate?'Duplicate':'New discovery'}</span></span></button>`;}).join('')}</div>`:''}${rewardScreens.length?`<h4>${rewards.length?'Bonus loading screens':'New loading screens'}</h4><div class="reward-screens">${rewardScreens.map(screenArt).filter(Boolean).map(s=>`<figure><img src="${esc(s.src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"><figcaption><strong>${esc(s.label)}</strong><small>${esc(s.hero??'Any hero')} · New</small></figcaption></figure>`).join('')}</div><p class="muted">Use them as your card background in Customize, on the hero shown.</p>`:''}${rewards.length?'<button type="button" data-reveal-all>Reveal all three</button>':''}<button type="button" data-view-dex>View collection</button>`;
    host.querySelectorAll('[data-reveal]').forEach(b=>b.onclick=()=>{b.classList.add('revealed');b.setAttribute('aria-label',b.querySelector('.reward-front').textContent);});
    if(resultVisible)host.querySelectorAll('[data-reveal]').forEach(b=>b.setAttribute('aria-label',b.querySelector('.reward-front').textContent));
    const reveal=()=>{host.querySelector('.reward-three')?.classList.add('revealed');resultVisible=true;host.querySelectorAll('[data-reveal]').forEach(b=>b.setAttribute('aria-label',b.querySelector('.reward-front').textContent));};
    const all=host.querySelector('[data-reveal-all]');if(all)all.onclick=reveal;
    host.querySelector('[data-view-dex]').onclick=()=>{tab='collection';if(!rewards.length)filter='screen';draw();};
    if(!resultVisible){clearTimeout(dialog._revealTimer);dialog._revealTimer=setTimeout(reveal,650);}
  }
  function drawDex() {
    const count=CATALOG.filter(i=>inventory[i.key]>0).length;
    const savedEquipment=selectedEquipment();
    const previewEquipment=previewItem?{...savedEquipment,[previewItem.type]:previewItem.id}:{...savedEquipment};
    const owned=new Set(state?.screens??publicDesigns?.screens??[]),screen=previewScreen&&SCREEN_ART.find(s=>s.id===previewScreen);
    if(screen)previewEquipment.baseCard={...(savedEquipment.baseCard??{}),hero:screen.hero?HERO_META.find(([,n])=>n===screen.hero)?.[0]??null:savedEquipment.baseCard?.hero??null,art:screen.id,crop:null};
    // A name-rendering preview needs a signature to make the script visible.
    if(previewItem?.type==='translation'&&previewEquipment.autograph==='none')previewEquipment.autograph='brush-ink';
    body.innerHTML=`${cardSlotsHtml()}<div class="dex-progress"><strong>${count} / ${CATALOG.length} collected</strong><progress max="${CATALOG.length}" value="${count}" aria-label="Collection completion"></progress><small>${owned.size} / ${SCREEN_COUNT} bonus loading screens</small></div><div class="dex-layout"><div><div class="dex-filters"><label>Type <select data-filter>${['all','border','finish','autograph','translation'].map(t=>`<option value="${t}">${t}</option>`).join('')}<option value="screen">loading screens</option></select></label>${filter==='screen'?`<label>Hero <select data-screen-hero><option value="all">all</option><option value="any">any hero (events, teams)</option>${SCREEN_HEROES.map(h=>`<option value="${esc(h)}">${esc(h)}</option>`).join('')}</select></label>`:`<label>Rarity <select data-rarity-filter><option value="all">all</option>${TIERS.map(t=>`<option value="${t}">${t}</option>`).join('')}</select></label>`}<label>Show <select data-status><option value="all">All designs</option><option value="owned">Collected</option><option value="missing">Not collected</option></select></label></div><div class="dex-grid">${filter==='screen'?screenDexHtml(owned,status,screenHero,previewScreen):dexHtml(inventory,filter,status,name,savedEquipment,editable,rarity)}</div></div><aside class="dex-card-preview"><h3>${previewItem||screen?'Card preview':editable?'Your equipped card':'Equipped card'}</h3>${previewItem||screen?`<p class="dex-preview-note">Previewing ${esc(previewItem?.name??screen.label)}${(previewItem?inventory[previewItem.key]>0:owned.has(screen.id))?'':' - Not collected'}. Your saved card is unchanged.</p><button type="button" data-clear-preview>Show equipped card</button>`:''}<div data-dex-card>${cardHtml}</div><dl>${['border','finish','autograph','translation'].map(type=>`<dt>${type==='autograph'?'Signature':type==='translation'?'Name rendering':type}</dt><dd>${esc(itemByKey(`${type}:${previewEquipment[type]}`)?.name??({border:'Default grey',finish:'No finish',autograph:'No signature',translation:'Original name'}[type]))}</dd>`).join('')}</dl>${editable?'<button type="button" data-customize-card>Edit card design</button><p>Equip an item to save and update your card immediately.</p>':''}</aside></div>`;
    body.querySelector('[data-save]').insertAdjacentHTML('beforebegin',`<label class="particle-speed-control">Particle speed <output data-particle-speed-value>${equipment.particleSpeed}%</output><input type="range" data-particle-speed min="50" max="200" step="10" value="${equipment.particleSpeed}" ${editable?'':'disabled'}></label>`);
    wireCardSlots();
    const preview=body.querySelector('[data-dex-card] .ft-card');preview.dataset.designSlot=selectedSlot;preview.classList.remove('flipped');preview.querySelectorAll('button').forEach(b=>b.remove());applyEquipment(preview,previewEquipment,shownName());
    body.querySelectorAll('[data-preview]').forEach(b=>{b.setAttribute('aria-pressed',String(previewItem?.key===b.dataset.preview));b.onclick=()=>{previewItem=itemByKey(b.dataset.preview);previewScreen=null;drawDex();};});
    body.querySelectorAll('[data-preview-screen]').forEach(b=>b.onclick=()=>{previewScreen=b.dataset.previewScreen;previewItem=null;drawDex();});
    body.querySelector('[data-clear-preview]')?.addEventListener('click',()=>{previewItem=null;previewScreen=null;drawDex();});
    body.querySelector('[data-customize-card]')?.addEventListener('click',()=>{equipment={...savedEquipment};initialEquipment=JSON.stringify(equipment);tab='customize';draw();});
    const oldStatus=body.querySelector('[data-status]');oldStatus.parentElement.innerHTML=`<span>Show only collected</span><input type="checkbox" data-status ${status==='owned'?'checked':''}>`;
    const f=body.querySelector('[data-filter]'),s=body.querySelector('[data-status]'),rr=body.querySelector('[data-rarity-filter]'),sh=body.querySelector('[data-screen-hero]');f.value=filter;f.querySelector('option[value="translation"]')?.replaceChildren('modifier');
    if(rr){rr.value=rarity;rr.onchange=()=>{rarity=rr.value;drawDex();};}
    if(sh){sh.value=screenHero;sh.onchange=()=>{screenHero=sh.value;drawDex();};}
    f.onchange=()=>{filter=f.value;drawDex();};s.onchange=()=>{status=s.checked?'owned':'all';drawDex();};
    body.querySelectorAll('[data-equip]').forEach(b=>{b.onclick=async()=>{
      const item=itemByKey(b.dataset.equip),next={...savedEquipment,[item.type]:item.id};
      const data=await run('equip',{equipment:next});
      if(data){previewItem=null;equipment=selectedEquipment();initialEquipment=JSON.stringify(equipment);drawDex();say(`${item.name} equipped. Card saved.`);}
    };});
  }
  function select(type,defaultName) {
    return `<label>${type==='autograph'?'Signature style':type==='translation'?'Modifier':type}<select data-equipment="${type}"><option value="${DEFAULT_EQUIPMENT[type]}">${defaultName}</option>${CATALOG.filter(i=>i.type===type&&inventory[i.key]>0).map(i=>`<option value="${i.id}">${esc(i.name)}</option>`).join('')}</select></label>`;
  }
  function visualTextChoices(type) {
    const items=[{id:DEFAULT_EQUIPMENT[type],name:type==='autograph'?'No signature':'No modifier'},...CATALOG.filter(i=>i.type===type&&inventory[i.key]>0)];
    return `<fieldset class="visual-text-options"><legend>${type==='autograph'?'Signature style':'Modifier'}</legend><div>${items.map(item=>`<button type="button" data-text-choice="${type}" data-choice="${item.id}" aria-pressed="${equipment[type]===item.id}" ${editable?'':'disabled'}><span data-text-choice-preview></span><strong>${esc(item.name)}</strong><small data-choice-status>${equipment[type]===item.id?'Selected':'Select'}</small></button>`).join('')}</div></fieldset>`;
  }
  function drawEditor() {
    const imageOpen=body.querySelector('.card-settings:last-of-type')?.open??false;
    if(!equipment.baseCard) {
      const template=document.createElement('template');template.innerHTML=cardHtml;
      const card=template.content.querySelector('.ft-card');
      equipment.baseCard={hero:Number(card.dataset.cardHero)||null,pos:Number(card.dataset.cardPos)||null,art:card.dataset.cardArt||null,style:card.dataset.cardStyle||null,crop:JSON.parse(card.dataset.cardCrop||'null')};
      initialEquipment=JSON.stringify(equipment);
    }
    const base=equipment.baseCard;
    const template=document.createElement('template');template.innerHTML=cardHtml;
    const effectiveHero=base.hero||Number(template.content.querySelector('.ft-card').dataset.autoHero);
    const artOptions=cardArtOptions(effectiveHero,state?.screens??(String(base.art??'').startsWith('scr:')?[base.art]:[]));
    body.innerHTML=`${editable?'<div data-name-editor></div>':''}${cardSlotsHtml()}<div class="card-editor"><div data-card-editor>${cardHtml}<p>Drag the artwork to adjust its framing. Drag the signature separately; arrow keys move the focused signature one step.</p></div><div class="card-editor-controls">${select('border','Default grey')}${select('finish','No finish')}<label class="emblem-toggle"><input type="checkbox" data-emblem ${equipment.emblem===false?'':'checked'} ${editable?'':'disabled'}> Show border symbol</label><details class="card-settings" open><summary>Text settings</summary><div>${visualTextChoices('autograph')}${visualTextChoices('translation')}<p>Signatures use your player name.</p><details class="image-adjustments"><summary>Signature positioning</summary><div>${[['x','Horizontal',0,100],['y','Vertical',0,100],['size','Size',5,30],['rotation','Rotation',-180,180]].map(([k,label,min,max])=>`<label>${label} <output data-value="${k}">${Math.round(equipment[k])}</output><input type="range" data-position="${k}" min="${min}" max="${max}" value="${equipment[k]}"></label>`).join('')}<button type="button" data-reset>Reset signature placement</button></div></details></div></details><details class="card-settings" ${imageOpen?'open':''}><summary>Image settings</summary><div><label>Hero<select data-base="hero"><option value="">Most played hero</option>${[...HERO_META].sort((a,b)=>a[1].localeCompare(b[1])).map(([id,name])=>`<option value="${id}">${esc(name)}</option>`).join('')}</select></label><div data-image-gallery></div><details class="image-adjustments"><summary>Hue &amp; positioning</summary><div><label>Hue <output data-hue-value>${equipment.hue??0}</output><input type="range" data-hue min="0" max="360" value="${equipment.hue??0}"></label>${[['x','Image horizontal',0,100,1],['y','Image vertical',0,100,1],['zoom','Image zoom',1,3,.01]].map(([key,label,min,max,step])=>`<label>${label}<input type="range" data-crop="${key}" min="${min}" max="${max}" step="${step}" value="${(base.crop??defaultCardCrop(cardArtwork(effectiveHero,base)))[key]}"></label>`).join('')}</div></details></div></details>${layoutControlsHtml()}<button type="button" data-save>Save my card</button></div></div>`;
    wireCardSlots();
    if(editable)mountNameEditor(body.querySelector('[data-name-editor]'),{state,inGame:name,action,onSaved:next=>{state=next;draw();say(shownNickname(next)?`Showing ${shownNickname(next)} on your cards and profile.`:'Showing your in-game name.');}});
    const card=body.querySelector('.ft-card');card.dataset.designSlot=selectedSlot;card.classList.remove('flipped');
    card.querySelectorAll('button').forEach(b=>b.remove());
    const update=()=>{applyEquipment(card,equipment,shownName());wireSignature();say(JSON.stringify(equipment)===initialEquipment?'':'Unsaved card changes');};
    const speedControl=body.querySelector('.particle-speed-control'),speedInput=body.querySelector('[data-particle-speed]');
    const syncParticleControl=()=>{speedControl.hidden=!PARTICLE_FINISHES.includes(equipment.finish);speedInput.value=equipment.particleSpeed;body.querySelector('[data-particle-speed-value]').textContent=`${equipment.particleSpeed}%`;};
    speedInput.oninput=()=>{equipment.particleSpeed=Number(speedInput.value);syncParticleControl();update();};syncParticleControl();
    wireLayout(card,update);
    const refreshTextChoices=()=>body.querySelectorAll('[data-text-choice]').forEach(button=>{
      const type=button.dataset.textChoice,id=button.dataset.choice,selected=equipment[type]===id;
      button.setAttribute('aria-pressed',String(selected));button.querySelector('[data-choice-status]').textContent=selected?'Selected':'Select';
      const preview=button.querySelector('[data-text-choice-preview]');
      if(type==='autograph')preview.innerHTML=id==='none'?'<span class="no-signature-preview">—</span>':`<span class="collection-swatch signature-sample">${signatureHtml({...equipment,autograph:id},shownName()).replace('card-autograph','collection-signature')}</span>`;
      else {preview.className=`name-rendering-preview ${id}`;preview.textContent=renderedName(shownName(),id);}
    });
    body.querySelectorAll('[data-text-choice]').forEach(button=>button.onclick=()=>{equipment[button.dataset.textChoice]=button.dataset.choice;refreshTextChoices();update();});
    refreshTextChoices();
    function drawImageGallery() {
      const host=body.querySelector('[data-image-gallery]'),scrolls=[...host.querySelectorAll('.image-choice-strip')].map(el=>el.scrollLeft);
      const currentArt=cardArtwork(effectiveHero,base);
      const thumbnail=(art,style)=>art?`<span class="ft-art-thumb ${esc(art.cls??'')}" data-style="${esc(style)}"><span class="ft-art"><img src="${esc(art.src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span></span>`:'<span class="image-choice-empty">Choose a hero</span>';
      host.innerHTML=`<fieldset class="image-choice-group"><legend>Background</legend><div class="image-choice-strip">${artOptions.map(art=>`<button type="button" data-image-choice="art" data-choice="${esc(art.id??'')}" aria-pressed="${(base.art??null)===art.id}" ${editable?'':'disabled'}>${thumbnail(art,currentArt?.style??'stencil')}<strong>${esc(art.label)}</strong></button>`).join('')||'<p>Choose a hero to see backgrounds.</p>'}</div></fieldset><fieldset class="image-choice-group"><legend>Image style</legend><div class="image-choice-strip">${[[null,'Site default'],...CARD_STYLES].map(([id,label])=>`<button type="button" data-image-choice="style" data-choice="${id??''}" aria-pressed="${(base.style??null)===id}" ${editable?'':'disabled'}>${thumbnail(currentArt,id??cardArtwork(effectiveHero,{art:base.art})?.style??'stencil')}<strong>${label}</strong></button>`).join('')}</div></fieldset>`;
      host.querySelectorAll('.image-choice-strip').forEach((el,i)=>el.scrollLeft=scrolls[i]??0);
      host.querySelectorAll('[data-image-choice]').forEach(button=>button.onclick=()=>{
        const type=button.dataset.imageChoice;base[type]=button.dataset.choice||null;
        if(type==='art') {if(base.art&&!base.hero)base.hero=effectiveHero;base.crop=null;body.querySelectorAll('[data-crop]').forEach(input=>input.value=defaultCardCrop(cardArtwork(effectiveHero,base))[input.dataset.crop]);}
        update();drawImageGallery();
        host.querySelector(`[data-image-choice="${type}"][data-choice="${CSS.escape(button.dataset.choice)}"]`)?.focus({preventScroll:true});
      });
    }
    drawImageGallery();
    body.querySelectorAll('[data-equipment]').forEach(s=>{s.value=equipment[s.dataset.equipment];s.disabled=!editable;s.onchange=()=>{equipment[s.dataset.equipment]=s.value;syncParticleControl();update();};});
    body.querySelectorAll('[data-base]').forEach(s=>{
      const key=s.dataset.base;s.value=base[key]??'';
      s.onchange=()=>{base[key]=key==='hero'?(Number(s.value)||null):(s.value||null);if(key==='hero'){base.art=null;base.crop=null;drawEditor();}else {if(key==='art'){if(base.art&&!base.hero)base.hero=effectiveHero;base.crop=null;}update();}};
    });
    body.querySelector('[data-emblem]').onchange=e=>{equipment.emblem=e.target.checked;update();};
    body.querySelector('[data-hue]').oninput=e=>{equipment.hue=Number(e.target.value);body.querySelector('[data-hue-value]').textContent=equipment.hue;update();};
    body.querySelectorAll('[data-crop]').forEach(input=>input.oninput=()=>{base.crop??=defaultCardCrop(cardArtwork(effectiveHero,base));base.crop[input.dataset.crop]=Number(input.value);update();});
    body.querySelectorAll('[data-position]').forEach(input=>input.oninput=()=>{equipment[input.dataset.position]=Number(input.value);syncControls();update();});
    const syncControls=()=>body.querySelectorAll('[data-position]').forEach(input=>{input.value=equipment[input.dataset.position];body.querySelector(`[data-value="${input.dataset.position}"]`).textContent=Math.round(equipment[input.dataset.position]);});
    const front=card.querySelector('.ft-front');let pan=null;
    front.onpointerdown=e=>{
      if(!editable||busy||!effectiveHero||e.button!==0||e.target.closest('.card-autograph,[data-part],a,button'))return;
      const rect=front.getBoundingClientRect();
      pan={id:e.pointerId,x:e.clientX,y:e.clientY,width:rect.width,height:rect.height,crop:{...(base.crop??defaultCardCrop(cardArtwork(effectiveHero,base)))}};
      front.setPointerCapture(e.pointerId);front.classList.add('panning');e.preventDefault();
    };
    front.onpointermove=e=>{
      if(!pan||e.pointerId!==pan.id)return;
      const dx=e.clientX-pan.x,dy=e.clientY-pan.y;if(Math.abs(dx)+Math.abs(dy)<2)return;
      const clamp=n=>Math.round(Math.max(0,Math.min(100,n))*10)/10;
      base.crop={x:clamp(pan.crop.x-dx/pan.width*100),y:clamp(pan.crop.y-dy/pan.height*100),zoom:pan.crop.zoom};
      card.classList.add('ft-custom-crop');card.style.setProperty('--art-x',`${base.crop.x}%`);card.style.setProperty('--art-y',`${base.crop.y}%`);card.style.setProperty('--art-zoom',base.crop.zoom);
      body.querySelectorAll('[data-crop]').forEach(input=>input.value=base.crop[input.dataset.crop]);say('Unsaved card changes');
    };
    const stopPan=e=>{if(pan?.id!==e.pointerId)return;pan=null;front.classList.remove('panning');if(front.hasPointerCapture(e.pointerId))front.releasePointerCapture(e.pointerId);};
    front.onpointerup=stopPan;front.onpointercancel=stopPan;front.onlostpointercapture=()=>{pan=null;front.classList.remove('panning');};
    function wireSignature() {
      const sig=card.querySelector('.card-autograph');if(!sig)return;sig.tabIndex=editable?0:-1;sig.setAttribute('role','img');
      sig.onpointerdown=e=>{
        if(!editable)return;e.preventDefault();const rect=card.querySelector('.ft-front').getBoundingClientRect();sig.setPointerCapture(e.pointerId);
        const start={px:e.clientX,py:e.clientY,x:equipment.x,y:equipment.y};
        sig.onpointermove=ev=>{equipment.x=Math.max(0,Math.min(100,start.x+(ev.clientX-start.px)/rect.width*100));equipment.y=Math.max(0,Math.min(100,start.y+(ev.clientY-start.py)/rect.height*100));sig.style.left=equipment.x+'%';sig.style.top=equipment.y+'%';syncControls();say('Unsaved card changes');};
        sig.onpointerup=()=>{sig.onpointermove=null;};sig.onpointercancel=sig.onpointerup;
      };
      sig.onkeydown=e=>{const d={ArrowLeft:['x',-1],ArrowRight:['x',1],ArrowUp:['y',-1],ArrowDown:['y',1]}[e.key];if(!editable||!d)return;e.preventDefault();equipment[d[0]]=Math.max(0,Math.min(100,equipment[d[0]]+d[1]));syncControls();update();card.querySelector('.card-autograph').focus();};
    }
    body.querySelector('[data-save]').disabled=!editable;
    body.querySelector('[data-save]').onclick=async()=>{const data=await run('equip',{equipment},()=>{initialEquipment=JSON.stringify(equipment);document.querySelectorAll(`.ft-card[data-pick="${own}"]`).forEach(c=>applyEquipment(c,c.dataset.designSlot!=null?(state.cardDesigns?.[Number(c.dataset.designSlot)]??state.equipment):state.equipment,c.dataset.playerName??name));});if(data){equipment=selectedEquipment();initialEquipment=JSON.stringify(equipment);drawEditor();say(`Card ${selectedSlot+1} saved.`);}};
    body.querySelector('[data-reset]').onclick=()=>{Object.assign(equipment,{x:50,y:60,size:15,rotation:-7});syncControls();update();};
    if(!editable)body.querySelectorAll('input,select,button').forEach(n=>n.disabled=true);
    update();
  }
  // Layout (lib/card-layout.js): the card's name and its size, each front part shown or hidden,
  // sized and dragged anywhere, and the back's stats and sections.
  const layoutOf=()=>equipment.layout??={name:null,nameSize:100,front:{},back:{stats:null,positions:true,heroes:true}};
  function layoutControlsHtml() {
    const L=equipment.layout,role=Number(new DOMParser().parseFromString(cardHtml,'text/html').querySelector('.ft-card')?.dataset.role)||0;
    const stats=backStats(L,role),part=k=>L?.front?.[k];
    const statSelect=i=>`<select data-back-stat="${i}" aria-label="Back stat ${i+1}"><option value="">Empty</option>${BACK_STATS.map(([k,label])=>`<option value="${k}"${stats[i]===k?' selected':''}>${esc(label)}</option>`).join('')}</select>`;
    return `<details class="card-settings card-layout-settings"><summary>Layout settings</summary><div>
      <label>Card name <input type="text" data-layout-name maxlength="${MAX_NAME}" placeholder="${esc(name)}" value="${esc(L?.name??'')}"></label>
      <label>Name size <output data-layout-namesize-value>${L?.nameSize??100}%</output><input type="range" data-layout-namesize min="40" max="160" value="${L?.nameSize??100}"></label>
      <fieldset class="layout-parts"><legend>Front</legend><p>Drag any text on the card to move it.</p>${FRONT_PARTS.map(([k,label])=>`<div class="layout-part"><label><input type="checkbox" data-part-show="${k}"${part(k)?.show===false?'':' checked'}> ${label}</label><input type="range" data-part-size="${k}" min="40" max="250" value="${part(k)?.size??100}" aria-label="${label} size"><button type="button" data-part-reset="${k}">Reset</button></div>`).join('')}</fieldset>
      <fieldset class="layout-back"><legend>Back</legend><div class="layout-stats">${Array.from({length:MAX_BACK_STATS},(_,i)=>statSelect(i)).join('')}</div>
      <label><input type="checkbox" data-back-section="positions"${L?.back?.positions===false?'':' checked'}> Positions played</label>
      <label><input type="checkbox" data-back-section="heroes"${L?.back?.heroes===false?'':' checked'}> Top heroes</label></fieldset>
      <button type="button" data-layout-flip>Show the back</button> <button type="button" data-layout-reset>Reset layout</button>
    </div></details>`;
  }
  function wireLayout(card,update) {
    const front=card.querySelector('.ft-front'),q=sel=>body.querySelector(sel);
    q('[data-layout-name]').oninput=e=>{layoutOf().name=e.target.value.trim()||null;update();};
    q('[data-layout-namesize]').oninput=e=>{layoutOf().nameSize=Number(e.target.value);q('[data-layout-namesize-value]').textContent=`${e.target.value}%`;update();};
    const partOf=k=>layoutOf().front[k]??={show:true,x:null,y:null,size:100};
    body.querySelectorAll('[data-part-show]').forEach(b=>b.onchange=()=>{partOf(b.dataset.partShow).show=b.checked;update();});
    body.querySelectorAll('[data-part-size]').forEach(r=>r.oninput=()=>{partOf(r.dataset.partSize).size=Number(r.value);update();});
    body.querySelectorAll('[data-part-reset]').forEach(b=>b.onclick=()=>{delete layoutOf().front[b.dataset.partReset];const k=b.dataset.partReset;body.querySelector(`[data-part-show="${k}"]`).checked=true;body.querySelector(`[data-part-size="${k}"]`).value=100;update();});
    const readStats=()=>{const keys=[...body.querySelectorAll('[data-back-stat]')].map(s=>s.value).filter(Boolean);layoutOf().back.stats=[...new Set(keys)];update();};
    body.querySelectorAll('[data-back-stat]').forEach(s=>s.onchange=readStats);
    body.querySelectorAll('[data-back-section]').forEach(b=>b.onchange=()=>{layoutOf().back[b.dataset.backSection]=b.checked;update();});
    q('[data-layout-flip]').onclick=e=>{const on=!card.classList.contains('flipped');card.classList.toggle('flipped',on);e.target.textContent=on?'Show the front':'Show the back';};
    q('[data-layout-reset]').onclick=()=>{delete equipment.layout;drawEditor();};
    // Drag a part: it leaves the plate and centres on the pointer, in percent of the face.
    front.addEventListener('pointerdown',e=>{
      const el=e.target.closest('[data-part]');if(!el||!editable||busy||e.button!==0)return;
      e.preventDefault();e.stopPropagation();
      const k=el.dataset.part,rect=front.getBoundingClientRect(),box=el.getBoundingClientRect();
      const p=partOf(k),off={x:e.clientX-(box.left+box.width/2),y:e.clientY-(box.top+box.height/2)};
      const at=ev=>{p.x=Math.round(Math.max(0,Math.min(100,(ev.clientX-off.x-rect.left)/rect.width*100))*10)/10;p.y=Math.round(Math.max(0,Math.min(100,(ev.clientY-off.y-rect.top)/rect.height*100))*10)/10;applyLayout(card,equipment.layout,name);say('Unsaved card changes');};
      const move=ev=>at(ev),up=()=>{removeEventListener('pointermove',move);removeEventListener('pointerup',up);update();};
      addEventListener('pointermove',move);addEventListener('pointerup',up);
    },true);
  }
  // Recycle: your spare copies (all but the last of each) as cards, dragged (or clicked) into a
  // ten-slot bin. The bin takes one rarity, set by the first card in it.
  function drawRecycle() {
    if(!editable){body.innerHTML='<p>Sign in with Steam to recycle duplicate cards.</p>';return;}
    const bin=[];
    const spare=k=>(inventory[k]??0)-1-bin.filter(x=>x===k).length;
    const binTier=()=>bin.length?itemByKey(bin[0]).rarity:null;
    const fits=i=>bin.length<RECYCLE_COST&&spare(i.key)>0&&(!binTier()||binTier()===i.rarity);
    const binIcon=`<svg class="recycle-bin-icon" viewBox="0 0 64 64" aria-hidden="true"><g class="recycle-bin-lid"><path d="M10 15h44"/><path d="M25 15v-5h14v5"/></g><path d="M14 21l4 35h28l4-35z"/><path d="M26 29v20M32 29v20M38 29v20"/></svg>`;
    body.innerHTML=`<div class="recycle-head"><h3>${RECYCLE_COST} duplicates → an upgrade pack</h3><p>Drag spare copies into the bin, or click them. ${RECYCLE_COST} of one rarity make an upgrade pack whose three cards are all at least the next rarity. Your last copy of each card stays safe. Legendary cards can't be recycled.</p></div><div class="recycle-layout"><div class="recycle-pool"></div><aside class="recycle-bin" data-bin aria-label="Recycle bin"><div class="recycle-bin-drop">${binIcon}<strong data-bin-label></strong></div><ol class="recycle-slots"></ol><button type="button" data-recycle disabled>Recycle 0 / ${RECYCLE_COST}</button><button type="button" class="linkish" data-empty-bin hidden>Empty bin</button></aside></div>`;
    const pool=body.querySelector('.recycle-pool'),binEl=body.querySelector('[data-bin]');
    const paint=()=>{
      const groups=TIERS.slice(0,3).map(t=>[t,CATALOG.filter(i=>i.rarity===t&&(inventory[i.key]??0)>1)]).filter(([,items])=>items.length);
      pool.innerHTML=groups.map(([t,items])=>`<section class="recycle-group"><h4 style="--rarity:${colors[t]}">${t} <small>→ ${TIERS[TIERS.indexOf(t)+1]} pack</small></h4><div class="recycle-grid">${items.map(i=>{const n=spare(i.key);return `<button type="button" class="recycle-card${n?'':' spent'}" data-key="${i.key}" style="--rarity:${colors[i.rarity]}" ${fits(i)?'':'aria-disabled="true"'} title="${n?(fits(i)?'Drag into the bin':bin.length>=RECYCLE_COST?'The bin is full':`The bin holds ${binTier()} cards`):'No spare copies left'}">${swatch(i,name)}<small>${i.type}</small><strong>${esc(i.name)}</strong><span class="recycle-spare">${n} spare</span></button>`;}).join('')}</div></section>`).join('')||'<p class="recycle-empty">No duplicates yet. Open packs, and any card you get twice shows up here.</p>';
      const tier=binTier();
      binEl.style.setProperty('--rarity',tier?colors[tier]:'#7d7489');
      binEl.classList.toggle('full',bin.length===RECYCLE_COST);
      binEl.querySelector('[data-bin-label]').textContent=tier?`${bin.length} / ${RECYCLE_COST} ${tier} → ${TIERS[TIERS.indexOf(tier)+1]} pack`:'Drop duplicates here';
      binEl.querySelector('.recycle-slots').innerHTML=Array.from({length:RECYCLE_COST},(_,s)=>{const i=bin[s]&&itemByKey(bin[s]);return i?`<li><button type="button" class="recycle-slot filled" data-slot="${s}" style="--rarity:${colors[i.rarity]}" aria-label="Take ${esc(i.name)} out of the bin">${swatch(i,name)}<span>${esc(i.name)}</span><b aria-hidden="true">×</b></button></li>`:'<li><span class="recycle-slot"></span></li>';}).join('');
      const go=binEl.querySelector('[data-recycle]');go.textContent=`Recycle ${bin.length} / ${RECYCLE_COST}`;go.disabled=busy||bin.length!==RECYCLE_COST;
      binEl.querySelector('[data-empty-bin]').hidden=!bin.length;
      pool.querySelectorAll('.recycle-card').forEach(b=>{b.onclick=()=>{if(b._dragged){b._dragged=false;return;}add(b.dataset.key);};b.onpointerdown=e=>drag(e,b);});
      binEl.querySelectorAll('[data-slot]').forEach(b=>b.onclick=()=>{bin.splice(Number(b.dataset.slot),1);paint();});
    };
    const add=key=>{
      const i=itemByKey(key);
      if(!fits(i)){say(spare(key)<1?`No spare ${i.name} left.`:bin.length>=RECYCLE_COST?'The bin is full. Recycle, or take a card out.':`The bin holds ${binTier()} cards. Empty it to recycle ${i.rarity}.`);binEl.classList.remove('reject');void binEl.offsetWidth;binEl.classList.add('reject');return;}
      bin.push(key);say('');paint();
      const slot=binEl.querySelectorAll('.recycle-slot.filled')[bin.length-1];slot?.classList.add('arrived');
    };
    // Drag: past a few pixels the card's swatch follows the pointer; dropping it on the bin adds one copy.
    const drag=(e,card)=>{
      if(busy||e.button!==0)return;
      const start={x:e.clientX,y:e.clientY},item=itemByKey(card.dataset.key);let ghost=null,offset=null;
      const over=ev=>{const r=binEl.getBoundingClientRect();return ev.clientX>=r.left&&ev.clientX<=r.right&&ev.clientY>=r.top&&ev.clientY<=r.bottom;};
      const move=ev=>{
        if(!ghost){
          if(Math.abs(ev.clientX-start.x)+Math.abs(ev.clientY-start.y)<6)return;
          ghost=document.createElement('div');ghost.className='recycle-ghost';ghost.style.setProperty('--rarity',colors[item.rarity]);ghost.innerHTML=swatch(item,name);
          dialog.append(ghost);const r=ghost.getBoundingClientRect();offset={x:r.left,y:r.top};// the dialog can be the fixed-position containing block
          card.classList.add('lifted');binEl.classList.add('awaiting');
        }
        ghost.style.transform=`translate(${ev.clientX-offset.x-60}px,${ev.clientY-offset.y-36}px) rotate(${Math.max(-12,Math.min(12,(ev.clientX-start.x)/20))}deg)`;
        const on=over(ev);binEl.classList.toggle('over',on&&fits(item));binEl.classList.toggle('refuse',on&&!fits(item));
      };
      const up=ev=>{
        removeEventListener('pointermove',move);removeEventListener('pointerup',up);removeEventListener('pointercancel',up);
        binEl.classList.remove('over','refuse','awaiting');card.classList.remove('lifted');
        if(!ghost)return;
        card._dragged=true;setTimeout(()=>card._dragged=false,0);ghost.remove();
        if(ev.type==='pointerup'&&over(ev))add(item.key);
      };
      addEventListener('pointermove',move);addEventListener('pointerup',up);addEventListener('pointercancel',up);
    };
    binEl.onanimationend=()=>binEl.classList.remove('reject');
    binEl.querySelector('[data-empty-bin]').onclick=()=>{bin.length=0;say('');paint();};
    binEl.querySelector('[data-recycle]').onclick=async()=>{
      const selections={};bin.forEach(k=>selections[k]=(selections[k]??0)+1);
      const data=await run('recycle',{selections});if(!data)return;
      binEl.classList.add('crushing');
      const done=()=>{if(!dialog.isConnected||tab!=='recycle')return;tab='packs';onTab?.(tab);draw();say(`Upgrade pack ready: ${data.minimum} or better on all three cards.`);};
      setTimeout(done,matchMedia('(prefers-reduced-motion: reduce)').matches?0:900);
    };
    paint();
  }
  draw();
}

export async function mountGift() {
  let button=document.getElementById('collection-gift');
  if(!button){button=document.createElement('button');button.id='collection-gift';button.className='collection-gift';button.type='button';button.innerHTML=gift+'<span></span>';document.getElementById('me')?.before(button);button.onclick=()=>{const tab=document.querySelector('#nav a[data-nav="gallery"]');if(!tab)return openCollection();const a=document.createElement('a');a.href=`${tab.getAttribute('href').replace(/\/$/,'')}/packs`;document.body.append(a);a.click();a.remove();};}
  const account=await steamAccount().catch(()=>null);
  button.title='Packs and collection';button.setAttribute('aria-label','Open packs and collection');
  if(account!=null) {
    try {const {state}=await collectionAction('session');updateGift(state);}catch {button.title='Packs and collection · service unavailable';}
  }
}
function updateGift(state) {const b=document.getElementById('collection-gift');if(b){const offer=availablePackOffers(state).length>0,packs=state?.packs.length??0;b.querySelector('span').textContent=packs||'';b.classList.toggle('has-offer',offer);b.setAttribute('aria-label',offer?`Bonus pack offer available; ${packs} packs available`:`Packs and collection: ${packs} packs available`);}}
addEventListener('collection-change',e=>updateGift(e.detail.state));
addEventListener('pack-offer-change',()=>updateGift(collectionState()));

export async function mountProfileCollection(host,{account,name,matches,team,tier}) {
  const section=document.createElement('section');section.className='profile-collection panel';section.innerHTML='<h3>Card collection</h3><p>Loading collection…</p>';host.querySelector('.page-head')?.after(section);
  try {
    const [data,cards]=await Promise.all([publicCollection(account).catch(()=>({inventory:{},unavailable:true})),listCards().catch(()=>new Map())]);if(!section.isConnected)return;
    if(data.equipment)cards.set(account,{...cards.get(account),cosmetics:{...data.equipment,nickname:data.nickname??null}});
    profileTitle(data.nickname,name);
    const count=CATALOG.filter(i=>data.inventory[i.key]>0).length,renderer=createPlayerCards(matches,{cards,tiers:new Map(tier?[[String(account),tier]]:[])});
    const preferences=cardDesignState(data),player={account,name,team:team??'AD2L'};
    const cardHtml=PAINT_FILTER+renderer.card(player,null,{own:true,equipmentOverride:preferences.cardDesigns[preferences.primaryCard]});
    const showcase=preferences.cardDesigns.map((equipment,i)=>equipment?`<figure>${renderer.card(player,null,{own:true,equipmentOverride:equipment}).replace('data-pick=',`data-design-slot="${i}" data-pick=`)}<figcaption>Card ${i+1}${i===preferences.primaryCard?' · Primary':''}</figcaption></figure>`:'').join('');
    section.innerHTML=`<div class="profile-collection-card profile-card-designs">${PAINT_FILTER}${showcase||cardHtml}</div><div><h3>Card collection</h3>${preferences.shuffleCards?'<p>Saved cards are on shuffle for other viewers.</p>':''}${data.unavailable?'<p>Collection service is currently unavailable.</p>':`<strong>${count} / ${CATALOG.length} discovered</strong><progress value="${count}" max="${CATALOG.length}" aria-label="Collection completion"></progress>`}<button type="button" data-profile-collection>View collection & cards</button></div>`;
    section.querySelector('[data-profile-collection]').onclick=()=>openCollection({tab:'collection',viewAccount:account,cardHtml,name});
    wirePlayerCards(section.querySelector('.profile-collection-card'));
    if(showcase)mountRatings(section,account).catch(()=>{});
    steamAccount().catch(()=>null).then(async viewer=>{
      if(String(viewer)!==String(account)||!section.isConnected)return;
      const state=collectionState()??(await collectionAction('session')).state;
      const host=document.createElement('div');section.lastElementChild.append(host);
      mountNameEditor(host,{state,inGame:name,onSaved:next=>profileTitle(next.showNickname?next.nickname:null,name)});
    }).catch(()=>{});
  } catch {if(section.isConnected)section.innerHTML='<h3>Card collection</h3><p>Collection service is unavailable. Try again shortly.</p><button type="button">View designs</button>';section.querySelector('button')?.addEventListener('click',()=>openCollection({tab:'collection',viewAccount:account,name}));}
}

// Ratings under each saved design: the counts and the community's pick for everyone, and for a
// signed-in player on someone else's card, a vote (one per design; the Worker keeps it to that).
// Your own votes come from the Worker (myCardVotes), so they follow you between devices.
const RATING_NAMES={common:'Common',rare:'Rare',epic:'Epic',legendary:'Legendary'};
function ratingHtml(r,{canVote,viewer,mine}) {
  return `<div class="card-rating" data-rating-slot="${r.slot}"><p class="card-rating-pick">${r.total?`Rated <b data-rarity="${r.pick}">${RATING_NAMES[r.pick]}</b> · ${r.total} vote${r.total===1?'':'s'}`:'No ratings yet'}</p>
    <div class="card-rating-bar" aria-hidden="true">${RATINGS.map(k=>`<i data-rarity="${k}" style="flex:${r.counts[k]}"></i>`).join('')}</div>
    <div class="card-rating-votes" role="group" aria-label="Rate this card">${RATINGS.map(k=>`<button type="button" data-rate="${k}" data-rarity="${k}" aria-pressed="${mine===k}"${canVote?'':' disabled'} title="${canVote?`Rate it ${RATING_NAMES[k]}`:viewer==null?'Sign in with Steam to rate cards':'You can\'t rate your own card'}">${RATING_NAMES[k]} <small>${r.counts[k]}</small></button>`).join('')}</div></div>`;
}
// Puts rating r (one of account's designs) under fig and wires its buttons. votes is the viewer's
// own votes by "<owner>:<key>", updated in place; onVote runs after a vote is saved.
function mountRating(fig,account,r,{viewer,votes,onVote}) {
  const canVote=viewer!=null&&String(viewer)!==String(account);
  const draw=rating=>{
    fig.querySelector('.card-rating')?.remove();
    fig.insertAdjacentHTML('beforeend',ratingHtml(rating,{canVote,viewer,mine:votes[`${account}:${rating.key}`]??null}));
    fig.querySelectorAll('[data-rate]').forEach(b=>b.onclick=async()=>{
      const pick=b.getAttribute('aria-pressed')==='true'?null:b.dataset.rate;
      fig.querySelectorAll('[data-rate]').forEach(x=>x.disabled=true);
      try {
        const {rating:next}=await collectionAction('rate',{target:Number(account),cardSlot:rating.slot,rating:pick});
        if(next.mine)votes[`${account}:${next.key}`]=next.mine;else delete votes[`${account}:${next.key}`];
        draw(next);onVote?.(next);
      } catch(e) {fig.querySelectorAll('[data-rate]').forEach(x=>x.disabled=!canVote);fig.querySelector('.card-rating-pick').textContent=e.message;}
    });
  };
  draw(r);
}
async function mountRatings(section,account) {
  const [cards,viewer]=await Promise.all([cardRatings(account),steamAccount().catch(()=>null)]);
  const votes=viewer==null?{}:await myCardVotes().catch(()=>({}));
  if(!section.isConnected)return;
  for(const r of cards) {
    const fig=r&&section.querySelector(`[data-design-slot="${r.slot}"]`)?.closest('figure');
    if(fig)mountRating(fig,account,r,{viewer,votes});
  }
}

// The Gallery: every saved card anyone in the league has changed, with its rating. Sorted by the
// community's rating (legendary first; among equals, the clearer verdict, then more votes), by
// votes, or by name. "Not rated by me" leaves the cards a signed-in player can still rate.
const PICK_RANK={legendary:4,epic:3,rare:2,common:1};
async function drawGallery(body,{viewer,signIn}) {
  body.innerHTML='<p>Loading gallery…</p>';
  let cards,votes,teams,matches,overrides;
  try {
    [cards,votes,teams,matches,overrides]=await Promise.all([galleryCards(),viewer==null?{}:myCardVotes().catch(()=>({})),
      SOURCES.all.data().then(d=>d.teams).catch(()=>[]),allLoad().catch(()=>[]),listCards().catch(()=>new Map())]);
  } catch(e) {body.innerHTML=`<p>${esc(e.message)}</p>`;return;}
  if(!body.isConnected)return;
  const roster=new Map(teams.flatMap(t=>t.players.map(p=>[String(p.account_id),{name:p.name,team:t.name,league:t.league}])));
  const renderer=createPlayerCards(matches,{cards:overrides,teams});
  const nameOf=c=>c.nickname??roster.get(c.account)?.name??steamName(Number(c.account))??c.design.layout?.name??`Player ${c.account}`;
  const share=c=>c.total?c.counts[c.pick]/c.total:0;
  let sort='rarity',unrated=false;
  const draw=()=>{
    const shown=cards.filter(c=>!unrated||(String(c.account)!==String(viewer)&&votes[`${c.account}:${c.key}`]==null)).sort((a,b)=>
      (sort==='rarity'?(PICK_RANK[b.pick]??0)-(PICK_RANK[a.pick]??0)||share(b)-share(a)||b.total-a.total
      :sort==='votes'?b.total-a.total||(PICK_RANK[b.pick]??0)-(PICK_RANK[a.pick]??0)
      :0)||nameOf(a).localeCompare(nameOf(b))||a.slot-b.slot);
    body.innerHTML=`<div class="gallery-bar"><label>Sort <select data-gallery-sort><option value="rarity">Rarity (voted)</option><option value="votes">Most votes</option><option value="name">Player name</option></select></label>
      ${viewer!=null?`<label class="gallery-unrated"><input type="checkbox" data-gallery-unrated${unrated?' checked':''}> Not rated by me</label>`:'<button type="button" class="linkish" data-signin>Sign in with Steam to rate cards</button>'}
      <span class="gallery-count">${shown.length} card${shown.length===1?'':'s'}</span></div>
      <div class="gallery-grid">${PAINT_FILTER}${shown.map(c=>{
        const r=roster.get(c.account),player={account:Number(c.account),name:nameOf(c),team:r?.team??'AD2L'};
        const link=r?`${SOURCES[r.league]?.root??'#/all'}/player/${c.account}`:null;
        return `<figure data-gallery="${c.account}:${c.slot}">${renderer.card(player,null,{own:true,equipmentOverride:c.design}).replace('data-pick=',`data-design-slot="${c.slot}" data-pick=`)}<figcaption>${link?`<a href="${link}">${esc(player.name)}</a>`:esc(player.name)} · Card ${c.slot+1}${c.primary?' · Primary':''}</figcaption></figure>`;
      }).join('')||`<p>${unrated?"You've rated every card here.":'No custom cards yet.'}</p>`}</div>`;
    body.querySelector('[data-gallery-sort]').value=sort;
    body.querySelector('[data-gallery-sort]').onchange=e=>{sort=e.target.value;draw();};
    body.querySelector('[data-gallery-unrated]')?.addEventListener('change',e=>{unrated=e.target.checked;draw();});
    body.querySelector('[data-signin]')?.addEventListener('click',signIn);
    body.querySelectorAll('.gallery-grid figcaption a').forEach(a=>a.addEventListener('click',()=>body.closest('dialog.collection-dialog')?.close()));
    const grid=body.querySelector('.gallery-grid');wirePlayerCards(grid);
    // A vote updates that card's numbers in place; the order holds until the sort or filter changes.
    for(const c of shown)mountRating(grid.querySelector(`[data-gallery="${c.account}:${c.slot}"]`),c.account,c,{viewer,votes,onVote:next=>Object.assign(c,next)});
  };
  draw();
}

// Your name on the site (lib/cosmetics-engine.js setNickname): a nickname, and which name shows on
// your cards and profile. In Gallery › Customize and on your own profile. inGame is the name you
// play under; action saves (collectionAction, or the dialog's own); onSaved gets the new state.
export function mountNameEditor(host,{state,inGame,action=collectionAction,onSaved}) {
  if(!host||!state)return;
  const show=state.showNickname&&state.nickname;
  host.innerHTML=`<form class="name-editor"><h4>Your name</h4><p>A nickname shows on your cards and your profile, with your in-game name in brackets on the profile.</p>
    <label>Nickname <input name="nickname" maxlength="${MAX_NAME}" autocomplete="off" value="${esc(state.nickname??'')}" placeholder="Pick a nickname"></label>
    <fieldset><legend>Show</legend><label><input type="radio" name="show" value="nick"${show?' checked':''}> Nickname</label><label><input type="radio" name="show" value="game"${show?'':' checked'}> In-game name${inGame?` (${esc(inGame)})`:''}</label></fieldset>
    <button type="submit">Save name</button><span class="name-editor-msg" role="status" aria-live="polite"></span></form>`;
  const form=host.querySelector('form'),msg=form.querySelector('.name-editor-msg');
  form.nickname.addEventListener('input',()=>{if(form.nickname.value.trim()&&!form.nickname.dataset.touched){form.nickname.dataset.touched='1';form.show.value='nick';}});
  form.onsubmit=async e=>{
    e.preventDefault();
    const nickname=form.nickname.value.trim()||null,showNickname=form.show.value==='nick';
    form.querySelector('button').disabled=true;msg.textContent='Saving…';
    try {const data=await action('nickname',{nickname,showNickname});msg.textContent=showNickname?`Showing ${nickname}.`:'Showing your in-game name.';onSaved?.(data.state);}
    catch(err){msg.textContent=err.message;}
    finally{form.querySelector('button').disabled=false;}
  };
}
// A profile's title: the nickname they show, then their in-game name in brackets.
function profileTitle(nickname,inGame) {
  const h=document.querySelector('.pp-head .h1-name, .page-head .h1-name');if(!h)return;
  h.dataset.inGame??=inGame;
  h.innerHTML=nickname&&nickname!==h.dataset.inGame?`${esc(nickname)} <small class="h1-ingame">(${esc(h.dataset.inGame)})</small>`:esc(h.dataset.inGame);
}
