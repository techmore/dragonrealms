import test from 'node:test';
import assert from 'node:assert/strict';
import { routeChecks, checkQuestions, defaultProposal } from '../scripts/lib/jev-checks.mjs';
import { askJev } from '../scripts/lib/jev.mjs';
import { cases } from './fixtures/jev-cases.mjs';

const good = () => ({ cohort_change: { noul: 0.01 }, unsupported_cause: { noul: 0.01 }, reversed_test: { noul: 0.01 },
  proposal_kind: { choice: 'inspection', confidence: 0.99 }, testability: { score: 0, confidence: 0.99 } });
const evidence = cases[0].evidence;
test('routing distinguishes reject, abstain and reviewable without execution authority', () => {
  const answers = good();
  assert.equal(routeChecks(evidence, answers).verdict, 'reviewable');
  answers.cohort_change.noul = 0.5;
  assert.equal(routeChecks(evidence, answers).verdict, 'abstain');
  answers.cohort_change.noul = 0.8;
  assert.equal(routeChecks(evidence, answers).verdict, 'reject');
  assert.equal(routeChecks(evidence, answers).executable, false);
  assert.equal(routeChecks(evidence, null).verdict, 'abstain');
  assert.equal(routeChecks({ ...evidence, missing: null }, good()).verdict, 'abstain');
});
test('exact numeric mismatches override a confident semantic pass', () => {
  assert.equal(routeChecks(evidence, good(), { cohort: { boost: 30 } }).verdict, 'reject');
  assert.equal(routeChecks(evidence, good(), { requirements: [{ label: '2nd survival', have: 0, need: 2 }] }).verdict, 'reject');
  assert.equal(routeChecks({ ...evidence, gapConflict: true }, good()).verdict, 'reject');
});
test('experiments need specificity and confidence; inspections do not', () => {
  const answers = good(); answers.proposal_kind.choice = 'experiment';
  assert.equal(routeChecks(evidence, answers).verdict, 'abstain');
  answers.testability.score = 2;
  assert.equal(routeChecks(evidence, answers).verdict, 'reviewable');
  answers.testability.confidence = 0.4;
  assert.equal(routeChecks(evidence, answers).verdict, 'abstain');
  assert.match(defaultProposal({ missing: null }), /Missing evidence/);
});
test('score response rejects nonfinite values, wrong legend and invalid distribution', async () => {
  const question = { testability: checkQuestions.testability };
  const answer = { type: 'score', score: 2, confidence: 1,
    probabilities: { 0: 0, 1: 0, 2: 1 }, legend: Object.fromEntries(question.testability.criteria.map((v,i) => [i,v])) };
  const call = () => askJev({}, question, { apiKey: 'test', fetcher: async () => ({ ok: true,
    json: async () => ({ model: 'test', answers: { testability: answer } }) }) });
  await call(); answer.score = NaN;
  await assert.rejects(call(), /Invalid Jev score/);
  answer.score = 2; answer.legend[2] = 'wrong';
  await assert.rejects(call(), /Invalid Jev score/);
});
