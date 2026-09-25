import test from 'node:test';
import assert from 'node:assert/strict';
import { jevStatPolicy, jevStatPolicyNames } from '../scripts/lib/jev-stat-policy.mjs';
import { mentalStatBonus } from '../data/skill-math.js';

test('Jev stat candidates use equal point budgets and preserve the physical control', () => {
  assert.deepEqual(jevStatPolicyNames(), ['physical-combat-v1','mental-learning-v1']);
  assert.deepEqual(jevStatPolicy('physical-combat-v1'), {
    name:'physical-combat-v1', allocation:{str:10,con:10,agi:5,ref:5}, points:30,
  });
  assert.deepEqual(jevStatPolicy('mental-learning-v1'), {
    name:'mental-learning-v1', allocation:{int:10,dis:10,wis:10}, points:30,
  });
});

test('mental-learning allocation raises modeled skill pool and pulse modifiers', () => {
  const poolBefore=1+(mentalStatBonus(35,'int')+mentalStatBonus(35,'disc'))/1000;
  const poolAfter=1+(mentalStatBonus(45,'int')+mentalStatBonus(45,'disc'))/1000;
  const pulseBefore=1+mentalStatBonus(35,'int')/1000;
  const pulseAfter=1+mentalStatBonus(45,'int')/1000;
  assert.ok(poolAfter>poolBefore);
  assert.ok(pulseAfter>pulseBefore, 'Wisdom shares the Intelligence curve');
  assert.ok(poolAfter/poolBefore-1>0.03 && poolAfter/poolBefore-1<0.04);
  assert.ok(pulseAfter/pulseBefore-1>0.02 && pulseAfter/pulseBefore-1<0.03);
});

test('unknown allocation policies fail before character creation', () => {
  assert.throws(()=>jevStatPolicy('invented'),/Unknown Jev stat policy/);
});
