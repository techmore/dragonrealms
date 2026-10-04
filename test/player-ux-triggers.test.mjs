import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { repairTriggerIds } from '../public/js/trigger-ids.js';

test('repair reserves valid IDs, keeps all trigger data, and is stable on repeated reload', () => {
  const entries = [1, 1, undefined, 2, '2', -3, Number.MAX_SAFE_INTEGER]
    .map((id, i) => ({ id, pattern: `pattern${i}`, command: `command${i}`, extra: i }));
  const data = entries.map(({ id, ...rest }) => rest);
  const next = repairTriggerIds(entries);
  assert.equal(new Set(entries.map((t) => t.id)).size, entries.length);
  assert.equal(entries[0].id, 1);
  assert.equal(entries[3].id, 2);
  assert.equal(entries[6].id, Number.MAX_SAFE_INTEGER);
  assert.deepEqual(entries.map(({ id, ...rest }) => rest), data);
  const reloaded = JSON.parse(JSON.stringify(entries));
  assert.equal(repairTriggerIds(reloaded), next);
  assert.deepEqual(reloaded, entries);
  assert.equal(entries.some((t) => t.id === next), false);
});

test('automation reload, import/save, addition and removal keep unique persisted identities', () => {
  let stored = JSON.stringify([{ id: 1, pattern: 'a', command: 'look' }, { id: 1, pattern: 'b', command: 'rest' }]);
  const element = { addEventListener() {} };
  const context = vm.createContext({ $: () => element, settings: {}, append() {}, gameState: {}, repairTriggerIds, isAutomationPaused: () => false,
    localStorage: { getItem: (key) => key === 'dr_triggers' ? stored : null,
      setItem: (key, value) => { if (key === 'dr_triggers') stored = value; } } });
  vm.runInContext(readFileSync(new URL('../public/js/automation.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/export /g, ''), context);
  assert.equal(new Set(JSON.parse(stored).map((t) => t.id)).size, 2);
  vm.runInContext("triggers.push({id: 1, pattern: 'import', command: 'hunt'}); saveTriggers(); handleAutomation('trigger c attack')", context);
  const saved = JSON.parse(stored);
  assert.equal(saved.length, 4);
  assert.equal(new Set(saved.map((t) => t.id)).size, 4);
  context.removeScript(`trigger:${saved[2].id}`);
  assert.deepEqual(JSON.parse(stored), saved.filter((t) => t.id !== saved[2].id));
});

test('pause suppresses automatic timers and triggers while manual macros still dispatch', () => {
  let paused = true, tick;
  const sent = [], buttons = [];
  const element = { hidden: false, textContent: '', innerHTML: '',
    classList: { contains: () => false, remove() {} }, addEventListener() {},
    appendChild(button) { buttons.push(button); } };
  const context = vm.createContext({ $: () => element, settings: { macrobar: true }, append() {},
    gameState: { value: 'playing' }, repairTriggerIds, isAutomationPaused: () => paused,
    setInterval(fn) { tick = fn; return 1; },
    document: { createElement: () => ({ addEventListener(event, fn) { this[event] = fn; } }) },
    localStorage: { getItem: () => null, setItem() {} } });
  vm.runInContext(readFileSync(new URL('../public/js/automation.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/export /g, ''), context);
  context.setRunner((line) => sent.push(line));
  context.handleAutomation('trigger noise look');
  context.handleAutomation('timer 2 rest');
  context.handleAutomation('macro scout hunt');
  context.runTriggers('noise');
  tick();
  assert.deepEqual(sent, []);
  buttons[0].click();
  assert.deepEqual(sent, ['hunt']);
  paused = false;
  context.runTriggers('noise');
  tick();
  assert.deepEqual(sent, ['hunt', 'look', 'rest']);
});
