// Domain suite: thief ambush moves (Pillar 20) — clout/screen/stun/choke
// layered onto the hidden strike, with circle gates and status effects.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  auth, createCharacter, loadPlayer, Game, handleCommand, fakeWs, game,
  setupGame, teardownGame,
} from './helpers.mjs';
import { CREATURES } from '../data/creatures.js';

before(() => setupGame());
after(() => teardownGame());

async function makeThief(name, circle = 10) {
  const acc = await auth.registerAccount('Amb' + name + Math.floor(Math.random() * 9999), 's3cretword');
  const charId = createCharacter(acc.accountId, { name, race: 'halfling', guild: 'thief' });
  const p = loadPlayer(charId);
  p.ws = fakeWs();
  p.circle = circle;
  p.hidden = true;
  p.silver = 100;
  game.addPlayer(p);
  return p;
}

function spawnCombat(p, creatureId = 'rat') {
  const rat = game.makeCreature(CREATURES[creatureId]);
  game.roomCreatures.get(p.room).push(rat);
  game.startCombat(p, [rat.def]);
  const combat = game.combat.getFor(p);
  const foe = combat.enemies[0];
  return { combat, foe };
}

test('clout stuns the foe for a tick and hits harder', async () => {
  const p = await makeThief('Clouter');
  const { combat, foe } = spawnCombat(p);
  const realRandom = Math.random;
  Math.random = () => 0; // guarantee the strike lands
    handleCommand(game, p, 'ambush rat clout');;
  Math.random = realRandom;
  assert.ok(foe.stunnedTicks >= 1, 'foe reeling from the clout');
  assert.ok(p.ws.msgs.some((m) => /reels, stunned/.test(m.msg || '')));
  // The stunned foe skips its next attack.
  foe.range = 'melee';
  foe.timer = 0;
  const hpBefore = p.hp;
  combat.tick();
  assert.equal(p.hp, hpBefore, 'stunned foe cannot attack');
  game.removePlayer(p);
});

test('screen keeps the thief hidden after the strike', async () => {
  const p = await makeThief('Screened');
  const { foe } = spawnCombat(p);
  const rr = Math.random;
  Math.random = () => 0;
    handleCommand(game, p, 'ambush rat screen');;
  Math.random = rr;
  assert.equal(foe.hp < foe.maxHp, true, 'strike landed');
  assert.equal(p.hidden, true, 'thief melted back into hiding');
  game.removePlayer(p);
});

test('choke halves the foe\u2019s damage for four ticks', async () => {
  const p = await makeThief('Choker');
  const { combat, foe } = spawnCombat(p, 'kobold');
  const rr2 = Math.random;
  Math.random = () => 0;
    handleCommand(game, p, 'ambush kobold choke');;
  Math.random = rr2;
  assert.equal(foe.chokedTicks, 4, 'choke applied');

  // A choked blow lands at half strength (pin RNG so both blows connect).
  foe.range = 'melee';
  foe.timer = 0;
  p.hp = 1000;
  const rr = Math.random;
  Math.random = () => 0; // always hit, lowest roll — deterministic
  const before = p.hp;
  combat.creatureAttack(foe);
  const chokedDmg = before - p.hp;

  foe.chokedTicks = 0; // clear and compare
  const before2 = p.hp;
  combat.creatureAttack(foe);
  const freeDmg = before2 - p.hp;
  Math.random = rr;
  assert.ok(freeDmg > 0, 'free blow connects');
  assert.ok(chokedDmg * 2 <= freeDmg, `choked ${chokedDmg} is at most half of free ${freeDmg}`);
  game.removePlayer(p);
});

test('circle gates and guild gates hold', async () => {
  const young = await makeThief('Young', 1); // below every move gate
  const { foe } = spawnCombat(young);
  handleCommand(game, young, 'ambush rat stun');
  assert.match(
    young.ws.msgs.map((m) => m.msg || '').join('\n'),
    /comes at circle 6/,
    'young thieves cannot stun',
  );
  game.removePlayer(young);

  // Non-thieves are refused outright.
  const barb = await makeChar2('Bashy', 'barbarian');
  barb.hidden = true;
  const { foe: f2 } = spawnCombat(barb);
  handleCommand(game, barb, 'ambush rat clout');
  assert.match(
    barb.ws.msgs.map((m) => m.msg || '').join('\n'),
    /Only thieves know the ambush moves/,
  );
  game.removePlayer(barb);
});

async function makeChar2(name, guild) {
  const acc = await auth.registerAccount('Amb2' + name + Math.floor(Math.random() * 9999), 's3cretword');
  const charId = createCharacter(acc.accountId, { name, race: 'human', guild });
  const p = loadPlayer(charId);
  p.ws = fakeWs();
  game.addPlayer(p);
  return p;
}
