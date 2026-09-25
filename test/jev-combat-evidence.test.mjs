import test from 'node:test';
import assert from 'node:assert/strict';
import { CombatEvidence, sustainedCombatLoss, uncertaintyRecovery } from '../scripts/lib/jev-combat-evidence.mjs';

test('combat evidence measures observed HP loss and separates incoming/outgoing damage', () => {
  const e=new CombatEvidence();
  e.prompt({inCombat:true,hp:100},1000);
  e.text('You strike a marsh hog in the shoulder for 7 damage!',2000);
  e.text('A marsh hog clips your head for 6 damage.',3000);
  e.prompt({inCombat:true,hp:94},4000);
  const s=e.snapshot(4000);
  assert.equal(s.observedSeconds,3);assert.equal(s.hpLoss,6);
  assert.equal(s.parsedIncomingDamage,6);assert.equal(s.parsedOutgoingDamage,7);
  assert.equal(s.assessment,null);
  e.prompt({inCombat:false,hp:94},5000);
  assert.equal(e.snapshot(5000).hpLoss,null);
  assert.equal(e.snapshot(5000).parsedOutgoingDamage,0);
});
test('stale evidence expires, including assessment and old fights', () => {
  const e=new CombatEvidence();e.prompt({inCombat:true,hp:100},0);
  e.text('You assess your combat situation... fists',1000);
  assert.ok(e.snapshot(2000).assessment);
  assert.equal(e.snapshot(20000).assessment,null);
  e.prompt({inCombat:true,hp:50},40000);
  assert.equal(e.snapshot(40000).observedSeconds,0);
  assert.equal(e.snapshot(40000).hpLoss,0);
});
test('persistent uncertainty attempts escape rather than abandoning active combat', () => {
  assert.deepEqual(uncertaintyRecovery(true,1),{command:'assess'});
  assert.deepEqual(uncertaintyRecovery(true,3),{command:'flee',escape:true});
  assert.deepEqual(uncertaintyRecovery(false,3),{stop:true});
});

test('sustained material HP loss triggers safety override before critical health', () => {
  assert.equal(sustainedCombatLoss({observedSeconds:7.9,hpLoss:40},145),false,
    'a short sample window is insufficient');
  assert.equal(sustainedCombatLoss({observedSeconds:8,hpLoss:28},145),false,
    'small HP movement is not a failing fight');
  assert.equal(sustainedCombatLoss({observedSeconds:13,hpLoss:37},145),true,
    'the observed run lost 37 HP over 13 seconds but its prior guard waited for 30%');
  assert.equal(sustainedCombatLoss({observedSeconds:20,hpLoss:40},145),true);
  assert.equal(sustainedCombatLoss({observedSeconds:20,hpLoss:40},0),false);
  assert.equal(sustainedCombatLoss({observedSeconds:20,hpLoss:null},145),false);
});
