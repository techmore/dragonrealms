import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { journeyHint } from '../public/js/journey-hints.js';
import { setupGame, teardownGame, game, auth, createCharacter, loadPlayer, fakeWs } from './helpers.mjs';
before(setupGame); after(teardownGame);
const p = { characterId: 1, guildId: null, hp: 100, maxHp: 100 };
test('guildless hints do not pick a guild or force combat', () => {
  assert.deepEqual(journeyHint(p).commands, ['dir list guilds', 'help join']);
  assert.equal(journeyHint(null), null);
});
test('combat and recovery take priority over progression', () => {
  assert.equal(journeyHint({ ...p, inCombat: true }).commands[0], 'assess');
  assert.equal(journeyHint({ ...p, hp: 20 }).commands[0], 'health');
});
test('rank gaps and completion come from reported requirements, not learning blips', () => {
  const req = { circle: 2, rows: [{ label: 'Trading', have: 2, need: 5 }] };
  assert.match(journeyHint({ ...p, guildId: 'trader' }, req).text, /3 more ranks/);
  req.rows[0].have = 5;
  assert.match(journeyHint({ ...p, guildId: 'trader' }, req).text, /requirements for circle 2 are met/);
});
test('prompt publishes an additive state-derived journey snapshot', async () => {
  const a = await auth.registerAccount('journeyaudit', 'audit-password');
  const id = createCharacter(a.accountId, { name: 'Journeyaudit', race: 'human' });
  const player = loadPlayer(id); player.ws = fakeWs();
  game.status(player);
  const prompt = player.ws.msgs.find(m => m.t === 'prompt');
  assert.equal(prompt.journey.characterId, id);
  assert.equal(prompt.journey.guildId, null);
  assert.equal(journeyHint(prompt.journey, prompt.requirements).commands[0], 'dir list guilds');
});
