import test from 'node:test';
import assert from 'node:assert/strict';
import { replaySupervisorDecision, summarizeSupervisorReplay } from '../scripts/lib/jev-supervisor-replay.mjs';
import { inspectDistinctWeaponTraining } from '../scripts/lib/jev-distinct-weapon-training.mjs';
import { SKILLS } from '../data/skills.js';

const options=[
  {id:'attack_0',kind:'command',description:'Start a safe fight with a marsh hog.'},
  {id:'quest_hunt_fields',kind:'navigate',targetRoom:'fields_kobolds',
    description:'This area also spawns kobolds, the target of the active kill quest (Slay 4 more kobolds).'},
];
const event={type:'local-decision',provider:'local',ts:'2026-09-21T12:00:00.000Z',
  choice:'attack_0',providerChoice:'attack_0',options,state:{character:{guild:'barbarian'},circle:1,hp:145,maxHp:145,
    inCombat:false,quest:{kind:'kill',done:false,desc:'Slay 4 more kobolds.'},
    requirements:{rows:[{label:'expertise',have:0,need:8,eligible:['expertise']}]}}};

test('offline supervisor replay reports the legal action selected by current quest routing',()=>{
  const result=replaySupervisorDecision(event);
  assert.equal(result.status,'replayed');
  assert.equal(result.recordedChoice,'attack_0');
  assert.equal(result.supervisedChoice,'quest_hunt_fields');
  assert.equal(result.uncoachedSupervisorChoice,'quest_hunt_fields');
  assert.equal(result.changed,true);
  assert.equal(result.overrideReason,'route-to-known-active-quest-spawn');
  assert.deepEqual(result.offeredActionIds,['attack_0','quest_hunt_fields']);
});

test('offline replay skips emergency fallbacks and choices absent from the saved menu',()=>{
  assert.equal(replaySupervisorDecision({...event,choice:'emergency_flee',
    providerChoice:'emergency_flee'}).status,'not-provider-choice');
  assert.equal(replaySupervisorDecision({...event,providerChoice:'invented_action'}).status,'choice-not-in-recorded-menu');
  assert.equal(replaySupervisorDecision({...event,providerChoice:undefined}).status,'missing-provider-choice');
});

test('offline replay uses the provider choice, not the already-supervised execution choice',()=>{
  const supervised={...event,providerChoice:'attack_0',choice:'quest_hunt_fields',
    supervisorOverride:'route-to-known-active-quest-spawn'};
  const result=replaySupervisorDecision(supervised);
  assert.equal(result.recordedChoice,'attack_0');
  assert.equal(result.supervisedChoice,'quest_hunt_fields');
  assert.equal(result.changed,true);
});

test('summary counts changed, unchanged, skipped decisions and override reasons',()=>{
  const duplicateMenu={...event,options:[...event.options,{...event.options[0]}]};
  const summary=summarizeSupervisorReplay([duplicateMenu,{...event,choice:'quest_hunt_fields',providerChoice:'quest_hunt_fields'},
    {...event,choice:'emergency_flee',providerChoice:'emergency_flee'},
    {...event,providerChoice:undefined}]);
  assert.deepEqual({decisions:summary.decisions,replayed:summary.replayed,
    changed:summary.changed,unchanged:summary.unchanged,skipped:summary.skipped,
    uncoachedChanges:summary.uncoachedChanges,missingProviderChoice:summary.missingProviderChoice},
  {decisions:4,replayed:2,changed:1,unchanged:1,skipped:2,
    uncoachedChanges:1,missingProviderChoice:1});
  assert.equal(summary.byReason['route-to-known-active-quest-spawn'],2);
  assert.equal(summary.menusWithDuplicateActionIds,1);
  assert.equal(summary.duplicateActionIdOccurrences,1);
});

test('lane-coach replay preserves Jev Brawling choice against the field-practice override',()=>{
  const brawlingMenu=[{id:'practice_brawling',kind:'command',description:'Remove dagger to train Brawling.'},
    {id:'practice_stealth',kind:'command',description:'Practice Stealth.'},
    {id:'forage',kind:'command',description:'Practice Foraging.'}];
  const brawling={...event,providerChoice:'practice_brawling',options:brawlingMenu,
    state:{...event.state,wieldedWeaponSkill:'brawling',skills:{brawling:0,stealth:0,foraging:0},
      requirements:{rows:[
        {label:'1st weapon',have:0,need:8,eligible:['brawling']},
        {label:'1st survival',have:0,need:4,eligible:['stealth','foraging']},
      ]}}};
  const baseline=replaySupervisorDecision(brawling);
  const coached=replaySupervisorDecision(brawling,{laneCoach:true});
  assert.equal(baseline.supervisedChoice,'practice_stealth');
  assert.equal(baseline.changed,true);
  assert.equal(coached.supervisedChoice,'practice_brawling');
  assert.equal(coached.uncoachedSupervisorChoice,'practice_stealth');
  assert.equal(coached.uncoachedOverrideReason,'practice-least-developed-open-survival-or-lore-lane');
  assert.equal(coached.changed,false);
  assert.equal(coached.laneCoachPreserved,true);
  const summary=summarizeSupervisorReplay([brawling],{laneCoach:true});
  assert.equal(summary.laneCoachPreserved,1);
  assert.equal(summary.uncoachedChanges,1);
});

test('offline replay honors the repeated-override release using saved action history',()=>{
  const brawlingMenu=[{id:'practice_brawling',kind:'command'},
    {id:'practice_stealth',kind:'command'},{id:'forage',kind:'command'}];
  const override='practice-least-developed-open-survival-or-lore-lane';
  const repeated={...event,providerChoice:'practice_brawling',options:brawlingMenu,
    state:{...event.state,room:'fields_furrow',inCombat:false,hp:145,maxHp:145,
      skills:{brawling:0,stealth:0,foraging:0},
      requirements:{rows:[{label:'1st weapon',have:0,need:8,eligible:['brawling']},
        {label:'1st survival',have:0,need:4,eligible:['stealth','foraging']}]},
      trainingProgress:{secondsSinceGateProgress:0},
      recentActions:Array.from({length:4},()=>({room:'fields_furrow',id:'practice_stealth',
        providerChoice:'practice_brawling',overrideReason:override}))}};
  const result=replaySupervisorDecision(repeated);
  assert.equal(result.supervisedChoice,'practice_brawling');
  assert.equal(result.changed,false);
  assert.equal(result.overrideReason,null);
});

test('supervisor replay evolves counterfactual action history sequentially',()=>{
  const brawlingMenu=[{id:'practice_brawling',kind:'command'},
    {id:'practice_stealth',kind:'command'},{id:'forage',kind:'command'}];
  const repeated={...event,providerChoice:'practice_brawling',options:brawlingMenu,
    state:{...event.state,room:'fields_furrow',inCombat:false,hp:145,maxHp:145,
      skills:{brawling:0,stealth:0,foraging:0},
      requirements:{rows:[{label:'1st weapon',have:0,need:8,eligible:['brawling']},
        {label:'1st survival',have:0,need:4,eligible:['stealth','foraging']}]},
      trainingProgress:{secondsSinceGateProgress:0},recentActions:[]}};
  const summary=summarizeSupervisorReplay(Array.from({length:10},(_,index)=>
    ({...repeated,ts:`2026-09-21T12:00:${String(index).padStart(2,'0')}.000Z`})));
  assert.deepEqual(summary.records.map(record=>record.changed),
    [true,true,true,true,false,true,true,true,true,false]);
  assert.equal(summary.changed,8);
  assert.equal(summary.byReason['practice-least-developed-open-survival-or-lore-lane'],8);
});

test('replay measures opt-in autonomy release without changing default supervisor behavior',()=>{
  const combatMenu=[{id:'flee',kind:'command',command:'flee'},
    {id:'analyze_flame',kind:'command',command:'analyze flame'}];
  const repeatedFlee={...event,providerChoice:'flee',options:combatMenu,
    state:{...event.state,room:'fields_furrow',inCombat:true,hp:145,maxHp:145,
      requirements:{rows:[{label:'expertise',have:0,need:8,eligible:['expertise']}]},
      recentActions:[]}};
  const menus=Array.from({length:6},(_,index)=>({...repeatedFlee,
    ts:`2026-09-21T12:02:${String(index).padStart(2,'0')}.000Z`}));
  const baseline=summarizeSupervisorReplay(menus);
  const candidate=summarizeSupervisorReplay(menus,{repeatedOverrideReleaseAfter:4});
  assert.deepEqual(baseline.records.map(record=>record.supervisedChoice),
    Array(6).fill('analyze_flame'));
  assert.deepEqual(candidate.records.map(record=>record.supervisedChoice),
    ['analyze_flame','analyze_flame','analyze_flame','analyze_flame','flee','analyze_flame']);
  assert.equal(candidate.repeatedOverridePassThroughs,1);
  assert.equal(candidate.records[4].supervisorReleaseReason,
    'repeated-provider-choice-after-supervisor-overrides');
});

test('coached and uncoached comparisons evolve independent override histories',()=>{
  const brawlingMenu=[{id:'practice_brawling',kind:'command'},
    {id:'practice_stealth',kind:'command'},{id:'forage',kind:'command'}];
  const repeated={...event,providerChoice:'practice_brawling',options:brawlingMenu,
    state:{...event.state,room:'fields_furrow',inCombat:false,hp:145,maxHp:145,
      skills:{brawling:0,stealth:0,foraging:0},
      requirements:{rows:[{label:'1st weapon',have:0,need:8,eligible:['brawling']},
        {label:'1st survival',have:0,need:4,eligible:['stealth','foraging']}]},
      trainingProgress:{secondsSinceGateProgress:0},recentActions:[]}};
  const summary=summarizeSupervisorReplay(Array.from({length:10},(_,index)=>
    ({...repeated,ts:`2026-09-21T12:01:${String(index).padStart(2,'0')}.000Z`})),
  {laneCoach:true});
  assert.equal(summary.uncoachedChanges,8,
    'the control yields one choice after each four-override streak, then resumes its own streak');
  assert.equal(summary.laneCoachPreserved,10,
    'the coached arm preserves Jev independently and must not reset the control history');
  assert.equal(summary.changed,0);
});

test('stalled field-practice counterfactual releases only safe optional hunting',()=>{
  const options=[{id:'attack_0',kind:'command'},{id:'forage',kind:'command'},
    {id:'practice_stealth',kind:'command'}];
  const stalled={...event,providerChoice:'attack_0',options,state:{...event.state,
    room:'fields_furrow',inCombat:false,hp:145,maxHp:145,quest:null,
    skills:{foraging:0,stealth:0},trainingProgress:{secondsSinceGateProgress:240},
    requirements:{rows:[{label:'expertise',have:0,need:8,eligible:['expertise']},
      {label:'1st survival',have:0,need:4,
      eligible:['foraging','stealth']}]}}};
  const base=replaySupervisorDecision(stalled);
  const release=replaySupervisorDecision(stalled,{stalledFieldPracticeReleaseAfter:180});
  assert.equal(base.supervisedChoice,'attack_0');
  assert.equal(base.fieldReleaseChoice,null);
  assert.equal(release.supervisedChoice,'attack_0',
    'counterfactual must not alter the baseline supervisor replay');
  assert.equal(release.fieldReleaseChoice,'forage');
  assert.equal(release.fieldReleaseSkill,'foraging');
  const summary=summarizeSupervisorReplay([stalled],{stalledFieldPracticeReleaseAfter:180});
  assert.equal(summary.stalledFieldPracticeReleases,1);
  assert.deepEqual(summary.stalledFieldPracticeByAction,{forage:1});
  assert.deepEqual(summary.stalledFieldPracticeBySkill,{foraging:1});
  assert.deepEqual(summary.stalledFieldPracticeBaselines,{attack_0:1});
  assert.equal(summary.stalledFieldPracticeDisplacedHuntDecisions,1);
  assert.equal(summary.stalledFieldPracticeDisplacedTravelDecisions,0);
});

test('stalled field-practice release leaves unsafe, quest, and non-hunt priorities alone',()=>{
  const options=[{id:'attack_0',kind:'command'},{id:'forage',kind:'command'}];
  const base={...event,providerChoice:'attack_0',options,state:{...event.state,
    inCombat:false,hp:145,maxHp:145,quest:null,trainingProgress:{secondsSinceGateProgress:240},
    requirements:{rows:[{label:'expertise',have:0,need:8,eligible:['expertise']},
      {label:'1st survival',have:0,need:4,eligible:['foraging']}]}}};
  for (const state of [{...base.state,hp:70},{...base.state,inCombat:true},
    {...base.state,quest:{kind:'kill',done:false} }]) {
    const result=replaySupervisorDecision({...base,state},{stalledFieldPracticeReleaseAfter:180});
    assert.equal(result.fieldReleaseChoice,null);
  }
  const corpseMenu=[{id:'skin_marsh_hog',kind:'command'},...options.slice(1)];
  const corpse=replaySupervisorDecision({...base,providerChoice:'skin_marsh_hog',options:corpseMenu},
    {stalledFieldPracticeReleaseAfter:180});
  assert.equal(corpse.fieldReleaseChoice,null);
});

test('stalled field-practice replay rotates equal-rank Survival/Lore lanes and includes Appraisal',()=>{
  const options=[{id:'attack_0',kind:'command'},
    {id:'practice_stealth',kind:'command'},{id:'forage',kind:'command'},
    {id:'perform',kind:'command'},{id:'appraise_dagger',kind:'command'}];
  const stalled={...event,providerChoice:'attack_0',options,
    state:{...event.state,room:'fields_furrow',inCombat:false,hp:145,maxHp:145,quest:null,
      skills:{stealth:0,foraging:0,performance:0,appraisal:0},
      trainingProgress:{secondsSinceGateProgress:240},recentActions:[],
      requirements:{rows:[{label:'1st survival',have:0,need:4,
        eligible:['stealth','foraging']},{label:'1st lore',have:0,need:2,
        eligible:['performance','appraisal']}]}}};
  const summary=summarizeSupervisorReplay(Array.from({length:4},(_,i)=>({...stalled,
    ts:`2026-09-21T12:03:0${i}.000Z`})),{stalledFieldPracticeReleaseAfter:180});
  assert.deepEqual(summary.records.map(record=>record.fieldReleaseChoice),
    ['practice_stealth','forage','perform','appraise_dagger']);
  assert.deepEqual(summary.stalledFieldPracticeBySkill,
    {stealth:1,foraging:1,performance:1,appraisal:1});
});

test('stalled field practice preserves travel needed to reach combat gates',()=>{
  const travel={id:'travel_fields_furrow',kind:'navigate',pathLength:16,
    description:'Travel 16 rooms to the fields.'};
  const perform={id:'perform',kind:'command',description:'Practice Performance here.'};
  const stalled={...event,providerChoice:travel.id,options:[travel,perform],state:{
    ...event.state,character:{guild:'barbarian'},room:'town_square',inCombat:false,
    hp:145,maxHp:145,quest:null,skills:{performance:0},recentActions:[],
    trainingProgress:{secondsSinceGateProgress:240},requirements:{rows:[
      {label:'expertise',have:0,need:8,eligible:['expertise']},
      {label:'1st lore',have:0,need:2,eligible:['performance']},
    ]}}};
  const summary=summarizeSupervisorReplay([stalled],{stalledFieldPracticeReleaseAfter:180});
  assert.equal(summary.records[0].supervisedChoice,travel.id);
  assert.equal(summary.records[0].fieldReleaseChoice,null);
  assert.equal(summary.records[0].supervisedActionPathLength,16);
  assert.equal(summary.stalledFieldPracticeDisplacedTravelDecisions,0);
  assert.equal(summary.stalledFieldPracticeDisplacedTravelSteps,0);
});

test('training-funds quest counterfactual takes a legal crier offer before optional hunting',()=>{
  const options=[{id:'take_quest',kind:'command',command:'quest'},
    {id:'attack_0',kind:'command',command:'attack marsh hog'}];
  const poor={...event,providerChoice:'attack_0',options,state:{...event.state,
    room:'market_way',inCombat:false,hp:145,maxHp:145,silver:15,quest:null,
    requirements:{rows:[{label:'expertise',have:0,need:8,eligible:['expertise']}]}}};
  const baseline=replaySupervisorDecision(poor);
  const candidate=replaySupervisorDecision(poor,{trainingFundsQuestMinimumSilver:40});
  assert.equal(baseline.supervisedChoice,'attack_0');
  assert.equal(candidate.supervisedChoice,'attack_0',
    'the baseline selection must remain unchanged in counterfactual replay');
  assert.equal(candidate.trainingFundsQuestChoice,'take_quest');
  const summary=summarizeSupervisorReplay([poor],{trainingFundsQuestMinimumSilver:40});
  assert.equal(summary.trainingFundsQuestOpportunities,1);
  assert.deepEqual(summary.trainingFundsQuestBaselines,{attack_0:1});
});

test('training-funds quest counterfactual preserves safety, active quests and adequate funds',()=>{
  const options=[{id:'take_quest',kind:'command'},{id:'attack_0',kind:'command'}];
  const poor={...event,providerChoice:'attack_0',options,state:{...event.state,
    inCombat:false,hp:145,maxHp:145,silver:15,quest:null,
    requirements:{rows:[{label:'expertise',have:0,need:8,eligible:['expertise']}]}}};
  const candidates=[{...poor,state:{...poor.state,hp:70}},
    {...poor,state:{...poor.state,inCombat:true}},
    {...poor,state:{...poor.state,quest:{kind:'kill',done:false}}},
    {...poor,state:{...poor.state,silver:40}},
    {...poor,options:[{id:'attack_0',kind:'command'}]}];
  for(const candidate of candidates)
    assert.equal(replaySupervisorDecision(candidate,{trainingFundsQuestMinimumSilver:40})
      .trainingFundsQuestChoice,null);
});

test('distinct-weapon training counterfactual takes a legal new-lane lesson at a safe trainer',()=>{
  const weaponSkills=['small_edged','medium_edged','large_edged','twohanded_edged',
    'blunt','large_blunt','twohanded_blunt','staff','polearm','thrown','brawling'];
  const trainingOptions=[{id:'learn_ability_dragon',kind:'command'},
    {id:'train_expertise',kind:'command'},
    {id:'train_large_edged',kind:'command',description:'Trainer lesson budget 40 silvers'},
    {id:'train_blunt',kind:'command',description:'Trainer lesson budget 40 silvers'}];
  const hall={...event,providerChoice:'train_expertise',options:trainingOptions,
    state:{...event.state,room:'hall_barbarian',hp:100,maxHp:100,inCombat:false,quest:null,silver:55,
      character:{guild:'barbarian'},skills:Object.fromEntries(weaponSkills.map(skill=>[skill,0])),
      requirements:{rows:[1,2,3,4].map(n=>({
        label:`${n}${n===1?'st':n===2?'nd':n===3?'rd':'th'} weapon`,
        have:0,need:n===4?2:8,eligible:weaponSkills,
      }))}}};
  const result=replaySupervisorDecision(hall,{distinctWeaponTraining:true});
  assert.equal(result.distinctWeaponTrainingChoice,'train_large_edged');
  assert.equal(result.distinctWeaponTrainingReadiness,'ready');
  const summary=summarizeSupervisorReplay([hall,{...hall,ts:'2026-09-21T12:01:00.000Z'}],
    {distinctWeaponTraining:true});
  assert.equal(summary.distinctWeaponTrainingOpportunities,1,
    'one trainer visit must not spend the same hypothetical opening twice');
  assert.equal(summary.records[1].distinctWeaponTrainingChoice,null);
  assert.equal(summary.records[1].distinctWeaponTrainingReadiness,'recent-same-room-training');
  assert.equal(Object.values(summary.distinctWeaponTrainingBaselines).reduce((a,b)=>a+b,0),1);
  assert.deepEqual(summary.distinctWeaponTrainingBudgetCounts,{40:1});
});

test('distinct-weapon training counterfactual preserves safety and stops after four lanes',()=>{
  const skills=['small_edged','medium_edged','large_edged','twohanded_edged','blunt'];
  const options=[{id:'train_blunt',kind:'command',description:'Trainer lesson budget 40 silvers'},
    {id:'wait',kind:'command'}];
  const state={...event.state,hp:145,maxHp:145,inCombat:false,quest:null,silver:55,
    character:{guild:'barbarian'},skills:{small_edged:1,medium_edged:1,
      large_edged:1,twohanded_edged:1,blunt:0},
    requirements:{rows:[{label:'4th weapon',have:0,need:2,eligible:skills}]}};
  const base={...event,providerChoice:'wait',options,state};
  assert.equal(replaySupervisorDecision(base,{distinctWeaponTraining:true}).distinctWeaponTrainingChoice,null);
  assert.equal(replaySupervisorDecision({...base,state:{...state,hp:50}},
    {distinctWeaponTraining:true}).distinctWeaponTrainingChoice,null);
  assert.equal(replaySupervisorDecision({...base,state:{...state,quest:{kind:'kill',done:false}}},
    {distinctWeaponTraining:true}).distinctWeaponTrainingChoice,null);
  assert.equal(replaySupervisorDecision({...base,state:{...state,silver:39}},
    {distinctWeaponTraining:true}).distinctWeaponTrainingChoice,null);
});

test('distinct-weapon training never treats omitted mindstate lanes as rank zero',()=>{
  const skills=['small_edged','medium_edged','large_edged','twohanded_edged','blunt'];
  const options=[{id:'attack_0',kind:'command'},
    {id:'train_blunt',kind:'command',description:'Trainer lesson budget 40 silvers'}];
  const state={...event.state,hp:145,maxHp:145,inCombat:false,quest:null,silver:55,
    character:{guild:'barbarian'},skills:{small_edged:8,medium_edged:4},
    requirements:{rows:[{label:'4th weapon',have:0,need:2,eligible:skills}]}};
  const readiness=inspectDistinctWeaponTraining({options,state});
  assert.equal(readiness.reason,'incomplete-weapon-rank-snapshot');
  assert.deepEqual(readiness.unknownSkills,['large_edged','twohanded_edged','blunt']);
  const replay=replaySupervisorDecision({...event,providerChoice:'attack_0',options,state},
    {distinctWeaponTraining:true});
  assert.equal(replay.distinctWeaponTrainingChoice,null);
  assert.equal(replay.distinctWeaponTrainingReadiness,'incomplete-weapon-rank-snapshot');
});

test('replay hydrates weapon ranks from a recent complete census, not partial or stale census',()=>{
  const eligible=['small_edged','medium_edged','large_edged','twohanded_edged','blunt'];
  const options=[{id:'attack_0',kind:'command'},
    {id:'train_blunt',kind:'command',description:'Trainer lesson budget 40 silvers'}];
  const state={...event.state,room:'hall_barbarian',hp:145,maxHp:145,inCombat:false,
    quest:null,silver:55,character:{guild:'barbarian'},skills:{small_edged:1},
    requirements:{rows:[{label:'4th weapon',have:0,need:2,eligible}]}};
  const decision={...event,type:'local-decision',ts:'2026-09-21T12:02:00.000Z',
    providerChoice:'attack_0',options,state};
  const census={type:'skill-census',ts:'2026-09-21T12:00:00.000Z',complete:true,
    skills:Object.fromEntries(Object.keys(SKILLS).map(id=>[id,id==='small_edged'?1:0])),totalRanks:1};
  const fresh=summarizeSupervisorReplay([census,decision],{distinctWeaponTraining:true});
  assert.equal(fresh.records[0].distinctWeaponTrainingReadiness,'ready');
  assert.equal(fresh.records[0].distinctWeaponTrainingChoice,'train_blunt');
  const partial=summarizeSupervisorReplay([{...census,complete:false,skills:{small_edged:1}},decision],
    {distinctWeaponTraining:true});
  assert.equal(partial.records[0].distinctWeaponTrainingReadiness,'incomplete-weapon-rank-snapshot');
  assert.equal(partial.records[0].distinctWeaponTrainingChoice,null);
  const stale={...census,ts:'2026-09-21T11:58:00.000Z'};
  const old=summarizeSupervisorReplay([stale,decision],{distinctWeaponTraining:true});
  assert.equal(old.records[0].distinctWeaponTrainingReadiness,'incomplete-weapon-rank-snapshot');
  assert.equal(old.records[0].distinctWeaponTrainingChoice,null);
});
