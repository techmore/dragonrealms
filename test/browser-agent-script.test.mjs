import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentScript } from '../public/js/admin/agent-script.js';

test('browser agent executes nested starter scripts and advances on wire prompts', () => {
  const sent = []; let completed = 0;
  const script = createAgentScript({ send: line => sent.push(line), onDone: () => completed++ });
  script.setLibrary({ mega: 'putrun hunt\nput say finished\nexit', hunt: 'put look\nwait\nexit' });
  assert.equal(script.start('mega'), true);
  assert.deepEqual(sent, ['look']);
  assert.equal(script.running, true);
  script.feed({ t: 'prompt', msg: 'HP: 100/100 Mana: 30/30 Stamina: 50/50 RT: 0 Circle 1' });
  assert.deepEqual(sent, ['look', 'say finished']);
  assert.equal(script.running, false);
  assert.equal(completed, 1);
});

test('stopping a waiting agent prevents later wire messages and timer ticks from sending commands', () => {
  const sent = [];
  const script = createAgentScript({ send: line => sent.push(line) });
  script.setLibrary({ hunt: 'waitfor ready\nput attack rat\nexit' });
  script.start('hunt');
  script.stop();
  script.feed({ t: 'msg', msg: 'ready' });
  script.tick();
  assert.equal(script.running, false);
  assert.deepEqual(sent, []);
});

test('missing or removed starter scripts never claim to be running', () => {
  const script = createAgentScript({});
  assert.equal(script.start('missing'), false);
  script.setLibrary({ old: 'waitfor never' });
  assert.equal(script.start('old'), true);
  script.setLibrary({ new: 'waitfor later' });
  assert.equal(script.start('old'), false);
  assert.equal(script.running, false);
});

test('browser agents have independent script libraries and runners', () => {
  const sent = [];
  const first = createAgentScript({ send: line => sent.push(line) });
  const second = createAgentScript({ send: line => sent.push(line) });
  first.setLibrary({ own: 'put look\nexit' });
  assert.equal(second.start('own'), false);
  assert.equal(first.start('own'), true);
  assert.deepEqual(sent, ['look']);
});
