import test from 'node:test';
import assert from 'node:assert/strict';
import { JevProgressObserver } from '../scripts/lib/jev-progress.mjs';

const snapshot = (expertise = 0, weapon = 0, mindstate = 'perusing') => ({
  circle:1,
  requirements:{rows:[
    {label:'expertise',have:expertise,need:1},
    {label:'1st weapon',have:weapon,need:2},
  ]},
  skills:{expertise},
  skillLearning:[{name:'Performance',rank:0,mindstate}],
});

test('progress observer distinguishes learning-pool movement from circle-rank closure', () => {
  const observer = new JevProgressObserver({startedAt:1000});
  const initial = observer.observe(snapshot(),1000);
  assert.equal(initial.rankPointsGained,0);
  assert.equal(initial.secondsSinceProgress,0);

  const learning = observer.observe(snapshot(0,0,'learning'),5000);
  assert.equal(learning.rankPointsGained,0);
  assert.equal(learning.mindstateAdvances,1);
  assert.equal(learning.secondsSinceProgress,0);
  assert.equal(learning.activityState,'learning-only-no-gate-rank');
  assert.equal(learning.secondsSinceGateProgress,4);
  assert.equal(learning.secondsSinceLearningProgress,0);

  const stalled = observer.observe(snapshot(0,0,'learning'),15000);
  assert.equal(stalled.secondsSinceProgress,10);
  assert.equal(stalled.secondsSinceGateProgress,14);
  assert.equal(stalled.secondsSinceLearningProgress,10);

  const ranked = observer.observe(snapshot(1,0,'clear'),20000);
  assert.equal(ranked.rankPointsGained,1);
  assert.equal(ranked.rowsClosedSinceStart,1);
  assert.equal(ranked.unmetRows,1);
  assert.equal(ranked.secondsSinceProgress,0);
  assert.equal(ranked.activityState,'gate-progress-observed');
  assert.equal(ranked.secondsSinceGateProgress,0);
  assert.equal(ranked.secondsSinceLearningProgress,15);
});
