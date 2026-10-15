import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CATALOG,TIERS,PACK_ODDS,DEFAULT_EQUIPMENT} from '../public/lib/cosmetics-catalog.js';
import {grantLogin,rollPack,recycleCards,equipCosmetics,saveCardDesign,setCardPreferences,cardDesignState,cardAppearance,selectedCardDesign,setProfileBackground,profileBackgroundOf} from '../public/lib/cosmetics-engine.js';
import {japaneseName,cyrillicName,greekName,runicName,koreanName,chineseName,thaiName,renderedName,signatureHtml} from '../public/lib/signatures.js';
import {CosmeticsVault,cosmeticsRequest} from '../workers/steam-auth/src/cosmetics.js';

test('approved collection has all tiers, no language samples in signature drops',()=>{
  assert.equal(new Set(CATALOG.map(i=>i.key)).size,CATALOG.length);
  assert.equal(CATALOG.length,79);
  assert.deepEqual(PACK_ODDS,{common:69,rare:17,epic:10,legendary:4});
  for(const tier of TIERS)assert.ok(CATALOG.some(i=>i.rarity===tier));
  for(const item of CATALOG.filter(i=>i.type==='autograph')) {assert.equal(item.sample,undefined);assert.equal(item.script,undefined);}
  assert.ok(CATALOG.filter(i=>i.type==='translation').every(i=>i.rarity==='legendary'));
});
test('eight-hour refill accrues offline up to three, pauses at capacity and resumes after opening',()=>{
  const now=new Date('2026-10-13T00:00:00Z'),first=grantLogin(null,now);
  assert.equal(first.packs.length,3);assert.equal(first.nextPackAt,null);
  assert.deepEqual(grantLogin(first,new Date('2026-11-01')),first);
  let state=rollPack(first,0,()=>0,now).state;
  assert.equal(state.nextPackAt,now.getTime()+8*3600000);
  state=rollPack(state,0,()=>0,now).state;state=rollPack(state,0,()=>0,now).state;
  assert.equal(grantLogin(state,new Date('2026-10-13T07:59:59Z')).packs.length,0);
  assert.equal(grantLogin(state,new Date('2026-10-13T08:00:00Z')).packs.length,1);
  assert.equal(grantLogin(state,new Date('2026-10-13T16:00:00Z')).packs.length,2);
  const full=grantLogin(state,new Date('2026-11-01'));assert.equal(full.packs.length,3);assert.equal(full.nextPackAt,null);
  const opened=rollPack(full,0,()=>0,new Date('2026-11-01')).state;
  assert.equal(opened.nextPackAt,new Date('2026-11-01T08:00:00Z').getTime());
  const legacy={...first,v:1,packs:['common','common','common','common','rare'],lastDay:'2026-10-12'};
  assert.equal(grantLogin(legacy,now).packs.length,5);
  const withUpgrade={...state,packs:['rare','epic']};
  assert.equal(grantLogin(withUpgrade,new Date('2026-11-01')).packs.length,5);
});
test('roll boundaries follow exact odds; packs contain three and do not mutate input',()=>{
  const first=grantLogin(null),seq=[.68999,0,.69,0,.86,0];let at=0;
  const result=rollPack(first,0,()=>seq[at++]);
  assert.deepEqual(result.rewards.map(r=>CATALOG.find(i=>i.key===r.key).rarity),['common','rare','epic']);
  assert.equal(result.state.packs.length,2);assert.equal(first.packs.length,3);
  const legend=rollPack(first,0,()=>.999999);assert.ok(legend.rewards.every(r=>CATALOG.find(i=>i.key===r.key).rarity==='legendary'));
  assert.throws(()=>rollPack(first,-1));assert.throws(()=>rollPack(first,3));
});
test('recycling protects last copies and only accepts ten extras of one tier',()=>{
  const common=CATALOG.find(i=>i.rarity==='common'),rare=CATALOG.find(i=>i.rarity==='rare'),legend=CATALOG.find(i=>i.rarity==='legendary');
  const state={...grantLogin(null),inventory:{[common.key]:11,[rare.key]:11,[legend.key]:11}};
  const result=recycleCards(state,{[common.key]:10});assert.equal(result.state.inventory[common.key],1);assert.equal(result.state.packs.at(-1),'rare');
  assert.throws(()=>recycleCards({...state,inventory:{[common.key]:10}},{[common.key]:10}),/last copy/);
  assert.throws(()=>recycleCards(state,{[common.key]:9,[rare.key]:1}),/same rarity/);
  assert.throws(()=>recycleCards(state,{[common.key]:5}),/exactly 10/);
  assert.throws(()=>recycleCards(state,{[legend.key]:10}),/Legendary/);
  for(const minimum of TIERS.slice(1)) {
    const upgraded={...state,packs:[minimum]};
    for(let n=0;n<50;n++)assert.ok(rollPack(upgraded,0).rewards.every(r=>TIERS.indexOf(CATALOG.find(i=>i.key===r.key).rarity)>=TIERS.indexOf(minimum)));
  }
});
test('equipment requires ownership and bounded placement; signatures only use the player name',()=>{
  const first=grantLogin(null),sig=CATALOG.find(i=>i.type==='autograph');
  assert.throws(()=>equipCosmetics(first,{autograph:sig.id}),/Collect/);
  const state={...first,inventory:{[sig.key]:1,'translation:japanese':1}};
  const equipped=equipCosmetics(state,{autograph:sig.id,translation:'japanese',x:23,y:78,size:12,rotation:30,text:'Scionara'});
  assert.equal(equipped.equipment.x,23);assert.equal(first.equipment.autograph,'none');
  assert.equal(japaneseName('Scionara'),'シオナラ');
  assert.equal(japaneseName('Sayonara'),'サヨナラ');
  assert.equal(cyrillicName('Scionara'),'скионара');
  assert.equal(greekName('Scionara'),'σκιοναρα');
  assert.equal(runicName('Scionara'),'ᛋᚲᛁᛟᚾᚨᚱᚨ');
  assert.equal(koreanName('Scionara'),'시나라');
  assert.equal(koreanName('Shane Young'),'샨 융');
  assert.equal(chineseName('Topson'),'托普森');
  assert.equal(thaiName('James'),'จาเมส');
  for(const item of CATALOG.filter(i=>i.type==='translation'))assert.equal(item.preview,`Fav → ${renderedName('Fav',item.id)}`);
  assert.equal(renderedName('Scionara','none'),'Scionara');
  assert.equal(equipped.equipment.text,'');
  assert.match(signatureHtml(equipped.equipment,'Scionara'),/シオナラ/);
  assert.match(signatureHtml({...equipped.equipment,translation:'none',text:'unwanted custom text'},'<img>'),/&lt;img&gt;/);
  assert.doesNotMatch(signatureHtml({...equipped.equipment,translation:'none',text:'unwanted custom text'},'Name'),/unwanted custom text/);
  for(const raw of [{x:NaN},{x:101},{size:100},{rotation:-181}])assert.throws(()=>equipCosmetics(state,raw));
});
test('base card artwork and hue are validated and preserved when swapping cosmetics',()=>{
  const state=grantLogin(null);
  const saved=equipCosmetics(state,{baseCard:{hero:74,art:'vert',style:'cinema',crop:{x:22,y:35,zoom:1.5}},hue:120});
  assert.equal(saved.equipment.baseCard.hero,74);assert.equal(saved.equipment.hue,120);
  const fast=equipCosmetics(saved,{particleSpeed:180});assert.equal(fast.equipment.particleSpeed,180);
  assert.equal(equipCosmetics(fast,{}).equipment.particleSpeed,180);
  const swapped=equipCosmetics(saved,{});assert.deepEqual(swapped.equipment.baseCard,saved.equipment.baseCard);assert.equal(swapped.equipment.hue,120);
  for(const raw of [{hue:361},{hue:'30'},{particleSpeed:49},{particleSpeed:201},{particleSpeed:'100'},{baseCard:{hero:9999}},{baseCard:{hero:74,art:'bad'}},{baseCard:{hero:74,style:'bad'}},{baseCard:{hero:74,crop:{x:101,y:0,zoom:1}}}])assert.throws(()=>equipCosmetics(state,raw));
});
test('three saved designs preserve the existing card; primary and viewer shuffle use only saved slots',()=>{
  const original=grantLogin(null),legacyEquipment=structuredClone(original.equipment);
  assert.deepEqual(cardDesignState(original).cardDesigns,[legacyEquipment,null,null]);
  let state=saveCardDesign(original,{hue:120,baseCard:{hero:74,art:'vert'}},1);
  assert.deepEqual(state.equipment,legacyEquipment);assert.equal(state.cardDesigns[1].hue,120);
  assert.deepEqual(original.equipment,legacyEquipment);assert.equal(original.cardDesigns,undefined);
  assert.throws(()=>setCardPreferences(state,{primaryCard:2}),/Save/);
  state=setCardPreferences(state,{primaryCard:1,shuffleCards:true});
  assert.equal(state.equipment.hue,120);
  const appearance=cardAppearance(state);
  assert.equal(selectedCardDesign(appearance,true,.99).hue,120);
  assert.deepEqual(selectedCardDesign(appearance,false,0),legacyEquipment);
  assert.equal(selectedCardDesign(appearance,false,.99).hue,120);
  state=saveCardDesign(state,{hue:240,baseCard:{hero:21,art:'vert'}},2);
  assert.equal(selectedCardDesign(cardAppearance(state),false,.99).hue,240);
  state=setCardPreferences(state,{shuffleCards:false});
  assert.equal(selectedCardDesign(cardAppearance(state),false,.99).hue,120);
  for(const slot of [-1,3,1.5])assert.throws(()=>saveCardDesign(state,{},slot));
  assert.throws(()=>saveCardDesign(state,{border:'rose'},2),/Collect/);
  assert.throws(()=>setCardPreferences(state,{shuffleCards:'yes'}));
  assert.deepEqual(state.packs,original.packs);assert.deepEqual(state.inventory,original.inventory);
});
test('vault persists grants, ignores replayed opens and rejects forged equip',async()=>{
  const rows=new Map(),storage={get:async k=>structuredClone(rows.get(k)),put:async(k,v)=>rows.set(k,structuredClone(v)),list:async({prefix})=>new Map([...rows].filter(([k])=>k.startsWith(prefix)))};storage.transaction=fn=>fn(storage);
  const vault=new CosmeticsVault({storage});
  const request=body=>vault.fetch(new Request('https://vault/action?account=101',{method:'POST',body:JSON.stringify(body)}));
  assert.deepEqual((await (await request({action:'session'})).json()).state.packs,['common','common','common','screens','screens','screens']);
  assert.equal((await (await request({action:'session'})).json()).state.packs.length,6);
  const input={action:'open',packIndex:0,requestId:'a-unique-request-12345'};
  const result=await (await request(input)).json();assert.equal(result.rewards.length,3);
  assert.deepEqual((await (await request(input)).json()).rewards,result.rewards);
  assert.equal(rows.get('user:101').packs.length,5);
  assert.equal((await request({action:'equip',requestId:'another-request-12345',equipment:{border:'madeup'}})).status,400);
  assert.equal((await request({action:'equip',requestId:'equipment-request-12345',equipment:DEFAULT_EQUIPMENT})).status,200);
  const pub=await (await vault.fetch(new Request('https://vault/collection?account=101'))).json();assert.equal(pub.packs,undefined);assert.ok(pub.inventory);
  assert.ok((await (await vault.fetch(new Request('https://vault/appearances'))).json())['101']);
});
test('API refuses wrong origins and unauthenticated or forged sessions',async()=>{
  const env={COSMETICS:{idFromName:()=>0,get:()=>({fetch:()=>{throw new Error('Should not access vault');}})},FIREBASE_WEB_API_KEY:'test'};
  assert.equal((await cosmeticsRequest(new Request('https://worker/cosmetics',{method:'POST',headers:{origin:'https://evil.test'}}),env,['https://site.test'])).status,403);
  assert.equal((await cosmeticsRequest(new Request('https://worker/cosmetics',{method:'POST'}),env,['https://site.test'])).status,401);
  const original=globalThis.fetch;globalThis.fetch=async()=>Response.json({users:[{localId:'anonymous'}]});
  try {assert.equal((await cosmeticsRequest(new Request('https://worker/cosmetics',{method:'POST',headers:{authorization:'Bearer forged'}}),env,['https://site.test'])).status,401);}finally{globalThis.fetch=original;}
});
test('already claimed bonus offers reconcile state without issuing another pack',async()=>{
  const rows=new Map(),storage={get:async k=>structuredClone(rows.get(k)),put:async(k,v)=>rows.set(k,structuredClone(v)),list:async({prefix})=>new Map([...rows].filter(([k])=>k.startsWith(prefix)))};storage.transaction=fn=>fn(storage);
  const vault=new CosmeticsVault({storage});
  const request=body=>vault.fetch(new Request('https://vault/action?account=202',{method:'POST',body:JSON.stringify(body)}));
  await request({action:'session'});
  for(const source of ['tour','discord']) {
    const first=await (await request({action:'claim-bonus',source,requestId:`first-${source}-request-12345`})).json();
    const retry=await (await request({action:'claim-bonus',source,requestId:`second-${source}-request-12345`})).json();
    assert.equal(retry.alreadyClaimed,true);assert.equal(retry.state.packs.length,first.state.packs.length);
    assert.equal(retry.state.bonusPackClaims[source],true);
  }
  const saved=rows.get('user:202');saved.bonusPackClaimed=true;rows.set('user:202',saved);
  const legacy=await (await request({action:'claim-bonus',source:'feedback',requestId:'legacy-feedback-request-12345'})).json();
  assert.equal(legacy.alreadyClaimed,true);assert.equal(legacy.state.packs.length,saved.packs.length);
});

test('API verifies Steam sessions with the allowed site referrer and distinguishes service failures',async()=>{
  const env={COSMETICS:{idFromName:()=>0,get:()=>({fetch:async req=>{
    assert.equal(new URL(req.url).searchParams.get('account'),'101');
    return Response.json({state:grantLogin(null)});
  }})},FIREBASE_WEB_API_KEY:'test'};
  const request=()=>new Request('https://worker/cosmetics',{method:'POST',headers:{origin:'http://localhost:3000',authorization:'Bearer fresh-token'},body:JSON.stringify({action:'session'})});
  const original=globalThis.fetch;
  try {
    globalThis.fetch=async(url,options)=>{
      assert.equal(options.headers.Referer,'http://localhost:3000/');
      assert.deepEqual(JSON.parse(options.body),{idToken:'fresh-token'});
      return Response.json({users:[{localId:'steam:101'}]});
    };
    const response=await cosmeticsRequest(request(),env,['http://localhost:3000']);
    assert.equal(response.status,200);assert.equal((await response.json()).state.packs.length,3);
    globalThis.fetch=async()=>Response.json({error:{message:'Requests from referer <empty> are blocked.'}},{status:403});
    assert.equal((await cosmeticsRequest(request(),env,['http://localhost:3000'])).status,503);
    globalThis.fetch=async()=>Response.json({error:{message:'TOKEN_EXPIRED'}},{status:400});
    assert.equal((await cosmeticsRequest(request(),env,['http://localhost:3000'])).status,401);
  } finally {globalThis.fetch=original;}
});

test('border symbol can be turned off and back on; only false is stored',()=>{
  const state={inventory:{},equipment:{...DEFAULT_EQUIPMENT}};
  const off=equipCosmetics(state,{emblem:false});
  assert.equal(off.equipment.emblem,false);
  assert.equal(equipCosmetics(off,{}).equipment.emblem,false);
  assert.equal('emblem' in equipCosmetics(off,{emblem:true}).equipment,false);
  assert.throws(()=>equipCosmetics(state,{emblem:'no'}),/border symbol/);
});
test('profile background: owned screen, header or page, valid framing; null clears it',()=>{
  const state={...grantLogin(null),screens:['scr:aaa']};
  assert.deepEqual(setProfileBackground(state,{background:{id:'scr:aaa'}}).profileBackground,{id:'scr:aaa',place:'head',x:50,y:30,zoom:1,dim:45,style:null,hue:0,text:'auto',sig:null});
  assert.deepEqual(setProfileBackground(state,{background:{id:'scr:aaa',place:'page',x:10,y:90,zoom:2,dim:80,style:'ember',hue:200}}).profileBackground,{id:'scr:aaa',place:'page',x:10,y:90,zoom:2,dim:80,style:'ember',hue:200,text:'auto',sig:null});
  assert.equal(setProfileBackground(state,{background:null}).profileBackground,null);
  assert.throws(()=>setProfileBackground(state,{background:{id:'scr:bbb'}}),/Collect this loading screen/);
  assert.throws(()=>setProfileBackground(state,{background:{id:'scr:aaa',place:'side'}}),/header or the whole page/);
  assert.throws(()=>setProfileBackground(state,{background:{id:'scr:aaa',zoom:5}}),/framing/);
  assert.throws(()=>setProfileBackground(state,{background:{id:'scr:aaa',dim:95}}),/dim/);
  assert.throws(()=>setProfileBackground(state,{background:{id:'scr:aaa',style:'glitter'}}),/image style/);
  assert.throws(()=>setProfileBackground(state,{background:{id:'scr:aaa',hue:400}}),/hue/);
  assert.equal(setProfileBackground(state,{background:{id:'scr:aaa',text:'#F2C14E'}}).profileBackground.text,'#f2c14e');
  assert.throws(()=>setProfileBackground(state,{background:{id:'scr:aaa',text:'red;background:url(x)'}}),/text colour/);
  assert.equal(setProfileBackground(state,{background:{id:'scr:aaa',text:'site'}}).profileBackground.text,'site');
  assert.equal(setProfileBackground(state,{background:{id:'scr:aaa',text:null}}).profileBackground.text,'auto');
  const sig=CATALOG.find(i=>i.type==='autograph'),mod=CATALOG.find(i=>i.type==='translation');
  const signer={...state,inventory:{[sig.key]:1}};
  assert.deepEqual(setProfileBackground(signer,{background:{id:'scr:aaa',sig:{autograph:sig.id,x:20,y:70,extra:1}}}).profileBackground.sig,{autograph:sig.id,translation:'none',x:20,y:70,size:5,rotation:-7});
  assert.throws(()=>setProfileBackground(state,{background:{id:'scr:aaa',sig:{autograph:sig.id}}}),/signature style/);
  assert.throws(()=>setProfileBackground(signer,{background:{id:'scr:aaa',sig:{autograph:sig.id,translation:mod.id}}}),/modifier/);
  assert.throws(()=>setProfileBackground(signer,{background:{id:'scr:aaa',sig:{autograph:sig.id,size:20}}}),/signature position/);
  assert.deepEqual(profileBackgroundOf('scr:aaa'),{id:'scr:aaa',place:'head',x:50,y:30,zoom:1,dim:45,style:null,hue:0,text:'auto',sig:null});
});

test('Greek and Cyrillic modifiers take lower or upper case; only upper is saved',()=>{
  assert.equal(renderedName('Fav','greek'),'φαβ');
  assert.equal(renderedName('Fav','greek','upper'),'ΦΑΒ');
  assert.equal(renderedName('Jonas','greek'),'τζονας');
  assert.equal(renderedName('Fav','cyrillic','upper'),'ФАВ');
  assert.equal(renderedName('Fav','runic','upper'),'ᚠᚨᚹ');
  assert.equal(renderedName('Fav','none','upper'),'Fav');
  const sig=CATALOG.find(i=>i.type==='autograph'),state={...grantLogin(null),inventory:{[sig.key]:1,'translation:greek':1}};
  const upper=equipCosmetics(state,{autograph:sig.id,translation:'greek',letterCase:'upper'}).equipment;
  assert.equal(upper.letterCase,'upper');
  assert.match(signatureHtml(upper,'Fav'),/ΦΑΒ/);
  assert.equal(equipCosmetics({...state,equipment:upper},{...upper,letterCase:'lower'}).equipment.letterCase,undefined);
  assert.equal(equipCosmetics({...state,equipment:upper},{autograph:sig.id}).equipment.letterCase,'upper');
  assert.throws(()=>equipCosmetics(state,{letterCase:'title'}),/upper case/);
  const bg={...state,screens:['scr:aaa']};
  assert.equal(setProfileBackground(bg,{background:{id:'scr:aaa',sig:{autograph:sig.id,translation:'greek',letterCase:'upper'}}}).profileBackground.sig.letterCase,'upper');
  assert.throws(()=>setProfileBackground(bg,{background:{id:'scr:aaa',sig:{autograph:sig.id,letterCase:1}}}),/upper case/);
});

test('pictures only go through /cosmetics/post, so the image filter cannot be skipped',async()=>{
  let vaultCalls=0,aiCalls=0;
  const env={COSMETICS:{idFromName:()=>'id',get:()=>({fetch:async()=>{vaultCalls++;return Response.json({ok:true});}})},
    AI:{run:async()=>{aiCalls++;return {response:'SAFE'};}},FIREBASE_WEB_API_KEY:'test'};
  const send=(path,body)=>cosmeticsRequest(new Request(`https://worker${path}`,{method:'POST',headers:{origin:'http://localhost:3000',authorization:'Bearer t'},body:JSON.stringify(body)}),env,['http://localhost:3000']);
  const original=globalThis.fetch;
  try {
    globalThis.fetch=async()=>Response.json({users:[{localId:'steam:101'}]});
    // A post or a comment with a picture sent to /cosmetics is refused before the vault.
    assert.equal((await send('/cosmetics',{action:'post',requestId:'aaaaaaaaaaaaaaaa',images:['AAAA']})).status,400);
    assert.equal((await send('/cosmetics',{action:'comment',post:'u:1:1',text:'hi',image:'AAAA',requestId:'aaaaaaaaaaaaaaab'})).status,400);
    // /cosmetics/post's larger size limit is only for posts and comments.
    assert.equal((await send('/cosmetics/post',{action:'open',requestId:'aaaaaaaaaaaaaaac'})).status,400);
    assert.equal(vaultCalls,0);assert.equal(aiCalls,0);
    // Ordinary actions and plain comments still work on /cosmetics.
    assert.equal((await send('/cosmetics',{action:'session'})).status,200);
    assert.equal((await send('/cosmetics',{action:'comment',post:'u:1:1',text:'hi',requestId:'aaaaaaaaaaaaaaad'})).status,200);
    assert.equal(vaultCalls,2);
  } finally {globalThis.fetch=original;}
});
