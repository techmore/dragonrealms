import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunner } from '../public/js/script-engine.js';

test('nested pending put honors a same-count real RT renewal after the earlier deadline', t => {
  let now = 100000; t.mock.method(Date, 'now', () => now);
  const sent = [];
  const runner = createRunner('put attack rat\nwait\nputrun signature\nput look\nexit', [], {
    send: line => sent.push({ at: now, line }),
    getScript: name => name === 'signature' ? 'put roar everilds_rage\nwait\nexit' : null,
  }).start();
  runner.feed('HP: 50/50 RT: 3 Circle 1', true);
  assert.equal(runner.state.pendingRtLine, 'roar everilds_rage');
  now = 103200; runner.feed('HP: 50/50 RT: 3 Circle 1', true);
  now = 103300; runner.feed('');
  assert.deepEqual(sent, [{ at: 100000, line: 'attack rat' }]);
  assert.equal(runner.state.rtUntil, 3050);
  assert.equal(runner.state.depth, 1);
  now = 106449; runner.feed(''); assert.equal(sent.length, 1);
  now = 106450; runner.feed('');
  assert.deepEqual(sent, [{ at: 100000, line: 'attack rat' }, { at: 106450, line: 'roar everilds_rage' }]);
  runner.feed('HP: 50/50 RT: 0 Circle 1', true);
  assert.deepEqual(sent.map(entry => entry.line), ['attack rat', 'roar everilds_rage', 'look']);
  runner.feed(''); assert.equal(sent.length, 3); assert.equal(runner.running, false);
});

test('a refused retry honors renewed RT and synthetic zero mirrors cannot release it', t => {
  let now = 100000; t.mock.method(Date, 'now', () => now);
  const sent = [];
  const runner = createRunner('put forage\nwait\nput look\nexit', [], { send: line => sent.push({ at: now, line }) }).start();
  runner.feed('You must wait 3 seconds before you can do that.', 'error');
  now = 101000; runner.feed('HP: 50/50 RT: 5 Circle 1', true);
  now = 103300; runner.feed(''); assert.equal(sent.length, 1);
  now = 103400; runner.feed('HP: 50/50 RT: 0 Circle 1', 'inject');
  assert.equal(runner.state.rtUntil, 2750);
  now = 103500; runner.feed('HP: 50/50 RT: 0 Circle 1', true);
  assert.equal(runner.state.rtUntil, 2650);
  now = 106149; runner.feed(''); assert.equal(sent.length, 1);
  now = 106150; runner.feed('');
  assert.deepEqual(sent, [{ at: 100000, line: 'forage' }, { at: 106150, line: 'forage' }]);
  runner.feed('HP: 50/50 RT: 0 Circle 1', true);
  assert.deepEqual(sent.map(entry => entry.line), ['forage', 'forage', 'look']);
  assert.equal(runner.running, false);
});

test('inject mirrors do not renew a pending send deadline', t => {
  let now = 100000; t.mock.method(Date, 'now', () => now);
  const sent = [];
  const runner = createRunner('put attack rat\nwait\nput roar\nwait\nexit', [], { send: line => sent.push(line) }).start();
  runner.feed('HP: 50/50 RT: 3 Circle 1', true);
  now = 103200; runner.feed('HP: 50/50 RT: 3 Circle 1', 'inject');
  assert.equal(runner.state.rtUntil, 0);
  now = 103250; runner.feed(''); assert.deepEqual(sent, ['attack rat', 'roar']);
});

test('ordinary pause stays independent of renewed RT', t => {
  let now = 100000; t.mock.method(Date, 'now', () => now);
  const echoed = [];
  const runner = createRunner('pause 1\necho resumed\nexit', [], { say: text => echoed.push(text) }).start();
  now = 100500; runner.feed('HP: 50/50 RT: 5 Circle 1', true);
  now = 101000; runner.feed('');
  assert.deepEqual(echoed, ['resumed']); assert.equal(runner.running, false);
});

test('matched branch and cancellation discard superseded renewed-RT sends', async t => {
  for (const cancel of [false, true]) await t.test(cancel ? 'stop' : 'match', t => {
    let now = 100000; t.mock.method(Date, 'now', () => now);
    const sent = [];
    const runner = createRunner('put attack rat\nmatch done Victory!\nwait\nput roar\nwait\nexit\ndone:\npause 1\nput look\nexit', [], { send: line => sent.push(line) }).start();
    runner.feed('HP: 50/50 RT: 3 Circle 1', true);
    now = 103200; runner.feed('HP: 50/50 RT: 3 Circle 1', true);
    if (cancel) runner.stop(); else runner.feed('Victory!', 'msg');
    now = 110000; runner.feed('');
    assert.deepEqual(sent, cancel ? ['attack rat'] : ['attack rat', 'look']);
    assert.equal(runner.running, false);
  });
});
