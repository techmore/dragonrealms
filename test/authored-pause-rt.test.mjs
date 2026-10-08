import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunner } from '../public/js/script-engine.js';

test('unrelated RT refusal never replaces an authored pause or replays its accepted predecessor', t => {
  let now = 100000; t.mock.method(Date, 'now', () => now);
  const sent = [];
  const runner = createRunner('put forage\npause 10\nput analyze\nwait\nexit', [], { send: line => sent.push({ at: now, line }) }).start();
  runner.feed('You gather a sprig.', 'msg');
  now = 100100; runner.feed('You must wait 2 seconds before you can do that.', 'error');
  assert.equal(runner.state.rtUntil, 2150);
  assert.equal(runner.state.timerRemainingMs, 9900);
  assert.equal(runner.state.retryLine, null);
  now = 102300; runner.feed(''); assert.deepEqual(sent, [{ at: 100000, line: 'forage' }]);
  now = 109999; runner.feed(''); assert.equal(sent.length, 1);
  now = 110000; runner.feed('');
  assert.deepEqual(sent, [{ at: 100000, line: 'forage' }, { at: 110000, line: 'analyze' }]);
  runner.feed('HP: 50/50 RT: 0 Circle 1', true); assert.equal(runner.running, false);
});

test('nested putrun retains its authored pause and returns to its caller exactly once', t => {
  let now = 100000; t.mock.method(Date, 'now', () => now);
  const sent = [];
  const runner = createRunner('putrun child\nput inventory\nexit', [], {
    getScript: () => 'put look\npause 10\nput analyze\nwait\nexit',
    send: line => sent.push({ at: now, line }),
  }).start();
  runner.feed('Room description', 'room');
  now = 100500; runner.feed('You must wait 2 seconds before you can do that.', 'msg');
  now = 102800; runner.feed(''); assert.deepEqual(sent.map(entry => entry.line), ['look']);
  assert.equal(runner.state.depth, 1);
  now = 110000; runner.feed('');
  assert.deepEqual(sent, [{ at: 100000, line: 'look' }, { at: 110000, line: 'analyze' }]);
  runner.feed('HP: 50/50 RT: 0 Circle 1', 'prompt');
  assert.deepEqual(sent.map(entry => entry.line), ['look', 'analyze', 'inventory']);
  runner.feed(''); assert.equal(sent.length, 3); assert.equal(runner.running, false);
});

test('an already-owned retry still respects a later refusal deadline while parked in timer mode', t => {
  let now = 100000; t.mock.method(Date, 'now', () => now);
  const sent = [];
  const runner = createRunner('put forage\nwait\nput look\nexit', [], { send: line => sent.push({ at: now, line }) }).start();
  runner.feed('You must wait 2 seconds before you can do that.', 'error');
  now = 101000; runner.feed('You must wait 5 seconds before you can do that.', 'error');
  assert.equal(runner.state.retryLine, 'forage');
  now = 102300; runner.feed(''); assert.equal(sent.length, 1);
  now = 106150; runner.feed('');
  assert.deepEqual(sent, [{ at: 100000, line: 'forage' }, { at: 106150, line: 'forage' }]);
  runner.feed('HP: 50/50 RT: 0 Circle 1', true);
  assert.deepEqual(sent.map(entry => entry.line), ['forage', 'forage', 'look']);
});
