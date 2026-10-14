import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withNicknames, setPlayerNickname, loadNicknames } from '../public/lib/nicknames.js';
import { buildSearchIndex, searchIndex } from '../public/lib/search.js';
import { asAd2l, rosterQuestions } from '../public/lib/unticketed.js';
import { playerKey } from '../public/lib/stats.js';

test('chosen nicknames reach rosters, games and search while both names keep the same account route', () => {
  setPlayerNickname(12345, 'Talus-');
  const d = withNicknames({ teams: [{ id: 1, name: 'Team', players: [{ account_id: 12345, name: 'jeune fille de cristal' }] }],
    games: [{ team_a_id: 1, players: [{ account_id: 99999, player_key: '12345', team: 'a', name: 'jeune fille de cristal' }] }] });
  assert.equal(d.teams[0].players[0].name, 'Talus-');
  assert.equal(d.games[0].players[0].name, 'Talus-');
  const index = buildSearchIndex([{ key: 'warrior', label: 'Warrior', root: '#/warrior', data: d }]);
  for (const q of ['talus', 'jeune fille', 'cristal']) {
    const hits = searchIndex(index, q).filter(p => p.kind === 'player');
    assert.equal(hits.length, 1);
    assert.equal(hits[0].name, 'Talus-');
    assert.equal(hits[0].href, '#/warrior/player/12345');
  }
  assert.deepEqual(index.find(p => p.kind === 'team').players, ['Talus-']);
  const uploaded = { team_a: 'Team', team_b: 'Other', players: [{ team: 'a', name: 'jeune fille de cristal' }] };
  assert.equal(asAd2l(uploaded, d).players[0].player_key, '12345');
  assert.deepEqual(rosterQuestions(uploaded, d), []);
  setPlayerNickname(12345, 'New nickname');
  assert.equal(d.teams[0].players[0].name, 'New nickname');
  assert.equal(d.teams[0].players[0].inGameName, 'jeune fille de cristal');
  setPlayerNickname(12345, null);
  assert.equal(d.teams[0].players[0].name, 'jeune fille de cristal');
});

test('scrim nicknames preserve player keys and both search terms', () => {
  setPlayerNickname(23456, 'Sparkle');
  const d = withNicknames({ games: [{ players: [{ player_key: '23456', name: 'Original', team: 'a' }, { name: 'Name Only', team: 'a' }], team_a: 'Team', team_b: 'Other' }] });
  assert.equal(playerKey(d.games[0].players[1]), 'name only');
  const index = buildSearchIndex([], { label: 'Scrims', matches: d.games });
  for (const name of ['sparkle', 'original']) assert.equal(searchIndex(index, name)[0].href, '#/scrims/player/23456');
  setPlayerNickname(23456, null);
});

test('public names load once, retry failures, and update already loaded data', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  const d = withNicknames({ teams: [{ players: [{ account_id: 34567, name: 'In game' }] }] });
  globalThis.fetch = async () => { calls++; return calls === 1 ? new Response('', { status: 503 }) : Response.json({34567: {nickname: 'Public nickname'}}); };
  try {
    await loadNicknames();
    assert.equal(d.teams[0].players[0].name, 'In game');
    await Promise.all([loadNicknames(), loadNicknames()]);
    assert.equal(calls, 2);
    assert.equal(d.teams[0].players[0].name, 'Public nickname');
    await loadNicknames();
    assert.equal(calls, 2);
  } finally { globalThis.fetch = original; setPlayerNickname(34567, null); }
});
