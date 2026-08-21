import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  auth, db, createCharacter, loadPlayer, setupGame, teardownGame,
} from './helpers.mjs';

const { savePlayer } = await import('../server/player.js');

before(() => setupGame());
after(() => teardownGame());

test('earned progression, justice, resources, and cooldowns survive reload', async () => {
  const account = await auth.registerAccount('Persistacct', 's3cretword');
  const charId = createCharacter(account.accountId, {
    name: 'Durable', race: 'human', guild: 'barbarian',
  });
  const p = loadPlayer(charId);
  const now = Date.now();

  p.abilities = ['dragon', 'titan'];
  p.lastForgetAt = now - 500;
  p.forgedQuality = { forged_short_sword: 1.3 };
  p.expLocks = { brawling: { count: 3, until: now + 60_000 } };
  p.stamina = 0;
  p.crimeHeat = 4;
  p.jailUntil = now + 30_000;
  p.stocksUntil = now + 10_000;
  p.innerFire = 7;
  p.voice = 9;
  p.companion = { kind: 'wolf', name: 'a bonded wolf', hp: 22, maxHp: 30, alive: true };
  p.familiar = { name: 'Ember', hp: 18, maxHp: 35, alive: true };
  p.cambrinth = { itemId: 'cambrinth_band', charge: 4, capacity: 6, manaType: 'elemental', updatedAt: now };
  p.chafferNext = true;
  p.warhornAt = now - 1_000;
  p.glyphAt = now - 2_000;
  savePlayer(p);

  const reloaded = loadPlayer(charId);
  assert.deepEqual(reloaded.abilities, p.abilities);
  assert.equal(reloaded.lastForgetAt, p.lastForgetAt);
  assert.deepEqual(reloaded.forgedQuality, p.forgedQuality);
  assert.deepEqual(reloaded.expLocks, p.expLocks);
  assert.equal(reloaded.stamina, 0, 'zero stamina is exhaustion, not a missing value');
  assert.equal(reloaded.crimeHeat, 4);
  assert.equal(reloaded.jailUntil, p.jailUntil);
  assert.equal(reloaded.stocksUntil, p.stocksUntil);
  assert.equal(reloaded.innerFire, 7);
  assert.equal(reloaded.voice, 9);
  assert.deepEqual(reloaded.companion, p.companion);
  assert.deepEqual(reloaded.familiar, p.familiar);
  assert.deepEqual(reloaded.cambrinth, p.cambrinth);
  assert.equal(reloaded.chafferNext, true);
  assert.equal(reloaded.warhornAt, p.warhornAt);
  assert.equal(reloaded.glyphAt, p.glyphAt);
});

test('corrupt optional persistent state degrades to safe defaults', async () => {
  const account = await auth.registerAccount('Persistbad', 's3cretword');
  const charId = createCharacter(account.accountId, {
    name: 'Fallback', race: 'human', guild: 'ranger',
  });
  db.prepare('UPDATE characters SET persistent_state=? WHERE id=?').run('{broken', charId);
  const p = loadPlayer(charId);
  assert.deepEqual(p.abilities, []);
  assert.deepEqual(p.forgedQuality, {});
  assert.deepEqual(p.expLocks, {});
  assert.equal(p.crimeHeat, 0);
});

test('complete quest state survives reload and claimed quests stay cleared', async () => {
  const account = await auth.registerAccount('Persistquest', 's3cretword');
  const charId = createCharacter(account.accountId, {
    name: 'Courier', race: 'human', guild: 'trader',
  });
  const p = loadPlayer(charId);
  p.quest = {
    kind: 'deliver', source: 'crier', done: false,
    target: { room: 'temple', npc: 'healer', name: 'Sister Cora', parcel: 'a bundle of bandages' },
  };
  savePlayer(p);
  assert.deepEqual(loadPlayer(charId).quest, p.quest, 'variant-specific quest fields round-trip');

  p.quest = null;
  savePlayer(p);
  assert.equal(loadPlayer(charId).quest, null, 'cleared quest row does not resurrect on relog');
});
