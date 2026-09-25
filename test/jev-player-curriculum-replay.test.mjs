import test from 'node:test';
import assert from 'node:assert/strict';
import { bridgeCurriculumAction } from '../scripts/lib/jev-curriculum-bridge.mjs';

test('curriculum replay projection selects legal perform at the observed underfunded state',()=>{
  const state={guild:'barbarian',inCombat:false,hp:100,maxHp:100,silver:15,
    purchasedItems:['dagger','padded_cloth','shield_wood'],equipment:{},requirements:{rows:[]}};
  const result=bridgeCurriculumAction([{id:'perform',kind:'command'},{id:'travel_fields_furrow',kind:'navigate'}],state);
  assert.equal(result.action.id,'perform');
  assert.equal(result.phase,'kit-funding');
});
