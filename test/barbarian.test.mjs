// Barbarian build-out suite: magic resistance, serenity/dispel/mage's lash,
// titan/exemplar masteries, warpaint, roar helm, weaponsmithing affinity.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  auth, createCharacter, loadPlayer, game, handleCommand, fakeWs,
  setupGame, teardownGame,
} from './helpers.mjs';
import { barbarianAbilityById } from '../data/abilities.js';

// Deterministic RNG so damage-comparison tests are exact, not statistical.
let seed = 246813579;
Math.random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

before(() => setupGame());
after(() => teardownGame());

async function mkBarbarian(name, abilities = []) {
  const acc = await auth.registerAccount(name, 's3cretword');
  const charId = createCharacter(acc.accountId, { name, race: 'gortog', guild: 'barbarian' });
  const p = loadPlayer(charId);
  p.ws = fakeWs();
  p.abilities = abilities;
  p.room = 'marsh_1';
  // Each test owns the room: clear leftover creatures from earlier tests.
  game.roomCreatures.set('marsh_1', []);
  game.addPlayer(p);
  return p;
}

async function combatWithWisp(p) {
  const { CREATURES } = await import('../data/creatures.js');
  const wisp = game.makeCreature(CREATURES.wisp);
  game.roomCreatures.get('marsh_1').push(wisp);
  game.startCombat(p, [wisp.def]);
  const combat = game.combat.getFor(p);
  return { wisp, combat };
}

const sumDamage = (combat, n) => {
  // Every damage run starts from the same seed: hit/damage sequences are
  // identical across compared configs, so differences are exact.
  seed = 42;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const before = combat.player.hp;
    combat.creatureAttack(combat.enemies[0]);
    total += before - combat.player.hp;
  }
  return total;
};

test('magic resistance: scales with Defending, Serenity halves what gets through', async () => {
  const { SKILLS, CATEGORIES } = await import('../data/skills.js');
  const { CREATURES } = await import('../data/creatures.js');
  assert.equal(SKILLS[CREATURES.wisp.weapon.skill].cat, CATEGORIES.MAGIC, 'wisp attacks with magic');

  const plain = await mkBarbarian('WardPlain');
  const { combat: c1 } = await combatWithWisp(plain);
  const base = sumDamage(c1, 25);

  const skilled = await mkBarbarian('WardSkill');
  skilled.skills.defending = { rank: 40, exp: 0 };
  const { combat: c2 } = await combatWithWisp(skilled);
  const withDef = sumDamage(c2, 25);
  assert.ok(withDef < base, `Defending 40 cuts magic damage (${withDef} < ${base})`);

  const serene = await mkBarbarian('WardSerene', ['serenity']);
  const { combat: c3 } = await combatWithWisp(serene);
  c3.serenityTicks = 30;
  const withSerenity = sumDamage(c3, 25);
  assert.ok(withSerenity < withDef, `Serenity ward halves magic damage (${withSerenity} < ${withDef})`);

  for (const p of [plain, skilled, serene]) game.removePlayer(p);
});

test('dispel silences a foe\'s magic; mage\'s lash reflects spells', async () => {
  const dispeller = await mkBarbarian('DispelX', ['dispel']);
  const { combat: c1 } = await combatWithWisp(dispeller);
  dispeller.innerFire = 100;
  handleCommand(game, dispeller, 'dispel wisp');
  assert.equal(c1.enemies[0].dispelledTicks, 5, 'dispel lands 5 ticks of silence');
  const silenced = sumDamage(c1, 10);
  assert.ok(silenced < 30, `dispelled wisp deals little damage (${silenced})`);

  const lasher = await mkBarbarian('LashX', ['mages_lash']);
  const { wisp: w2, combat: c2 } = await combatWithWisp(lasher);
  lasher.innerFire = 100;
  handleCommand(game, lasher, 'mageslash');
  assert.equal(c2.magesLash, true, 'mage\'s lash ignites');
  const hpBefore = w2.hp;
  for (let i = 0; i < 6; i++) c2.creatureAttack(w2);
  assert.ok(w2.hp < hpBefore, 'reflect damage hurt the caster');
  assert.ok(lasher.hp > 0, 'the barbarian survived');

  for (const p of [dispeller, lasher]) game.removePlayer(p);
});

test('masteries: titan swells health, exemplar grants stance points', async () => {
  const { recalcDerived } = await import('../server/commands/util.js');
  const { stancePoints } = await import('../server/player.js');

  const plain = await mkBarbarian('MasterPlain');
  const baseHp = plain.maxHp;
  recalcDerived(plain);
  assert.equal(plain.maxHp, baseHp, 'no titan, no bonus');

  const titan = await mkBarbarian('MasterTitan', ['titan']);
  recalcDerived(titan);
  assert.equal(titan.maxHp, Math.floor(baseHp * 1.15), 'titan adds 15% health');

  const basePts = stancePoints(plain);
  const exemplar = await mkBarbarian('MasterExemp', ['exemplar']);
  assert.equal(stancePoints(exemplar), basePts + 2, 'exemplar adds 2 stance points');

  for (const p of [plain, titan, exemplar]) game.removePlayer(p);
});

const sumPlayerDamage = (combat, n) => {
  seed = 42;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const before = combat.enemies[0].hp;
    combat.playerAttack();
    total += Math.max(0, before - combat.enemies[0].hp);
  }
  return total;
};

test('warpaint buffs damage and decays; roar helm quickens and strengthens roars', async () => {
  const { addItem } = await import('../server/player.js');
  const { CREATURES } = await import('../data/creatures.js');

  // Same combat, same miss rate: 60 strikes bare, then 60 with war paint.
  const p = await mkBarbarian('PaintX', ['everilds_rage']);
  p.circle = 8; // raise the effective-rank cap so hits land
  p.skills.medium_edged = { rank: 30, exp: 0 };
  addItem(p, 'short_sword', 1);
  handleCommand(game, p, 'wield short_sword');
  const rat = game.makeCreature(CREATURES.rat);
  game.roomCreatures.get('marsh_1').push(rat);
  game.startCombat(p, [rat.def]);
  const combat = game.combat.getFor(p);
  const bare = sumPlayerDamage(combat, 60);
  combat.enemies[0].dead = false;
  combat.enemies[0].hp = 100; // the rat barely survived; restore it
  addItem(p, 'warpaint', 1);
  handleCommand(game, p, 'use warpaint');
  assert.equal(p.buffs.warpaint, 40, 'warpaint daubed on');
  const painted = sumPlayerDamage(combat, 60);
  assert.ok(painted > bare * 1.05, `warpaint strikes harder (${painted} > ${bare} * 1.05)`);
  game.removePlayer(p);

  // Roar helm: half voice cost, stronger rage.
  const p3 = await mkBarbarian('RoarX', ['everilds_rage']);
  addItem(p3, 'roar_helm', 1);
  handleCommand(game, p3, 'wear roar_helm');
  game.startCombat(p3, [game.makeCreature(CREATURES.rat).def]);
  const c3 = game.combat.getFor(p3);
  p3.voice = 6;
  const res = c3.useAbility(barbarianAbilityById('everilds_rage'), c3.playerTarget);
  assert.equal(res.ok, true, 'rage usable with 6 voice under the helm');
  assert.equal(p3.voice, 1, 'helm halves the voice cost (5)');
  assert.equal(c3.roarHelm, true, 'helm rage flagged');
  game.removePlayer(p3);
});

test('weaponsmithing affinity: barbarians forge weapons with a natural edge', async () => {
  const { addItem } = await import('../server/player.js');
  const acc = await auth.registerAccount('SmithBarb', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Smithb', race: 'gortog', guild: 'barbarian' });
  const p = loadPlayer(charId);
  p.ws = fakeWs();
  p.room = 'forge';
  game.addPlayer(p);
  addItem(p, 'iron_ore', 2);
  handleCommand(game, p, 'forge short sword');
  const msgs = p.ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).join(' ');
  assert.match(msgs, /finely forged short sword/, 'barbarian forges a weapon: ' + msgs.slice(-60));
  assert.ok(p.forgedQuality && p.forgedQuality.forged_short_sword, 'forged quality recorded');
  game.removePlayer(p);
});

test('serenity meditation purges corruption and raises the ward', async () => {
  const p = await mkBarbarian('SereneCmd', ['serenity']);
  p.buffs = { negative: -3, frenzy: 10 };
  const { combat } = await combatWithWisp(p);
  p.innerFire = 100;
  handleCommand(game, p, 'meditate serenity');
  assert.equal(combat.serenityTicks, 30, 'ward raised via the command');
  assert.equal(p.buffs.negative, undefined, 'corruption purged');
  assert.equal(p.buffs.frenzy, 10, 'positive buffs untouched');
  game.removePlayer(p);
});
