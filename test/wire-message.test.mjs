import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isServerMessage } from '../public/js/wire-message.js';
test('server-message boundary rejects malformed discriminators and known payloads', () => {
  for (const value of [null, [], 'text', {}, { t: 1 }, { t: 'prompt', msg: {} },
    { t: 'room', msg: 'room', exits: [1] }, { t: 'prompt', msg: 'ok', requirements: [] },
    { t: 'prompt', msg: 'ok', journey: { characterId: 1, guildId: [] } },
    { t: 'prompt', msg: 'ok', requirements: { rows: [null] } },
    { t: 'prompt', msg: 'ok', requirements: { rows: [{ have: '5', need: 6 }] } }]) assert.equal(isServerMessage(value), false);
});
test('legacy messages and additive protocol extensions remain accepted', () => {
  for (const value of [{ t: 'prompt', msg: 'HP: 100/100' }, { t: 'room', msg: '[[Temple]]', exits: ['n'] },
    { t: 'charcreate', races: [] }, { t: 'new-extension', data: { x: 1 } },
    { t: 'prompt', msg: 'ok', journey: { characterId: 1, guildId: null }, requirements: { rows: [] } }]) assert.equal(isServerMessage(value), true);
});
