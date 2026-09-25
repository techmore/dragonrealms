import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceLaneCommitment, buildLaneCoachContext, preserveMappedChoice,
  recordLaneChoice } from '../scripts/lib/jev-lane-coach.mjs';

const state = {
  skills:{foraging:1,stealth:0,performance:0},
  requirements:{rows:[
    {label:'1st survival',have:1,need:4,eligible:['foraging','stealth']},
    {label:'2nd survival',have:0,need:4,eligible:['foraging','stealth']},
    {label:'1st lore',have:0,need:2,eligible:['performance']},
  ]},
};
const options = [
  {id:'forage',kind:'command',description:'Practice Foraging'},
  {id:'practice_stealth',kind:'command',description:'Practice Stealth'},
  {id:'perform',kind:'command',description:'Practice Performance'},
  {id:'attack_0',kind:'command',description:'Attack visible prey'},
];

test('lane coach maps only offered actions to currently unmet eligible requirements',()=>{
  const context=buildLaneCoachContext(state,options);
  assert.deepEqual(context.candidates.map(({actionId,skill,advances})=>({actionId,skill,advances})),[
    {actionId:'forage',skill:'foraging',advances:['1st survival','2nd survival']},
    {actionId:'practice_stealth',skill:'stealth',advances:['1st survival','2nd survival']},
    {actionId:'perform',skill:'performance',advances:['1st lore']},
  ]);
  assert.equal(context.mode,'advisory-only-no-action-override');
});

test('lane coach carries a still-open commitment and records only a useful provider choice',()=>{
  const context=buildLaneCoachContext(state,options,{skill:'stealth'});
  assert.equal(context.commitment.skill,'stealth');
  assert.deepEqual(recordLaneChoice(context,'practice_stealth'),{
    skill:'stealth',actionId:'practice_stealth',rows:['1st survival','2nd survival'],
  });
  assert.equal(recordLaneChoice(context,'attack_0'),null,
    'unmapped choices remain Jev choices but do not masquerade as gate progress');
});

test('lane coach preserves a lane while another distinct open row still needs it',()=>{
  const next={...state,requirements:{rows:state.requirements.rows.map(row=>
    row.label==='1st survival'?{...row,have:4}:row)}};
  const context=buildLaneCoachContext(next,options,{skill:'stealth'});
  assert.deepEqual(context.commitment.rows,['2nd survival']);
  assert.ok(!context.openLanes.find(lane=>lane.skill==='stealth')?.rows.includes('1st survival'));
});

test('lane coach drops a commitment after all rows it advances are closed',()=>{
  const next={...state,requirements:{rows:state.requirements.rows.map(row=>
    row.label.endsWith('survival')?{...row,have:row.need}:row)}};
  const context=buildLaneCoachContext(next,options,{skill:'stealth'});
  assert.equal(context.commitment,null);
});

test('combat choices map to the observed weapon and melee mastery gates',()=>{
  const combatState={...state,wieldedWeaponSkill:'small_edged',requirements:{rows:[
    {label:'1st weapon',have:1,need:8,eligible:['small_edged','brawling']},
    {label:'melee_mastery',have:2,need:8,eligible:['melee_mastery']},
  ]}};
  const context=buildLaneCoachContext(combatState,[{id:'attack_0',kind:'command',description:'Attack prey'}]);
  assert.deepEqual(context.candidates.map(({skill,advances})=>({skill,advances})),[
    {skill:'melee_mastery',advances:['melee_mastery']},
    {skill:'small_edged',advances:['1st weapon']},
  ]);
});

test('lane commitment tolerates delayed EXP pulses, then prompts a reconsideration after two pulses',()=>{
  const start=1_000_000;
  const first=buildLaneCoachContext(state,options,null,start);
  let commitment=advanceLaneCommitment(first,null,'practice_stealth',start);
  const afterOnePulse=buildLaneCoachContext(state,options,commitment,start+200_000);
  assert.equal(afterOnePulse.commitment.secondsWithoutRankProgress,200);
  assert.ok(!afterOnePulse.instructions.some(line=>line.includes('Reconsider it')));
  const afterTwoPulses=buildLaneCoachContext(state,options,commitment,start+401_000);
  assert.match(afterTwoPulses.instructions.at(-1),/neither a rank increase nor a learning-mindstate advance.*beyond two 200-second EXP pulses/);
});

test('observed learning mindstate advancement prevents a false stalled-lane warning',()=>{
  const start=1_000_000;
  const learning={...state,skillLearning:[{name:'Stealth',rank:0,mindstate:'dabbling'}]};
  const first=buildLaneCoachContext(learning,options,null,start);
  let commitment=advanceLaneCommitment(first,null,'practice_stealth',start);
  const advancing={...learning,skillLearning:[{name:'Stealth',rank:0,mindstate:'learning'}]};
  const context=buildLaneCoachContext(advancing,options,commitment,start+401_000);
  assert.equal(context.commitment.learningAdvancedSinceLastDecision,true);
  assert.ok(context.instructions.some(line=>line.includes('making experience progress')));
  assert.ok(!context.instructions.some(line=>line.includes('neither a rank increase')));
  commitment=advanceLaneCommitment(context,commitment,'practice_stealth',start+401_000);
  assert.equal(commitment.lastLearningProgressAt,start+401_000);
});

test('top-ten mindstate feed omission stays unknown and does not erase the last observed lane stage',()=>{
  const start=1_000_000;
  const learning={...state,skillLearning:[{name:'Stealth',rank:0,mindstate:'learning'}]};
  const first=buildLaneCoachContext(learning,options,null,start);
  let commitment=advanceLaneCommitment(first,null,'practice_stealth',start);
  const unavailable=buildLaneCoachContext({...state,skillLearning:[]},
    [{id:'attack_0',kind:'command',description:'Attack prey'}],commitment,start+200_000);
  commitment=advanceLaneCommitment(unavailable,commitment,'attack_0',start+200_000);
  assert.equal(commitment.lastObservedLearningStage,3);
  assert.equal(commitment.lastLearningProgressAt,start);
});

test('lane commitment survives menus where its action is temporarily unavailable',()=>{
  const now=1_000_000;
  const first=buildLaneCoachContext(state,options,null,now);
  const commitment=advanceLaneCommitment(first,null,'practice_stealth',now);
  const combatMenu=buildLaneCoachContext(state,[{id:'attack_0',kind:'command'}],commitment,now+10_000);
  assert.deepEqual(combatMenu.commitment.rows,['1st survival','2nd survival']);
  assert.deepEqual(combatMenu.openLanes.find(lane=>lane.skill==='stealth').offeredActions,[]);
  assert.equal(advanceLaneCommitment(combatMenu,commitment,'attack_0',now+10_000).skill,'stealth');
});

test('observed rank progress resets the lane stall clock; closed lanes release commitment',()=>{
  const start=1_000_000;
  const first=buildLaneCoachContext(state,options,null,start);
  let commitment=advanceLaneCommitment(first,null,'practice_stealth',start);
  const ranked={...state,skills:{...state.skills,stealth:1}};
  const afterRank=buildLaneCoachContext(ranked,options,commitment,start+500_000);
  assert.equal(afterRank.commitment.rankAdvancedSinceLastDecision,true);
  commitment=advanceLaneCommitment(afterRank,commitment,'practice_stealth',start+500_000);
  assert.equal(commitment.lastRankProgressAt,start+500_000);
  const noFieldRequirements={...ranked,requirements:{rows:[
    {label:'1st lore',have:0,need:2,eligible:['performance']},
  ]}};
  const released=buildLaneCoachContext(noFieldRequirements,options,commitment,start+501_000);
  assert.equal(released.commitment,null);
  assert.equal(advanceLaneCommitment(released,commitment,'attack_0',start+501_000),null);
});

test('opt-in coach preserves a gate-mapped Jev choice against field-practice override only',()=>{
  const coachState={...state,skills:{...state.skills,brawling:0},requirements:{rows:[
    {label:'1st weapon',have:0,need:8,eligible:['brawling','small_edged']},
    ...state.requirements.rows,
  ]}};
  const menu=[{id:'practice_brawling',kind:'command'},
    {id:'practice_stealth',kind:'command'}];
  const context=buildLaneCoachContext(coachState,menu);
  const supervised={action:menu[1],probabilities:{practice_brawling:0.7,practice_stealth:0.3},
    overrideReason:'practice-least-developed-open-survival-or-lore-lane'};
  const preserved=preserveMappedChoice({context,options:menu,choice:'practice_brawling',
    supervised,enabled:true});
  assert.equal(preserved.preserved,true);
  assert.equal(preserved.skill,'brawling');
  assert.equal(preserved.result.action.id,'practice_brawling');
  assert.equal(preserved.result.probability,0.7);
  assert.equal(preserved.result.overrideReason,null);
  assert.equal(preserveMappedChoice({context,options:menu,choice:'practice_brawling',
    supervised,enabled:false}).preserved,false,'default-off comparisons keep the existing supervisor');
  assert.equal(preserveMappedChoice({context,options:menu,choice:'practice_brawling',
    supervised,enabled:true,safetyOverride:true}).preserved,false,
  'emergency safety overrides retain authority');
  assert.equal(preserveMappedChoice({context,options:menu,choice:'practice_brawling',
    supervised:{...supervised,overrideReason:'offered-unmet-gear-lane'},enabled:true}).preserved,false,
  'all other supervisor rules remain unchanged');
});
