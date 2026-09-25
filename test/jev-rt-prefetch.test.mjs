import test from 'node:test';
import assert from 'node:assert/strict';
import { canPrefetchBarbarianAbility, prefetchedCombatActionStatus } from '../scripts/lib/jev-rt-prefetch.mjs';

const supernaturalRows=[{label:'1st supernatural',have:0,need:2,eligible:['augmentation']}];

test('prefetches only learned, affordable Barbarian abilities that can advance an open supernatural gate',()=>{
  const base={guild:'barbarian',inCombat:true,rt:2,abilityId:'dragon',
    learnedAbilities:['dragon'],innerFire:20,requirements:supernaturalRows};
  assert.equal(canPrefetchBarbarianAbility(base),true);
  assert.equal(canPrefetchBarbarianAbility({...base,rt:0}),false);
  assert.equal(canPrefetchBarbarianAbility({...base,guild:'trader'}),false);
  assert.equal(canPrefetchBarbarianAbility({...base,learnedAbilities:[]}),false);
  assert.equal(canPrefetchBarbarianAbility({...base,innerFire:19}),false);
  assert.equal(canPrefetchBarbarianAbility({...base,hp:74,maxHp:100,minHpFraction:0.75}),false);
  assert.equal(canPrefetchBarbarianAbility({...base,hp:75,maxHp:100,minHpFraction:0.75}),true);
  assert.equal(canPrefetchBarbarianAbility({...base,hp:109,maxHp:145,minHpFraction:0.75}),true);
  assert.equal(canPrefetchBarbarianAbility({...base,hp:108,maxHp:145,minHpFraction:0.75}),false);
  assert.equal(canPrefetchBarbarianAbility({...base,minHpFraction:0.75}),false,
    'opt-in health floor fails closed when health telemetry is missing');
  assert.equal(canPrefetchBarbarianAbility(base),true,
    'default behavior remains unchanged for existing runs');
  assert.equal(canPrefetchBarbarianAbility({...base,requirements:[]}),false);
  assert.equal(canPrefetchBarbarianAbility({...base,requirements:[{have:0,need:2,eligible:['warding_magic']}]}),false);
  assert.equal(canPrefetchBarbarianAbility({...base,abilityId:'tenacity',learnedAbilities:['tenacity'],innerFire:25,
    requirements:[{have:0,need:2,eligible:['warding_magic']}]}),true);
  assert.equal(canPrefetchBarbarianAbility({...base,oncePerFightActions:['ability_dragon']}),false);
});

test('a prefetched action waits for RT, and cancels when combat context or safety changes',()=>{
  const pending={id:'ability_dragon',room:'fields',retryAt:0,minHpFraction:0.75};
  const state={inCombat:true,room:'fields',hp:90,maxHp:100,rt:2,actionStillRelevant:true};
  assert.equal(prefetchedCombatActionStatus(pending,state),'wait');
  assert.equal(prefetchedCombatActionStatus(pending,{...state,rt:0}),'execute');
  assert.equal(prefetchedCombatActionStatus({...pending,retryAt:Date.now()+10_000},{...state,rt:0}),'wait');
  assert.equal(prefetchedCombatActionStatus(pending,{...state,room:'town',rt:0}),'cancel');
  assert.equal(prefetchedCombatActionStatus(pending,{...state,hp:74,rt:0}),'cancel');
  assert.equal(prefetchedCombatActionStatus(pending,{...state,actionStillRelevant:false,rt:0}),'cancel');
  assert.equal(prefetchedCombatActionStatus(pending,{...state,inCombat:false,rt:0}),'cancel');
});
