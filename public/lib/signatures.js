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
// Hiragana is the katakana reading shifted into the hiragana block.
export const hiraganaName=text=>japaneseName(text).replace(/[ァ-ヶ]/gu,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
// Kanji spells the katakana reading with phonetic characters (ateji), one per sound.
const KANJI_PAIRS={'シャ':'紗','シュ':'朱','ショ':'将','チャ':'茶','チュ':'忠','チョ':'蝶','キャ':'伽','キュ':'久','キョ':'京','ニャ':'若','ニュ':'入','ニョ':'女','リャ':'良','リュ':'竜','リョ':'涼','ジャ':'邪','ジュ':'寿','ジョ':'如','ティ':'帝','トゥ':'斗','ディ':'弟','ドゥ':'堂','ウィ':'威','ウェ':'恵','ウォ':'魚','ファ':'芭','フィ':'妃','フェ':'笛','フォ':'鳳','ヴァ':'婆','ヴィ':'尾','ヴェ':'辺','ヴォ':'墓'};
const KANJI='ア亜イ伊ウ宇エ恵オ央カ加キ希ク久ケ毛コ子ガ我ギ義グ具ゲ下ゴ呉サ沙シ志ス須セ世ソ蘇ザ座ジ治ズ図ゼ是ゾ蔵タ多チ知ツ都テ天ト斗ダ陀デ出ド土ナ奈ニ仁ヌ奴ネ音ノ乃ハ波ヒ飛フ布ヘ部ホ保バ馬ビ美ブ舞ベ辺ボ母パ巴ピ比プ富ペ平ポ浦マ真ミ美ム夢メ女モ茂ヤ夜ユ由ヨ代ラ羅リ里ル留レ礼ロ路ワ和ン恩ヴ舞ァ亜ィ伊ゥ宇ェ恵ォ央ャ夜ュ由ョ代';
const KANJI_ONE=Object.fromEntries([...KANJI].flatMap((c,i,a)=>i%2?[]:[[c,a[i+1]]]));
export const kanjiName=text=>japaneseName(text).replace(/ッ/g,'').replace(/.[ャュョァィゥェォ]?/gu,s=>KANJI_PAIRS[s]??[...s].map(c=>KANJI_ONE[c]??c).join(''));
const transliterate=(text,map)=>[...text.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase()].map(c=>map[c]??c).join('');
const cyrillic={a:'а',b:'б',c:'к',d:'д',e:'е',f:'ф',g:'г',h:'х',i:'и',j:'ж',k:'к',l:'л',m:'м',n:'н',o:'о',p:'п',q:'к',r:'р',s:'с',t:'т',u:'у',v:'в',w:'ш',x:'кс',y:'й',z:'з'};
const greek={a:'α',b:'β',c:'κ',d:'δ',e:'ε',f:'φ',g:'γ',h:'η',i:'ι',j:'τζ',k:'κ',l:'λ',m:'μ',n:'ν',o:'ο',p:'π',q:'κ',r:'ρ',s:'σ',t:'τ',u:'υ',v:'β',w:'ω',x:'ξ',y:'ψ',z:'ζ'};
const runic={a:'ᚨ',b:'ᛒ',c:'ᚲ',d:'ᛞ',e:'ᛖ',f:'ᚠ',g:'ᚷ',h:'ᚺ',i:'ᛁ',j:'ᛃ',k:'ᚲ',l:'ᛚ',m:'ᛗ',n:'ᚾ',o:'ᛟ',p:'ᛈ',q:'ᚲ',r:'ᚱ',s:'ᛋ',t:'ᛏ',u:'ᚢ',v:'ᚹ',w:'ᚹ',x:'ᚲᛋ',y:'ᛃ',z:'ᛉ'};
export const cyrillicName=text=>transliterate(text,cyrillic);
export const greekName=text=>transliterate(text,greek);
export const runicName=text=>transliterate(text,runic);
// Korean, Chinese and Thai sound the name out by syllable: each unit is {c:onset,v:'a'|'e'|'i'|'o'|'u'|null,coda}.
// v:null is a consonant with no vowel of its own; a script may fold it into the previous syllable as a coda.
const VOWEL_RUNS={ee:'i',ea:'i',ie:'i',ey:'i',y:'i',oo:'u',ou:'u',ew:'u',ai:'e',ay:'e',ei:'e',ae:'e',au:'o',aw:'o',oa:'o',ow:'o',oe:'o'};
const isVowel=(w,i)=>/[aeiou]/.test(w[i]??'')||(w[i]==='y'&&i>0&&!/[aeiou]/.test(w[i+1]??''));
function syllables(word,coda) {
  let w=word.replace(/(.)\1+/g,(m,c)=>/[aeiou]/.test(c)?m:c);
  if(w.length>3&&/[^aeiou]e$/.test(w))w=w.slice(0,-1);
  const cons=[];
  for(let i=0;i<w.length;) {
    if(isVowel(w,i)) {let run='';while(i<w.length&&(isVowel(w,i)||(w[i]==='w'&&run&&!/[aeiou]/.test(w[i+1]??''))))run+=w[i++];cons.push({v:VOWEL_RUNS[run]??VOWEL_RUNS[run.slice(0,2)]??(run[0]==='y'?'i':run[0])});continue;}
    const two=w.slice(i,i+2);
    if(['sh','ch','th','ph'].includes(two)||(two==='ng'&&!/[aeiouy]/.test(w[i+2]??''))) {cons.push({c:two});i+=2;continue;}
    if(two==='ck'){cons.push({c:'k'});i+=2;continue;}
    const c=w[i++];
    if(c==='x')cons.push({c:'k'},{c:'s'});else if(c==='c')cons.push({c:/[eiy]/.test(w[i]??'')?'s':'k'});else if(c==='q')cons.push({c:'k'});else cons.push({c});
    if(cons.length>1&&cons.at(-1).c&&cons.at(-1).c===cons.at(-2).c)cons.pop();
  }
  const units=[];
  for(let i=0;i<cons.length;i++) {
    const t=cons[i],next=cons[i+1];
    if(t.v)units.push({c:'',v:t.v,coda:''});
    else if(next?.v){units.push({c:t.c,v:next.v,coda:''});i++;}
    else {const prev=units.at(-1);if(prev?.v&&!prev.coda&&coda(t.c))prev.coda=t.c;else units.push({c:t.c,v:null,coda:''});}
  }
  return units;
}
const soundOut=(text,coda,unit,space)=>text.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().split(/([a-z]+)/).map((part,i)=>i%2?syllables(part,coda).map(unit).join(''):part.replace(/ /g,space)).join('');
const HANGUL_ONSET={'':11,b:7,d:3,f:17,g:0,h:18,j:12,k:15,l:5,m:6,n:2,p:17,r:5,s:9,t:16,v:7,z:12,sh:9,ch:14,th:16,ph:17,y:11,w:11,ng:11};
const HANGUL_VOWEL={plain:{a:0,e:5,i:20,o:8,u:13},y:{a:2,e:7,i:20,o:12,u:17},w:{a:9,e:15,i:16,o:14,u:13}};
const HANGUL_CODA={n:4,m:16,l:8,ng:21};
export const koreanName=text=>soundOut(text,c=>c in HANGUL_CODA,({c,v,coda})=>{
  if(!v&&c==='r')return '';
  const glide=c==='y'||c==='sh'?'y':c==='w'?'w':'plain';
  const vowel=v?HANGUL_VOWEL[glide][v]:/^(ch|j|sh)$/.test(c)?20:18;
  return String.fromCharCode(0xac00+((HANGUL_ONSET[c]??11)*21+vowel)*28+(HANGUL_CODA[coda]??0));
},' ');
// Standard transliteration characters: vowels a e i o u, then the same with a final n.
const HANZI={'':'阿埃伊奥乌安恩因昂温',b:'巴贝比博布班本宾邦本',d:'达德迪多杜丹登丁东敦',f:'法费菲福富凡芬芬丰芬',g:'加盖吉戈古甘根金冈贡',h:'哈赫希霍胡汉亨欣洪洪',j:'贾杰吉乔朱简詹金琼君',k:'卡凯基科库坎肯金孔昆',l:'拉莱利洛卢兰伦林隆伦',m:'马梅米莫穆曼门明蒙蒙',n:'纳内尼诺努南嫩宁农农',p:'帕佩皮波普潘彭平庞蓬',r:'拉雷里罗鲁兰伦林龙伦',s:'萨塞西索苏桑森辛森孙',t:'塔泰蒂托图坦滕廷通通',v:'瓦维维沃武万文文冯文',w:'瓦韦威沃伍万文温翁翁',y:'亚耶伊约尤扬延因扬云',z:'扎泽齐佐祖赞曾津宗尊',sh:'沙谢希肖舒尚申欣尚顺',ch:'查切奇乔丘钱琴钦琼春'};
const HANZI_ALIAS={th:'s',ph:'f',ng:'n'};
const HANZI_ALONE={b:'布',d:'德',f:'夫',g:'格',h:'赫',j:'吉',k:'克',l:'尔',m:'姆',n:'恩',p:'普',r:'尔',s:'斯',t:'特',v:'夫',w:'乌',y:'伊',z:'兹',sh:'什',ch:'奇',th:'斯',ph:'夫',ng:'恩'};
export const chineseName=text=>soundOut(text,c=>c==='n'||c==='ng',({c,v,coda})=>v?[...HANZI[HANZI_ALIAS[c]??c]??HANZI['']]['aeiou'.indexOf(v)+(coda?5:0)]:HANZI_ALONE[c]??'','·');
const THAI={'':'อ',b:'บ',d:'ด',f:'ฟ',g:'ก',h:'ฮ',j:'จ',k:'ค',l:'ล',m:'ม',n:'น',p:'พ',r:'ร',s:'ส',t:'ท',v:'ว',w:'ว',y:'ย',z:'ซ',sh:'ช',ch:'ช',th:'ธ',ph:'ฟ',ng:'ง'};
const THAI_FINAL={k:'ก',g:'ก',t:'ต',d:'ด',p:'ป',b:'บ',v:'ฟ',f:'ฟ',z:'ส'};
export const thaiName=text=>soundOut(text,c=>c!=='r',({c,v,coda})=>{
  const C=THAI[c]??'',end=coda?THAI_FINAL[coda]??THAI[coda]??'':'';
  if(!v)return c==='r'?'':C;
  const open={a:C+'า',e:'เ'+C,i:C+'ี',o:'โ'+C,u:C+'ู'},closed={a:C+'ั',e:'เ'+C,i:C+'ิ',o:C+'อ',u:C+'ุ'};
  return (coda?closed:open)[v]+end;
},' ');
const renderers={japanese:japaneseName,hiragana:hiraganaName,kanji:kanjiName,cyrillic:cyrillicName,greek:greekName,runic:runicName,korean:koreanName,chinese:chineseName,thai:thaiName};
// Modifiers whose alphabet has capitals; the player picks lower (the default) or upper case.
export const CASED_MODIFIERS=['greek','cyrillic'];
export const LETTER_CASES=['lower','upper'];
const finalSigma=text=>text.replace(/σ(?![\p{L}])/gu,'ς');
export function renderedName(text,translation='none',letterCase='lower') {
  const out=(renderers[translation]??(value=>value))(text);
  if(!CASED_MODIFIERS.includes(translation))return out;
  return letterCase==='upper'?out.toUpperCase():translation==='greek'?finalSigma(out):out;
}
export const writingOf=text=>/[\u3040-\u30ff]/u.test(text)?'ja':/[\uac00-\ud7af]/u.test(text)?'ko':/[\u3400-\u9fff]/u.test(text)?'zh':/[\u0400-\u04ff]/u.test(text)?'cyrl':/[\u0370-\u03ff]/u.test(text)?'greek':/[\u16a0-\u16ff]/u.test(text)?'runic':/[฀-๿]/u.test(text)?'thai':'latin';
export function signatureHtml(equipment,name) {
  const item=itemByKey(`autograph:${equipment.autograph}`);if(!item)return '';
  const text=renderedName(name,equipment.translation,equipment.letterCase);
  const glyphs=item.rough?[...text].map((c,i)=>`<span class="signature-glyph" style="--glyph-lift:${(i%3)-1}px;--glyph-tilt:${(i%5-2)*2}deg">${escape(c)}</span>`).join(''):escape(text);
  const paths=(PEN_MARKS[item.flourish]??PEN_MARKS.simple).map(d=>`<path d="${d}"/>`).join('');
  const size=Math.min(equipment.size,140/Math.max(8,[...text].length));
  return `<span class="card-autograph" data-autograph="${item.id}" data-writing="${equipment.translation==='kanji'?'ja':writingOf(text)}" style="left:${equipment.x}%;top:${equipment.y}%;--signature-size:${size}cqi;--placement-rotation:${equipment.rotation}deg" aria-label="Signature: ${escape(text)}"><span class="autograph-lettering">${glyphs}</span><svg class="signature-penmarks" viewBox="-10 -10 320 105" aria-hidden="true">${paths}</svg></span>`;
}
