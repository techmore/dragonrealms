import test from 'node:test';
import assert from 'node:assert/strict';
import { compareJevPlayerPair } from '../scripts/lib/jev-player-comparison.mjs';

function run({status='incomplete',laneCoach='off',points=30,closed=4,unmet=8,
  elapsedSeconds=360000,kills=10,
  stalledChoicePassThroughs=0,supervisorOverrides=12,rtAbilityPrefetches=0,
  rtAbilityPrefetchExecutions=0,rtAbilityRoundtimeDeferrals=0,
  rtAbilityPrefetchMinHpFraction=0,rtAbilityPrefetchCancellations=0,
  laneCoachStats={}}={}) {
  const result={status,provider:'local',model:'qwen3:4b',guild:'barbarian',race:'human',
    durationMinutes:240,targetCircle:3,statPolicy:'physical-combat-v1',experienceBoost:1,
    progressionMode:'natural speed',statAllocation:{str:10,con:10},policyVersion:'policy-a',
    supervisorVersion:'supervisor-a',codeHashes:{player:'a',policy:'b'},laneCoach:{mode:laneCoach},
    progression:{targetReached:false,evidence:{currentCircle:1,rankPoints:points,
      requiredRankPoints:84,closedRows:closed,unmetRows:unmet,elapsedSeconds}},
    kills,supervisorOverrides,stalledChoicePassThroughs,rtAbilityPrefetches,
    rtAbilityPrefetchExecutions,rtAbilityRoundtimeDeferrals,rtAbilityPrefetchMinHpFraction,
    rtAbilityPrefetchCancellations,errors:[]};
  return Object.assign(result,{laneCoach:{mode:laneCoach,
    decisions:laneCoachStats.decisions??0,gateMappedChoices:laneCoachStats.gateMappedChoices??0,
    preservedProviderChoices:laneCoachStats.preservedProviderChoices??0,
    observedRankAdvances:laneCoachStats.observedRankAdvances??0,
    observedLearningMindstateAdvances:laneCoachStats.observedLearningMindstateAdvances??0,
    stalledDecisionPrompts:laneCoachStats.stalledDecisionPrompts??0}});
}

test('pair audit accepts matching terminal off/advisory cohorts and reports gate deltas',()=>{
  const report=compareJevPlayerPair(run(),run({laneCoach:'advisory',points:42,closed:6,unmet:6}));
  assert.equal(report.verdict,'ready-to-compare');
  assert.equal(report.comparable,true);
  assert.deepEqual(report.mismatches,[]);
  assert.equal(report.candidateMinusBaseline.rankPoints,12);
  assert.equal(report.candidateMinusBaseline.requirementRowsClosed,2);
  assert.equal(report.candidateMinusBaseline.stalledChoicePassThroughs,0);
  assert.equal(report.candidate.stalledChoicePassThroughs,0);
  assert.match(report.interpretation,/does not establish causation/);
});

test('pair report normalizes gate, closure and kill outcomes by observed elapsed time',()=>{
  const report=compareJevPlayerPair(run(),run({laneCoach:'advisory',points:42,closed:6,
    elapsedSeconds:180000,kills:12}));
  assert.equal(report.baseline.rankPointsPerHour,0.3);
  assert.equal(report.candidate.rankPointsPerHour,0.84);
  assert.equal(report.candidate.requirementRowsClosedPerHour,0.12);
  assert.equal(report.candidate.killsPerHour,0.24);
  assert.equal(report.candidateMinusBaseline.rankPointsPerHour,0.54);
  assert.equal(report.candidateMinusBaseline.killsPerHour,0.14);
});

test('pair report exposes stalled-choice pass-throughs as a separate wrapper metric',()=>{
  const report=compareJevPlayerPair(run(),run({laneCoach:'advisory',stalledChoicePassThroughs:41}));
  assert.equal(report.baseline.stalledChoicePassThroughs,0);
  assert.equal(report.candidate.stalledChoicePassThroughs,41);
  assert.equal(report.candidateMinusBaseline.stalledChoicePassThroughs,41);
  assert.equal(report.candidateMinusBaseline.supervisorOverrides,0);
});

test('pair report exposes deferred ability execution separately from progression',()=>{
  const report=compareJevPlayerPair(run(),run({laneCoach:'advisory',rtAbilityPrefetches:8,
    rtAbilityPrefetchExecutions:6,rtAbilityRoundtimeDeferrals:2}));
  assert.equal(report.candidate.rtAbilityPrefetches,8);
  assert.equal(report.candidate.rtAbilityPrefetchExecutions,6);
  assert.equal(report.candidate.rtAbilityRoundtimeDeferrals,2);
  assert.equal(report.candidateMinusBaseline.rtAbilityPrefetchExecutions,6);
});

test('pair report requires an explicitly declared RT ability health-floor treatment',()=>{
  const baseline=run();
  const candidate=run({laneCoach:'advisory',rtAbilityPrefetchMinHpFraction:0.75,rtAbilityPrefetches:4,
    rtAbilityPrefetchCancellations:1});
  assert.equal(compareJevPlayerPair(baseline,candidate).comparable,false);
  const report=compareJevPlayerPair(baseline,candidate,{expectedPrefetchHealthFloor:0.75});
  assert.equal(report.comparable,true);
  assert.deepEqual(report.mismatches,[]);
  assert.deepEqual(report.prefetchHealthTreatment,{baseline:0,candidate:0.75});
  assert.equal(report.candidate.rtAbilityPrefetchCancellations,1);
  assert.equal(report.candidateMinusBaseline.rtAbilityPrefetchCancellations,1);
});

test('pair report exposes coaching treatment, mapped choices and observed lane learning',()=>{
  const report=compareJevPlayerPair(run(),run({laneCoach:'advisory',laneCoachStats:{
    decisions:100,gateMappedChoices:72,preservedProviderChoices:31,
    observedRankAdvances:8,observedLearningMindstateAdvances:19,stalledDecisionPrompts:2,
  }}));
  assert.equal(report.candidate.laneCoachDecisions,100);
  assert.equal(report.candidate.laneCoachGateMappedChoices,72);
  assert.equal(report.candidate.laneCoachPreservedProviderChoices,31);
  assert.equal(report.candidate.laneCoachObservedLearningMindstateAdvances,19);
  assert.equal(report.candidate.laneCoachStalledDecisionPrompts,2);
  assert.equal(report.candidateMinusBaseline.laneCoachPreservedProviderChoices,31);
  assert.equal(report.candidateMinusBaseline.laneCoachObservedLearningMindstateAdvances,19);
});

test('pair audit refuses differing source hashes or held-constant run settings',()=>{
  const baseline=run(),candidate=run({laneCoach:'advisory'});
  candidate.codeHashes.policy='changed';
  candidate.statAllocation.str=9;
  const report=compareJevPlayerPair(baseline,candidate);
  assert.equal(report.verdict,'invalid-pair');
  assert.deepEqual(report.mismatches,['statAllocation','codeHashes']);
});

test('pair audit does not call an in-flight comparison ready',()=>{
  const report=compareJevPlayerPair(run({status:'playing'}),run({status:'incomplete',laneCoach:'advisory'}));
  assert.equal(report.verdict,'pending-runs');
  assert.equal(report.comparable,true);
  assert.equal(report.terminal,false);
});

test('pair audit identifies missing manifests without fabricating a result',()=>{
  const report=compareJevPlayerPair(null,run({laneCoach:'advisory'}));
  assert.equal(report.verdict,'invalid-pair');
  assert.equal(report.baseline.status,'missing');
  assert.equal(report.baseline.targetReached,null,
    'missing target evidence remains unknown instead of becoming a false failure');
  assert.equal(report.candidate.rankPoints,30);
});
