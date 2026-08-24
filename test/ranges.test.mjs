// Combat ranges (DR): missile/pole/melee, advance/retreat/assess, movement
// gating, and class-based roundtimes.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  auth, createCharacter, loadPlayer, Game, handleCommand, fakeWs, game,
  setupGame, teardownGame,
} from './helpers.mjs';
// Walk a player along the derived grid path between rooms (layout-agnostic).
import { findPath } from '../data/grid.js';
function walk(game, pl, to) {
  for (const step of findPath(pl.room, to)) game.move(pl, step);
}

import { weaponRT, vitalityLabel } from '../server/combat.js';

before(() => setupGame());
after(() => teardownGame());

async function fresh(name, guild = 'barbarian') {
  const acc = await auth.registerAccount(name, 's3cretword');
  const cid = createCharacter(acc.accountId, { name: name.slice(0, 12), race: 'gortog', guild });
  const p = loadPlayer(cid);
  p.ws = fakeWs();
  game.addPlayer(p);
  return p;
}

test('attack presses in to melee and resolves a fight in the sewers', async () => {
  const p = await fresh('RangetestA');
  const { addItem } = await import('../server/player.js');
  addItem(p, 'short_sword', 1);
  handleCommand(game, p, 'wield short_sword');
  walk(game, p, 'sewers_2'); // pole range
  const rat = game.creaturesIn(p.room).find((c) => c.def.id === 'rat') || game.creaturesIn(p.room)[0];
  handleCommand(game, p, `attack ${rat.def.id}`);
  let combat = game.combat.getFor(p);
  assert.ok(combat, 'combat started');
  const enemy = combat.aliveEnemies[0];
  assert.equal(enemy.range, 'melee', 'attack auto-advances to melee');
  let safety = 0;
  while (game.combat.getFor(p) && safety++ < 60) game.combat.getFor(p).tick();
  assert.equal(game.combat.getFor(p), null, 'fight resolves');
  game.removePlayer(p);
});

test('assess reports ranges and your weapon reach', async () => {
  const p = await fresh('RangetestB');
  walk(game, p, 'sewers_1');
  const rat = game.creaturesIn(p.room).find((c) => c.def.id === 'rat') || game.creaturesIn(p.room)[0];
  game.startCombat(p, [rat.def]);
  handleCommand(game, p, 'assess');
  const msgs = p.ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).join('\n');
  assert.match(msgs, /at (missile|pole|melee) range/, 'assess shows ranges');
  assert.match(msgs, /can reach: melee/, 'assess shows weapon reach');
  while (game.combat.getFor(p)) game.combat.getFor(p).tick();
  game.removePlayer(p);
});

test('advance closes a range; retreat backs off; retreat at missile disengages', async () => {
  const p = await fresh('RangetestC');
  walk(game, p, 'sewers_1');
  const rat = game.creaturesIn(p.room).find((c) => c.def.id === 'rat') || game.creaturesIn(p.room)[0];
  game.startCombat(p, [rat.def]);
  const combat = game.combat.getFor(p);
  const e = combat.aliveEnemies[0];
  const start = e.range;
  handleCommand(game, p, 'advance');
  assert.notEqual(e.range, start, 'advance closed the gap');
  handleCommand(game, p, 'retreat');
  assert.equal(e.range, start, 'retreat moved back');
  // retreat at missile range disengages entirely
  e.range = 'missile';
  const disengaged = combat.retreat();
  assert.ok(disengaged, 'retreat at missile disengages');
  game.removePlayer(p);
});

test('movement is blocked at melee/pole, allowed when only at missile', async () => {
  const p = await fresh('RangetestD');
  walk(game, p, 'sewers_1');
  const rat = game.creaturesIn(p.room).find((c) => c.def.id === 'rat') || game.creaturesIn(p.room)[0];
  game.startCombat(p, [rat.def]);
  const combat = game.combat.getFor(p);
  combat.aliveEnemies[0].range = 'melee';
  const blocked = game.move(p, 'u');
  assert.equal(blocked.ok, false, 'blocked while a foe is at melee');
  combat.aliveEnemies[0].range = 'missile';
  const free = game.move(p, 'u');
  assert.equal(free.ok, true, 'free when foes are only at missile range');
  assert.equal(game.combat.getFor(p), null, 'leaving ends combat');
  game.removePlayer(p);
});

test('class roundtimes: light swings faster than a two-hander; vitality words', async () => {
  const { addItem } = await import('../server/player.js');
  const p = await fresh('RangetestE');
  // brawling baseline
  const fists = weaponRT(p);
  addItem(p, 'short_sword', 1); // light
  handleCommand(game, p, 'wield short_sword');
  const light = weaponRT(p);
  addItem(p, 'greatsword', 1); // twohanded
  handleCommand(game, p, 'wield greatsword');
  const two = weaponRT(p);
  assert.ok(light <= fists, 'a light blade is no slower than fists');
  assert.ok(two >= light, 'a two-hander is slower than a light blade');
  assert.ok(two >= 4, 'two-handers stay near the DR minimum');
  assert.equal(vitalityLabel(50, 100), 'very beat up', 'DR vitality words');
  assert.equal(vitalityLabel(5, 100), 'near death');
  assert.equal(vitalityLabel(99, 100), 'in good shape');
  game.removePlayer(p);
});
