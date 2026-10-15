// The Feed's image filter: before a post with images is saved, a Workers AI vision model looks at
// each one and refuses nudity, sexual content, real gore and hate symbols. If the check can't run,
// image posts are refused rather than let through (text-only posts don't need it).
import { imageType } from '../../../public/lib/feed.js';

export const IMAGE_MODEL = '@cf/mistralai/mistral-small-3.1-24b-instruct';
const PROMPT = `You check images posted to a Dota 2 gaming community site. Reply with exactly one word.
UNSAFE if the image shows any of: nudity or sexual content, graphic real-world gore or injury, hate symbols (such as swastikas), or slurs written in it.
SAFE for everything else, including video game violence and gore, Dota 2 heroes and screenshots, memes, and swearing.`;

// What the model's reply means: 'safe', 'unsafe' or null when it answered neither.
export function readVerdict(reply) {
  const text = String(reply ?? '').toUpperCase();
  if (/\bUNSAFE\b/.test(text)) return 'unsafe';
  if (/\bSAFE\b/.test(text)) return 'safe';
  return null;
}

// images: the base64 strings from the post. Throws a player-facing error for a refused image.
export async function checkImages(ai, images) {
  if (!images?.length) return;
  if (!ai) throw new Error('Image posts are unavailable right now. Try again later, or post without images.');
  for (const [i, b64] of images.entries()) {
    const head = Uint8Array.from(atob(String(b64).slice(0, 24)), (c) => c.charCodeAt(0));
    const type = imageType(head);
    if (!type) throw new Error('Images can be JPEG, PNG, GIF or WebP.');
    let verdict;
    try {
      const out = await ai.run(IMAGE_MODEL, {
        messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT }, { type: 'image_url', image_url: { url: `data:${type};base64,${b64}` } }] }],
        max_tokens: 5, temperature: 0,
      });
      verdict = readVerdict(out?.response ?? out?.choices?.[0]?.message?.content);
    } catch { verdict = null; }
    if (verdict === 'unsafe') throw new Error(`Image ${i + 1} isn't allowed in the Feed.`);
    if (verdict !== 'safe') throw new Error(`Image ${i + 1} couldn't be checked. Try again, or post a different image.`);
  }
}
