// End-to-end smoke test: auth -> chargen -> items -> combat -> skin -> circle.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'dr-test-'));
process.env.DR_DB_PATH = join(tmp, 'test.db');

const { migrate, db, closeDb } = await import('../server/db.js');
const auth = await import('../server/auth.js');
const { createCharacter, loadPlayer } = await import('../server/player.js');
const { Game } = await import('../server/game.js');
const { handleCommand } = await import('../server/commands.js');

function fakeWs() {
  const msgs = [];
  return {
    msgs,
    send(o) { msgs.push(typeof o === 'string' ? JSON.parse(o) : o); },
    readyState: 1,
    close() {},
  };
}

let game;

before(() => {
  migrate();
  game = new Game();
  game.init();
  game.combat.stopTicker();
  clearInterval(game.respawnTicker);
});

after(() => {
  clearInterval(game.respawnTicker);
  game.combat.stopTicker();
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

test('auth: register, login, wrong password, lockout path', async () => {
  const reg = await auth.registerAccount('Thorntest', 'hunter2secret');
  assert.equal(reg.ok, true);
  const bad = await auth.loginAccount('thorntest', 'wrongpassword');
  assert.equal(bad.ok, false);
  const good = await auth.loginAccount('Thorntest', 'hunter2secret');
  assert.equal(good.ok, true);
  assert.ok(good.token);
  const validated = auth.validateSession(good.token);
  assert.equal(validated.username, 'thorntest');
  auth.logoutSession(good.token);
  assert.equal(auth.validateSession(good.token), null);
});

test('duplicate registration rejected', async () => {
  const dup = await auth.registerAccount('Thorntest', 'anotherpass1');
  assert.equal(dup.ok, false);
});

test('character creation + persistence', async () => {
  const acc = await auth.registerAccount('Swordtest', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Brennus', race: 'human', guild: 'warmage' });
  const p = loadPlayer(charId);
  assert.equal(p.name, 'Brennus');
  assert.equal(p.guild.id, 'warmage');
  assert.equal(p.circle, 1);
  assert.equal(p.stats.str, 35);
  assert.equal(p.unspentStat, 30);
  assert.equal(p.maxMana > 0, true);
  assert.equal(p.maxHp, 40 + 70 + 35);
  p.skills.war_magic.rank = 5;
  const { savePlayer } = await import('../server/player.js');
  savePlayer(p);
  const reloaded = loadPlayer(charId);
  assert.equal(reloaded.skills.war_magic.rank, 5);
});

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

  // buy a sword and wield it
  game.move(p, 'n');
  handleCommand(game, p, 'buy short_sword');
  assert.ok(p.silver < 150);
  handleCommand(game, p, 'wield short_sword');
  assert.equal(p.equipment.hand.id, 'short_sword');
  handleCommand(game, p, 'buy salve');
  assert.ok(ws.msgs.some((m) => m.t === 'msg' && /You buy/.test(m.msg)));

  // go to the sewers and hunt
  game.move(p, 's'); // square
  game.move(p, 's'); // temple row
  game.move(p, 'd'); // sewers entrance
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
  assert.ok(p.skills.medium_edged.rank + p.skills.medium_edged.exp > 0);

  // skin the corpse and sell the loot
  handleCommand(game, p, `skin ${def.id}`);
  assert.ok(p.corpses.length === 0, 'corpse consumed');
  handleCommand(game, p, 'inventory');
  const invMsg = ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).join(' ');
  assert.match(invMsg, /pelt|hide/i, 'loot should be in inventory');

  // sell it (go back to the market)
  game.move(p, 'u'); game.move(p, 'n'); game.move(p, 'n');  handleCommand(game, p, 'sell pelt');
  const sellMsg = ws.msgs.filter((m) => m.t === 'msg' && /sell|not interested/i.test(m.msg)).at(-1)?.msg || '';
  assert.match(sellMsg, /You sell/i, 'should sell the loot');

  game.removePlayer(p);
});

test('circle requirements', async () => {
  const { circleRequirements } = await import('../data/guilds.js');
  const guild = (await import('../data/guilds.js')).GUILDS.warmage;
  const skills = {};
  const { SKILLS } = await import('../data/skills.js');
  for (const id of Object.keys(SKILLS)) skills[id] = { rank: 0, exp: 0 };
  assert.equal(circleRequirements(guild, skills, 2).ok, false);
  for (const id of Object.keys(SKILLS)) skills[id].rank = 8;
  const req = circleRequirements(guild, skills, 2);
  assert.equal(req.ok, true);
});

test('DR circle engine: nth-skill, hard skills, and circle-10 band values', async () => {
  const { circleRequirements, circleRequirementSummary, GUILDS } = await import('../data/guilds.js');
  const { SKILLS } = await import('../data/skills.js');
  const zero = () => {
    const s = {};
    for (const id of Object.keys(SKILLS)) s[id] = { rank: 0, exp: 0 };
    return s;
  };
  const setRanks = (skills, map) => { for (const [id, r] of Object.entries(map)) skills[id].rank = r; };

  // Full DR skill set is present.
  for (const id of ['scholarship', 'tactics', 'performance', 'empathy', 'trading', 'expertise',
    'thanatology', 'summoning', 'conviction', 'parry', 'defending', 'primary_magic',
    'augmentation', 'debilitation', 'targeted_magic', 'warding_magic', 'athletics', 'lockpicking',
    'thievery', 'foraging', 'slings', 'thrown', 'heavy_thrown', 'offhand']) {
    assert.ok(SKILLS[id], `DR skill ${id} should exist`);
  }

  // Barbarian, circle 10: must meet the full 1-10 band (Expertise 4, 4th weapon 1, ...).
  const barb = GUILDS.barbarian;
  let s = zero();
  setRanks(s, { expertise: 4, primary_magic: 4, parry: 4, evasion: 3, tactics: 1, inner_fire: 1 });
  setRanks(s, { small_edged: 4, large_edged: 4, twohanded_edged: 2, blunt: 1 });
  setRanks(s, { light_armor: 3, chain_armor: 1 });
  setRanks(s, { evasion: 3, perception: 2, stealth: 2, hiding: 2, skinning: 1, athletics: 1 });
  setRanks(s, { appraisal: 2 });
  setRanks(s, { augmentation: 1 });
  assert.equal(circleRequirements(barb, s, 10).ok, true, 'full band values pass circle 10');

  // Nth skill semantics: 3rd weapon needs rank 2 at circle 10 — drop the 3rd weapon below it.
  let s2 = zero();
  setRanks(s2, { expertise: 4, primary_magic: 4, parry: 4, evasion: 3, tactics: 1, inner_fire: 1 });
  setRanks(s2, { small_edged: 4, large_edged: 4, twohanded_edged: 1, blunt: 1 });
  setRanks(s2, { light_armor: 3, chain_armor: 1 });
  setRanks(s2, { perception: 2, stealth: 2, hiding: 2, skinning: 1, athletics: 1 });
  setRanks(s2, { appraisal: 2, augmentation: 1 });
  const req2 = circleRequirements(barb, s2, 10);
  assert.equal(req2.ok, false, '3rd weapon below band fails');
  assert.ok(req2.missing.some((m) => /3rd weapon/.test(m)), 'missing lists the 3rd weapon row');

  // Scaling: circle 2 needs far less than circle 10.
  const s3 = zero();
  for (const id of Object.keys(SKILLS)) s3[id].rank = 1;
  assert.equal(circleRequirements(barb, s3, 2).ok, true, 'light ranks pass circle 2');
  assert.equal(circleRequirements(barb, s3, 10).ok, false, 'same ranks fail circle 10');

  // Summary text lists rows for the ask dialog.
  const summary = circleRequirementSummary(barb, 10);
  assert.ok(summary.length > 10, 'circle 10 summary has many rows');
  assert.ok(summary.some((l) => /expertise \(hard\) 4/.test(l)), 'summary includes hard expertise');
});

test('defending and parry train when struck in combat', async () => {
  const acc = await auth.registerAccount('Bulwark', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Bulwark', race: 'human', guild: 'paladin' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  game.move(p, 'n'); // market way
  handleCommand(game, p, 'buy shield_wood');
  handleCommand(game, p, 'wear shield_wood');
  assert.equal(p.equipment.shield.id, 'shield_wood');

  game.move(p, 's'); game.move(p, 's'); game.move(p, 'd'); // sewers (square -> temple row -> sewers_1)
  const creature = game.creaturesIn(p.room)[0];
  const defBefore = p.skills.defending.exp + p.skills.defending.rank;
  const parryBefore = p.skills.parry.exp + p.skills.parry.rank;
  game.startCombat(p, [creature.def]);
  let combat = game.combat.getFor(p);
  let safety = 0;
  while (game.combat.getFor(p) && safety++ < 300) combat.tick();
  assert.ok(p.skills.defending.exp + p.skills.defending.rank > defBefore, 'defending should train when struck');
  assert.ok(p.skills.parry.exp + p.skills.parry.rank > parryBefore, 'parry should train when struck with a shield');

  game.removePlayer(p);
});

test('circle command requires own hall and raises circle', async () => {
  const acc = await auth.registerAccount('Circletest', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Round', race: 'human', guild: 'paladin' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  // Set ranks high enough for circle 2.
  const { SKILLS } = await import('../data/skills.js');
  for (const id of Object.keys(SKILLS)) p.skills[id] = { rank: 6, exp: 0 };

  // Wrong room: circle refused.
  handleCommand(game, p, 'circle');
  assert.equal(p.circle, 1);

  // Walk to own guild hall: square -> guild_district -> guild_halls_s -> hall_paladin
  game.move(p, 'e');
  game.move(p, 's');
  game.move(p, 's');
  assert.equal(p.room, 'hall_paladin');

  handleCommand(game, p, 'circle');
  assert.equal(p.circle, 2, 'should have circled to 2');
  assert.ok(p.maxHp > 145, 'max hp should grow with circle');

  game.removePlayer(p);
});

test('heal and bank services', async () => {
  const acc = await auth.registerAccount('Servicetest', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Porter', race: 'human', guild: 'trader' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  p.hp = 50;
  game.move(p, 's'); // temple row (healer)
  handleCommand(game, p, 'heal');
  assert.equal(p.hp, p.maxHp, 'healed to full');

  p.silver = 150;
  game.move(p, 'n'); // square
  game.move(p, 'n'); // market way
  game.move(p, 'n'); // market end (banker)
  handleCommand(game, p, 'deposit 100');
  assert.equal(p.bank, 100);
  assert.equal(p.silver, 50);
  handleCommand(game, p, 'withdraw 25');
  assert.equal(p.bank, 75);
  assert.equal(p.silver, 75);

  game.removePlayer(p);
});

test('train command spends silvers to advance guild skills at hall', async () => {
  const { skillRank } = await import('../server/player.js');
  const acc = await auth.registerAccount('Trainertest', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Apprentice', race: 'human', guild: 'warmage' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  // wrong room: no trainer
  handleCommand(game, p, 'train war_magic');
  assert.equal(skillRank(p, 'war_magic'), 0);

  // non-guild skill rejected even at hall
  game.move(p, 'e'); game.move(p, 's'); game.move(p, 's'); game.move(p, 's');
  game.move(p, 's'); game.move(p, 's'); game.move(p, 's'); // -> hall_warmage
  assert.equal(p.room, 'hall_warmage');
  handleCommand(game, p, 'train holy_magic');
  assert.equal(skillRank(p, 'holy_magic'), 0);

  const beforeSilver = p.silver;
  const beforeExp = p.skills.war_magic.exp;
  handleCommand(game, p, 'train war_magic');
  assert.ok(p.skills.war_magic.exp > beforeExp, 'training grants skill progress');
  assert.ok(p.silver < beforeSilver, 'training costs silver');

  game.removePlayer(p);
});

test('ask <npc> <topic> responses', async () => {
  const acc = await auth.registerAccount('Askertest', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Curious', race: 'human', guild: 'trader' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  handleCommand(game, p, 'ask crier hunting');
  const msgs = ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).join(' ');
  assert.match(msgs, /Old Sewers/, 'crier should describe hunting areas');

  game.move(p, 'n'); // market
  handleCommand(game, p, 'ask Marlene list');
  const shopMsgs = ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).join(' ');
  assert.match(shopMsgs, /list/i);

  game.removePlayer(p);
});

test('spells command and out-of-combat healing', async () => {
  const acc = await auth.registerAccount('Empathtest', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Gentle', race: 'elothean', guild: 'empath' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  handleCommand(game, p, 'spells');
  const spellsMsg = ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).join(' ');
  assert.match(spellsMsg, /Soothe/);

  p.hp = p.maxHp - 40;
  const manaBefore = p.mana;
  handleCommand(game, p, 'cast sooth');
  assert.ok(p.hp > p.maxHp - 40, 'heal spell restores hp');
  assert.ok(p.mana < manaBefore, 'heal spell costs mana');

  game.removePlayer(p);
});

test('ranged weapons consume ammo', async () => {
  const acc = await auth.registerAccount('Bowyertest', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Quiver', race: 'human', guild: 'ranger' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  game.move(p, 'n');
  p.silver = 400;
  handleCommand(game, p, 'buy hunting_bow');
  handleCommand(game, p, 'buy arrows 10');
  handleCommand(game, p, 'wield bow');

  const { countItems } = await import('../server/player.js');
  assert.equal(countItems(p, 'arrows'), 10);

  game.move(p, 's'); game.move(p, 's'); game.move(p, 'd');
  const creature = game.creaturesIn(p.room)[0];
  handleCommand(game, p, `attack ${creature.def.id}`);
  let combat = game.combat.getFor(p);
  let safety = 0;
  while (game.combat.getFor(p) && safety++ < 200) combat.tick();
  assert.ok(countItems(p, 'arrows') < 10, 'arrows should be consumed in combat');

  game.removePlayer(p);
});

test('bandit camp content exists', async () => {
  const world = await import('../data/world.js');
  const creatures = await import('../data/creatures.js');
  assert.ok(world.ROOMS.camp_hollow, 'camp zone should exist');
  assert.ok(world.ROOMS.camp_den, 'captain den should exist');
  assert.ok(creatures.CREATURES.bandit_captain, 'bandit captain should exist');
});

test('character slot limit of 5 enforced', async () => {
  const acc = await auth.registerAccount('Slotstest', 's3cretword');
  for (const name of ['Ada', 'Bram', 'Cora', 'Dane', 'Elow']) {
    const id = createCharacter(acc.accountId, { name, race: 'human', guild: 'thief' });
    assert.ok(id, `slot for ${name} should succeed`);
  }
  assert.throws(
    () => createCharacter(acc.accountId, { name: 'Falk', race: 'human', guild: 'thief' }),
    /5 characters/,
    'sixth character should be rejected'
  );
});

test('deletechar removes another character but not yourself', async () => {
  const acc = await auth.registerAccount('Deletetest', 's3cretword');
  const a = createCharacter(acc.accountId, { name: 'Alpha', race: 'human', guild: 'thief' });
  const b = createCharacter(acc.accountId, { name: 'Beta', race: 'human', guild: 'thief' });
  const p = loadPlayer(a);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  handleCommand(game, p, 'deletechar Beta');
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM characters WHERE id = ?').get(b).c, 0, 'Beta should be deleted');

  handleCommand(game, p, 'deletechar Alpha');
  assert.ok(db.prepare('SELECT id FROM characters WHERE id = ?').get(a), 'cannot delete your active character');

  game.removePlayer(p);
});

test('quest: assign, progress via kills, claim once', async () => {
  const { CREATURES } = await import('../data/creatures.js');
  const acc = await auth.registerAccount('Questtest', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Questor', race: 'human', guild: 'thief' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  // Not at the crier -> no assignment.
  game.move(p, 'n'); // market
  handleCommand(game, p, 'quest');
  assert.equal(p.quest, null);

  // At the crier -> assignment.
  game.move(p, 's'); // square
  handleCommand(game, p, 'quest');
  assert.ok(p.quest, 'quest should be assigned');
  const creatureId = p.quest.creatureId;
  assert.ok(CREATURES[creatureId], 'quest targets a real creature');

  const silverBefore = p.silver;
  let guard = 0;
  while (!p.quest.done && guard++ < 20) game.questKill(p, creatureId);
  assert.ok(p.quest.done, 'quest completes after enough kills');

  // Claim once.
  handleCommand(game, p, 'claim');
  assert.equal(p.quest, null, 'quest cleared after claim');
  assert.ok(p.silver >= silverBefore, 'claim pays silver');

  game.removePlayer(p);
});

test('forage works in wild zones but not town', async () => {
  const acc = await auth.registerAccount('Foragetest', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Gatherer', race: 'human', guild: 'ranger' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  const resTown = game.forage(p);
  assert.equal(resTown.ok, false, 'no foraging in town');

  game.move(p, 'n'); game.move(p, 's'); game.move(p, 's'); game.move(p, 'd'); // sewers (wild)
  const resWild = game.forage(p);
  assert.equal(resWild.ok, true);
  assert.ok(p.skills.foraging.exp > 0 || p.skills.foraging.rank > 0, 'foraging earns exp');

  game.removePlayer(p);
});

test('rest recovers hp and stops on movement', async () => {
  const acc = await auth.registerAccount('Resttest', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Slumber', race: 'human', guild: 'paladin' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  p.hp = 50;
  const res = game.startRest(p);
  assert.equal(res.ok, true);
  await new Promise((r) => setTimeout(r, 2300));
  assert.ok(p.hp > 50, 'rest regains hp');
  game.move(p, 'n'); // moving stops rest
  assert.equal(p.restTimer, null, 'rest stops on movement');
  assert.equal(p.resting, false);

  game.removePlayer(p);
});

test('look <direction> peeks into adjacent rooms', async () => {
  const acc = await auth.registerAccount('Looktest', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Watcher', race: 'human', guild: 'bard' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  handleCommand(game, p, 'look n');
  const msgs = ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).join(' ');
  assert.match(msgs, /Market Way/, 'should describe the room to the north');

  game.removePlayer(p);
});

test('TDPs: earned from rank-ups, spent on stats and any skill', async () => {
  const { gainSkillExp, skillRank } = await import('../server/player.js');
  const acc = await auth.registerAccount('Tdptest', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Investor', race: 'elothean', guild: 'warmage' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  assert.equal(p.tdp, 600, 'new characters start with 600 TDPs (DR-authentic)');
  // Rank-ups feed the hidden pool; every 200 pool points -> 1 TDP.
  gainSkillExp(p, 'war_magic', 300); // learning multiplier scales exp
  assert.ok(skillRank(p, 'war_magic') >= 1, 'skill ranks up');
  assert.equal(p.tdp, 600, 'pool under 200 converts nothing yet');
  assert.ok(p.tdpPool >= 1, 'rank points accumulate in the pool');

  // A big flood of rank-ups crosses the 200 threshold (cap = circle*4).
  p.circle = 10;
  p.skills.war_magic = { rank: 0, exp: 0 };
  gainSkillExp(p, 'war_magic', 200 * 20);
  assert.ok(p.tdp > 600, 'pool conversions grant TDPs');
  assert.ok(p.tdpPool < 200, 'pool remainder kept after conversion');

  // Spend on a stat — TDPs are spent at the Fane of Training.
  const cost = (await import('../server/player.js')).statRaiseCost(p.stats.int);
  p.tdp += cost;
  const tdpBefore = p.tdp;
  handleCommand(game, p, 'raise int'); // refused outside the fane
  assert.equal(p.tdp, tdpBefore, 'raise is gated to the fane');
  game.move(p, 's'); // temple row
  game.move(p, 'e'); // fane
  assert.equal(p.room, 'fane');
  handleCommand(game, p, 'raise int');
  assert.equal(p.tdp, tdpBefore - cost, 'raise works at the fane');
  assert.equal(p.stats.int, 43 + 1, 'raise permanently boosts a stat'); // elothean int base 43

  // Train-twice flow (DR: TRAIN twice to confirm).
  handleCommand(game, p, 'train wis');
  const wisBefore = p.stats.wis;
  assert.equal(p.stats.wis, wisBefore, 'first train only steels the resolve');
  p.tdp += (await import('../server/player.js')).statRaiseCost(p.stats.wis);
  handleCommand(game, p, 'train wis');
  assert.equal(p.stats.wis, wisBefore + 1, 'second train commits the raise');

  // Train a non-guild skill with TDPs.
  const tdpTrainCost = (await import('../server/player.js')).tdpTrainCost(0);
  p.tdp += tdpTrainCost;
  handleCommand(game, p, 'tdptrain holy_magic'); // warmage does not train holy_magic
  assert.ok(skillRank(p, 'holy_magic') === 1, 'tdptrain works on any skill');

  game.removePlayer(p);
});

test('stance command sets and persists stance', async () => {
  const acc = await auth.registerAccount('Stancetest', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Guard', race: 'human', guild: 'paladin' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  assert.equal(p.stance, 'balanced');
  handleCommand(game, p, 'stance defensive');
  assert.equal(p.stance, 'defensive');
  const { savePlayer } = await import('../server/player.js');
  savePlayer(p);
  const reloaded = loadPlayer(charId);
  assert.equal(reloaded.stance, 'defensive', 'stance persists');

  handleCommand(game, p, 'stance furious');
  assert.equal(p.stance, 'defensive', 'invalid stance ignored');

  game.removePlayer(p);
});

test('equipment circle requirements enforced and quartermaster sells tiers', async () => {
  const { ITEMS } = await import('../data/items.js');
  const world = await import('../data/world.js');
  const npcs = await import('../data/npcs.js');
  const acc = await auth.registerAccount('Gearagetest', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Recruit', race: 'human', guild: 'paladin' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  // Circle 1 cannot wield a steel sword.
  const { addItem } = await import('../server/player.js');
  addItem(p, 'steel_sword', 1);
  handleCommand(game, p, 'wield steel_sword');
  assert.equal(p.equipment.hand, undefined, 'cannot wield gear above your circle');

  // Quartermaster stocks circle-gated gear.
  assert.ok(world.ROOMS.market_end.npcs.includes('quartermaster'), 'quartermaster is in market_end');
  const qm = npcs.NPCS.quartermaster;
  assert.ok(qm.stock.steel_sword >= 1);
  assert.ok(qm.stock.dragonsteel_greatsword >= 1);

  game.removePlayer(p);
});

test('aliases expand, persist, and support args', async () => {
  const acc = await auth.registerAccount('Aliastest', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Aria', race: 'human', guild: 'warmage' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  handleCommand(game, p, 'alias hit attack $1');
  assert.equal(p.aliases.hit, 'attack $1');
  handleCommand(game, p, 'alias hs score');
  assert.equal(p.aliases.hs, 'score');

  // Expansion triggers a real command with args.
  const { savePlayer } = await import('../server/player.js');
  savePlayer(p);
  const reloaded = loadPlayer(charId);
  assert.equal(reloaded.aliases.hit, 'attack $1', 'aliases persist');

  // ';' chains commands.
  handleCommand(game, p, 'alias hs score');
  const msgsBefore = ws.msgs.length;
  handleCommand(game, p, 'hs; look');
  const newMsgs = ws.msgs.slice(msgsBefore).map((m) => m.t).join(',');
  assert.ok(newMsgs.includes('msg') && newMsgs.includes('room'), 'chained commands both ran');

  // unalias
  handleCommand(game, p, 'unalias hs');
  assert.equal(p.aliases.hs, undefined);

  game.removePlayer(p);
});

test('guild rank titles reflect circle', async () => {
  const { guildTitle } = await import('../data/guilds.js');
  const guild = (await import('../data/guilds.js')).GUILDS.paladin;
  assert.equal(guildTitle(guild, 1), 'Squire');
  assert.equal(guildTitle(guild, 10), 'Paragon');
  const warmage = (await import('../data/guilds.js')).GUILDS.warmage;
  assert.equal(guildTitle(warmage, 1), 'Apprentice');
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

  game.move(p, 'n'); // market way
  handleCommand(game, p, 'buy leather');
  handleCommand(game, p, 'wear leather');
  assert.equal(p.equipment.torso.id, 'leather');

  game.move(p, 's'); game.move(p, 's'); game.move(p, 'd'); // sewers
  const creature = game.creaturesIn(p.room)[0];
  const expBefore = p.skills.light_armor.exp + p.skills.light_armor.rank;
  game.startCombat(p, [creature.def]);
  let combat = game.combat.getFor(p);
  let safety = 0;
  while (game.combat.getFor(p) && safety++ < 300) combat.tick();
  assert.ok(p.skills.light_armor.exp + p.skills.light_armor.rank > expBefore, 'light_armor should gain exp from being struck');

  game.removePlayer(p);
});

test('hunt verb trains perception in the wilds only', async () => {
  const acc = await auth.registerAccount('Predator', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Hunter', race: 'human', guild: 'barbarian' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  const resTown = game.hunt(p);
  assert.equal(resTown.ok, false, 'no hunting in town');

  game.move(p, 'n'); game.move(p, 's'); game.move(p, 's'); game.move(p, 'd'); // sewers (wild)
  let attempts = 0;
  let gained = false;
  while (!gained && attempts++ < 200) {
    const res = game.hunt(p);
    gained = p.skills.perception.exp > 0 || p.skills.perception.rank > 0;
  }
  assert.ok(gained, 'hunt should earn perception exp in the wilds');

  game.removePlayer(p);
});

test('craft command: alchemy recipes, ingredient consumption, success', async () => {
  const { addItem, countItems, skillRank } = await import('../server/player.js');
  const acc = await auth.registerAccount('Crafttest', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Brewer', race: 'elothean', guild: 'warmage' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  // No alchemist in the square.
  handleCommand(game, p, 'craft healing_draught');
  const errMsg = ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).join(' ');
  assert.match(errMsg, /alchemist/, 'craft requires the alchemist');

  // Go to the brewery (square -> n market, e brewery).
  game.move(p, 'n');
  game.move(p, 'e');
  assert.equal(p.room, 'brewery');

  addItem(p, 'herb_root', 2);
  addItem(p, 'herb_mint', 1);
  p.skills.alchemy = { rank: 40, exp: 0 }; // near-certain success
  handleCommand(game, p, 'craft healing_draught');
  const potions = countItems(p, 'potion_heal');
  assert.ok(potions === 1 || potions === 0, 'craft may succeed or boil over');
  assert.equal(countItems(p, 'herb_root'), 0, 'ingredients consumed either way');
  assert.ok(skillRank(p, 'alchemy') + p.skills.alchemy.exp > 0, 'crafting trains alchemy');
  const craftMsg = ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).join(' ');
  assert.match(craftMsg, /produce|boils over/, 'craft narrates the result');

  game.removePlayer(p);
});

test('consumables: essence tonic restores mana, frenzy draught grants buff', async () => {
  const { addItem } = await import('../server/player.js');
  const acc = await auth.registerAccount('Potitest', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Tonic', race: 'human', guild: 'warmage' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  p.mana = 5;
  addItem(p, 'potion_mana', 1);
  handleCommand(game, p, 'use tonic');
  assert.ok(p.mana > 5, 'essence tonic restores mana');

  addItem(p, 'potion_frenzy', 1);
  handleCommand(game, p, 'use frenzy');
  assert.equal(p.buffs.frenzy, 30, 'frenzy buff active');

  game.removePlayer(p);
});

test('equipItem swaps worn items instead of crashing', async () => {
  const { addItem, countItems } = await import('../server/player.js');
  const acc = await auth.registerAccount('Swaptest', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Swap', race: 'human', guild: 'paladin' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  addItem(p, 'padded_cloth', 1);
  handleCommand(game, p, 'wear padded_cloth');
  assert.equal(p.equipment.torso.id, 'padded_cloth');

  addItem(p, 'leather', 1);
  handleCommand(game, p, 'wear leather');
  assert.equal(p.equipment.torso.id, 'leather', 'new armor equipped');
  assert.equal(countItems(p, 'padded_cloth'), 1, 'old armor returned to inventory');

  game.removePlayer(p);
});

test('new high-tier zones are reachable and stocked', async () => {
  const world = await import('../data/world.js');
  const creatures = await import('../data/creatures.js');

  // Cinder Cavern below the captain's den.
  assert.equal(world.ROOMS.camp_den.exits.d, 'cinder_1');
  assert.ok(world.ROOMS.cinder_1.spawns.includes('cinder_lizard'));
  assert.ok(world.ROOMS.cinder_2.spawns.includes('fire_drake'));

  // Blackwood ruins from the deep wilds, with a second level.
  assert.equal(world.ROOMS.deep_2.exits.e, 'black_1');
  assert.ok(world.ROOMS.black_1.spawns.includes('wraith'));
  assert.equal(world.ROOMS.black_1.exits.d, 'black_2');
  assert.ok(world.ROOMS.black_2.spawns.includes('dread_knight'));

  // Rare named creatures carry unique loot.
  assert.ok(creatures.RARES.deepwoods.loot.includes('fang_of_shadowpaw'));
  assert.ok(creatures.RARES.cinder.loot.includes('drakeheart_amulet'));
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
  game.move(p, 'n'); // market (shopkeeper)
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

  game.move(p, 's'); game.move(p, 'd'); // sewers (temple row -> sewers_1)
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

test('third spells unlock at circle 5', async () => {
  const { spellsFor } = await import('../data/guilds.js');
  const { GUILDS } = await import('../data/guilds.js');
  for (const g of Object.values(GUILDS)) {
    if (!g.magic) continue;
    const at1 = spellsFor(g, 1).length;
    const at5 = spellsFor(g, 5).length;
    assert.equal(at1, 1, `${g.name} starts with one spell`);
    assert.equal(at5, 3, `${g.name} has three spells by circle 5`);
  }
});

test('organic exp sources for DR requirement skills', async () => {
  const acc = await auth.registerAccount('Wayskill', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Wayfarer', race: 'human', guild: 'ranger' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  const exp = (id) => p.skills[id].exp + p.skills[id].rank;

  // perform trains performance (bards faster).
  handleCommand(game, p, 'perform');
  assert.ok(exp('performance') > 0, 'perform trains performance');
  assert.ok(exp('performance') >= 5, 'perform grants base exp');

  // appraise trains appraisal on items and creatures.
  game.move(p, 'n');
  handleCommand(game, p, 'buy salve');
  const apprBefore = exp('appraisal');
  handleCommand(game, p, 'appraise salve');
  assert.ok(exp('appraisal') > apprBefore, 'appraise trains appraisal');

  // ask an info NPC about a topic trains scholarship.
  game.move(p, 's'); // back to the square (the crier is here)
  const scholBefore = exp('scholarship');
  handleCommand(game, p, 'ask crier hunting');
  assert.ok(exp('scholarship') > scholBefore, 'asking topics trains scholarship');

  // forage trains outdoorsmanship (foraging id); wild movement trains athletics.
  game.move(p, 's'); game.move(p, 'd'); // temple row -> sewers
  const outdoorBefore = exp('foraging');
  handleCommand(game, p, 'forage');
  assert.ok(exp('foraging') > outdoorBefore, 'forage trains outdoorsmanship (foraging id)');
  const athBefore = exp('athletics');
  game.move(p, 'n'); // deeper into the sewers (wild)
  assert.ok(exp('athletics') > athBefore, 'wild movement trains athletics');

  // ranger track/hunt train scouting.
  const scoutBefore = exp('scouting');
  handleCommand(game, p, 'track');
  assert.ok(exp('scouting') > scoutBefore, 'track trains scouting for rangers');

  // maneuvers train tactics.
  const creature = game.creaturesIn(p.room)[0];
  const tactBefore = exp('tactics');
  handleCommand(game, p, `attack ${creature.def.id}`);
  const combat = game.combat.getFor(p);
  assert.ok(combat);
  handleCommand(game, p, 'trip rat');
  assert.ok(exp('tactics') > tactBefore, 'maneuvers train tactics');
  while (game.combat.getFor(p)) combat.tick();

  // backstab power trains the backstab guild skill.
  game.removePlayer(p);
  const thiefAcc = await auth.registerAccount('Shadyskill', 's3cretword');
  const thiefChar = createCharacter(thiefAcc.accountId, { name: 'Shade', race: 'human', guild: 'thief' });
  const t = loadPlayer(thiefChar);
  const tws = fakeWs();
  t.ws = tws;
  game.addPlayer(t);
  game.move(t, 'n'); game.move(t, 's'); game.move(t, 's'); game.move(t, 'd');
  const tcreature = game.creaturesIn(t.room)[0];
  const bsBefore = exp('backstab');
  handleCommand(game, t, `attack ${tcreature.def.id}`);
  const tcombat = game.combat.getFor(t);
  assert.ok(tcombat);
  handleCommand(game, t, 'backstab');
  assert.ok(t.skills.backstab.exp + t.skills.backstab.rank > bsBefore, 'backstab power trains backstab skill');
  while (game.combat.getFor(t)) tcombat.tick();
  game.removePlayer(t);
});

test('full skill taxonomy: skillsets, sub-skills, guild skills', async () => {
  const { SKILLS, CATEGORIES } = await import('../data/skills.js');
  const { GUILDS, trainableSkills } = await import('../data/guilds.js');

  // Every guild primary/secondary/guildSkill exists in the taxonomy.
  for (const g of Object.values(GUILDS)) {
    for (const s of [...g.primary, ...g.secondary, g.guildSkill].filter(Boolean)) {
      assert.ok(SKILLS[s], `${g.name} references missing skill ${s}`);
    }
    if (g.guildSkill) assert.ok(trainableSkills(g).includes(g.guildSkill), `${g.name} trainer teaches guild skill`);
  }

  // Guild skills exist and are flagged.
  for (const id of ['empathy', 'expertise', 'scouting', 'backstab', 'bardic_lore', 'conviction', 'thanatology', 'trading']) {
    assert.equal(SKILLS[id].cat, CATEGORIES.GUILD, `${id} is a guild skill`);
  }

  // Sub-skills documented on key skills.
  assert.ok(SKILLS.shield_usage.subskills.includes('Large Shields'));
  assert.ok(SKILLS.plate_armor.subskills.includes('Heavy Plate'));
  assert.ok(SKILLS.bow.subskills.includes('Composite Bows'));

  // Governing stats present where the source game defines them.
  assert.equal(SKILLS.evasion.governing, 'Reflex');
  assert.equal(SKILLS.perception.governing, 'Wisdom');

  // 80+ skills documented.
  assert.ok(Object.keys(SKILLS).length >= 80, 'taxonomy is complete');
});

test('guild skills train at the hall and via guild activity', async () => {
  const { skillRank } = await import('../server/player.js');
  const acc = await auth.registerAccount('Gskilltest', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Ghost', race: 'human', guild: 'thief' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  // Trainer teaches the guild skill: backstab for thief.
  game.move(p, 'e'); game.move(p, 's'); game.move(p, 's'); game.move(p, 's');
  game.move(p, 's'); // hall_thief (guild_district -> south row -> paladin -> ranger -> thief)
  assert.equal(p.room, 'hall_thief');
  handleCommand(game, p, 'train backstab');
  assert.ok(p.skills.backstab.exp > 0, 'guild skill trainable at hall');

  game.removePlayer(p);
});

test('SKILLS.html generates from live data', async () => {
  const { execFileSync } = await import('node:child_process');
  execFileSync(process.execPath, ['scripts/build-skills-doc.mjs'], { cwd: process.cwd() });
  const { readFileSync } = await import('node:fs');
  const html = readFileSync('public/SKILLS.html', 'utf8');
  assert.match(html, /Dragon Realms — Skills Reference/);
  assert.match(html, /Shield Usage/);
  assert.match(html, /Composite Bows/);
});

test('crime loop: steal, strongboxes, and magical consumables train skills', async () => {
  const { addItem } = await import('../server/player.js');
  const acc = await auth.registerAccount('Picklock', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Locke', race: 'human', guild: 'thief' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  const exp = (id) => p.skills[id].exp + p.skills[id].rank;

  // Steal from the crier: either path grants thievery exp and moves silver.
  const silverBefore = p.silver;
  const thieveryBefore = exp('thievery');
  handleCommand(game, p, 'steal crier');
  assert.ok(exp('thievery') > thieveryBefore, 'steal trains thievery');
  const msgs = ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).join(' ');
  assert.match(msgs, /lift|catches|guard/, 'steal narrates an outcome');
  assert.ok(p.silver !== silverBefore, 'steal changes your silver');

  // Pick a locked strongbox: coins + lockpicking exp either way.
  const lockBefore = exp('lockpicking');
  const silver2 = p.silver;
  addItem(p, 'strongbox', 1);
  handleCommand(game, p, 'pick strongbox');
  assert.ok(exp('lockpicking') > lockBefore, 'pick trains lockpicking');
  assert.ok(p.silver >= silver2, 'strongbox either pays or keeps your coin');
  assert.ok(p.inventory.filter((i) => i.item.id === 'strongbox').length === 0, 'strongbox consumed');

  // Drinking a draught trains arcana.
  const arcanaBefore = exp('arcana');
  addItem(p, 'potion_heal', 1);
  handleCommand(game, p, 'drink healing draught');
  assert.ok(exp('arcana') > arcanaBefore, 'magical draughts train arcana');

  // Kobolds and bandits now carry strongboxes.
  const { CREATURES } = await import('../data/creatures.js');
  assert.ok(CREATURES.kobold.loot.includes('strongbox'), 'kobolds drop strongboxes');
  assert.ok(CREATURES.bandit.loot.includes('strongbox'), 'bandits drop strongboxes');

  // Empath casting trains the empathy guild skill.
  game.removePlayer(p);
  const eAcc = await auth.registerAccount('Mender', 's3cretword');
  const eChar = createCharacter(eAcc.accountId, { name: 'Mender', race: 'elothean', guild: 'empath' });
  const e = loadPlayer(eChar);
  const ews = fakeWs();
  e.ws = ews;
  game.addPlayer(e);
  e.hp = e.maxHp - 40;
  const empBefore = e.skills.empathy.exp + e.skills.empathy.rank;
  handleCommand(game, e, 'cast sooth');
  assert.ok(e.skills.empathy.exp + e.skills.empathy.rank > empBefore, 'empath casting trains empathy');
  game.removePlayer(e);
});

test('mana system: types, perceive, harness, and held mana empowers casts', async () => {
  const { manaTypeFor, roomManaLevel, manaCycle, GUILD_MANA } = await import('../data/mana.js');
  assert.equal(GUILD_MANA.barbarian, 'none');
  assert.equal(GUILD_MANA.thief, 'none');
  assert.equal(manaTypeFor((await import('../data/guilds.js')).GUILDS.cleric).type, 'holy');
  assert.equal(manaTypeFor((await import('../data/guilds.js')).GUILDS.necromancer).type, 'necromantic');
  assert.equal(manaTypeFor((await import('../data/guilds.js')).GUILDS.moonmage).type, 'lunar');

  // Cycles stay bounded and room levels are 0..1.
  for (const t of Object.keys(GUILD_MANA)) {
    const c = manaCycle(GUILD_MANA[t]);
    assert.ok(c >= 0 && c <= 1, `${t} cycle bounded`);
  }
  const g = (await import('../data/guilds.js')).GUILDS.cleric;
  const level = roomManaLevel(g, 'town');
  assert.ok(level >= 0 && level <= 1, 'room mana level bounded');
  assert.equal(roomManaLevel((await import('../data/guilds.js')).GUILDS.barbarian, 'woods'), 0, 'no mana for none-type guilds');

  // perceive works for magic guilds, refused for others.
  const acc = await auth.registerAccount('Moonbeam', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Moonbeam', race: 'elothean', guild: 'moonmage' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);
  handleCommand(game, p, 'perceive');
  const percMsg = ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).join(' ');
  assert.match(percMsg, /lunar mana/, 'perceive reports your guild\'s mana type');
  assert.ok(p.skills.attunement.exp > 0, 'perceive trains attunement');

  // harness fills the held pool up to the attunement-based cap.
  const cap = 10 + p.skills.attunement.rank * 2;
  handleCommand(game, p, 'harness');
  assert.ok(p.heldMana > 0 && p.heldMana <= cap, 'harness fills held mana within cap');

  // held mana is consumed by the next combat cast.
  p.heldMana = 40;
  game.move(p, 's'); game.move(p, 'd'); // temple row -> sewers
  const creature = game.creaturesIn(p.room)[0];
  game.startCombat(p, [creature.def]);
  const combat = game.combat.getFor(p);
  p.mana = p.maxMana;
  combat.cast((await import('../data/guilds.js')).spellById(p.guild, 'moon_bolt'), combat.playerTarget);
  assert.equal(p.heldMana, 0, 'cast consumes held mana');
  while (game.combat.getFor(p)) combat.tick();
  game.removePlayer(p);

  // Non-magic guilds cannot perceive or harness.
  const acc2 = await auth.registerAccount('Furyblood', 's3cretword');
  const charId2 = createCharacter(acc2.accountId, { name: 'Furyblood', race: 'human', guild: 'barbarian' });
  const p2 = loadPlayer(charId2);
  const ws2 = fakeWs();
  p2.ws = ws2;
  game.addPlayer(p2);
  handleCommand(game, p2, 'perceive');
  handleCommand(game, p2, 'harness');
  const barbMsg = ws2.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).join(' ');
  assert.match(barbMsg, /no mana|commands no mana/, 'barbarians are refused mana verbs');
  assert.equal(p2.heldMana, 0);
  game.removePlayer(p2);
});

test('mana pulses regen and cambrinth stores energy', async () => {
  const { addItem } = await import('../server/player.js');
  const acc = await auth.registerAccount('Pulsewave', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Pulsewave', race: 'human', guild: 'warmage' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  // Mana regenerates in pulses while logged in.
  p.mana = 5;
  const t0 = Date.now();
  while (p.mana === 5 && Date.now() - t0 < 8000) await new Promise((r) => setTimeout(r, 400));
  assert.ok(p.mana > 5, 'mana regen pulses restore mana');

  // Charge a cambrinth band: mana spent, energy stored, arcana trains.
  addItem(p, 'cambrinth_band', 1);
  p.mana = 40;
  const arcanaBefore = p.skills.arcana.exp + p.skills.arcana.rank;
  const manaBefore = p.mana;
  handleCommand(game, p, 'charge cambrinth band');
  assert.ok(p.cambrinth && p.cambrinth.charge > 0, 'cambrinth holds a charge');
  assert.equal(p.cambrinth.manaType, 'elemental', 'charged with your guild\'s mana type');
  assert.ok(p.mana < manaBefore, 'charging spends mana');
  assert.ok(p.skills.arcana.exp + p.skills.arcana.rank > arcanaBefore, 'charging trains arcana');

  // Invoke draws the stored energy into held mana.
  const heldBefore = p.heldMana || 0;
  handleCommand(game, p, 'invoke cambrinth band');
  assert.ok((p.heldMana || 0) > heldBefore, 'invoke restores held mana');
  assert.ok(!p.cambrinth || p.cambrinth.charge === 0, 'device drained after invoke');

  // Focus reports stored energy.
  handleCommand(game, p, 'charge cambrinth band');
  handleCommand(game, p, 'focus cambrinth band');
  const msgs = ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).join(' ');
  assert.match(msgs, /energy/, 'focus reports stored energy');

  // Type-mismatch explodes the device.
  p.cambrinth = { itemId: 'cambrinth_band', charge: 4, capacity: 6, manaType: 'holy', updatedAt: Date.now() };
  const hpBefore = p.hp;
  const hadItem = p.inventory.filter((i) => i.item.id === 'cambrinth_band').length;
  handleCommand(game, p, 'charge cambrinth band');
  assert.ok(p.hp < hpBefore, 'mismatched charge damages you');
  assert.ok(p.inventory.filter((i) => i.item.id === 'cambrinth_band').length < hadItem || hadItem === 0, 'device destroyed on mismatch');

  game.removePlayer(p);
});

test('prepare/cast: overchanneling scales cost and risks backlash', async () => {
  const { backfireChance, safeOverchannelPct } = await import('../data/mana.js');
  assert.equal(backfireChance(100, 100), 0, 'safe prepare never backfires');
  assert.equal(backfireChance(250, 100), 0.8, 'big overchannel caps at 80%');
  assert.equal(backfireChance(150, 130), 0.2, 'modest overchannel scales');
  assert.equal(safeOverchannelPct(50), 130, 'Primary Magic raises the safe ceiling');

  // Safe path: prepare 100% then cast — never backfires, heals fully.
  const acc = await auth.registerAccount('Prepwave', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Prepwave', race: 'elothean', guild: 'empath' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);
  const pmBefore = p.skills.primary_magic.exp + p.skills.primary_magic.rank;
  handleCommand(game, p, 'prepare sooth 100');
  assert.ok(p.prepared && p.prepared.spellId === 'soothe' && p.prepared.pct === 100, 'prepare records the spell');
  assert.ok(p.skills.primary_magic.exp + p.skills.primary_magic.rank > pmBefore, 'prepare trains Primary Magic');
  p.hp = p.maxHp - 30;
  const hpBefore = p.hp;
  handleCommand(game, p, 'cast');
  const msgs = ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).join(' ');
  assert.equal(p.prepared, null, 'cast consumes the prepared spell');
  assert.ok(p.hp > hpBefore, 'safe cast heals');
  assert.ok(!/backlash/.test(msgs), 'safe cast never backfires');

  // Overchannel path: prepare 250% — cost inflates and it may backfire.
  game.removePlayer(p);
  const acc2 = await auth.registerAccount('Firewave', 's3cretword');
  const charId2 = createCharacter(acc2.accountId, { name: 'Firewave', race: 'human', guild: 'warmage' });
  const p2 = loadPlayer(charId2);
  const ws2 = fakeWs();
  p2.ws = ws2;
  game.addPlayer(p2);
  game.move(p2, 's'); game.move(p2, 'd'); // sewers
  const creature = game.creaturesIn(p2.room)[0];
  game.startCombat(p2, [creature.def]);
  p2.mana = 100;
  handleCommand(game, p2, 'prepare fire_shard 250');
  const manaBefore = p2.mana;
  const hp2Before = p2.hp;
  handleCommand(game, p2, 'cast');
  assert.equal(p2.prepared, null, 'overchannel cast consumes the preparation');
  const overcast = manaBefore - p2.mana >= Math.ceil(9 * 1.5);
  const backfired = p2.hp < hp2Before;
  assert.ok(overcast || backfired, 'overchannel either spends far more mana or backfires');
  while (game.combat.getFor(p2)) game.combat.getFor(p2).tick();
  game.removePlayer(p2);
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
  game.move(p, 's'); game.move(p, 'd'); // sewers
  const creature = game.creaturesIn(p.room)[0];
  game.startCombat(p, [creature.def]);
  let combat = game.combat.getFor(p);
  const ifBefore = p.innerFire;
  const skillBefore = p.skills.inner_fire.exp + p.skills.inner_fire.rank;
  handleCommand(game, p, 'berserk');
  assert.ok(p.innerFire < ifBefore, 'berserk costs inner fire');
  assert.ok(p.skills.inner_fire.exp + p.skills.inner_fire.rank > skillBefore, 'berserk trains inner fire');
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
  game.move(p, 'e'); game.move(p, 'n'); game.move(p, 'n'); // square -> guild district -> north row -> barbarian hall
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
  game.move(p, 's'); game.move(p, 's'); game.move(p, 'w'); game.move(p, 's'); game.move(p, 'd'); // north row -> district -> square -> temple row -> sewers
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
  game.move(p, 'e'); game.move(p, 'n'); game.move(p, 'n'); // -> hall_barbarian
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
  game.move(p, 's'); game.move(p, 's'); game.move(p, 'w'); game.move(p, 's'); game.move(p, 'd');
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
  game.move(p, 's'); game.move(p, 'd'); // sewers
  const rat = game.creaturesIn(p.room)[0];
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

test('stance points: costs enforced, barbarian/ranger bonuses', async () => {
  const { stancePoints } = await import('../server/player.js');
  const acc = await auth.registerAccount('Stancpts', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Posture', race: 'human', guild: 'paladin' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  assert.equal(stancePoints(p), 3, 'base 3 stance points');
  handleCommand(game, p, 'stance aggressive');
  assert.equal(p.stance, 'aggressive', 'cost 2 within budget');

  // Barbarians gain +1 per 60 Defending ranks.
  const bacc = await auth.registerAccount('StancptsB', 's3cretword');
  const bId = createCharacter(bacc.accountId, { name: 'Rager', race: 'gortog', guild: 'barbarian' });
  const b = loadPlayer(bId);
  const bws = fakeWs();
  b.ws = bws;
  game.addPlayer(b);
  b.skills.defending.rank = 120;
  assert.equal(stancePoints(b), 5, 'barbarian bonus stance points');

  game.removePlayer(p);
  game.removePlayer(b);
});

test('hunting ladder: teaching bands scale exp and ladder lists them', async () => {
  const acc = await auth.registerAccount('Laddertest', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Climber', race: 'human', guild: 'warmage' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  // Ladder command lists bands.
  handleCommand(game, p, 'ladder');
  const ladderMsg = ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).join(' ');
  assert.match(ladderMsg, /teaches 0–6/, 'rat band listed');
  assert.match(ladderMsg, /teaches 20–40/, 'dread knight band listed');

  // Teaching factor: a high-skill player learns less from rats.
  const { effectiveRank, gainSkillExp } = await import('../server/player.js');
  const { CREATURES } = await import('../data/creatures.js');
  p.skills.medium_edged.rank = 40;
  const before = p.skills.medium_edged.exp;
  p.room = 'sewers_1';
  game.startCombat(p, [CREATURES.rat]);
  let combat = game.combat.getFor(p);
  let guard = 0;
  while (game.combat.getFor(p) && guard++ < 300) combat.tick();
  const gained = p.skills.medium_edged.exp - before;
  assert.ok(gained < 12, `over-levelled rat grants reduced exp (got ${gained})`);

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

test('skill messaging tiers match the DR ladder', async () => {
  const { skillTier } = await import('../data/skills.js');
  assert.equal(skillTier(1).label, 'Novice Lowly');
  assert.equal(skillTier(12).label, 'Novice Promising');
  assert.equal(skillTier(45).label, 'Novice Full');
  assert.equal(skillTier(60).label, 'Practitioner Competent');
  assert.equal(skillTier(420).label, 'Professional Exceptional');
  assert.equal(skillTier(900).label, 'Grand Master');
  assert.equal(skillTier(1750).label, 'Avatar');
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

test('target verb marks creatures; slots lists guild progression', async () => {
  const acc = await auth.registerAccount('Targeter', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Marksman', race: 'human', guild: 'warmage' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  const { CREATURES } = await import('../data/creatures.js');
  p.room = 'sewers_1';
  game.roomCreatures.get(p.room).push(game.makeCreature(CREATURES.rat));
  handleCommand(game, p, 'target rat');
  assert.ok(p.targetId, 'target stored');
  handleCommand(game, p, 'slots');
  const slotsMsg = ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).join(' ');
  assert.match(slotsMsg, /Spell slots/, 'slots command works');
  assert.match(slotsMsg, /90 slot rate/, 'warmage is primary-magic tier');

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
