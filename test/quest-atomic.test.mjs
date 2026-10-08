import { auth, db, createCharacter, loadPlayer, setupGame, teardownGame, game, fakeWs } from './helpers.mjs';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';

before(setupGame);
after(teardownGame);

test('rejected explicit quest claim restores live rewards, completed assignment and durable state; retry pays once', async () => {
  const account = await auth.registerAccount('Questclaimatomic', 'secretword9');
  const id = createCharacter(account.accountId, { name: 'Claimant', race: 'human', guild: 'warmage' });
  const p = loadPlayer(id); p.ws = fakeWs(); game.addPlayer(p);
  p.quest = { kind: 'deliver', source: 'crier', done: true, target: { room: 'temple', name: 'Cora', parcel: 'bandages' } };
  game.persistPlayer(p);
  const before = { silver: p.silver, quest: structuredClone(p.quest), expPools: structuredClone(p.expPools) };
  db.exec(`CREATE TRIGGER reject_quest_claim BEFORE UPDATE OF silver ON characters WHEN NEW.id=${id} BEGIN SELECT RAISE(ABORT, 'quest claim rejected'); END`);
  try {
    assert.throws(() => game.questClaim(p), /quest claim rejected/);
    assert.equal(p.silver, before.silver);
    assert.deepEqual(p.quest, before.quest);
    assert.deepEqual(p.expPools, before.expPools);
    const reloaded = loadPlayer(id);
    assert.equal(reloaded.silver, before.silver);
    assert.deepEqual(reloaded.quest, before.quest);
    assert.deepEqual(reloaded.expPools, before.expPools);
    assert.equal(p.ws.msgs.some(frame => frame.t === 'quest' && frame.quest === null), false);
    assert.equal(p.achievements.includes('first_quest'), false);
  } finally { db.exec('DROP TRIGGER reject_quest_claim'); }
  assert.equal(game.questClaim(p).ok, true);
  assert.ok(p.silver > before.silver);
  assert.equal(p.quest, null);
  assert.equal(loadPlayer(id).quest, null);
  assert.equal(loadPlayer(id).silver, p.silver);
  const paid = p.silver;
  assert.equal(game.questClaim(p).ok, false);
  assert.equal(p.silver, paid);
  game.removePlayer(p);
});
