import test from 'node:test';
import assert from 'node:assert/strict';
import {hiraganaName,kanjiName,renderedName,signatureHtml} from '../public/lib/signatures.js';
import {itemByKey} from '../public/lib/cosmetics-catalog.js';

test('Hiragana and Kanji modifiers are legendary and render the katakana reading',()=>{
  for(const key of ['translation:hiragana','translation:kanji'])assert.equal(itemByKey(key)?.rarity,'legendary');
  assert.equal(hiraganaName('Fav'),'ふぁゔ');
  assert.equal(hiraganaName('Sayonara'),'さよなら');
  assert.equal(kanjiName('Fav'),'芭舞');
  assert.equal(kanjiName('Scionara'),'志央奈羅');
  assert.equal(kanjiName('James'),'邪女須');
  assert.equal(renderedName('Fav','kanji','upper'),'芭舞');
});

test('Kanji signatures use the Japanese brush font, not the Chinese one',()=>{
  const html=signatureHtml({autograph:'brush-ink',translation:'kanji',x:50,y:50,size:5,rotation:0},'Fav');
  assert.match(html,/data-writing="ja"/);
});
