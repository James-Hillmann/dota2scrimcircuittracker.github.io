import test from 'node:test';
import assert from 'node:assert/strict';
import {grantLogin,applyPackGrants,rollPack,equipCosmetics,SCREENS_PER_PACK,SCREEN_PACK_SIZE} from '../public/lib/cosmetics-engine.js';
import {SCREEN_ART} from '../public/lib/screen-art-data.js';
import {cardArtwork,cardArtOptions} from '../public/lib/card-art.js';
import {HERO_META} from '../public/lib/hero-meta.js';
import {restoreScreenPacks} from '../workers/steam-auth/src/cosmetics.js';
import {existsSync} from 'node:fs';

test('every screen image ships with the site',()=>{
  for(const s of SCREEN_ART)assert.ok(existsSync(new URL(`../public/img/loading-screens/${s.id.slice(4)}.webp`,import.meta.url)),s.label);
});

test('recovery restores old screen openings once, preserving discoveries and all pending packs',()=>{
  const state={...grantLogin(null),packs:['common','rare'],screens:[SCREEN_ART[0].id],nextPackAt:12345};
  const receipts=new Map([
    ['old-screen',{action:'open',result:{rewards:[],screens:[SCREEN_ART[0].id]}}],
    ['old-card',{action:'open',result:{rewards:[{key:'border:copper'}],screens:[SCREEN_ART[1].id]}}],
    ['new-screen',{action:'open',openedAt:1000,result:{rewards:[],screens:[SCREEN_ART[2].id]}}],
    ['failed',{action:'open',result:{error:'Failed'}}]
  ]);
  const repaired=restoreScreenPacks(state,receipts,2000);
  assert.deepEqual(repaired.packs,['common','rare','screens']);
  assert.deepEqual(repaired.screens,state.screens);assert.deepEqual(repaired.inventory,state.inventory);
  assert.equal(repaired.nextPackAt,12345);
  assert.deepEqual(restoreScreenPacks(repaired,receipts,3000),repaired);
  assert.deepEqual(state.packs,['common','rare']);
});

test('three screen packs are granted once to existing and new players without changing their cards',()=>{
  for(const original of [grantLogin(null),{...grantLogin(null),inventory:{'border:copper':2},packs:[],screens:[SCREEN_ART[0].id]}]) {
    const granted=applyPackGrants(original,1000);
    assert.deepEqual(granted.packs,[...original.packs,'screens','screens','screens']);
    assert.deepEqual(granted.inventory,original.inventory);
    assert.deepEqual(granted.equipment,original.equipment);
    assert.deepEqual(applyPackGrants(granted,2000),granted);
    let state=granted;const seen=new Set(state.screens??[]);
    for(let i=0;i<3;i++) {
      const result=rollPack(state,state.packs.indexOf('screens'),()=>0);
      assert.equal(result.rewards.length,0);assert.equal(result.screens.length,SCREEN_PACK_SIZE);
      for(const id of result.screens){assert.ok(!seen.has(id));seen.add(id);}
      assert.deepEqual(result.state.inventory,original.inventory);
      state=result.state;
    }
    assert.equal(state.packs.filter(p=>p==='screens').length,0);
  }
});

test('screen packs return remaining screens near completion and preserve the pack if none remain',()=>{
  const state={...grantLogin(null),packs:['screens'],screens:SCREEN_ART.slice(2).map(s=>s.id)};
  const result=rollPack(state,0,()=>0);
  assert.deepEqual(result.screens,SCREEN_ART.slice(0,2).map(s=>s.id));
  assert.equal(result.state.packs.length,0);
  assert.throws(()=>rollPack({...result.state,packs:['screens']},0),/every loading screen/);
});

test('screen grants append to every pending pack type without replacing packs or resetting their timer',()=>{
  const original={...grantLogin(null),packs:['common','rare','epic','legendary','screens'],nextPackAt:987654321};
  const granted=applyPackGrants(original);
  assert.deepEqual(granted.packs,['common','rare','epic','legendary','screens','screens','screens','screens']);
  assert.equal(granted.nextPackAt,original.nextPackAt);
  assert.deepEqual(original.packs,['common','rare','epic','legendary','screens']);
});

test('every pack adds two loading screens the player did not have', () => {
  let state=grantLogin(null);
  const seen=new Set();
  for(let n=0;n<3;n++) {
    const opened=rollPack(state,0);
    assert.equal(opened.screens.length,SCREENS_PER_PACK);
    for(const id of opened.screens) {assert.ok(!seen.has(id));seen.add(id);}
    state=opened.state;
  }
  assert.deepEqual(new Set(state.screens),seen);
});

test('screens stop once a player owns them all', () => {
  const all=SCREEN_ART.map(s=>s.id);
  const nearly={...grantLogin(null),screens:all.slice(1)};
  const last=rollPack(nearly,0);
  assert.deepEqual(last.screens,[all[0]]);
  const none=rollPack(last.state,0);
  assert.deepEqual(none.screens,[]);
  assert.equal(none.state.screens.length,all.length);
});

test('owned screens work as card art; hero screens only on their hero', () => {
  const any=SCREEN_ART.find(s=>!s.hero), tagged=SCREEN_ART.find(s=>s.hero), other=SCREEN_ART.find(s=>s!==any&&s!==tagged);
  const heroId=HERO_META.find(([,name])=>name===tagged.hero)[0], elsewhere=HERO_META.find(([,name])=>name!==tagged.hero)[0];
  const state={...grantLogin(null),screens:[any.id,tagged.id]};
  assert.equal(equipCosmetics(state,{baseCard:{hero:1,art:any.id}}).equipment.baseCard.art,any.id);
  assert.equal(equipCosmetics(state,{baseCard:{hero:74,art:any.id}}).equipment.baseCard.art,any.id);
  assert.equal(equipCosmetics(state,{baseCard:{hero:heroId,art:tagged.id}}).equipment.baseCard.art,tagged.id);
  assert.throws(()=>equipCosmetics(state,{baseCard:{hero:elsewhere,art:tagged.id}}),/is for/);
  assert.throws(()=>equipCosmetics(state,{baseCard:{hero:1,art:other.id}}),/Collect this loading screen/);
  assert.equal(cardArtwork(1,{art:any.id}).id,any.id);
  assert.ok(cardArtOptions(heroId,state.screens).some(o=>o.id===tagged.id));
  assert.ok(!cardArtOptions(elsewhere,state.screens).some(o=>o.id===tagged.id));
  assert.ok(!cardArtOptions(1).some(o=>o.id===any.id));
});
