// "@" suggestions in the Feed's post box and comment boxes (lib/mentions.js): type @ and part of a
// player's or team's name, pick one with a click, Enter or Tab, and it goes in as "@Name". On send,
// mentionsOf turns the picked names into mention tokens and lists the accounts to ping.
import { esc } from '../core.js';
import { teamLogoHtml } from '../lib/team-logos.js';
import { mentionCompletion, insertMention, encodeMentions } from '../lib/mentions.js';

export function wireMentions(input, directory) {
  if (input._mentions) return;
  input._mentions = [];
  const box = document.createElement('div');
  box.className = 'feed-mention-suggest';
  box.setAttribute('role', 'listbox');
  box.setAttribute('aria-label', 'Players and teams to mention');
  box.hidden = true;
  input.parentElement.append(box); // after the emoticon list, which sits right after the input
  let completion = null, active = 0;
  const close = () => { box.hidden = true; completion = null; input.setAttribute('aria-expanded', 'false'); };
  const draw = () => {
    completion = mentionCompletion(input.value, input.selectionStart ?? input.value.length, directory);
    if (!completion) return close();
    active = 0;
    box.innerHTML = completion.matches.map((e, i) => `<button type="button" role="option" data-mention="${i}" aria-selected="${i === 0}">${e.kind === 't'
      ? teamLogoHtml({ id: e.id, name: e.name }, 'feed-mention-logo') || '<span class="feed-mention-at" aria-hidden="true">@</span>' : '<span class="feed-mention-at" aria-hidden="true">@</span>'}<span><strong>${esc(e.name)}</strong><small>${e.kind === 't' ? `Team · ${esc(e.sub)} · pings ${e.members.length}` : esc(e.sub)}</small></span></button>`).join('');
    box.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  };
  const choose = (i) => {
    const e = completion?.matches[i];
    if (!e) return;
    const next = insertMention(input.value, completion, e);
    input._mentions.push(e);
    input.value = next.value;
    input.setSelectionRange(next.caret, next.caret);
    input.focus();
    close();
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  input.addEventListener('input', draw);
  input.addEventListener('click', draw);
  input.addEventListener('blur', () => setTimeout(close, 150));
  // Runs before the Feed's own key handling (it listens higher up), so arrows and Enter stay here
  // while the list is open.
  input.addEventListener('keydown', (e) => {
    if (box.hidden || !completion) return;
    const n = completion.matches.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
      box.querySelectorAll('[data-mention]').forEach((b, i) => b.setAttribute('aria-selected', String(i === active)));
      box.children[active].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' || e.key === 'Tab') choose(active);
    else if (e.key === 'Escape') close();
    else return;
    e.preventDefault(); e.stopPropagation();
  });
  box.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus in the input
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mention]');
    if (b) { e.stopPropagation(); choose(Number(b.dataset.mention)); }
  });
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
}

// The text to send with its mention tokens, and the accounts to ping.
export const mentionsOf = (input) => encodeMentions(input.value, input._mentions ?? []);
// After a send: the picks go with the cleared text.
export function forgetMentions(input) { if (input._mentions) input._mentions = []; }
