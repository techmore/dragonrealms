import test from 'node:test';
import assert from 'node:assert/strict';
import { curriculumBridgeQueueMayLaunch } from '../scripts/jev-player-curriculum-bridge-queue.mjs';

test('curriculum bridge queue waits for terminal matched runs and local-model exclusivity', () => {
  assert.equal(curriculumBridgeQueueMayLaunch({prerequisiteStatus:'playing',baselineStatus:'incomplete'}), false);
  assert.equal(curriculumBridgeQueueMayLaunch({prerequisiteStatus:'incomplete',baselineStatus:'incomplete'}), true);
  assert.equal(curriculumBridgeQueueMayLaunch({prerequisiteStatus:'complete',baselineStatus:'incomplete',activeLocalRuns:[{status:'playing'}]}), false);
});
