import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { GUILDS, circleRequirements } from '../data/guilds.js';
import { SKILLS } from '../data/skills.js';
import { progressionPlan, formatProgression } from '../server/progression.js';
import { setupGame, teardownGame, game, handleCommand, fakeWs } from './helpers.mjs';
import { commandContract, readPanel } from '../server/commands/index.js';

before(setupGame);
after(teardownGame);

function player(guild = 'barbarian', rank = 0) {
  return {
    guild: GUILDS[guild], circle: 1, silver: 100,
    skills: Object.fromEntries(Object.keys(SKILLS).map((id) => [id, { rank, exp: 0 }])),
    expPools: {}, soul: 50,
  };
}

test('every guild plan agrees with the authoritative next-circle gate and is read-only', () => {
  for (const guild of Object.keys(GUILDS)) {
    for (const rank of [0, 4, 100]) {
      const p = player(guild, rank);
      const before = JSON.stringify(p);
      const plan = progressionPlan(p);
      const authoritative = circleRequirements(p.guild, p.skills, 2);
      assert.deepEqual(plan.rows, authoritative.rows);
      assert.equal(plan.ready, authoritative.ok);
      for (const choice of plan.suggestions) {
        assert.ok(choice.gap > 0);
        assert.equal(choice.gap, choice.need - p.skills[choice.skill].rank);
        if (choice.candidates) assert.ok(choice.candidates.includes(choice.skill));
      }
      assert.equal(JSON.stringify(p), before);
    }
  }
});

test('Nth suggestions use distinct ranked candidates and exclude mastery from weapon credit', () => {
  const p = player();
  p.skills.small_edged.rank = 8;
  p.skills.blunt.rank = 7;
  p.skills.melee_mastery.rank = 100;
  const plan = progressionPlan(p);
  const second = plan.suggestions.find((choice) => choice.set === 'weapon' && choice.nth === 2);
  assert.equal(second.skill, 'blunt');
  assert.equal(second.gap, 1);
  assert.ok(!second.candidates.includes('melee_mastery'));
  assert.match(formatProgression(p, { all: true }), /Eligible alternatives:/);
});

test('guidance distinguishes field EXP, hall training, and unsupported hall skills', () => {
  const p = player();
  p.expPools.expertise = 42.9;
  const output = formatProgression(p, { all: true });
  assert.match(output, /train expertise.*40 silvers/);
  assert.match(output, /42 field EXP held; it must drain/);
  assert.match(output, /Your guild hall does not teach this skill/);
  assert.match(output, /Use learned Barbarian abilities/);
  assert.equal(progressionPlan(p).ready, false);
});

test('skill-complete Paladins must restore soul before guidance says ready', () => {
  const p = player('paladin', 100);
  p.soul = 19;
  assert.equal(progressionPlan(p).ready, false);
  assert.match(formatProgression(p), /soul is too dim/);
  assert.doesNotMatch(formatProgression(p), /You are ready/);
  p.soul = 20;
  assert.equal(progressionPlan(p).ready, true);
  assert.match(formatProgression(p), /dir paladin/);
});

test('Riverhaven readiness directs all guilds to the shared training and circle row', () => {
  for (const guild of Object.keys(GUILDS)) {
    const p = player(guild, 100);
    p.room = 'rh_square';
    assert.match(formatProgression(p), /Use "dir guilds"/);
    p.room = 'square';
    assert.match(formatProgression(p), new RegExp(`Use "dir ${guild}"`));
  }
});

test('progress is a read-only panel view and accepts only its optional all argument', () => {
  const p = player();
  p.ws = fakeWs();
  p.aliases = {};
  const contract = commandContract('progress');
  assert.equal(contract.panelSafe, true);
  assert.equal(contract.rt.gate, false);
  assert.deepEqual(contract.mutates, []);
  assert.match(readPanel(game, p, 'progress').lines.join('\n'), /Advancement to circle 2/);
  // The dispatcher only needs status emission for this passive command.
  const stubGame = { status() {} };
  handleCommand(stubGame, p, 'progress nonsense');
  assert.match(p.ws.msgs.at(-1).msg, /Usage: progress/);
  handleCommand(stubGame, p, 'progress all');
  assert.match(p.ws.msgs.at(-1).msg, /Practice choices/);
  p.guild = null;
  assert.match(readPanel(game, p, 'progress').lines[0], /dir list guilds/);
});
