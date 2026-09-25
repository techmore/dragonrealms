import test from 'node:test';
import assert from 'node:assert/strict';
import { skillCensusQueueMayLaunch } from '../scripts/jev-player-skill-census-queue.mjs';

test('census run waits for finished V29 and terminal matched runs',()=>{
  assert.equal(skillCensusQueueMayLaunch({prerequisiteQueueStatus:'finished',
    baselineStatus:'incomplete',priorTreatmentStatus:'complete'}),true);
  assert.equal(skillCensusQueueMayLaunch({prerequisiteQueueStatus:'playing',
    baselineStatus:'incomplete',priorTreatmentStatus:'complete'}),false);
  assert.equal(skillCensusQueueMayLaunch({prerequisiteQueueStatus:'finished',
    baselineStatus:'playing',priorTreatmentStatus:'complete'}),false);
  assert.equal(skillCensusQueueMayLaunch({prerequisiteQueueStatus:'finished',
    baselineStatus:'incomplete',priorTreatmentStatus:'failed'}),false);
});

test('census queue will not compete with another active local-model run',()=>{
  assert.equal(skillCensusQueueMayLaunch({prerequisiteQueueStatus:'finished',
    baselineStatus:'incomplete',priorTreatmentStatus:'complete',
    activeLocalRuns:[{runId:'unrelated',status:'playing'}]}),false);
});
