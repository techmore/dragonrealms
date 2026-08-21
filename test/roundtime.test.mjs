// Roundtime suite: DR pacing mechanic. RT actions set the timer and are
// refused while it runs (real WS sessions only — `applyRT`), movement and
// passive reads stay free.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  auth, createCharacter, loadPlayer, Game, handleCommand, fakeWs, game,
  setupGame, teardownGame,
} from './helpers.mjs';
import { setRoundtime, roundtimeLeft } from '../server/player.js';

before(() => setupGame());
after(() => teardownGame());

async function fresh(guild = 'ranger') {
  const acc = await awaitAuth('Rt' + guild);
  const charId = createCharacter(acc.accountId, { name: 'Rttest' + guild + String.fromCharCode(64 + accSeq), race: 'human', guild });
  const p = loadPlayer(charId);
  p.ws = fakeWs();
  game.addPlayer(p);
  return p;
}

let accSeq = 0;
async function awaitAuth(name) {
  accSeq += 1;
  return auth.registerAccount(name + accSeq, 's3cretword');
}

test('setRoundtime / roundtimeLeft bookkeeping', async () => {
  const p = await fresh('thief');
  assert.equal(roundtimeLeft(p), 0, 'fresh player has no roundtime');
  setRoundtime(p, 5);
  assert.ok(roundtimeLeft(p) >= 5 && roundtimeLeft(p) <= 6, 'RT counts down from ~5s');
  setRoundtime(p, 0);
  assert.equal(roundtimeLeft(p), 0, 'zero clears RT');
});

test('forage grants roundtime and is refused during it (applyRT session)', async () => {
  const p = await fresh('ranger');
  p.room = 'woods_1';
  p.hp = p.maxHp;
  handleCommand(game, p, 'forage');
  assert.ok(roundtimeLeft(p) > 0, 'forage set roundtime');
  const ws = p.ws;
  ws.msgs.length = 0;
  // RT gate only bites in real sessions (applyRT), like the WS router passes.
  handleCommand(game, p, 'forage', 0, { applyRT: true });
  const blocked = ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).join(' ');
  assert.match(blocked, /You must wait \d+ seconds? before you can do that/, 'RT action refused during roundtime');
});

test('movement and passive reads stay free during roundtime', async () => {
  const p = await fresh('thief');
  setRoundtime(p, 30);
  const roomBefore = p.room;
  handleCommand(game, p, 'look', 0, { applyRT: true });
  assert.equal(p.room, roomBefore, 'look is free');
  handleCommand(game, p, 's', 0, { applyRT: true });
  assert.notEqual(p.room, roomBefore, 'movement is free during RT');
});

test('crafting aliases are RT-gated while passive devotion remains readable', async () => {
  const { RT_BLOCK, mergeCommandModules } = await import('../server/commands/index.js');
  for (const command of ['forge', 'shape', 'tailor', 'craft', 'unlock', 'sing', 'appr']) {
    assert.equal(RT_BLOCK.has(command), true, `${command} is declared as an RT action`);
  }
  assert.equal(RT_BLOCK.has('devotion'), false, 'devotion is a passive read');
  assert.throws(
    () => mergeCommandModules([['one', { duplicate() {} }], ['two', { duplicate() {} }]]),
    /Duplicate command "duplicate" in one and two/,
    'registry construction rejects silent command overrides',
  );

  const crafter = await fresh('ranger');
  crafter.room = 'forge';
  setRoundtime(crafter, 30);
  handleCommand(game, crafter, 'forge', 0, { applyRT: true });
  const craftMessages = crafter.ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).join(' ');
  assert.match(craftMessages, /You must wait/, 'crafting is refused during RT');

  const cleric = await fresh('cleric');
  setRoundtime(cleric, 30);
  handleCommand(game, cleric, 'devotion', 0, { applyRT: true });
  const messages = cleric.ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).join(' ');
  assert.match(messages, /Your devotion is/, 'passive devotion remains readable during RT');
});

test('combat swing grants roundtime matching weapon speed', async () => {
  const p = await fresh('barbarian');
  p.circle = 7;
  p.abilities = ['dual_load'];
  const { addItem } = await import('../server/player.js');
  addItem(p, 'hunting_bow', 1);
  addItem(p, 'arrows', 40); // dual-load burns 2/shot; enough that misses can't starve it
  handleCommand(game, p, 'wield bow');
  game.move(p, 'nw'); game.move(p, 'w'); game.move(p, 'w'); game.move(p, 'd'); // sewers
  const rat = game.creaturesIn(p.room).find((c) => c.def.id === 'rat') || game.creaturesIn(p.room)[0];
  game.startCombat(p, [rat.def]);
  const combat = game.combat.getFor(p);
  combat.tick();
  // After a full swing cycle the player sits in RT sized by weapon speed.
  for (let i = 0; i < 8; i++) combat.tick();
  assert.ok(roundtimeLeft(p) > 0, 'a swing left the player in roundtime');
  while (game.combat.getFor(p)) game.combat.getFor(p).tick();
});
