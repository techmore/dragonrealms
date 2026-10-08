import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { questSnapshot } from '../server/quest-objectives.js';
import { formatQuestJournal } from '../server/quest-journal.js';
import { auth, createCharacter, loadPlayer, setupGame, teardownGame, game, fakeWs, handleCommand } from './helpers.mjs';
const { quests } = await import('../server/quests.js');

before(setupGame);
after(teardownGame);

test('historical delivery destinations fail safely and missing recovery prose metadata cannot crash completion', async (t) => {
  const account = await auth.registerAccount('Questlegacyactions', 'secretword9');
  const id = createCharacter(account.accountId, { name: 'Archivist', race: 'human', guild: 'thief' });
  const p = loadPlayer(id); p.ws = fakeWs(); game.addPlayer(p);
  for (const target of [undefined, null, {}, { room: 'removed_room' }]) {
    p.quest = { kind: 'deliver', source: 'crier', target, done: false };
    const before = structuredClone(p.quest);
    const silver = p.silver;
    assert.doesNotThrow(() => handleCommand(game, p, 'deliver'));
    assert.deepEqual(p.quest, before);
    assert.equal(p.silver, silver);
    assert.match(p.ws.msgs.findLast(frame => frame.t === 'msg')?.msg || '', /destination is unavailable/);
  }
  p.quest = { kind: 'recover', source: 'crier', creatureId: 'rat', found: false, done: false };
  const random = t.mock.method(Math, 'random', () => 0);
  try { assert.doesNotThrow(() => game.questKill(p, 'rat')); } finally { random.mock.restore(); }
  assert.equal(p.quest.done, true);
  assert.equal(loadPlayer(id).quest.done, true);
  assert.match(p.ws.msgs.map(frame => frame.msg || '').join('\n'), /the missing trinket/);
  game.removePlayer(p);
});

test('one canonical snapshot reports all objectives and distinct counter semantics without changing state', () => {
  const cases = [
    [{ kind: 'kill', creatureId: 'rat', count: 2, total: 5 }, { current: 3, total: 5, remaining: 2, unit: 'creatures' }],
    [{ kind: 'kill', creatureId: 'rat', count: 2 }, { current: null, total: null, remaining: 2, unit: 'creatures' }],
    [{ kind: 'skin', count: 5, skinned: 2 }, { current: 2, total: 5, remaining: 3, unit: 'hides' }],
    [{ kind: 'recover', creatureId: 'rat', trinket: { name: 'a locket' }, found: false }, { current: 0, total: 1, remaining: 1, unit: 'trinkets' }],
    [{ kind: 'recover', found: true, done: true }, { current: 1, total: 1, remaining: 0, unit: 'trinkets' }],
    [{ kind: 'deliver', target: { room: 'temple', name: 'Cora', parcel: 'bandages' } }, null],
  ];
  for (const [quest, counter] of cases) {
    const p = { room: 'temple', quest };
    const before = JSON.stringify(p);
    const snapshot = questSnapshot(p);
    assert.deepEqual(snapshot.counter, counter);
    assert.equal(snapshot.state, quest.done ? 'complete' : 'active');
    assert.deepEqual(quests.questSummary(p), snapshot);
    assert.equal(quests.questDescription(p), snapshot.desc);
    assert.ok(formatQuestJournal(p).includes(snapshot.objective));
    assert.equal(JSON.stringify(p), before);
  }
  assert.equal(questSnapshot({}), null);
});

test('legacy, malformed and completed records remain inspectable with honest totals', () => {
  const legacy = questSnapshot({ quest: { kind: 'kill', count: 0, done: true, source: 'leader' } });
  assert.equal(legacy.counter.total, null);
  assert.equal(legacy.counter.current, null);
  assert.equal(legacy.returnTo, 'your guild leader');
  assert.match(legacy.desc, /reward unclaimed/);
  assert.doesNotMatch(legacy.desc, /Slay 0 more/);
  for (const kind of ['kill', 'skin', 'deliver', 'recover', 'unknown']) {
    assert.doesNotThrow(() => questSnapshot({ quest: { kind, count: NaN, target: { room: 'missing' } } }));
  }
  assert.equal(questSnapshot({ quest: { kind: 'kill', total: 1, count: 4 } }).counter.total, null);
  assert.equal(questSnapshot({ quest: { kind: 'kill' } }).counter.remaining, null);
  for (const invalid of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const snapshot = questSnapshot({ quest: { kind: 'kill', count: invalid, total: invalid } });
    assert.equal(snapshot.counter.remaining, null);
    assert.equal(snapshot.counter.current, null);
    assert.equal(snapshot.counter.total, null);
  }
  assert.match(quests.questDescription({ quest: { kind: 'skin', count: 5, skinned: 2 } }), /Skin 3 more/);
});

test('assignment cannot replace any existing active or completed task', () => {
  for (const done of [false, true]) {
    const existing = { kind: 'deliver', done, source: 'crier' };
    const p = { quest: existing };
    const failGame = { persistPlayer() { throw new Error('must not persist'); } };
    assert.equal(quests.assignQuest(failGame, p, 'leader'), existing);
    assert.equal(p.quest, existing);
  }
});

test('crier and guild reminders support every kind, preserve assignments, and never claim completed work', async () => {
  const account = await auth.registerAccount('Questreminders', 'secretword9');
  const p = loadPlayer(createCharacter(account.accountId, { name: 'Reminded', race: 'human', guild: 'thief' }));
  p.ws = fakeWs();
  game.addPlayer(p);
  const cases = [
    { kind: 'kill', count: 2, creatureId: 'rat' },
    { kind: 'skin', count: 5, skinned: 2 },
    { kind: 'deliver', target: { room: 'temple', name: 'Cora', parcel: 'bandages' } },
    { kind: 'recover', creatureId: 'rat', trinket: { name: 'a locket' } },
  ];
  for (const quest of cases) {
    for (const done of [false, true]) {
      p.quest = { ...quest, source: 'crier', done };
      const snapshot = JSON.stringify(p.quest);
      const silver = p.silver;
      p.room = 'square';
      assert.doesNotThrow(() => handleCommand(game, p, 'ask crier quest'));
      p.room = 'hall_thief';
      assert.doesNotThrow(() => handleCommand(game, p, 'ask Mist task'));
      handleCommand(game, p, 'quest');
      assert.equal(JSON.stringify(p.quest), snapshot);
      assert.equal(p.silver, silver);
    }
  }
  p.quest = null;
  p.guild = null;
  handleCommand(game, p, 'ask Mist task');
  assert.equal(p.quest, null);
  assert.match(p.ws.msgs.findLast(frame => frame.t === 'msg').msg, /Join a guild/);
  game.removePlayer(p);
});

test('new kill totals and partial progress persist, complete and claim exactly once', async (t) => {
  const account = await auth.registerAccount('Questpersist', 'secretword9');
  const id = createCharacter(account.accountId, { name: 'Recorded', race: 'human', guild: 'thief' });
  const p = loadPlayer(id);
  p.ws = fakeWs();
  game.addPlayer(p);
  const random = t.mock.method(Math, 'random', () => 0);
  try { game.assignQuest(p); } finally { random.mock.restore(); }
  const total = p.quest.total;
  game.questKill(p, p.quest.creatureId);
  assert.equal(loadPlayer(id).quest.total, total);
  assert.equal(loadPlayer(id).quest.count, total - 1);
  assert.deepEqual(quests.questSummary(p).counter, { current: 1, total, remaining: total - 1, unit: 'creatures' });
  while (!p.quest.done) game.questKill(p, p.quest.creatureId);
  const silver = p.silver;
  handleCommand(game, p, 'quest');
  assert.equal(p.silver, silver);
  assert.ok(p.quest.done);
  assert.equal(game.questClaim(p).ok, true);
  const paid = p.silver;
  assert.equal(loadPlayer(id).quest, null);
  assert.equal(game.questClaim(p).ok, false);
  assert.equal(p.silver, paid);
  assert.ok(paid > silver);
  game.removePlayer(p);
});

test('explicit abandon clears and persists work, while abandon without a task never assigns one', async () => {
  const account = await auth.registerAccount('Questabandon', 'secretword9');
  const id = createCharacter(account.accountId, { name: 'Abandoned', race: 'human', guild: 'thief' });
  const p = loadPlayer(id);
  p.ws = fakeWs();
  game.addPlayer(p);
  p.room = 'square';
  for (const done of [false, true]) {
    p.quest = { kind: 'skin', count: 5, skinned: 2, source: 'crier', done };
    handleCommand(game, p, 'quest abandon');
    assert.equal(p.quest, null);
    assert.equal(loadPlayer(id).quest, null);
  }
  handleCommand(game, p, 'quest abandon');
  assert.equal(p.quest, null);
  assert.match(p.ws.msgs.findLast(frame => frame.t === 'msg').msg, /no quest to abandon/);
  game.removePlayer(p);
});

test('skin, delivery and recovery completion persist and publish the same objective snapshot', async (t) => {
  const account = await auth.registerAccount('Questotherkinds', 'secretword9');
  const id = createCharacter(account.accountId, { name: 'Courier', race: 'human', guild: 'thief' });
  const p = loadPlayer(id);
  p.ws = fakeWs();
  game.addPlayer(p);
  p.quest = { kind: 'skin', source: 'crier', count: 2, skinned: 0, done: false };
  game.questSkin(p);
  assert.equal(loadPlayer(id).quest.skinned, 1);
  assert.equal(quests.questSummary(p).counter.remaining, 1);
  game.questSkin(p);
  assert.equal(loadPlayer(id).quest.done, true);
  assert.deepEqual(p.ws.msgs.findLast(frame => frame.t === 'quest').quest, questSnapshot(p));
  p.quest = { kind: 'deliver', source: 'crier', target: { room: 'temple', name: 'Cora', parcel: 'bandages' }, done: false };
  p.room = 'square';
  assert.equal(game.questDeliver(p).ok, false);
  assert.equal(p.quest.done, false);
  p.room = 'temple';
  assert.equal(game.questDeliver(p).ok, true);
  assert.equal(loadPlayer(id).quest.done, true);
  assert.equal(questSnapshot(p).destination.atDestination, true);
  p.quest = { kind: 'recover', source: 'crier', creatureId: 'rat', trinket: { name: 'a locket' }, found: false, done: false };
  const random = t.mock.method(Math, 'random', () => 0);
  try { game.questKill(p, 'rat'); } finally { random.mock.restore(); }
  assert.equal(loadPlayer(id).quest.found, true);
  assert.equal(loadPlayer(id).quest.done, true);
  assert.deepEqual(quests.questSummary(p).counter, { current: 1, total: 1, remaining: 0, unit: 'trinkets' });
  game.removePlayer(p);
});
