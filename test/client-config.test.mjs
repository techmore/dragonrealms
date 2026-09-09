import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig, restoreConfig } from '../public/js/config.js';

test('legacy and versioned configuration preserve gags and supported settings', () => {
  const config = { dr_settings: { theme: 'green', channels: { combat: false }, colors: {}, statusstrip: null }, dr_gags_v1: [{ id: 'g1', pattern: 'noise' }] };
  assert.deepEqual(parseConfig(JSON.stringify(config)), config);
  assert.deepEqual(parseConfig(JSON.stringify({ version: 1, config })), config);
});

test('malformed shapes and unsupported versions fail before storage writes', () => {
  for (const config of [
    null, [], { dr_settings: { channels: null } }, { dr_windows_v1: { hidden: null } },
    { dr_triggers: {} }, { dr_scripts_v1: { '<img>': 'exit' } },
    { dr_highlights_v1: [{ id: 'h', pattern: 'x', color: 'red);bad', bold: true }] },
    { version: 2, config: { dr_macros: {} } },
  ]) assert.throws(() => parseConfig(JSON.stringify(config)));
  assert.throws(() => parseConfig('{"dr_macros":{"__proto__":"x"}}'));
});

test('storage failure restores the complete prior configuration', () => {
  const values = new Map([['dr_macros', '{"old":"look"}'], ['dr_settings', '{"theme":"dark"}']]);
  const original = new Map(values);
  let failed = false;
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem(key, value) {
      if (key === 'dr_settings' && !failed) { failed = true; throw new Error('quota'); }
      values.set(key, value);
    },
  };
  assert.throws(() => restoreConfig(storage, { dr_macros: { new: 'north' }, dr_settings: { theme: 'green' } }), /quota/);
  assert.deepEqual(values, original);
});
