import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { auth, db, createCharacter, loadPlayer, setupGame, teardownGame, fakeWs } from './helpers.mjs';
import { addItem, countItems } from '../server/player.js';
import { auctionPrune } from '../server/pvp.js';

let game, seller, buyer;
before(async () => {
  game = setupGame();
  const account = await auth.registerAccount('auctionatomic', 'test-password');
  for (const name of ['Escrowseller', 'Escrowbuyer']) {
    const p = loadPlayer(createCharacter(account.accountId, { name, race: 'human', guild: 'trader' }));
    p.ws = fakeWs();
    game.addPlayer(p);
    p.room = 'auction_house';
    p.silver = 1000;
    game.persistPlayer(p);
    if (!seller) seller = p;
    else buyer = p;
  }
});
after(teardownGame);
const latest = () => db.prepare('SELECT * FROM auctions ORDER BY id DESC LIMIT 1').get();
const inject = (sql, action) => {
  db.exec(sql);
  try { action(); } finally { db.exec('DROP TRIGGER reject_auction'); }
};

test('posting failure preserves inventory and creates no listing', () => {
  addItem(seller, 'wolf_pelt');
  inject("CREATE TRIGGER reject_auction BEFORE INSERT ON auctions BEGIN SELECT RAISE(ABORT, 'listing rejected'); END", () => {
    assert.throws(() => game.auctionOffer(seller, 'wolf_pelt', 1, 100), /listing rejected/);
  });
  assert.equal(countItems(seller, 'wolf_pelt'), 1);
  assert.equal(countItems(loadPlayer(seller.charId), 'wolf_pelt'), 1);
  assert.equal(latest(), undefined);
});

test('online payment failure rolls back both players, item and listing; success survives reload', () => {
  game.auctionOffer(seller, 'wolf_pelt', 1, 100);
  const lot = latest();
  const balance = seller.silver;
  const messages = seller.ws.msgs.length;
  inject(`CREATE TRIGGER reject_auction BEFORE UPDATE OF silver ON characters WHEN NEW.id=${seller.charId} BEGIN SELECT RAISE(ABORT, 'seller rejected'); END`, () => {
    assert.throws(() => game.auctionBuy(buyer, lot.id), /seller rejected/);
  });
  assert.equal(buyer.silver, 1000);
  assert.equal(loadPlayer(buyer.charId).silver, 1000);
  assert.equal(seller.silver, balance);
  assert.equal(loadPlayer(seller.charId).silver, balance);
  assert.equal(countItems(buyer, 'wolf_pelt'), 0);
  assert.equal(countItems(loadPlayer(buyer.charId), 'wolf_pelt'), 0);
  assert.equal(latest().id, lot.id);
  assert.equal(seller.ws.msgs.length, messages, 'failed sale sends no success notification');
  assert.equal(game.auctionBuy(buyer, lot.id).ok, true);
  assert.equal(loadPlayer(buyer.charId).silver, 900);
  assert.equal(loadPlayer(seller.charId).silver, balance + 97);
  assert.equal(countItems(loadPlayer(buyer.charId), 'wolf_pelt'), 1);
  assert.equal(latest(), undefined);
});

test('offline seller bank payment is atomic with buyer delivery', () => {
  addItem(seller, 'wolf_pelt');
  game.auctionOffer(seller, 'wolf_pelt', 1, 100);
  const lot = latest();
  const bank = loadPlayer(seller.charId).bank;
  seller.online = false;
  try {
    inject("CREATE TRIGGER reject_auction BEFORE UPDATE OF bank ON characters BEGIN SELECT RAISE(ABORT, 'bank rejected'); END", () => {
      assert.throws(() => game.auctionBuy(buyer, lot.id), /bank rejected/);
    });
    assert.equal(buyer.silver, 900);
    assert.equal(countItems(loadPlayer(buyer.charId), 'wolf_pelt'), 1);
    assert.equal(loadPlayer(seller.charId).bank, bank);
    assert.equal(latest().id, lot.id);
    game.auctionBuy(buyer, lot.id);
    assert.equal(loadPlayer(seller.charId).bank, bank + 97);
    assert.equal(loadPlayer(buyer.charId).silver, 800);
  } finally { seller.online = true; }
});

test('expiry merges item metadata and cannot duplicate items when listing deletion fails', () => {
  addItem(seller, 'club', 1, { quality: 1.3, condition: 73, maker: 'Maker' });
  game.auctionOffer(seller, 'club', 1, 100);
  const lot = latest();
  db.prepare('UPDATE auctions SET at=0 WHERE id=?').run(lot.id);
  const prior = JSON.stringify([{ quality: 1.1, condition: 90, maker: 'Earlier' }]);
  db.prepare('INSERT INTO vault (character_id,item_id,qty,metadata) VALUES (?,?,?,?)').run(seller.charId, 'club', 1, prior);
  inject("CREATE TRIGGER reject_auction BEFORE DELETE ON auctions BEGIN SELECT RAISE(ABORT, 'expiry rejected'); END", () => {
    assert.throws(auctionPrune, /expiry rejected/);
  });
  const read = () => db.prepare('SELECT qty,metadata FROM vault WHERE character_id=? AND item_id=?').get(seller.charId, 'club');
  assert.deepEqual({ ...read() }, { qty: 1, metadata: prior });
  assert.equal(latest().id, lot.id);
  auctionPrune();
  assert.equal(read().qty, 2);
  assert.deepEqual(JSON.parse(read().metadata).map((m) => m.maker), ['Earlier', 'Maker']);
  auctionPrune();
  assert.equal(read().qty, 2);
  assert.equal(latest(), undefined);
});
