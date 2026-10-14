import { grantLogin, applyPackGrants, rollPack, recycleCards, saveCardDesign, setCardPreferences, cardAppearance, cardDesignState, setNickname, shownNickname, setProfileBackground } from '../../../public/lib/cosmetics-engine.js';
import { designKey, castVote, tally } from '../../../public/lib/card-ratings.js';
import { DEFAULT_EQUIPMENT, itemByKey } from '../../../public/lib/cosmetics-catalog.js';
import { isAdmin, giftPacks, clearGifts } from '../../../public/lib/pack-gifts.js';
import { isPostId, postOwner, toggleReaction, reactionTally, addComment, deleteComment, pushNotice, markNoticesSeen, cardPostId, FEED_PAGE, COMMENT_GAP } from '../../../public/lib/feed.js';

const json=(value,status=200)=>Response.json(value,{status});
const secureRandom=()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296;

// Restore pre-fix screen-pack openings once. Display failures were not reported to the
// server, so all old screen-only openings receive replacements; discoveries are preserved.
export function restoreScreenPacks(state, receipts, now=Date.now()) {
  if(state.screenPackRecovery==='images-v1')return state;
  const count=[...receipts.values()].filter(r=>r.action==='open'&&!r.openedAt&&r.result?.rewards?.length===0&&r.result?.screens?.length>0).length;
  return {...state,screenPackRecovery:'images-v1',packs:[...state.packs,...Array(count).fill('screens')],
    ...(count?{gifts:[...(state.gifts??[]),{kind:'pack',tier:'screens',count,note:'Replacement packs for the loading-screen display issue. Your collected screens are still yours.',at:now}].slice(-20)}:{})};
}

// The pull log: one row per opened pack that dealt an epic or legendary card, keyed by time.
const LOGGED=['epic','legendary'];
const pullRow=(account,openedAt,packType,rewards)=>{const items=(rewards??[]).map(r=>r.key).filter(k=>LOGGED.includes(itemByKey(k)?.rarity));return items.length?{account,at:openedAt,packType,items}:null;};
const pullKey=(at,account,requestId)=>`pull:${String(at).padStart(15,'0')}:${account}:${requestId}`;
// The default card, as saved (saving adds hue 0): never posted or shown in the Gallery.
const PLAIN_DESIGN={...DEFAULT_EQUIPMENT,hue:0},PLAIN=designKey(PLAIN_DESIGN);
const isPlainDesign=design=>!design||designKey({...PLAIN_DESIGN,...design})===PLAIN;

// One serialized vault for this league. Inventory, receipts, daily grants and appearance
// writes commit together. Browser input never supplies drop odds, items or counts.
export class CosmeticsVault {
  constructor(ctx) {this.ctx=ctx;}
  // The pull log, filled once from the pack receipts opened before it existed.
  async backfillPulls() {
    if(await this.ctx.storage.get('pulls-backfilled'))return;
    const rows={};let after;
    for(;;) {
      const page=await this.ctx.storage.list({prefix:'receipt:',limit:256,...(after?{startAfter:after}:{})});
      for(const [k,r] of page) {
        if(r?.action!=='open'||!r.openedAt)continue;
        const [,acct,id]=k.split(':'),row=pullRow(acct,r.openedAt,r.packType,r.result?.rewards);
        if(row)rows[pullKey(r.openedAt,acct,id)]=row;
      }
      if(page.size<256)break;after=[...page.keys()].at(-1);
    }
    for(const [k,v] of Object.entries(rows))await this.ctx.storage.put(k,v);
    await this.ctx.storage.put('pulls-backfilled',true);
  }
  // Card posts for designs saved before the Feed existed: one per changed card, at its save time.
  async backfillPosts() {
    if(await this.ctx.storage.get('posts-backfilled'))return;
    for(const [k,state] of await this.ctx.storage.list({prefix:'user:',limit:5000})) {
      const account=k.slice(5),designs=cardDesignState(state).cardDesigns;
      for(let slot=0;slot<designs.length;slot++) {
        const design=designs[slot],at=state.cardSavedAt?.[slot];
        if(at&&!isPlainDesign(design))await this.ctx.storage.put(`post:c:${account}:${slot}:${at}`,{kind:'card',account,slot,design,at});
      }
    }
    await this.ctx.storage.put('posts-backfilled',true);
  }
  async postById(id,storage=this.ctx.storage) {
    if(id.startsWith('c:')){const p=await storage.get(`post:${id}`);return p&&{id,...p};}
    const p=await storage.get(`pull:${id.slice(2)}`);return p&&{id,kind:'pull',...p};
  }
  async fetch(req) {
    const url=new URL(req.url);
    if(url.pathname==='/appearances') {
      const rows=await this.ctx.storage.list({prefix:'appearance:',limit:5000});
      return json(Object.fromEntries([...rows].map(([k,v])=>[k.slice(11),v])));
    }
    // The gallery: every saved design anyone has changed from the default card, with its ratings.
    if(url.pathname==='/gallery') {
      const users=await this.ctx.storage.list({prefix:'user:',limit:5000});
      const votes=await this.ctx.storage.list({prefix:'votes:',limit:20000}), cards=[];
      for(const [k,state] of users) {
        const account=k.slice(5),prefs=cardDesignState(state);
        prefs.cardDesigns.forEach((design,slot)=>{
          if(isPlainDesign(design))return;
          const key=designKey(design);
          cards.push({account,slot,key,design,primary:slot===prefs.primaryCard,at:state.cardSavedAt?.[slot]??null,nickname:shownNickname(state),...tally(votes.get(`votes:${account}:${key}`))});
        });
      }
      return json({cards});
    }
    // The newest 150 epic and legendary pulls, with each puller's shown nickname. The first call
    // fills the log from the pack receipts opened before it existed.
    if(url.pathname==='/pulls') {
      await this.backfillPulls();
      const pulls=[...(await this.ctx.storage.list({prefix:'pull:'})).values()].sort((a,b)=>b.at-a.at).slice(0,150);
      const nicknames={};
      for(const a of new Set(pulls.map(p=>p.account)))nicknames[a]=shownNickname(await this.ctx.storage.get(`user:${a}`));
      return json({pulls:pulls.map(p=>({...p,nickname:nicknames[p.account]}))});
    }
    // The Feed (lib/feed.js): FEED_PAGE posts older than ?before, newest first, or the one ?post,
    // each with its reactions and comments, plus the shown nickname of everyone in them.
    if(url.pathname==='/feed') {
      await this.backfillPulls();await this.backfillPosts();
      const one=url.searchParams.get('post'),before=Number(url.searchParams.get('before'))||Infinity;
      let posts;
      if(one) {
        if(!isPostId(one))return json({error:'Choose a post.'},400);
        const p=await this.postById(one);posts=p?[p]:[];
      } else {
        const cards=[...(await this.ctx.storage.list({prefix:'post:'}))].map(([k,v])=>({id:k.slice(5),...v}));
        const pulls=[...(await this.ctx.storage.list({prefix:'pull:'}))].map(([k,v])=>({id:`p:${k.slice(5)}`,kind:'pull',...v}));
        posts=[...cards,...pulls].filter(p=>p.at<before).sort((a,b)=>b.at-a.at);
      }
      const more=posts.length>FEED_PAGE;posts=posts.slice(0,FEED_PAGE);
      const nicknames={};
      for(const p of posts) {
        p.reactions=reactionTally(await this.ctx.storage.get(`react:${p.id}`));
        p.comments=await this.ctx.storage.get(`comments:${p.id}`)??[];
        for(const a of [p.account,...p.comments.map(c=>c.account)])if(!(a in nicknames))nicknames[a]=shownNickname(await this.ctx.storage.get(`user:${a}`));
      }
      return json({posts,more,nicknames});
    }
    const account=url.searchParams.get('account');
    if(!/^\d{1,10}$/.test(account??'')) return json({error:'Invalid account.'},400);
    // Each saved design's ratings (lib/card-ratings.js), by the design's fingerprint.
    if(req.method==='GET' && url.pathname==='/ratings') {
      const state=await this.ctx.storage.get(`user:${account}`);
      const designs=state?cardDesignState(state).cardDesigns:[];
      const cards=await Promise.all(designs.map(async(design,slot)=>{
        if(!design)return null;
        const key=designKey(design);
        return {slot,key,...tally(await this.ctx.storage.get(`votes:${account}:${key}`))};
      }));
      return json({cards});
    }
    if(req.method==='GET') {
      const state=await this.ctx.storage.get(`user:${account}`);
      return json({inventory:state?.inventory??{},screens:state?.screens??[],equipment:state?.equipment??null,nickname:shownNickname(state),background:state?.profileBackground??null,...(state?cardDesignState(state):{})});
    }
    let body;try {body=await req.json();} catch {return json({error:'Invalid request.'},400);}
    // Which designs this player has rated, and how: "<owner>:<design key>" → rating. A read, so
    // no receipt.
    if(body.action==='my-votes') {
      const mine={};
      for(const [k,v] of await this.ctx.storage.list({prefix:'votes:',limit:20000}))if(v?.[account])mine[k.slice(6)]=v[account];
      return json({votes:mine});
    }
    try {
      const result=await this.ctx.storage.transaction(async txn=>{
        const key=`user:${account}`, saved=await txn.get(key);
        if(body.action==='session') {
          let state=grantLogin(saved);
          if(state.screenPackRecovery!=='images-v1')state=restoreScreenPacks(state,await txn.list({prefix:`receipt:${account}:`}));
          state=applyPackGrants(state);await txn.put(key,state);return {state};
        }
        if(!saved) throw new Error('Load your collection first.');
        if(!/^[\w-]{16,80}$/.test(body.requestId??'')) throw new Error('Invalid request ID.');
        const receipt=`receipt:${account}:${body.requestId}`, old=await txn.get(receipt);
        if(old) {
          if(old.action!==body.action) throw new Error('Request ID already used.');
          // Feed receipts intentionally keep only the post id. On a safe retry, read the current
          // value back so the browser receives the same response shape as the original request.
          if(old.action==='react')return {...old.result,state:saved,reactions:reactionTally(await txn.get(`react:${old.result.post}`))};
          if(['comment','comment-delete'].includes(old.action))return {...old.result,state:saved,comments:await txn.get(`comments:${old.result.post}`)??[]};
          return {...old.result,state:saved};
        }
        let result;
        if(body.action==='open') result=rollPack(saved,body.packIndex,secureRandom);
        else if(body.action==='claim-bonus') {
          if(!['feedback','tour','discord'].includes(body.source)) throw new Error('Choose a valid pack offer.');
          const claims={...(saved.bonusPackClaims??{})};
          if(claims[body.source] || saved.bonusPackClaimed===body.source || saved.bonusPackClaimed===true) return {state:saved,source:body.source,alreadyClaimed:true};
          claims[body.source]=true;
          result={state:{...saved,packs:[...(saved.packs??[]),'common'],bonusPackClaims:claims},source:body.source};
        }
        else if(body.action==='recycle') result=recycleCards(saved,body.selections);
        // cardSavedAt: when each card's design last changed (the Gallery's Newest sort).
        else if(body.action==='equip') {
          const slot=body.cardSlot??saved.primaryCard??0,before=cardDesignState(saved).cardDesigns[slot];
          const next=saveCardDesign(saved,body.equipment,body.cardSlot),savedAt=[...(saved.cardSavedAt??[null,null,null])];
          const design=next.cardDesigns[slot],changed=!before||designKey(before)!==designKey(design);
          let posts=saved.lastPosts??[null,null,null];
          if(changed) {
            const now=Date.now();savedAt[slot]=now;
            // A changed design goes in the Feed (lib/feed.js cardPostId).
            if(!isPlainDesign(design)) {
              const lastId=posts[slot],last=lastId&&await txn.get(`post:${lastId}`);
              const touched=!!lastId&&(Object.keys(await txn.get(`react:${lastId}`)??{}).length>0||(await txn.get(`comments:${lastId}`)??[]).length>0);
              const id=cardPostId(account,slot,now,last&&{id:lastId,at:last.at,touched});
              await txn.put(`post:${id}`,{kind:'card',account,slot,design,at:now});
              posts=posts.map((p,i)=>i===slot?id:p);
            }
          }
          result={state:{...next,cardSavedAt:savedAt,lastPosts:posts}};
        }
        else if(body.action==='card-settings')result={state:setCardPreferences(saved,body)};
        else if(body.action==='nickname')result={state:setNickname(saved,body)};
        else if(body.action==='profile-background')result={state:setProfileBackground(saved,body)};
        else if(body.action==='gift') {
          // Fav only: packs, card items or a loading screen into another player's collection, with a
          // notice they see next visit.
          if(!isAdmin(account))throw new Error('Only Fav can gift packs.');
          const target=String(body.target??'');
          if(!/^\d{1,10}$/.test(target))throw new Error('Choose a player.');
          const targetKey=`user:${target}`,given=giftPacks((target===account?saved:await txn.get(targetKey))??grantLogin(null),body);
          if(target===account)result={state:given,gift:{target,kind:body.kind??'pack',tier:body.tier,item:body.item,count:body.count}};
          else {await txn.put(targetKey,given);result={state:saved,gift:{target,kind:body.kind??'pack',tier:body.tier,item:body.item,count:body.count}};}
        }
        else if(body.action==='gifts-seen')result={state:clearGifts(saved)};
        // The Feed (lib/feed.js): reactions and comments on any post; comments notify its owner.
        else if(['react','comment','comment-delete'].includes(body.action)) {
          const post=String(body.post??''),owner=postOwner(post);
          if(!await this.postById(post,txn))throw new Error('That post is gone.');
          if(body.action==='react') {
            const reactions=toggleReaction(await txn.get(`react:${post}`),account,body.emoji);
            await txn.put(`react:${post}`,reactions);
            result={state:saved,post,reactions:reactionTally(reactions)};
          } else if(body.action==='comment') {
            const now=Date.now();
            if(now-(saved.lastCommentAt??0)<COMMENT_GAP)throw new Error('Wait a moment before commenting again.');
            const {comments,comment}=addComment(await txn.get(`comments:${post}`),{account,text:body.text,at:now});
            await txn.put(`comments:${post}`,comments);
            if(owner!==account) {
              const ownerState=await txn.get(`user:${owner}`);
              if(ownerState)await txn.put(`user:${owner}`,pushNotice(ownerState,{kind:'comment',post,from:account,fromName:shownNickname(saved),text:comment.text.slice(0,120),at:now}));
            }
            result={state:{...saved,lastCommentAt:now},post,comments};
          } else {
            const comments=deleteComment(await txn.get(`comments:${post}`),String(body.comment??''),account,{owner,admin:isAdmin(account)});
            await txn.put(`comments:${post}`,comments);
            result={state:saved,post,comments};
          }
        }
        else if(body.action==='notices-seen')result={state:markNoticesSeen(saved,Date.now())};
        else if(body.action==='rate') {
          // One vote per voter per design, never your own; the design is read here, not sent.
          const target=String(body.target??'');
          if(!/^\d{1,10}$/.test(target))throw new Error('Choose a player card.');
          if(target===account)throw new Error("Rate other players' cards, not your own.");
          if(!Number.isInteger(body.cardSlot)||body.cardSlot<0||body.cardSlot>2)throw new Error('Choose one of their cards.');
          const owner=await txn.get(`user:${target}`),design=owner&&cardDesignState(owner).cardDesigns[body.cardSlot];
          if(!design)throw new Error('That card has no saved design.');
          const key=designKey(design),votesKey=`votes:${target}:${key}`;
          const votes=castVote(await txn.get(votesKey),account,body.rating??null);
          await txn.put(votesKey,votes);
          result={state:saved,rating:{slot:body.cardSlot,key,mine:votes[account]??null,...tally(votes)}};
        }
        else throw new Error('Unknown collection action.');
        await txn.put(key,result.state);
        if(['equip','card-settings','nickname'].includes(body.action)) await txn.put(`appearance:${account}`,cardAppearance(result.state));
        const openedAt=Date.now();
        // Feed receipts keep only the post: its comments can be long and are read fresh anyway.
        await txn.put(receipt,{action:body.action,result:['react','comment','comment-delete'].includes(body.action)?{post:result.post}:result,...(body.action==='open'?{openedAt,packType:saved.packs[body.packIndex]}:{})});
        const pull=body.action==='open'&&pullRow(account,openedAt,saved.packs[body.packIndex],result.rewards);
        if(pull)await txn.put(pullKey(openedAt,account,body.requestId),pull);
        return result;
      });
      return json({...result,serverNow:Date.now()});
    } catch(e) {return json({error:e.message},400);}
  }
}

export async function cosmeticsRequest(req,env,allowedOrigins) {
  const origin=req.headers.get('origin'), url=new URL(req.url);
  if(origin && !allowedOrigins.includes(origin)) return json({error:'Unknown origin.'},403);
  const headers={'Access-Control-Allow-Origin':origin??allowedOrigins[0],'Vary':'Origin','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Cache-Control':'no-store'};
  const respond=r=>new Response(r.body,{status:r.status,headers:{...Object.fromEntries(r.headers),...headers}});
  if(req.method==='OPTIONS') return respond(new Response(null,{status:204}));
  if(!env.COSMETICS) return respond(json({error:'The collection service is not configured yet.'},503));
  const vault=env.COSMETICS.get(env.COSMETICS.idFromName('league-v1'));
  if(req.method==='GET' && url.pathname==='/cosmetics/appearances') return respond(await vault.fetch('https://vault/appearances'));
  if(req.method==='GET' && url.pathname==='/cosmetics/gallery') return respond(await vault.fetch('https://vault/gallery'));
  if(req.method==='GET' && url.pathname==='/cosmetics/pulls') return respond(await vault.fetch('https://vault/pulls'));
  if(req.method==='GET' && url.pathname==='/cosmetics/feed') return respond(await vault.fetch(`https://vault/feed${url.search}`));
  const publicAccount=/^\/cosmetics\/collection\/(\d{1,10})$/.exec(url.pathname)?.[1];
  if(req.method==='GET' && publicAccount) return respond(await vault.fetch(`https://vault/collection?account=${publicAccount}`));
  const ratedAccount=/^\/cosmetics\/ratings\/(\d{1,10})$/.exec(url.pathname)?.[1];
  if(req.method==='GET' && ratedAccount) return respond(await vault.fetch(`https://vault/ratings?account=${ratedAccount}`));
  if(req.method!=='POST' || url.pathname!=='/cosmetics') return respond(json({error:'Not found.'},404));
  if(!env.FIREBASE_WEB_API_KEY) return respond(json({error:'Collection authentication is not configured yet.'},503));
  const token=/^Bearer (.+)$/.exec(req.headers.get('authorization')??'')?.[1];
  if(!token) return respond(json({error:'Sign in with Steam first.'},401));
  try {
    // The site's Firebase web key requires an allowed HTTP referrer. Use only the
    // origin validated above; the Firebase ID token still verifies account identity.
    const verification=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY)}`,{method:'POST',headers:{'Content-Type':'application/json','Referer':`${origin??allowedOrigins[0]}/`},body:JSON.stringify({idToken:token})});
    const data=await verification.json(), user=data.users?.[0];
    if(!verification.ok && !['INVALID_ID_TOKEN','TOKEN_EXPIRED','USER_DISABLED','USER_NOT_FOUND'].includes(data.error?.message)) return respond(json({error:'Collection authentication is temporarily unavailable. Please try again.'},503));
    const account=/^steam:(\d{1,10})$/.exec(user?.localId??'')?.[1];
    if(!verification.ok || !account || user.disabled) return respond(json({error:'Your Steam session expired. Sign in again.'},401));
    if(Number(req.headers.get('content-length')??0)>12000) return respond(json({error:'Request too large.'},413));
    const body=await req.text();if(body.length>12000) return respond(json({error:'Request too large.'},413));
    return respond(await vault.fetch(new Request(`https://vault/action?account=${account}`,{method:'POST',headers:{'Content-Type':'application/json'},body})));
  } catch {return respond(json({error:'The collection service is temporarily unavailable.'},503));}
}
