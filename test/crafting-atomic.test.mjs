import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { auth, db, createCharacter, loadPlayer, setupGame, teardownGame, fakeWs } from './helpers.mjs';
import { addItem, countItems } from '../server/player.js';
import { commands } from '../server/commands/items.js';
import { finishCraft } from '../server/crafting.js';
import { RECIPES } from '../data/recipes.js';
import { FORGE_RECIPES } from '../data/forging.js';
let game, p;
before(async () => {
  game = setupGame();
  const account = await auth.registerAccount('craftatomic', 'test-password');
  p = loadPlayer(createCharacter(account.accountId, { name: 'Crafttester', race: 'human', guild: 'barbarian' }));
  p.ws = fakeWs();
  game.addPlayer(p);
  p.room = 'forge';
});
after(teardownGame);

test('forge output failure restores materials and awards no experience or success message', () => {
  addItem(p, 'iron_ore', 2);
  const pools = structuredClone(p.expPools);
  const messages = [];
  db.exec("CREATE TRIGGER reject_craft BEFORE INSERT ON inventory WHEN NEW.item_id='forged_short_sword' BEGIN SELECT RAISE(ABORT, 'output rejected'); END");
  try {
    assert.throws(() => commands.forge({ p, rest: 'forged_short_sword', emit: (msg) => messages.push(msg) }), /output rejected/);
  } finally { db.exec('DROP TRIGGER reject_craft'); }
  assert.equal(countItems(p, 'iron_ore'), 2);
  assert.equal(countItems(loadPlayer(p.charId), 'iron_ore'), 2);
  assert.equal(countItems(loadPlayer(p.charId), 'forged_short_sword'), 0);
  assert.deepEqual(p.expPools, pools);
  assert.deepEqual(messages, []);
  commands.forge({ p, rest: 'forged_short_sword', emit: (msg) => messages.push(msg) });
  assert.equal(countItems(loadPlayer(p.charId), 'iron_ore'), 0);
  assert.equal(countItems(loadPlayer(p.charId), 'forged_short_sword'), 1);
});

test('crafting repairs malformed persistent state through the codec writer', async () => {
  const account = await auth.registerAccount('craftcodec', 'test-password');
  const charId = createCharacter(account.accountId, { name: 'Codecraft', race: 'human', guild: 'barbarian' });
  db.prepare('UPDATE characters SET persistent_state=? WHERE id=?').run('{broken', charId);
  const loaded = loadPlayer(charId);
  assert.equal(loaded.persistenceDiagnostics.status, 'repaired');
  addItem(loaded, 'iron_ore', 2);
  assert.doesNotThrow(() => finishCraft(loaded, 'forge', FORGE_RECIPES.forged_short_sword, 1.1));
  const raw = db.prepare('SELECT persistent_state FROM characters WHERE id=?').get(loaded.charId).persistent_state;
  const stored = JSON.parse(raw);
  assert.equal(stored.schema, 'dragonrealms.characters.persistent_state');
  assert.equal(stored.version, 1);
  assert.equal(stored.forgedQuality.forged_short_sword, 1.1);
  assert.equal(db.prepare('SELECT json_valid(persistent_state) AS valid FROM characters WHERE id=?')
    .get(loaded.charId).valid, 1);
});

test('work order and material consumption commit together and survive reload', () => {
  addItem(p, 'iron_ore', 2);
  p.workOrder = { verb: 'forge', recipeId: 'forged_short_sword', qualMult: 1, npc: 'Bram', pay: 50, done: false };
  game.persistPlayer(p);
  db.exec("CREATE TRIGGER reject_craft BEFORE UPDATE OF persistent_state ON characters BEGIN SELECT RAISE(ABORT, 'order rejected'); END");
  try { assert.throws(() => finishCraft(p, 'forge', FORGE_RECIPES.forged_short_sword, 1.3), /order rejected/); }
  finally { db.exec('DROP TRIGGER reject_craft'); }
  assert.equal(p.workOrder.done, false);
  assert.equal(loadPlayer(p.charId).workOrder.done, false);
  assert.equal(countItems(loadPlayer(p.charId), 'iron_ore'), 2);
  assert.match(finishCraft(p, 'forge', FORGE_RECIPES.forged_short_sword, 1.3), /order claim/);
  const disk = loadPlayer(p.charId);
  assert.equal(disk.workOrder.done, true);
  assert.equal(countItems(disk, 'iron_ore'), 0);
  assert.equal(countItems(disk, 'forged_short_sword'), 1, 'ordered output is reserved, not duplicated');
});

test('failed work-order take restores runtime and durable absence', () => {
  p.workOrder = null;
  game.persistPlayer(p);
  const messages = [];
  db.exec(`CREATE TRIGGER reject_order_take
    BEFORE UPDATE OF persistent_state ON characters WHEN NEW.id = ${p.charId}
    BEGIN SELECT RAISE(ABORT, 'order take rejected'); END`);
  try {
    commands.order({ game, p, arg1: '', arg2: '', emit: (message) => messages.push(message) });
  } finally { db.exec('DROP TRIGGER reject_order_take'); }
  assert.match(messages.join('\n'), /nothing changed/);
  assert.equal(p.workOrder, null);
  assert.equal(loadPlayer(p.charId).workOrder, null);
});

test('failed work-order abandon restores the active runtime and durable order', () => {
  const messages = [];
  commands.order({ game, p, arg1: '', arg2: '', emit: () => {} });
  const active = structuredClone(p.workOrder);
  assert.ok(active);
  assert.deepEqual(loadPlayer(p.charId).workOrder, active);

  db.exec(`CREATE TRIGGER reject_order_abandon
    BEFORE UPDATE OF persistent_state ON characters WHEN NEW.id = ${p.charId}
    BEGIN SELECT RAISE(ABORT, 'order abandon rejected'); END`);
  try {
    commands.order({ game, p, arg1: 'abandon', arg2: '', emit: (message) => messages.push(message) });
  } finally { db.exec('DROP TRIGGER reject_order_abandon'); }
  assert.match(messages.join('\n'), /still carry/);
  assert.deepEqual(p.workOrder, active);
  assert.deepEqual(loadPlayer(p.charId).workOrder, active);

  commands.order({ game, p, arg1: 'abandon', arg2: '', emit: () => {} });
  assert.equal(p.workOrder, null);
  assert.equal(loadPlayer(p.charId).workOrder, null);
});

test('failed brewing consumes ingredients as designed without producing an item', () => {
  addItem(p, 'herb_root', 2);
  addItem(p, 'herb_mint', 1);
  finishCraft(p, 'craft', RECIPES.healing_draught, null, false);
  const disk = loadPlayer(p.charId);
  assert.equal(countItems(disk, 'herb_root'), 0);
  assert.equal(countItems(disk, 'herb_mint'), 0);
  assert.equal(countItems(disk, 'potion_heal'), 0);
});


test('work-order claim rejection cannot credit spendable silver or lose the order', () => {
  p.workOrder = { verb: 'forge', recipeId: 'forged_short_sword', qualMult: 1, qualName: 'serviceable', npc: 'Bram', pay: 50, done: true };
  game.persistPlayer(p);
  const silver = p.silver;
  db.exec("CREATE TRIGGER reject_craft BEFORE UPDATE OF persistent_state ON characters BEGIN SELECT RAISE(ABORT, 'claim rejected'); END");
  try {
    assert.throws(() => commands.order({ game, p, arg1: 'claim', emit: () => {} }), /claim rejected/);
  } finally { db.exec('DROP TRIGGER reject_craft'); }
  assert.equal(p.silver, silver);
  assert.equal(p.workOrder.done, true);
  assert.equal(loadPlayer(p.charId).workOrder.done, true);
  commands.order({ game, p, arg1: 'claim', emit: () => {} });
  assert.equal(loadPlayer(p.charId).silver, silver + 50);
  assert.equal(loadPlayer(p.charId).workOrder, null);
});
