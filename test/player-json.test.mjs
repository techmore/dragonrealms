import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { decodePlayerJson, stringList, isRecord } from '../server/player-json.js';
import { auth, db, createCharacter, loadPlayer, setupGame, teardownGame } from './helpers.mjs';
import { ACHIEVEMENTS, unlockAchievement, savePlayer } from '../server/player.js';

before(setupGame);
after(teardownGame);

test('legacy JSON shape failures are diagnosed; valid array entries survive', () => {
  for (const raw of ['{}', 'null', '3', '"text"', '{broken']) {
    const errors = [];
    assert.deepEqual(decodePlayerJson(raw, stringList('achievements'), errors), []);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].path, 'achievements');
  }
  const errors = [];
  assert.deepEqual(decodePlayerJson('["keep",null,4,"also"]', stringList('techniques'), errors), ['keep', 'also']);
  assert.equal(errors.length, 2);
  assert.equal(isRecord([]), false);
});

test('wrong-shaped legacy columns cannot crash achievement unlock or EXP conversion', async () => {
  const a = await auth.registerAccount('jsonaudit', 'audit-password');
  const id = createCharacter(a.accountId, { name: 'Jsonaudit', race: 'human', guild: 'barbarian' });
  db.prepare('UPDATE characters SET achievements=?, techniques=?, exp_pools=?, warrant=?, caravan=?, link=? WHERE id=?')
    .run('{}', 'null', '[1]', '[]', 'false', '{}', id);
  const p = loadPlayer(id);
  assert.deepEqual(p.achievements, []);
  assert.deepEqual(p.techniques, []);
  assert.deepEqual(p.expPools, {});
  assert.equal(p.warrant, null);
  assert.equal(p.caravan, null);
  assert.equal(p.empathLink, null);
  assert.ok(p.persistenceDiagnostics.errors.some(e => e.path === 'achievements'));
  assert.equal(unlockAchievement(p, Object.keys(ACHIEVEMENTS)[0]), true);
  savePlayer(p);
  assert.deepEqual(loadPlayer(id).achievements, p.achievements);
});

test('EXP map repairs retain finite known skills without coercing invalid entries', async () => {
  const a = await auth.registerAccount('poolaudit', 'audit-password');
  const id = createCharacter(a.accountId, { name: 'Poolaudit', race: 'human', guild: 'barbarian' });
  db.prepare('UPDATE characters SET exp_pools=? WHERE id=?')
    .run('{"brawling":12.5,"skinning":"20","unknown":10,"evasion":-1}', id);
  assert.deepEqual(loadPlayer(id).expPools, { brawling: 12.5 });
});
