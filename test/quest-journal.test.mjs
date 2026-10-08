import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { formatQuestJournal } from '../server/quest-journal.js';
import { setupGame, teardownGame, game, fakeWs, handleCommand } from './helpers.mjs';
import { readPanel, commandContract } from '../server/commands/index.js';
before(setupGame); after(teardownGame);

test('journal reports partial skin progress and both task sources accurately', () => {
  const p = { quest: { kind: 'skin', source: 'crier', count: 5, skinned: 2, done: false } };
  const before = JSON.stringify(p);
  assert.match(formatQuestJournal(p), /Harvested: 2\/5; remaining: 3/);
  assert.equal(JSON.stringify(p), before);
  p.quest = { kind: 'kill', source: 'leader', creatureId: 'rat', count: 0, done: true };
  assert.match(formatQuestJournal(p), /Complete; reward unclaimed/);
  assert.match(formatQuestJournal(p), /your guild leader/);
});

test('delivery and recovery guidance use actual objective state without completing it', () => {
  const p = { room: 'temple', quest: { kind: 'deliver', target: { room: 'temple', name: 'Cora', parcel: 'bandages' } } };
  assert.match(formatQuestJournal(p), /at the destination.*deliver/);
  assert.equal(p.quest.done, undefined);
  p.room = 'square';
  assert.match(formatQuestJournal(p), /Reach the destination/);
  p.quest = { kind: 'recover', creatureId: 'rat', trinket: { name: 'a locket' }, found: false };
  assert.match(formatQuestJournal(p), /not guaranteed on each kill/);
  p.quest.found = true;
  assert.match(formatQuestJournal(p), /trinket has been recovered/);
});

test('journal tolerates missing historical objective data without inventing progress', () => {
  assert.match(formatQuestJournal({}), /no active task/);
  assert.match(formatQuestJournal({ quest: { kind: 'kill' } }), /count unavailable/);
  assert.doesNotThrow(() => formatQuestJournal({ quest: { kind: 'deliver', target: { room: 'missing' } } }));
  assert.match(formatQuestJournal({ quest: { kind: 'unknown' } }), /objective type is unavailable/);
});

test('journal panel and dispatcher never claim a completed quest or mutate player state', () => {
  const p = { quest: { kind: 'kill', source: 'leader', creatureId: 'rat', count: 0, done: true }, silver: 100, aliases: {}, ws: fakeWs() };
  const before = JSON.stringify(p.quest);
  assert.equal(commandContract('journal').panelSafe, true);
  assert.deepEqual(commandContract('journal').mutates, []);
  assert.match(readPanel(game, p, 'journal').lines.join('\n'), /reward unclaimed/);
  const stubGame = { status() {}, questClaim() { throw new Error('must not claim'); }, assignQuest() { throw new Error('must not assign'); } };
  handleCommand(stubGame, p, 'journal');
  assert.equal(p.silver, 100);
  assert.equal(JSON.stringify(p.quest), before);
});
