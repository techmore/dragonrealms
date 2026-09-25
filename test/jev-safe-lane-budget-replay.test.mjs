import test from 'node:test';
import assert from 'node:assert/strict';
import { replaySafeLaneBudget } from '../scripts/lib/jev-safe-lane-budget-replay.mjs';

function menu(index,{id='attack_0',state={}}={}) {
  return {type:'local-decision',ts:new Date(index*1000).toISOString(),id,
    supervisorOverride:'safe-visible-prey-for-open-combat-gate',
    options:[{id:'practice_stealth'},{id:'forage'},{id:'perform'},
      {id:'appraise_dagger'},{id:'attack_0'}],
    state:{inCombat:false,hp:100,maxHp:100,roundtime:0,bleeding:[],quest:null,
      skills:{stealth:0,foraging:0,performance:0,appraisal:0},
      requirements:{rows:[
        {label:'1st survival',have:0,need:4,eligible:['stealth','foraging']},
        {label:'1st lore',have:0,need:2,eligible:['performance','appraisal']},
      ]},...state}};
}

test('releases a bounded fraction of safe optional attacks to directly offered open lanes',()=>{
  const report=replaySafeLaneBudget(Array.from({length:8},(_,i)=>menu(i)),{every:4});
  assert.equal(report.safeMenusWithOpenLaneChoice,8);
  assert.equal(report.optionalAttackOpportunities,8);
  assert.equal(report.releases,2);
  assert.equal(report.releaseRate,0.25);
  assert.deepEqual(report.displacedByAction,{attack_0:2});
  assert.match(report.scope,/No command, movement, EXP, or Circle outcome/);
});

test('rotates through available skills instead of repeatedly selecting the first action',()=>{
  const report=replaySafeLaneBudget(Array.from({length:12},(_,i)=>menu(i)),{every:2});
  assert.equal(report.releases,6);
  assert.deepEqual(report.candidateUseBySkill,{stealth:2,foraging:2,performance:1,appraisal:1});
});

test('never substitutes travel, active quests, combat, low health, or bleeding',()=>{
  const events=[
    menu(0,{id:'travel_fields_furrow'}),
    menu(1,{state:{quest:{kind:'kill',done:false}}}),
    menu(2,{state:{inCombat:true}}),
    menu(3,{state:{hp:74,maxHp:100}}),
    menu(4,{state:{bleeding:[{part:'arm'}]}}),
    menu(5,{state:{roundtime:3}}),
    menu(6,{state:{overloaded:true}}),
  ];
  const report=replaySafeLaneBudget(events,{every:1});
  assert.equal(report.releases,0);
  assert.equal(report.optionalAttackOpportunities,0);
  assert.equal(report.displacedByAction.travel_fields_furrow,undefined);
});

test('rejects invalid cadence or unsafe health thresholds',()=>{
  assert.throws(()=>replaySafeLaneBudget([],{every:0}),/every must be/);
  assert.throws(()=>replaySafeLaneBudget([],{hpFloor:0.4}),/hpFloor must be/);
});
