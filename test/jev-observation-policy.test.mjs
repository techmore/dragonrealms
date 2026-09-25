import test from 'node:test';
import assert from 'node:assert/strict';
import { COMBAT_ASSESS_REFRESH_MS, ROOM_REFRESH_MS, combatEntryDecision, consumeCombatEntryFollowup, isDecisionDue, shouldAssessCombat, shouldRefreshRoom } from '../scripts/lib/jev-observation-policy.mjs';

test('room refresh stays within half the world respawn interval', () => {
  assert.equal(ROOM_REFRESH_MS, 12_500);
  assert.equal(shouldRefreshRoom({now:20_000,observedAt:7_501}), false);
  assert.equal(shouldRefreshRoom({now:20_000,observedAt:7_500}), true);
  assert.equal(shouldRefreshRoom({now:1_000,observedAt:0}), false);
  assert.equal(shouldRefreshRoom({now:1_000,observedAt:Number.NaN}), true);
});

test('combat assessment is refreshed on a bounded cadence', () => {
  assert.equal(shouldAssessCombat({now:20_000,assessedAt:1}), false);
  assert.equal(shouldAssessCombat({now:20_001,assessedAt:1}), true);
  assert.equal(shouldAssessCombat({now:1_000,assessedAt:0}), false);
  assert.equal(shouldAssessCombat({now:1_000,assessedAt:Number.NaN}), true);
  assert.equal(COMBAT_ASSESS_REFRESH_MS, 20_000);
});

test('new combat bypasses ordinary dwell to preserve the initial RT-free action window', () => {
  assert.equal(isDecisionDue({now:1_000,nextDecisionAt:3_000,enteredCombat:true}),true);
  assert.equal(isDecisionDue({now:1_000,nextDecisionAt:3_000}),false);
  assert.equal(isDecisionDue({now:3_000,nextDecisionAt:3_000}),true);
});

test('combat transition queues exactly one immediate follow-up when the prior decision is busy', () => {
  assert.deepEqual(combatEntryDecision({inCombat:true,previousInCombat:false,decisionBusy:true}),
    {enteredCombat:true,deferFollowup:true});
  assert.deepEqual(combatEntryDecision({inCombat:true,previousInCombat:true,decisionBusy:true}),
    {enteredCombat:false,deferFollowup:false});
  assert.deepEqual(consumeCombatEntryFollowup(true,true),{run:true,pending:false});
  assert.deepEqual(consumeCombatEntryFollowup(true,false),{run:false,pending:false});
  assert.deepEqual(consumeCombatEntryFollowup(false,true),{run:false,pending:false});
});
