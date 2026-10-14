import { grantLogin, applyPackGrants, rollPack, recycleCards, saveCardDesign, setCardPreferences, cardAppearance, cardDesignState, setNickname, shownNickname } from '../../../public/lib/cosmetics-engine.js';
import { designKey, castVote, tally } from '../../../public/lib/card-ratings.js';
import { DEFAULT_EQUIPMENT } from '../../../public/lib/cosmetics-catalog.js';
import { isAdmin, giftPacks, clearGifts } from '../../../public/lib/pack-gifts.js';

const json=(value,status=200)=>Response.json(value,{status});
const secureRandom=()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296;

// One serialized vault for this league. Inventory, receipts, daily grants and appearance
// writes commit together. Browser input never supplies drop odds, items or counts.
export class CosmeticsVault {
  constructor(ctx) {this.ctx=ctx;}
  async fetch(req) {
    const url=new URL(req.url);
    if(url.pathname==='/appearances') {
      const rows=await this.ctx.storage.list({prefix:'appearance:',limit:5000});
      return json(Object.fromEntries([...rows].map(([k,v])=>[k.slice(11),v])));
    }
    // The gallery: every saved design anyone has changed from the default card, with its ratings.
    if(url.pathname==='/gallery') {
      const plain=designKey(DEFAULT_EQUIPMENT), users=await this.ctx.storage.list({prefix:'user:',limit:5000});
      const votes=await this.ctx.storage.list({prefix:'votes:',limit:20000}), cards=[];
      for(const [k,state] of users) {
        const account=k.slice(5),prefs=cardDesignState(state);
        prefs.cardDesigns.forEach((design,slot)=>{
          if(!design||designKey({...DEFAULT_EQUIPMENT,...design})===plain)return;
          const key=designKey(design);
          cards.push({account,slot,key,design,primary:slot===prefs.primaryCard,nickname:shownNickname(state),...tally(votes.get(`votes:${account}:${key}`))});
        });
      }
      return json({cards});
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
      return json({inventory:state?.inventory??{},screens:state?.screens??[],equipment:state?.equipment??null,nickname:shownNickname(state),...(state?cardDesignState(state):{})});
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
          const state=applyPackGrants(grantLogin(saved));await txn.put(key,state);return {state};
        }
        if(!saved) throw new Error('Load your collection first.');
        if(!/^[\w-]{16,80}$/.test(body.requestId??'')) throw new Error('Invalid request ID.');
        const receipt=`receipt:${account}:${body.requestId}`, old=await txn.get(receipt);
        if(old) {if(old.action!==body.action) throw new Error('Request ID already used.');return {...old.result,state:saved};}
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
        else if(body.action==='equip') result={state:saveCardDesign(saved,body.equipment,body.cardSlot)};
        else if(body.action==='card-settings')result={state:setCardPreferences(saved,body)};
        else if(body.action==='nickname')result={state:setNickname(saved,body)};
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
        await txn.put(receipt,{action:body.action,result});
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
