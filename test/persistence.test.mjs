import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  auth, db, createCharacter, loadPlayer, setupGame, teardownGame, game, Game, handleCommand, fakeWs,
} from './helpers.mjs';

const { savePlayer, addItem, equipItem } = await import('../server/player.js');

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
  p.expPools = { brawling: 137.5, skinning: 42 };
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
  assert.deepEqual(reloaded.expPools, p.expPools);
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

test('persistent saves are schema-tagged and keep flat SQL JSON paths', async () => {
  const account = await auth.registerAccount('Persistschema', 's3cretword');
  const charId = createCharacter(account.accountId, {
    name: 'Schemahand', race: 'human', guild: 'ranger',
  });
  const p = loadPlayer(charId);
  p.scripts = { hunt: 'go north' };
  p.forgedQuality = { bow: 1.1 };
  savePlayer(p);

  const raw = db.prepare('SELECT persistent_state FROM characters WHERE id=?').get(charId).persistent_state;
  assert.equal(JSON.parse(raw).schema, 'dragonrealms.characters.persistent_state');
  assert.equal(JSON.parse(raw).version, 1);
  assert.equal(db.prepare(`SELECT json_extract(persistent_state, '$.scripts.hunt') AS script
    FROM characters WHERE id=?`).get(charId).script, 'go north');
  assert.equal(db.prepare('SELECT json_valid(persistent_state) AS valid FROM characters WHERE id=?')
    .get(charId).valid, 1);
});

test('unsupported persistent state is diagnosed and cannot be silently overwritten', async () => {
  const account = await auth.registerAccount('Persistfuture', 's3cretword');
  const charId = createCharacter(account.accountId, {
    name: 'Futurehand', race: 'human', guild: 'ranger',
  });
  const future = JSON.stringify({ schema: 'dragonrealms.characters.persistent_state', version: 2, secret: 'keep' });
  db.prepare('UPDATE characters SET persistent_state=? WHERE id=?').run(future, charId);
  const p = loadPlayer(charId);
  assert.equal(p.persistenceDiagnostics.status, 'unsupported');
  assert.equal(p.persistenceDiagnostics.canWrite, false);
  assert.throws(() => savePlayer(p), /requires migration/);
  assert.equal(db.prepare('SELECT persistent_state FROM characters WHERE id=?').get(charId).persistent_state, future);
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
  assert.deepEqual(p.expPools, {});
  assert.equal(p.crimeHeat, 0);
});

test('bank, healer, and commodity actions are durable before success is returned', async () => {
  const account = await auth.registerAccount('Economyacct', 's3cretword');
  const charId = createCharacter(account.accountId, { name: 'Ledgerhand', race: 'human', guild: 'trader' });
  const p = loadPlayer(charId);
  p.ws = fakeWs();
  p.silver = 500;
  p.room = 'bank_plaza';
  assert.equal(game.deposit(p, 100).ok, true);
  p.room = 'temple';
  p.hp = Math.max(1, p.maxHp - 20);
  assert.equal(game.heal(p).ok, true);
  p.room = 'commodity_pit';
  const beforeSilver = p.silver;
  assert.equal(game.commodityTrade(p, 'buy', 'grain', 2).ok, true);
  assert.ok(p.silver < beforeSilver);
  game.stop();
  const restarted = new Game();
  restarted.init();
  restarted.stop();
  const reloaded = loadPlayer(charId);
  assert.equal(reloaded.bank, 100);
  assert.equal(reloaded.hp, reloaded.maxHp);
  assert.equal(reloaded.commodities?.grain?.qty, 2);
});

test('durable floor loot and player corpses survive a world restart', async () => {
  const account = await auth.registerAccount('Worldlootacct', 's3cretword');
  const charId = createCharacter(account.accountId, {
    name: 'Groundkeeper', race: 'human', guild: 'barbarian',
  });
  const p = loadPlayer(charId);
  p.ws = fakeWs();
  game.addPlayer(p);
  addItem(p, 'dagger', 1);
  const dropped = p.inventory.find((entry) => entry.item.id === 'dagger');
  assert.equal(game.dropPlayerItem(p, dropped, 1).ok, true);
  assert.equal(p.inventory.length, 0);

  game.stop();
  const restarted = new Game();
  restarted.init();
  restarted.stop();
  assert.equal(restarted.floorItemsIn('square').some((entry) => entry.item?.id === 'dagger'), true);

  const reloaded = loadPlayer(charId);
  reloaded.ws = fakeWs();
  handleCommand(restarted, reloaded, 'get dagger', 0, { applyRT: false });
  assert.equal(reloaded.inventory.some((entry) => entry.item.id === 'dagger'), true);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM world_loot WHERE kind='item' AND item_id='dagger'").get().n, 0);

  const corpsePlayer = loadPlayer(charId);
  corpsePlayer.ws = fakeWs();
  addItem(corpsePlayer, 'club', 1);
  const club = corpsePlayer.inventory.find((entry) => entry.item.id === 'club');
  equipItem(corpsePlayer, club);
  const corpse = restarted.dropCorpse(corpsePlayer);
  assert.ok(corpse);
  assert.equal(corpsePlayer.inventory.length, 0);
  assert.equal(Object.keys(corpsePlayer.equipment).length, 0);

  restarted.stop();
  const restartedAgain = new Game();
  restartedAgain.init();
  restartedAgain.stop();
  const recovered = loadPlayer(charId);
  recovered.ws = fakeWs();
  const recoveredCorpse = restartedAgain.corpseIn(recovered);
  assert.ok(recoveredCorpse, 'corpse is rehydrated from world_loot');
  const found = restartedAgain.retrieveFromCorpse(recovered, 'club');
  assert.equal(found.ok, true);
  assert.equal(recovered.inventory.some((entry) => entry.item.id === 'club'), true);
  const foundDagger = restartedAgain.retrieveFromCorpse(recovered, 'dagger');
  assert.equal(foundDagger.ok, true);
  assert.equal(recovered.inventory.some((entry) => entry.item.id === 'dagger'), true);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM world_loot WHERE uid=?').get(corpse.uid).n, 0);
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
