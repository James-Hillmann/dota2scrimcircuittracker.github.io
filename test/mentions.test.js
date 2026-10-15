import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mentionDirectory,mentionCompletion,insertMention,encodeMentions,mentionParts,plainMentions,pingTargets,MAX_PINGS} from '../public/lib/mentions.js';
import {cleanComment,MAX_COMMENT} from '../public/lib/feed.js';
import {CosmeticsVault} from '../workers/steam-auth/src/cosmetics.js';

const teams=[
  {id:15026,name:'No Immortals',league:'ad2l',division:'Champion',players:[{name:'Brown',account_id:101},{name:'frost',account_id:202}]},
  {id:900,name:'Brown Bears',league:'heroic',division:'Heroic A',players:[{name:'Brown',account_id:101},{name:'Kodiak',account_id:303}]},
];

test('the directory lists each team and each roster player once',()=>{
  const dir=mentionDirectory(teams);
  assert.deepEqual(dir.map(e=>`${e.kind}:${e.name}`),['t:No Immortals','p:Brown','p:frost','t:Brown Bears','p:Kodiak']);
  assert.deepEqual(dir[0].members,['101','202']);
});
test('@ completes by name start, then word start; a finished name closes it',()=>{
  const dir=mentionDirectory(teams);
  const c=mentionCompletion('gg @bro',7,dir);
  assert.deepEqual(c.matches.map(e=>e.name),['Brown','Brown Bears']);
  assert.equal(c.start,3);
  assert.deepEqual(mentionCompletion('hi @imm',7,dir).matches.map(e=>e.name),['No Immortals']);
  assert.deepEqual(mentionCompletion('@No Imm',7,dir).matches.map(e=>e.name),['No Immortals']);
  assert.equal(mentionCompletion('mail@bro',8,dir),null);
  assert.equal(mentionCompletion('@Brown ',7,dir),null);
  const ins=insertMention('gg @bro',c,c.matches[1]);
  assert.deepEqual(ins,{value:'gg @Brown Bears ',caret:16});
});
test('picked names become tokens; teams ping their roster; tokens read back',()=>{
  const dir=mentionDirectory(teams),brown=dir.find(e=>e.kind==='p'&&e.name==='Brown'),bears=dir.find(e=>e.name==='Brown Bears');
  const {text,pings}=encodeMentions('@Brown Bears and @Brown, not @Browns',[brown,bears]);
  assert.equal(text,'@[Brown Bears](t:heroic:900) and @[Brown](p:101), not @Browns');
  assert.deepEqual(pings,['101','303']);
  assert.deepEqual(mentionParts(text),[{kind:'t',name:'Brown Bears',league:'heroic',id:'900'},' and ',{kind:'p',name:'Brown',account:'101'},', not @Browns']);
  assert.equal(plainMentions(text),'@Brown Bears and @Brown, not @Browns');
  assert.deepEqual(encodeMentions('no names here',[brown]),{text:'no names here',pings:[]});
});
test('the Worker pings named players, and sent accounts only when a team is named',()=>{
  assert.deepEqual(pingTargets('@[Brown](p:101) hi',['999'],'202'),['101']);
  assert.deepEqual(pingTargets('@[Bears](t:heroic:900)',['101','303','x'],'101'),['303']);
  assert.deepEqual(pingTargets('plain',['101'],'202'),[]);
  assert.equal(pingTargets('@[T](t:a:1)',Array.from({length:40},(_,i)=>String(i+1)),'0').length,MAX_PINGS);
});
test('comment length counts names, not tokens',()=>{
  const name='x'.repeat(30),tok=`@[${name}](p:1234567890)`;
  const text=`${tok} ${'y'.repeat(MAX_COMMENT-name.length-2)}`;
  assert.equal(cleanComment(text),text);
});
test('vault: mentions in posts and comments leave notices',async()=>{
  const rows=new Map(),storage={get:async k=>structuredClone(rows.get(k)),put:async(k,v)=>rows.set(k,structuredClone(v)),delete:async k=>rows.delete(k),list:async({prefix})=>new Map([...rows].filter(([k])=>k.startsWith(prefix)))};storage.transaction=fn=>fn(storage);
  const vault=new CosmeticsVault({storage});
  let n=0;const act=(account,body)=>vault.fetch(new Request(`https://vault/action?account=${account}`,{method:'POST',body:JSON.stringify({requestId:`ping-test-request-${String(++n).padStart(4,'0')}`,...body})})).then(async r=>({status:r.status,...await r.json()}));
  for(const a of ['101','202','303'])await act(a,{action:'session'});
  const made=await act('101',{action:'post',text:'gg @[Brown Bears](t:heroic:900)',mentions:['101','303']});
  assert.equal(made.status,200);
  assert.deepEqual(rows.get('user:303').notices.map(x=>[x.kind,x.from,x.text]),[['mention','101','gg @Brown Bears']]);
  assert.equal(rows.get('user:101').notices,undefined);
  // The owner is told once (as the post's owner), the named player as a mention.
  await act('202',{action:'comment',post:made.post.id,text:'@[Brown](p:101) @[Kodiak](p:303) wp'});
  assert.deepEqual(rows.get('user:101').notices.map(x=>x.kind),['comment']);
  assert.deepEqual(rows.get('user:303').notices.map(x=>x.kind),['mention','mention']);
});
