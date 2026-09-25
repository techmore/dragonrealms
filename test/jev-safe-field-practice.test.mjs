import test from 'node:test';
import assert from 'node:assert/strict';
import { SafeFieldPracticeCadence } from '../scripts/lib/jev-safe-field-practice.mjs';

const options=[
  {id:'practice_stealth',command:'hide'},
  {id:'forage',command:'forage'},
  {id:'hunt_signs',command:'hunt'},
  {id:'perform',command:'perform'},
  {id:'appraise_dagger',command:'appraise dagger'},
];
function event({id='attack_0',state={},menu=options}={}){
  return {id,options:menu,state:{hp:90,maxHp:100,inCombat:false,roundtime:0,
    bleeding:false,overloaded:false,requirements:{rows:[
      {label:'4th survival',have:0,need:2,eligible:['stealth','foraging','perception']},
      {label:'1st lore',have:0,need:2,eligible:['performance','appraisal']},
    ]},...state}};
}

test('releases one already-offered open-lane action on each configured safe cadence',()=>{
  const policy=new SafeFieldPracticeCadence({every:4});
  for(let i=1;i<=3;i++)assert.equal(policy.consider(event()).released,false);
  const first=policy.consider(event());
  assert.equal(first.released,true);
  assert.equal(first.option.id,'practice_stealth');
  assert.equal(first.skill,'stealth');
  assert.equal(first.baselineAction,'attack_0');
  assert.equal(first.reason,'safe-field-practice-cadence');
  assert.equal(policy.snapshot().releases,1);
});

test('rotates least-recently-used offered skills instead of repeating the first menu entry',()=>{
  const policy=new SafeFieldPracticeCadence({every:1});
  const selected=[];
  for(let i=0;i<10;i++)selected.push(policy.consider(event()).skill);
  assert.deepEqual(selected,['stealth','foraging','perception','performance','appraisal',
    'stealth','foraging','perception','performance','appraisal']);
});

test('candidate only substitutes safe fresh attacks when an open mapped skill is offered',()=>{
  const unsafe=[
    event({state:{inCombat:true}}),event({state:{hp:74}}),event({state:{roundtime:1}}),
    event({state:{bleeding:true}}),event({state:{quest:{kind:'delivery'}}}),
    event({state:{overloaded:true}}),event({id:'travel_fields_furrow'}),
    event({menu:[{id:'attack_0',command:'attack hog'}]}),
    event({state:{requirements:{rows:[{label:'1st weapon',have:0,need:4,eligible:['small_edged']}]}}}),
  ];
  for(const input of unsafe){
    const policy=new SafeFieldPracticeCadence({every:1});
    assert.equal(policy.consider(input).released,false);
    assert.equal(policy.snapshot().releases,0);
  }
});

test('cadence and fair rotation survive serialization across process restarts',()=>{
  const first=new SafeFieldPracticeCadence({every:2,hpFloor:0.8});
  first.consider(event());
  const restored=new SafeFieldPracticeCadence({snapshot:first.snapshot()});
  assert.equal(restored.snapshot().every,2);
  assert.equal(restored.snapshot().hpFloor,0.8);
  const release=restored.consider(event());
  assert.equal(release.released,true);
  assert.equal(release.skill,'stealth');
});

test('rejects invalid policy configuration',()=>{
  assert.throws(()=>new SafeFieldPracticeCadence({every:0}),/every must be/);
  assert.throws(()=>new SafeFieldPracticeCadence({hpFloor:0.4}),/hpFloor must be/);
});
