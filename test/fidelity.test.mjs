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

// ------------------- Crossing landmarks & districts -------------------
test('landmarks: taverns ease rest, the middens yield salvage, the pier gambles', async () => {
  const { ROOMS } = await import('../data/world.js');
  for (const id of ['half_pint', 'tenderfoot', 'middens', 'docks', 'pier', 'academy', 'high_temple']) {
    assert.ok(ROOMS[id], `${id} exists`);
  }
  assert.equal(ROOMS.half_pint.tavern, true, 'tavern flagged restful');
  assert.equal(ROOMS.square.exits.nw, 'half_pint', 'square connects to the Half Pint');
  assert.equal(ROOMS.pier.exits.w, 'rh_square', 'pier barge reaches Riverhaven');
  assert.equal(ROOMS.guild_district.exits.e, 'academy', 'academy off the guild district');
  assert.equal(ROOMS.temple.exits.s, 'high_temple', 'high temple behind the temple');

  // Tavern rest is faster.
  const p = await mkChar('TavernRest', 'barbarian');
  p.room = 'half_pint';
  p.hp = Math.max(1, Math.floor(p.maxHp / 2));
  const res = game.startRest(p);
  assert.match(res.msg, /hearth/i, 'tavern rest flavor');
  const hpBefore = p.hp;
  await new Promise((r) => setTimeout(r, 2300));
  assert.ok(p.hp > hpBefore, 'resting recovers');
  assert.ok(p.hp - hpBefore >= 4, 'tavern rest is generous');
  game.removePlayer(p);

  // The Middens: scavenge finds salvage (force the roll).
  const q = await mkChar('ScavHunt', 'trader');
  q.room = 'middens';
  Math.random = () => 0.01;
  const scav = game.scavenge(q);
  assert.equal(scav.ok, true, 'scavenge works in the middens');
  assert.ok(q.inventory.length > 0, 'found something');
  const notThere = await mkChar('ScavNo', 'trader');
  const no = game.scavenge(notThere);
  assert.equal(no.ok, false, 'no scavenging outside the middens');
  game.removePlayer(q);
  game.removePlayer(notThere);

  // The pier: play costs coin and can win.
  const gambler = await mkChar('PierPlay', 'trader');
  gambler.room = 'pier';
  gambler.silver = 100;
  handleCommand(game, gambler, 'play');
  assert.ok(gambler.silver !== 100, 'wager changed the purse');
  game.removePlayer(gambler);
});

// ------------------- Sorcerous backlash -------------------
test('backlash: dark magic writhes on holy ground; holy light is swallowed in the blackwood', async () => {
  const { guildById } = await import('../data/guilds.js');
  const necro = await mkChar('DarkBack', 'necromancer');
  necro.room = 'high_temple';
  necro.mana = 100;
  necro.skills.necromancy = { rank: 20, exp: 0 };
  const spell = guildById('necromancer').spells[0];
  // Force the backlash roll to fire.
  Math.random = () => 0.01;
  const hpBefore = necro.hp;
  handleCommand(game, necro, `cast ${spell.id}`);
  assert.ok(necro.hp < hpBefore, 'sacred ground burned the dark caster');

  const cleric = await mkChar('HolyBack', 'cleric');
  cleric.room = 'black_1';
  cleric.mana = 100;
  cleric.skills.holy_magic = { rank: 20, exp: 0 };
  const holy = guildById('cleric').spells.find((s) => s.skill === 'holy_magic');
  Math.random = () => 0.01;
  const hpBefore2 = cleric.hp;
  handleCommand(game, cleric, `cast ${holy.id}`);
  assert.ok(cleric.hp < hpBefore2, 'the blackwood drank the holy light');
  game.removePlayer(necro);
  game.removePlayer(cleric);
});

test('backlash: benign ground leaves casting alone', async () => {
  const { guildById } = await import('../data/guilds.js');
  const necro = await mkChar('SafeCast', 'necromancer');
  necro.room = 'marsh_1';
  necro.mana = 100;
  necro.skills.necromancy = { rank: 20, exp: 0 };
  const spell = guildById('necromancer').spells[0];
  Math.random = () => 0.01;
  const hpBefore = necro.hp;
  handleCommand(game, necro, `cast ${spell.id}`);
  assert.equal(necro.hp, hpBefore, 'no backlash in the wilds');
  game.removePlayer(necro);
});

// ------------------- Anti-abuse guardrails -------------------
test('guardrails: assault refuses far weaker targets; spawn camping throttles', async () => {
  const attacker = await mkChar('BullyA', 'barbarian');
  attacker.circle = 10;
  const victim = await mkChar('PreyV', 'trader');
  attacker.room = 'market_way';
  victim.room = 'market_way';
  victim.pvpStance = 'open';
  const res = game.startAssault(attacker, victim.name);
  assert.equal(res.ok, false, 'circle-gap assault refused');
  assert.match(res.msg, /weak/i, 'tells the bully why');

  // Spawn throttle: a hot room pauses respawns.
  game.spawnLog = new Map();
  const now = Date.now();
  const stamps = [];
  for (let i = 0; i < 14; i++) stamps.push(now - i * 1000);
  game.spawnLog.set('sewers_1', stamps);
  assert.equal(game.campThrottled('sewers_1', now), true, 'camping room throttled');
  assert.equal(game.campThrottled('sewers_1', now + 10 * 60 * 1000), false, 'window slides, throttle lifts');
  game.removePlayer(attacker);
  game.removePlayer(victim);
});

// ------------------- Guild crafting affiliations -------------------
test('affiliations: guilds craft their trades with a natural edge', async () => {
  const { addItem } = await import('../server/player.js');
  // Rank 44 + fixed roll: paladin's +3 crosses into masterfully-crafted
  // (0.911) where the trader's plain roll lands well-crafted (0.872).
  Math.random = () => 0;
  const paladin = await mkChar('AffPal', 'paladin');
  paladin.room = 'tailor_shop';
  paladin.skills.outfitting = { rank: 44, exp: 0 };
  addItem(paladin, 'wolf_pelt', 1);
  addItem(paladin, 'herb_root', 1);
  handleCommand(game, paladin, 'tailor cured_leather');
  const palMult = paladin.forgedQuality?.cured_leather;

  const merchant = await mkChar('AffTrader', 'trader');
  merchant.room = 'tailor_shop';
  merchant.skills.outfitting = { rank: 44, exp: 0 };
  addItem(merchant, 'wolf_pelt', 1);
  addItem(merchant, 'herb_root', 1);
  handleCommand(game, merchant, 'tailor cured_leather');
  const trMult = merchant.forgedQuality?.cured_leather;
  assert.ok(palMult > trMult, `paladin armorsmithing outshines the trader (${palMult} > ${trMult})`);
  game.removePlayer(paladin);
  game.removePlayer(merchant);
});

// ------------------- Necromancer rituals -------------------
test('rituals: butchery doubles the harvest, consume and dissect work the dead', async () => {
  const { addItem } = await import('../server/player.js');
  const p = await mkChar('RitNecro', 'necromancer');
  p.room = 'hall_necromancer';

  handleCommand(game, p, 'ritual');
  assert.match(lastMsg(p), /butchery|consume|dissect|preserve/, 'ritual list shown');

  // Butchery: skinning a corpse yields double loot.
  handleCommand(game, p, 'ritual butchery');
  assert.ok(p.ritualButcheryUntil, 'butchery active');
  p.corpses = [{ def: { id: 'rat', name: 'a sewer rat', circle: 1, loot: ['rat_pelt'] } }];
  handleCommand(game, p, 'skin rat');
  assert.equal(p.inventory.find((i) => i.item.id === 'rat_pelt')?.qty || 0, 2, 'butchered corpse gives two hides');

  // Consume: devours a corpse for health.
  const hpBefore = p.hp;
  p.hp = Math.max(1, p.hp - 30);
  p.corpses = [{ def: { id: 'rat', name: 'a sewer rat', circle: 1, loot: [] } }];
  handleCommand(game, p, 'ritual consume');
  assert.ok(p.hp > hpBefore - 30, 'consume restored health');
  assert.equal(p.corpses.length, 0, 'corpse consumed');

  // Dissect: jars the useful bits.
  p.corpses = [{ def: { id: 'kobold', name: 'a kobold', circle: 2, loot: [] } }];
  handleCommand(game, p, 'ritual dissect');
  assert.ok(p.inventory.some((i) => i.item.id === 'organ_vial'), 'organs jarred');
  game.removePlayer(p);
});

test('rituals: preserve makes the next risen tougher', async () => {
  const p = await mkChar('RitPreserve', 'necromancer');
  p.room = 'hall_necromancer';
  handleCommand(game, p, 'ritual preserve');
  assert.ok(p.ritualPreserveUntil, 'preserve active');
  p.corpses = [{ def: { id: 'rat', name: 'a sewer rat', circle: 1, loot: [] } }];
  handleCommand(game, p, 'animate rat');
  assert.ok(p.risen, 'risen servant');
  assert.ok(p.risen.maxHp > 20 + 4 + 5, 'preserved risen is tougher');
  assert.equal(p.ritualPreserveUntil, null, 'preserve spent');
  game.removePlayer(p);
});

// ------------------- Empath links & scar tax -------------------
test('empath: link reaches across rooms, touch reads wounds, scar shows the tax', async () => {
  const empath = await mkChar('LinkEmp', 'empath');
  const patient = await mkChar('LinkPat', 'trader');
  empath.room = 'market_way';
  patient.room = 'market_way';
  patient.hp = Math.floor(patient.maxHp / 2);

  // No link yet: mending from another room fails.
  handleCommand(game, empath, `mend ${patient.name}`);
  const hpAfterFail = patient.hp;

  handleCommand(game, empath, `link ${patient.name}`);
  assert.ok(empath.empathLink, 'link established');
  assert.ok(patient.empathLink, 'link is mutual');

  // Touch: diagnostics without healing.
  handleCommand(game, empath, `touch ${patient.name}`);
  assert.match(lastMsg(empath), /wounds|hurt|health/i, 'touch reads the patient');

  // Scar: the tax ledger.
  handleCommand(game, empath, 'scar');
  assert.match(lastMsg(empath), /scar tax/i, 'scar tax shown');

  // Move the patient away; the link still carries the mend.
  patient.room = 'temple';
  handleCommand(game, empath, `mend ${patient.name}`);
  assert.ok(patient.hp > hpAfterFail, 'mend reached across rooms through the link');
  assert.ok(empath.hp < empath.maxHp, 'the wound cost the empath');
  game.removePlayer(empath);
  game.removePlayer(patient);
});

// ------------------- Moon mage -------------------
test('moon mage: observe sky reads the moons and eases casting; telescope needs the hall', async () => {
  const p = await mkChar('MoonSky', 'moonmage');
  p.room = 'marsh_1';
  p.skills.astrology = { rank: 10, exp: 0 };
  p.mana = 50;

  handleCommand(game, p, 'observe sky');
  assert.match(lastMsg(p), /Xibar/, 'reads the great moon');
  assert.ok(p.lunarUntil, 'lunar insight kindled');

  // Lunar insight trims spell costs.
  const { guildById } = await import('../data/guilds.js');
  const spell = guildById('moonmage').spells[0];
  const baseCost = Math.ceil(spell.mana);
  p.prepared = { spellId: spell.id, pct: 100 };
  const manaBefore = p.mana;
  handleCommand(game, p, 'cast');
  assert.ok(manaBefore - p.mana <= Math.ceil(baseCost * 0.9) + 1, 'lunar insight eased the weave');

  // Telescope is hall-bound.
  const notThere = await mkChar('MoonTel', 'moonmage');
  notThere.room = 'marsh_1';
  notThere.skills.astrology = { rank: 10, exp: 0 };
  handleCommand(game, notThere, 'telescope');
  assert.match(lastMsg(notThere), /guildhall/i, 'telescope only at the hall');
  notThere.room = 'hall_moonmage';
  handleCommand(game, notThere, 'telescope');
  assert.match(lastMsg(notThere), /Xibar/, 'telescope observation');
  game.removePlayer(p);
  game.removePlayer(notThere);
});

test('moon gate: bridged by the great moon, refused when Xibar is dark', async () => {
  const realNow = Date.now;
  const p = await mkChar('MoonGateT', 'moonmage');
  p.room = 'square';
  p.skills.astrology = { rank: 10, exp: 0 };
  p.mana = 50;

  // Xibar at its peak: t=18h -> sin = 1.
  Date.now = () => 18 * 3600000;
  handleCommand(game, p, 'moon gate riverhaven');
  assert.equal(p.room, 'rh_square', 'gate carried the mage to Riverhaven');
  assert.ok(p.mana < 50, 'gate cost mana');

  // Xibar dark: t=45h -> sin((45/72)*2π) = sin(3.927) ≈ -0.707 -> xibar ≈ 0.146.
  Date.now = () => 45 * 3600000;
  p.mana = 50;
  const gateBefore = p.mana;
  handleCommand(game, p, 'moon gate crossing');
  assert.equal(p.room, 'rh_square', 'gate refused while Xibar is dark');
  assert.equal(p.mana, gateBefore, 'no mana spent on a failed gate');

  Date.now = realNow;
  game.removePlayer(p);
});

// ------------------- Spell difficulty tiers -------------------
test('tiers: spells demand mastery of their skill before they obey', async () => {
  const { guildById, spellTierFor, SPELL_TIER_RANKS } = await import('../data/guilds.js');
  assert.equal(spellTierFor(1), 'intro');
  assert.equal(spellTierFor(3), 'basic');
  assert.equal(spellTierFor(5), 'intermediate');
  assert.equal(spellTierFor(8), 'advanced');

  const p = await mkChar('TierGate', 'moonmage');
  p.circle = 8;
  p.room = 'marsh_1';
  p.mana = 100;
  const spell = guildById('moonmage').spells.find((s) => s.minCircle === 8); // stellar_cascade
  p.skills.moon_magic = { rank: 10, exp: 0 };
  handleCommand(game, p, `cast ${spell.id}`);
  assert.match(lastMsg(p), /advanced magic/i, 'advanced spell refused without mastery');
  assert.equal(p.mana, 100, 'no mana spent on a refused cast');
  p.skills.moon_magic = { rank: 40, exp: 0 };
  const rat = game.makeCreature(CREATURES.rat);
  game.roomCreatures.get('marsh_1').push(rat);
  game.startCombat(p, [rat.def]);
  handleCommand(game, p, `cast ${spell.id}`);
  assert.ok(p.mana < 100, 'mastery unlocks the cast');
  game.removePlayer(p);
});

// ------------------- Cleric communes & sacrifice -------------------
test('commune: patrons grant their favor; sacrifice burns devotion for wholeness', async () => {
  const { recalcDerived } = await import('../server/commands/util.js');
  const p = await mkChar('ComCleric', 'cleric');
  p.room = 'hall_cleric';
  p.devotion = 40;

  handleCommand(game, p, 'commune');
  assert.match(lastMsg(p), /Warmaster|Lady of Life|Merchant of Fate|Scholar of Secrets/, 'pantheon listed');

  const baseHp = p.maxHp;
  handleCommand(game, p, 'commune warmaster');
  assert.equal(p.patron, 'war', 'patron set');
  recalcDerived(p);
  assert.ok(p.maxHp > baseHp, 'Warmaster strengthens the frame');

  // The Lady of Life amplifies mending (any healer under her favor).
  const { guildById } = await import('../data/guilds.js');
  const healer = await mkChar('ComHealer', 'empath');
  healer.room = 'marsh_1';
  healer.patron = 'life';
  healer.mana = 100;
  healer.skills.healing_magic = { rank: 10, exp: 0 };
  const sooth = guildById('empath').spells.find((s) => s.minCircle === 1);
  healer.hp = Math.max(1, healer.hp - 60);
  handleCommand(game, healer, `cast ${sooth.id}`);
  assert.ok(healer.hp > healer.maxHp - 60 + 10, 'life patron mends deeper');

  // Sacrifice at the altar: whole again, devotion spent.
  p.room = 'high_temple';
  p.hp = Math.floor(p.maxHp / 2);
  handleCommand(game, p, 'sacrifice');
  assert.equal(p.hp, p.maxHp, 'sacrifice restores fully');
  assert.equal(p.devotion, 25, 'devotion spent (40 - 15)');
  game.removePlayer(p);
  game.removePlayer(healer);
});

// ------------------- Warrior Mage elements & conjured weapon -------------------
test('elements: attuning tints the mage with a passive boon', async () => {
  const p = await mkChar('ElemWM', 'warmage');
  handleCommand(game, p, 'element');
  assert.match(lastMsg(p), /four elements/, 'elements listed');
  handleCommand(game, p, 'element fire');
  assert.equal(p.element, 'fire', 'fire attuned');
  handleCommand(game, p, 'element bogus');
  assert.match(lastMsg(p), /elements are fire/i, 'unknown element refused');

  // Fire: harness gathers more.
  p.room = 'woods_1';
  p.mana = 0;
  const before = p.heldMana || 0;
  handleCommand(game, p, 'harness');
  const fireGain = (p.heldMana || 0) - before;
  assert.ok(fireGain > 0, 'harness works');

  const earth = await mkChar('ElemEarth', 'warmage');
  earth.element = 'earth';
  earth.room = 'west_road';
  const res = game.startRest(earth);
  assert.equal(res.ok, true, 'earth mage rests');
  const hpBefore = earth.hp;
  earth.hp = Math.max(1, earth.hp - 20);
  await new Promise((r) => setTimeout(r, 2300));
  assert.ok(earth.hp > hpBefore - 20, 'earth rest recovers');
  game.removePlayer(p);
  game.removePlayer(earth);
});

test('summon weapon: aether blade holds ten minutes and fades', async () => {
  const { addItem } = await import('../server/player.js');
  const p = await mkChar('SummWM', 'warmage');
  p.room = 'hall_warmage';
  p.mana = 50;
  const notHall = await mkChar('SummNo', 'warmage');
  notHall.room = 'marsh_1';
  notHall.mana = 50;
  handleCommand(game, notHall, 'summon weapon');
  assert.match(lastMsg(notHall), /guildhall/i, 'conjuring needs the hall');
  handleCommand(game, p, 'summon weapon');
  assert.ok(p.inventory.some((i) => i.item.id === 'conjured_blade'), 'blade conjured');
  handleCommand(game, p, 'summon weapon');
  assert.match(lastMsg(p), /already waits/i, 'only one conjured blade');
  game.removePlayer(p);
  game.removePlayer(notHall);
});
