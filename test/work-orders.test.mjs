// Domain suite: work orders + maker's marks (Pillar 26) — piecework from
// craft NPCs, quality-gated fill, claim/abandon, and signed craftsmanship.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  auth, createCharacter, loadPlayer, Game, handleCommand, fakeWs, game,
  setupGame, teardownGame,
} from './helpers.mjs';

before(() => setupGame());
after(() => teardownGame());

async function makeChar(name) {
  const acc = await auth.registerAccount('Wo' + name + Math.floor(Math.random() * 9999), 's3cretword');
  const charId = createCharacter(acc.accountId, { name, race: 'human', guild: 'warmage' });
  const p = loadPlayer(charId);
  p.ws = fakeWs();
  game.addPlayer(p);
  return p;
}

const stream = (p) => p.ws.msgs.map((m) => m.msg || '').join('\n');

test('take an order at the forge; fill it with a qualifying craft; claim pay', async () => {
  const p = await makeChar('Orderly');
  p.room = 'forge';
  p.skills.forging = { rank: 40, exp: 0 };
  p.skills.engineering = { rank: 40, exp: 0 };
  p.inventory = [];
  // Materials for any forge/shape recipe the order might name.
  const { FORGE_RECIPES, ENGINEER_RECIPES } = await import('../data/forging.js');
  const { addItem } = await import('../server/player.js');
  for (const r of [...Object.values(FORGE_RECIPES), ...Object.values(ENGINEER_RECIPES)]) {
    for (const [ing, qty] of Object.entries(r.ingredients)) addItem(p, ing, qty);
  }

  handleCommand(game, p, 'order');
  const o = p.workOrder;
  assert.ok(o && (o.verb === 'forge' || o.verb === 'shape'), 'order taken at the forge');
  assert.match(stream(p), /work order/i);
  assert.ok(o.pay > 0);

  // Craft the ordered recipe with guaranteed-masterful hands, using the
  // station verb the order actually came from.
  const allRecipes = { ...FORGE_RECIPES, ...ENGINEER_RECIPES };
  const def = allRecipes[o.recipeId];
  const realRandom = Math.random;
  Math.random = () => 1;
  try {
    handleCommand(game, p, `${o.verb} ${def.name}`);
  } finally {
    Math.random = realRandom;
  }
  assert.ok(o.done, `order filled — ${JSON.stringify(o)} | resp: ${stream(p).slice(-200)}`);
  assert.match(stream(p), /order claim/);
  assert.ok(!p.inventory.some((e) => e.item.id === o.recipeId), 'output set aside for the order');

  const silverBefore = p.silver;
  handleCommand(game, p, 'order claim');
  assert.equal(p.silver, silverBefore + o.pay, 'claim pays the posted wage');
  assert.equal(p.workOrder, null, 'order clears on claim');
  game.removePlayer(p);
});

test('sub-quality crafts do not fill the order', async () => {
  const p = await makeChar('Sloppy');
  p.room = 'forge';
  p.skills.forging = { rank: 20, exp: 0 }; // order will demand well-crafted (1.2)
  p.inventory = [];
  const { addItem } = await import('../server/player.js');
  addItem(p, 'iron_ore', 2);

  handleCommand(game, p, 'order');
  assert.ok(p.workOrder && p.workOrder.qualMult >= 1.1, `quality gate posted — ${JSON.stringify(p.workOrder)}`);

  const realRandom = Math.random;
  Math.random = () => 0; // worst roll -> mediocre
  try {
    handleCommand(game, p, 'forge forged short sword');
  } finally {
    Math.random = realRandom;
  }
  assert.ok(!p.workOrder.done, 'mediocre work does not fill the order');
  assert.ok(p.inventory.some((e) => e.item.id === 'forged_short_sword'), 'sub-quality output stays yours');
  handleCommand(game, p, 'order abandon');
  assert.equal(p.workOrder, null, 'abandon drops the order');
  game.removePlayer(p);
});

test('orders are station-bound and persist', async () => {
  const p = await makeChar('Stationer');
  p.room = 'forge';
  handleCommand(game, p, 'order');
  assert.ok(p.workOrder);

  // Claiming at the wrong station refuses.
  p.workOrder.done = true;
  p.room = 'tailor_shop';
  handleCommand(game, p, 'order claim');
  assert.match(stream(p), /posts at/);
  assert.ok(p.workOrder, 'not claimed elsewhere');

  // The registry survives persistence.
  game.persistPlayer(p);
  const reloaded = loadPlayer(p.charId);
  assert.deepEqual(reloaded.workOrder?.recipeId, p.workOrder.recipeId, 'work order persists');
  game.removePlayer(p);
});

test("maker's mark: crafted items carry their maker's name into appraise", async () => {
  const p = await makeChar('Signer');
  p.room = 'forge';
  p.skills.forging = { rank: 30, exp: 0 };
  p.inventory = [];
  const { addItem } = await import('../server/player.js');
  addItem(p, 'iron_ore', 2);

  handleCommand(game, p, 'forge forged short sword');
  const entry = p.inventory.find((e) => e.item.id === 'forged_short_sword');
  assert.ok(entry, 'crafted sword in inventory');
  assert.equal(entry.maker, p.name, "maker's mark stored on the instance");

  handleCommand(game, p, `appraise ${entry.item.name}`);
  assert.match(stream(p), new RegExp(`made by ${p.name}`));
  game.removePlayer(p);
});
