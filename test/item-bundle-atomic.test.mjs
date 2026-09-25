import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { auth, db, createCharacter, loadPlayer, setupGame, teardownGame } from './helpers.mjs';
import { addItem } from '../server/player.js';
import { commands } from '../server/commands/items.js';

let p;
let game;

before(async () => {
  game = setupGame();
  const account = await auth.registerAccount('bundleatomics', 's3cretword');
  p = loadPlayer(createCharacter(account.accountId, {
    name: 'Bundleatom', race: 'human', guild: 'barbarian',
  }));
});

after(teardownGame);

function run(command, arg1, arg2 = '') {
  const messages = [];
  commands[command]({ p, arg1, arg2, emit: (message) => messages.push(message) });
  return messages.join('\n');
}

test('failed bundle replacement restores loose runtime and durable inventory', () => {
  addItem(p, 'rat_pelt', 3);
  const before = structuredClone(p.inventory);
  db.exec(`CREATE TRIGGER reject_bundle_insert
    BEFORE INSERT ON inventory WHEN NEW.character_id = ${p.charId}
    BEGIN SELECT RAISE(ABORT, 'injected bundle insert failure'); END`);
  try {
    const message = run('bundle', 'rat_pelt', '3');
    assert.match(message, /nothing changed/);
  } finally {
    db.exec('DROP TRIGGER reject_bundle_insert');
  }

  assert.deepEqual(p.inventory, before);
  assert.equal(p.inventory[0].bundle, undefined);
  assert.deepEqual(
    { ...db.prepare('SELECT item_id, qty, bundle FROM inventory WHERE character_id=?').get(p.charId) },
    { item_id: 'rat_pelt', qty: 3, bundle: null },
  );

  assert.match(run('bundle', 'rat_pelt', '3'), /compact bundle/);
  const bundled = p.inventory.find((entry) => entry.item.id === 'rat_pelt');
  assert.deepEqual(bundled.bundle, { bundled: 3 });
  assert.deepEqual(loadPlayer(p.charId).inventory[0].bundle, { bundled: 3 });
});

test('failed unbundle preserves the durable and runtime bundle marker', () => {
  const before = structuredClone(p.inventory);
  db.exec(`CREATE TRIGGER reject_unbundle_update
    BEFORE UPDATE OF bundle ON inventory WHEN OLD.character_id = ${p.charId} AND OLD.bundle IS NOT NULL
    BEGIN SELECT RAISE(ABORT, 'injected unbundle update failure'); END`);
  try {
    assert.match(run('unbundle', 'rat_pelt'), /remains intact/);
  } finally {
    db.exec('DROP TRIGGER reject_unbundle_update');
  }

  assert.deepEqual(p.inventory, before);
  assert.deepEqual(loadPlayer(p.charId).inventory[0].bundle, { bundled: 3 });

  assert.match(run('unbundle', 'rat_pelt'), /cut the ties/);
  assert.equal(p.inventory[0].bundle, null);
  const reloaded = loadPlayer(p.charId).inventory[0];
  assert.equal(reloaded.bundle, undefined);
  assert.equal(reloaded.qty, 3);
});
