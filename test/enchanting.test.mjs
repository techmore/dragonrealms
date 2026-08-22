// Enchanting discipline v1 (roadmap P26 — the last craft discipline).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  auth, createCharacter, loadPlayer, game, handleCommand, fakeWs,
  setupGame, teardownGame,
} from './helpers.mjs';

before(() => setupGame());
after(() => teardownGame());

test('enchant command: room-gated, ingredients consumed, enchanted piece created', async () => {
  const { addItem, countItems } = await import('../server/player.js');
  const acc = await auth.registerAccount('Enchtest1', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Binder', race: 'elothean', guild: 'warmage' });
  const p = loadPlayer(charId);
  p.ws = fakeWs();
  game.addPlayer(p);

  // Wrong room: the binding circle lives at the Enchanting Society.
  handleCommand(game, p, 'imbue enstaff');
  let msgs = wsText(p);
  assert.match(msgs, /Enchanting Society/, 'enchant requires the Society');

  // Teleport next to the circle via the street grid: herald_st is adjacent.
  p.room = 'herald_st';
  game.move(p, 'w');
  assert.equal(p.room, 'enchanting_soc', 'test path reaches the Society');

  // Missing materials -> named, nothing consumed.
  p.skills.enchanting = { rank: 40, exp: 0 };
  addItem(p, 'carved_staff', 1); // no mote yet
  handleCommand(game, p, 'imbue enstaff');
  msgs = wsText(p);
  assert.match(msgs, /lack materials/, 'missing motes are named');
  assert.equal(countItems(p, 'carved_staff'), 1, 'base piece kept on failure');

  // Full attempt: consumes inputs, yields the enchanted piece with quality.
  addItem(p, 'wisp_mote', 1);
  handleCommand(game, p, 'imbue enstaff');
  assert.equal(countItems(p, 'carved_staff'), 0, 'base consumed');
  assert.equal(countItems(p, 'wisp_mote'), 0, 'motes consumed');
  assert.equal(countItems(p, 'enstaff'), 1, 'enchanted staff created');
  msgs = wsText(p);
  assert.match(msgs, /runed oak staff/, 'result narrated');

  // Skill gate: a fresh crafter cannot bind the advanced blade.
  const acc2 = await auth.registerAccount('Enchtest2', 's3cretword');
  const charId2 = createCharacter(acc2.accountId, { name: 'Novice', race: 'human', guild: 'warmage' });
  const q = loadPlayer(charId2);
  q.ws = fakeWs();
  game.addPlayer(q);
  q.room = 'enchanting_soc';
  q.skills.enchanting = { rank: 0, exp: 0 };
  addItem(q, 'forged_steel_sword', 1);
  addItem(q, 'wisp_mote', 2);
  handleCommand(game, q, 'imbue enblade');
  assert.match(wsText(q), /needs \d+ Enchanting/, 'advanced binding gated by skill');
  assert.equal(countItems(q, 'forged_steel_sword'), 1, 'gated attempt consumes nothing');

  game.removePlayer(p);
  game.removePlayer(q);
});

function wsText(p) {
  return p.ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).join(' ');
}
