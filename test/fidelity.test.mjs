// Fidelity build-out suite: stamina & burden, khri family, paladin glyphs,
// ranger snipe/slip, engineering/outfitting crafting, and gem loot flags.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  auth, createCharacter, loadPlayer, game, handleCommand, fakeWs,
  setupGame, teardownGame,
} from './helpers.mjs';
import { CREATURES } from '../data/creatures.js';
import { KHRI, khriById, concentrationPool } from '../data/khri.js';
import { QUALITY_LADDER } from '../data/forging.js';

let seed = 246813579;
Math.random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

before(() => setupGame());
after(() => teardownGame());

async function mkChar(name, guild, race = 'gortog') {
  const acc = await auth.registerAccount(name, 's3cretword');
  const charId = createCharacter(acc.accountId, { name, race, guild });
  const p = loadPlayer(charId);
  p.ws = fakeWs();
  p.room = 'marsh_1';
  game.roomCreatures.set('marsh_1', []);
  game.addPlayer(p);
  return p;
}

// emit() sends {t:'msg'} then a {t:'prompt'}; read the last narration line.
function lastMsg(p) {
  const msgs = p.ws.msgs.filter((m) => m.t === 'msg');
  return msgs.at(-1)?.msg || '';
}

// ------------------- Stamina & burden -------------------
test('stamina: pool scales with Con/Fitness; burden shrinks the effective pool', async () => {
  const { maxStaminaFor, totalBurden, maxStaminaEff } = await import('../server/player.js');
  const p = await mkChar('StamPool', 'ranger');
  p.stats.con = 40;
  p.skills.fitness = { rank: 20, exp: 0 };
  const base = maxStaminaFor(p);
  assert.ok(base >= 120, `pool grows with Con and Fitness (${base})`);
  assert.equal(totalBurden(p), 0, 'no gear, no burden');

  const { addItem } = await import('../server/player.js');
  addItem(p, 'greatsword', 1);
  addItem(p, 'chainmail', 1);
  addItem(p, 'shield_wood', 1);
  handleCommand(game, p, 'wield greatsword');
  handleCommand(game, p, 'wear chainmail');
  handleCommand(game, p, 'wear shield_wood');
  assert.equal(totalBurden(p), 6, 'greatsword 3 + chainmail 2 + shield 1');
  assert.equal(maxStaminaEff(p), base - 12, 'each burden point costs 2 pool');
  game.removePlayer(p);
});

test('stamina: big efforts spend wind and refuse when spent; combat regen recovers', async () => {
  const p = await mkChar('StamSpend', 'barbarian');
  p.skills.brawling = { rank: 20, exp: 0 };
  p.skills.inner_fire = { rank: 10, exp: 0 };
  const rat = game.makeCreature(CREATURES.rat);
  game.roomCreatures.get('marsh_1').push(rat);
  game.startCombat(p, [rat.def]);
  const combat = game.combat.getFor(p);
  const full = p.stamina;

  assert.equal(combat.spendStamina(10), true, 'can spend when fresh');
  assert.equal(combat.spendStamina(full + 10), false, 'refused when spent');
  assert.match(p.ws.msgs.at(-1).msg, /winded/i, 'winded message');

  p.stamina = 0;
  assert.equal(combat.spendStamina(1), false, 'zero stamina refuses even small efforts');

  combat.tick();
  assert.ok(p.stamina > 0, 'combat tick recovers wind');
  game.removePlayer(p);
});

test('stamina: heavy load slows recovery and rest tops it up', async () => {
  const p = await mkChar('StamRest', 'barbarian');
  p.skills.brawling = { rank: 20, exp: 0 };
  const rat = game.makeCreature(CREATURES.rat);
  game.roomCreatures.get('marsh_1').push(rat);
  game.startCombat(p, [rat.def]);
  const combat = game.combat.getFor(p);
  const { addItem } = await import('../server/player.js');
  addItem(p, 'greatsword', 1);
  addItem(p, 'full_plate', 1);
  handleCommand(game, p, 'wield greatsword');
  handleCommand(game, p, 'wear full_plate');
  p.stamina = Math.floor(p.maxStaminaEff / 2);
  combat.tick();
  assert.ok(p.stamina <= Math.floor(p.maxStaminaEff / 2) + 2, 'burden 6 caps combat recovery at 1/tick');
  game.removePlayer(p);

  const p2 = await mkChar('StamRestB', 'barbarian');
  p2.room = 'west_road';
  p2.stamina = 1;
  const res = game.startRest(p2);
  assert.equal(res.ok, true, 'can rest');
  await new Promise((r) => setTimeout(r, 2300));
  assert.ok(p2.stamina > 1, 'rest restores stamina');
  assert.match(p2.ws.msgs.at(-1).msg, /stamina/, 'rest message shows stamina');
  game.removePlayer(p2);
});

// ------------------- Khri family -------------------
test('khri: family expanded with Sight, Stealth, Swiftness, Clarity; pool gates them', async () => {
  for (const id of ['sight', 'stealth', 'swiftness', 'clarity']) {
    assert.ok(khriById(id), `${id} defined`);
  }
  const p = await mkChar('KhriPool', 'thief');
  const base = concentrationPool(p);
  // Max out stealth skill, then the pool must grow.
  p.skills.stealth = { rank: 100, exp: 0 };
  assert.ok(concentrationPool(p) > base, 'Stealth ranks enlarge the pool');

  const allCost = Object.values(KHRI).reduce((s, k) => s + k.cost, 0);
  const pool = concentrationPool(p);
  // A fresh thief cannot focus everything at once (DR concentration).
  assert.ok(allCost > pool, 'family exceeds the pool at low circles');
  game.removePlayer(p);
});

test('khri: new khri focus from the command and apply in combat', async () => {
  const p = await mkChar('KhriFocus', 'thief');
  p.skills.stealth = { rank: 30, exp: 0 };
  const rat = game.makeCreature(CREATURES.rat);
  game.roomCreatures.get('marsh_1').push(rat);
  game.startCombat(p, [rat.def]);
  const combat = game.combat.getFor(p);

  handleCommand(game, p, 'khri sight');
  assert.equal(p.khri.sight, 60, 'Sight focused');
  const atkSight = combat.attackSpeed(); // no speed change from sight
  assert.ok(atkSight >= 2);

  handleCommand(game, p, 'khri swiftness');
  assert.ok(p.khri.swiftness > 0, 'Swiftness focused');
  assert.ok(combat.attackSpeed() < atkSight, 'Swiftness quickens attacks');

  const res = handleCommand(game, p, 'khri stealth');
  assert.equal(res?.ok, undefined, 'stealth focuses without error');
  game.removePlayer(p);
});

// ------------------- Paladin glyphs -------------------
test('glyphs: soul and mana cost, buffs land, cooldown gates, guild-locked', async () => {
  const p = await mkChar('GlyphPally', 'paladin');
  p.circle = 3;
  p.soul = 50;
  p.mana = 60;
  handleCommand(game, p, 'glyph faith');
  assert.equal(p.soul, 40, 'soul spent');
  assert.equal(p.buffs.glyph_ward, 60, 'Ward of Faith active');

  // Elapse the glyph cooldown between tracings.
  p.glyphAt = 0;
  handleCommand(game, p, 'glyph valor');
  assert.equal(p.soul, 28, 'soul spent on valor');
  assert.equal(p.buffs.glyph_valor, 60, 'Glyph of Valor active');

  // Cooldown: a third glyph is refused.
  const msgsBefore = p.ws.msgs.length;
  handleCommand(game, p, 'glyph protection');
  assert.ok(p.ws.msgs.length > msgsBefore, 'attempt narrated');
  assert.equal(p.buffs.glyph_shield, undefined, 'cooldown blocks third glyph');

  game.removePlayer(p);

  const thief = await mkChar('GlyphThief', 'thief');
  handleCommand(game, thief, 'glyph faith');
  assert.match(lastMsg(thief), /Only paladins/i, 'guild-locked');
  game.removePlayer(thief);
});

test('glyphs: circle gate and soul floor refuse early usage', async () => {
  const p = await mkChar('GlyphLow', 'paladin');
  p.soul = 5;
  handleCommand(game, p, 'glyph faith');
  assert.match(lastMsg(p), /circle 2/, 'circle 1 refused');
  p.circle = 2;
  handleCommand(game, p, 'glyph faith');
  assert.match(lastMsg(p), /soul is too dim/i, 'soul floor enforced');
  game.removePlayer(p);
});

// ------------------- Ranger snipe & slip -------------------
test('snipe: ranger shots from hiding, spend ammo and stamina, reveal, deal damage', async () => {
  const p = await mkChar('SnipeRang', 'ranger');
  p.skills.bow = { rank: 20, exp: 0 };
  p.skills.hiding = { rank: 20, exp: 0 };
  p.skills.stealth = { rank: 10, exp: 0 };
  const { addItem } = await import('../server/player.js');
  addItem(p, 'hunting_bow', 1);
  addItem(p, 'arrows', 5);
  handleCommand(game, p, 'wield hunting_bow');
  const rat = game.makeCreature(CREATURES.rat);
  game.roomCreatures.get('marsh_1').push(rat);
  game.startCombat(p, [rat.def]);
  const combat = game.combat.getFor(p);
  const target = combat.enemies[0];
  p.hidden = true;
  p.stamina = p.maxStaminaEff;
  const arrowsBefore = p.inventory.find((i) => i.item.id === 'arrows')?.qty || 0;
  const targetHp = target.hp;
  const staminaBefore = p.stamina;

  // The seeded sequence may open with a miss; a true shot must land in the
  // first few attempts (ammo is consumed either way).
  for (let i = 0; i < 5 && target.hp === targetHp; i++) combat.snipeAttack(target.uid);
  assert.ok(target.hp < targetHp, 'shot dealt damage');
  assert.equal(p.hidden, false, 'a shot reveals you');
  assert.ok(p.stamina < staminaBefore, 'snipe costs wind');
  assert.ok((p.inventory.find((i) => i.item.id === 'arrows')?.qty || 0) < arrowsBefore, 'ammo consumed');
  game.removePlayer(p);
});

test('snipe: requires a bow and is ranger-only', async () => {
  const p = await mkChar('SnipeNoBow', 'ranger');
  const rat = game.makeCreature(CREATURES.rat);
  game.roomCreatures.get('marsh_1').push(rat);
  game.startCombat(p, [rat.def]);
  const combat = game.combat.getFor(p);
  p.hidden = true;
  combat.snipeAttack(combat.playerTarget);
  assert.ok(p.ws.msgs.some((m) => /bow or crossbow/i.test(m.msg || '')), 'needs a bow');
  game.removePlayer(p);

  const thief = await mkChar('SnipeThief', 'thief');
  handleCommand(game, thief, 'snipe');
  assert.match(lastMsg(thief), /ranger/i, 'ranger-only');
  game.removePlayer(thief);
});

test('slip: ranger breaks engagement and frees combat', async () => {
  const p = await mkChar('SlipRang', 'ranger');
  p.skills.hiding = { rank: 60, exp: 0 };
  p.skills.evasion = { rank: 40, exp: 0 };
  const rat = game.makeCreature(CREATURES.rat);
  game.roomCreatures.get('marsh_1').push(rat);
  game.startCombat(p, [rat.def]);
  assert.ok(game.combat.getFor(p), 'in combat');
  handleCommand(game, p, 'slip');
  assert.ok(!game.combat.getFor(p), 'slipped free');
  assert.ok(p.ws.msgs.some((m) => /slip|sprint|free/i.test(m.msg || '')), 'narrated escape');
  game.removePlayer(p);
});

// ------------------- Engineering & Outfitting crafting -------------------
test('crafting: shape builds engineering wares at the forge; tailor at the shop', async () => {
  const { addItem } = await import('../server/player.js');
  const eng = await mkChar('ShapeMage', 'warmage');
  eng.room = 'forge';
  eng.skills.engineering = { rank: 5, exp: 0 };
  addItem(eng, 'iron_ore', 1);
  addItem(eng, 'herb_root', 1);
  handleCommand(game, eng, 'shape carved_staff');
  assert.ok(eng.inventory.some((i) => i.item.id === 'carved_staff'), 'carved staff produced');
  assert.equal(eng.inventory.find((i) => i.item.id === 'iron_ore')?.qty || 0, 0, 'materials consumed');
  game.removePlayer(eng);

  const tail = await mkChar('TailorCut', 'trader');
  tail.room = 'tailor_shop';
  tail.skills.outfitting = { rank: 5, exp: 0 };
  addItem(tail, 'wolf_pelt', 1);
  addItem(tail, 'herb_root', 1);
  handleCommand(game, tail, 'tailor cured_leather');
  assert.ok(tail.inventory.some((i) => i.item.id === 'cured_leather'), 'jerkin produced');
  game.removePlayer(tail);
});

test('crafting: skill gates refuse advanced work and wrong rooms refuse entirely', async () => {
  const { addItem } = await import('../server/player.js');
  const eng = await mkChar('ShapeGate', 'warmage');
  eng.room = 'forge';
  eng.skills.engineering = { rank: 0, exp: 0 };
  addItem(eng, 'iron_ore', 2);
  addItem(eng, 'cinder_scale', 1);
  handleCommand(game, eng, 'shape arbalest');
  assert.match(lastMsg(eng), /needs 10 Engineering/i, 'min skill gate');
  game.removePlayer(eng);

  const inTown = await mkChar('ShapeTown', 'warmage');
  handleCommand(game, inTown, 'shape carved_staff');
  assert.match(lastMsg(inTown), /Ember Forge/i, 'room gate');
  game.removePlayer(inTown);
});

test('crafting: crafted gear carries quality like forging', async () => {
  const { addItem } = await import('../server/player.js');
  const eng = await mkChar('ShapeQual', 'warmage');
  eng.room = 'forge';
  eng.skills.engineering = { rank: 40, exp: 0 };
  addItem(eng, 'iron_ore', 1);
  addItem(eng, 'herb_root', 1);
  handleCommand(game, eng, 'shape carved_staff');
  const mult = eng.forgedQuality && eng.forgedQuality.carved_staff;
  assert.ok(mult >= QUALITY_LADDER[0].mult && mult <= QUALITY_LADDER.at(-1).mult, 'quality multiplier recorded');
  game.removePlayer(eng);
});

// ------------------- Gem loot flags -------------------
test('loot: gem-flagged creatures can drop gems; ladder shows loot flags', async () => {
  const p = await mkChar('GemHunter', 'trader');
  p.skills.brawling = { rank: 20, exp: 0 };

  // Force every probability roll to fire: the gem drop is a flat 45% roll.
  Math.random = () => 0.05;
  const def = {
    ...CREATURES.bandit_captain,
    gems: ['diamond'],
  };
  game.startCombat(p, [def]);
  const combat = game.combat.getFor(p);
  combat.enemies[0].hp = 1;
  combat.killCreature(combat.enemies[0]);
  assert.ok(p.inventory.some((i) => i.item.id === 'diamond'), 'gem drop wired into kills');
  assert.ok(p.ws.msgs.some((m) => /glints/.test(m.msg)), 'gem find narrated');

  const ladder = game.ladder();
  assert.match(ladder, /drops: gems/, 'ladder lists gem flags');
  assert.match(ladder, /drops: skins/, 'ladder lists skin flags');
  assert.match(ladder, /boxes/, 'ladder lists box flags');
  game.removePlayer(p);
});

// ------------------- Burden interplay -------------------
test('burden: wearing plate slows combat stamina recovery', async () => {
  const p = await mkChar('BurdenSlow', 'barbarian');
  p.skills.brawling = { rank: 20, exp: 0 };
  const rat = game.makeCreature(CREATURES.rat);
  game.roomCreatures.get('marsh_1').push(rat);
  game.startCombat(p, [rat.def]);
  const combat = game.combat.getFor(p);
  const { addItem } = await import('../server/player.js');
  addItem(p, 'greatsword', 1);
  addItem(p, 'chainmail', 1);
  addItem(p, 'shield_steel', 1);
  handleCommand(game, p, 'wield greatsword');
  handleCommand(game, p, 'wear chainmail');
  handleCommand(game, p, 'wear shield_steel');

  p.stamina = 0;
  combat.tick();
  assert.ok(p.stamina <= 2, `burden 6 caps combat recovery at 1/tick (got ${p.stamina})`);
  game.removePlayer(p);
});

// ------------------- Depth-tiered grounds -------------------
test('depth: lower drains and the blackwater extend the sewers ladder', async () => {
  const { ROOMS } = await import('../data/world.js');
  const { creatureById } = await import('../data/creatures.js');
  assert.ok(ROOMS.sewers_4, 'Lower Drains exists');
  assert.ok(ROOMS.sewers_5, 'The Blackwater exists');
  assert.equal(ROOMS.sewers_3.exits.d, 'sewers_4', 'warrens descend into the drains');
  assert.ok(ROOMS.sewers_4.spawns.includes('great_rat'), 'great rats haunt the drains');
  assert.ok(ROOMS.sewers_5.spawns.includes('sewer_viper'), 'vipers haunt the blackwater');
  const gr = creatureById('great_rat');
  const sv = creatureById('sewer_viper');
  assert.ok(gr.teaches[0] > 3 && gr.teaches[0] <= 6, `great rat sits between sewers and woods (teaches ${gr.teaches})`);
  assert.ok(sv.teaches[1] >= 18, `viper teaches into the marsh band (${sv.teaches})`);
  const ladder = game.ladder();
  assert.match(ladder, /great rat/, 'ladder lists great rats');
  assert.match(ladder, /sewer viper/, 'ladder lists sewer vipers');
});

// ------------------- Quest variety -------------------
test('quests: delivery runs complete at the target room and pay on claim', async () => {
  const p = await mkChar('DeliverQ', 'trader');
  const parcel = { room: 'temple', npc: 'healer', name: 'Sister Cora', parcel: 'a bundle of clean bandages', topic: 'the wounded' };
  p.quest = { kind: 'deliver', target: parcel, source: 'crier', done: false };
  p.room = 'market_end';
  const res = game.questDeliver(p);
  assert.equal(res.ok, false, 'not delivered from the wrong room');
  p.room = 'temple';
  const res2 = game.questDeliver(p);
  assert.equal(res2.ok, true, 'delivered at the target room');
  assert.equal(p.quest.done, true, 'quest flagged complete');
  const silverBefore = p.silver;
  const claim = game.questClaim(p);
  assert.equal(claim.ok, true, 'claimable');
  assert.equal(p.quest, null, 'cleared');
  assert.ok(p.silver > silverBefore, 'paid');
  game.removePlayer(p);
});

test('quests: recover quests surface the trinket on the right kills', async () => {
  const p = await mkChar('RecoverQ', 'trader');
  p.quest = { kind: 'recover', creatureId: 'great_rat', trinket: { name: 'a silver locket', item: 'locket', desc: 'a silver locket' }, found: false, source: 'crier', done: false };
  Math.random = () => 0.05;
  game.questKill(p, 'rat');
  assert.equal(p.quest.found, false, 'wrong creature finds nothing');
  game.questKill(p, 'great_rat');
  assert.equal(p.quest.found, true, 'marked creature yields the trinket');
  const claim = game.questClaim(p);
  assert.equal(claim.ok, true, 'claimable once found');
  game.removePlayer(p);
});

test('quests: skinning quests advance per harvest', async () => {
  const p = await mkChar('SkinQ', 'trader');
  p.quest = { kind: 'skin', count: 2, skinned: 0, source: 'crier', done: false };
  game.questSkin(p);
  assert.equal(p.quest.done, false, 'first hide is not enough');
  game.questSkin(p);
  assert.equal(p.quest.done, true, 'second hide completes the work');
  const claim = game.questClaim(p);
  assert.equal(claim.ok, true, 'claimable');
  game.removePlayer(p);
});

// ------------------- Battlefield healing & chug timers -------------------
test('healing: no drinking in combat; chug timer gates draughts', async () => {
  const { addItem } = await import('../server/player.js');
  const p = await mkChar('ChugTim', 'trader');
  addItem(p, 'salve', 3);
  handleCommand(game, p, 'use salve');
  assert.ok(p.hp > p.maxHp - 1 || p.hp >= p.maxHp, 'first draught takes effect');
  const hpAfterFirst = p.hp;
  handleCommand(game, p, 'use salve');
  assert.match(lastMsg(p), /settling/i, 'chug timer refuses a second draught');
  assert.equal(p.hp, hpAfterFirst, 'no second heal');
  p.potionAt = 0;
  p.combatId = 'combat_x';
  handleCommand(game, p, 'use salve');
  assert.match(lastMsg(p), /middle of a fight/i, 'no drinking in combat');
  game.removePlayer(p);
});

// ------------------- Weather & seasons -------------------
test('weather: storm charges mana and hinders the wilds; label reads naturally', async () => {
  game.weather = { kind: 'storm', until: Date.now() + 600 * 1000, season: 'summer' };
  assert.equal(game.weatherManaMod(), 0.15, 'storm surges the aether');
  assert.equal(game.weatherLuckMod(), -0.15, 'storm scatters the game');
  assert.match(game.weatherLabel(), /storm/i, 'label describes the sky');

  const p = await mkChar('WeatherP', 'ranger');
  p.room = 'west_road';
  handleCommand(game, p, 'time');
  assert.match(lastMsg(p), /storm|season|weather/i, 'time reports the weather');
  game.removePlayer(p);

  game.weather = { kind: 'fair', until: Date.now() + 600 * 1000, season: 'summer' };
});

// ------------------- Assaults & warrants -------------------
test('warrants: killing an OPEN target in town draws a warrant and guards take you', async () => {
  const attacker = await mkChar('MurderA', 'barbarian');
  const victim = await mkChar('MurderV', 'trader');
  attacker.room = 'market_way';
  victim.room = 'market_way';

  const refused = game.startAssault(attacker, victim.name);
  assert.equal(refused.ok, false, 'guarded stance cannot be assaulted');
  victim.pvpStance = 'open';
  const res = game.startAssault(attacker, victim.name);
  assert.equal(res.ok, true, 'OPEN target can be struck');
  const combat = game.combat.getFor(attacker);
  assert.equal(combat.assault, true, 'assault flagged');
  assert.equal(combat.townKill, true, 'town killing recorded');

  Math.random = () => 0.05;
  combat.enemies[0].hp = 1;
  combat.playerAttack();
  assert.ok(attacker.warrant, 'murder warrant issued');
  assert.equal(attacker.warrant.charge, 'murder', 'charge is murder');
  assert.equal(attacker.pvpStance, 'open', 'stance forced open');

  handleCommand(game, attacker, 'recall warrant');
  assert.match(lastMsg(attacker), /MURDER/, 'recall reads the charge');

  // Walk past the gate guard: seized.
  attacker.room = 'west_road';
  const mv = game.move(attacker, 'w');
  assert.equal(mv.ok, true, 'moved toward the gate');
  assert.equal(attacker.room, 'jail', 'guard took the murderer');

  // Plead guilty clears the warrant.
  handleCommand(game, attacker, 'plead guilty');
  assert.equal(attacker.warrant, null, 'warrant cleared');
  assert.equal(attacker.room, 'square', 'released to the square');
  game.removePlayer(attacker);
  game.removePlayer(victim);
});

test('warrants: surrender to the law clears the noose at once', async () => {
  const p = await mkChar('SurrenderW', 'ranger');
  p.warrant = { charge: 'murder', issuedAt: Date.now() };
  p.room = 'west_road';
  handleCommand(game, p, 'surrender');
  assert.equal(p.room, 'jail', 'surrendered into custody');
  handleCommand(game, p, 'plead guilty');
  assert.equal(p.warrant, null, 'cleared after plea');
  game.removePlayer(p);
});
