import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { journeyHint } from '../public/js/journey-hints.js';
import { GUILDS } from '../data/guilds.js';
import { setupGame, teardownGame, game, auth, createCharacter, loadPlayer, fakeWs } from './helpers.mjs';
before(setupGame); after(teardownGame);
const p = { characterId: 1, guildId: null, hp: 100, maxHp: 100 };
test('guildless hints do not pick a guild or force combat', () => {
  assert.deepEqual(journeyHint(p).commands, ['dir list guilds', 'help join']);
  assert.equal(journeyHint(null), null);
});
test('combat and recovery take priority over progression', () => {
  assert.equal(journeyHint({ ...p, inCombat: true }).commands[0], 'assess');
  assert.deepEqual(journeyHint({ ...p, hp: 20 }).commands, ['health', 'dir temple']);
});
test('rank gaps and completion come from reported requirements, not learning blips', () => {
  const req = { circle: 2, rows: [{ label: 'Trading', have: 2, need: 5 }] };
  assert.match(journeyHint({ ...p, guildId: 'trader' }, req).text, /3 more ranks/);
  req.rows[0].have = 5;
  assert.match(journeyHint({ ...p, guildId: 'trader' }, req).text, /requirements for circle 2 are met/);
});
test('progress actions expose practice choices for gaps and completed requirements', () => {
  const player = { ...p, guildId: 'trader' };
  assert.deepEqual(journeyHint(player, { circle: 2, rows: [{ label: 'Trading', have: 2, need: 5 }] }).commands,
    ['progress', 'inventory', 'dir trader']);
  assert.deepEqual(journeyHint(player, { circle: 2, rows: [{ label: 'Trading', have: 5, need: 5 }] }).commands,
    ['dir trader', 'progress']);
});
test('guild hall directions use the bounded server destination in either city', () => {
  const player = { ...p, guildId: 'trader', guildDirections: 'dir guilds' };
  const req = { circle: 2, rows: [{ label: 'Trading', have: 5, need: 5 }] };
  assert.deepEqual(journeyHint(player, req).commands, ['dir guilds', 'progress']);
  assert.equal(journeyHint(player, { circle: 2, rows: [{ label: 'Trading', have: 2, need: 5 }] }).commands[2], 'dir guilds');
  assert.equal(journeyHint({ ...player, guildDirections: 'dir trader' }, req).commands[0], 'dir trader');
  for (const guildDirections of ['dir guilds; quit', 'dir guilds extra', 'quit', null, 'dir ../']) {
    assert.equal(journeyHint({ ...player, guildDirections }, req).commands[0], 'dir trader');
  }
});
test('Paladin advancement checks the soul gate without claiming readiness from ranks alone', () => {
  const player = { ...p, guildId: 'paladin' };
  const req = { circle: 2, rows: [{ label: 'Conviction', have: 5, need: 5 }] };
  const blocked = journeyHint({ ...player, soul: 19 }, req);
  assert.match(blocked.text, /soul is too dim/);
  assert.deepEqual(blocked.commands, ['progress', 'dir temple']);
  assert.match(journeyHint({ ...player, soul: 20 }, req).text, /requirements for circle 2 are met/);
  for (const soul of [undefined, null, NaN, Infinity]) {
    const unknown = journeyHint({ ...player, soul }, req);
    assert.match(unknown.text, /verify your soul/);
    assert.equal(unknown.commands[0], 'progress');
    assert.doesNotMatch(unknown.text, /ask to circle/);
  }
  assert.equal(journeyHint({ ...player, soul: 0, inCombat: true }, req).commands[0], 'assess');
  assert.equal(journeyHint({ ...player, soul: 0, hp: 20 }, req).commands[0], 'health');
});
test('incomplete or malformed requirement snapshots cannot imply completion', () => {
  const player = { ...p, guildId: 'trader' };
  const met = { label: 'Trading', have: 5, need: 5 };
  for (const req of [undefined, { circle: 2, rows: [] }, { circle: 2, rows: [met, null] },
    { circle: 2, rows: [met, { have: NaN, need: 1 }] }, { rows: [met] },
    { circle: 2, rows: [met, { have: -1, need: 1 }] }]) {
    const hint = journeyHint(player, req);
    assert.doesNotMatch(hint.text, /requirements for circle.*are met/);
    assert.equal(hint.commands[0], 'progress');
  }
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
  assert.equal(prompt.journey.soul, undefined);
  player.guild = GUILDS.paladin;
  player.soul = 19;
  player.ws.msgs.length = 0;
  game.status(player);
  const paladinPrompt = player.ws.msgs.find(m => m.t === 'prompt');
  assert.equal(paladinPrompt.journey.guildId, 'paladin');
  assert.equal(paladinPrompt.journey.soul, 19);
});
