import { auth, createCharacter, loadPlayer, setupGame, teardownGame, game, handleCommand, fakeWs } from './helpers.mjs';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { GUILDS, trainableSkills } from '../data/guilds.js';
import { trainingSnapshot, formatTraining } from '../server/training-reference.js';
import { MAX_STAT, RANK_CAP, STAT_NAMES, statRaiseCost, skillLessonCost, skillLessonExp } from '../server/training-policy.js';
import { COMMAND_METADATA } from '../server/commands/metadata.js';

before(setupGame);
after(teardownGame);
const fixture = (guild = GUILDS.warmage) => ({ guild, room: 'square', silver: 100, tdp: 25,
  skills: Object.fromEntries(trainableSkills(guild).map(id => [id, { rank: 3, exp: 7 }])),
  stats: Object.fromEntries(STAT_NAMES.map(id => [id, 35])) });

test('all guild curricula use actual guild-role trainers, including Riverhaven', () => {
  for (const guild of Object.values(GUILDS)) {
    const p = fixture(guild);
    const plan = trainingSnapshot(p, 'skills');
    assert.equal(plan.skillCount, new Set(trainableSkills(guild)).size, guild.id);
    assert.ok(plan.skills.length <= 8);
    assert.ok(plan.skills.every(skill => skill.teachable));
    assert.ok(plan.trainers.some(room => room.roomId === `hall_${guild.id}`), guild.id);
    assert.ok(plan.trainers.some(room => room.roomId === 'rh_guilds'), guild.id);
    p.room = 'rh_guilds';
    assert.equal(trainingSnapshot(p).atTrainer, true);
  }
});

test('skill prices, experience and affordability reflect current state; exact IDs win', () => {
  const p = fixture();
  const id = trainableSkills(p.guild)[0];
  p.skills[id] = { rank: 9, exp: 11 };
  p.silver = skillLessonCost(9) - 1;
  let plan = trainingSnapshot(p, `skills ${id}`);
  assert.equal(plan.skillCount, 1);
  assert.equal(plan.skills[0].rank, 9);
  assert.equal(plan.skills[0].cost, 220);
  assert.equal(plan.skills[0].affordable, false);
  assert.equal(plan.skills[0].lessonExp, skillLessonExp(9));
  assert.equal(plan.skills[0].currentExp, 11);
  p.silver++;
  plan = trainingSnapshot(p, `skills ${id}`);
  assert.equal(plan.skills[0].affordable, true);
  assert.match(formatTraining(p, `skills ${id}`), /does not guarantee a full rank/);
});

test('stats have exact limits and TDP boundaries, with both committing commands explained', () => {
  const p = fixture();
  p.stats.str = MAX_STAT;
  p.stats.wis = 50;
  p.tdp = statRaiseCost(50) - 1;
  assert.equal(trainingSnapshot(p, 'stats str').stats[0].atMaximum, true);
  assert.equal(trainingSnapshot(p, 'stats wisdom').stats[0].affordable, false);
  p.tdp++;
  assert.equal(trainingSnapshot(p, 'stats wis').stats[0].affordable, true);
  const text = formatTraining(p);
  assert.match(text, /Fane of Training \[fane\]/);
  assert.match(text, /"train <stat>" twice/);
  assert.match(text, /"raise <stat>" spends immediately/);
  assert.equal(trainingSnapshot(p).stats.length, 8);
  delete p.stats.int;
  assert.equal(trainingSnapshot(p, 'stats int').stats[0].cost, null);
  assert.match(formatTraining(p, 'stats int'), /current value unavailable; raise cost unknown/);
});

test('guildless, nonteachable, unknown and bounded searches give useful honest guidance', () => {
  const p = fixture();
  assert.match(formatTraining(p, 'skills lockpicking'), /does not teach this skill/);
  assert.match(formatTraining(p, 'stats nonexistent'), /No training matches/);
  p.guild = null;
  assert.deepEqual(trainingSnapshot(p).trainers, []);
  assert.match(formatTraining(p), /you have no guild/);
  assert.match(formatTraining(p), /Stat training:/);
});

test('native lesson spends the planned price and direct experience without guaranteed rank advancement', async () => {
  const account = await auth.registerAccount('Trainingplanner', 'secretword9');
  const p = loadPlayer(createCharacter(account.accountId, { name: 'Learner', race: 'human', guild: 'warmage' }));
  p.ws = fakeWs(); game.addPlayer(p); p.room = 'rh_guilds';
  p.skills.war_magic.rank = 3; p.skills.war_magic.exp = 0; p.silver = 1000;
  const skill = trainingSnapshot(p, 'skills war_magic').skills[0];
  handleCommand(game, p, 'train war_magic');
  assert.equal(p.silver, 1000 - skill.cost);
  assert.equal(p.skills.war_magic.rank, 3);
  assert.equal(p.skills.war_magic.exp, skill.lessonExp);
  p.skills.war_magic.rank = RANK_CAP;
  p.skills.war_magic.exp = 0;
  const capped = trainingSnapshot(p, 'skills war_magic').skills[0];
  p.silver = capped.cost;
  assert.match(formatTraining(p, 'skills war_magic'), /cannot raise this rank/);
  handleCommand(game, p, 'train war_magic');
  assert.equal(p.silver, 0);
  assert.equal(p.skills.war_magic.rank, RANK_CAP);
  assert.equal(p.skills.war_magic.exp, capped.lessonExp);
  game.removePlayer(p);
});

test('training is panel-safe and both snapshot and command leave pending confirmation and player state untouched', () => {
  const p = fixture(); p.trainPending = 'str'; p.ws = fakeWs(); p.rtUntil = Date.now() + 5000; p.feAt = Date.now();
  const beforeState = JSON.stringify(p);
  trainingSnapshot(p, 'stats'); formatTraining(p, 'skills');
  assert.equal(JSON.stringify(p), beforeState);
  const beforePlayer = JSON.stringify({ ...p, ws: null });
  handleCommand(game, p, 'training', { applyRT: true });
  assert.equal(JSON.stringify({ ...p, ws: null }), beforePlayer);
  assert.match(p.ws.msgs.map(m => m.msg || '').join('\n'), /Training plan/);
  assert.equal(COMMAND_METADATA.training.panelSafe, true);
  assert.deepEqual(COMMAND_METADATA.training.mutates, []);
});

test('native Fane training confirms twice while raise commits its planned TDP cost immediately', async () => {
  const account = await auth.registerAccount('Trainingattributes', 'secretword9');
  const p = loadPlayer(createCharacter(account.accountId, { name: 'Adept', race: 'human', guild: 'warmage' }));
  p.ws = fakeWs(); game.addPlayer(p); p.room = 'fane'; p.tdp = 100;
  const str = trainingSnapshot(p, 'stats str').stats[0];
  handleCommand(game, p, 'train str');
  assert.equal(p.tdp, 100); assert.equal(p.stats.str, str.current);
  handleCommand(game, p, 'training stats str');
  assert.equal(p.trainPending, 'str', 'planning keeps the pending confirmation');
  handleCommand(game, p, 'train str');
  assert.equal(p.tdp, 100 - str.cost); assert.equal(p.stats.str, str.current + 1);
  const wis = trainingSnapshot(p, 'stats wis').stats[0];
  const balance = p.tdp;
  handleCommand(game, p, 'raise wis');
  assert.equal(p.tdp, balance - wis.cost); assert.equal(p.stats.wis, wis.current + 1);
  game.removePlayer(p);
});
