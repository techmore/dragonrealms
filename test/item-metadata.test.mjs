import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  auth, createCharacter, loadPlayer, setupGame, teardownGame,
} from './helpers.mjs';

const {
  addItem, equipItem, unequipItem, savePlayer,
} = await import('../server/player.js');

let game;
let accountId;
let seq = 0;
const NAMES = ['Gearmeta', 'Ironkeep', 'Vaultward'];

before(async () => {
  game = setupGame();
  accountId = (await auth.registerAccount('Itemmetadata', 's3cretword')).accountId;
});

after(() => teardownGame());

function character(guild = 'barbarian') {
  seq += 1;
  return loadPlayer(createCharacter(accountId, {
    name: NAMES[seq - 1], race: 'human', guild,
  }));
}

test('same-ID crafted gear keeps distinct per-instance quality', () => {
  const p = character();
  addItem(p, 'forged_short_sword', 1, { quality: 0.9, condition: 100 });
  addItem(p, 'forged_short_sword', 1, { quality: 1.3, condition: 100 });

  const copies = p.inventory.filter((entry) => entry.item.id === 'forged_short_sword');
  assert.equal(copies.length, 2);
  assert.notEqual(copies[0].id, copies[1].id, 'each copy has its own inventory row');
  assert.deepEqual(copies.map((entry) => entry.quality), [0.9, 1.3]);

  assert.equal(equipItem(p, copies[0]).ok, true);
  assert.equal(p.equipment.hand.quality, 0.9, 'equipping selects that concrete copy');
  assert.equal(unequipItem(p, 'hand').ok, true);
  assert.deepEqual(
    p.inventory.filter((entry) => entry.item.id === 'forged_short_sword').map((entry) => entry.quality).sort(),
    [0.9, 1.3],
  );
});

test('worn condition survives unequip, save/load, and re-equip', () => {
  const p = character();
  addItem(p, 'forged_short_sword', 1, { quality: 1.2, condition: 100 });
  assert.equal(equipItem(p, p.inventory[0]).ok, true);
  p.equipment.hand.condition = 47;
  assert.equal(unequipItem(p, 'hand').ok, true);
  savePlayer(p);

  const reloaded = loadPlayer(p.charId);
  const blade = reloaded.inventory.find((entry) => entry.item.id === 'forged_short_sword');
  assert.equal(blade.condition, 47);
  assert.equal(blade.quality, 1.2);
  assert.equal(equipItem(reloaded, blade).ok, true);
  assert.equal(reloaded.equipment.hand.condition, 47);
  assert.equal(reloaded.equipment.hand.quality, 1.2);
});

test('vault round-trip retains a gear instance metadata', () => {
  const p = character('trader');
  p.room = 'bank_plaza';
  addItem(p, 'cured_leather', 1, { quality: 1.3, condition: 62 });

  assert.equal(game.vaultStore(p, 'cured_leather', 1).ok, true);
  assert.equal(p.inventory.some((entry) => entry.item.id === 'cured_leather'), false);
  assert.equal(game.vaultRetrieve(p, 'cured_leather', 1).ok, true);

  const restored = p.inventory.find((entry) => entry.item.id === 'cured_leather');
  assert.equal(restored.quality, 1.3);
  assert.equal(restored.condition, 62);
});
