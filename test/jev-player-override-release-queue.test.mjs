import test from 'node:test';
import assert from 'node:assert/strict';
import { OVERRIDE_RELEASE_QUEUE, overrideReleaseQueueMayLaunch } from '../scripts/jev-player-override-release-queue.mjs';

const queues=Object.fromEntries(OVERRIDE_RELEASE_QUEUE.prerequisiteQueueIds.map(id=>[id,'finished']));
const comparisons=Object.fromEntries(OVERRIDE_RELEASE_QUEUE.prerequisiteComparisonIds.map(id=>[id,'incomplete']));

test('repeat-choice candidate waits for all previous comparisons and manifests to finish',()=>{
  assert.equal(overrideReleaseQueueMayLaunch({queueStates:queues,comparisonStates:comparisons}),true);
  const [firstQueue]=OVERRIDE_RELEASE_QUEUE.prerequisiteQueueIds;
  assert.equal(overrideReleaseQueueMayLaunch({queueStates:{...queues,[firstQueue]:'playing'},
    comparisonStates:comparisons}),false);
  const [firstComparison]=OVERRIDE_RELEASE_QUEUE.prerequisiteComparisonIds;
  assert.equal(overrideReleaseQueueMayLaunch({queueStates:queues,
    comparisonStates:{...comparisons,[firstComparison]:'playing'}}),false);
  assert.equal(overrideReleaseQueueMayLaunch({queueStates:queues,
    comparisonStates:{...comparisons,[firstComparison]:null}}),false);
});

test('repeat-choice queue changes one setting from the existing natural-speed 4B control',()=>{
  assert.equal(OVERRIDE_RELEASE_QUEUE.durationMinutes,240);
  assert.equal(OVERRIDE_RELEASE_QUEUE.settings.model,'qwen3:4b');
  assert.equal(OVERRIDE_RELEASE_QUEUE.settings.experienceBoost,1);
  assert.equal(OVERRIDE_RELEASE_QUEUE.settings.targetCircle,3);
  assert.equal(OVERRIDE_RELEASE_QUEUE.settings.laneCoach,'off');
  assert.equal(OVERRIDE_RELEASE_QUEUE.settings.repeatedOverrideReleaseAfter,4);
});
