import test from 'node:test';
import assert from 'node:assert/strict';
import { AUTOGRAPHS, autographText, writingOf, PEN_MARKS } from '../public/_dev/autographs.js';
import { openPreviewPack, scrapDuplicates, loadPackState, AUTOGRAPH_ODDS } from '../public/_dev/cosmetics-packs.js';

const pool=AUTOGRAPHS.filter(x=>x.rarity!=='free').map(x=>({...x,key:`autograph:${x.id}`}));
test('autograph packs contain two allowed styles and keep the original state intact',()=>{
 const state={packs:3,inventory:{}};
 const result=openPreviewPack(state,pool,AUTOGRAPH_ODDS,()=>0);
 assert.equal(result.rewards.length,2);
 assert.ok(result.rewards.every(x=>['rare','epic','legendary'].includes(x.rarity)));
 assert.equal(result.state.packs,2);
 assert.equal(result.state.inventory['autograph:silver-ink'],2);
 assert.deepEqual(result.rewards.map(x=>x.duplicate),[false,true]);
 assert.deepEqual(state,{packs:3,inventory:{}});
});
test('three duplicate copies create exactly one pack and preserve the last copies',()=>{
 const state={packs:0,inventory:{a:3,b:2}};
 assert.deepEqual(scrapDuplicates(state,{a:2,b:1}),{packs:1,inventory:{a:1,b:1}});
 assert.deepEqual(state,{packs:0,inventory:{a:3,b:2}});
 assert.throws(()=>scrapDuplicates(state,{a:3}),/last copy/);
 assert.throws(()=>scrapDuplicates(state,{a:1}),/exactly three/);
 assert.throws(()=>scrapDuplicates(state,{a:2,b:-1,c:2}),/exactly three/);
});
test('empty packs and empty eligible pools cannot grant items',()=>{
 assert.throws(()=>openPreviewPack({packs:0,inventory:{}},pool,AUTOGRAPH_ODDS),/test pack/);
 const state={packs:1,inventory:{}};
 assert.throws(()=>openPreviewPack(state,[],AUTOGRAPH_ODDS),/eligible design/);
 assert.deepEqual(state,{packs:1,inventory:{}});
});
test('removed tiers redistribute rolls to eligible styles only',()=>{
 const result=openPreviewPack({packs:1,inventory:{}},pool.filter(x=>x.rarity==='legendary'),AUTOGRAPH_ODDS,()=>.99);
 assert.ok(result.rewards.every(x=>x.rarity==='legendary'));
});
test('saved inventory rejects unknown styles and invalid quantities',()=>{
 assert.deepEqual(loadPackState({packs:-2,inventory:{a:2,b:-1,unknown:99,c:1.5}},['a','b','c']),{packs:3,inventory:{a:2}});
 assert.deepEqual(loadPackState({packs:0,inventory:{a:1}},['a']),{packs:0,inventory:{a:1}});
});
test('custom signature text stays separate from the player name and supports multiple scripts',()=>{
 const kana=AUTOGRAPHS.find(x=>x.id==='kana-brush');
 assert.equal(autographText(kana,'Scionara'),'さよなら');
 assert.equal(autographText(kana,'Scionara','  シオナラ  '),'シオナラ');
 assert.equal(autographText(AUTOGRAPHS[1],'Scionara'),'Scionara');
 assert.equal(writingOf('さよなら'),'ja');
 assert.equal(writingOf('シオナラ'),'ja');
 assert.equal(writingOf('별빛'),'ko');
 assert.equal(writingOf('星光'),'zh');
 assert.equal(writingOf('Scionara'),'latin');
 assert.equal(autographText(kana,'Scionara','か\u3099'),'が');
});
test('every autograph has a renderable flourish and a permitted drop tier',()=>{
 for(const style of AUTOGRAPHS.filter(x=>x.rarity!=='free')){
  assert.ok(['rare','epic','legendary'].includes(style.rarity));
  assert.ok(PEN_MARKS[style.flourish??'simple']?.length);
 }
});
