import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activity, matchingRecords, verifiedMilestones, workSummary } from '../public/js/puffer-records.js';
test('validation and replay labels do not claim inherited optimizer updates',()=>{
  const now=1800000000000;
  const data={run_kind:'frozen_validation',status:'running',evaluation_status:'running',updated_at:now,
    updates:32,parent_run:'puffer-source',validation_seeds:[1000,1001]};
  assert.match(workSummary(data),/no training/);
  assert.doesNotMatch(workSummary(data),/32 PPO/);
  assert.equal(activity(data,'',now).label,'Validating · frozen weights');
  assert.match(workSummary({run_kind:'frozen_live_play',seed:7740620}),/not new held-out/);
  assert.equal(activity({...data,status:'interrupted',evaluation_status:'interrupted'},'',now).active,false);
});
test('running requires recognized fresh telemetry; saved runs are idle', () => {
  const now = 1800000000000;
  assert.equal(activity({status:'running', updated_at:now}, '', now).active, true);
  assert.equal(activity({status:'completed', evaluation_status:'running', updated_at:now}, '', now).label, 'Evaluating · active');
  for (const state of [{status:'running', updated_at:now-16000}, {status:'running'}, {status:'completed'}, {status:'failed'}])
    assert.equal(activity(state, '', now).active, false);
  assert.equal(activity({status:'running',updated_at:now}, 'offline', now).active, false);
});
test('records must match the current run, not arbitrary historical best', () => {
  const data = {schema:'dragonrealms.puffer.records/1',groups:[{runs:['a'],raw_exp:{mean_exp:50}}]};
  assert.equal(matchingRecords(data,'a').raw_exp.mean_exp,50);
  assert.equal(matchingRecords(data,'b'),null);
  assert.equal(matchingRecords(null,'a'),null);
  assert.equal(matchingRecords(data,'a',{scenario:'circling'}),null);
});
test('circle banner requires a milestone and satisfied engine requirements', () => {
  assert.deepEqual(verifiedMilestones({max_circle:20}),[]);
  assert.deepEqual(verifiedMilestones({circle_milestones:{circle:2}}),[]);
  const earned={circle:2,requirements:{ok:true}};
  assert.deepEqual(verifiedMilestones({circle_milestones:[
    {circle:1,requirements:{ok:true}}, {circle:2},
    {circle:3,requirements:{ok:false}}, earned,
  ]}),[earned]);
});
