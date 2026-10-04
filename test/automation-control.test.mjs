import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAutomationPaused, onAutomationPause, setAutomationPaused } from '../public/js/automation-control.js';
test('automation latch notifies on transitions only and resumes explicitly', () => {
  const seen = [];
  const unsubscribe = onAutomationPause(v => seen.push(v));
  setAutomationPaused(true);
  setAutomationPaused(true);
  assert.equal(isAutomationPaused(), true);
  setAutomationPaused(false);
  assert.deepEqual(seen, [true, false]);
  unsubscribe();
});
