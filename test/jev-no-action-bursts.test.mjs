import test from 'node:test';
import assert from 'node:assert/strict';
import { findJevNoActionBursts } from '../scripts/lib/jev-no-action-bursts.mjs';
const wait=(ts,room='fields_furrow')=>({ts,type:'wait',reason:'only-legal-action',room});
test('classifies a continuous wait wedge and counts intervening decisions',()=>{
  const events=[wait('2026-01-01T00:00:00Z'),wait('2026-01-01T00:00:10Z'),
    {ts:'2026-01-01T00:00:11Z',type:'local-decision',id:'rest'},
    wait('2026-01-01T00:00:20Z'),wait('2026-01-01T00:00:30Z'),wait('2026-01-01T00:00:40Z'),
    wait('2026-01-01T00:00:50Z')];
  const report=findJevNoActionBursts(events,{minWaits:4});
  assert.equal(report.waitCount,6);assert.equal(report.burstCount,1);
  assert.equal(report.maxWaitBurst.waits,6);assert.equal(report.maxWaitBurst.decisions,1);
});
test('does not merge scattered waits into a false stall',()=>{
  const report=findJevNoActionBursts([wait('2026-01-01T00:00:00Z'),wait('2026-01-01T00:01:00Z'),wait('2026-01-01T00:02:00Z')],{minWaits:2});
  assert.equal(report.waitCount,3);assert.equal(report.burstCount,0);assert.equal(report.maxWaitBurst,null);
});
test('rejects invalid thresholds',()=>{assert.throws(()=>findJevNoActionBursts([],{minWaits:1}),/at least 2/);assert.throws(()=>findJevNoActionBursts([],{maxGapSeconds:0}),/positive/);});
