import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  auth, createCharacter, loadPlayer, setupGame, teardownGame,
} from './helpers.mjs';

const {
  addItem, equipItem, unequipItem, savePlayer,
} = await import('../server/player.js');
const { db } = await import('../server/db.js');

let game;
let accountId;
let seq = 0;
const NAMES = ['Gearmeta', 'Ironkeep', 'Vaultward', 'Swapguard', 'Equipfail', 'Makerstamp'];

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

test('equipped maker and concrete metadata are durable before a later full save', () => {
  const p = character();
  addItem(p, 'forged_short_sword', 1, {
    quality: 1.4, condition: 83, maker: 'Vessa',
  });
  const candidate = p.inventory.find((entry) => entry.item.id === 'forged_short_sword');
  assert.equal(equipItem(p, candidate).ok, true);

  const row = db.prepare('SELECT condition, quality, maker FROM equipment WHERE character_id=? AND slot=?')
    .get(p.charId, 'hand');
  assert.deepEqual({ ...row }, { condition: 83, quality: 1.4, maker: 'Vessa' });

  const reloaded = loadPlayer(p.charId);
  assert.equal(reloaded.equipment.hand.condition, 83);
  assert.equal(reloaded.equipment.hand.quality, 1.4);
  assert.equal(reloaded.equipment.hand.maker, 'Vessa');
  assert.equal(reloaded.inventory.some((entry) => entry.item.id === 'forged_short_sword'), false);
});

test('failed same-slot equipment swap restores runtime and durable ownership', () => {
  const p = character();
  addItem(p, 'padded_cloth', 1, { quality: 0.8, condition: 71, maker: 'Oldward' });
  const oldCandidate = p.inventory.find((entry) => entry.item.id === 'padded_cloth');
  assert.equal(equipItem(p, oldCandidate).ok, true);
  addItem(p, 'leather', 1, { quality: 1.1, condition: 92, maker: 'Newward' });
  const newCandidate = p.inventory.find((entry) => entry.item.id === 'leather');
  const oldEquipment = { ...p.equipment.torso };
  const oldHandsDirty = p.handsDirty;

  db.exec(`CREATE TRIGGER reject_equipment_insert
    BEFORE INSERT ON equipment WHEN NEW.character_id = ${p.charId}
    BEGIN SELECT RAISE(ABORT, 'injected equipment insert failure'); END`);
  try {
    assert.throws(() => equipItem(p, newCandidate), /injected equipment insert failure/);
  } finally {
    db.exec('DROP TRIGGER reject_equipment_insert');
  }

  assert.deepEqual(p.equipment.torso, oldEquipment);
  assert.equal(p.handsDirty, oldHandsDirty);
  assert.equal(p.inventory.some((entry) => entry.id === newCandidate.id), true);
  assert.equal(p.inventory.some((entry) => entry.item.id === 'padded_cloth'), false);
  assert.deepEqual(
    { ...db.prepare('SELECT item_id, condition, quality, maker FROM equipment WHERE character_id=?').get(p.charId) },
    { item_id: 'padded_cloth', condition: 71, quality: 0.8, maker: 'Oldward' },
  );
  assert.deepEqual(
    db.prepare('SELECT item_id, qty FROM inventory WHERE character_id=?').all(p.charId).map((row) => ({ ...row })),
    [{ item_id: 'leather', qty: 1 }],
  );
});

test('failed unequip preserves the equipped row and does not create inventory', () => {
  const p = character();
  addItem(p, 'leather', 1, { quality: 1.2, condition: 64, maker: 'Holdfast' });
  const candidate = p.inventory[0];
  assert.equal(equipItem(p, candidate).ok, true);
  const equipped = { ...p.equipment.torso };

  db.exec(`CREATE TRIGGER reject_unequip_inventory
    BEFORE INSERT ON inventory WHEN NEW.character_id = ${p.charId} AND NEW.item_id = 'leather'
    BEGIN SELECT RAISE(ABORT, 'injected unequip inventory failure'); END`);
  try {
    assert.throws(() => unequipItem(p, 'torso'), /injected unequip inventory failure/);
  } finally {
    db.exec('DROP TRIGGER reject_unequip_inventory');
  }

  assert.deepEqual(p.equipment.torso, equipped);
  assert.equal(p.inventory.length, 0);
  assert.deepEqual(
    { ...db.prepare('SELECT item_id, condition, quality, maker FROM equipment WHERE character_id=? AND slot=?')
      .get(p.charId, 'torso') },
    { item_id: 'leather', condition: 64, quality: 1.2, maker: 'Holdfast' },
  );
  assert.equal(
    db.prepare('SELECT COUNT(*) AS count FROM inventory WHERE character_id=?').get(p.charId).count,
    0,
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
