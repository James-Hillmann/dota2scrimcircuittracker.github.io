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
