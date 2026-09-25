import {test} from 'node:test';
import assert from 'node:assert/strict';
import {controlObserver} from '../puffer_adapter/control_observer.mjs';
const prompt=(have=0)=>({t:'prompt',msg:'HP: 100/100  Fire: 100/100  Stamina: 100/100  Circle 1  150 silvers',
  requirements:{circle:2,rows:[{label:'expertise',have,need:8}]}});
test('ordinary frames drive hall handoff and acknowledged kills are not reused',()=>{
  let time=0;const observer=controlObserver({now:()=>time});
  observer.feed({t:'room',roomId:'sewers_3'});
  observer.feed({t:'hands',worn:[]});
  observer.feed({t:'msg',msg:'Training Points (TDPs): 20'});
  observer.feed({t:'combat',msg:'A kobold crumples to the ground.'});
  time=50000;observer.feed(prompt());
  const decision=observer.decision();
  assert.equal(decision.reason,'purse_trigger');
  observer.acknowledge(decision);
  assert.equal(observer.decision().action,'hold');
  assert.equal(observer.snapshot.killsAtVisit,1);
});
test('unavailable, stale and disconnected observations do not trigger travel',()=>{
  let time=0;const observer=controlObserver({now:()=>time});
  assert.equal(observer.decision().action,'hold');
  observer.feed({t:'room',roomId:'sewers_3'});observer.feed(prompt(8));
  observer.feed({t:'combat',msg:'A rat dies.'});
  assert.equal(observer.decision().reason,'requirements_met');
  time=15001;assert.equal(observer.decision().action,'hold');
  observer.feed({t:'disconnect'});observer.feed(prompt(8));
  assert.equal(observer.decision().action,'hold');
});
test('training list uses received requirement prose and does not retain private text',()=>{
  const observer=controlObserver();
  observer.feed({t:'msg',msg:'Guild circle progress:\nexpertise at least rank 8 (you have 0)'});
  assert.ok(observer.snapshot.training.includes('expertise'));
  observer.feed({t:'msg',msg:'private chat secret'});
  assert.equal(JSON.stringify(observer.snapshot).includes('secret'),false);
});
