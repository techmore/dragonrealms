import test from 'node:test';
import assert from 'node:assert/strict';
import { AG_RACES, AG_GUILDS, validateAgentConfig } from '../public/js/admin/agent-config.js';
import { RACES } from '../data/races.js';
import { GUILDS } from '../data/guilds.js';
const base = { name: 'Probe', race: 'human', guild: 'barbarian' };

test('browser simulator choices exactly match current authored races and guilds', () => {
  assert.deepEqual([...AG_RACES].sort(), Object.keys(RACES).sort());
  assert.deepEqual([...AG_GUILDS].sort(), Object.keys(GUILDS).sort());
});
test('launch settings reject invalid, unbounded and silently coercible input', () => {
  for (const field of ['minutes','circleTarget','boost','fleePct','tickMs']) {
    for (const value of [Infinity, NaN, '', null, true, 'nope', -1]) {
      assert.throws(() => validateAgentConfig({ ...base, [field]: value }), new RegExp(field));
    }
  }
  for (const change of [{ minutes: 721 }, { circleTarget: 21 }, { circleTarget: 2.5 }, { boost: 101 }, { fleePct: 1 }, { tickMs: 499 }, { tickMs: 10001 }, { name: 'Bad name!' }, { race: 'giantman' }, { guild: 'warrior mage' }]) {
    assert.throws(() => validateAgentConfig({ ...base, ...change }));
  }
});
test('valid defaults and explicit boundary values are preserved', () => {
  assert.deepEqual(validateAgentConfig(base), { ...base, minutes: 10, circleTarget: 2, boost: 0, fleePct: 0.35, tickMs: 1500 });
  assert.deepEqual(validateAgentConfig({ ...base, minutes: '720', circleTarget: '20', boost: '100', fleePct: '0.95', tickMs: '10000' }), { ...base, minutes: 720, circleTarget: 20, boost: 100, fleePct: 0.95, tickMs: 10000 });
});
