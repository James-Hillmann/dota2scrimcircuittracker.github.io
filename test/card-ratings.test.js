import {test} from 'node:test';
import assert from 'node:assert/strict';
import {designKey,castVote,tally} from '../public/lib/card-ratings.js';
import {DEFAULT_EQUIPMENT} from '../public/lib/cosmetics-catalog.js';
import {CosmeticsVault} from '../workers/steam-auth/src/cosmetics.js';

test('a design fingerprint ignores key order and changes with the design',()=>{
  assert.equal(designKey({a:1,b:{c:2,d:[1,2]}}),designKey({b:{d:[1,2],c:2},a:1}));
  assert.notEqual(designKey({...DEFAULT_EQUIPMENT}),designKey({...DEFAULT_EQUIPMENT,hue:10}));
  assert.match(designKey(DEFAULT_EQUIPMENT),/^[0-9a-f]{16}$/);
});
test('one vote per voter, null takes it back, ties go to the rarer pick',()=>{
  let v=castVote({},'1','rare');v=castVote(v,'1','epic');v=castVote(v,'2','common');
  assert.deepEqual(tally(v),{counts:{common:1,rare:0,epic:1,legendary:0},total:2,pick:'epic'});
  assert.deepEqual(tally(castVote(v,'1',null)).total,1);
  assert.throws(()=>castVote(v,'3','mythic'));
  assert.deepEqual(tally(null),{counts:{common:0,rare:0,epic:0,legendary:0},total:0,pick:null});
});
test('vault ratings: signed-in voters only once per design, never their own, reset on change, back on revert',async()=>{
  const rows=new Map(),storage={get:async k=>structuredClone(rows.get(k)),put:async(k,v)=>rows.set(k,structuredClone(v))};storage.transaction=fn=>fn(storage);
  const vault=new CosmeticsVault({storage});let n=0;
  const as=(account,body)=>vault.fetch(new Request(`https://vault/action?account=${account}`,{method:'POST',body:JSON.stringify({requestId:`rating-request-${String(++n).padStart(6,'0')}`,...body})}));
  const ratings=async()=>(await (await vault.fetch(new Request('https://vault/ratings?account=201'))).json()).cards[0];
  for(const a of [201,202,203])await as(a,{action:'session'});
  assert.equal((await as(201,{action:'equip',equipment:{...DEFAULT_EQUIPMENT,hue:30}})).status,200);
  assert.equal((await as(201,{action:'rate',target:201,cardSlot:0,rating:'legendary'})).status,400);
  assert.equal((await as(202,{action:'rate',target:201,cardSlot:1,rating:'rare'})).status,400); // empty slot
  assert.equal((await as(202,{action:'rate',target:201,cardSlot:0,rating:'mythic'})).status,400);
  const first=await (await as(202,{action:'rate',target:201,cardSlot:0,rating:'rare'})).json();
  assert.equal(first.rating.mine,'rare');
  await as(202,{action:'rate',target:201,cardSlot:0,rating:'epic'});
  await as(203,{action:'rate',target:201,cardSlot:0,rating:'epic'});
  assert.deepEqual((await ratings()).counts,{common:0,rare:0,epic:2,legendary:0});
  // A changed card has no votes; the old design keeps them for a revert.
  await as(201,{action:'equip',equipment:{...DEFAULT_EQUIPMENT,hue:90}});
  assert.equal((await ratings()).total,0);
  await as(201,{action:'equip',equipment:{...DEFAULT_EQUIPMENT,hue:30}});
  assert.deepEqual((await ratings()).counts.epic,2);
});
test('vault gallery: changed designs only, with ratings; my-votes lists only the asker\'s votes',async()=>{
  const rows=new Map(),storage={get:async k=>structuredClone(rows.get(k)),put:async(k,v)=>rows.set(k,structuredClone(v)),list:async({prefix})=>new Map([...rows].filter(([k])=>k.startsWith(prefix)).map(([k,v])=>[k,structuredClone(v)]))};storage.transaction=fn=>fn(storage);
  const vault=new CosmeticsVault({storage});let n=0;
  const as=(account,body)=>vault.fetch(new Request(`https://vault/action?account=${account}`,{method:'POST',body:JSON.stringify({requestId:`gallery-request-${String(++n).padStart(6,'0')}`,...body})}));
  const gallery=async()=>(await (await vault.fetch(new Request('https://vault/gallery'))).json()).cards;
  for(const a of [301,302,303])await as(a,{action:'session'});
  assert.deepEqual(await gallery(),[]); // fresh collections are the default card
  await as(301,{action:'equip',equipment:{...DEFAULT_EQUIPMENT,hue:30}});
  await as(302,{action:'equip',equipment:{...DEFAULT_EQUIPMENT,hue:60},cardSlot:2});
  await as(303,{action:'rate',target:301,cardSlot:0,rating:'legendary'});
  await as(302,{action:'rate',target:301,cardSlot:0,rating:'legendary'});
  const cards=await gallery();
  assert.deepEqual(cards.map(c=>[c.account,c.slot,c.primary]).sort(),[['301',0,true],['302',2,false]]);
  const card=cards.find(c=>c.account==='301');
  assert.equal(card.pick,'legendary');assert.equal(card.total,2);assert.equal(card.design.hue,30);
  const mine=await (await as(303,{action:'my-votes'})).json();
  assert.deepEqual(mine.votes,{[`301:${card.key}`]:'legendary'});
  assert.deepEqual((await (await as(301,{action:'my-votes'})).json()).votes,{});
});
test('nicknames: plain text up to 24, shown only when chosen, in the appearance, collection and gallery',async()=>{
  const {setNickname,shownNickname,cardAppearance}=await import('../public/lib/cosmetics-engine.js');
  const base={v:2,inventory:{},packs:[],equipment:{...DEFAULT_EQUIPMENT}};
  assert.equal(shownNickname(setNickname(base,{nickname:'  Big   Dog ',showNickname:false})),null);
  const on=setNickname(base,{nickname:'Big Dog',showNickname:true});
  assert.equal(shownNickname(on),'Big Dog');assert.equal(cardAppearance(on).nickname,'Big Dog');
  assert.throws(()=>setNickname(base,{nickname:'<b>x</b>',showNickname:true}));
  assert.throws(()=>setNickname(base,{nickname:'x'.repeat(25),showNickname:true}));
  assert.throws(()=>setNickname(base,{nickname:'',showNickname:true}));
  const rows=new Map(),storage={get:async k=>structuredClone(rows.get(k)),put:async(k,v)=>rows.set(k,structuredClone(v)),list:async({prefix})=>new Map([...rows].filter(([k])=>k.startsWith(prefix)).map(([k,v])=>[k,structuredClone(v)]))};storage.transaction=fn=>fn(storage);
  const vault=new CosmeticsVault({storage});let n=0;
  const as=(account,body)=>vault.fetch(new Request(`https://vault/action?account=${account}`,{method:'POST',body:JSON.stringify({requestId:`nickname-request-${String(++n).padStart(6,'0')}`,...body})}));
  await as(401,{action:'session'});
  await as(401,{action:'equip',equipment:{...DEFAULT_EQUIPMENT,hue:40}});
  assert.equal((await as(401,{action:'nickname',nickname:'Big Dog',showNickname:true})).status,200);
  assert.equal((await (await vault.fetch(new Request('https://vault/collection?account=401'))).json()).nickname,'Big Dog');
  assert.equal((await (await vault.fetch(new Request('https://vault/appearances'))).json())['401'].nickname,'Big Dog');
  assert.equal((await (await vault.fetch(new Request('https://vault/gallery'))).json()).cards[0].nickname,'Big Dog');
  await as(401,{action:'nickname',nickname:'Big Dog',showNickname:false});
  assert.equal((await (await vault.fetch(new Request('https://vault/collection?account=401'))).json()).nickname,null);
});
