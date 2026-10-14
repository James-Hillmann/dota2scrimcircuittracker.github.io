import { PEN_MARKS, itemByKey } from './cosmetics-catalog.js';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Legendary name modifiers. `translation` remains the save key for compatibility.
const kana={sci:'シ',shi:'シ',chi:'チ',tsu:'ツ',sha:'シャ',shu:'シュ',sho:'ショ',cha:'チャ',chu:'チュ',cho:'チョ',kya:'キャ',kyu:'キュ',kyo:'キョ',nya:'ニャ',nyu:'ニュ',nyo:'ニョ',rya:'リャ',ryu:'リュ',ryo:'リョ',sya:'シャ',syu:'シュ',syo:'ショ',ja:'ジャ',ju:'ジュ',jo:'ジョ',ka:'カ',ki:'キ',ku:'ク',ke:'ケ',ko:'コ',ga:'ガ',gi:'ギ',gu:'グ',ge:'ゲ',go:'ゴ',sa:'サ',si:'シ',su:'ス',se:'セ',so:'ソ',za:'ザ',zi:'ジ',zu:'ズ',ze:'ゼ',zo:'ゾ',ta:'タ',ti:'ティ',tu:'トゥ',te:'テ',to:'ト',da:'ダ',di:'ディ',du:'ドゥ',de:'デ',do:'ド',na:'ナ',ni:'ニ',nu:'ヌ',ne:'ネ',no:'ノ',ha:'ハ',hi:'ヒ',hu:'フ',he:'ヘ',ho:'ホ',ba:'バ',bi:'ビ',bu:'ブ',be:'ベ',bo:'ボ',pa:'パ',pi:'ピ',pu:'プ',pe:'ペ',po:'ポ',ma:'マ',mi:'ミ',mu:'ム',me:'メ',mo:'モ',ya:'ヤ',yu:'ユ',yo:'ヨ',ra:'ラ',ri:'リ',ru:'ル',re:'レ',ro:'ロ',la:'ラ',li:'リ',lu:'ル',le:'レ',lo:'ロ',wa:'ワ',wi:'ウィ',we:'ウェ',wo:'ウォ',fa:'ファ',fi:'フィ',fu:'フ',fe:'フェ',fo:'フォ',va:'ヴァ',vi:'ヴィ',vu:'ヴ',ve:'ヴェ',vo:'ヴォ',ci:'シ',ce:'セ',ca:'カ',co:'コ',cu:'ク',a:'ア',i:'イ',u:'ウ',e:'エ',o:'オ',n:'ン',k:'ク',g:'グ',s:'ス',z:'ズ',t:'ト',d:'ド',h:'フ',b:'ブ',p:'プ',m:'ム',r:'ル',l:'ル',v:'ヴ',f:'フ',c:'ク',j:'ジ',x:'クス',y:'イ',w:'ウ'};
export function japaneseName(text) {
  const source=text.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase();let out='';
  for(let i=0;i<source.length;) {
    if(source[i]===source[i+1] && /[kstpb]/.test(source[i])) {out+='ッ';i++;continue;}
    let match=false;
    for(const n of [3,2,1]) {const s=source.slice(i,i+n);if(kana[s]) {out+=kana[s];i+=n;match=true;break;}}
    if(!match){out+=source[i]===' '?'・':source[i];i++;}
  }
  return out;
}
const transliterate=(text,map)=>[...text.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase()].map(c=>map[c]??c).join('');
const cyrillic={a:'а',b:'б',c:'к',d:'д',e:'е',f:'ф',g:'г',h:'х',i:'и',j:'ж',k:'к',l:'л',m:'м',n:'н',o:'о',p:'п',q:'к',r:'р',s:'с',t:'т',u:'у',v:'в',w:'ш',x:'кс',y:'й',z:'з'};
const greek={a:'α',b:'β',c:'κ',d:'δ',e:'ε',f:'φ',g:'γ',h:'η',i:'ι',j:'τζ',k:'κ',l:'λ',m:'μ',n:'ν',o:'ο',p:'π',q:'κ',r:'ρ',s:'σ',t:'τ',u:'υ',v:'β',w:'ω',x:'ξ',y:'ψ',z:'ζ'};
const runic={a:'ᚨ',b:'ᛒ',c:'ᚲ',d:'ᛞ',e:'ᛖ',f:'ᚠ',g:'ᚷ',h:'ᚺ',i:'ᛁ',j:'ᛃ',k:'ᚲ',l:'ᛚ',m:'ᛗ',n:'ᚾ',o:'ᛟ',p:'ᛈ',q:'ᚲ',r:'ᚱ',s:'ᛋ',t:'ᛏ',u:'ᚢ',v:'ᚹ',w:'ᚹ',x:'ᚲᛋ',y:'ᛃ',z:'ᛉ'};
export const cyrillicName=text=>transliterate(text,cyrillic);
export const greekName=text=>transliterate(text,greek);
export const runicName=text=>transliterate(text,runic);
const renderers={japanese:japaneseName,cyrillic:cyrillicName,greek:greekName,runic:runicName};
export const renderedName=(text,translation='none')=>(renderers[translation]??(value=>value))(text);
export const writingOf=text=>/[\u3040-\u30ff]/u.test(text)?'ja':/[\uac00-\ud7af]/u.test(text)?'ko':/[\u3400-\u9fff]/u.test(text)?'zh':/[\u0400-\u04ff]/u.test(text)?'cyrl':/[\u0370-\u03ff]/u.test(text)?'greek':/[\u16a0-\u16ff]/u.test(text)?'runic':'latin';
export function signatureHtml(equipment,name) {
  const item=itemByKey(`autograph:${equipment.autograph}`);if(!item)return '';
  const text=renderedName(name,equipment.translation);
  const glyphs=item.rough?[...text].map((c,i)=>`<span class="signature-glyph" style="--glyph-lift:${(i%3)-1}px;--glyph-tilt:${(i%5-2)*2}deg">${escape(c)}</span>`).join(''):escape(text);
  const paths=(PEN_MARKS[item.flourish]??PEN_MARKS.simple).map(d=>`<path d="${d}"/>`).join('');
  const size=Math.min(equipment.size,140/Math.max(8,[...text].length));
  return `<span class="card-autograph" data-autograph="${item.id}" data-writing="${writingOf(text)}" style="left:${equipment.x}%;top:${equipment.y}%;--signature-size:${size}cqi;--placement-rotation:${equipment.rotation}deg" aria-label="Signature: ${escape(text)}"><span class="autograph-lettering">${glyphs}</span><svg class="signature-penmarks" viewBox="-10 -10 320 105" aria-hidden="true">${paths}</svg></span>`;
}
