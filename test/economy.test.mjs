// Domain suite: economy.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  auth, db, createCharacter, loadPlayer, Game, handleCommand, fakeWs, game,
  setupGame, teardownGame,
} from './helpers.mjs';

before(() => setupGame());
after(() => teardownGame());

test('heal and bank services', async () => {
  const acc = await auth.registerAccount('Servicetest', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Porter', race: 'human', guild: 'trader' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  p.hp = 50;
  game.move(p, 'nw'); game.move(p, 'w'); game.move(p, 'w'); // temple row (healer)
  handleCommand(game, p, 'heal');
  assert.equal(p.hp, p.maxHp, 'healed to full');

  p.silver = 150;
  game.move(p, 'e'); game.move(p, 'e'); game.move(p, 'se'); // temple row -> green
  game.move(p, 'e'); game.move(p, 'e'); game.move(p, 'e'); game.move(p, 'e'); // -> bazaar -> market way -> bank plaza (banker)
  handleCommand(game, p, 'deposit 100');
  assert.equal(p.bank, 100);
  assert.equal(p.silver, 50);
  handleCommand(game, p, 'withdraw 25');
  assert.equal(p.bank, 75);
  assert.equal(p.silver, 75);

  game.removePlayer(p);
});

test('equipment circle requirements enforced and quartermaster sells tiers', async () => {
  const { ITEMS } = await import('../data/items.js');
  const world = await import('../data/world.js');
  const npcs = await import('../data/npcs.js');
  const acc = await auth.registerAccount('Gearagetest', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Recruit', race: 'human', guild: 'paladin' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  // Circle 1 cannot wield a steel sword.
  const { addItem } = await import('../server/player.js');
  addItem(p, 'steel_sword', 1);
  handleCommand(game, p, 'wield steel_sword');
  assert.equal(p.equipment.hand, undefined, 'cannot wield gear above your circle');

  // Quartermaster stocks circle-gated gear.
  assert.ok(world.ROOMS.market_end.npcs.includes('quartermaster'), 'quartermaster is in market_end');
  const qm = npcs.NPCS.quartermaster;
  assert.ok(qm.stock.steel_sword >= 1);
  assert.ok(qm.stock.dragonsteel_greatsword >= 1);

  game.removePlayer(p);
});

test('craft command: alchemy recipes, ingredient consumption, success', async () => {
  const { addItem, countItems, skillRank } = await import('../server/player.js');
  const acc = await auth.registerAccount('Crafttest', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Brewer', race: 'elothean', guild: 'warmage' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  // No alchemist in the square.
  handleCommand(game, p, 'craft healing_draught');
  const errMsg = ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).join(' ');
  assert.match(errMsg, /alchemist/, 'craft requires the alchemist');

  // Go to the brewery (square -> bazaar -> market way, north).
  game.move(p, 'e'); game.move(p, 'e'); game.move(p, 'e');
  game.move(p, 'n');
  assert.equal(p.room, 'brewery');

  addItem(p, 'herb_root', 2);
  addItem(p, 'herb_mint', 1);
  p.skills.alchemy = { rank: 40, exp: 0 }; // near-certain success
  handleCommand(game, p, 'craft healing_draught');
  const potions = countItems(p, 'potion_heal');
  assert.ok(potions === 1 || potions === 0, 'craft may succeed or boil over');
  assert.equal(countItems(p, 'herb_root'), 0, 'ingredients consumed either way');
  assert.ok(skillRank(p, 'alchemy') + p.skills.alchemy.exp > 0, 'crafting trains alchemy');
  const craftMsg = ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).join(' ');
  assert.match(craftMsg, /produce|boils over/, 'craft narrates the result');

  game.removePlayer(p);
});

test('consumables: essence tonic restores mana, frenzy draught grants buff', async () => {
  const { addItem } = await import('../server/player.js');
  const acc = await auth.registerAccount('Potitest', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Tonic', race: 'human', guild: 'warmage' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  p.mana = 5;
  addItem(p, 'potion_mana', 1);
  handleCommand(game, p, 'use tonic');
  assert.ok(p.mana > 5, 'essence tonic restores mana');

  // The chug timer (30s between draughts) has elapsed for this test.
  p.potionAt = 0;
  addItem(p, 'potion_frenzy', 1);
  handleCommand(game, p, 'use frenzy');
  assert.equal(p.buffs.frenzy, 30, 'frenzy buff active');

  game.removePlayer(p);
});

test('crime loop: steal, strongboxes, and magical consumables train skills', async () => {
  const { addItem } = await import('../server/player.js');
  const acc = await auth.registerAccount('Picklock', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Locke', race: 'human', guild: 'thief' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  // Total learning in a skill under the pool model: banked field exp +
  // residual rank bits + ranks.
  const exp = (pl, id) => ((pl.expPools && pl.expPools[id]) || 0)
    + (pl.skills[id]?.exp || 0) + (pl.skills[id]?.rank || 0);

  // Steal from the crier: either path grants thievery exp and moves silver.
  const silverBefore = p.silver;
  const thieveryBefore = exp(p, 'thievery');
  handleCommand(game, p, 'steal crier');
  assert.ok(exp(p, 'thievery') > thieveryBefore, 'steal trains thievery');
  const msgs = ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).join(' ');
  assert.match(msgs, /lift|catches|guard/, 'steal narrates an outcome');
  assert.ok(p.silver !== silverBefore, 'steal changes your silver');

  // Pick a locked strongbox: coins + lockpicking exp either way.
  const lockBefore = exp(p, 'lockpicking');
  const silver2 = p.silver;
  addItem(p, 'strongbox', 1);
  handleCommand(game, p, 'pick strongbox');
  assert.ok(exp(p, 'lockpicking') > lockBefore, 'pick trains lockpicking');
  assert.ok(p.silver >= silver2, 'strongbox either pays or keeps your coin');
  assert.ok(p.inventory.filter((i) => i.item.id === 'strongbox').length === 0, 'strongbox consumed');

  // Drinking a draught trains arcana.
  const arcanaBefore = exp(p, 'arcana');
  addItem(p, 'potion_heal', 1);
  handleCommand(game, p, 'drink healing draught');
  assert.ok(exp(p, 'arcana') > arcanaBefore, 'magical draughts train arcana');

  // Kobolds and bandits now carry strongboxes.
  const { CREATURES } = await import('../data/creatures.js');
  assert.ok(CREATURES.kobold.loot.includes('strongbox'), 'kobolds drop strongboxes');
  assert.ok(CREATURES.bandit.loot.includes('strongbox'), 'bandits drop strongboxes');

  // Empath casting trains the empathy guild skill.
  game.removePlayer(p);
  const eAcc = await auth.registerAccount('Mender', 's3cretword');
  const eChar = createCharacter(eAcc.accountId, { name: 'MendrX', race: 'elothean', guild: 'empath' });
  const e = loadPlayer(eChar);
  const ews = fakeWs();
  e.ws = ews;
  game.addPlayer(e);
  e.hp = e.maxHp - 40;
  const empBefore = exp(e, 'empathy');
  handleCommand(game, e, 'cast sooth');
  assert.ok(exp(e, 'empathy') > empBefore, 'empath casting trains empathy');
  game.removePlayer(e);
});

test('trader commodity pits: buy and sell on the board', async () => {
  const acc = await auth.registerAccount('Pit', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Bull', race: 'human', guild: 'trader' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  p.room = 'commodity_pit';
  handleCommand(game, p, 'pit');
  const board = ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).join(' ');
  assert.match(board, /grain|wool|silk|spices/, 'board lists commodities');

  p.silver = 1000;
  handleCommand(game, p, 'buy grain 5');
  assert.ok(p.commodities.grain.qty === 5, 'grain held');
  const { commodityPrice } = await import('../data/commodities.js');
  p.commodities.grain.avgCost = 1; // force a fat profit
  handleCommand(game, p, 'sell grain 5');
  assert.equal(p.commodities.grain, undefined, 'holdings cleared');
  const sellMsgs = ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).at(-1) || '';
  assert.match(sellMsgs, /profit/, 'profit reported');

  game.removePlayer(p);
});

test('equipItem swaps worn items instead of crashing', async () => {
  const { addItem, countItems } = await import('../server/player.js');
  const acc = await auth.registerAccount('Swaptest', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Swap', race: 'human', guild: 'paladin' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  addItem(p, 'padded_cloth', 1);
  handleCommand(game, p, 'wear padded_cloth');
  assert.equal(p.equipment.torso.id, 'padded_cloth');

  addItem(p, 'leather', 1);
  handleCommand(game, p, 'wear leather');
  assert.equal(p.equipment.torso.id, 'leather', 'new armor equipped');
  assert.equal(countItems(p, 'padded_cloth'), 1, 'old armor returned to inventory');

  game.removePlayer(p);
});

test('forging: ore, quality ladder, and crafted steel', async () => {
  const { countItems, skillRank } = await import('../server/player.js');
  const { qualityRoll } = await import('../data/forging.js');
  const acc = await auth.registerAccount('Forging', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Hamm', race: 'human', guild: 'paladin' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  // Quality ladder sanity.
  const qLow = qualityRoll(0);
  const qHigh = qualityRoll(50);
  assert.ok(qHigh.mult >= qLow.mult, 'better skill -> better quality');
  assert.ok(['practically worthless', 'mediocre', 'about average', 'well-crafted', 'masterfully-crafted'].includes(qLow.name));

  // Forge requires the Ember Forge room.
  handleCommand(game, p, 'forge forged_short_sword');
  assert.match(ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).join(' '), /Ember Forge/, 'gated to the forge');

  game.move(p, 'e'); game.move(p, 'e'); game.move(p, 'e'); game.move(p, 'n'); game.move(p, 'e'); // square -> bazaar -> market way -> brewery -> forge
  assert.equal(p.room, 'forge');
  handleCommand(game, p, 'forge forged_short_sword');
  assert.match(ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).join(' '), /You lack materials/, 'materials required');

  const { addItem } = await import('../server/player.js');
  addItem(p, 'iron_ore', 3);
  p.skills.forging = { rank: 10, exp: 0 };
  handleCommand(game, p, 'forge forged_short_sword');
  assert.equal(countItems(p, 'forged_short_sword'), 1, 'crafted weapon produced');
  assert.equal(countItems(p, 'iron_ore'), 1, 'materials consumed');
  assert.ok(skillRank(p, 'forging') + p.skills.forging.exp > 0, 'forging trains');
  assert.ok(p.forgedQuality.forged_short_sword > 0, 'quality recorded');

  game.removePlayer(p);
});

