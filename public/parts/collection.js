import { esc } from '../core.js';
import { steamAccount, steamLoginUrl, listCards } from '../lib/store.js';
import { CATALOG, DEFAULT_EQUIPMENT, collectionState, collectionAction, publicCollection, applyEquipment } from '../lib/cosmetics.js';
import { TIERS, itemByKey } from '../lib/cosmetics-catalog.js';
import { signatureHtml, japaneseName } from '../lib/signatures.js';
import { createPlayerCards, PAINT_FILTER, wirePlayerCards } from './player-card.js';
import { startSteamSignIn, steamName } from './me.js';
import { HERO_META } from '../lib/hero-meta.js';
import { cardArtOptions, CARD_STYLES, defaultCardCrop, cardArtwork } from '../lib/card-art.js';
import { cardDesignState } from '../lib/cosmetics-engine.js';
import { availablePackOffers, markPackOfferClaimed } from '../lib/bonus-offers.js';

const gift=`<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 13h24v6H4zm2 6h20v11H6zm10-6v17M16 13C4 13 5 2 11 4c4 1 5 9 5 9zm0 0c12 0 11-11 5-9-4 1-5 9-5 9z"/></svg>`;
const colors={common:'#abb3be',rare:'#80c4ff',epic:'#d7a3ff',legendary:'#ffd879'};
function swatch(item,name='Scionara') {
  if(item.type==='autograph') return `<span class="collection-swatch signature-sample">${signatureHtml({...DEFAULT_EQUIPMENT,autograph:item.id,text:name},name).replace('card-autograph','collection-signature')}</span>`;
  if(item.type==='translation')return '<span class="collection-swatch translation-swatch">Aa → カナ</span>';
  return `<span class="collection-swatch ${item.type==='finish'?'finish-swatch':''}" data-texture="${item.texture??'metal'}" data-finish="${item.id}" style="--a:${item.a??'#536282'};--b:${item.b??'#151a29'}">${item.symbol??''}</span>`;
}
const dexHtml=(inventory,filter='all',status='all',name,equipment=DEFAULT_EQUIPMENT,editable=false)=>CATALOG.filter(i=>(filter==='all'||i.type===filter)&&(status==='all'||(status==='owned'?(inventory[i.key]??0)>0:!inventory[i.key]))).map((i)=>{
  const n=inventory[i.key]??0;
  const equipped=equipment[i.type]===i.id;
  return `<article class="dex-item ${n?'collected':'uncollected'}${equipped?' equipped':''}" style="--rarity:${colors[i.rarity]}"><button type="button" class="dex-preview-choice" data-preview="${i.key}" aria-label="Preview ${esc(i.name)}">${swatch(i,name)}<span>Preview</span></button><small>${esc(i.type)} · ${i.rarity}</small><strong>${esc(i.name)}</strong><span>${n?`Owned ×${n}`:'Not collected'}</span>${equipped?'<span class="equipped-label">Equipped</span>':''}${n&&editable?`<button type="button" data-equip="${i.key}" ${equipped?'disabled aria-pressed="true"':'aria-pressed="false"'}>${equipped?'Equipped':'Equip'}</button>`:''}</article>`;
}).join('');

export async function openCollection({tab='packs',viewAccount=null,cardHtml=null,name=null,adapter=null}={}) {
  const own=adapter?.account??await steamAccount().catch(()=>null), target=viewAccount??own, editable=target!=null&&target===own;
  name=name??steamName(target)??'Your Name';
  let state=editable?(adapter?.state??collectionState()):null, inventory={}, busy=false, filter='all', status='all', rewards=[], resultVisible=false;
  const action=adapter?.action??collectionAction;
  let selectedSlot=state?.primaryCard??0, publicDesigns=null, previewItem=null;
  const designs=()=>cardDesignState(state??publicDesigns??{equipment});
  const selectedEquipment=()=>({...DEFAULT_EQUIPMENT,...(designs().cardDesigns[selectedSlot]??state?.equipment??equipment)});
  let clockOffset=0, timerRetryAt=0;
  const dialog=document.createElement('dialog');dialog.className='collection-dialog';dialog.setAttribute('aria-labelledby','collection-title');
  dialog.innerHTML=`<div class="collection-head"><div><small>AD2L COLLECTION</small><h2 id="collection-title">Your collection</h2></div><button type="button" data-close aria-label="Close collection">×</button></div><nav class="collection-tabs" aria-label="Collection sections">${['packs','collection','customize','recycle'].map(t=>`<button type="button" data-tab="${t}">${t[0].toUpperCase()+t.slice(1)}</button>`).join('')}</nav><div class="collection-body"></div><p class="collection-message" role="status" aria-live="polite"></p>`;
  document.querySelector('.collection-dialog')?.close();document.querySelector('.collection-dialog')?.remove();document.body.append(dialog);dialog.showModal();
  const body=dialog.querySelector('.collection-body'), message=dialog.querySelector('.collection-message');
  if(target!=null&&!editable) {
    dialog.querySelector('#collection-title').textContent=`${name}'s collection`;
    dialog.querySelectorAll('[data-tab="packs"],[data-tab="recycle"]').forEach(b=>b.remove());
    if(tab==='packs'||tab==='recycle')tab='collection';
  }
  body.innerHTML='<p>Loading collection…</p>';
  dialog.querySelectorAll('[data-tab]').forEach(b=>b.disabled=true);
  let equipment={...DEFAULT_EQUIPMENT,...state?.equipment}, initialEquipment=JSON.stringify(equipment);
  const say=text=>{
    message.textContent=text;
    if(['Your Steam session expired. Sign in again.','Sign in with Steam first.','Sign in with Steam to collect cards.'].includes(text)) {
      const link=document.createElement('a');
      link.href=steamLoginUrl(location.origin+location.pathname+location.search);
      link.textContent=text;
      link.onclick=e=>{e.preventDefault();dialog.close();startSteamSignIn();};
      message.replaceChildren(link);
    }
  };
  const disabledBefore=new WeakMap();
  const setBusy=value=>{busy=value;dialog.querySelectorAll('button:not([data-close]),input,select').forEach(b=>{if(value){disabledBefore.set(b,b.disabled);b.disabled=true;}else if(disabledBefore.has(b)){b.disabled=disabledBefore.get(b);disabledBefore.delete(b);}});};
  const run=async(actionName,details,success)=>{
    if(busy)return;setBusy(true);say('Saving…');
    if(actionName==='equip')details={...details,cardSlot:selectedSlot};
    try {const data=await action(actionName,details);if(data.serverNow)clockOffset=data.serverNow-Date.now();state=data.state;inventory=state.inventory;success?.(data);say('');return data;}
    catch(e){say(e.message);return null;}finally{setBusy(false);}
  };
  dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
  dialog.addEventListener('close',()=>{if(dialog._revealTimer)clearTimeout(dialog._revealTimer);clearInterval(dialog._packTimer);dialog.remove();});
  dialog.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;draw();});
  try {
    if(editable) {const data=adapter?{state:adapter.state}:await action('session');if(data.serverNow)clockOffset=data.serverNow-Date.now();state=data.state;selectedSlot=state.primaryCard??0;inventory=state.inventory;equipment=selectedEquipment();initialEquipment=JSON.stringify(equipment);}
    else if(target!=null) {const data=await publicCollection(target);publicDesigns=data;selectedSlot=data.primaryCard??0;inventory=data.inventory;equipment={...DEFAULT_EQUIPMENT,...data.equipment};}
  } catch(e){say(e.message);}
  // Use the site's existing shared card, including its artwork choices and crop.
  if(!cardHtml) {
    const existing=document.querySelector(`.ft-card[data-pick="${target}"]`);
    if(existing)cardHtml=existing.outerHTML;
    else {
      const cards=target==null?new Map():await listCards().catch(()=>new Map()), renderer=createPlayerCards([],{cards});
      cardHtml=PAINT_FILTER+renderer.card({account:target??0,name,team:'AD2L'},null,{own:true});
    }
  }
  const signIn=()=>{dialog.close();startSteamSignIn();};
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
    dialog.querySelectorAll('[data-tab]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.tab===tab));b.disabled=busy;});
    if(tab==='packs')drawPacks();else if(tab==='collection')drawDex();else if(tab==='customize')drawEditor();else drawRecycle();
  }
  function drawPacks() {
    const packs=state?.packs??[];
    const offers=editable?availablePackOffers(state):[];
    const offerGuide='<aside class="pack-offer-guide"><strong>Earn up to 3 bonus packs</strong><span>Complete each action once. Every one gives you an extra pack.</span><div class="pack-offer-steps"><div><b>1</b><strong>Send Feedback</strong><small>Use the Feedback button in the top bar.</small></div><div><b>2</b><strong>Take the New here? tour</strong><small>Finish the basic site tour.</small></div><div><b>3</b><strong>Join the Discord</strong><small>Use the Discord link in the footer.</small></div></div></aside>';
    const offerLabel=offers.map(s=>s==='feedback'?'feedback':s==='tour'?'the basic site tour':'joining Discord').join(' · ');
    body.innerHTML=`<div class="pack-intro"><div class="gift-hero">${gift}</div><h3>${editable?`${packs.length} packs ready`:'Collect your first cards'}</h3><p>Three cards in every pack. Any mix of borders, finishes, signature styles and legendary name rendering.</p><p class="pack-odds">69% Common · 17% Rare · 10% Epic · 4% Legendary <small>Odds per card in a normal pack.</small></p><p>Three welcome packs when you first connect Steam. Earn one normal pack every eight hours, stored up to three. Upgrade packs are stored separately.</p>${offerLabel?`<aside class="pack-offer" role="status"><strong>Bonus pack unlocked</strong><span>You completed ${offerLabel}. Claim your one-time extra pack.</span><button type="button" data-claim-bonus>Claim bonus pack</button></aside>`:''}</div>${editable?`<div class="pack-list">${packs.map((min,i)=>`<button type="button" data-open="${i}" class="pack-box available" style="--rarity:${colors[min]}">${gift}<strong>${min==='common'?'Normal / welcome pack':`${min} upgrade pack`}</strong><small>3 cards · ${min} minimum</small></button>`).join('')||'<p>Your next pack is charging.</p>'}</div>`:'<button type="button" data-signin>Connect Steam</button>'}${editable?'<p class="pack-countdown" data-pack-countdown></p>':''}<div class="pack-results" aria-live="polite"></div>`;
    body.querySelector('.pack-intro')?.insertAdjacentHTML('beforeend',offerGuide);
    body.querySelector('[data-signin]')?.addEventListener('click',signIn);
    body.querySelector('[data-claim-bonus]')?.addEventListener('click',async()=>{const source=offers[0],data=await run('claim-bonus',{source});if(data){try{localStorage.removeItem(`ad2l-pack-offer:${source}`);}catch{}markPackOfferClaimed(source);drawPacks();say(data.alreadyClaimed?'This bonus was already claimed. Your collection is up to date.':'Bonus pack added to your collection.');}});
    body.querySelectorAll('[data-open]').forEach(b=>b.onclick=async()=>{
      const data=await run('open',{packIndex:Number(b.dataset.open)});if(!data)return;
      rewards=data.rewards;resultVisible=false;
      drawPacks();body.querySelector('.pack-results').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'nearest'});
    });
    updateCountdown();
    if(rewards.length)showRewards();
  }
  function updateCountdown() {
    const label=body.querySelector('[data-pack-countdown]');if(!label||!state)return;
    const count=state.packs.filter(p=>p==='common').length;
    if(count>=3){label.textContent=`Normal packs: ${count} / 3. Storage full. Open one to start the eight-hour countdown.`;return;}
    if(state.nextPackAt==null){label.textContent=`Normal packs: ${count} / 3`;return;}
    const seconds=Math.max(0,Math.ceil((state.nextPackAt-Date.now()-clockOffset)/1000));
    const parts=[Math.floor(seconds/3600),Math.floor(seconds%3600/60),seconds%60].map(n=>String(n).padStart(2,'0'));
    label.textContent=`Normal packs: ${count} / 3 — Next pack in ${parts.join(':')}`;
    if(!seconds&&!busy&&Date.now()>timerRetryAt){timerRetryAt=Date.now()+15000;run('session',{}).then(data=>{if(data&&dialog.isConnected&&tab==='packs')drawPacks();});}
  }
  dialog._packTimer=setInterval(updateCountdown,1000);
  function showRewards() {
    const host=body.querySelector('.pack-results');if(!host)return;
    host.innerHTML=`<h3>Your pack</h3><div class="reward-three ${resultVisible?'revealed':''}">${rewards.map((r,i)=>{const item=itemByKey(r.key);return `<button type="button" class="reward-card" style="--rarity:${colors[item.rarity]};--delay:${i*220}ms" aria-label="Reveal card ${i+1}" data-reveal><span class="reward-back">${gift}<b>AD2L</b></span><span class="reward-front">${swatch(item,name)}<small>${item.rarity} · ${item.type}</small><strong>${esc(item.name)}</strong><span>${r.duplicate?'Duplicate':'New discovery'}</span></span></button>`;}).join('')}</div><button type="button" data-reveal-all>Reveal all three</button><button type="button" data-view-dex>View collection</button>`;
    host.querySelectorAll('[data-reveal]').forEach(b=>b.onclick=()=>{b.classList.add('revealed');b.setAttribute('aria-label',b.querySelector('.reward-front').textContent);});
    if(resultVisible)host.querySelectorAll('[data-reveal]').forEach(b=>b.setAttribute('aria-label',b.querySelector('.reward-front').textContent));
    const reveal=()=>{host.querySelector('.reward-three').classList.add('revealed');resultVisible=true;host.querySelectorAll('[data-reveal]').forEach(b=>b.setAttribute('aria-label',b.querySelector('.reward-front').textContent));};
    host.querySelector('[data-reveal-all]').onclick=reveal;
    host.querySelector('[data-view-dex]').onclick=()=>{tab='collection';draw();};
    if(!resultVisible){clearTimeout(dialog._revealTimer);dialog._revealTimer=setTimeout(reveal,650);}
  }
  function drawDex() {
    const count=CATALOG.filter(i=>inventory[i.key]>0).length;
    const savedEquipment=selectedEquipment();
    const previewEquipment=previewItem?{...savedEquipment,[previewItem.type]:previewItem.id}:savedEquipment;
    // A name-rendering preview needs a signature to make the script visible.
    if(previewItem?.type==='translation'&&previewEquipment.autograph==='none')previewEquipment.autograph='brush-ink';
    body.innerHTML=`${cardSlotsHtml()}<div class="dex-progress"><strong>${count} / ${CATALOG.length} collected</strong><progress max="${CATALOG.length}" value="${count}" aria-label="Collection completion"></progress></div><div class="dex-layout"><div><div class="dex-filters"><label>Type <select data-filter>${['all','border','finish','autograph','translation'].map(t=>`<option value="${t}">${t}</option>`).join('')}</select></label><label>Show <select data-status><option value="all">All designs</option><option value="owned">Collected</option><option value="missing">Not collected</option></select></label></div><div class="dex-grid">${dexHtml(inventory,filter,status,name,savedEquipment,editable)}</div></div><aside class="dex-card-preview"><h3>${previewItem?'Card preview':editable?'Your equipped card':'Equipped card'}</h3>${previewItem?`<p class="dex-preview-note">Previewing ${esc(previewItem.name)}${inventory[previewItem.key]>0?'':' - Not collected'}. Your saved card is unchanged.</p><button type="button" data-clear-preview>Show equipped card</button>`:''}<div data-dex-card>${cardHtml}</div><dl>${['border','finish','autograph','translation'].map(type=>`<dt>${type==='autograph'?'Signature':type==='translation'?'Name rendering':type}</dt><dd>${esc(itemByKey(`${type}:${previewEquipment[type]}`)?.name??({border:'Default grey',finish:'No finish',autograph:'No signature',translation:'Original name'}[type]))}</dd>`).join('')}</dl>${editable?'<button type="button" data-customize-card>Edit card design</button><p>Equip an item to save and update your card immediately.</p>':''}</aside></div>`;
    wireCardSlots();
    const preview=body.querySelector('[data-dex-card] .ft-card');preview.dataset.designSlot=selectedSlot;preview.classList.remove('flipped');preview.querySelectorAll('button').forEach(b=>b.remove());applyEquipment(preview,previewEquipment,name);
    body.querySelectorAll('[data-preview]').forEach(b=>{b.setAttribute('aria-pressed',String(previewItem?.key===b.dataset.preview));b.onclick=()=>{previewItem=itemByKey(b.dataset.preview);drawDex();};});
    body.querySelector('[data-clear-preview]')?.addEventListener('click',()=>{previewItem=null;drawDex();});
    body.querySelector('[data-customize-card]')?.addEventListener('click',()=>{equipment={...savedEquipment};initialEquipment=JSON.stringify(equipment);tab='customize';draw();});
    const f=body.querySelector('[data-filter]'),s=body.querySelector('[data-status]');f.value=filter;s.value=status;
    f.onchange=()=>{filter=f.value;drawDex();};s.onchange=()=>{status=s.value;drawDex();};
    body.querySelectorAll('[data-equip]').forEach(b=>{b.onclick=async()=>{
      const item=itemByKey(b.dataset.equip),next={...savedEquipment,[item.type]:item.id};
      const data=await run('equip',{equipment:next});
      if(data){previewItem=null;equipment=selectedEquipment();initialEquipment=JSON.stringify(equipment);drawDex();say(`${item.name} equipped. Card saved.`);}
    };});
  }
  function select(type,defaultName) {
    return `<label>${type==='autograph'?'Signature style':type==='translation'?'Name rendering':type}<select data-equipment="${type}"><option value="${DEFAULT_EQUIPMENT[type]}">${defaultName}</option>${CATALOG.filter(i=>i.type===type&&inventory[i.key]>0).map(i=>`<option value="${i.id}">${esc(i.name)}</option>`).join('')}</select></label>`;
  }
  function visualTextChoices(type) {
    const items=[{id:DEFAULT_EQUIPMENT[type],name:type==='autograph'?'No signature':'Original name'},...CATALOG.filter(i=>i.type===type&&inventory[i.key]>0)];
    return `<fieldset class="visual-text-options"><legend>${type==='autograph'?'Signature style':'Name rendering'}</legend><div>${items.map(item=>`<button type="button" data-text-choice="${type}" data-choice="${item.id}" aria-pressed="${equipment[type]===item.id}" ${editable?'':'disabled'}><span data-text-choice-preview></span><strong>${esc(item.name)}</strong><small data-choice-status>${equipment[type]===item.id?'Selected':'Select'}</small></button>`).join('')}</div></fieldset>`;
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
    const artOptions=cardArtOptions(effectiveHero);
    body.innerHTML=`${cardSlotsHtml()}<div class="card-editor"><div data-card-editor>${cardHtml}<p>Drag the artwork to adjust its framing. Drag the signature separately; arrow keys move the focused signature one step.</p></div><div class="card-editor-controls">${select('border','Default grey')}${select('finish','No finish')}<details class="card-settings" open><summary>Text settings</summary><div>${visualTextChoices('autograph')}${visualTextChoices('translation')}<p>Signatures use your player name.</p><details class="image-adjustments"><summary>Signature positioning</summary><div>${[['x','Horizontal',0,100],['y','Vertical',0,100],['size','Size',5,30],['rotation','Rotation',-180,180]].map(([k,label,min,max])=>`<label>${label} <output data-value="${k}">${Math.round(equipment[k])}</output><input type="range" data-position="${k}" min="${min}" max="${max}" value="${equipment[k]}"></label>`).join('')}<button type="button" data-reset>Reset signature placement</button></div></details></div></details><details class="card-settings" ${imageOpen?'open':''}><summary>Image settings</summary><div><label>Hero<select data-base="hero"><option value="">Most played hero</option>${[...HERO_META].sort((a,b)=>a[1].localeCompare(b[1])).map(([id,name])=>`<option value="${id}">${esc(name)}</option>`).join('')}</select></label><div data-image-gallery></div><details class="image-adjustments"><summary>Hue &amp; positioning</summary><div><label>Hue <output data-hue-value>${equipment.hue??0}</output><input type="range" data-hue min="0" max="360" value="${equipment.hue??0}"></label>${[['x','Image horizontal',0,100,1],['y','Image vertical',0,100,1],['zoom','Image zoom',1,3,.01]].map(([key,label,min,max,step])=>`<label>${label}<input type="range" data-crop="${key}" min="${min}" max="${max}" step="${step}" value="${(base.crop??defaultCardCrop(cardArtwork(effectiveHero,base)))[key]}"></label>`).join('')}</div></details></div></details><button type="button" data-save>Save my card</button></div></div>`;
    wireCardSlots();
    const card=body.querySelector('.ft-card');card.dataset.designSlot=selectedSlot;card.classList.remove('flipped');
    card.querySelectorAll('button').forEach(b=>b.remove());
    const update=()=>{applyEquipment(card,equipment,name);wireSignature();say(JSON.stringify(equipment)===initialEquipment?'':'Unsaved card changes');};
    const refreshTextChoices=()=>body.querySelectorAll('[data-text-choice]').forEach(button=>{
      const type=button.dataset.textChoice,id=button.dataset.choice,selected=equipment[type]===id;
      button.setAttribute('aria-pressed',String(selected));button.querySelector('[data-choice-status]').textContent=selected?'Selected':'Select';
      const preview=button.querySelector('[data-text-choice-preview]');
      if(type==='autograph')preview.innerHTML=id==='none'?'<span class="no-signature-preview">—</span>':`<span class="collection-swatch signature-sample">${signatureHtml({...equipment,autograph:id},name).replace('card-autograph','collection-signature')}</span>`;
      else {preview.className=`name-rendering-preview${id==='japanese'?' japanese':''}`;preview.textContent=id==='japanese'?japaneseName(name):name;}
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
    body.querySelectorAll('[data-equipment]').forEach(s=>{s.value=equipment[s.dataset.equipment];s.disabled=!editable;s.onchange=()=>{equipment[s.dataset.equipment]=s.value;update();};});
    body.querySelectorAll('[data-base]').forEach(s=>{
      const key=s.dataset.base;s.value=base[key]??'';
      s.onchange=()=>{base[key]=key==='hero'?(Number(s.value)||null):(s.value||null);if(key==='hero'){base.art=null;base.crop=null;drawEditor();}else {if(key==='art'){if(base.art&&!base.hero)base.hero=effectiveHero;base.crop=null;}update();}};
    });
    body.querySelector('[data-hue]').oninput=e=>{equipment.hue=Number(e.target.value);body.querySelector('[data-hue-value]').textContent=equipment.hue;update();};
    body.querySelectorAll('[data-crop]').forEach(input=>input.oninput=()=>{base.crop??=defaultCardCrop(cardArtwork(effectiveHero,base));base.crop[input.dataset.crop]=Number(input.value);update();});
    body.querySelectorAll('[data-position]').forEach(input=>input.oninput=()=>{equipment[input.dataset.position]=Number(input.value);syncControls();update();});
    const syncControls=()=>body.querySelectorAll('[data-position]').forEach(input=>{input.value=equipment[input.dataset.position];body.querySelector(`[data-value="${input.dataset.position}"]`).textContent=Math.round(equipment[input.dataset.position]);});
    const front=card.querySelector('.ft-front');let pan=null;
    front.onpointerdown=e=>{
      if(!editable||busy||!effectiveHero||e.button!==0||e.target.closest('.card-autograph,a,button'))return;
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
  function drawRecycle() {
    if(!editable){body.innerHTML='<p>Sign in with Steam to recycle duplicate cards.</p>';return;}
    let selectedTier='common';
    body.innerHTML=`<h3>Five duplicates → an upgrade pack</h3><p>Use five extra copies of the same rarity. Your last copy stays safe. All three rewards will be at least the next rarity. Legendary cards cannot be recycled.</p><label>Recycle rarity <select data-tier>${TIERS.slice(0,3).map(t=>`<option value="${t}">${t} → ${TIERS[TIERS.indexOf(t)+1]} minimum</option>`).join('')}</select></label><div class="recycle-choices"></div><button type="button" data-recycle disabled>Recycle 0 / 5</button>`;
    const selections={};
    const choices=()=>{
      Object.keys(selections).forEach(k=>delete selections[k]);
      const items=CATALOG.filter(i=>i.rarity===selectedTier&&(inventory[i.key]??0)>1);
      body.querySelector('.recycle-choices').innerHTML=items.map(i=>`<label>${esc(i.name)} · ${inventory[i.key]-1} extra copies<input type="number" min="0" max="${Math.min(5,inventory[i.key]-1)}" value="0" data-scrap="${i.key}"></label>`).join('')||'<p>No duplicates of this rarity yet.</p>';
      body.querySelectorAll('[data-scrap]').forEach(input=>input.oninput=()=>{selections[input.dataset.scrap]=Number(input.value);count();});count();
    };
    const count=()=>{const total=Object.values(selections).reduce((s,n)=>s+n,0),b=body.querySelector('[data-recycle]');b.textContent=`Recycle ${total} / 5`;b.disabled=total!==5;};
    body.querySelector('[data-tier]').onchange=e=>{selectedTier=e.target.value;choices();};
    body.querySelector('[data-recycle]').onclick=async()=>{const data=await run('recycle',{selections});if(data){tab='packs';draw();say(`Upgrade pack ready: ${data.minimum} or better on all three cards.`);}};
    choices();
  }
  draw();
}

export async function mountGift() {
  let button=document.getElementById('collection-gift');
  if(!button){button=document.createElement('button');button.id='collection-gift';button.className='collection-gift';button.type='button';button.innerHTML=gift+'<span></span>';document.getElementById('me')?.before(button);button.onclick=()=>openCollection();}
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
    if(data.equipment)cards.set(account,{...cards.get(account),cosmetics:data.equipment});
    const count=CATALOG.filter(i=>data.inventory[i.key]>0).length,renderer=createPlayerCards(matches,{cards,tiers:new Map(tier?[[String(account),tier]]:[])});
    const preferences=cardDesignState(data),player={account,name,team:team??'AD2L'};
    const cardHtml=PAINT_FILTER+renderer.card(player,null,{own:true,equipmentOverride:preferences.cardDesigns[preferences.primaryCard]});
    const showcase=preferences.cardDesigns.map((equipment,i)=>equipment?`<figure>${renderer.card(player,null,{own:true,equipmentOverride:equipment}).replace('data-pick=',`data-design-slot="${i}" data-pick=`)}<figcaption>Card ${i+1}${i===preferences.primaryCard?' · Primary':''}</figcaption></figure>`:'').join('');
    section.innerHTML=`<div class="profile-collection-card profile-card-designs">${PAINT_FILTER}${showcase||cardHtml}</div><div><h3>Card collection</h3>${preferences.shuffleCards?'<p>Saved cards are on shuffle for other viewers.</p>':''}${data.unavailable?'<p>Collection service is currently unavailable.</p>':`<strong>${count} / ${CATALOG.length} discovered</strong><progress value="${count}" max="${CATALOG.length}" aria-label="Collection completion"></progress>`}<button type="button" data-profile-collection>View collection & cards</button></div>`;
    section.querySelector('[data-profile-collection]').onclick=()=>openCollection({tab:'collection',viewAccount:account,cardHtml,name});
    wirePlayerCards(section.querySelector('.profile-collection-card'));
  } catch {if(section.isConnected)section.innerHTML='<h3>Card collection</h3><p>Collection service is unavailable. Try again shortly.</p><button type="button">View designs</button>';section.querySelector('button')?.addEventListener('click',()=>openCollection({tab:'collection',viewAccount:account,name}));}
}
