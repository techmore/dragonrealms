import test from 'node:test';
import assert from 'node:assert/strict';
import { gapTrainingPlan, buildCircleScript } from '../scripts/lib/script-gen.mjs';
import { VARIANTS } from '../data/guild-scripts.js';
import { GUILDS, circleRequirementCandidates } from '../data/guilds.js';

const saturated = () => Object.fromEntries([
  ...Object.values(GUILDS.barbarian).filter(Array.isArray).flat().filter(x => typeof x === 'string'),
  ...['weapon', 'armor', 'survival', 'lore', 'supernatural'].flatMap(set => circleRequirementCandidates(GUILDS.barbarian, set)),
  'expertise', 'melee_mastery', 'inner_fire', 'parry', 'evasion', 'tactics',
].map(id => [id, 100]));
const script = ranks => buildCircleScript({
  cap: { guild: 'barbarian', circle: 1, gapCurriculum: true, requirementRanks: ranks,
    trainList: ['evasion'], scriptBase: 'gap' },
  fromArena: {},
  errands: { studyPath: [{dir:'n'}], studyRoom:'academy', studyToBazaar:[{dir:'s'}] },
});

test('candidate changes only the town curriculum lever', () => {
  const { diff, hypothesis, gapCurriculum, ...candidate } = VARIANTS.edgedSkinGapStudy;
  const { diff: oldDiff, hypothesis: oldHypothesis, ...control } = VARIANTS.edgedSkinCheapKit;
  assert.deepEqual(candidate, control);
  assert.equal(gapCurriculum, true);
});
test('closed and unknown gaps never fall back to stale/default training', () => {
  for (const ranks of [null, saturated()]) {
    assert.deepEqual(gapTrainingPlan('barbarian', ranks), {train:[], study:[]});
    assert.doesNotMatch(script(ranks), /put train |put study/);
  }
});
test('next-circle gates reopen training only when needed', () => {
  const ranks = saturated(); ranks.expertise = 8;
  assert.ok(!gapTrainingPlan('barbarian', ranks, 1).train.includes('expertise'));
  assert.ok(gapTrainingPlan('barbarian', ranks, 2).train.includes('expertise'));
});
test('lore blockers get one study visit instead of more saturated combat training', () => {
  const ranks = saturated();
  for (const skill of circleRequirementCandidates(GUILDS.barbarian, 'lore')) ranks[skill] = 0;
  const plan = gapTrainingPlan('barbarian', ranks);
  assert.deepEqual(plan.train, []);
  assert.deepEqual(new Set(plan.study), new Set(['appraisal','scholarship']));
  const src = script(ranks);
  assert.equal((src.match(/put study/g) || []).length, 1);
  assert.doesNotMatch(src, /put train /);
  assert.deepEqual(gapTrainingPlan('barbarian', {...ranks, scholarship:2}).study, ['appraisal'],
    'zero-rank performance tie must not strand the remaining lore slot');
  assert.doesNotMatch(script({...ranks, appraisal:2, scholarship:2}), /put study/);
});
