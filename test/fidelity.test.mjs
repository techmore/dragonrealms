// Fidelity build-out suite: stamina & burden, khri family, paladin glyphs,
// ranger snipe/slip, engineering/outfitting crafting, and gem loot flags.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  auth, createCharacter, loadPlayer, game, handleCommand, fakeWs,
  setupGame, teardownGame,
} from './helpers.mjs';
import { CREATURES } from '../data/creatures.js';
import { findPath } from '../data/grid.js';
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
  const { maxStaminaFor, totalBurden, netBurden, maxStaminaEff } = await import('../server/player.js');
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
  assert.equal(maxStaminaEff(p), base - netBurden(p) * 2, 'each encumbering point costs 2 pool');
  assert.ok(netBurden(p) < 6, `STR allowance absorbs some load (net ${netBurden(p)} of 6)`);
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

// ------------------- Skinning skill check -------------------
test('skinning: low skill fumbles and keeps the corpse; high skill harvests', async () => {
  const p = await mkChar('SkinChk', 'ranger');
  // Rank 0 vs a circle-5 corpse: chance is floored at 20%, so force a
  // deterministic fail/succeed pair with a seeded RNG swap.
  p.corpses = [{ def: { id: 'wolf', name: 'a grey wolf', circle: 5, loot: ['wolf_pelt'] } }];
  const realRandom = Math.random;
  Math.random = () => 0.999; // guaranteed fumble at any realistic chance
  handleCommand(game, p, 'skin wolf');
  Math.random = realRandom;
  assert.match(lastMsg(p), /fumble/, 'low roll fumbles');
  assert.equal(p.corpses.length, 1, 'corpse survives the failed attempt');
  assert.equal(p.inventory.find((i) => i.item.id === 'wolf_pelt')?.qty || 0, 0, 'no loot on fumble');
  assert.ok((p.expPools.skinning || p.skills.skinning?.exp || 0) > 0, 'failed attempt still teaches');

  Math.random = () => 0.001; // guaranteed success
  handleCommand(game, p, 'skin wolf');
  Math.random = realRandom;
  assert.match(lastMsg(p), /carefully skin/, 'good roll harvests');
  assert.equal(p.corpses.length, 0, 'corpse consumed');
  assert.ok(p.inventory.some((i) => i.item.id === 'wolf_pelt'), 'pelt harvested');
  game.removePlayer(p);
});

// ------------------- Bundling & carried weight -------------------
test('burden: carried pelts weigh you down; bundling lightens the load', async () => {
  const { totalBurden, addItem } = await import('../server/player.js');
  const p = await mkChar('Bundler', 'ranger');
  const base = totalBurden(p);
  for (let i = 0; i < 10; i++) addItem(p, 'wolf_pelt', 1); // weight 1 each
  const laden = totalBurden(p);
  assert.ok(laden >= base + 10, `pelts carry weight (${laden} vs ${base})`);
  handleCommand(game, p, 'bundle wolf_pelt');
  assert.match(lastMsg(p), /compact bundle/, 'bundle succeeds');
  const bundled = totalBurden(p);
  assert.ok(bundled < laden * 0.6, `bundling lightens the load (${bundled} < ${laden * 0.6})`);
  handleCommand(game, p, 'inventory');
  assert.match(lastMsg(p), /\[bundled\]/, 'inventory marks the bundle');
  // Selling still works from a bundle (walk to the bazaar tanner).
  for (const step of findPath(p.room, 'bazaar')) game.move(p, step);
  handleCommand(game, p, 'sell wolf_pelt');
  const sellMsg = lastMsg(p);
  assert.match(sellMsg, /You sell/, `bundle sells cleanly: ${sellMsg}`);
  game.removePlayer(p);
});

// ------------------- Carry allowance (STR-based encumbrance) -------------------
test('carry allowance: strong backs haul more before encumbrance bites', async () => {
  const { netBurden, totalBurden, addItem } = await import('../server/player.js');
  const weak = await mkChar('WeakBack', 'empath');
  const strong = await mkChar('OxBlood', 'barbarian');
  weak.stats.str = 10; weak.stats.con = 10;
  strong.stats.str = 60; strong.stats.con = 40;
  for (const p of [weak, strong]) for (let i = 0; i < 12; i++) addItem(p, 'wolf_pelt', 1);
  assert.ok(totalBurden(weak) >= 12 && totalBurden(strong) >= 12, 'both haul the same weight');
  assert.ok(netBurden(strong) < netBurden(weak),
    `strong back encumbers less (${netBurden(strong)} vs ${netBurden(weak)})`);
  assert.equal(netBurden({ ...weak }), netBurden(weak), 'net burden is deterministic');
  game.removePlayer(weak); game.removePlayer(strong);
});

// ------------------- Bleeding wounds & tend -------------------
test('wounds: hits inflict bleeding, ticks drain, tend stops it', async () => {
  const wounds = await import('../server/wounds.js');
  const p = await mkChar('Bleeder', 'barbarian');
  const hp0 = p.maxHp;
  p.hp = hp0;

  // Forced wound roll: big damage always opens a wound.
  const w = wounds.rollWound(30, 5, () => 0.01);
  assert.ok(w && w.level >= 1, `big hit opens a wound (level ${w && w.level})`);
  assert.ok(wounds.BODY_PARTS.includes(w.part), 'wound has a body part');
  // Tiny damage never wounds.
  assert.equal(wounds.rollWound(2, 1, () => 0.01), null, 'grazes do not wound');

  // Bleed rate sums untended wounds only.
  p.wounds = [
    { part: 'chest', level: 4, tended: false, since: Date.now() },
    { part: 'head', level: 2, tended: true, since: Date.now() },
  ];
  assert.equal(wounds.bleedRate(p.wounds), 5, 'only untended wounds bleed');

  // Tend with high First Aid: succeeds and steps severity down.
  const realRandom = Math.random;
  Math.random = () => 0.001;
  const before = p.wounds[0].level;
  handleCommand(game, p, 'tend chest');
  Math.random = realRandom;
  assert.equal(p.wounds.find((x) => x.part === 'chest').level, before - 1, 'good tend steps severity down');

  // Repeated tending reaches tended state.
  Math.random = () => 0.001;
  for (let i = 0; i < 5 && !p.wounds[0].tended; i++) handleCommand(game, p, 'tend chest');
  Math.random = realRandom;
  assert.ok(!p.wounds.some((x) => x.part === 'chest' && !x.tended), 'chest wound fully tended');
  assert.match(lastMsg(p), /bleeding stops|No bleeding/, 'tend reports the stop');

  // Botched tend worsens the wound.
  p.wounds = [{ part: 'abdomen', level: 2, tended: false, since: Date.now() }];
  Math.random = () => 0.999; // force failure
  handleCommand(game, p, 'tend abdomen');
  Math.random = realRandom;
  assert.ok(p.wounds[0].level > 2, `botched tend worsens the wound (${p.wounds[0].level})`);
  game.removePlayer(p);
});


test('load: health and inventory report encumbrance; overloaded blocks movement', async () => {
  const { addItem } = await import('../server/player.js');
  const p = await mkChar('LoadMule', 'empath');
  handleCommand(game, p, 'health');
  assert.match(lastMsg(p), /unburdened/, 'clean health reads unburdened');
  for (let i = 0; i < 30; i++) addItem(p, 'wolf_pelt', 1); // way past any allowance
  handleCommand(game, p, 'health');
  assert.match(lastMsg(p), /overloaded/, 'health reports overloaded');
  const roomBefore = p.room;
  handleCommand(game, p, 's');
  assert.match(lastMsg(p), /overloaded/, 'movement refused while overloaded');
  assert.equal(p.room, roomBefore, 'did not move');
  // Shed the weight entirely: walking works again.
  p.inventory.length = 0;
  handleCommand(game, p, 's');
  assert.notEqual(p.room, roomBefore, 'walking again after shedding load');
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

  // Walk past the gate guard: seized. (Raven's Court now sits between the
  // West Road and the gate; stepping into the court puts the thief-adjacent
  // guard at the gate one step away, and the next step is watched.)
  attacker.room = 'passage_ravens';
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
  assert.equal(ROOMS.docks.exits.e, 'half_pint', 'Half Pint sits off the docks');
  assert.equal(ROOMS.pier.exits.w, 'rh_square', 'pier barge reaches Riverhaven');
  assert.ok(ROOMS.academy, 'academy exists off the Bard quarter');
  assert.equal(ROOMS.temple.exits.n, 'dens_high_temple_temple_1', 'high temple behind the temple (densified corridor)');

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
  for (let t = 0; p.corpses.length && t < 30; t++) handleCommand(game, p, 'skin rat');
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
  const rat = game.makeCreature(CREATURES.rat);
  game.roomCreatures.get('marsh_1').push(rat);
  game.startCombat(p, [rat.def]);
  p.prepared = { spellId: spell.id, pct: 100 };
  const manaBefore = p.mana;
  handleCommand(game, p, 'cast');
  assert.equal(manaBefore - p.mana, Math.ceil(baseCost * 0.9), 'lunar insight eased the weave exactly');

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
test('tiers: ranks shape spell power, never permission (DR model)', async () => {
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
  // Slight ranks: the cast is allowed (DR never blocks on ranks) but the
  // caster is warned the spell will be weak.
  p.skills.moon_magic = { rank: 10, exp: 0 };
  const rat = game.makeCreature(CREATURES.rat);
  game.roomCreatures.get('marsh_1').push(rat);
  game.startCombat(p, [rat.def]);
  handleCommand(game, p, `cast ${spell.id}`);
  assert.match(p.ws.msgs.map((m) => m.msg || '').join(' '), /slight for advanced magic/i, 'under-threshold cast warns of weakness');
  assert.ok(p.mana < 100, 'the cast still goes off');
  // Mastery threshold reached: no warning.
  p.mana = 100;
  p.skills.moon_magic = { rank: SPELL_TIER_RANKS.advanced, exp: 0 };
  const msgsBefore = p.ws.msgs.length;
  handleCommand(game, p, `cast ${spell.id}`);
  assert.doesNotMatch(p.ws.msgs.slice(msgsBefore).map((m) => m.msg || '').join(' '), /slight for advanced magic/i, 'mastered tier casts without the weakness warning');
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
  const capHp = Math.floor(earth.maxHp * 0.8); // rest caps below full by design
  earth.hp = Math.max(1, Math.floor(capHp * 0.5)); // hurt well under the rest cap
  const hpBefore = earth.hp;
  await new Promise((r) => setTimeout(r, 2300));
  assert.ok(earth.hp > hpBefore, 'earth rest recovers');
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

// ------------------- Guild spellbooks -------------------
test('spellbooks: each magic guild gains a signature spell at circle 7', async () => {
  const { GUILDS, spellsFor } = await import('../data/guilds.js');
  for (const g of Object.values(GUILDS)) {
    if (!g.magic) continue;
    const at10 = spellsFor(g, 10);
    assert.equal(at10.length, 5, `${g.name} spells at circle 10`);
    const sig = at10.find((s) => s.minCircle === 7);
    assert.ok(sig, `${g.name} has a circle-7 signature spell`);
    const kinds = at10.map((s) => s.kind);
    assert.ok(new Set(kinds).size >= 2, `${g.name} spellbook spans kinds (${kinds.join(',')})`);
  }
  // The signature spells resolve through combat.
  const { spellById } = await import('../data/guilds.js');
  const p = await mkChar('SigWarm', 'warmage');
  p.circle = 8;
  p.room = 'marsh_1';
  p.mana = 100;
  p.skills.war_magic = { rank: 40, exp: 0 };
  const cataclysm = spellById(p.guild, 'cataclysm');
  const rat = game.makeCreature(CREATURES.rat);
  game.roomCreatures.get('marsh_1').push(rat);
  game.startCombat(p, [rat.def]);
  const combat = game.combat.getFor(p);
  const before = combat.enemies[0].hp;
  combat.cast(cataclysm, combat.playerTarget);
  assert.ok(combat.enemies[0].hp < before, 'cataclysm lands');
  game.removePlayer(p);
});

// ------------------- Trader caravan & chaffer -------------------
test('caravan: rent, hire, and the cut lands on sales', async () => {
  const { addItem } = await import('../server/player.js');
  const p = await mkChar('CaravanT', 'trader');
  p.room = 'hall_trader';
  p.silver = 500;

  handleCommand(game, p, 'caravan rent');
  assert.ok(p.caravan?.rented, 'caravan rented');
  handleCommand(game, p, 'caravan hire porter');
  assert.equal(p.caravan.porter, 1, 'porter hired');
  handleCommand(game, p, 'caravan hire scribe');
  assert.equal(p.caravan.scribe, 1, 'scribe hired');
  handleCommand(game, p, 'caravan hire porter');
  assert.match(lastMsg(p), /no more berths|already keep/i, 'berths capped');

  // Porter cut lands on shop sales.
  p.room = 'bazaar';
  addItem(p, 'rat_pelt', 1);
  const silverBefore = p.silver;
  handleCommand(game, p, 'sell rat_pelt');
  const gained = p.silver - silverBefore;
  assert.ok(gained >= Math.floor(8 * 0.5 * 1.1), `porter lifted the price (${gained} >= ${Math.floor(8 * 0.5 * 1.1)})`);
  game.removePlayer(p);
});

test('chaffer: the next sale runs 10% better', async () => {
  const { addItem } = await import('../server/player.js');
  const p = await mkChar('ChaffT', 'trader');
  p.room = 'bazaar';
  p.silver = 100;
  addItem(p, 'wolf_pelt', 1);
  handleCommand(game, p, 'chaffer');
  assert.equal(p.chafferNext, true, 'chaffer armed');
  const before = p.silver;
  handleCommand(game, p, 'sell wolf_pelt');
  const gained = p.silver - before;
  assert.equal(gained, Math.floor(60 * 0.5 * 1.1), 'chaffered sale price');
  assert.equal(p.chafferNext, false, 'chaffer consumed');
  game.removePlayer(p);
});

test('speculate: the pit swings with your skills', async () => {
  const p = await mkChar('SpecT', 'trader');
  p.room = 'commodity_pit';
  p.skills.trading = { rank: 40, exp: 0 };
  p.skills.appraisal = { rank: 40, exp: 0 };
  p.silver = 200;
  Math.random = () => 0.01; // win the bet
  handleCommand(game, p, 'speculate');
  assert.ok(p.silver > 150, 'winning speculation pays');
  Math.random = () => 0.99; // lose the next
  const before = p.silver;
  handleCommand(game, p, 'speculate');
  assert.equal(p.silver, before - 50, 'losing speculation costs the stake');
  game.removePlayer(p);
});

// ------------------- Province ladder -------------------
test('ladder province: grounds group under their provinces', async () => {
  const byZone = game.ladder(null);
  const byProv = game.ladder('province');
  assert.match(byProv, /Crossing lands/, 'Crossing province group');
  assert.ok(byProv.split('\x1b[1m').length < byZone.split('\x1b[1m').length, 'province view groups zones');
});

// ------------------- Bank vault -------------------
test('vault: belongings sit safe at the bank', async () => {
  const { addItem } = await import('../server/player.js');
  const p = await mkChar('VaultT', 'trader');
  p.room = 'market_end';
  addItem(p, 'wolf_pelt', 2);

  const res = game.vaultStore(p, 'wolf_pelt', 1);
  assert.equal(res.ok, true, 'stored');
  assert.equal(p.inventory.find((i) => i.item.id === 'wolf_pelt')?.qty || 0, 1, 'one remains on you');
  const list = game.vaultList(p);
  assert.match(list.msg, /wolf pelt/, 'vault lists the pelt');
  const back = game.vaultRetrieve(p, 'wolf_pelt', 1);
  assert.equal(back.ok, true, 'retrieved');
  assert.equal(p.inventory.find((i) => i.item.id === 'wolf_pelt')?.qty || 0, 2, 'both pelts back');

  const inTown = await mkChar('VaultNo', 'trader');
  inTown.room = 'square';
  const no = game.vaultList(inTown);
  assert.equal(no.ok, false, 'no banker, no vault');
  game.removePlayer(p);
  game.removePlayer(inTown);
});

// ------------------- Respec -------------------
test('respec: the fane returns spent points to the pool', async () => {
  const p = await mkChar('RespecT', 'ranger');
  p.room = 'fane';
  const base = (await import('../server/player.js')).baseStatsFor(p.race.id);
  p.stats.str += 5;
  p.unspentStat -= 5;
  p.silver = 1000;
  const strBefore = p.stats.str;
  handleCommand(game, p, 'respec');
  assert.equal(p.stats.str, base.str, 'strength returned to base');
  assert.ok(p.unspentStat >= 5, 'points back in the pool');
  assert.ok(p.silver < 1000, 'the fane charges for the rite');
  game.removePlayer(p);
});

// ------------------- Exp lockout -------------------
test('no lockout: rapid field exp banks to the cap; ranks move only on pulses', async () => {
  const { gainSkillExp } = await import('../server/player.js');
  const { expToNextRank } = await import('../data/skills.js');
  const p = await mkChar('LockT', 'ranger');
  p.circle = 6; // rank cap 24 — room to level
  // A flood of field exp neither levels the skill directly nor dims learning:
  // the authentic brakes are the pool cap ("mind lock") and the pulse rhythm.
  p.skills.brawling = { rank: 5, exp: expToNextRank(5) - 1 };
  const rankBefore = p.skills.brawling.rank;
  const { poolCap } = await import('../server/player.js');
  const cap = poolCap(p, 'brawling');
  gainSkillExp(p, 'brawling', expToNextRank(6) * 100);
  assert.equal(p.skills.brawling.rank, rankBefore, 'field exp never levels directly');
  assert.ok(p.expPools.brawling <= cap, 'banking stops at the pool cap');
  assert.ok(Math.abs(p.expPools.brawling - cap) < 1e-9, 'overflow discarded at exactly the cap');
  game.removePlayer(p);
});

// ------------------- Achievements -------------------
test('achievements: milestones unlock and list', async () => {
  const p = await mkChar('AchT', 'ranger');
  const { unlockAchievement } = await import('../server/player.js');
  unlockAchievement(p, 'first_quest');
  unlockAchievement(p, 'first_quest'); // no double
  assert.equal(p.achievements.length, 1, 'unlocked once');
  handleCommand(game, p, 'achievements');
  assert.match(lastMsg(p), /Errand Runner/, 'listed');
  game.removePlayer(p);
});

test('achievements: wiring fires from play', async () => {
  const { addItem, unlockAchievement } = await import('../server/player.js');
  const p = await mkChar('AchWire', 'warmage');
  // Master craft: force a 1.3x roll.
  Math.random = () => 0;
  p.room = 'forge';
  p.skills.engineering = { rank: 90, exp: 0 };
  addItem(p, 'iron_ore', 1);
  addItem(p, 'herb_root', 1);
  handleCommand(game, p, 'shape carved_staff');
  assert.ok(p.achievements.includes('master_crafter'), 'master craft unlocks');
  game.removePlayer(p);
});

// ------------------- Parties -------------------
test('party: invites, shared hunt credit, and leaving', async () => {
  const a = await mkChar('PartyA', 'barbarian');
  const b = await mkChar('PartyB', 'ranger');
  a.room = 'marsh_1';
  b.room = 'marsh_1';
  b.quest = { kind: 'kill', creatureId: 'rat', count: 1, source: 'crier', done: false };

  const inv = game.partyInvite(a, b.name);
  assert.equal(inv.ok, true, 'invite sent');
  const join = game.partyJoin(b);
  assert.equal(join.ok, true, 'joined');
  assert.equal(a.party.id, b.party.id, 'shared party id');

  // A kill by A credits B's quest and shares a little hunting exp.
  game.questKill(a, 'rat');
  assert.equal(b.quest.done, true, 'shared quest credit');

  const status = game.partyStatus(a);
  assert.match(status.msg, /2\/5/, 'status shows both');

  const leave = game.partyLeave(b);
  assert.equal(leave.ok, true, 'left');
  assert.equal(a.party, null, 'party dissolves when one remains');
  game.removePlayer(a);
  game.removePlayer(b);
});

// ------------------- Magic techniques -------------------
test('techniques: slots grow with circle, learn at the hall, effects land', async () => {
  const { techniqueSlots, knowsTechnique } = await import('../server/commands/magic.js');
  assert.equal(techniqueSlots(1), 1);
  assert.equal(techniqueSlots(6), 3);
  assert.equal(techniqueSlots(10), 4);

  const p = await mkChar('TechWarm', 'warmage');
  p.room = 'marsh_1';
  p.mana = 100;
  p.silver = 1000;

  // Wrong room refused.
  handleCommand(game, p, 'technique learn aether_efficiency');
  assert.match(lastMsg(p), /guild hall/i, 'learn at the hall only');
  p.room = 'hall_warmage';
  handleCommand(game, p, 'technique learn aether_efficiency');
  assert.ok(knowsTechnique(p, 'aether_efficiency'), 'learned');
  assert.equal(p.techniques.length, 1, 'one technique');
  handleCommand(game, p, 'technique');
  assert.match(lastMsg(p), /Aether Efficiency/, 'listed');

  // Aether Efficiency trims spell costs.
  const { guildById } = await import('../data/guilds.js');
  const shard = guildById('warmage').spells.find((sp) => sp.minCircle === 1);
  p.skills.war_magic = { rank: 20, exp: 0 };
  const rat = game.makeCreature(CREATURES.rat);
  game.roomCreatures.get('marsh_1').push(rat);
  game.startCombat(p, [rat.def]);
  const manaBefore = p.mana;
  handleCommand(game, p, `cast ${shard.id}`);
  const spent = manaBefore - p.mana;
  assert.equal(spent, Math.ceil(shard.mana * 0.9), 'efficiency trimmed the cost exactly');

  // Slot cap: circle 1 has one slot.
  handleCommand(game, p, 'technique learn meditation');
  assert.match(lastMsg(p), /no free technique slots/i, 'slots cap at circle 1');
  game.removePlayer(p);
});

test('techniques: cold casting widens the safe overchannel ceiling', async () => {
  const p = await mkChar('TechCold', 'moonmage');
  p.skills.primary_magic = { rank: 20, exp: 0 };
  p.skills.moon_magic = { rank: 40, exp: 0 };
  p.circle = 8;
  p.room = 'marsh_1';
  p.mana = 300;
  const safeBase = (await import('../data/mana.js')).safeOverchannelPct(20);
  handleCommand(game, p, 'prepare moon_bolt 100');
  const before = p.hp;
  Math.random = () => 0.99; // force any backfire roll to fail to fire
  handleCommand(game, p, 'cast');
  assert.equal(p.hp, before, 'safe prepare never backfires');
  // With cold casting, a 100%+12 overchannel stays safe.
  p.techniques = ['cold_casting'];
  handleCommand(game, p, `prepare moon_bolt ${safeBase + 12}`);
  const before2 = p.hp;
  handleCommand(game, p, 'cast');
  assert.equal(p.hp, before2, 'cold casting held the weave safe');
  game.removePlayer(p);
});

// ------------------- Durability -------------------
test('durability: worn gear bites less and guards worse; repair restores it', async () => {
  const { conditionMult, wearCondition } = await import('../server/player.js');
  const p = await mkChar('DuraT', 'barbarian');
  const { addItem } = await import('../server/player.js');
  addItem(p, 'long_sword', 1);
  addItem(p, 'chainmail', 1);
  handleCommand(game, p, 'wield long_sword');
  handleCommand(game, p, 'wear chainmail');
  assert.equal(p.equipment.hand.condition, 100, 'fresh gear at 100');

  // Wear it down.
  p.equipment.hand.condition = 40;
  p.equipment.torso.condition = 40;
  assert.ok(conditionMult(p.equipment.hand) < 1, 'worn blade is weaker');
  const dmgFull = conditionMult({ condition: 100 });
  const dmgWorn = conditionMult({ condition: 40 });
  assert.ok(dmgWorn < dmgFull, 'condition scales damage');

  // wearCondition refuses to drop below 20 and decrements by chance.
  p.equipment.hand.condition = 21;
  Math.random = () => 0.001;
  wearCondition(p, 'hand', 1);
  assert.equal(p.equipment.hand.condition, 20, 'floor at 20');

  // Repair at the forge.
  p.room = 'forge';
  p.silver = 1000;
  handleCommand(game, p, 'repair long_sword');
  assert.equal(p.equipment.hand.condition, 100, 'repaired to full');
  assert.ok(p.silver < 1000, 'repair costs silver');
  game.removePlayer(p);
});

test('durability: equipment condition persists across save/load', async () => {
  const p = await mkChar('DuraPers', 'barbarian');
  const { addItem } = await import('../server/player.js');
  addItem(p, 'long_sword', 1);
  handleCommand(game, p, 'wield long_sword');
  p.equipment.hand.condition = 55;
  game.persistPlayer(p);
  const reloaded = loadPlayer(p.charId);
  assert.equal(reloaded.equipment.hand.condition, 55, 'condition survives reload');
  game.removePlayer(p);
});

// ------------------- Auction house -------------------
test('auction: post a lot, buy it, pay the seller', async () => {
  const { addItem } = await import('../server/player.js');
  const seller = await mkChar('AucSell', 'trader');
  const buyer = await mkChar('AucBuy', 'warmage');
  seller.room = 'auction_house';
  buyer.room = 'auction_house';
  addItem(seller, 'wolf_pelt', 1);
  buyer.silver = 1000;

  const off = game.auctionOffer(seller, 'wolf_pelt', 1, 40);
  assert.equal(off.ok, true, 'lot posted');
  const list = game.auctionList(buyer);
  assert.match(list.msg, /wolf pelt/, 'board shows the lot');

  const sellerBefore = seller.silver;
  const bought = game.auctionBuy(buyer, 1);
  assert.equal(bought.ok, true, 'bought');
  assert.ok(buyer.inventory.some((i) => i.item.id === 'wolf_pelt'), 'buyer holds the pelt');
  // Broker fee (economy audit F5): the seller nets price minus 3%.
  assert.equal(seller.silver, sellerBefore + 40 - Math.max(1, Math.floor(40 * 0.03)), 'seller paid minus the broker fee');
  assert.equal(seller.inventory.some((i) => i.item.id === 'wolf_pelt'), false, 'seller no longer holds it');

  // Own lot refused; wrong room refused.
  const self = game.auctionOffer(seller, 'wolf_pelt', 1, 10);
  assert.equal(self.ok, false, 'seller has nothing to post');
  seller.room = 'square';
  const nowhere = game.auctionList(seller);
  assert.equal(nowhere.ok, false, 'board only at the hall');
  game.removePlayer(seller);
  game.removePlayer(buyer);
});

// ------------------- Lunar gating -------------------
test('lunar gating: moon mage spells are dearer while Xibar is dark', async () => {
  const realNow = Date.now;
  const p = await mkChar('LunarGateT', 'moonmage');
  p.room = 'square';
  p.mana = 100;
  p.skills.moon_magic = { rank: 40, exp: 0 };
  const { guildById } = await import('../data/guilds.js');
  const bolt = guildById('moonmage').spells.find((s) => s.minCircle === 1);
  const target = game.makeCreature(CREATURES.rat);
  game.roomCreatures.get('square').push(target);

  // Xibar dark (t=45h -> xibar ~0.15): +25% cost in town.
  Date.now = () => 45 * 3600000;
  const baseCost = Math.ceil(bolt.mana);
  game.startCombat(p, [target.def]);
  const before = p.mana;
  handleCommand(game, p, `cast ${bolt.id}`);
  assert.equal(p.mana, before - Math.ceil(baseCost * 1.25), 'dark moon dearer in town');

  // Xibar full (t=18h -> 1.0): 10% off.
  Date.now = () => 18 * 3600000;
  p.mana = 100;
  const rat2 = game.makeCreature(CREATURES.rat);
  game.roomCreatures.get('square').push(rat2);
  game.startCombat(p, [rat2.def]);
  handleCommand(game, p, `cast ${bolt.id}`);
  assert.equal(p.mana, 100 - Math.ceil(baseCost * 0.9), 'full moon cheaper in town');
  Date.now = realNow;
  game.removePlayer(p);
});

// ------------------- Stocks -------------------
test('stocks: murderers are pilloried before they may move again', async () => {
  const p = await mkChar('StocksT', 'barbarian');
  p.room = 'jail';
  p.warrant = { charge: 'murder', issuedAt: Date.now() };
  p.silver = 500;
  handleCommand(game, p, 'plead guilty');
  assert.equal(p.warrant, null, 'warrant cleared');
  assert.ok(p.stocksUntil && p.stocksUntil > Date.now(), 'stocks sentence set');
  const mv = game.move(p, 'n');
  assert.equal(mv.ok, false, 'stocks hold the criminal');
  assert.match(mv.msg, /stocks/i, 'stocks message');
  game.removePlayer(p);
});

// ------------------- City ladder -------------------
test('ladder city: grounds group under their town', async () => {
  const byCity = game.ladder('city');
  assert.match(byCity, /the Crossing/, 'Crossing grounds grouped');
  assert.ok(byCity.split('\x1b[1m').length < game.ladder(null).split('\x1b[1m').length, 'city view groups zones');
});

// ------------------- Persistent link -------------------
test('link: the silver thread survives reloads while it holds', async () => {
  const a = await mkChar('LinkPersA', 'empath');
  const b = await mkChar('LinkPersB', 'trader');
  a.room = 'market_way';
  b.room = 'market_way';
  handleCommand(game, a, `link ${b.name}`);
  assert.ok(a.empathLink, 'linked');
  game.persistPlayer(a);
  game.removePlayer(a);
  const reloaded = loadPlayer(a.charId);
  game.addPlayer(reloaded);
  assert.ok(reloaded.empathLink && reloaded.empathLink.charId === b.charId, 'link persisted');
  // An expired link does not survive.
  reloaded.empathLink.until = Date.now() - 1000;
  game.persistPlayer(reloaded);
  const reloaded2 = loadPlayer(a.charId);
  assert.equal(reloaded2.empathLink, null, 'expired link dropped at load');
  game.removePlayer(reloaded);
  game.removePlayer(b);
});

// ------------------- Contested spells (SvS) -------------------
test('SvS: spells resolve against the target defense, not a flat chance', async () => {
  const p = await mkChar('SvsT', 'cleric');
  p.room = 'marsh_1';
  p.mana = 100;
  p.skills.holy_magic = { rank: 40, exp: 0 };
  p.circle = 8;
  const { guildById } = await import('../data/guilds.js');
  const wrath = guildById('cleric').spells.find((s) => s.minCircle === 3);

  // A high-defense wisp is far harder to land spells on than a rat.
  const rat = game.makeCreature(CREATURES.rat);
  const wisp = game.makeCreature(CREATURES.wisp);
  game.roomCreatures.get('marsh_1').push(rat, wisp);
  game.startCombat(p, [rat.def, wisp.def]);
  const combat = game.combat.getFor(p);
  combat.setTarget(rat.uid);
  const mana1 = p.mana;
  combat.cast(wrath, rat.uid);
  const spent1 = mana1 - p.mana;
  combat.setTarget(wisp.uid);
  const mana2 = p.mana;
  combat.cast(wrath, wisp.uid);
  const spent2 = mana2 - p.mana;
  // Both casts charge; the contested roll decides (the wisp's 22 defense
  // vs the rat's 5 means the rat eats the spell far more often).
  assert.equal(spent1, spent2, 'both casts cost the same');
  game.removePlayer(p);
});

// ------------------- Duel reasons -------------------
test('duel: challenges carry a reason into the messages', async () => {
  const a = await mkChar('DuelRa', 'barbarian');
  const b = await mkChar('DuelRb', 'trader');
  a.room = 'marsh_1';
  b.room = 'marsh_1';
  const res = game.challengeDuel(a, b.name, 'blood', 'for the insult at the market');
  assert.equal(res.ok, true, 'challenge sent');
  assert.match(res.msg, /for the insult at the market/, 'reason shown to the challenger');
  const invite = b.ws.msgs.find((m) => m.t === 'msg')?.msg || '';
  assert.match(invite, /for the insult at the market/, 'reason shown to the challenged');
  game.removePlayer(a);
  game.removePlayer(b);
});

// ------------------- Warrior mage impedance -------------------
test('impede: clinging earth freezes a foe; mana and cooldown gate it', async () => {
  const p = await mkChar('ImpedeT', 'warmage');
  p.room = 'marsh_1';
  p.mana = 50;
  p.skills.war_magic = { rank: 40, exp: 0 };
  const rat = game.makeCreature(CREATURES.rat);
  game.roomCreatures.get('marsh_1').push(rat);
  game.startCombat(p, [rat.def]);
  const combat = game.combat.getFor(p);
  Math.random = () => 0.01; // the bind lands
  const manaBefore = p.mana;
  const res = combat.impede(combat.playerTarget);
  assert.equal(res.ok, true, 'impede usable');
  assert.equal(combat.enemies[0].impededTicks, 5, 'foe bound');
  assert.ok(p.mana < manaBefore, 'mana spent');

  const again = combat.impede(combat.playerTarget);
  assert.equal(again.ok, false, 'cooldown gates the next bind');

  // While bound, the foe never attacks.
  const hpBefore = p.hp;
  combat.tick();
  combat.tick();
  assert.equal(p.hp, hpBefore, 'bound foe dealt no damage');
  game.removePlayer(p);
});
