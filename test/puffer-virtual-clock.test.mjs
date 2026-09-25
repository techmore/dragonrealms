import { test } from 'node:test';
import assert from 'node:assert/strict';
import { virtualClock } from '../puffer_adapter/virtual_clock.mjs';

// Keep these synchronous: the clock replaces globals also used by async test
// infrastructure. Always restore them before returning to the test runner.
test('virtual clock executes ordered callbacks, cancellation and nested timers', () => {
  const originals = { now: Date.now, setTimeout, clearTimeout, setInterval, clearInterval };
  const clock = virtualClock();
  try {
    const start = Date.now(), events = [];
    const canceled = setTimeout(() => assert.fail('canceled timer fired'), 5);
    clearTimeout(canceled);
    let count = 0;
    const interval = setInterval(label => {
      events.push([label, Date.now() - start]);
      if (++count === 3) clearInterval(interval);
    }, 10, 'interval');
    assert.equal(interval.unref(), interval);
    assert.equal(interval.ref(), interval);
    setTimeout(label => {
      events.push([label, Date.now() - start]);
      setTimeout(() => events.push(['nested', Date.now() - start]), 2);
    }, 15, 'timeout');
    setTimeout(() => events.push(['same-time', Date.now() - start]), 15);
    clock.advance(9);
    assert.deepEqual(events, []);
    clock.advance(31);
    assert.deepEqual(events, [
      ['interval', 10], ['timeout', 15], ['same-time', 15],
      ['nested', 17], ['interval', 20], ['interval', 30],
    ]);
    assert.equal(Date.now(), start + 40);
  } finally { clock.close(); }
  assert.equal(Date.now, originals.now);
  for (const key of ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval']) assert.equal(globalThis[key], originals[key]);
});

test('virtual clock reset removes old world timers and resets its epoch', () => {
  const clock = virtualClock();
  try {
    const start = Date.now();
    let oldCalls = 0, newCalls = 0;
    setInterval(() => oldCalls++, 10);
    setTimeout(() => oldCalls++, 100);
    clock.advance(15);
    assert.equal(oldCalls, 1);
    clock.reset();
    assert.equal(Date.now(), start);
    setTimeout(() => newCalls++, 20);
    clock.advance(200);
    assert.equal(oldCalls, 1, 'previous episode callbacks must never run after reset');
    assert.equal(newCalls, 1);
  } finally { clock.close(); }
});
