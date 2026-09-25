import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hallHandoff} from '../puffer_adapter/hall_handoff.mjs';

const base={hunting:true,inCombat:false,kills:1,killsAtVisit:0,elapsedSinceHallMs:10000,
  elapsedSinceEntryMs:10000,requirementsMet:false,tdp:20,silver:0,helmWorn:false};
test('hall subset uses requirement, purse and fallback triggers in Sims order',()=>{
  assert.equal(hallHandoff({...base,requirementsMet:true}).reason,'requirements_met');
  assert.equal(hallHandoff({...base,silver:120,elapsedSinceHallMs:45001}).reason,'purse_trigger');
  assert.equal(hallHandoff({...base,silver:40,helmWorn:true,elapsedSinceHallMs:45001}).reason,'purse_trigger');
  assert.equal(hallHandoff({...base,silver:40,elapsedSinceHallMs:45001}).action,'hold');
  assert.equal(hallHandoff({...base,elapsedSinceHallMs:240001}).reason,'fallback_timer');
  assert.equal(hallHandoff({...base,elapsedSinceHallMs:240000}).action,'hold');
});
test('missing observations and combat never trigger a blind hall trip',()=>{
  for (const patch of [{inCombat:true},{inCombat:null},{requirementsMet:null},{kills:NaN},{elapsedSinceHallMs:-1}])
    assert.equal(hallHandoff({...base,...patch}).action,'hold');
  assert.equal(hallHandoff({...base,killsAtVisit:1,elapsedSinceHallMs:300000}).action,'hold');
});
test('TDP probes and low-balance skips mirror the source supervisor without blocking ready gates',()=>{
  assert.equal(hallHandoff({...base,tdp:0,elapsedSinceHallMs:300000}).action,'skip');
  assert.equal(hallHandoff({...base,tdp:0,requirementsMet:true}).action,'hall');
  assert.equal(hallHandoff({...base,tdp:null,kills:6}).action,'probe_tdp');
  assert.equal(hallHandoff({...base,tdp:null,elapsedSinceEntryMs:180001}).action,'probe_tdp');
  assert.equal(hallHandoff({...base,tdp:null}).action,'hold');
});
