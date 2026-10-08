import test from 'node:test';
import assert from 'node:assert/strict';
import { PROGRESS_TABS, progressTab, nextProgressTab } from '../public/js/progress-panel.js';

test('progress tabs admit only requirements and passive training planning', () => {
  assert.deepEqual(PROGRESS_TABS,['progress','training']);
  assert.equal(Object.isFrozen(PROGRESS_TABS),true);
  assert.equal(progressTab('training'),'training');
  for(const key of ['progress','train','circle','raise strength','training;train',null]) assert.equal(progressTab(key),'progress');
});

test('progress keyboard navigation supports both arrows, Home and End', () => {
  for(const key of ['ArrowLeft','ArrowRight']) {
    assert.equal(nextProgressTab('progress',key),'training');
    assert.equal(nextProgressTab('training',key),'progress');
  }
  assert.equal(nextProgressTab('training','Home'),'progress');
  assert.equal(nextProgressTab('progress','End'),'training');
});
