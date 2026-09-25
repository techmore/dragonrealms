import test from 'node:test';
import assert from 'node:assert/strict';
import { PREFETCH_HEALTH_PAIR_QUEUE, prefetchHealthPairQueueMayLaunch }
  from '../scripts/jev-player-prefetch-health-pair-queue.mjs';

const queues=Object.fromEntries(PREFETCH_HEALTH_PAIR_QUEUE.prerequisiteQueueIds.map(id=>[id,'finished']));
const comparisons=Object.fromEntries(PREFETCH_HEALTH_PAIR_QUEUE.prerequisiteComparisonIds.map(id=>[id,'incomplete']));

test('health-floor pair requires usable prior queues and runs, not merely terminal failures',()=>{
  assert.equal(prefetchHealthPairQueueMayLaunch({queueStates:queues,comparisonStates:comparisons}),true);
  const [queueId]=PREFETCH_HEALTH_PAIR_QUEUE.prerequisiteQueueIds;
  assert.equal(prefetchHealthPairQueueMayLaunch({queueStates:{...queues,[queueId]:'playing'},
    comparisonStates:comparisons}),false);
  const [comparisonId]=PREFETCH_HEALTH_PAIR_QUEUE.prerequisiteComparisonIds;
  assert.equal(prefetchHealthPairQueueMayLaunch({queueStates:queues,
    comparisonStates:{...comparisons,[comparisonId]:'playing'}}),false);
  assert.equal(prefetchHealthPairQueueMayLaunch({queueStates:queues,
    comparisonStates:{...comparisons,[comparisonId]:null}}),false);
  assert.equal(prefetchHealthPairQueueMayLaunch({queueStates:{...queues,[queueId]:'failed'},
    comparisonStates:comparisons}),false,'a failed prerequisite must block an incomparable follow-up');
  assert.equal(prefetchHealthPairQueueMayLaunch({queueStates:queues,
    comparisonStates:{...comparisons,[PREFETCH_HEALTH_PAIR_QUEUE.prerequisiteComparisonIds[0]]:'failed'}}),false);
});

test('health-floor pair changes only the prefetch HP floor across a matched natural-speed cohort',()=>{
  const q=PREFETCH_HEALTH_PAIR_QUEUE;
  assert.equal(q.durationMinutes,240);
  assert.equal(q.settings.model,'qwen3:4b');
  assert.equal(q.settings.experienceBoost,1);
  assert.equal(q.settings.targetCircle,3);
  assert.equal(q.settings.laneCoach,'off');
  assert.deepEqual(q.settings.rtAbilityPrefetchMinHpFractionPair,[0,0.75]);
  assert.match(q.baselineComparisonId,/prefetch-health-off/);
  assert.match(q.candidateComparisonId,/prefetch-health-75/);
});
