import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validLayout,backStats,partState,MAX_BACK_STATS} from '../public/lib/card-layout.js';
import {grantLogin,equipCosmetics} from '../public/lib/cosmetics-engine.js';

test('no layout stays null and the card keeps its role defaults',()=>{
  assert.equal(validLayout(null),null);
  assert.deepEqual(backStats(null,2),['games','win','kda','gpm','xpm','dmg','lh']);
  assert.deepEqual(backStats(null,5),['games','win','kda','wards','stacks','heal']);
  assert.deepEqual(partState(null,'name'),{show:true,placed:false,style:''});
});
test('a layout keeps the owner name, sizes, placements and back choices',()=>{
  const l=validLayout({name:"  God's   Silliest Goose ",nameSize:70,front:{record:{show:false},name:{x:50,y:26.25,size:120},tier:{size:100}},back:{stats:['games','dewards'],heroes:false}});
  assert.equal(l.name,"God's Silliest Goose");
  assert.equal(l.nameSize,70);
  assert.deepEqual(l.front.record,{show:false,x:null,y:null,size:100});
  assert.deepEqual(l.front.name,{show:true,x:50,y:26.3,size:120});
  assert.equal(l.front.tier,undefined); // nothing changed, nothing stored
  assert.deepEqual(l.back,{stats:['games','dewards'],positions:true,heroes:false});
  assert.equal(partState(l,'name').style,'left:50%;top:26.3%;--part-size:0.84;');
});
test('layouts reject markup, long names, off-card positions and bad stats',()=>{
  for(const raw of [
    {name:'<b>hi</b>'},{name:'x'.repeat(25)},{name:'a\u0007b'},{nameSize:10},
    {front:{name:{x:120,y:5}}},{front:{name:{x:50}}},{front:{tier:{size:999}}},{front:{tier:{show:'no'}}},
    {back:{stats:['games','games']}},{back:{stats:['nope']}},{back:{stats:Array(MAX_BACK_STATS+1).fill('games')}},{back:{heroes:'yes'}},
    [],'layout',
  ])assert.throws(()=>validLayout(raw),undefined,JSON.stringify(raw));
});
test('the engine (and so the Worker) saves layouts, keeps them across other edits, and drops them on null',()=>{
  const state=grantLogin(null,new Date('2026-10-13'));
  const saved=equipCosmetics(state,{layout:{name:'Coach',back:{stats:['kda']}}});
  assert.equal(saved.equipment.layout.name,'Coach');
  const kept=equipCosmetics(saved,{hue:40});
  assert.equal(kept.equipment.layout.name,'Coach');
  assert.equal(equipCosmetics(saved,{layout:null}).equipment.layout,undefined);
  assert.throws(()=>equipCosmetics(state,{layout:{name:'<script>'}}));
});
test('the Dota Plus badge is off until the owner turns it on',()=>{
  assert.equal(partState(null,'plus').show,false);
  assert.equal(validLayout({front:{plus:{show:false}}}).front.plus,undefined); // the default, nothing stored
  const on=validLayout({front:{plus:{show:true}}});
  assert.deepEqual(on.front.plus,{show:true,x:null,y:null,size:100});
  assert.equal(partState(on,'plus').show,true);
  assert.equal(partState(validLayout({front:{plus:{size:150}}}),'plus').show,false);
});
