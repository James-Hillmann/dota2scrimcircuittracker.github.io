import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_EQUIPMENT} from '../public/lib/cosmetics-catalog.js';
import {existsSync} from 'node:fs';
import {isPostId,postOwner,toggleReaction,reactionTally,topReaction,cleanComment,addComment,deleteComment,pushNotice,unreadNotices,markNoticesSeen,cardPostId,REACTIONS,REACTION_ART,MAX_COMMENT,MAX_NOTICES,REPOST_WINDOW} from '../public/lib/feed.js';
import {DOTA_EMOTICONS,emoticonParts,emoticonCompletion,insertEmoticon} from '../public/lib/dota-emoticons.js';
import {CosmeticsVault} from '../workers/steam-auth/src/cosmetics.js';

test('post ids name their owner; anything else is refused',()=>{
  assert.equal(postOwner('c:101:2:1700000000000'),'101');
  assert.equal(postOwner('p:001700000000000:202:a-unique-request-12345'),'202');
  for(const bad of ['c:101:3:1','x:1:1:1','p:1:202:short','c:101:0:1:extra',null])assert.equal(isPostId(bad),false);
  assert.throws(()=>postOwner('nope'),/Choose a post/);
});
test('reactions toggle per player and emoji; tally lists who picked each',()=>{
  let r=toggleReaction(null,'1','🔥');r=toggleReaction(r,'2','🔥');r=toggleReaction(r,'2','❤️');
  assert.deepEqual(reactionTally(r),{'❤️':['2'],'🔥':['1','2']});
  r=toggleReaction(r,'1','🔥');assert.equal('1' in r,false);
  assert.throws(()=>toggleReaction(r,'1','🍕'),/reactions/);
});
test('every reaction has a bundled Dota chat emoticon',()=>{
  assert.equal(DOTA_EMOTICONS.length,287);
  assert.equal(new Set(DOTA_EMOTICONS).size,287);
  assert.equal(REACTIONS.length,287);
  assert.equal(new Set(REACTIONS).size,287);
  assert.deepEqual(Object.keys(REACTION_ART),REACTIONS);
  for(const art of Object.values(REACTION_ART))assert.ok(existsSync(new URL(`../public/${art.src}`,import.meta.url)),art.src);
});
test('Dota chat codes complete and only known codes render as emoticons',()=>{
  assert.deepEqual(emoticonParts('gg :AXE_LAUGH: :not_real:'),['gg ',{name:'axe_laugh'},' :not_real:']);
  const completion=emoticonCompletion('nice :axe_l');
  assert.equal(completion.matches[0],'axe_laugh');
  assert.deepEqual(insertEmoticon('nice :axe_l',completion,'axe_laugh'),{value:'nice :axe_laugh: ',caret:17});
  assert.equal(emoticonCompletion('nice :not_real'),null);
});
test('only the most-used reaction is featured; heart wins a tie and is the default action',()=>{
  assert.equal(REACTIONS[0],'❤️');
  assert.equal(topReaction({}),null);
  assert.deepEqual(topReaction({'🔥':['1','2'],'❤️':['3','4']}),{emoji:'❤️',count:2});
  assert.deepEqual(topReaction({'🔥':['1','2','3'],'❤️':['4']}),{emoji:'🔥',count:3});
});
test('comments: one tidy line, length capped; writer, owner or Fav may remove',()=>{
  assert.equal(cleanComment('  nice\n\n card  '),'nice card');
  assert.throws(()=>cleanComment('   '),/Write a comment/);
  assert.throws(()=>cleanComment('x'.repeat(MAX_COMMENT+1)),/characters/);
  const {comments,comment}=addComment([],{account:'2',text:'gg',at:1000});
  assert.deepEqual(comments,[comment]);
  assert.throws(()=>deleteComment(comments,comment.id,'3',{owner:'1'}),/Only the writer/);
  assert.deepEqual(deleteComment(comments,comment.id,'2',{owner:'1'}),[]);
  assert.deepEqual(deleteComment(comments,comment.id,'1',{owner:'1'}),[]);
  assert.deepEqual(deleteComment(comments,comment.id,'3',{owner:'1',admin:true}),[]);
});
test('notices keep the newest and count unread until seen',()=>{
  let s={};for(let i=1;i<=MAX_NOTICES+5;i++)s=pushNotice(s,{at:i});
  assert.equal(s.notices.length,MAX_NOTICES);assert.equal(s.notices[0].at,6);
  assert.equal(unreadNotices(s).length,MAX_NOTICES);
  assert.equal(unreadNotices(markNoticesSeen(s,30)).length,MAX_NOTICES-25);
});
test('a quick re-save updates its untouched post; otherwise a new post',()=>{
  const last={id:'c:1:0:100',at:100,touched:false};
  assert.equal(cardPostId('1',0,200,last),'c:1:0:100');
  assert.equal(cardPostId('1',0,200,{...last,touched:true}),'c:1:0:200');
  assert.equal(cardPostId('1',0,100+REPOST_WINDOW,last),`c:1:0:${100+REPOST_WINDOW}`);
  assert.equal(cardPostId('1',0,200,null),'c:1:0:200');
});
test('vault: saved cards post to the feed; reactions, comments, notices and removal',async()=>{
  const rows=new Map(),storage={get:async k=>structuredClone(rows.get(k)),put:async(k,v)=>rows.set(k,structuredClone(v)),list:async({prefix})=>new Map([...rows].filter(([k])=>k.startsWith(prefix)))};storage.transaction=fn=>fn(storage);
  const vault=new CosmeticsVault({storage});
  let n=0;const act=(account,body)=>vault.fetch(new Request(`https://vault/action?account=${account}`,{method:'POST',body:JSON.stringify({requestId:`feed-test-request-${String(++n).padStart(4,'0')}`,...body})})).then(async r=>({status:r.status,...await r.json()}));
  const retry=(account,requestId,body)=>vault.fetch(new Request(`https://vault/action?account=${account}`,{method:'POST',body:JSON.stringify({requestId,...body})})).then(async r=>({status:r.status,...await r.json()}));
  const feed=async(q='')=>(await vault.fetch(new Request(`https://vault/feed${q}`))).json();
  await act('101',{action:'session'});await act('202',{action:'session'});
  // A plain card never posts; a changed one does, and a quick re-save reuses that post.
  await act('101',{action:'equip',equipment:DEFAULT_EQUIPMENT});
  assert.equal((await feed()).posts.length,0);
  await act('101',{action:'equip',equipment:{...DEFAULT_EQUIPMENT,hue:40}});
  await act('101',{action:'equip',equipment:{...DEFAULT_EQUIPMENT,hue:80}});
  let posts=(await feed()).posts;assert.equal(posts.length,1);assert.equal(posts[0].design.hue,80);
  const post=posts[0].id;assert.equal(postOwner(post),'101');
  // Reactions and comments; the owner hears about the comment, not about their own.
  const reactId='feed-retry-react-0001';
  assert.deepEqual((await retry('202',reactId,{action:'react',post,emoji:'🔥'})).reactions,{'🔥':['202']});
  assert.deepEqual((await retry('202',reactId,{action:'react',post,emoji:'🔥'})).reactions,{'🔥':['202']});
  const commentId='feed-retry-comment-01',c=await retry('202',commentId,{action:'comment',post,text:'clean card'});assert.equal(c.status,200);assert.equal(c.comments[0].text,'clean card');
  assert.equal((await retry('202',commentId,{action:'comment',post,text:'clean card'})).comments[0].text,'clean card');
  assert.match((await act('202',{action:'comment',post,text:'again'})).error,/Wait a moment/);
  await act('101',{action:'comment',post,text:'thanks'});
  const owner=rows.get('user:101');assert.equal(owner.notices.length,1);assert.equal(owner.notices[0].from,'202');assert.equal(owner.notices[0].post,post);
  assert.equal(unreadNotices((await act('101',{action:'notices-seen'})).state).length,0);
  // A post with reactions or comments stays; the next save is a new post.
  await act('101',{action:'equip',equipment:{...DEFAULT_EQUIPMENT,hue:120}});
  posts=(await feed()).posts;assert.equal(posts.length,2);
  const one=(await feed(`?post=${post}`)).posts[0];assert.equal(one.comments.length,2);assert.deepEqual(one.reactions,{'🔥':['202']});
  // Removal: not someone else's comment on another's post; the owner may.
  const theirs=one.comments.find(x=>x.account==='202').id;
  await act('303',{action:'session'});
  assert.match((await act('303',{action:'comment-delete',post,comment:theirs})).error,/Only the writer/);
  assert.equal((await act('101',{action:'comment-delete',post,comment:theirs})).comments.length,1);
  assert.match((await act('202',{action:'react',post:'c:999:0:5',emoji:'🔥'})).error,/gone/);
});
