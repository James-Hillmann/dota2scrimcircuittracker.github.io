// A player's profile background (lib/cosmetics-engine.js setProfileBackground): one of their
// collected loading screens behind their name or the whole profile, framed and dimmed in an
// editor that opens from their own profile. parts/collection.js mounts both.
import { esc } from '../core.js';
import { collectionAction } from '../lib/cosmetics.js';
import { screenArt, CARD_STYLES } from '../lib/card-art.js';
import { profileBackgroundOf } from '../lib/cosmetics-engine.js';
import { PAINT_FILTER } from './player-card.js';
import { CATALOG } from '../lib/cosmetics-catalog.js';
import { signatureHtml, renderedName, CASED_MODIFIERS, LETTER_CASES } from '../lib/signatures.js';

// Lower or upper case, for the modifiers whose alphabet has capitals (Greek, Cyrillic). Shared
// with the card editor (parts/collection.js); each button shows your name in that case.
export const letterCaseHtml=(enabled=true)=>`<fieldset class="letter-case" data-letter-case-wrap hidden><legend>Letter case</legend><div>${LETTER_CASES.map(c=>`<button type="button" data-letter-case="${c}" ${enabled?'':'disabled'}></button>`).join('')}</div></fieldset>`;
export function drawLetterCase(root,translation,letterCase='lower',name) {
  const wrap=root.querySelector('[data-letter-case-wrap]');if(!wrap)return;
  wrap.hidden=!CASED_MODIFIERS.includes(translation);if(wrap.hidden)return;
  wrap.querySelectorAll('[data-letter-case]').forEach(b=>{const c=b.dataset.letterCase;b.setAttribute('aria-pressed',String(c===letterCase));b.className=`name-rendering-preview ${translation}`;b.textContent=renderedName(name,translation,c);b.title=c==='upper'?'Upper case':'Lower case';});
}

// A screen as the card editor's thumbnails draw it: style is a card image style, or "plain".
const artHtml=(art,style,imgStyle='')=>`<span class="ft-art-thumb ${esc(art.cls)}" data-style="${esc(style??'plain')}"><span class="ft-art"><img src="${esc(art.src)}" alt="" decoding="async"${imgStyle}></span></span>`;
// The image layer: the screen in its style and hue, framed by x, y and zoom, under a dim overlay
// (CSS .pbg-layer), with name signed on top if there's a signature. The style filters need
// PAINT_FILTER's SVG defs on the page.
function layerHtml(bg,name,extra='') {
  const art=bg&&screenArt(bg.id);if(!art)return '';
  return `<div class="pbg-layer${extra}" style="--pbg-dim:${bg.dim/100};--art-hue:${bg.hue}deg" aria-hidden="true">${PAINT_FILTER}${artHtml(art,bg.style,` style="object-position:${bg.x}% ${bg.y}%;transform-origin:${bg.x}% ${bg.y}%;transform:scale(${bg.zoom})"`)}${bg.sig?`<div class="pbg-sig">${signatureHtml(bg.sig,name)}</div>`:''}</div>`;
}

// Shows raw (a saved background, or null) on the profile: behind the page head, or fixed behind
// the whole page; name is the one they sign with. The page layer lives in the page's own markup,
// so leaving the profile drops it.
export function showProfileBackground(raw,name) {
  const head=document.querySelector('.pp-head');if(!head)return;
  head.parentElement.querySelectorAll(':scope > .pbg-layer, .pp-head > .pbg-layer').forEach(el=>el.remove());
  const bg=profileBackgroundOf(raw),art=bg&&screenArt(bg.id);
  head.classList.toggle('has-bg',!!art&&bg.place==='head');
  if(!art)return;
  if(bg.place==='head')head.insertAdjacentHTML('afterbegin',layerHtml(bg,name));
  else head.insertAdjacentHTML('beforebegin',layerHtml(bg,name,' pbg-fixed'));
}

// Your own profile: a button that opens the editor. state is your collection state.
export function mountBackgroundButton(host,{state,name}) {
  host.innerHTML=`<div class="pbg-open"><h4>Profile background</h4><p>${(state.screens??[]).length?'Use one of your loading screens behind your name or across your whole profile.':'Open loading screen packs to collect backgrounds for your profile.'}</p><button type="button" data-pbg-open>Customize background</button></div>`;
  host.querySelector('[data-pbg-open]').onclick=()=>openBackgroundEditor({state,name,onSaved:next=>{state=next;}});
}

const SLIDERS=[['x','Horizontal',0,100,1],['y','Vertical',0,100,1],['zoom','Zoom',1,3,.01],['dim','Dim',0,90,1],['hue','Hue',0,360,1]];
const SIG_SLIDERS=[['size','Size',2,12,.5],['rotation','Rotation',-180,180,1]];
// The editor: a live preview shaped like this page (drag it to frame the image), where it goes,
// which screen (a grid under the preview), its image style (the card editor's strip), and the
// framing and colour sliders, and your signature (the card editor's choices; drag it in the
// preview to place it). Saves on Save only.
export function openBackgroundEditor({state,name,onSaved}) {
  const owned=(state.screens??[]).map(screenArt).filter(Boolean);
  const saved=profileBackgroundOf(state.profileBackground);
  let bg=saved?{...saved}:null,place=saved?.place??'head';
  // Your signature: kept while you switch screens, so it survives picking None and back.
  let sig=saved?.sig?{...saved.sig}:null;
  const sigItems=Object.fromEntries(['autograph','translation'].map(t=>[t,CATALOG.filter(i=>i.type===t&&state.inventory?.[i.key]>0)]));
  // The preview copies this page's shape: the head's and the window's width to height.
  const head=document.querySelector('.pp-head'),ratio=(w,h,fallback)=>w>0&&h>0?w/h:fallback;
  const headRatio=ratio(head?.offsetWidth,head?.offsetHeight,6),pageRatio=ratio(innerWidth,innerHeight,16/9);
  const dialog=document.createElement('dialog');dialog.className='collection-dialog pbg-editor';dialog.setAttribute('aria-labelledby','pbg-title');
  dialog.innerHTML=`<div class="collection-head"><div><small>YOUR PROFILE</small><h2 id="pbg-title">Profile background</h2></div><div class="collection-head-actions"><button type="button" data-close aria-label="Close">×</button></div></div>
    <div class="collection-body"><div class="pbg-grid">
      <div class="pbg-preview-col"><div class="pbg-preview-heading"><strong>Live preview</strong><span>Drag the image to choose which part shows.</span></div>
        <div class="pbg-preview" style="--head-ratio:${headRatio.toFixed(2)};aspect-ratio:${pageRatio.toFixed(2)}" data-pbg-preview></div>
        <fieldset class="image-choice-group pbg-screens"><legend>Background</legend><div class="pbg-screen-grid">${[{id:null,label:'None'},...owned].map(s=>`<button type="button" data-bg="${s.id??''}" title="${esc(s.label)}">${s.src?artHtml(s,'plain',' loading="lazy"'):'<span class="image-choice-empty">None</span>'}<strong>${esc(s.label)}</strong></button>`).join('')}</div>${owned.length?'':'<p>Open loading screen packs to collect backgrounds.</p>'}</fieldset></div>
      <div class="pbg-controls">
        <fieldset class="pbg-place"><legend>Where</legend><div><button type="button" data-place="head">Behind your name</button><button type="button" data-place="page">Whole page</button></div></fieldset>
        <fieldset class="image-choice-group"><legend>Image style</legend><div class="image-choice-strip" data-styles></div></fieldset>
        <fieldset class="visual-text-options pbg-sig-options"><legend>Signature style</legend><div>${[{id:'none',name:'No signature'},...sigItems.autograph].map(i=>`<button type="button" data-sig-choice="autograph" data-choice="${i.id}"><span data-sig-preview></span><strong>${esc(i.name)}</strong></button>`).join('')}</div>${sigItems.autograph.length?'':'<p>Open packs to collect signature styles.</p>'}</fieldset>
        ${sigItems.translation.length?`<fieldset class="visual-text-options pbg-sig-options"><legend>Modifier</legend><div>${[{id:'none',name:'No modifier'},...sigItems.translation].map(i=>`<button type="button" data-sig-choice="translation" data-choice="${i.id}"><span data-sig-preview></span><strong>${esc(i.name)}</strong></button>`).join('')}</div></fieldset>${letterCaseHtml()}`:''}
        <fieldset class="pbg-framing" data-sig-sliders><legend>Signature size &amp; angle</legend><p>Drag your signature in the preview to place it.</p>${SIG_SLIDERS.map(([k,label,min,max,step])=>`<label>${label} <output data-sig-out="${k}"></output><input type="range" data-sig-slider="${k}" min="${min}" max="${max}" step="${step}"></label>`).join('')}</fieldset>
        <fieldset class="pbg-framing"><legend>Framing &amp; colour</legend>${SLIDERS.map(([k,label,min,max,step])=>`<label>${label} <output data-out="${k}"></output><input type="range" data-slider="${k}" min="${min}" max="${max}" step="${step}"></label>`).join('')}<button type="button" data-reset>Reset framing &amp; colour</button></fieldset>
        <div class="pbg-savebar"><button type="button" data-cancel>Cancel</button><button type="button" data-save>Save background</button></div>
      </div>
    </div></div><p class="collection-message" role="status" aria-live="polite"></p>`;
  dialog.insertAdjacentHTML('afterbegin',PAINT_FILTER);document.body.append(dialog);
  const $=s=>dialog.querySelector(s),$$=s=>dialog.querySelectorAll(s),preview=$('[data-pbg-preview]'),say=t=>$('.collection-message').textContent=t;
  const fresh=id=>profileBackgroundOf({id,place});
  const draw=()=>{
    const shown=bg&&{...bg,place,sig};
    preview.dataset.place=place;
    preview.innerHTML=`${place==='page'?layerHtml(shown,name):''}<div class="pbg-mock-head">${place==='head'?layerHtml(shown,name):''}<span class="pbg-mock-kicker">Players › ${esc(name)}</span><b>${esc(name)}</b><span class="pbg-mock-tabs">Stats · Heroes · Combat · Games</span></div><div class="pbg-mock-body"><i></i><i></i><i></i><i class="wide"></i></div>`;
    $$('[data-place]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.place===place)));
    $$('[data-bg]').forEach(b=>b.setAttribute('aria-pressed',String((bg?.id??'')===b.dataset.bg)));
    $$('[data-slider]').forEach(input=>{const k=input.dataset.slider;input.disabled=!bg;input.value=bg?.[k]??fresh(null)[k];$(`[data-out="${k}"]`).textContent=bg?(k==='zoom'?`${Number(bg[k]).toFixed(2)}×`:`${Math.round(bg[k])}${k==='dim'?'%':k==='hue'?'°':''}`):'';});
    drawStyles();drawSig();
    $('[data-reset]').disabled=!bg;
  };
  // The style strip: the chosen screen in each style, redrawn only when the screen changes.
  let stylesFor;
  function drawStyles() {
    const strip=$('[data-styles]'),art=bg&&screenArt(bg.id);
    if((art?.id??null)!==stylesFor){
      stylesFor=art?.id??null;
      strip.innerHTML=art?[[null,'Plain'],...CARD_STYLES].map(([id,label])=>`<button type="button" data-style-pick="${id??''}">${artHtml(art,id,' loading="lazy"')}<strong>${label}</strong></button>`).join(''):'<p class="image-choice-empty">Choose a background first.</p>';
      strip.querySelectorAll('[data-style-pick]').forEach(b=>b.onclick=()=>{bg.style=b.dataset.stylePick||null;draw();});
    }
    strip.querySelectorAll('[data-style-pick]').forEach(b=>b.setAttribute('aria-pressed',String((bg?.style??'')===b.dataset.stylePick)));
    strip.style.setProperty('--art-hue',`${bg?.hue??0}deg`);
  }
  // The signature choices, previewed like the card editor's: each style signs your name, each
  // modifier shows your name changed.
  function drawSig() {
    $$('[data-sig-choice]').forEach(b=>{
      const type=b.dataset.sigChoice,id=b.dataset.choice,current=sig?.[type]??'none',preview=b.querySelector('[data-sig-preview]');
      b.setAttribute('aria-pressed',String(current===id));b.disabled=!bg||(type==='translation'&&!sig);
      if(type==='autograph')preview.innerHTML=id==='none'?'<span class="no-signature-preview">—</span>':`<span class="collection-swatch signature-sample">${signatureHtml({translation:sig?.translation??'none',x:50,y:50,size:15,rotation:-7,autograph:id},name).replace('card-autograph','collection-signature')}</span>`;
      else {preview.className=`name-rendering-preview ${id}`;preview.textContent=renderedName(name,id,sig?.letterCase);}
    });
    drawLetterCase(dialog,sig?.translation,sig?.letterCase,name);
    $('[data-sig-sliders]').hidden=!sig;
    $$('[data-sig-slider]').forEach(input=>{const k=input.dataset.sigSlider;input.disabled=!bg;input.value=sig?.[k]??0;$(`[data-sig-out="${k}"]`).textContent=sig?`${sig[k]}${k==='rotation'?'°':''}`:'';});
  }
  $$('[data-sig-choice]').forEach(b=>b.onclick=()=>{
    const type=b.dataset.sigChoice,id=b.dataset.choice;
    if(type==='autograph')sig=id==='none'?null:{translation:'none',x:50,y:50,size:5,rotation:-7,...sig,autograph:id};
    else if(sig)sig.translation=id;
    draw();
  });
  $$('[data-letter-case]').forEach(b=>b.onclick=()=>{if(!sig)return;if(b.dataset.letterCase==='upper')sig.letterCase='upper';else delete sig.letterCase;draw();});
  $$('[data-sig-slider]').forEach(input=>input.oninput=()=>{if(sig){sig[input.dataset.sigSlider]=Number(input.value);draw();}});
  $$('[data-place]').forEach(b=>b.onclick=()=>{
    // Dim follows the place's default until you change it yourself.
    if(bg&&bg.dim===fresh(bg.id).dim)bg.dim=profileBackgroundOf({id:bg.id,place:b.dataset.place}).dim;
    place=b.dataset.place;draw();
  });
  $$('[data-bg]').forEach(b=>b.onclick=()=>{const id=b.dataset.bg||null;bg=id?(bg?{...bg,id}:fresh(id)):null;draw();});
  $$('[data-slider]').forEach(input=>input.oninput=()=>{if(!bg)return;bg[input.dataset.slider]=Number(input.value);draw();});
  $('[data-reset]').onclick=()=>{if(bg){bg={...fresh(bg.id),style:bg.style};draw();}};
  // Drag the preview: moving right shows more of the left of the image. Drag the signature to
  // move it instead.
  preview.onpointerdown=e=>{
    if(!bg)return;
    const target=place==='head'?preview.querySelector('.pbg-mock-head'):preview,rect=target.getBoundingClientRect();
    const onSig=!!(sig&&e.target.closest('.card-autograph'));
    const start={x:e.clientX,y:e.clientY,bx:onSig?sig.x:bg.x,by:onSig?sig.y:bg.y};preview.setPointerCapture(e.pointerId);preview.classList.add('dragging');
    const clamp=n=>Math.max(0,Math.min(100,Math.round(n)));
    preview.onpointermove=m=>{
      const dx=(m.clientX-start.x)/rect.width*100,dy=(m.clientY-start.y)/rect.height*100;
      if(onSig){sig.x=clamp(start.bx+dx);sig.y=clamp(start.by+dy);}
      else {bg.x=clamp(start.bx-dx);bg.y=clamp(start.by-dy);}
      draw();
    };
    preview.onpointerup=preview.onpointercancel=()=>{preview.onpointermove=null;preview.classList.remove('dragging');};
  };
  $('[data-save]').onclick=async()=>{
    const background=bg&&{...bg,place,sig};
    $$('button').forEach(b=>b.disabled=true);say('Saving…');
    try {
      const {state:next}=await collectionAction('profile-background',{background});
      showProfileBackground(next.profileBackground,name);onSaved?.(next);dialog.close();
    } catch(err) {say(err.message);}
    finally {$$('button').forEach(b=>b.disabled=false);draw();}
  };
  $('[data-close]').onclick=$('[data-cancel]').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>dialog.remove());
  draw();dialog.showModal();
}
