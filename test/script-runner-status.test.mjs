import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRunner } from '../public/js/script-engine.js';
import { scriptDiagnosticText } from '../public/js/script-status.js';

function harness() {
  let heartbeat, pauseListener, paused = false;
  const output = [], sent = [];
  const context = vm.createContext({ createRunner, scriptDiagnosticText, terminal: { append: (...args) => output.push(args) },
    gameState: { value: 'playing', spectating: false }, send: message => { sent.push(message); return true; },
    isAutomationPaused: () => paused, onAutomationPause: listener => { pauseListener = listener; },
    setInterval: callback => { heartbeat = callback; }, setTimeout, clearTimeout, $: () => null,
    localStorage: { getItem: () => null }, console });
  const source = readFileSync(new URL('../public/js/scripts.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  vm.runInContext(source, context);
  return { context, output, sent, heartbeat: () => heartbeat(), pause: value => { paused = value; pauseListener(value); } };
}
test('fatal errors clear the active registry and persist their source details until an explicit new run', () => {
  const h = harness();
  h.context.mergeServerScripts({ broken: '# header\nwaitforre [', good: 'pause 30' });
  h.context.runScript('broken');
  assert.equal(h.context.isScriptRunning(), false);
  assert.equal(h.context.scriptStatus().phase, 'error');
  assert.equal(h.context.scriptStatus().diagnostic.line, 2);
  h.heartbeat();
  assert.equal(h.context.scriptStatus().phase, 'error');
  h.context.runScript('good');
  assert.equal(h.context.scriptStatus().phase, 'waiting');
  assert.equal(h.context.scriptStatus().diagnostic, null);
  h.context.stopScript();
  assert.equal(h.context.scriptStatus().phase, 'stopped');
  assert.equal(h.sent.length, 0);
});
test('a runtime failure resumed by the heartbeat releases the active registry', t => {
  let now = 1000; t.mock.method(Date, 'now', () => now);
  const h = harness(); h.context.mergeServerScripts({ delayed: 'pause 1\nmatchre end [\nput attack' });
  h.context.runScript('delayed');
  assert.equal(h.context.isScriptRunning(), true);
  now = 2100;
  assert.doesNotThrow(() => h.heartbeat());
  assert.equal(h.context.isScriptRunning(), false);
  assert.equal(h.context.scriptStatus().phase, 'error');
  assert.equal(h.context.scriptStatus().diagnostic.line, 2);
  assert.equal(h.sent.length, 0);
});
test('automation pause stops scripts and resuming does not replay or restart them', () => {
  const h = harness(); h.context.mergeServerScripts({ waiting: 'put look\npause 30\nput attack' });
  h.context.runScript('waiting'); h.pause(true);
  assert.equal(h.context.isScriptRunning(), false);
  assert.equal(h.context.scriptStatus().phase, 'stopped');
  h.pause(false); h.heartbeat();
  assert.equal(h.context.isScriptRunning(), false);
  assert.deepEqual(h.sent.map(message => message.line), ['look']);
});
test('nonfatal source warnings retain continuation and completed status', () => {
  const h = harness(); h.context.mergeServerScripts({ warning: 'putrun missing\ngoto missing\nput look' });
  h.context.runScript('warning');
  assert.equal(h.context.scriptStatus().phase, 'completed');
  assert.equal(h.context.scriptStatus().diagnostic.severity, 'warning');
  assert.equal(h.context.scriptStatus().diagnostic.line, 2);
  assert.deepEqual(h.sent.map(message => message.line), ['look']);
});
