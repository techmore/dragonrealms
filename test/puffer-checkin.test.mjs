import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkIn, reviewPrompt } from '../public/js/puffer-checkin.js';

test('probe review prompt cannot call scripted milestones learned results',()=>{
  const prompt=reviewPrompt({run_id:'puffer-probe-123',run_kind:'scripted_feasibility',target_circle:20});
  assert.match(prompt,/targeting Circle 20/);
  assert.match(prompt,/no neural optimizer/);
  assert.match(prompt,/must not count as learned progress/);
});

const now = 1800000000000;
const active = { status: 'running', updated_at: now / 1000 };
test('fresh training and evaluation do not request unnecessary check-ins', () => {
  assert.equal(checkIn(active, { now }).tone, 'good');
  assert.equal(checkIn({ ...active, status: 'completed', evaluation_status: 'running' }, { now }).tone, 'good');
});
test('finished, rejected, stopped, approval and failed runs request review', () => {
  for (const state of [
    { status: 'completed' }, { status: 'stopped' }, { status: 'failed' },
    { status: 'completed', promotion: { status: 'rejected' } },
    { status: 'completed', promotion: { status: 'approval_required' } },
  ]) assert.notEqual(checkIn(state, { now }).tone, 'good');
  assert.match(checkIn({status:'completed', promotion:{status:'rejected'}}, {now}).title, /rejected/);
});
test('unknown, stale, future and unavailable telemetry never imply healthy activity', () => {
  for (const data of [null, {}, {...active, updated_at:null}, {...active, updated_at:(now-16000)/1000}, {...active, updated_at:(now+6000)/1000}])
    assert.equal(checkIn(data, {now}).tone, 'warn');
  assert.match(checkIn({status:'completed'}, {now,error:'offline'}).title, /connection/);
});
test('review request identifies the run without authorizing new work', () => {
  assert.match(reviewPrompt({run_id:'puffer-123'}), /Review Puffer run puffer-123/);
  assert.match(reviewPrompt({run_id:'puffer-123'}), /Do not launch/);
  assert.match(reviewPrompt({run_id:'<bad>'}), /unavailable/);
});
test('circling check-in distinguishes milestones from script superiority', () => {
  const state={run_id:'puffer-circle',scenario:'circling',status:'completed',promotion:{status:'approval_required'}};
  assert.match(checkIn(state,{now}).reason,/does not establish superiority/);
  assert.match(reviewPrompt(state),/learned activity selection and scripted command execution/);
  assert.match(reviewPrompt(state),/Do not launch another run/);
});
