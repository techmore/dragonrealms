import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRunner } from '../public/js/script-engine.js';

const prompt = 'HP: 145/145 Mana: 90/90 RT: 0 Circle 1 150 silvers [COMBAT]';
for (const type of ['msg', 'combat', 'room', 'error']) {
  test(`typed ${type} cannot consume a prompt wait after native attack prose`, () => {
    const sent = [];
    const runner = createRunner('put attack rat\nwait\nput exp\nwait\nexit', [], { send: line => sent.push(line) }).start();
    runner.feed('You engage a sewer rat.', type);
    assert.deepEqual(sent, ['attack rat']);
    assert.equal(runner.state.mode, 'prompt');
    runner.feed(prompt, 'prompt');
    assert.deepEqual(sent, ['attack rat', 'exp']);
  });
}

for (const type of [true, 'prompt']) {
  test(`actual ${String(type)} prompt owns wait release`, () => {
    const sent = [];
    const runner = createRunner('put attack rat\nwait\nput look\nwait\nexit', [], { send: line => sent.push(line) }).start();
    runner.feed(prompt, type);
    assert.deepEqual(sent, ['attack rat', 'look']);
    assert.equal(runner.state.mode, 'prompt');
    runner.feed(prompt, type);
    assert.equal(runner.running, false);
  });
}

test('inject mirrors variables but cannot release wait or arm roundtime', () => {
  const sent = [];
  const runner = createRunner('wait\nput exp\nwait\nexit', [], { send: line => sent.push(line) }).start();
  runner.feed('HP: 88/145 Mana: 12/90 RT: 7 Circle 2 30 silvers [COMBAT]', 'inject');
  assert.equal(runner.getVar('hp'), '88');
  assert.equal(runner.getVar('mana'), '12');
  assert.equal(runner.getVar('circle'), '2');
  assert.equal(runner.getVar('combat'), '1');
  assert.equal(runner.getVar('rt'), '7');
  assert.equal(runner.state.rtUntil, 0);
  assert.equal(runner.state.mode, 'prompt');
  assert.deepEqual(sent, []);
  runner.feed(prompt, true);
  assert.deepEqual(sent, ['exp']);
});

test('nonprompt success prose cannot clear native vitals or combat state', () => {
  const runner = createRunner('waitfor FINISH\nexit').start();
  runner.feed(prompt.replace('RT: 0', 'RT: 3') + ' [Raging] [bleeding:slight]', true);
  const deadline = runner.state.rtUntil;
  for (const type of ['msg', 'combat', 'room', 'error']) {
    runner.feed('You cast Fire Shard! HP: 1/1 RT: 0 Circle 99', type);
    assert.equal(runner.getVar('hp'), '145');
    assert.equal(runner.getVar('circle'), '1');
    assert.equal(runner.getVar('combat'), '1');
    assert.equal(runner.getVar('rage'), '1');
    assert.equal(runner.getVar('bleed'), '1');
    assert.ok(runner.state.rtUntil > 0);
  }
  runner.feed('HP: 120/145 RT: 0 Circle 1 [COMBAT]', 'inject');
  assert.ok(runner.state.rtUntil > 0 && runner.state.rtUntil <= deadline, 'stale inject zero must not erase a real RT gate');
});

test('typed room releases only movement after observed room change', () => {
  let room = 'sewers_1'; const sent = [];
  const runner = createRunner('move n\nput look\nwait\nexit', [], { roomNow: () => room, send: line => sent.push(line) }).start();
  runner.feed('[[Sewer Entrance, Sewers]]', 'room');
  assert.deepEqual(sent, ['n']);
  room = 'sewers_2'; runner.feed('[[Sewer Junction, Sewers]]', 'room');
  assert.deepEqual(sent, ['n', 'look']);
  assert.equal(runner.state.mode, 'prompt');
});

test('nested putrun retains child wait ownership until actual prompt', () => {
  const sent = [];
  const runner = createRunner('putrun child\nput look\nwait\nexit', [], {
    getScript: name => name === 'child' ? 'put attack rat\nwait\nexit' : null,
    send: line => sent.push(line),
  }).start();
  runner.feed('You engage a sewer rat.', 'combat');
  assert.deepEqual(sent, ['attack rat']);
  assert.equal(runner.depth, 2);
  runner.feed(prompt, 'prompt');
  assert.deepEqual(sent, ['attack rat', 'look']);
  assert.equal(runner.depth, 1);
});

test('cancelled script cannot resurrect commands from late typed events', () => {
  const sent = [];
  const runner = createRunner('put attack rat\nwait\nput exp\nwait', [], { send: line => sent.push(line) }).start();
  runner.stop();
  for (const type of ['msg', 'combat', 'room', 'error', 'inject', 'prompt', true]) runner.feed(prompt, type);
  assert.deepEqual(sent, ['attack rat']);
  assert.equal(runner.running, false);
});
