import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { auth, db, createCharacter, loadPlayer, setupGame, teardownGame, fakeWs } from './helpers.mjs';
import { addItem } from '../server/player.js';
import { npcById } from '../data/npcs.js';
import { economy } from '../server/economy.js';
import { roomById } from '../data/world.js';

const clubCapacity = roomById('bazaar').npcs.map(npcById).find((n) => n?.stock?.club).stock.club;

let game;
let p;
before(async () => {
  game = setupGame();
  const a = await auth.registerAccount('atomicshop', 'test-password');
  p = loadPlayer(createCharacter(a.accountId, { name: 'Atomicshop', race: 'human', guild: 'barbarian' }));
  p.ws = fakeWs();
  game.addPlayer(p);
  p.room = 'bazaar';
  p.silver = 10000;
  game.persistPlayer(p);
});
after(teardownGame);

test('purchase commits item and payment before a later player save', () => {
  const before = p.silver;
  assert.equal(game.buy(p, 'club').ok, true);
  const disk = loadPlayer(p.charId);
  assert.ok(p.silver < before);
  assert.equal(disk.silver, p.silver);
  assert.ok(disk.inventory.some((e) => e.item.id === 'club'));
});

test('rejected payment rolls back inventory, balance and shop stock', () => {
  const shops = game.shopNpcsIn(p);
  const shop = shops.find((n) => n.stock.club);
  const before = { silver: p.silver, inventory: structuredClone(p.inventory), stock: shop.stock.club };
  db.exec("CREATE TRIGGER reject_payment BEFORE UPDATE OF silver ON characters BEGIN SELECT RAISE(ABORT, 'payment rejected'); END");
  try { assert.throws(() => game.buy(p, 'club'), /payment rejected/); }
  finally { db.exec('DROP TRIGGER reject_payment'); }
  assert.equal(p.silver, before.silver);
  assert.deepEqual(p.inventory, before.inventory);
  assert.equal(shop.stock.club, before.stock);
  const disk = loadPlayer(p.charId);
  assert.equal(disk.silver, before.silver);
  assert.equal(disk.inventory.filter((e) => e.item.id === 'club').length,
    before.inventory.filter((e) => e.item.id === 'club').length);
});

test('sale commits proceeds and rolls back removal if payment fails', () => {
  addItem(p, 'rat_pelt', 2);
  const before = p.silver;
  assert.equal(game.sell(p, 'rat_pelt', 1).ok, true);
  assert.ok(p.silver > before);
  let disk = loadPlayer(p.charId);
  assert.equal(disk.silver, p.silver);
  assert.equal(disk.inventory.find((e) => e.item.id === 'rat_pelt').qty, 1);
  const paid = p.silver;
  p.chafferNext = true;
  db.exec("CREATE TRIGGER reject_payment BEFORE UPDATE OF silver ON characters BEGIN SELECT RAISE(ABORT, 'payment rejected'); END");
  try { assert.throws(() => game.sell(p, 'rat_pelt', 1), /payment rejected/); }
  finally { db.exec('DROP TRIGGER reject_payment'); }
  disk = loadPlayer(p.charId);
  assert.equal(p.silver, paid);
  assert.equal(disk.silver, paid);
  assert.equal(p.chafferNext, true);
  assert.equal(p.inventory.find((e) => e.item.id === 'rat_pelt').qty, 1);
  assert.equal(disk.inventory.find((e) => e.item.id === 'rat_pelt').qty, 1);
});

test('restocking restores authored capacity after purchases before the first tick', () => {
  const shop = game.shopNpcsIn({ room: 'bazaar' }).find((n) => n.stock.club);
  const before = shop.stock.club;
  try {
    shop.stock.club = 0;
    game.economy.restockTick();
    assert.equal(shop.stock.club, 1);
    for (let i = 0; i < 1000; i++) game.economy.restockTick();
    assert.equal(shop.stock.club, clubCapacity);
    const capacity = shop.stock.club;
    game.economy.restockTick();
    assert.equal(shop.stock.club, capacity);
  } finally {
    shop.stock.club = before;
  }
});


test('vault transfer failures preserve live and durable item ownership', () => {
  p.room = 'bank_plaza';
  const before = structuredClone(p.inventory);
  db.exec("CREATE TRIGGER reject_vault BEFORE INSERT ON vault BEGIN SELECT RAISE(ABORT, 'vault rejected'); END");
  try { assert.throws(() => economy.vaultStore(p, 'club'), /vault rejected/); }
  finally { db.exec('DROP TRIGGER reject_vault'); }
  assert.deepEqual(p.inventory, before);
  assert.equal(loadPlayer(p.charId).inventory.filter((e) => e.item.id === 'club').length,
    before.filter((e) => e.item.id === 'club').length);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM vault WHERE character_id=?').get(p.charId).n, 0);

  assert.equal(economy.vaultStore(p, 'club').ok, true);
  const stored = structuredClone(p.inventory);
  db.exec("CREATE TRIGGER reject_retrieve BEFORE DELETE ON vault BEGIN SELECT RAISE(ABORT, 'retrieve rejected'); END");
  try { assert.throws(() => economy.vaultRetrieve(p, 'club'), /retrieve rejected/); }
  finally { db.exec('DROP TRIGGER reject_retrieve'); }
  assert.deepEqual(p.inventory, stored);
  assert.equal(loadPlayer(p.charId).inventory.filter((e) => e.item.id === 'club').length,
    stored.filter((e) => e.item.id === 'club').length);
  assert.equal(db.prepare('SELECT qty FROM vault WHERE character_id=? AND item_id=?').get(p.charId, 'club').qty, 1);
  assert.equal(economy.vaultRetrieve(p, 'club').ok, true);
  assert.equal(p.inventory.filter((e) => e.item.id === 'club').length,
    before.filter((e) => e.item.id === 'club').length);
  p.room = 'bazaar';
});
