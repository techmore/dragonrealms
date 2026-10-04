import test from 'node:test';
import assert from 'node:assert/strict';
import { registerRuntimeCleanup, disposeRuntimeResources } from '../server/runtime-resources.js';

test('runtime cleanup is isolated, unregisterable and idempotent', () => {
  const a = {};
  const b = {};
  const calls = [];
  registerRuntimeCleanup(a, () => calls.push('a'));
  registerRuntimeCleanup(b, () => calls.push('b'));
  const unregister = registerRuntimeCleanup(a, () => calls.push('cancelled'));
  unregister();
  disposeRuntimeResources(a);
  disposeRuntimeResources(a);
  assert.deepEqual(calls, ['a']);
  disposeRuntimeResources(b);
  assert.deepEqual(calls, ['a', 'b']);
});

test('a failing cleanup cannot prevent other resources from stopping', (t) => {
  const owner = {};
  let stopped = false;
  t.mock.method(console, 'error', () => {});
  registerRuntimeCleanup(owner, () => { throw new Error('injected failure'); });
  registerRuntimeCleanup(owner, () => { stopped = true; });
  assert.doesNotThrow(() => disposeRuntimeResources(owner));
  assert.equal(stopped, true);
});
