// Domain suite: world.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  auth, db, createCharacter, loadPlayer, Game, handleCommand, fakeWs, game,
  setupGame, teardownGame,
} from './helpers.mjs';
// Walk a player along the derived grid path between rooms (layout-agnostic).
import { findPath } from '../data/grid.js';
function walk(game, p, to) {
  for (const step of findPath(p.room, to)) game.move(p, step);
}


before(() => setupGame());
after(() => teardownGame());

// Total learning in a skill under the pool model: banked field exp + residual
// rank bits + ranks (ranks stand in for already-consumed bits in >0 checks).
const learned = (p, id) => ((p.expPools && p.expPools[id]) || 0)
  + (p.skills[id]?.exp || 0) + (p.skills[id]?.rank || 0);

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

  walk(game, p, 'bazaar'); // general store
  handleCommand(game, p, 'ask Marlene list');
  const shopMsgs = ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).join(' ');
  assert.match(shopMsgs, /list/i);

  game.removePlayer(p);
});

test('bandit camp content exists', async () => {
  const world = await import('../data/world.js');
  const creatures = await import('../data/creatures.js');
  assert.ok(world.ROOMS.camp_hollow, 'camp zone should exist');
  assert.ok(world.ROOMS.camp_den, 'captain den should exist');
  assert.ok(creatures.CREATURES.bandit_captain, 'bandit captain should exist');
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
  walk(game, p, 'bazaar'); // no crier here
  handleCommand(game, p, 'quest');
  assert.equal(p.quest, null);

  // At the crier -> assignment (the crier hands out four kinds; keep
  // asking until a kill quest is given so the kill loop below applies).
  walk(game, p, 'square');
  let guardKind = 0;
  while ((!p.quest || p.quest.kind !== 'kill') && guardKind++ < 10) {
    p.quest = null;
    handleCommand(game, p, 'quest');
  }
  assert.ok(p.quest, 'quest should be assigned');
  assert.equal(p.quest.kind, 'kill', 'kill quest selected for the test');
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

  walk(game, p, 'sewers_2'); // sewers (wild)
  const resWild = game.forage(p);
  assert.equal(resWild.ok, true);
  assert.ok(learned(p, 'foraging') > 0, 'foraging earns exp');

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
  walk(game, p, 'tg_n'); // moving stops rest
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
  assert.match(msgs, /You peer north into /, 'look <dir> describes the adjacent room');

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

  walk(game, p, 'sewers_2'); // sewers (wild)
  let attempts = 0;
  let gained = false;
  while (!gained && attempts++ < 200) {
    const res = game.hunt(p);
    gained = learned(p, 'perception') > 0;
  }
  assert.ok(gained, 'hunt should earn perception exp in the wilds');

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

test('organic exp sources for DR requirement skills', async () => {
  const acc = await auth.registerAccount('Wayskill', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Wayfarer', race: 'human', guild: 'ranger' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  const exp = (id) => learned(p, id);

  // perform trains performance (bards faster).
  handleCommand(game, p, 'perform');
  assert.ok(exp('performance') > 0, 'perform trains performance');
  assert.ok(exp('performance') >= 3, 'perform grants base field exp');

  // appraise trains appraisal on items and creatures.
  walk(game, p, 'bazaar'); // store
  handleCommand(game, p, 'buy salve');
  const apprBefore = exp('appraisal');
  handleCommand(game, p, 'appraise salve');
  assert.ok(exp('appraisal') > apprBefore, 'appraise trains appraisal');

  // ask an info NPC about a topic trains scholarship.
  walk(game, p, 'square'); // back to the square (the crier is here)
  const scholBefore = exp('scholarship');
  handleCommand(game, p, 'ask crier hunting');
  assert.ok(exp('scholarship') > scholBefore, 'asking topics trains scholarship');

  // forage trains outdoorsmanship (foraging id); wild movement trains athletics.
  walk(game, p, 'sewers_1'); // sewers
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
  walk(game, t, 'sewers_1');
  const tcreature = game.creaturesIn(t.room)[0];
  const bsBefore = learned(t, 'backstab');
  handleCommand(game, t, `attack ${tcreature.def.id}`);
  const tcombat = game.combat.getFor(t);
  assert.ok(tcombat);
  handleCommand(game, t, 'backstab');
  assert.ok(learned(t, 'backstab') > bsBefore, 'backstab power trains backstab skill');
  while (game.combat.getFor(t)) tcombat.tick();
  game.removePlayer(t);
});

test('guild leader tasks assign, complete, and reward guild skill exp', async () => {
  const acc = await auth.registerAccount('Leadertask', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Hired', race: 'human', guild: 'thief' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  // At the thief hall.
  walk(game, p, 'hall_thief');
  assert.equal(p.room, 'hall_thief');
  handleCommand(game, p, 'ask Mist task');
  assert.ok(p.quest && p.quest.source === 'leader', 'leader task assigned');
  const before = learned(p, 'backstab');
  let guard = 0;
  while (!p.quest.done && guard++ < 20) game.questKill(p, p.quest.creatureId);
  handleCommand(game, p, 'ask Mist claim');
  assert.equal(p.quest, null, 'claimed');
  assert.ok(learned(p, 'backstab') > before, 'guild skill exp granted');

  game.removePlayer(p);
});

test('REXP banks offline and triples drained learning', async () => {
  const { bankRexp } = await import('../server/player.js');
  const acc = await auth.registerAccount('Rexptest', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Napper', race: 'human', guild: 'warmage' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  assert.equal(p.rexp, 0);
  const gained = bankRexp(p, 10 * 60 * 1000); // 10 min offline -> 5 REXP (2:1)
  assert.equal(gained, 5);
  assert.equal(p.rexp, 5);

  // REXP makes drained field exp worth 3x ranks at pulse time (DR).
  const { gainSkillExp } = await import('../server/player.js');
  const expBefore = p.skills.war_magic.exp;
  const rankBefore = p.skills.war_magic.rank;
  gainSkillExp(p, 'war_magic', 10);
  assert.equal(p.skills.war_magic.exp - expBefore, 0, 'field exp banks, nothing converts immediately');
  assert.ok(p.expPools.war_magic >= 10, 'all 10 bits bank in the field pool');
  assert.equal(p.rexp, 5, 'banking alone consumes no REXP');

  // Each pulse converts only a fraction (primary ~1/15). The first pulse
  // drains with REXP active: bits worth 3x, one converting group-pulse
  // consumes 1/3 unit (20 s).
  const { pulseExp } = await import('../server/player.js');
  const pulsed = pulseExp(p);
  assert.ok(pulsed > 0 && pulsed < 10, `a fraction drains per pulse (${pulsed})`);
  assert.ok(p.expPools.war_magic > 0, 'the pool survives its first pulse');
  // Progress in bits = residual exp delta + cost of each rank-up (200 + rank).
  let cost = 0;
  for (let r = rankBefore; r < p.skills.war_magic.rank; r++) cost += 200 + r;
  const progress = p.skills.war_magic.exp - expBefore + cost;
  assert.equal(progress, pulsed * 3, 'drained bits landed at triple value via REXP');
  assert.ok(Math.abs(p.rexp - 5 + 1 / 3) < 1e-9, 'one converting pulse consumed 1/3 REXP');

  // Repeated pulses empty the pool over the documented ~40-60 minute window.
  for (let i = 0; i < 60; i++) pulseExp(p);
  assert.equal(p.expPools.war_magic, undefined, 'repeated pulses empty the pool');

  game.removePlayer(p);
});

test('justice: theft near a guard risks arrest, plead releases', async () => {
  const acc = await auth.registerAccount('Justicetest', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Lightfingered', race: 'human', guild: 'thief' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  // Deterministic arrest: near-max thievery so the theft almost always lands
  // (arrest roll is ~60%, so 20 attempts make a miss astronomically unlikely).
  p.room = 'west_gate'; // has a guard
  p.crimeHeat = 5;
  p.skills.thievery.rank = 40;
  p.stats.agi = 100;
  p.silver = 100;
  for (let i = 0; i < 20 && p.room === 'west_gate'; i++) {
    handleCommand(game, p, 'steal guard');
  }
  assert.equal(p.room, 'jail', 'arrested and jailed');
  assert.ok(p.silver < 100, 'silver confiscated');

  // Jail blocks movement while serving.
  const before = p.room;
  game.move(p, 'u');
  assert.equal(p.room, before, 'jail holds you');

  handleCommand(game, p, 'plead guilty');
  assert.equal(p.room, 'square', 'released to the square');

  game.removePlayer(p);
});

test('justice: judge verdict fines on release after plead innocent', async () => {
  const acc = await auth.registerAccount('Judge', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Defendant', race: 'human', guild: 'thief' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  p.room = 'jail';
  p.crimeHeat = 2;
  p.silver = 100;
  handleCommand(game, p, 'plead innocent');
  assert.ok(p.jailUntil > Date.now(), 'sentence imposed');
  const jailMsg = ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).join(' ');
  assert.match(jailMsg, /judge|costs/, 'judge speaks');

  // Serve the time, then move out: the verdict's fine is deducted.
  p.jailUntil = Date.now() - 1000;
  const silverBefore = p.silver;
  game.move(p, 'u');
  assert.equal(p.room, 'stockyard', 'released after sentence');
  assert.ok(p.silver < silverBefore, 'verdict fine deducted');
  assert.equal(p.crimeHeat, 0, 'heat cleared');

  game.removePlayer(p);
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
