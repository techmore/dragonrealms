// Domain suite: justice loop completion (Pillar 27) — town debts, guard
// garnishment, justice-zone variants, and the Rite of Departure (DEPART ITEM).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  auth, createCharacter, loadPlayer, Game, handleCommand, fakeWs, game,
  setupGame, teardownGame,
} from './helpers.mjs';
import { CREATURES } from '../data/creatures.js';
import { addItem } from '../server/player.js';

before(() => setupGame());
after(() => teardownGame());

async function makeChar(name, guild = 'thief', race = 'halfling') {
  const acc = await auth.registerAccount('Just' + name + Math.floor(Math.random() * 9999), 's3cretword');
  const charId = createCharacter(acc.accountId, { name, race, guild });
  const p = loadPlayer(charId);
  p.ws = fakeWs();
  game.addPlayer(p);
  return p;
}

test('justice zones: wilds are lawless, the Guild District is strict', async () => {
  const p = await makeChar('Zoner');
  p.room = 'square';
  assert.equal(game.justiceZone(p), 'standard');
  p.room = 'guild_district';
  assert.equal(game.justiceZone(p), 'strict');
  p.room = 'sewers_1';
  assert.equal(game.justiceZone(p), 'none');
  game.removePlayer(p);
});

test('guilty pleas with light purses create town debt; paydebt clears it', async () => {
  const p = await makeChar('Debtor');
  // Simulate a completed sentence in jail with a warrant (fine > purse).
  p.room = 'jail';
  p.jailUntil = Date.now() - 1000;
  p.warrant = { charge: 'theft', issuedAt: Date.now() };
  p.silver = 3;
  handleCommand(game, p, 'plead guilty');
  assert.ok((p.debt || 0) > 0, 'unpaid fine became debt');
  assert.equal(p.silver, 0, 'purse emptied toward the fine');

  // Pay it down at the bank.
  p.silver = 60;
  p.room = 'bank_plaza';
  handleCommand(game, p, 'paydebt 50');
  assert.equal(p.debt, 0, 'debt cleared at the bank');
  assert.equal(p.silver, 43, 'payment capped at the debt owed');
  game.removePlayer(p);
});

test('guards garnish debtors on sight', async () => {
  const p = await makeChar('Garnished');
  p.debt = 100;
  p.silver = 40;
  p.room = 'north_gate'; // guarded room
  game.pursueWarrant(p);
  assert.ok(p.silver < 40, 'guard took a garnish');
  assert.ok(p.debt < 100 && p.debt > 0, 'garnish reduced but did not clear the debt');
  game.removePlayer(p);
});

test('rite of departure draws one item from your last corpse for a fee', async () => {
  const p = await makeChar('Departed', 'warmage');
  p.circle = 3;
  p.room = 'sewers_1';
  p.inventory = [];
  addItem(p, 'long_sword', 1);
  addItem(p, 'leather_boots', 1);
  const corpse = game.dropCorpse(p);
  assert.ok(corpse, 'corpse dropped');
  p.lastCorpse = { uid: corpse.uid, room: 'sewers_1' };
  p.room = 'temple';
  p.silver = 500;

  // Wrong place refused.
  p.room = 'square';
  handleCommand(game, p, 'depart long sword');
  assert.match(lastMsg(wsOf(p)), /Temple of the Pantheon/);

  // At the temple: the rite moves exactly one item and charges once.
  p.room = 'temple';
  const silverBefore = p.silver;
  handleCommand(game, p, 'depart long sword');
  assert.ok(p.inventory.some((e) => e.item.id === 'long_sword'), 'item drawn to the altar-bearer');
  assert.equal(p.silver, silverBefore - 30, 'fee is 10 x circle');
  assert.ok(corpse.departed, 'rite marked as performed');

  // Once per corpse.
  handleCommand(game, p, 'depart leather boots');
  assert.match(lastMsg(wsOf(p)), /already been sung/);
  game.removePlayer(p);
});

// ---- helpers ----
function wsOf(p) { return p.ws; }
function lastMsg(ws) {
  return ws.msgs.map((m) => `${m.t}:${m.msg || ''}`).join('\n');
}
