import {test} from 'node:test';
import assert from 'node:assert/strict';
import {giftPacks,clearGifts,giftLabel,isAdmin,ADMIN_ACCOUNT} from '../public/lib/pack-gifts.js';
import {grantLogin,rollPack} from '../public/lib/cosmetics-engine.js';
import {SCREEN_ART} from '../public/lib/screen-art-data.js';
import {CATALOG} from '../public/lib/cosmetics-catalog.js';
import {CosmeticsVault} from '../workers/steam-auth/src/cosmetics.js';

test('gifts support screen packs, each card item type, and individual unowned screens',()=>{
  const state=grantLogin(null);
  assert.equal(giftPacks(state,{tier:'screens',count:3}).packs.filter(p=>p==='screens').length,3);
  for(const type of ['border','finish','autograph','translation']) {
    const item=CATALOG.find(i=>i.type===type);
    const given=giftPacks(state,{kind:'item',item:item.key,count:2});
    assert.equal(given.inventory[item.key],2);assert.deepEqual(given.packs,state.packs);
    assert.ok(giftLabel(given.gifts[0]).includes(item.name));
  }
  const screen=SCREEN_ART[0],given=giftPacks(state,{kind:'screen',item:screen.id});
  assert.deepEqual(given.screens,[screen.id]);
  assert.throws(()=>giftPacks(given,{kind:'screen',item:screen.id}),/already have/);
  assert.throws(()=>giftPacks(state,{kind:'item',item:'border:invalid'}));
  assert.throws(()=>giftPacks(state,{kind:'screen',item:'invalid'}));
  assert.equal(giftLabel({tier:'screens',count:3}),'3 loading screen packs');
});

test('vault checks the gift sender, persists gifts and makes retries safe',async()=>{
  const rows=new Map(),storage={get:async k=>structuredClone(rows.get(k)),put:async(k,v)=>rows.set(k,structuredClone(v))};
  storage.transaction=fn=>fn(storage);
  const vault=new CosmeticsVault({storage});
  const request=(account,body)=>vault.fetch(new Request(`https://vault/action?account=${account}`,{method:'POST',body:JSON.stringify(body)}));
  await request(ADMIN_ACCOUNT,{action:'session'});await request('101',{action:'session'});
  const gift={action:'gift',target:'102',kind:'item',item:CATALOG[0].key,count:2,requestId:'safe-gift-request-12345'};
  assert.equal((await request('101',gift)).status,400);
  assert.equal((await request(ADMIN_ACCOUNT,gift)).status,200);
  await request(ADMIN_ACCOUNT,gift);
  assert.equal(rows.get('user:102').inventory[gift.item],2);
  await request('102',{action:'session'});
  const screen={action:'gift',target:'102',kind:'screen',item:SCREEN_ART[0].id,requestId:'safe-screen-request-12345'};
  await request(ADMIN_ACCOUNT,screen);await request(ADMIN_ACCOUNT,screen);
  const publicState=await (await vault.fetch(new Request('https://vault/collection?account=102'))).json();
  assert.deepEqual(publicState.screens,[screen.item]);
  assert.equal(publicState.gifts,undefined);
  assert.equal(rows.get('user:102').gifts.length,3);
});

test('only Fav is the admin',()=>{
  assert.ok(isAdmin(ADMIN_ACCOUNT));assert.ok(isAdmin(Number(ADMIN_ACCOUNT)));
  assert.ok(!isAdmin('123'));assert.ok(!isAdmin(null));
});
test('a gift adds packs of its rarity and an unseen notice; seeing it clears the notice, not the packs',()=>{
  const state=grantLogin(null,new Date('2026-10-13'));
  const given=giftPacks(state,{tier:'epic',count:2,note:'  nice   games '},1000);
  assert.deepEqual(given.packs,['common','common','common','epic','epic']);
  assert.deepEqual(given.gifts,[{kind:'pack',tier:'epic',count:2,note:'nice games',at:1000}]);
  const opened=rollPack(given,3,()=>0.99).state;
  assert.equal(opened.packs.length,4);
  const seen=clearGifts(given);
  assert.equal(seen.gifts,undefined);assert.equal(seen.packs.length,5);
});
test('gifts reject bad rarities, counts and notes',()=>{
  const state=grantLogin(null);
  for(const g of [{tier:'mythic'},{count:0},{count:11},{count:1.5},{note:'<b>'},{note:'x'.repeat(121)}])
    assert.throws(()=>giftPacks(state,g),undefined,JSON.stringify(g));
});

test('sent packs append to pending packs and preserve inventory, designs, grants and the refill timer',()=>{
  const state={...grantLogin(null),packs:['common','rare','epic','legendary','screens'],nextPackAt:123456789,grants:['screens-2026-10'],inventory:{'border:copper':4}};
  const given=giftPacks(state,{tier:'screens',count:3});
  assert.deepEqual(given.packs,[...state.packs,'screens','screens','screens']);
  for(const key of ['inventory','equipment','grants','nextPackAt'])assert.deepEqual(given[key],state[key]);
  assert.equal(state.packs.length,5);
});
test('gift labels read naturally',()=>{
  assert.equal(giftLabel({tier:'epic',count:1}),'an Epic pack');
  assert.equal(giftLabel({tier:'common',count:1}),'a Common pack');
  assert.equal(giftLabel({tier:'rare',count:3}),'3 Rare packs');
});
