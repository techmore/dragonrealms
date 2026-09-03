// Domain suite: combat.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  auth, db, createCharacter, loadPlayer, Game, handleCommand, fakeWs, game,
  setupGame, teardownGame, reviveRoomSpawns,
} from './helpers.mjs';
// Walk a player along the derived grid path between rooms (layout-agnostic).
// Revives the destination room's spawns — C1 makes kills deplete rooms, and
// the suite teleports without waiting for restock.
import { findPath } from '../data/grid.js';
function walk(game, p, to) {
  for (const step of findPath(p.room, to)) game.move(p, step);
  reviveRoomSpawns(game, p.room);
}


before(() => setupGame());
after(() => teardownGame());

// Limb armor: arms/legs pieces exist, sell at Briga's, equip into their own
// slots (lighting the paper doll's arm and leg regions) and count toward
// totalArmor — previously only torso/head/feet/shield gear existed.
test('arms and legs armor: buy, wear per-slot, count toward totalArmor', async () => {
  const { totalArmor } = await import('../server/player.js');
  const acc = await auth.registerAccount('Limbarmortest', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Limbs', race: 'human', guild: 'paladin' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  walk(game, p, 'bazaar'); // Briga the armorer
  handleCommand(game, p, 'list');
  const listMsg = ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).join(' ');
  assert.match(listMsg, /leather sleeves/i, 'armorer lists arm armor');
  assert.match(listMsg, /mail leggings/i, 'armorer lists leg armor');

  p.silver = 1000;
  for (const id of ['leather_sleeves', 'chain_sleeves', 'leather_pants', 'chain_leggings']) {
    handleCommand(game, p, `buy ${id}`);
    assert.ok(ws.msgs.some((m) => m.t === 'msg' && /You buy/.test(m.msg)), `buy ${id}`);
    ws.msgs.length = 0;
  }
  handleCommand(game, p, 'wear leather_sleeves');
  assert.equal(p.equipment.arms.id, 'leather_sleeves');
  p.circle = 3; // chain pieces require circle 3
  handleCommand(game, p, 'wear chain_sleeves'); // replaces in same slot
  assert.equal(p.equipment.arms.id, 'chain_sleeves');
  handleCommand(game, p, 'wear leather_pants');
  assert.equal(p.equipment.legs.id, 'leather_pants');

  // The hands snapshot must carry arms/legs slots for the paper doll.
  const hands = ws.msgs.filter((m) => m.t === 'hands').at(-1);
  assert.ok(hands.slots.arms, 'hands snapshot exposes arms slot');
  assert.ok(hands.slots.legs, 'hands snapshot exposes legs slot');

  // Armor math counts limb pieces (chain sleeves 22 + leather pants 12).
  assert.equal(totalArmor(p), 22 + 12);

  game.removePlayer(p);
});


// Total learning in a skill under the pool model: banked field exp + residual
// rank bits + ranks (ranks stand in for already-consumed bits in >0 checks).
const learned = (p, id) => ((p.expPools && p.expPools[id]) || 0)
  + (p.skills[id]?.exp || 0) + (p.skills[id]?.rank || 0);

test('full gameplay: alloc, shop, combat, skin, sell', async () => {
  const acc = await auth.registerAccount('Hunttest', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Huntsman', race: 'human', guild: 'warmage' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  // alloc points
  handleCommand(game, p, 'alloc str 10');
  assert.equal(p.stats.str, 45);
  assert.equal(p.unspentStat, 20);

  // buy a sword and wield it (Milgrym's real short sword price: 337 Kronars,
  // docs/reference-milgryms-weapons.md)
  p.silver = 1000;
  walk(game, p, 'bazaar'); // shops
  handleCommand(game, p, 'buy short_sword');
  assert.ok(p.silver < 1000);
  handleCommand(game, p, 'wield short_sword');
  assert.equal(p.equipment.hand.id, 'short_sword');
  handleCommand(game, p, 'buy salve');
  assert.ok(ws.msgs.some((m) => m.t === 'msg' && /You buy/.test(m.msg)));

  // go to the sewers and hunt
  walk(game, p, 'square');
  walk(game, p, 'sewers_1');
  const creatures = game.creaturesIn(p.room);
  assert.ok(creatures.length >= 1, 'sewers should have spawns');
  const def = creatures[0].def;

  handleCommand(game, p, `attack ${def.id}`);
  let combat = game.combat.getFor(p);
  assert.ok(combat, 'combat should start');

  // movement blocked during combat
  const beforeRoom = p.room;
  game.move(p, 'n');
  assert.equal(p.room, beforeRoom, 'cannot move in combat');

  // drive ticks
  let safety = 0;
  while (game.combat.getFor(p) && safety++ < 400) combat.tick();
  assert.equal(game.combat.getFor(p), null, 'combat should end');
  const killed = ws.msgs.filter((m) => m.t === 'combat' && /You fell/.test(m.msg));
  assert.ok(killed.length >= 1, 'should have killed a creature');

  // exp gained
  assert.ok(learned(p, 'small_edged') > 0); // short sword is light edged at Milgrym's

  // skin the corpse and sell the loot (skill check can fumble; retry)
  let tries = 0;
  while (p.corpses.length && tries++ < 30) handleCommand(game, p, `skin ${def.id}`);
  assert.ok(p.corpses.length === 0, 'corpse consumed');
  handleCommand(game, p, 'inventory');
  const invMsg = ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).join(' ');
  assert.match(invMsg, /pelt|hide/i, 'loot should be in inventory');

  // sell it (go back to the market)
  walk(game, p, 'bazaar'); handleCommand(game, p, 'sell pelt');
  const sellMsg = ws.msgs.filter((m) => m.t === 'msg' && /sell|not interested/i.test(m.msg)).at(-1)?.msg || '';
  assert.match(sellMsg, /You sell/i, 'should sell the loot');

  game.removePlayer(p);
});

test('defending and parry train when struck in combat', async () => {
  const acc = await auth.registerAccount('Bulwark', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Bulwark', race: 'human', guild: 'paladin' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  walk(game, p, 'bazaar'); // shops
  handleCommand(game, p, 'buy shield_wood');
  handleCommand(game, p, 'wear shield_wood');
  assert.equal(p.equipment.shield.id, 'shield_wood');

  walk(game, p, 'sewers_1');
  const creature = game.creaturesIn(p.room)[0];
  const defBefore = learned(p, 'defending');
  const parryBefore = learned(p, 'parry');
  game.startCombat(p, [creature.def]);
  let combat = game.combat.getFor(p);
  let safety = 0;
  while (game.combat.getFor(p) && safety++ < 300) combat.tick();
  assert.ok(learned(p, 'defending') > defBefore, 'defending should train when struck');
  assert.ok(learned(p, 'parry') > parryBefore, 'parry should train when struck with a shield');

  game.removePlayer(p);
});

test('ranged weapons consume ammo', async () => {
  const acc = await auth.registerAccount('Bowyertest', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Quiver', race: 'human', guild: 'ranger' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  walk(game, p, 'bazaar'); // shops
  p.silver = 400;
  handleCommand(game, p, 'buy hunting_bow');
  handleCommand(game, p, 'buy arrows 10');
  handleCommand(game, p, 'wield bow');

  const { countItems } = await import('../server/player.js');
  assert.equal(countItems(p, 'arrows'), 10);

  walk(game, p, 'sewers_1');
  const creature = game.creaturesIn(p.room).find((c) => c.def.id === 'rat') || game.creaturesIn(p.room)[0];
  handleCommand(game, p, `attack ${creature.def.id}`);
  let combat = game.combat.getFor(p);
  let safety = 0;
  while (game.combat.getFor(p) && safety++ < 200) combat.tick();
  assert.ok(countItems(p, 'arrows') < 10, 'arrows should be consumed in combat');

  game.removePlayer(p);
});

test('PvP duel: challenge, accept, fight, concession', async () => {
  const { addItem } = await import('../server/player.js');
  const accA = await auth.registerAccount('DuelA', 's3cretword');
  const accB = await auth.registerAccount('DuelB', 's3cretword');
  const aId = createCharacter(accA.accountId, { name: 'Alrick', race: 'human', guild: 'barbarian' });
  const bId = createCharacter(accB.accountId, { name: 'Bren', race: 'human', guild: 'warmage' });
  const a = loadPlayer(aId);
  const b = loadPlayer(bId);
  const wsa = fakeWs();
  const wsb = fakeWs();
  a.ws = wsa;
  b.ws = wsb;
  game.addPlayer(a);
  game.addPlayer(b);
  addItem(a, 'short_sword', 1);
  addItem(b, 'short_sword', 1);
  handleCommand(game, a, 'wield short_sword');
  handleCommand(game, b, 'wield short_sword');

  // Duels blocked in town.
  a.room = 'west_gate'; b.room = 'west_gate';
  handleCommand(game, a, 'duel Bren');
  assert.match(wsa.msgs.filter((m) => m.t === 'msg').at(-1)?.msg || '', /guards do not permit/, 'duels blocked in town');

  // In the wilds.
  a.room = 'woods_path'; b.room = 'woods_path';
  handleCommand(game, a, 'duel Bren');
  assert.ok(wsa.msgs.filter((m) => m.t === 'msg').some((m) => /challenge/i.test(m.msg)), 'challenge issued');
  assert.ok(wsb.msgs.filter((m) => m.t === 'msg').some((m) => /duel!/i.test(m.msg)), 'target notified');

  // Decline.
  handleCommand(game, b, 'decline Alrick');
  assert.ok(wsb.msgs.filter((m) => m.t === 'msg').some((m) => /decline/i.test(m.msg)));

  // Re-challenge and accept.
  handleCommand(game, a, 'duel Bren');
  handleCommand(game, b, 'accept Alrick');
  const combat = game.combat.getFor(a);
  assert.ok(combat, 'duel combat started for initiator');
  assert.equal(game.combat.getFor(b), combat, 'duel shared with defender');
  assert.equal(a.combatId, combat.id);
  assert.equal(b.combatId, combat.id);

  // Defender yields -> conceded, combat cleared for both.
  handleCommand(game, b, 'retreat');
  assert.equal(game.combat.getFor(a), null, 'combat cleared for initiator');
  assert.equal(game.combat.getFor(b), null, 'combat cleared for defender');
  assert.equal(a.combatId, null);
  assert.equal(b.combatId, null);

  game.removePlayer(a);
  game.removePlayer(b);
});

test('PvP duel: defender can be defeated to 0 hp', async () => {
  const accA = await auth.registerAccount('DuelC', 's3cretword');
  const accB = await auth.registerAccount('DuelD', 's3cretword');
  const aId = createCharacter(accA.accountId, { name: 'Cedric', race: 'human', guild: 'barbarian' });
  const bId = createCharacter(accB.accountId, { name: 'Dara', race: 'human', guild: 'warmage' });
  const a = loadPlayer(aId);
  const b = loadPlayer(bId);
  const wsa = fakeWs();
  const wsb = fakeWs();
  a.ws = wsa;
  b.ws = wsb;
  game.addPlayer(a);
  game.addPlayer(b);

  a.room = 'marsh_1'; b.room = 'marsh_1';
  b.hp = 5; // defender nearly dead
  handleCommand(game, a, 'duel Dara');
  handleCommand(game, b, 'accept Cedric');
  let combat = game.combat.getFor(a);
  let guard = 0;
  while (game.combat.getFor(a) && guard++ < 80) combat.tick();
  assert.equal(game.combat.getFor(a), null, 'duel resolved');
  assert.equal(b.room, 'temple', 'defeated defender respawns at temple');
  assert.ok(b.hp > 0, 'defender revived at temple');

  game.removePlayer(a);
  game.removePlayer(b);
});

test('armor skill trains when struck in combat', async () => {
  const acc = await auth.registerAccount('Brickwall', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Tank', race: 'human', guild: 'barbarian' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  walk(game, p, 'bazaar'); // shops
  handleCommand(game, p, 'buy leather');
  handleCommand(game, p, 'wear leather');
  assert.equal(p.equipment.torso.id, 'leather');

  walk(game, p, 'sewers_1'); // sewers
  const creature = game.creaturesIn(p.room)[0];
  const expBefore = learned(p, 'light_armor');
  game.startCombat(p, [creature.def]);
  let combat = game.combat.getFor(p);
  let safety = 0;
  while (game.combat.getFor(p) && safety++ < 300) combat.tick();
  assert.ok(learned(p, 'light_armor') > expBefore, 'light_armor should gain exp from being struck');

  game.removePlayer(p);
});

test('capstones: circle 10 unlocks passive + trader sell bonus', async () => {
  const { capstoneFor } = await import('../data/guilds.js');
  const { GUILDS } = await import('../data/guilds.js');
  assert.equal(capstoneFor(GUILDS.warmage).name, 'Pyromaster');
  assert.equal(capstoneFor(GUILDS.paladin).name, 'Aegis of Faith');

  const acc = await auth.registerAccount('Capstest', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Magnate', race: 'human', guild: 'trader' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  // Trader capstone raises sell prices by 25%.
  p.circle = 10;
  p.silver = 0;
  const { addItem } = await import('../server/player.js');
  addItem(p, 'rat_pelt', 1); // value 8 -> 4 normally, 5 with Golden Touch
  walk(game, p, 'bazaar'); // shopkeeper
  handleCommand(game, p, 'sell pelt');
  assert.equal(p.silver, 5, 'Golden Touch multiplies sell price');

  game.removePlayer(p);
});

test('maneuvers: disarm, trip, shield-bash resolve in combat', async () => {
  const acc = await auth.registerAccount('Manutest', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Fencer', race: 'human', guild: 'paladin' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  walk(game, p, 'sewers_1'); // sewers
  const { CREATURES } = await import('../data/creatures.js');
  game.roomCreatures.get(p.room).push(game.makeCreature(CREATURES.rat));
  const creature = game.creaturesIn(p.room)[0];
  handleCommand(game, p, `attack ${creature.def.id}`);
  let combat = game.combat.getFor(p);
  assert.ok(combat);
  combat.tick(); // let it start

  handleCommand(game, p, 'disarm rat');
  const msgs = ws.msgs.filter((m) => m.t === 'combat' || m.t === 'msg').map((m) => m.msg).join(' ');
  assert.match(msgs, /disarm|resists|not ready/, 'disarm narrates an outcome');

  handleCommand(game, p, 'trip rat');
  assert.equal(combat.maneuverCd.trip <= 8, true, 'trip goes on cooldown');

  // shield-bash requires a shield
  handleCommand(game, p, 'bash rat');
  const bashMsgs = ws.msgs.filter((m) => m.t === 'msg' || m.t === 'combat').map((m) => m.msg).join(' ');
  assert.match(bashMsgs, /shield/i, 'bash demands a shield');

  // end combat cleanly
  while (game.combat.getFor(p)) combat.tick();
  game.removePlayer(p);
});

test('inner fire: berserk costs, burns out, kills recharge, pulses cap passively', async () => {
  const acc = await auth.registerAccount('Furyforge', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Furyforge', race: 'gortog', guild: 'barbarian' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  assert.equal(p.innerFire, 100, 'fresh barbarian starts with full inner fire');
  const { SKILLS } = await import('../data/skills.js');
  assert.ok(SKILLS.inner_fire, 'inner_fire skill exists');
  assert.equal(SKILLS.inner_fire.guildSkill, 'barbarian');

  // Berserk costs inner fire and trains the skill.
  walk(game, p, 'sewers_1'); // sewers
  const creature = game.creaturesIn(p.room)[0];
  game.startCombat(p, [creature.def]);
  let combat = game.combat.getFor(p);
  const ifBefore = p.innerFire;
  const skillBefore = learned(p, 'inner_fire');
  handleCommand(game, p, 'berserk');
  assert.ok(p.innerFire < ifBefore, 'berserk costs inner fire');
  assert.ok(learned(p, 'inner_fire') > skillBefore, 'berserk trains inner fire');
  assert.equal(combat.berserk, true);

  // Upkeep drains inner fire; at zero the fury burns out.
  p.innerFire = 4;
  for (let i = 0; i < 5; i++) combat.tick();
  assert.equal(combat.berserk, false, 'fury burns out when inner fire hits zero');
  assert.equal(p.innerFire, 0);

  // A kill kindles inner fire back up.
  const ifAtKill = p.innerFire;
  combat.playerTarget = combat.enemies[0].uid;
  p.mana = 0;
  while (game.combat.getFor(p)) game.combat.getFor(p).tick();
  assert.ok(p.innerFire > ifAtKill, 'kills restore inner fire');

  // Passive regen out of combat is capped (~30 at rank 0)...
  p.innerFire = 5;
  game.manaPulse();
  assert.ok(p.innerFire > 5 && p.innerFire <= 30, 'passive pulse regens toward the cap');

  // ...but active regen in combat pushes past the passive cap.
  game.startCombat(p, [creature.def]);
  p.innerFire = 5;
  for (let i = 0; i < 8; i++) game.manaPulse();
  assert.ok(p.innerFire > 30, 'combat regen exceeds the passive cap');
  while (game.combat.getFor(p)) game.combat.getFor(p).tick();
  game.removePlayer(p);
});

test('barbarian abilities: slots, paths, forms, roars, and masteries', async () => {
  const { barbarianSlots, VOICE_POOL, BARBARIAN_ABILITIES } = await import('../data/abilities.js');
  assert.equal(barbarianSlots(1), 1, 'one slot at circle 1');
  assert.equal(barbarianSlots(10), 6, 'tertiary rate: +1 per even circle');
  assert.equal(BARBARIAN_ABILITIES.length >= 7, true);

  const acc = await auth.registerAccount('Pitmaster', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Pitmaster', race: 'gortog', guild: 'barbarian' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);
  assert.equal(p.voice, VOICE_POOL, 'fresh barbarian has a full voice pool');

  // Learning happens at the hall; paths gate higher abilities.
  handleCommand(game, p, 'learn dragon');
  const noHall = ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).join(' ');
  assert.match(noHall, /guildhall/, 'learning requires the hall');
  walk(game, p, 'hall_barbarian');
  assert.equal(p.room, 'hall_barbarian');

  handleCommand(game, p, 'learn screech');
  let msgs = ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).join(' ');
  assert.match(msgs, /requires 1 Predator/, 'path prerequisite enforced');

  handleCommand(game, p, 'learn dragon');
  assert.ok(p.abilities.includes('dragon'), 'dragon form learned');
  handleCommand(game, p, 'learn wildfire');
  msgs = ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).join(' ');
  assert.match(msgs, /no free ability slots/, 'circle 1 has only one slot');

  // Use the form in combat: costs inner fire, decays over ticks.
  p.abilities = ['dragon', 'everilds_rage', 'screech'];
  walk(game, p, 'sewers_1');
  const creature = game.creaturesIn(p.room)[0];
  game.startCombat(p, [creature.def]);
  let combat = game.combat.getFor(p);
  const ifBefore = p.innerFire;
  handleCommand(game, p, 'form dragon');
  assert.ok(combat.dragonTicks === 30, 'dragon form active');
  assert.ok(p.innerFire < ifBefore, 'form costs inner fire');
  for (let i = 0; i < 3; i++) combat.tick();
  assert.ok(combat.dragonTicks < 30, 'dragon form decays over time');

  // Roars spend voice.
  const voiceBefore = p.voice;
  handleCommand(game, p, 'roar everilds_rage');
  assert.ok(combat.rageTicks > 0, 'rage buff active');
  assert.ok(p.voice < voiceBefore, 'roar spends voice');
  const creature2 = combat.aliveEnemies[0];
  const timerBefore = creature2.timer;
  handleCommand(game, p, 'roar screech rat');
  assert.ok(creature2.timer > timerBefore, 'screech slows the foe');
  while (game.combat.getFor(p)) game.combat.getFor(p).tick();

  // Voice regenerates on pulses; Duelist raises the passive inner fire cap.
  p.voice = 1;
  game.manaPulse();
  assert.ok(p.voice > 1, 'voice regenerates over time');
  p.abilities.push('duelist');
  p.innerFire = 5;
  for (let i = 0; i < 10; i++) game.manaPulse();
  assert.ok(p.innerFire > 30, 'duelist raises the passive cap past 30');

  game.removePlayer(p);
});

test('barbarian specials: whirlwind, war stomp, choke, analyze, and forgetting', async () => {
  const acc = await auth.registerAccount('Whirlmaster', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Whirlmaster', race: 'gortog', guild: 'barbarian' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  // Learning is slot-gated; use is circle-gated.
  walk(game, p, 'hall_barbarian');
  handleCommand(game, p, 'learn choke');
  assert.equal(p.abilities.includes('choke'), true, 'choke learned at the hall');

  // Forgetting: ask the leader about forgetting — frees the slot; cooldown blocks a second.
  handleCommand(game, p, 'ask warchief about forgetting choke');
  let msgs = ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).join(' ');
  assert.match(msgs, /slips from your memory/, 'forgetting frees the ability');
  assert.equal(p.abilities.includes('choke'), false);
  handleCommand(game, p, 'learn choke');
  handleCommand(game, p, 'ask warchief about forgetting choke');
  msgs = ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).join(' ');
  assert.match(msgs, /another ability/, 'forgetting respects the cooldown');
  assert.equal(p.abilities.includes('choke'), true, 'still known after cooldown refusal');

  // Head to the sewers; grant the specials and a high circle for the test.
  walk(game, p, 'sewers_1');
  p.abilities = ['whirlwind', 'war_stomp', 'choke'];
  p.circle = 8;
  p.innerFire = 100;
  const { addItem } = await import('../server/player.js');
  addItem(p, 'broadsword', 1);
  handleCommand(game, p, 'wield broadsword');

  const rats = game.creaturesIn(p.room).filter((c) => c.def.id === 'rat').slice(0, 2);
  game.startCombat(p, rats.map((r) => r.def));
  let combat = game.combat.getFor(p);
  const hpSum = () => combat.aliveEnemies.reduce((s, e) => s + e.hp, 0);
  const before = hpSum();
  handleCommand(game, p, 'whirlwind');
  assert.ok(hpSum() < before, 'whirlwind hits every foe');
  assert.ok(combat.specialCd.whirlwind > 0, 'whirlwind goes on cooldown');
  handleCommand(game, p, 'whirlwind');
  msgs = ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).join(' ');
  assert.match(msgs, /recovering/, 'cooldown blocks a second whirlwind');

  // War stomp staggers all foes.
  const t = combat.aliveEnemies[0];
  const tBefore = t.timer;
  handleCommand(game, p, 'stomp');
  assert.ok(combat.aliveEnemies.every((e) => e.timer > 0), 'stomp shakes the room');
  assert.ok(t.timer > tBefore, 'stomp slows the foe');

  // Choke seizes a single target.
  handleCommand(game, p, 'choke');
  assert.ok(combat.aliveEnemies.some((e) => e.chokedTicks === 5), 'choke grips a foe');

  // Analyze: three combos complete into an advantage.
  combat.specialCd.analyze = 0;
  handleCommand(game, p, 'analyze flame');
  combat.specialCd.analyze = 0;
  handleCommand(game, p, 'analyze flame');
  assert.ok(combat.analyzeTicks === 0, 'combo not finished yet');
  combat.specialCd.analyze = 0;
  handleCommand(game, p, 'analyze flame');
  assert.ok(combat.analyzeTicks === 10, 'combo completes into an advantage');

  while (game.combat.getFor(p)) game.combat.getFor(p).tick();
  game.removePlayer(p);
});

test('barbarian kit: dual load, warhorn, chakrel, magic resistance, flavor verbs', async () => {
  const { addItem, countItems } = await import('../server/player.js');
  const acc = await auth.registerAccount('Barbkit', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Barbkit', race: 'gortog', guild: 'barbarian' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  // Dual Load: a bow fires two arrows at once for barbarians who know it.
  p.circle = 7;
  p.abilities = ['dual_load', 'tenacity'];
  addItem(p, 'hunting_bow', 1);
  addItem(p, 'arrows', 20);
  handleCommand(game, p, 'wield bow');
  walk(game, p, 'sewers_1'); // sewers
  const rat = game.creaturesIn(p.room).find((c) => c.def.id === 'rat') || game.creaturesIn(p.room)[0];
  game.startCombat(p, [rat.def]);
  let combat = game.combat.getFor(p);
  const arrowsBefore = countItems(p, 'arrows');
  for (let i = 0; i < 6; i++) combat.tick(); // one full shot cycle for the bow
  assert.equal(countItems(p, 'arrows'), arrowsBefore - 2, 'dual load consumes two arrows per shot');
  while (game.combat.getFor(p)) game.combat.getFor(p).tick();

  // Warhorn summons beasts; it has a 15-minute cooldown.
  const creaturesBefore = game.creaturesIn(p.room).length;
  addItem(p, 'warhorn', 1);
  handleCommand(game, p, 'use warhorn');
  const hornMsg = ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).join(' ');
  assert.match(hornMsg, /beasts answer it/, 'warhorn summons beasts: ' + hornMsg.slice(-80));
  assert.ok(game.creaturesIn(p.room).length > creaturesBefore, 'warhorn raised the local beast count');
  handleCommand(game, p, 'use warhorn');
  const hornMsgs = ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).join(' ');
  assert.match(hornMsgs, /still settling/, 'warhorn cooldown enforced');

  // Chakrel quickens meditations (tenacity costs 20 instead of 25).
  addItem(p, 'chakrel_1', 1);
  handleCommand(game, p, 'wear chakrel_1');
  assert.equal(p.equipment.neck.id, 'chakrel_1', 'chakrel wears on the neck');
  p.circle = 8;
  addItem(p, 'arrows', 20); // the first fight may have burned most of them
  game.startCombat(p, [game.creaturesIn(p.room)[0].def]);
  combat = game.combat.getFor(p);
  p.innerFire = 100;
  handleCommand(game, p, 'meditate tenacity');
  assert.equal(p.innerFire, 80, 'chakrel cuts meditation cost');
  while (game.combat.getFor(p)) game.combat.getFor(p).tick();

  // Magic resistance: magic-weapon creatures are flagged in the skill data.
  const { SKILLS, CATEGORIES } = await import('../data/skills.js');
  const { CREATURES } = await import('../data/creatures.js');
  assert.equal(SKILLS[CREATURES.wisp.weapon.skill].cat, CATEGORIES.MAGIC, 'wisp attacks with magic');

  // Flavor verbs.
  handleCommand(game, p, 'belch');
  handleCommand(game, p, 'shake hand');
  const flavor = ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).join(' ');
  assert.match(flavor, /belch/, 'barbarian belch has flavor');
  assert.match(flavor, /grip like iron/, 'barbarian handshake has flavor');

  game.removePlayer(p);
});

test('ambush from hiding: preemptive strike, concealment consumed', async () => {
  const { skillRank } = await import('../server/player.js');
  const acc = await auth.registerAccount('Ambush', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Stalker', race: 'human', guild: 'thief' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  p.room = 'sewers_2';
  handleCommand(game, p, 'hide');
  assert.equal(p.hidden, true, 'hiding succeeds');

  const { CREATURES } = await import('../data/creatures.js');
  game.roomCreatures.get(p.room).push(game.makeCreature(CREATURES.rat));
  handleCommand(game, p, 'ambush rat');
  assert.equal(p.hidden, false, 'ambush consumes concealment');
  const ambushMsgs = ws.msgs.filter((m) => m.t === 'combat').map((m) => m.msg).join(' ');
  assert.match(ambushMsgs, /burst from hiding|twists away/, 'ambush narrates the strike');

  // Thieves can hide mid-combat.
  let combat = game.combat.getFor(p);
  if (combat) {
    handleCommand(game, p, 'hide');
    assert.equal(p.hidden, true, 'thief hides mid-fight');
  }
  while (game.combat.getFor(p)) game.combat.getFor(p).tick();
  game.removePlayer(p);
});

test('pvp stance: closed blocks, open starts immediately, surrender ends non-lethally', async () => {
  const accA = await auth.registerAccount('PvpA', 's3cretword');
  const accB = await auth.registerAccount('PvpB', 's3cretword');
  const aId = createCharacter(accA.accountId, { name: 'Aidan', race: 'human', guild: 'barbarian' });
  const bId = createCharacter(accB.accountId, { name: 'Bev', race: 'human', guild: 'warmage' });
  const a = loadPlayer(aId);
  const b = loadPlayer(bId);
  const wsa = fakeWs();
  const wsb = fakeWs();
  a.ws = wsa;
  b.ws = wsb;
  game.addPlayer(a);
  game.addPlayer(b);
  a.room = 'woods_path';
  b.room = 'woods_path';

  // CLOSED target: challenge auto-declined.
  b.pvpStance = 'closed';
  handleCommand(game, a, 'duel Bev');
  assert.match(wsa.msgs.filter((m) => m.t === 'msg').at(-1)?.msg || '', /CLOSED/, 'closed stance refuses challenges');

  // GUARDED (default): challenge + accept.
  b.pvpStance = 'guarded';
  handleCommand(game, a, 'duel Bev pain');
  handleCommand(game, b, 'accept Aidan');
  let combat = game.combat.getFor(a);
  assert.ok(combat, 'duel started');
  assert.equal(combat.duelEnd, 'pain', 'end condition carried through');

  // Surrender resolves non-lethally.
  const hpBefore = b.hp;
  handleCommand(game, b, 'surrender');
  assert.equal(game.combat.getFor(a), null, 'surrender ends the duel');
  assert.equal(b.hp, hpBefore, 'surrender costs no hp');
  assert.equal(a.room, 'woods_path', 'no temple respawn');

  // OPEN target: duel starts without accept.
  b.pvpStance = 'open';
  handleCommand(game, a, 'duel Bev blow');
  combat = game.combat.getFor(a);
  assert.ok(combat, 'open stance allows instant duel');
  assert.equal(combat.duelEnd, 'blow');

  // resolve via ticks (blow ends on first landed hit)
  let guard = 0;
  while (game.combat.getFor(a) && guard++ < 40) combat.tick();
  assert.equal(game.combat.getFor(a), null, 'blow duel resolves');
  assert.equal(a.room, 'woods_path', 'blow duel is non-lethal');
  assert.equal(b.room, 'woods_path', 'defender not teleported');

  game.removePlayer(a);
  game.removePlayer(b);
});

test('khri: concentration-gated thief buffs, break on hit', async () => {
  const { concentrationPool } = await import('../data/khri.js');
  const acc = await auth.registerAccount('Khritest', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Khriley', race: 'human', guild: 'thief' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  assert.ok(concentrationPool(p) >= 8, 'base concentration pool');
  handleCommand(game, p, 'khri focus');
  assert.equal(p.khri.focus > 0, true, 'khri focus active');
  handleCommand(game, p, 'khri elusion');
  assert.equal(p.khri.elusion > 0, true, 'two khri stack within pool');

  // Over-concentration refused.
  p.khri = { elusion: 60, focus: 60, nimbleness: 60, dampen: 60, strike: 60 };
  handleCommand(game, p, 'khri strike');
  const deny = ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).at(-1) || '';
  assert.match(deny, /concentration/, 'over pool refused');
  p.khri = {};

  // Combat: hit shatters khri.
  p.room = 'sewers_1';
  const { CREATURES } = await import('../data/creatures.js');
  game.roomCreatures.get(p.room).push(game.makeCreature(CREATURES.rat));
  p.khri = { focus: 60 };
  handleCommand(game, p, 'attack rat');
  let combat = game.combat.getFor(p);
  let guard = 0;
  while (game.combat.getFor(p) && guard++ < 300) {
    combat.tick();
    if (!Object.values(p.khri || {}).some((t) => t > 0)) break;
  }
  assert.ok(!Object.values(p.khri || {}).some((t) => t > 0), 'hit shatters khri');
  while (game.combat.getFor(p)) game.combat.getFor(p).tick();
  game.removePlayer(p);
});

test('combat death respawns at temple', async () => {  const acc = await auth.registerAccount('Glasstest', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Glassjaw', race: 'halfling', guild: 'thief' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  p.hp = 5;
  const def = (await import('../data/creatures.js')).CREATURES.troll;
  game.startCombat(p, [def]);
  let combat = game.combat.getFor(p);
  let safety = 0;
  while (game.combat.getFor(p) && safety++ < 60) combat.tick();
  assert.equal(game.combat.getFor(p), null);
  assert.equal(p.room, 'temple', 'should respawn at temple');
  assert.ok(p.hp > 0);
  game.removePlayer(p);
});

test('death drops a corpse with your gear at the death site; search and reclaim', async () => {
  const { addItem, countItems } = await import('../server/player.js');
  const acc = await auth.registerAccount('Corpsetest', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Corpsecall', race: 'human', guild: 'paladin' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  addItem(p, 'long_sword', 1);
  addItem(p, 'ration', 3);
  addItem(p, 'potion_heal', 2);
  handleCommand(game, p, 'wield long_sword');
  assert.equal(p.equipment.hand.id, 'long_sword', 'setup: sword equipped');

  p.room = 'sewers_2';
  game.combat.handleDeath(p);
  assert.equal(p.room, 'temple', 'awakens at the temple');
  assert.equal(p.inventory.length, 0, 'inventory emptied');
  assert.equal(p.equipment.hand, undefined, 'equipment stripped');

  const corpse = game.floorItemsIn('sewers_2').find((f) => f.corpse);
  assert.ok(corpse, 'corpse lies at the death site');
  assert.ok(corpse.items.length === 2 && corpse.equipment.length === 1, 'corpse holds carried + worn gear');

  p.room = 'sewers_2';
  p.ws.msgs.length = 0;
  game.look(p);
  assert.ok(ws.msgs.some((m) => m.msg && m.msg.includes('corpse lies here')), 'corpse rendered in the room');

  p.ws.msgs.length = 0;
  handleCommand(game, p, 'search');
  assert.match(ws.msgs.map((m) => m.msg).join(' '), /long sword/, 'search lists worn gear');
  assert.match(ws.msgs.map((m) => m.msg).join(' '), /ration/, 'search lists carried gear');

  handleCommand(game, p, 'get long sword from corpse');
  assert.equal(countItems(p, 'long_sword'), 1, 'worn gear reclaimed');
  handleCommand(game, p, 'get ration from corpse');
  assert.equal(countItems(p, 'ration'), 3, 'carried gear reclaimed with quantity');
  handleCommand(game, p, 'get potion_heal from corpse');
  assert.equal(countItems(p, 'potion_heal'), 2, 'second stack reclaimed');
  assert.ok(!game.floorItemsIn('sewers_2').find((f) => f.corpse), 'corpse vanishes when emptied');

  handleCommand(game, p, 'get corpse');
  assert.match(ws.msgs.map((m) => m.msg).join(' '), /search it/, 'corpse itself cannot be picked up');
  game.removePlayer(p);
});
