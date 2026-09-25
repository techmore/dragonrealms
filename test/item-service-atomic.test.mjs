import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { auth, db, createCharacter, loadPlayer, setupGame, teardownGame } from './helpers.mjs';
import { addItem, equipItem } from '../server/player.js';
import { commands } from '../server/commands/items.js';

let game;
let p;

before(async () => {
  game = setupGame();
  const account = await auth.registerAccount('repairatomic', 's3cretword');
  p = loadPlayer(createCharacter(account.accountId, {
    name: 'Repairatom', race: 'human', guild: 'barbarian',
  }));
  game.addPlayer(p);
  p.room = 'forge';
  p.silver = 1000;
  addItem(p, 'forged_short_sword', 1, { condition: 37, quality: 1.1, maker: 'Mender' });
  assert.equal(equipItem(p, p.inventory[0]).ok, true);
  p.equipment.hand.condition = 37;
  game.persistPlayer(p);
});

after(teardownGame);

test('failed repair restores payment, condition, experience, and durable state', () => {
  const before = {
    silver: p.silver,
    condition: p.equipment.hand.condition,
    expPools: structuredClone(p.expPools),
  };
  const messages = [];
  db.exec(`CREATE TRIGGER reject_repair
    BEFORE UPDATE OF silver ON characters WHEN NEW.id = ${p.charId}
    BEGIN SELECT RAISE(ABORT, 'injected repair failure'); END`);
  try {
    commands.repair({ game, p, arg1: 'forged short sword', emit: (message) => messages.push(message) });
  } finally { db.exec('DROP TRIGGER reject_repair'); }

  assert.match(messages.join('\n'), /cannot be recorded/);
  assert.equal(p.silver, before.silver);
  assert.equal(p.equipment.hand.condition, before.condition);
  assert.deepEqual(p.expPools, before.expPools);
  const disk = loadPlayer(p.charId);
  assert.equal(disk.silver, before.silver);
  assert.equal(disk.equipment.hand.condition, before.condition);
  assert.deepEqual(disk.expPools, before.expPools);
});

test('successful repair commits payment, condition, and experience before success', () => {
  const silver = p.silver;
  const pool = p.expPools.forging || 0;
  const messages = [];
  commands.repair({ game, p, arg1: 'forged short sword', emit: (message) => messages.push(message) });
  assert.match(messages.join('\n'), /as good as new/);
  assert.ok(p.silver < silver);
  assert.equal(p.equipment.hand.condition, 100);
  assert.equal(p.expPools.forging, pool + 8);
  const disk = loadPlayer(p.charId);
  assert.equal(disk.silver, p.silver);
  assert.equal(disk.equipment.hand.condition, 100);
  assert.equal(disk.equipment.hand.maker, 'Mender');
  assert.equal(disk.expPools.forging, pool + 8);
});
