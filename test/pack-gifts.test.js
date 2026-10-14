import {test} from 'node:test';
import assert from 'node:assert/strict';
import {giftPacks,clearGifts,giftLabel,isAdmin,ADMIN_ACCOUNT} from '../public/lib/pack-gifts.js';
import {grantLogin,rollPack} from '../public/lib/cosmetics-engine.js';

test('only Fav is the admin',()=>{
  assert.ok(isAdmin(ADMIN_ACCOUNT));assert.ok(isAdmin(Number(ADMIN_ACCOUNT)));
  assert.ok(!isAdmin('123'));assert.ok(!isAdmin(null));
});
test('a gift adds packs of its rarity and an unseen notice; seeing it clears the notice, not the packs',()=>{
  const state=grantLogin(null,new Date('2026-10-13'));
  const given=giftPacks(state,{tier:'epic',count:2,note:'  nice   games '},1000);
  assert.deepEqual(given.packs,['common','common','common','epic','epic']);
  assert.deepEqual(given.gifts,[{tier:'epic',count:2,note:'nice games',at:1000}]);
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
test('gift labels read naturally',()=>{
  assert.equal(giftLabel({tier:'epic',count:1}),'an Epic pack');
  assert.equal(giftLabel({tier:'common',count:1}),'a Common pack');
  assert.equal(giftLabel({tier:'rare',count:3}),'3 Rare packs');
});
