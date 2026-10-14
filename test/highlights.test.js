import {test} from 'node:test';
import assert from 'node:assert/strict';
import {gameAchievements,highlightableGames} from '../public/lib/highlights.js';

const line=(account,o={})=>({account_id:account,team:'a',hero:'Axe',kills:5,deaths:5,assists:5,gpm:400,hero_damage:10000,last_hits:100,...o});
const game=(id,players,start=id)=>({id:String(id),start_time:start,winner:'a',players});
test('a highlighted game earns multi-kill, league-best and career-high badges',()=>{
  const filler=Array.from({length:12},(_,i)=>line(900+i));
  const games=[1,2,3,4].map(i=>game(i,[line(7,{kills:i}),...filler]));
  const big=game(5,[line(7,{kills:20,deaths:0,assists:10,multi:[2,1,0,1],gpm:300}),...filler]);
  const all=[...games,big];
  const ids=gameAchievements(all,big,7).map(a=>a.id);
  assert.equal(ids[0].startsWith('league-'),true);
  assert.ok(ids.includes('rampage'));assert.ok(ids.includes('league-kills'));assert.ok(ids.includes('deathless'));
  assert.ok(!ids.includes('league-gpm')&&!ids.includes('own-gpm'));
  assert.deepEqual(gameAchievements(all,big,12345),[]);
  assert.deepEqual(highlightableGames(all,7).map(g=>g.id),['5','4','3','2','1']);
});
