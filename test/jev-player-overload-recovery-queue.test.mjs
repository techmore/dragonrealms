import test from 'node:test';
import assert from 'node:assert/strict';
import { OVERLOAD_RECOVERY_QUEUE, overloadRecoveryQueueMayLaunch } from '../scripts/jev-player-overload-recovery-queue.mjs';

test('overload recovery waits for V30 terminal evidence and an idle local-model slot',()=>{
  assert.equal(overloadRecoveryQueueMayLaunch({prerequisiteQueueStatus:'finished',
    baselineStatus:'incomplete',censusStatus:'complete',activeLocalRuns:[]}),true);
  assert.equal(overloadRecoveryQueueMayLaunch({prerequisiteQueueStatus:'waiting',
    baselineStatus:'incomplete',censusStatus:'complete',activeLocalRuns:[]}),false);
  assert.equal(overloadRecoveryQueueMayLaunch({prerequisiteQueueStatus:'finished',
    baselineStatus:'playing',censusStatus:'complete',activeLocalRuns:[]}),false);
  assert.equal(overloadRecoveryQueueMayLaunch({prerequisiteQueueStatus:'finished',
    baselineStatus:'incomplete',censusStatus:'playing',activeLocalRuns:[]}),false);
  assert.equal(overloadRecoveryQueueMayLaunch({prerequisiteQueueStatus:'finished',
    baselineStatus:'incomplete',censusStatus:'complete',activeLocalRuns:[{runId:'other'}]}),false);
});

test('queued recovery run isolates one lever and matches the natural-speed control',()=>{
  assert.equal(OVERLOAD_RECOVERY_QUEUE.baselineComparisonId,
    'local-qwen3-4b-supervisor-v28-control-natural-240m-physical-20260921');
  assert.equal(OVERLOAD_RECOVERY_QUEUE.durationMinutes,240);
  assert.equal(OVERLOAD_RECOVERY_QUEUE.settings.model,'qwen3:4b');
  assert.equal(OVERLOAD_RECOVERY_QUEUE.settings.targetCircle,3);
  assert.equal(OVERLOAD_RECOVERY_QUEUE.settings.overloadRecovery,true);
  assert.equal(OVERLOAD_RECOVERY_QUEUE.settings.skillCensus,undefined);
});
