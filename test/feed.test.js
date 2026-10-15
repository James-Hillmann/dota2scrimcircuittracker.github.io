import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_EQUIPMENT} from '../public/lib/cosmetics-catalog.js';
import {existsSync} from 'node:fs';
import {isPostId,postOwner,toggleReaction,reactionTally,topReaction,rankedReactions,cleanComment,addComment,deleteComment,reactToComment,commentThreads,pushNotice,unreadNotices,markNoticesSeen,cardPostId,REACTIONS,REACTION_ART,MAX_COMMENT,MAX_NOTICES,REPOST_WINDOW} from '../public/lib/feed.js';
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
  // The row under a post shows every reaction, most-used first, ties in picker order.
  assert.deepEqual(rankedReactions({}),[]);
  assert.deepEqual(rankedReactions({'😂':['1'],'🔥':['2'],'❤️':['3','4'],'💀':[]}),['❤️','🔥','😂']);
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

test('player posts: text tidied, clips parsed, images checked by their bytes',async()=>{
  const {cleanPostText,parseClip,clipEmbed,imageType,buildUserPost,canRemovePost,userPostId,MAX_POST_TEXT,MAX_IMAGE_BYTES}=await import('../public/lib/feed.js');
  assert.equal(cleanPostText('  gg  wp \n\n\n\n next  '),'gg wp\n\nnext');
  assert.throws(()=>cleanPostText('x'.repeat(MAX_POST_TEXT+1)),/characters/);
  assert.deepEqual(parseClip('https://youtu.be/dQw4w9WgXcQ'),{site:'youtube',id:'dQw4w9WgXcQ'});
  assert.deepEqual(parseClip('youtube.com/watch?v=dQw4w9WgXcQ&t=10'),{site:'youtube',id:'dQw4w9WgXcQ'});
  assert.deepEqual(parseClip('https://www.youtube.com/shorts/dQw4w9WgXcQ'),{site:'youtube',id:'dQw4w9WgXcQ'});
  assert.deepEqual(parseClip('https://www.twitch.tv/someone/clip/Funny-Clip_Name-abc'),{site:'twitch',id:'Funny-Clip_Name-abc'});
  assert.deepEqual(parseClip('https://streamable.com/abc12'),{site:'streamable',id:'abc12'});
  assert.equal(parseClip('https://medal.tv/games/dota-2/clips/xyz').site,'medal');
  assert.equal(parseClip(''),null);
  assert.throws(()=>parseClip('https://evil.example/x'),/Clips can be/);
  assert.match(clipEmbed({site:'twitch',id:'abc1'},'localhost'),/parent=localhost/);
  assert.equal(clipEmbed({site:'medal',url:'https://medal.tv/x'}),null);
  const png=Uint8Array.from([0x89,0x50,0x4e,0x47,0,0,0,0]),svg=new TextEncoder().encode('<svg onload=alert(1)>');
  assert.equal(imageType(png),'image/png');assert.equal(imageType(svg),null);
  const post=buildUserPost({account:'1',at:5,text:'look',clip:'',game:'9035868107',images:[png]});
  assert.deepEqual(post,{kind:'user',account:'1',at:5,text:'look',game:'9035868107',images:[{type:'image/png',size:8}]});
  assert.throws(()=>buildUserPost({account:'1',at:5,text:'  '}),/Write something/);
  assert.throws(()=>buildUserPost({account:'1',at:5,images:[svg]}),/JPEG, PNG/);
  assert.throws(()=>buildUserPost({account:'1',at:5,images:[Uint8Array.from({length:MAX_IMAGE_BYTES+1},(_,i)=>[0xff,0xd8,0xff][i]??0)]}),/under/);
  assert.throws(()=>buildUserPost({account:'1',at:5,game:'../x'}),/your games/);
  const id=userPostId('1',5);assert.equal(postOwner(id),'1');
  assert.equal(canRemovePost(id,'1'),true);assert.equal(canRemovePost(id,'2'),false);assert.equal(canRemovePost(id,'2',true),true);
  // Owners remove their saved-card and pull posts too, not other players'.
  assert.equal(canRemovePost('c:1:0:5','1'),true);assert.equal(canRemovePost('c:1:0:5','2'),false);
  assert.equal(canRemovePost('p:001700000000000:1:a-unique-request-12345','1'),true);
});
test('vault: player posts with images; owner removes them and their images',async()=>{
  const rows=new Map(),storage={get:async k=>structuredClone(rows.get(k)),put:async(k,v)=>rows.set(k,structuredClone(v)),delete:async k=>rows.delete(k),list:async({prefix})=>new Map([...rows].filter(([k])=>k.startsWith(prefix)))};storage.transaction=fn=>fn(storage);
  const vault=new CosmeticsVault({storage});
  let n=0;const act=(account,body)=>vault.fetch(new Request(`https://vault/action?account=${account}`,{method:'POST',body:JSON.stringify({requestId:`post-test-request-${String(++n).padStart(4,'0')}`,...body})})).then(async r=>({status:r.status,...await r.json()}));
  await act('101',{action:'session'});await act('202',{action:'session'});
  const jpeg=Buffer.from([0xff,0xd8,0xff,0xe0,1,2,3]).toString('base64');
  const made=await act('101',{action:'post',text:'first blood',clip:'https://youtu.be/dQw4w9WgXcQ',images:[jpeg]});
  assert.equal(made.status,200);const id=made.post.id;assert.match(id,/^u:101:\d+$/);
  assert.match((await act('101',{action:'post',text:'again'})).error,/Wait a moment/);
  assert.match((await act('202',{action:'post',images:[Buffer.from('<svg>').toString('base64')]})).error,/JPEG, PNG/);
  const feed=await (await vault.fetch(new Request('https://vault/feed'))).json();
  assert.equal(feed.posts[0].id,id);assert.equal(feed.posts[0].kind,'user');assert.equal(feed.posts[0].clip.id,'dQw4w9WgXcQ');
  const img=await vault.fetch(new Request(`https://vault/media?post=${encodeURIComponent(id)}&n=0`));
  assert.equal(img.headers.get('content-type'),'image/jpeg');assert.equal((await img.arrayBuffer()).byteLength,7);
  // Comments on a player post notify its poster.
  await act('202',{action:'comment',post:id,text:'nice'});assert.equal(rows.get('user:101').notices.at(-1).post,id);
  assert.match((await act('202',{action:'post-delete',post:id})).error,/Only the poster/);
  assert.equal((await act('101',{action:'post-delete',post:id})).removed,id);
  assert.equal([...rows.keys()].some(k=>k.includes(id)),false);
  assert.equal((await vault.fetch(new Request(`https://vault/media?post=${encodeURIComponent(id)}&n=0`))).status,404);
});
test('follow: everyone to start; unfollow hides a player until followed again',async()=>{
  const {setFollow,isFollowing}=await import('../public/lib/feed.js');
  let s={};assert.equal(isFollowing(s,'5'),true);
  s=setFollow(s,'1','5',false);assert.equal(isFollowing(s,'5'),false);assert.deepEqual(s.unfollowed,['5']);
  s=setFollow(s,'1','5',false);assert.deepEqual(s.unfollowed,['5']);
  s=setFollow(s,'1','5',true);assert.equal(isFollowing(s,5),true);
  assert.throws(()=>setFollow(s,'1','1',false),/yourself/);
  assert.throws(()=>setFollow(s,'1','x',false),/Choose a player/);
});
test('moderation: the word filter catches disguised slurs, not ordinary words',async()=>{
  const {blockedTerm}=await import('../public/lib/moderation.js');
  const {cleanPostText}=await import('../public/lib/feed.js');
  for(const ok of ['gg wp nice rampage','spicy cucumber analysis','Puck assassin classic','rapier on pa','cumulative networth','Pangolier','scumbag','fuck this game','Nigeria'])assert.equal(blockedTerm(ok),null,ok);
  for(const bad of ['you are r3t4rd','k y s','n1gg4','f.a.g.g.o.t','niiiiigga'])assert.ok(blockedTerm(bad),bad);
  assert.throws(()=>cleanComment('kys noob'),/doesn't allow/);
  assert.throws(()=>cleanPostText('r e t a r d'),/doesn't allow/);
});
test('vault: Fav bans, unbans and removes any post; banned players cannot post or comment',async()=>{
  const {ADMIN_ACCOUNT}=await import('../public/lib/pack-gifts.js');
  const rows=new Map(),storage={get:async k=>structuredClone(rows.get(k)),put:async(k,v)=>rows.set(k,structuredClone(v)),delete:async k=>rows.delete(k),list:async({prefix})=>new Map([...rows].filter(([k])=>k.startsWith(prefix)))};storage.transaction=fn=>fn(storage);
  const vault=new CosmeticsVault({storage});
  let n=0;const act=(account,body)=>vault.fetch(new Request(`https://vault/action?account=${account}`,{method:'POST',body:JSON.stringify({requestId:`ban-test-request-${String(++n).padStart(5,'0')}`,...body})})).then(async r=>({status:r.status,...await r.json()}));
  for(const a of ['101','202',ADMIN_ACCOUNT])await act(a,{action:'session'});
  await act('101',{action:'equip',equipment:{...DEFAULT_EQUIPMENT,hue:40}});
  const card=[...rows.keys()].find(k=>k.startsWith('post:c:')).slice(5);
  const mine=(await act('202',{action:'post',text:'hello'})).post.id;
  assert.match((await act('101',{action:'ban',target:'202'})).error,/Only Fav/);
  assert.equal((await act(ADMIN_ACCOUNT,{action:'ban',target:'202',days:3})).status,200);
  assert.match((await act('202',{action:'post',text:'again'})).error,/banned/);
  assert.match((await act('202',{action:'comment',post:card,text:'hi'})).error,/banned/);
  const list=await act(ADMIN_ACCOUNT,{action:'feed-bans'});assert.deepEqual(Object.keys(list.bans),['202']);
  assert.match((await act('202',{action:'feed-bans'})).error,/Only Fav/);
  await act(ADMIN_ACCOUNT,{action:'ban',target:'202',banned:false});
  assert.equal((await act('202',{action:'comment',post:card,text:'hi'})).status,200);
  assert.match((await act('202',{action:'post-delete',post:card})).error,/Only the poster/);
  assert.equal((await act(ADMIN_ACCOUNT,{action:'post-delete',post:card})).removed,card);
  assert.equal((await act(ADMIN_ACCOUNT,{action:'post-delete',post:mine})).removed,mine);
  assert.equal([...rows.keys()].some(k=>k.includes(card)||k.includes(mine)),false);
});
test('vault: a ban can cover posting, commenting and reacting separately',async()=>{
  const {ADMIN_ACCOUNT}=await import('../public/lib/pack-gifts.js');
  const {setBan,isBanned}=await import('../public/lib/feed.js');
  assert.equal(isBanned({5:{at:0,until:null}},5,1,'react'),true); // rows from before scopes ban everything
  assert.throws(()=>setBan({},5,true,{at:0,scope:[]}),/Choose what/);
  const rows=new Map(),storage={get:async k=>structuredClone(rows.get(k)),put:async(k,v)=>rows.set(k,structuredClone(v)),delete:async k=>rows.delete(k),list:async({prefix})=>new Map([...rows].filter(([k])=>k.startsWith(prefix)))};storage.transaction=fn=>fn(storage);
  const vault=new CosmeticsVault({storage});
  let n=0;const act=(account,body)=>vault.fetch(new Request(`https://vault/action?account=${account}`,{method:'POST',body:JSON.stringify({requestId:`scope-test-request-${String(++n).padStart(5,'0')}`,...body})})).then(async r=>({status:r.status,...await r.json()}));
  for(const a of ['101','202',ADMIN_ACCOUNT])await act(a,{action:'session'});
  const post=(await act('101',{action:'post',text:'hello'})).post.id;
  assert.equal((await act(ADMIN_ACCOUNT,{action:'ban',target:'202',scope:['comment']})).status,200);
  assert.match((await act('202',{action:'comment',post,text:'hi'})).error,/commenting/);
  assert.equal((await act('202',{action:'react',post,emoji:'❤️'})).status,200);
  assert.equal((await act('202',{action:'post',text:'mine'})).status,200);
  await act(ADMIN_ACCOUNT,{action:'ban',target:'202',scope:['post','react']});
  assert.match((await act('202',{action:'react',post,emoji:'❤️'})).error,/reacting/);
  assert.equal((await act('202',{action:'comment',post,text:'hi'})).status,200);
  assert.deepEqual((await act(ADMIN_ACCOUNT,{action:'feed-bans'})).bans['202'].scope,['post','react']);
});
test('image filter: refuses what the model flags, and fails closed',async()=>{
  const {checkImages,readVerdict}=await import('../workers/steam-auth/src/image-check.js');
  assert.equal(readVerdict(' SAFE.'),'safe');assert.equal(readVerdict('Unsafe'),'unsafe');assert.equal(readVerdict('maybe'),null);
  const jpeg=Buffer.from([0xff,0xd8,0xff,0xe0,1,2,3,4,5,6,7,8,9,10,11,12,13,14]).toString('base64');
  const ai=reply=>({run:async(model,input)=>{assert.match(input.messages[0].content[1].image_url.url,/^data:image\/jpeg;base64,/);return {response:reply};}});
  await checkImages(ai('SAFE'),[jpeg]);
  await assert.rejects(checkImages(ai('UNSAFE'),[jpeg]),/isn't allowed/);
  await assert.rejects(checkImages(ai('hmm'),[jpeg]),/couldn't be checked/);
  await assert.rejects(checkImages({run:async()=>{throw new Error('down');}},[jpeg]),/couldn't be checked/);
  await assert.rejects(checkImages(null,[jpeg]),/unavailable/);
  await checkImages(null,[]);
});
test('threads: one level of replies; a removed comment with replies stays as a placeholder',()=>{
  let {comments,comment:top}=addComment([],{account:'1',text:'nice',at:1000});
  let r1;({comments,comment:r1}=addComment(comments,{account:'2',text:'agreed',at:2000,reply:top.id}));
  assert.equal(r1.reply,top.id);
  // Replying to a reply joins the same thread and names the reply as the parent.
  const deep=addComment(comments,{account:'3',text:'same',at:3000,reply:r1.id});
  assert.equal(deep.comment.reply,top.id);assert.equal(deep.parent.id,r1.id);comments=deep.comments;
  assert.throws(()=>addComment(comments,{account:'3',text:'hi',at:4000,reply:'nope'}),/gone/);
  const threads=commentThreads(comments);
  assert.equal(threads.length,1);assert.deepEqual(threads[0].replies.map(r=>r.account),['2','3']);
  // Old comments without reply load as top-level threads.
  assert.deepEqual(commentThreads([{id:'a',account:'1',text:'x',at:1}]).map(t=>t.replies),[[]]);
  // Removing the top comment keeps a placeholder; no replying or reacting to it.
  let next=deleteComment(comments,top.id,'1',{owner:'9'});
  assert.deepEqual(next[0],{id:top.id,account:'1',at:1000,removed:true});
  assert.throws(()=>addComment(next,{account:'4',text:'hm',at:5000,reply:top.id}),/gone/);
  assert.throws(()=>reactToComment(next,top.id,'4','🔥'),/gone/);
  assert.throws(()=>deleteComment(next,top.id,'1',{owner:'9'}),/gone/);
  // The placeholder goes with the last reply.
  next=deleteComment(next,r1.id,'2',{owner:'9'});assert.equal(next.length,2);
  next=deleteComment(next,deep.comment.id,'3',{owner:'9'});assert.deepEqual(next,[]);
  // A reply whose comment fell off the list shows on its own.
  assert.equal(commentThreads([r1]).length,1);
});
test('comment reactions toggle per player like post reactions',()=>{
  const {comments,comment}=addComment([],{account:'1',text:'gg',at:1000});
  let next=reactToComment(comments,comment.id,'2','🔥');next=reactToComment(next,comment.id,'3','🔥');
  assert.deepEqual(reactionTally(next[0].reactions),{'🔥':['2','3']});
  next=reactToComment(next,comment.id,'2','🔥');assert.deepEqual(next[0].reactions,{'3':['🔥']});
  assert.throws(()=>reactToComment(next,comment.id,'2','🍕'),/reactions/);
  assert.throws(()=>reactToComment(next,'nope','2','🔥'),/gone/);
});
test('vault: replies notify the comment writer; comment reactions are stored and retried safely',async()=>{
  const rows=new Map(),storage={get:async k=>structuredClone(rows.get(k)),put:async(k,v)=>rows.set(k,structuredClone(v)),delete:async k=>rows.delete(k),list:async({prefix})=>new Map([...rows].filter(([k])=>k.startsWith(prefix)))};storage.transaction=fn=>fn(storage);
  const vault=new CosmeticsVault({storage});
  let n=0;const send=(account,requestId,body)=>vault.fetch(new Request(`https://vault/action?account=${account}`,{method:'POST',body:JSON.stringify({requestId,...body})})).then(async r=>({status:r.status,...await r.json()}));
  const act=(account,body)=>send(account,`thread-test-request-${String(++n).padStart(4,'0')}`,body);
  for(const a of ['101','202','303'])await act(a,{action:'session'});
  await act('101',{action:'equip',equipment:{...DEFAULT_EQUIPMENT,hue:40}});
  const post=(await (await vault.fetch(new Request('https://vault/feed'))).json()).posts[0].id;
  const top=(await act('202',{action:'comment',post,text:'clean'})).comments[0];
  const reply=await act('303',{action:'comment',post,text:'agreed',reply:top.id});
  assert.equal(reply.status,200);assert.equal(reply.comments[1].reply,top.id);
  // The comment's writer hears about the reply; the post's owner about the new comment.
  assert.deepEqual(rows.get('user:202').notices.map(x=>x.kind),['reply']);
  assert.deepEqual(rows.get('user:101').notices.map(x=>x.kind),['comment','comment']);
  assert.match((await act('101',{action:'comment',post,text:'hm',reply:'nope'})).error,/gone/);
  const id='thread-test-react-0001';
  assert.deepEqual((await send('101',id,{action:'comment-react',post,comment:top.id,emoji:'😂'})).comments[0].reactions,{'101':['😂']});
  assert.deepEqual((await send('101',id,{action:'comment-react',post,comment:top.id,emoji:'😂'})).comments[0].reactions,{'101':['😂']});
  assert.match((await act('101',{action:'comment-react',post,comment:top.id,emoji:'🍕'})).error,/reactions/);
  // Removing the replied-to comment leaves a placeholder; the Feed still serves the thread.
  await act('202',{action:'comment-delete',post,comment:top.id});
  const one=(await (await vault.fetch(new Request(`https://vault/feed?post=${post}`))).json()).posts[0];
  assert.equal(one.comments[0].removed,true);assert.equal(one.comments[0].text,undefined);assert.equal(one.comments[1].text,'agreed');
});

test('feed sorts: score counts reactors and comments; trending fades with age',async()=>{
  const {postScore,sortFeed,trendScore,feedTypeOf,feedSortOf,FEED_TYPES}=await import('../public/lib/feed.js');
  assert.equal(postScore({1:['❤️','🔥'],2:['❤️'],3:[]},[{text:'gg'},{removed:true}]),4);
  assert.equal(postScore(undefined,undefined),0);
  const h=3600000,now=100*h,posts=[{id:'old',at:now-72*h,score:9},{id:'new',at:now-h,score:3},{id:'quiet',at:now,score:0}];
  assert.deepEqual(sortFeed(posts,'top',now).map(p=>p.id),['old','new','quiet']);
  assert.deepEqual(sortFeed(posts,'trending',now).map(p=>p.id),['new','old','quiet']);
  assert.deepEqual(sortFeed(posts,'new',now).map(p=>p.id),['quiet','new','old']);
  assert.ok(trendScore(4,0,0)>trendScore(4,0,24*h));
  assert.equal(feedTypeOf('clips'),'clips');assert.equal(feedTypeOf('constructor'),'all');assert.equal(feedSortOf('x'),'new');
  assert.equal(FEED_TYPES.clips.match({kind:'user',clip:{}}),true);assert.equal(FEED_TYPES.clips.match({kind:'user'}),false);
  assert.equal(FEED_TYPES.pulls.match({kind:'pull'}),true);
});
test('vault: the feed filters by kind and pages Top by score',async()=>{
  const rows=new Map(),storage={get:async k=>structuredClone(rows.get(k)),put:async(k,v)=>rows.set(k,structuredClone(v)),delete:async k=>rows.delete(k),list:async({prefix})=>new Map([...rows].filter(([k])=>k.startsWith(prefix)))};storage.transaction=fn=>fn(storage);
  const vault=new CosmeticsVault({storage});
  let n=0;const act=(account,body)=>vault.fetch(new Request(`https://vault/action?account=${account}`,{method:'POST',body:JSON.stringify({requestId:`sort-test-request-${String(++n).padStart(4,'0')}`,...body})})).then(async r=>({status:r.status,...await r.json()}));
  const feed=async(q='')=>(await vault.fetch(new Request(`https://vault/feed${q}`))).json();
  for(const a of ['101','202','303'])await act(a,{action:'session'});
  const loved=(await act('101',{action:'post',text:'loved'})).post.id;
  await act('202',{action:'post',text:'clip',clip:'https://youtu.be/dQw4w9WgXcQ'});
  await act('303',{action:'post',text:'newest'});
  await act('202',{action:'react',post:loved,emoji:'❤️'});await act('303',{action:'comment',post:loved,text:'nice'});
  const top=await feed('?sort=top');
  assert.equal(top.posts[0].id,loved);assert.equal(top.posts.length,3);assert.equal(top.more,false);
  assert.deepEqual((await feed('?sort=top&offset=1')).posts.map(p=>p.id),top.posts.slice(1).map(p=>p.id));
  assert.deepEqual((await feed('?type=clips')).posts.map(p=>p.text),['clip']);
  assert.equal((await feed('?type=cards')).posts.length,0);
  assert.equal((await feed('?type=bogus')).posts.length,3);
});

test('auto-post settings: defaults, checking, and what a pack posts',async()=>{
  const {feedAutoOf,setFeedAuto,pullPost,FEED_AUTO_DEFAULT}=await import('../public/lib/feed.js');
  assert.deepEqual(feedAutoOf({}),{cards:true,rarities:['epic','legendary'],screens:false});
  assert.deepEqual(feedAutoOf(null),{...FEED_AUTO_DEFAULT,rarities:[...FEED_AUTO_DEFAULT.rarities]});
  const s=setFeedAuto({packs:[]},{cards:false,rarities:['legendary','rare'],screens:true});
  assert.deepEqual(s.feedAuto,{cards:false,rarities:['rare','legendary'],screens:true});assert.deepEqual(s.packs,[]);
  assert.throws(()=>setFeedAuto({},{cards:'yes',rarities:[],screens:false}),/on or off/);
  assert.throws(()=>setFeedAuto({},{cards:true,rarities:['mythic'],screens:false}),/rarities/);
  const rarity={a:'common',b:'rare',c:'legendary'},rewards=[{key:'a'},{key:'b'},{key:'c'}];
  assert.deepEqual(pullPost(rewards,['scr:1'],feedAutoOf({}),k=>rarity[k]),{items:['c']});
  assert.deepEqual(pullPost(rewards,['scr:1'],{cards:true,rarities:['common'],screens:true},k=>rarity[k]),{items:['a'],screens:['scr:1']});
  assert.deepEqual(pullPost([],['scr:1','scr:2'],{cards:true,rarities:[],screens:true},k=>rarity[k]),{items:[],screens:['scr:1','scr:2']});
  assert.equal(pullPost(rewards,['scr:1'],{cards:true,rarities:[],screens:false},k=>rarity[k]),null);
});
test('vault: auto-post settings decide card and pull posts; a profile reads one player\'s feed',async()=>{
  const rows=new Map(),storage={get:async k=>structuredClone(rows.get(k)),put:async(k,v)=>rows.set(k,structuredClone(v)),delete:async k=>rows.delete(k),list:async({prefix})=>new Map([...rows].filter(([k])=>k.startsWith(prefix)).sort(([a],[b])=>a<b?-1:1))};storage.transaction=fn=>fn(storage);
  const vault=new CosmeticsVault({storage});
  // The one-time backfills ran long ago on the live vault; here they'd post what the settings held back.
  rows.set('pulls-backfilled',true);rows.set('posts-backfilled',true);
  let n=0;const act=(account,body)=>vault.fetch(new Request(`https://vault/action?account=${account}`,{method:'POST',body:JSON.stringify({requestId:`auto-test-request-${String(++n).padStart(4,'0')}`,...body})})).then(async r=>({status:r.status,...await r.json()}));
  const feed=async q=>(await (await vault.fetch(new Request(`https://vault/feed${q}`))).json());
  await act('101',{action:'session'});await act('202',{action:'session'});
  // Card posts off: a new design saves but doesn't post.
  assert.equal((await act('101',{action:'feed-auto',cards:false,rarities:[],screens:false})).state.feedAuto.cards,false);
  assert.equal((await act('101',{action:'equip',equipment:{...DEFAULT_EQUIPMENT,hue:40}})).status,200);
  assert.equal([...rows.keys()].some(k=>k.startsWith('post:c:101:')),false);
  // Nothing on: opening a pack posts nothing.
  assert.equal((await act('101',{action:'open',packIndex:0})).status,200);
  assert.equal([...rows.keys()].some(k=>k.startsWith('pull:')),false);
  // Every rarity and screens on: the pack posts all three cards and its screens.
  await act('101',{action:'feed-auto',cards:true,rarities:['common','rare','epic','legendary'],screens:true});
  const opened=await act('101',{action:'open',packIndex:0});
  const pull=[...rows].find(([k])=>k.startsWith('pull:'))[1];
  assert.deepEqual(pull.items,opened.rewards.map(r=>r.key));assert.deepEqual(pull.screens??[],opened.screens);
  assert.equal((await act('101',{action:'feed-auto',cards:true,rarities:'all',screens:true})).status,400);
  // 202's card posts by default; ?account keeps one player's posts.
  await act('202',{action:'equip',equipment:{...DEFAULT_EQUIPMENT,hue:80}});
  assert.deepEqual((await feed('?account=101')).posts.map(p=>p.account),['101']);
  assert.deepEqual((await feed('?account=202')).posts.map(p=>p.kind),['card']);
  assert.equal((await feed('')).posts.length,2);
  assert.equal((await vault.fetch(new Request('https://vault/feed?account=abc'))).status,400);
  // The owner deletes their own pull and card posts; not someone else's.
  const pullId=(await feed('?account=101')).posts[0].id,cardId=(await feed('?account=202')).posts[0].id;
  assert.equal((await act('101',{action:'post-delete',post:cardId})).status,400);
  assert.equal((await act('101',{action:'post-delete',post:pullId})).status,200);
  assert.equal((await act('202',{action:'post-delete',post:cardId})).status,200);
  assert.equal((await feed('')).posts.length,0);
});
test('polls: 2 to 6 distinct choices, a set time limit, one changeable vote until it ends',async()=>{
  const {buildPoll,castPollVote,pollTally,pollTimeLeft,buildUserPost}=await import('../public/lib/feed.js');
  const poll=buildPoll({options:[' Axe ','Pudge',''],hours:6},1000);
  assert.deepEqual(poll,{options:['Axe','Pudge'],ends:1000+6*3600000});
  assert.throws(()=>buildPoll({options:['only'],hours:6},0),/at least 2/);
  assert.throws(()=>buildPoll({options:['a','b','c','d','e','f','g'],hours:6},0),/up to 6/);
  assert.throws(()=>buildPoll({options:['a','A'],hours:6},0),/different/);
  assert.throws(()=>buildPoll({options:['a','b'],hours:5},0),/how long/);
  assert.throws(()=>buildUserPost({account:'1',at:0,text:'',poll:{options:['a','b'],hours:1}}),/question/);
  let v=castPollVote(null,'1',0,poll,2000);v=castPollVote(v,'2',1,poll,2000);v=castPollVote(v,'1',1,poll,2000);
  assert.deepEqual(pollTally(v,poll),[[],['1','2']]);
  v=castPollVote(v,'1',1,poll,2000);assert.deepEqual(pollTally(v,poll),[[],['2']]);
  assert.throws(()=>castPollVote(v,'1',2,poll,2000),/choices/);
  assert.throws(()=>castPollVote(v,'1',0,poll,poll.ends),/ended/);
  assert.equal(pollTimeLeft(poll,poll.ends-90*60000),'2h left');assert.equal(pollTimeLeft(poll,poll.ends),'Ended');
});
test('vault: poll posts take votes, show them in the feed, and drop them on delete',async()=>{
  const rows=new Map(),storage={get:async k=>structuredClone(rows.get(k)),put:async(k,v)=>rows.set(k,structuredClone(v)),delete:async k=>rows.delete(k),list:async({prefix})=>new Map([...rows].filter(([k])=>k.startsWith(prefix)))};storage.transaction=fn=>fn(storage);
  const vault=new CosmeticsVault({storage});
  let n=0;const act=(account,body)=>vault.fetch(new Request(`https://vault/action?account=${account}`,{method:'POST',body:JSON.stringify({requestId:`poll-test-request-${String(++n).padStart(4,'0')}`,...body})})).then(async r=>({status:r.status,...await r.json()}));
  await act('101',{action:'session'});await act('202',{action:'session'});
  const made=await act('101',{action:'post',text:'Best carry?',poll:{options:['Medusa','Spectre'],hours:24}});
  assert.equal(made.status,200);const id=made.post.id;assert.deepEqual(made.post.poll.votes,[[],[]]);
  assert.deepEqual((await act('202',{action:'poll-vote',post:id,option:1})).votes,[[],['202']]);
  await act('101',{action:'poll-vote',post:id,option:1});
  const feed=await (await vault.fetch(new Request('https://vault/feed?type=polls'))).json();
  assert.equal(feed.posts.length,1);assert.deepEqual(feed.posts[0].poll.votes,[[],['101','202']]);
  // Ended polls refuse votes.
  const row=rows.get(`post:${id}`);row.poll.ends=Date.now()-1;rows.set(`post:${id}`,row);
  assert.match((await act('202',{action:'poll-vote',post:id,option:0})).error,/ended/);
  await act('101',{action:'post-delete',post:id});
  assert.equal([...rows.keys()].some(k=>k.includes(id)),false);
});
