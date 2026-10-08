import test from 'node:test';
import assert from 'node:assert/strict';
import { questView } from '../public/js/quest-view.js';

const task = { kind: 'kill', source: 'crier', done: false, desc: 'Slay goblins.', objective: 'Defeat the assigned goblins.' };
test('known quest counters expose accessible progress without implying completion', () => {
  const view = questView({ ...task, counter: { current: 2, total: 5, remaining: 3, unit: 'kills' } });
  assert.deepEqual(view.progress, { current: 2, total: 5 });
  assert.equal(view.counterText, '2/5 kills · 3 remaining');
  assert.equal(view.complete, false);
  const full = questView({ ...task, counter: { current: 5, total: 5, remaining: 0, unit: 'kills' }, state: 'complete' });
  assert.equal(full.complete, false, 'server DONE is authoritative even when counters are full');
  assert.match(questView({ ...task, done: true }).next, /Reward unclaimed/);
});
test('legacy quests preserve prose and honestly display unknown total counters', () => {
  assert.equal(questView(task).objective, task.objective);
  const legacy = questView({ kind: 'kill', source: 'leader', done: false, desc: 'Three kills remain.' });
  assert.equal(legacy.objective, 'Three kills remain.');
  assert.equal(legacy.progress, null);
  assert.match(legacy.counterText, /unavailable/);
  assert.equal(legacy.source, 'Guild task');
  const remainingOnly = questView({ ...task, counter: { current: null, total: null, remaining: 3, unit: 'kills' } });
  assert.equal(remainingOnly.progress, null);
  assert.equal(remainingOnly.counterText, '3 kills remaining · original total unknown');
  const totalOnly = questView({ ...task, counter: { current: null, total: 5, remaining: 3, unit: 'kills' } });
  assert.match(totalOnly.counterText, /total 5/);
  assert.doesNotMatch(totalOnly.counterText, /unknown/);
});
test('delivery and recovery carry passive objective and destination state', () => {
  const delivery = questView({ kind: 'deliver', done: false, desc: 'Carry a parcel.', destination: {
    parcel: 'Small parcel', recipient: 'The baker', name: 'Bakery', atDestination: true,
  } });
  assert.equal(delivery.destinationText, 'Small parcel · The baker · Bakery');
  assert.equal(delivery.atDestination, true);
  assert.match(delivery.next, /Hand over the parcel when ready/);
  const recovery = questView({ kind: 'recover', source: 'leader', done: true,
    counter: { current: 1, total: 1, remaining: 0, unit: 'trinkets' } });
  assert.deepEqual(recovery.progress, { current: 1, total: 1 });
  assert.match(recovery.next, /your guild leader/);
});
test('malformed snapshots and invalid numbers never fabricate progress or ready claims', () => {
  for (const malformed of [false, 'bad', [], {}, { counter: {} }]) assert.equal(questView(malformed).unavailable, true);
  for (const current of [NaN, Infinity, -1, '2', 1.5, 999]) {
    const view = questView({ ...task, done: 'true', counter: { current, total: 5 } });
    assert.equal(view.progress, null);
    assert.equal(view.complete, false);
  }
  assert.equal(questView({ ...task, counter: { current: 0, total: 0 } }).progress, null);
  assert.equal(questView(null), null);
});
test('inconsistent remaining counters cannot produce a fraction or native progress', () => {
  for (const [current, total, remaining] of [[5, 5, 3], [2, 5, 1], [0, 5, 0]]) {
    const view = questView({ ...task, counter: { current, total, remaining, unit: 'kills' } });
    assert.equal(view.progress, null);
    assert.match(view.counterText, /inconsistent/);
    assert.doesNotMatch(view.counterText, /\d+\/\d+/);
    assert.equal(view.complete, false);
  }
});
test('snapshot text remains literal for safe DOM textContent rendering', () => {
  const unsafe = '<img src=x onerror="alert(1)">';
  const view = questView({ ...task, objective: unsafe, returnTo: unsafe, destination: { name: unsafe } });
  assert.equal(view.objective, unsafe);
  assert.equal(view.destinationText, unsafe);
  assert.match(view.next, /<img/);
});
