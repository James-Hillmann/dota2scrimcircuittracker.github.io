import {test} from 'node:test';
import assert from 'node:assert/strict';
import {playerCardPool,rollPlayerPack,addPlayerCards} from '../public/lib/player-packs.js';

const tiers=new Map([['1',{tier:'S'}],['2',{tier:'A'}],['3',{tier:'B'}],['4',{tier:'D'}],['5',{tier:null}]]);
test('pool rarity follows tier, untiered players are left out',()=>{
  assert.deepEqual(playerCardPool(tiers).map(c=>c.rarity),['legendary','epic','rare','common']);
});
test('three pulls, odds by rarity, missing rarities skipped',()=>{
  const pool=playerCardPool(tiers);
  assert.deepEqual(rollPlayerPack(pool,()=>0).map(p=>p.account),['4','4','4']); // common first
  assert.deepEqual(rollPlayerPack(pool,()=>0.999).map(p=>p.account),['1','1','1']); // legendary last
  assert.deepEqual(rollPlayerPack([{account:'9',rarity:'epic'}],()=>0).map(p=>p.key),['player:9','player:9','player:9']);
  assert.throws(()=>rollPlayerPack([]));
});
test('pulls count in the inventory and flag duplicates',()=>{
  const {state,rewards}=addPlayerCards({inventory:{'player:1':1}},[{key:'player:1',account:'1',rarity:'legendary'},{key:'player:2',account:'2',rarity:'epic'},{key:'player:2',account:'2',rarity:'epic'}]);
  assert.deepEqual(state.inventory,{'player:1':2,'player:2':2});
  assert.deepEqual(rewards.map(r=>r.duplicate),[true,false,true]);
});
