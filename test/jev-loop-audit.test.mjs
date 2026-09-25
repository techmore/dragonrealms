import test from 'node:test';
import assert from 'node:assert/strict';
import { SKILLS } from '../data/skills.js';
import { auditJevDecisionLoops } from '../scripts/lib/jev-loop-audit.mjs';

function decision(index, {id='practice_brawling',room='fields',points=4,skill=0,
  providerChoice='practice_brawling',supervisorOverride=null}={}) {
  return {type:'local-decision',ts:new Date(index*20_000).toISOString(),id,
    command:id,state:{room,skills:{brawling:skill},requirements:{rows:[
      {label:'2nd weapon',have:points,need:8},
    ]}},providerChoice,supervisorOverride};
}

test('flags only long same-action streaks with unchanged displayed gate progress',()=>{
  const events=Array.from({length:10},(_,i)=>decision(i));
  const report=auditJevDecisionLoops(events);
  assert.equal(report.decisionsAnalyzed,10);
  assert.equal(report.streaks.length,1);
  assert.equal(report.flatGateStreaks.length,1);
  assert.equal(report.streaks[0].decisions,10);
  assert.equal(report.streaks[0].spanSeconds,180);
  assert.equal(report.streaks[0].gate.rankPointDelta,0);
  assert.deepEqual(report.streaks[0].actionSkillDeltas,[{skill:'brawling',from:0,to:0,delta:0}]);
  assert.match(report.streaks[0].interpretation,/do not prove/);
});

test('does not flag short windows, changing choices, changing rooms, or gate progress',()=>{
  assert.equal(auditJevDecisionLoops(Array.from({length:9},(_,i)=>decision(i))).streaks.length,0);
  assert.equal(auditJevDecisionLoops(Array.from({length:10},(_,i)=>decision(i,{id:i===9?'forage':'practice_brawling'}))).streaks.length,0);
  assert.equal(auditJevDecisionLoops(Array.from({length:10},(_,i)=>decision(i,{room:i===9?'town':'fields'}))).streaks.length,0);
  const moved=auditJevDecisionLoops(Array.from({length:10},(_,i)=>decision(i,{points:i===9?5:4})));
  assert.equal(moved.streaks.length,1);
  assert.equal(moved.streaks[0].gateProgressObserved,true);
  assert.equal(moved.flatGateStreaks.length,0);
});

test('reports model choices and supervisor overrides separately from execution',()=>{
  const report=auditJevDecisionLoops(Array.from({length:10},(_,i)=>decision(i,{id:'appraise_dagger',
    providerChoice:'practice_brawling',supervisorOverride:'practice-least-developed-open-survival-or-lore-lane'})));
  assert.equal(report.streaks[0].actionId,'appraise_dagger');
  assert.deepEqual(report.streaks[0].actionSkillDeltas,[{skill:'appraisal',from:0,to:0,delta:0}]);
  assert.deepEqual(report.streaks[0].providerChoices,{practice_brawling:10});
  assert.deepEqual(report.streaks[0].supervisorOverrides,{
    'practice-least-developed-open-survival-or-lore-lane':10,
  });
});

test('detects alternating wrapper actions that repeatedly replace the same Jev choice',()=>{
  const reason='practice-least-developed-open-survival-or-lore-lane';
  const events=Array.from({length:10},(_,i)=>decision(i,{
    id:i%2?'forage':'practice_stealth',providerChoice:'practice_brawling',
    supervisorOverride:reason,
  }));
  const report=auditJevDecisionLoops(events);
  assert.equal(report.streaks.length,0,
    'selected-action streak analysis should not pretend alternating actions are one action');
  assert.equal(report.overrideStreaks.length,1);
  assert.equal(report.flatGateOverrideStreaks.length,1);
  assert.equal(report.overrideStreaks[0].providerChoice,'practice_brawling');
  assert.equal(report.overrideStreaks[0].overrideReason,reason);
  assert.equal(report.overrideStreaks[0].decisions,10);
  assert.deepEqual(report.overrideStreaks[0].executedActions,{practice_stealth:5,forage:5});
  assert.equal(report.overrideStreaks[0].gate.rankPointDelta,0);
});

test('ignores observations with no authoritative gate rows',()=>{
  const events=Array.from({length:10},(_,i)=>decision(i));
  for (const event of events) delete event.state.requirements;
  const report=auditJevDecisionLoops(events);
  assert.equal(report.streaks.length,0);
  assert.equal(report.offeredChoiceCoverage.decisionsWithRequirements,0);
  assert.deepEqual(report.offeredChoiceCoverage.rows,[]);
});

test('reports direct offered-action coverage for open rows without treating absence as failure',()=>{
  const event=decision(0);
  event.state.requirements.rows=[
    {label:'1st weapon',have:0,need:8,eligible:['brawling','blunt']},
    {label:'1st lore',have:0,need:6,eligible:['performance','scholarship']},
    {label:'appraisal',have:6,need:6,eligible:['appraisal']},
  ];
  event.options=[{id:'practice_brawling'},{id:'study_lore'},{id:'look'}];
  event.id='study_lore';
  event.command='study_lore';
  const coverage=auditJevDecisionLoops([event]).offeredChoiceCoverage;
  assert.equal(coverage.decisionsWithRequirements,1);
  assert.deepEqual(coverage.rows.map(row=>row.label),['1st lore','1st weapon']);
  assert.equal(coverage.rows.find(row=>row.label==='1st weapon').withMappedChoice,1);
  assert.equal(coverage.rows.find(row=>row.label==='1st lore').withMappedChoice,1);
  assert.deepEqual(coverage.rows.find(row=>row.label==='1st lore').offeredActions,{study_lore:1});
  assert.equal(coverage.rows.find(row=>row.label==='1st lore').selectedEligibleChoice,1);
  assert.equal(coverage.rows.find(row=>row.label==='1st lore').providerEligibleChoice,0);
  assert.equal(coverage.rows.find(row=>row.label==='1st lore').providerSelectionRateAmongEligibleMenus,0);
  assert.equal(coverage.rows.find(row=>row.label==='1st lore').finalSelectionRateAmongEligibleMenus,1);
  assert.equal(coverage.rows.find(row=>row.label==='1st weapon').selectedEligibleChoice,0);
  assert.match(coverage.interpretation,/not an EXP, command-success, or causal model/);
});

test('separates opportunity from selection across snapshots',()=>{
  const events=Array.from({length:4},(_,index)=>{
    const event=decision(index,{id:index===0?'study_lore':'practice_brawling'});
    event.state.requirements.rows=[
      {label:'1st lore',have:0,need:6,eligible:['performance','scholarship','appraisal']},
    ];
    event.options=[{id:'study_lore'},{id:'practice_brawling'}];
    event.providerChoice=index===0?'study_lore':'practice_brawling';
    return event;
  });
  const row=auditJevDecisionLoops(events).offeredChoiceCoverage.rows[0];
  assert.equal(row.observations,4);
  assert.equal(row.withMappedChoice,4);
  assert.equal(row.providerEligibleChoice,1);
  assert.equal(row.selectedEligibleChoice,1);
  assert.equal(row.providerSelectionRateAmongEligibleMenus,0.25);
  assert.equal(row.finalSelectionRateAmongEligibleMenus,0.25);
  assert.equal(row.selectionRateAmongEligibleMenus,0.25);
  assert.deepEqual(row.providerActions,{study_lore:1});
  assert.deepEqual(row.selectedActions,{study_lore:1});
});

test('Nth-skill funnel excludes eligible actions that cannot move that row with one rank',()=>{
  const event=decision(0,{id:'attack_0'});
  event.state.inCombat=true;
  event.state.wieldedWeaponSkill='small_edged';
  event.state.skillSnapshotComplete=true;
  event.state.skills={small_edged:5,brawling:4,blunt:0,large_blunt:0};
  event.state.requirements.rows=[
    {label:'3rd weapon',have:0,need:4,eligible:['small_edged','brawling','blunt','large_blunt']},
    {label:'4th weapon',have:0,need:2,eligible:['small_edged','brawling','blunt','large_blunt']},
  ];
  event.options=[{id:'attack_0'},{id:'train_blunt'}];
  event.providerChoice='attack_0';
  const rows=auditJevDecisionLoops([event]).offeredChoiceCoverage.rows;
  const third=rows.find(row=>row.label==='3rd weapon');
  const fourth=rows.find(row=>row.label==='4th weapon');
  assert.deepEqual(third.offeredActions,{attack_0:1,train_blunt:1});
  assert.deepEqual(third.oneRankAdvancingActions,{train_blunt:1});
  assert.equal(third.providerOneRankAdvancingChoice,0);
  assert.equal(fourth.withMappedChoice,1);
  assert.equal(fourth.withOneRankAdvancingChoice,0);
  assert.equal(fourth.finalSelectionRateAmongOneRankAdvancingMenus,null);
});

test('fourth-lane practice becomes rank-effective after three distinct lanes exist',()=>{
  const event=decision(0,{id:'train_large_blunt'});
  event.state.skillSnapshotComplete=true;
  event.state.skills={small_edged:5,brawling:4,blunt:1,large_blunt:0};
  event.state.requirements.rows=[
    {label:'4th weapon',have:0,need:2,eligible:['small_edged','brawling','blunt','large_blunt']},
  ];
  event.options=[{id:'train_large_blunt'}];
  event.providerChoice='train_large_blunt';
  const row=auditJevDecisionLoops([event]).offeredChoiceCoverage.rows[0];
  assert.deepEqual(row.oneRankAdvancingActions,{train_large_blunt:1});
  assert.equal(row.providerOneRankAdvancingChoice,1);
  assert.equal(row.providerSelectionRateAmongOneRankAdvancingMenus,1);
});

test('does not infer Nth-lane rank effectiveness from the live top-10 skill feed',()=>{
  const event=decision(0,{id:'train_blunt'});
  event.state.skills={small_edged:5,brawling:4,blunt:0};
  event.state.requirements.rows=[
    {label:'3rd weapon',have:0,need:4,eligible:['small_edged','brawling','blunt','large_blunt']},
  ];
  event.options=[{id:'train_blunt'}];
  const row=auditJevDecisionLoops([event]).offeredChoiceCoverage.rows[0];
  assert.equal(row.rankSensitivityKnownObservations,0);
  assert.equal(row.rankSensitivityUnknownObservations,1);
  assert.equal(row.withOneRankAdvancingChoice,0);
  assert.equal(row.providerSelectionRateAmongOneRankAdvancingMenus,null);
});

test('uses a recent complete skill-census event for Nth-row rank sensitivity',()=>{
  const skills=Object.fromEntries(Object.keys(SKILLS).map(id=>[id,id==='small_edged'?1:0]));
  const event=decision(100,{id:'train_blunt'});
  event.ts='2026-09-21T00:01:40.000Z';
  event.state.skillSnapshotComplete=false;
  event.state.requirements.rows=[{label:'2nd weapon',have:0,need:4,
    eligible:['small_edged','brawling','blunt']}];
  event.options=[{id:'train_blunt'}];
  event.providerChoice='train_blunt';
  const census={type:'skill-census',ts:'2026-09-21T00:00:00.000Z',complete:true,
    skills,totalRanks:1};
  const row=auditJevDecisionLoops([census,event]).offeredChoiceCoverage.rows[0];
  assert.equal(row.rankSensitivityKnownObservations,1);
  assert.equal(row.rankSensitivityUnknownObservations,0);
  assert.deepEqual(row.oneRankAdvancingActions,{train_blunt:1});
  assert.equal(row.providerOneRankAdvancingChoice,1);
});

test('partial or stale census events do not turn omitted ranks into zero',()=>{
  const event=decision(181,{id:'train_blunt'});
  event.ts='2026-09-21T00:03:01.000Z';
  event.state.skills={small_edged:1,blunt:0};
  event.state.skillSnapshotComplete=false;
  event.state.requirements.rows=[{label:'2nd weapon',have:0,need:4,
    eligible:['small_edged','brawling','blunt']}];
  event.options=[{id:'train_blunt'}];
  const partial={type:'skill-census',ts:'2026-09-21T00:00:00.000Z',complete:false,
    skills:{small_edged:1},totalRanks:null};
  const row=auditJevDecisionLoops([partial,event]).offeredChoiceCoverage.rows[0];
  assert.equal(row.rankSensitivityKnownObservations,0);
  assert.equal(row.rankSensitivityUnknownObservations,1);
  assert.equal(row.withOneRankAdvancingChoice,0);
});

test('counts purchasable gear as opening a mapped lane, while preserving unknown when no exact mapping exists',()=>{
  const event=decision(0);
  event.state.requirements.rows=[
    {label:'1st armor',have:0,need:4,eligible:['light_armor']},
    {label:'1st survival',have:0,need:6,eligible:['athletics']},
  ];
  event.options=[{id:'buy_leather_boots'}];
  const rows=auditJevDecisionLoops([event]).offeredChoiceCoverage.rows;
  assert.equal(rows.find(row=>row.label==='1st armor').withMappedChoice,1);
  assert.equal(rows.find(row=>row.label==='1st survival').withoutMappedChoice,1);
});

test('summarizes distinct trained lanes instead of treating Nth rows as independent progress',()=>{
  const event=decision(0);
  event.state.skills={small_edged:12,light_armor:5,foraging:3,performance:2};
  event.state.requirements.rows=[
    {label:'1st weapon',have:8,need:8,eligible:['small_edged','brawling','blunt']},
    {label:'2nd weapon',have:0,need:8,eligible:['small_edged','brawling','blunt']},
    {label:'3rd weapon',have:0,need:4,eligible:['small_edged','brawling','blunt']},
    {label:'4th weapon',have:0,need:2,eligible:['small_edged','brawling','blunt']},
    {label:'1st armor',have:0,need:6,eligible:['light_armor','shield_usage']},
    {label:'2nd armor',have:0,need:2,eligible:['light_armor','shield_usage']},
    {label:'1st survival',have:0,need:4,eligible:['foraging','stealth']},
    {label:'2nd lore',have:0,need:2,eligible:['performance','appraisal']},
  ];
  const lanes=auditJevDecisionLoops([event]).distinctLaneCoverage;
  assert.deepEqual(lanes.weapon,{requiredDistinctLanes:4,rankedDistinctLanes:1,
    remainingDistinctLanes:3,maxPossibleRankedDistinctLanes:3,rankSnapshotComplete:false,
    rankedSkills:['small_edged'],remainingSkills:[],unknownSkills:['blunt','brawling']});
  assert.equal(lanes.armor.rankedDistinctLanes,1);
  assert.equal(lanes.armor.remainingDistinctLanes,1);
  assert.equal(lanes.armor.rankSnapshotComplete,false);
  assert.deepEqual(lanes.armor.remainingSkills,[]);
  assert.deepEqual(lanes.armor.unknownSkills,['shield_usage']);
  assert.equal(lanes.survival.rankedDistinctLanes,1);
  assert.equal(lanes.lore.remainingDistinctLanes,1);
  assert.deepEqual(lanes.lore.remainingSkills,[]);
  assert.deepEqual(lanes.lore.unknownSkills,['appraisal']);
});

test('distinct-lane report labels observed zero ranks separately from missing skills',()=>{
  const event=decision(0);
  event.state.skills={small_edged:8,brawling:0};
  event.state.requirements.rows=[{label:'2nd weapon',have:0,need:4,
    eligible:['small_edged','brawling','blunt']}];
  const lane=auditJevDecisionLoops([event]).distinctLaneCoverage.weapon;
  assert.equal(lane.rankSnapshotComplete,false);
  assert.deepEqual(lane.rankedSkills,['small_edged']);
  assert.deepEqual(lane.remainingSkills,['brawling']);
  assert.deepEqual(lane.unknownSkills,['blunt']);
  assert.equal(lane.remainingDistinctLanes,1);
  assert.equal(lane.maxPossibleRankedDistinctLanes,2);
});

test('distinct-lane snapshot remains unknown when no requirements are recorded',()=>{
  const event=decision(0);
  delete event.state.requirements;
  assert.equal(auditJevDecisionLoops([event]).distinctLaneCoverage,null);
});

test('maps only known learned abilities that directly advance an open supernatural lane',()=>{
  const event=decision(0);
  event.state.requirements.rows=[
    {label:'1st supernatural',have:0,need:2,eligible:['augmentation','warding_magic']},
  ];
  event.options=[{id:'ability_dragon'},{id:'ability_tenacity'}];
  const rows=auditJevDecisionLoops([event]).offeredChoiceCoverage.rows;
  assert.equal(rows[0].withMappedChoice,1);
  assert.deepEqual(rows[0].offeredActions,{ability_dragon:1,ability_tenacity:1});
  event.state.requirements.rows[0].have=2;
  assert.deepEqual(auditJevDecisionLoops([event]).offeredChoiceCoverage.rows,[]);
});

test('counts known passive combat routes only when combat and equipped gear are observed',()=>{
  const event=decision(0,{id:'wait'});
  event.state.inCombat=true;
  event.state.wieldedWeaponSkill='brawling';
  event.state.equipment={body:[{id:'padded_cloth'}]};
  event.state.requirements.rows=[
    {label:'evasion',have:0,need:8,eligible:['evasion']},
    {label:'parry',have:0,need:8,eligible:['parry']},
    {label:'melee_mastery',have:0,need:8,eligible:['melee_mastery']},
    {label:'1st armor',have:0,need:4,eligible:['light_armor','shield_usage']},
  ];
  event.options=[{id:'wait'},{id:'flee'}];
  let rows=auditJevDecisionLoops([event]).offeredChoiceCoverage.rows;
  assert.deepEqual(rows.map(row=>row.withMappedChoice),[1,1,1,1]);
  assert.deepEqual(rows.find(row=>row.label==='1st armor').offeredActions,{wait:1});

  event.state.equipment={};
  rows=auditJevDecisionLoops([event]).offeredChoiceCoverage.rows;
  assert.equal(rows.find(row=>row.label==='1st armor').withoutMappedChoice,1,
    'do not claim armor practice without observed worn armor');
  event.state.wieldedWeaponSkill='bow';
  rows=auditJevDecisionLoops([event]).offeredChoiceCoverage.rows;
  assert.equal(rows.find(row=>row.label==='melee_mastery').withoutMappedChoice,1,
    'ranged combat does not map to the melee mastery gate');
});

test('a visible-prey attack maps passive gates from armor names in ordinary equipment snapshots',()=>{
  const event=decision(0,{id:'attack_0'});
  event.state.inCombat=false;
  event.state.wieldedWeaponSkill='small_edged';
  event.state.equipment={torso:[{name:'padded cloth armor'}],shield:[{name:'a round wooden shield'}]};
  event.state.requirements.rows=[
    {label:'1st armor',have:0,need:6,eligible:['light_armor','shield_usage']},
    {label:'parry',have:0,need:8,eligible:['parry']},
  ];
  event.options=[{id:'attack_0'}];
  const rows=auditJevDecisionLoops([event]).offeredChoiceCoverage.rows;
  assert.deepEqual(rows.map(row=>row.withMappedChoice),[1,1]);
  assert.deepEqual(rows[0].offeredActions,{attack_0:1});
});

test('audits safe-idle field-practice offers separately from selections and unsafe turns',()=>{
  const make=(id,{inCombat=false,hp=100,bleeding=0,options=['forage'],override=null}={})=>{
    const event=decision(0,{id,supervisorOverride:override});
    event.state.hp=hp; event.state.maxHp=100; event.state.inCombat=inCombat;
    event.state.bleeding=bleeding;
    event.options=options.map(option=>({id:option}));
    return event;
  };
  const report=auditJevDecisionLoops([
    make('attack_0',{options:['forage','perform']}),
    make('forage'),
    make('attack_0',{options:['forage'],override:'visible-prey'}),
    make('forage',{inCombat:true}),
    make('forage',{hp:70}),
    make('forage',{bleeding:1}),
  ]).safeIdleFieldPractice;
  assert.equal(report.safeOutOfCombatDecisions,3);
  assert.equal(report.safeDecisionsOfferingFieldPractice,3);
  assert.equal(report.selectedFieldPractice,1);
  assert.deepEqual(report.selectedFieldPracticeByAction,{forage:1});
  assert.deepEqual(report.selectedAlternativeByAction,{attack_0:{count:2,
    supervisorOverrides:{none:1,'visible-prey':1}}});
  assert.equal(report.selectionRateAmongMenus,1/3);
  assert.match(report.interpretation,/do not prove command completion/);
});

test('isolates safe menus with choices mapped to actually open Survival or Lore lanes',()=>{
  const first=decision(0,{id:'attack_0'});
  first.state={...first.state,hp:100,maxHp:100,inCombat:false,bleeding:[],quest:null,
    requirements:{rows:[{label:'1st survival',have:0,need:4,eligible:['foraging','stealth']}]}};
  first.options=[{id:'forage'},{id:'practice_stealth'},{id:'attack_0'}];
  const second={...first,ts:new Date(20_000).toISOString(),id:'forage'};
  const third={...first,ts:new Date(40_000).toISOString(),id:'look',
    options:[{id:'look'}]};
  const report=auditJevDecisionLoops([first,second,third]).safeIdleFieldPractice;
  assert.equal(report.safeDecisionsOfferingFieldPractice,2);
  assert.equal(report.safeDecisionsWithOpenLanePractice,2);
  assert.equal(report.selectedOpenLanePractice,1);
  assert.deepEqual(report.openLanePracticeOpportunitiesBySkill,{foraging:2,stealth:2});
  assert.deepEqual(report.openLanePracticeOpportunitiesByAction,{forage:2,practice_stealth:2});
});
