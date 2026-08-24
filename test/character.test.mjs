// Domain suite: character.
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

  // Barbarian, circle 10: the 1-10 figures are per-circle increments
  // (Expertise 4/circle => 40 cumulative, 4th weapon 1/circle => 10).
  const barb = GUILDS.barbarian;
  let s = zero();
  setRanks(s, { expertise: 40, primary_magic: 40, parry: 40, evasion: 30, tactics: 10, inner_fire: 10 });
  setRanks(s, { small_edged: 40, large_edged: 40, twohanded_edged: 20, blunt: 10 });
  setRanks(s, { light_armor: 30, chain_armor: 10 });
  setRanks(s, { perception: 20, stealth: 20, skinning: 20, athletics: 10, first_aid: 10 });
  setRanks(s, { appraisal: 20 });
  setRanks(s, { augmentation: 10 });
  assert.equal(circleRequirements(barb, s, 10).ok, true, 'full band values pass circle 10');

  // Nth skill semantics: 3rd weapon needs rank 20 at circle 10 — drop it below that.
  let s2 = zero();
  setRanks(s2, { expertise: 40, primary_magic: 40, parry: 40, evasion: 30, tactics: 10, inner_fire: 10 });
  setRanks(s2, { small_edged: 40, large_edged: 40, twohanded_edged: 19, blunt: 10 });
  setRanks(s2, { light_armor: 30, chain_armor: 10 });
  setRanks(s2, { perception: 20, stealth: 20, skinning: 20, athletics: 10, first_aid: 10 });
  setRanks(s2, { appraisal: 20, augmentation: 10 });
  const req2 = circleRequirements(barb, s2, 10);
  assert.equal(req2.ok, false, '3rd weapon below band fails');
  assert.ok(req2.missing.some((m) => /3rd weapon/.test(m)), 'missing lists the 3rd weapon row');

  // Cumulative progression: circle 2 needs 8 ranks for a band-4 row.
  const s3 = zero();
  for (const id of Object.keys(SKILLS)) s3[id].rank = 8;
  assert.equal(circleRequirements(barb, s3, 2).ok, true, 'circle-2 cumulative ranks pass');
  assert.equal(circleRequirements(barb, s3, 10).ok, false, 'same ranks fail circle 10');

  // Summary text lists rows for the ask dialog.
  const summary = circleRequirementSummary(barb, 10);
  assert.ok(summary.length > 10, 'circle 10 summary has many rows');
  assert.ok(summary.some((l) => /expertise \(hard\) 40/.test(l)), 'summary includes cumulative hard expertise');
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
  for (const id of Object.keys(SKILLS)) p.skills[id] = { rank: 8, exp: 0 };

  // Wrong room: circle refused.
  handleCommand(game, p, 'circle');
  assert.equal(p.circle, 1);

  // Walk to own guild hall.
  walk(game, p, 'hall_paladin');
  assert.equal(p.room, 'hall_paladin');

  handleCommand(game, p, 'circle');
  assert.equal(p.circle, 2, 'should have circled to 2');
  assert.ok(p.maxHp > 145, 'max hp should grow with circle');

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
  walk(game, p, 'hall_warmage');
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

test('TDPs: earned from rank-ups, spent on stats and any skill', async () => {
  const { gainSkillExp, skillRank, pulseExp, applyExpToSkill } = await import('../server/player.js');
  const { expToNextRank } = await import('../data/skills.js');
  const acc = await auth.registerAccount('Tdptest', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Investor', race: 'elothean', guild: 'warmage' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  assert.equal(p.tdp, 600, 'new characters start with 600 TDPs (DR-authentic)');
  // Field exp banks; a pulse converts a fraction. Keep pulsing until the
  // banked 300 bits produce the first rank.
  gainSkillExp(p, 'war_magic', 300);
  for (let i = 0; i < 60 && skillRank(p, 'war_magic') < 1; i++) pulseExp(p);
  assert.ok(skillRank(p, 'war_magic') >= 1, 'skill ranks up');
  assert.equal(p.tdp, 600, 'pool under 200 converts nothing yet');
  assert.ok(p.tdpPool >= 1, 'rank points accumulate in the pool');

  // Sustained training (the trainer path feeds applyExpToSkill directly)
  // crosses the 200-point threshold: 30 rank-ups feed 465 pool points.
  p.circle = 10;
  p.skills.war_magic = { rank: 0, exp: 0 };
  for (let r = 0; r < 30; r++) applyExpToSkill(p, p.skills.war_magic, expToNextRank(r));
  assert.ok(p.tdp > 600, 'pool conversions grant TDPs');
  assert.ok(p.tdpPool < 200, 'pool remainder kept after conversion');

  // Spend on a stat — TDPs are spent at the Fane of Training.
  const cost = (await import('../server/player.js')).statRaiseCost(p.stats.int);
  p.tdp += cost;
  const tdpBefore = p.tdp;
  handleCommand(game, p, 'raise int'); // refused outside the fane
  assert.equal(p.tdp, tdpBefore, 'raise is gated to the fane');
  walk(game, p, 'fane');
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
  walk(game, p, 'hall_thief');
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
  assert.match(slotsMsg, /primary-magic tier/, 'warmage is primary-magic tier');

  game.removePlayer(p);
});

test('riverhaven: second starting city, circling at the shared hall row', async () => {
  const acc = await auth.registerAccount('Rivtest', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Riverman', race: 'human', guild: 'warmage', city: 'riverhaven' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  assert.equal(p.room, 'rh_square', 'riverhaven spawn');
  assert.equal(p.homeCity, 'riverhaven');

  // The ferry road reaches the wilds (topology check — the woods are deadly).
  const world = await import('../data/world.js');
  assert.equal(world.ROOMS.rh_ferry.exits.e, 'woods_1', 'ferry reaches the woods');
  assert.equal(world.ROOMS.woods_1.exits.w, 'rh_ferry', 'and the road returns');

  // Walk only within town, then circle at the shared hall row.
  game.move(p, 'w'); // rh_guilds
  assert.equal(p.room, 'rh_guilds');

  // Circle at the shared hall row.
  for (const id of Object.keys(p.skills)) p.skills[id] = { rank: 10, exp: 0 };
  handleCommand(game, p, 'circle');
  assert.equal(p.circle, 2, 'circled at the riverhaven hall row');

  game.removePlayer(p);
});
