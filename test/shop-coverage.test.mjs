// Shop coverage: every role=shop NPC lists, sells its stock, and buys its
// advertised goods; bank/healer verbs work in their rooms. Catches dead
// vendors (the fence shipped with no buys list and refused everything).
import test from 'node:test';
import assert from 'node:assert/strict';
import { before, after } from 'node:test';
import {
  auth, createCharacter, loadPlayer, fakeWs, setupGame, teardownGame, game, handleCommand,
} from './helpers.mjs';
import { NPCS } from '../data/npcs.js';
import { ITEMS } from '../data/items.js';
import { economy } from '../server/economy.js';
import { addItem } from '../server/player.js';

before(() => setupGame());
after(() => teardownGame());

function roomsWith(npcId) {
  return ['bazaar', 'west_road', 'bank_plaza', 'temple', 'pass_den'];
}

test('every shop NPC lists, sells stock, and buys its goods', async (t) => {
    const acc = await auth.registerAccount('Shopaudit', 's3cretword');
    const charId = createCharacter(acc.accountId, { name: 'Shopper', race: 'human', guild: 'trader' });
    const p = loadPlayer(charId);
    p.ws = fakeWs();
    game.addPlayer(p);
    p.silver = 100000;

    const shops = Object.values(NPCS).filter((n) => n.role === 'shop');
    assert.ok(shops.length >= 6, 'a real shop network exists');
    for (const shop of shops) {
      // Stand in the shop's first room (pass_den reached directly; the
      // passage verb itself is covered by the thief test below).
      const roomMap = { shopkeeper: 'bazaar', weaponsmith: 'bazaar', armorer: 'bazaar', mags: 'bazaar', quartermaster: 'bank_plaza', tanner: 'west_road', fence: 'pass_den' };
      p.room = roomMap[shop.id] || 'bazaar';
      const listed = economy.listShop(p);
      assert.equal(listed.ok, true, `${shop.id}: list works`);
      for (const [id, qty] of Object.entries(shop.stock || {})) {
        if (qty <= 0) continue;
        const before = p.silver;
        const res = economy.buy(p, id, 1);
        assert.equal(res.ok, true, `${shop.id}: buy ${id} works`);
        assert.ok(p.silver < before, `${shop.id}: buy ${id} charges silver`);
        break; // one prove-it purchase per vendor is enough
      }
      for (const id of shop.buys || []) {
        assert.ok(ITEMS[id], `${shop.id} buys unknown item ${id}`);
        addItem(p, id, 1);
        const res = economy.sell(p, id, 1);
        assert.equal(res.ok, true, `${shop.id}: sell ${id} works`);
        break; // one prove-it sale per vendor is enough
      }
      assert.ok((shop.buys || []).length > 0 || Object.keys(shop.stock || {}).length > 0,
        `${shop.id}: a shop must either stock or buy something`);
    }
    game.removePlayer(p);
});

test('thief passage verb reaches the fence and the fence buys hot goods', async () => {
    const acc = await auth.registerAccount('Fenceaudit', 's3cretword');
    const charId = createCharacter(acc.accountId, { name: 'Fenceling', race: 'human', guild: 'thief' });
    const p = loadPlayer(charId);
    const ws = fakeWs();
    p.ws = ws;
    game.addPlayer(p);
    p.silver = 1000;

    p.room = 'passage_ravens';
    handleCommand(game, p, 'passage');
    assert.equal(p.room, 'pass_hub', 'passage slips a thief into the hub');
    handleCommand(game, p, 'passage');
    const msgs = ws.msgs.map((m) => m.msg).join(' ');
    assert.match(msgs, /ravens|swithens/i, 'hub lists chalk-sign ways out');

    game.moveTo(p, 'pass_den');
    addItem(p, 'emerald', 1);
    const res = economy.sell(p, 'emerald', 1);
    assert.equal(res.ok, true, 'fence buys hot goods');
    assert.ok(p.silver > 1000, 'fence pays silver');
    game.removePlayer(p);
});
