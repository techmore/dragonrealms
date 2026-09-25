import test from 'node:test';
import assert from 'node:assert/strict';
import { LOW_FUNDS_CRIER_QUEUE, lowFundsCrierQueueMayLaunch } from '../scripts/jev-player-low-funds-crier-queue.mjs';
test('low-funds queue waits for V31 and an idle local slot',()=>{
  assert.equal(lowFundsCrierQueueMayLaunch({prerequisiteQueueStatus:'finished',baselineStatus:'incomplete',priorStatus:'incomplete',activeLocalRuns:[]}),true);
  assert.equal(lowFundsCrierQueueMayLaunch({prerequisiteQueueStatus:'waiting',baselineStatus:'incomplete',priorStatus:'incomplete',activeLocalRuns:[]}),false);
  assert.equal(lowFundsCrierQueueMayLaunch({prerequisiteQueueStatus:'finished',baselineStatus:'playing',priorStatus:'incomplete',activeLocalRuns:[]}),false);
  assert.equal(lowFundsCrierQueueMayLaunch({prerequisiteQueueStatus:'finished',baselineStatus:'incomplete',priorStatus:'incomplete',activeLocalRuns:[{runId:'x'}]}),false);
});
test('queue is matched and isolates crier-priority behavior',()=>{assert.equal(LOW_FUNDS_CRIER_QUEUE.durationMinutes,240);assert.equal(LOW_FUNDS_CRIER_QUEUE.settings.model,'qwen3:4b');assert.equal(LOW_FUNDS_CRIER_QUEUE.settings.lowFundsCrier,true);assert.equal(LOW_FUNDS_CRIER_QUEUE.settings.overloadRecovery,undefined);});
