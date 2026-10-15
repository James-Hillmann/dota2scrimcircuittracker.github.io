// Ratings under a saved card design (lib/card-ratings.js): the counts and the community's pick for
// everyone, and for a signed-in player on someone else's card, a vote (one per design; the Worker
// keeps it to that). Your own votes come from the Worker (myCardVotes), so they follow you between
// devices. Used on profiles and the Gallery (parts/collection.js) and on Feed card posts (parts/feed.js).
import { collectionAction } from '../lib/cosmetics.js';
import { RATINGS } from '../lib/card-ratings.js';

const RATING_NAMES={common:'Common',rare:'Rare',epic:'Epic',legendary:'Legendary'};
function ratingHtml(r,{canVote,viewer,mine}) {
  return `<div class="card-rating" data-rating-slot="${r.slot}"><p class="card-rating-pick">${r.total?`Rated <b data-rarity="${r.pick}">${RATING_NAMES[r.pick]}</b> · ${r.total} vote${r.total===1?'':'s'}`:'No ratings yet'}</p>
    <div class="card-rating-bar" aria-hidden="true">${RATINGS.map(k=>`<i data-rarity="${k}" style="flex:${r.counts[k]}"></i>`).join('')}</div>
    <div class="card-rating-votes" role="group" aria-label="Rate this card">${RATINGS.map(k=>`<button type="button" data-rate="${k}" data-rarity="${k}" aria-pressed="${mine===k}"${canVote?'':' disabled'} title="${canVote?`Rate it ${RATING_NAMES[k]}`:viewer==null?'Sign in with Steam to rate cards':'You can\'t rate your own card'}">${RATING_NAMES[k]} <small>${r.counts[k]}</small></button>`).join('')}</div></div>`;
}
// Puts rating r (one of account's designs) under fig and wires its buttons. votes is the viewer's
// own votes by "<owner>:<key>", updated in place; onVote runs after a vote is saved.
export function mountRating(fig,account,r,{viewer,votes,onVote}) {
  const canVote=viewer!=null&&String(viewer)!==String(account);
  const draw=rating=>{
    fig.querySelector('.card-rating')?.remove();
    fig.insertAdjacentHTML('beforeend',ratingHtml(rating,{canVote,viewer,mine:votes[`${account}:${rating.key}`]??null}));
    fig.querySelectorAll('[data-rate]').forEach(b=>b.onclick=async()=>{
      const pick=b.getAttribute('aria-pressed')==='true'?null:b.dataset.rate;
      fig.querySelectorAll('[data-rate]').forEach(x=>x.disabled=true);
      try {
        const {rating:next}=await collectionAction('rate',{target:Number(account),cardSlot:rating.slot,rating:pick});
        if(next.mine)votes[`${account}:${next.key}`]=next.mine;else delete votes[`${account}:${next.key}`];
        draw(next);onVote?.(next);
      } catch(e) {fig.querySelectorAll('[data-rate]').forEach(x=>x.disabled=!canVote);fig.querySelector('.card-rating-pick').textContent=e.message;}
    });
  };
  draw(r);
}
