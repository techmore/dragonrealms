// DR-script engine suite: labels, put/move/wait/waitfor/match/matchwait/
// goto/pause/echo/exit, %1..%9 args, %vars, IF_n.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseScript, createRunner } from '../public/js/script-engine.js';

const feed = (r, line, isPrompt = false) => r.feed(line, isPrompt);

test('parseScript collects labels and skips comments', () => {
  const { labels, lines } = parseScript('# hi\nfoo:\n  put look\nbar:\necho x\n');
  assert.deepEqual(labels, { foo: 0, bar: 1 });
  assert.deepEqual(lines, ['put look', 'echo x']);
});

test('echo + put sequence runs to completion', () => {
  const out = [];
  const say = [];
  const r = createRunner('echo hello\nput look\nput attack rat\nexit', [], { send: (l) => out.push(l), say: (t) => say.push(t) });
  r.start();
  assert.deepEqual(out, ['look', 'attack rat']);
  assert.deepEqual(say, ['hello']);
  assert.equal(r.running, false);
});

test('wait blocks until a prompt then continues', () => {
  const out = [];
  const r = createRunner('put look\nwait\nput attack rat', [], { send: (l) => out.push(l) });
  r.start();
  assert.deepEqual(out, ['look'], 'blocked before prompt');
  assert.equal(r.running, true);
  feed(r, 'HP: 100/100', true);
  assert.deepEqual(out, ['look', 'attack rat']);
  assert.equal(r.running, false);
});

test('waitfor resumes on matching text', () => {
  const out = [];
  const r = createRunner('put forage\nwaitfor roundtime\nput skin', [], { send: (l) => out.push(l) });
  r.start();
  assert.deepEqual(out, ['forage']);
  feed(r, 'You find a wild ginseng here.');
  assert.deepEqual(out, ['forage'], 'unrelated text ignored');
  feed(r, 'Roundtime: 5 seconds.');
  assert.deepEqual(out, ['forage', 'skin']);
});

test('match/matchwait jumps to the matched label', () => {
  const out = [];
  const say = [];
  const r = createRunner(
    'putaway:\nmatch putaway ...wait\nmatch done You find\nput forage\nmatchwait\ndone:\necho done\nexit',
    [], { send: (l) => out.push(l), say: (t) => say.push(t) });
  r.start();
  // first attempt: "...wait" roundtime -> retry the putaway label
  feed(r, '...wait');
  assert.equal(out.join(','), 'forage,forage', 'retried via the putaway label');
  // second attempt succeeds -> jump to done
  feed(r, 'You find a bunch of wild herbs.');
  assert.deepEqual(say, ['done']);
  assert.equal(r.running, false);
});

test('%1..%9 run args and %var substitution', () => {
  const out = [];
  const say = [];
  const r = createRunner(
    'echo Targeting %1 with %weapon\nsetvariable weapon sword\nput attack %1\nput wield %weapon\nexit',
    ['goblin'], { send: (l) => out.push(l), say: (t) => say.push(t) });
  r.start();
  assert.deepEqual(say, ['Targeting goblin with %weapon']); // set after echo
  assert.deepEqual(out, ['attack goblin', 'wield sword']);
});

test('if_n runs only when the arg is present', () => {
  const out = [];
  const say = [];
  const r = createRunner('if_1 put look at %1\nif_2 put look at %2\nexit', ['rat'], { send: (l) => out.push(l), say: (t) => say.push(t) });
  r.start();
  assert.deepEqual(out, ['look at rat']);
});

test('move waits for a room, nextroom too', () => {
  const out = [];
  const r = createRunner('move n\nput look\nexit', [], { send: (l) => out.push(l) });
  r.start();
  assert.deepEqual(out, ['n']);
  feed(r, '[[Sewer Entrance, Old Sewers]]\nObvious paths: up, north.', 'room');
  assert.deepEqual(out, ['n', 'look']);
});

test('pause waits the given seconds (timer mode)', () => {
  const out = [];
  const r = createRunner('put look\npause 0.01\nput attack', [], { send: (l) => out.push(l) });
  r.start();
  assert.deepEqual(out, ['look'], 'paused');
  feed(r, '', false); // heartbeat before expiry does nothing
  assert.deepEqual(out, ['look']);
  setTimeout(() => {
    feed(r, '', false); // after expiry resumes
    assert.deepEqual(out, ['look', 'attack']);
  }, 30);
});

test('unknown command echoes an error but keeps going', () => {
  const say = [];
  const r = createRunner('wibble\nput look\nexit', [], { say: (t) => say.push(t) });
  r.start();
  assert.ok(say[0].includes('unknown command'));
});
