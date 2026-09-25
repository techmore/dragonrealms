import test from 'node:test';
import assert from 'node:assert/strict';
import { LANE_COACH_QUEUE, queueMayLaunch } from '../scripts/jev-player-lane-coach-queue.mjs';
import { CONTROL_QUEUE, controlQueueMayLaunch } from '../scripts/jev-player-control-queue.mjs';
import { QWEN8B_PAIR_QUEUE, qwen8bPairQueueMayLaunch } from '../scripts/jev-player-qwen8b-pair-queue.mjs';

const terminal={};
for(const id of LANE_COACH_QUEUE.blockerRunIds)terminal[id]='complete';

test('queued coached comparison waits for the uncoached V20 baseline to exist and finish',()=>{
  assert.equal(queueMayLaunch({blockerStates:terminal,baselineState:'complete',baselineSeen:false}),false);
  assert.equal(queueMayLaunch({blockerStates:terminal,baselineState:'playing',baselineSeen:true}),false);
  assert.equal(queueMayLaunch({blockerStates:terminal,baselineState:'complete',baselineSeen:true}),true);
});

test('queued coached comparison waits while either existing local cohort is active or unknown',()=>{
  const [first,second]=LANE_COACH_QUEUE.blockerRunIds;
  assert.equal(queueMayLaunch({blockerStates:{...terminal,[first]:'playing'},
    baselineState:'complete',baselineSeen:true}),false);
  assert.equal(queueMayLaunch({blockerStates:{...terminal,[second]:null},
    baselineState:'complete',baselineSeen:true}),false);
  assert.equal(queueMayLaunch({blockerStates:{[first]:'complete'},
    baselineState:'complete',baselineSeen:true}),false);
});

test('queued comparison refuses failed prerequisites instead of treating failure as terminal-ready',()=>{
  assert.equal(queueMayLaunch({blockerStates:{...terminal,
    [LANE_COACH_QUEUE.blockerRunIds[0]]:'failed'},baselineState:'complete',baselineSeen:true}),false);
  assert.equal(queueMayLaunch({blockerStates:terminal,baselineState:'failed',baselineSeen:true}),false);
  assert.equal(controlQueueMayLaunch({[CONTROL_QUEUE.blockerRunIds[0]]:'complete',
    [CONTROL_QUEUE.blockerRunIds[1]]:'failed'}),false);
  assert.equal(qwen8bPairQueueMayLaunch({blockerStates:Object.fromEntries(
    QWEN8B_PAIR_QUEUE.blockerRunIds.map(id=>[id,'complete'])),prerequisiteSeen:true,
    prerequisiteState:'failed'}),false);
});

test('queued comparison changes only the lane-coach treatment while holding cohort settings',()=>{
  assert.equal(LANE_COACH_QUEUE.durationMinutes,240);
  assert.equal(LANE_COACH_QUEUE.settings.experienceBoost,1);
  assert.equal(LANE_COACH_QUEUE.settings.model,'qwen3:4b');
  assert.equal(LANE_COACH_QUEUE.settings.laneCoach,'advisory');
  assert.equal(LANE_COACH_QUEUE.candidateComparisonId.includes('natural-240m-physical'),true);
});

test('V20 control waits for both older Ollama cohorts to finish before using Qwen 4B',()=>{
  assert.deepEqual(CONTROL_QUEUE.blockerRunIds,LANE_COACH_QUEUE.blockerRunIds);
  assert.equal(CONTROL_QUEUE.durationMinutes,240);
  assert.equal(CONTROL_QUEUE.settings.model,LANE_COACH_QUEUE.settings.model);
  assert.equal(CONTROL_QUEUE.settings.laneCoach,'off');
  assert.equal(controlQueueMayLaunch(Object.fromEntries(CONTROL_QUEUE.blockerRunIds.map(id=>[id,'complete']))),true);
  assert.equal(controlQueueMayLaunch({[CONTROL_QUEUE.blockerRunIds[0]]:'complete',
    [CONTROL_QUEUE.blockerRunIds[1]]:'playing'}),false);
  assert.equal(controlQueueMayLaunch({[CONTROL_QUEUE.blockerRunIds[0]]:'complete'}),false,
    'unknown blocker state is not interpreted as terminal');
});

test('queued Qwen3:8B pair waits for the 4B advisory cohort and older blockers',()=>{
  const states=Object.fromEntries(QWEN8B_PAIR_QUEUE.blockerRunIds.map(id=>[id,'complete']));
  assert.equal(qwen8bPairQueueMayLaunch({blockerStates:states,
    prerequisiteSeen:false,prerequisiteState:'complete'}),false);
  assert.equal(qwen8bPairQueueMayLaunch({blockerStates:states,
    prerequisiteSeen:true,prerequisiteState:'playing'}),false);
  assert.equal(qwen8bPairQueueMayLaunch({blockerStates:states,
    prerequisiteSeen:true,prerequisiteState:'complete'}),true);
  assert.equal(qwen8bPairQueueMayLaunch({blockerStates:{...states,
    [QWEN8B_PAIR_QUEUE.blockerRunIds[0]]:'playing'},
    prerequisiteSeen:true,prerequisiteState:'complete'}),false);
});

test('Qwen3:8B follow-up pair holds settings and changes only coaching treatment',()=>{
  assert.equal(QWEN8B_PAIR_QUEUE.durationMinutes,240);
  assert.equal(QWEN8B_PAIR_QUEUE.settings.model,'qwen3:8b');
  assert.equal(QWEN8B_PAIR_QUEUE.baselineComparisonId.includes('natural-240m-physical'),true);
  assert.equal(QWEN8B_PAIR_QUEUE.candidateComparisonId.includes('natural-240m-physical'),true);
  assert.deepEqual(QWEN8B_PAIR_QUEUE.settings.laneCoachPair,['off','advisory']);
});
