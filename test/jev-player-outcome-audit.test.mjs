import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeJevPlayerOutcomes } from '../scripts/lib/jev-player-outcome-audit.mjs';

const decision=(ts,id,{skills={},rows=[],overrideReason=null,providerChoice=null}={})=>({
  type:'local-decision',ts,id,supervisorOverride:overrideReason,providerChoice,
  state:{room:'fields_furrow',wieldedWeaponSkill:'small_edged',skills,
    requirements:{rows}},
});

test('outcome audit associates an action with only the next observed gate and skill snapshot',()=>{
  const rows=[{label:'1st weapon',have:7,need:8}];
  const events=[
    decision('2026-09-21T17:00:00.000Z','attack_0',{skills:{small_edged:7,parry:2},rows,
      overrideReason:'close-near-complete-first-weapon-lane',providerChoice:'practice_brawling'}),
    decision('2026-09-21T17:00:05.000Z','practice_brawling',{skills:{small_edged:8,parry:3},
      rows:[{label:'1st weapon',have:8,need:8}],providerChoice:'practice_brawling'}),
    decision('2026-09-21T17:00:10.000Z','wait',{skills:{small_edged:8,parry:3},
      rows:[{label:'1st weapon',have:8,need:8}]})];
  const audit=summarizeJevPlayerOutcomes(events);
  assert.equal(audit.decisionCount,3);
  assert.equal(audit.observedOutcomeWindows,2);
  assert.equal(audit.records[0].windowSeconds,5);
  assert.equal(audit.records[0].gateRankPointsDelta,1);
  assert.deepEqual(audit.records[0].skillAdvances,[{skill:'small_edged',from:7,to:8},{skill:'parry',from:2,to:3}]);
  assert.equal(audit.byAction[0].overrideReason,'close-near-complete-first-weapon-lane');
  assert.equal(audit.byAction[0].positiveGateWindows,1);
});

test('outcome audit preserves unknown rather than treating absent snapshots as zero progress',()=>{
  const audit=summarizeJevPlayerOutcomes([decision('2026-09-21T17:00:00Z','forage')]);
  assert.equal(audit.records[0].outcomeObserved,false);
  assert.equal(audit.records[0].gateRankPointsDelta,null);
  assert.equal(audit.byAction[0].observedWindows,0);
  assert.equal(audit.byAction[0].gateRankPointsDelta,null);
});

test('outcome audit does not infer rank advancement from mindstate-only or unchanged snapshots',()=>{
  const rows=[{label:'1st weapon',have:7,need:8}];
  const audit=summarizeJevPlayerOutcomes([
    decision('2026-09-21T17:00:00Z','attack_0',{skills:{small_edged:7},rows}),
    decision('2026-09-21T17:00:03Z','wait',{skills:{small_edged:7},rows}),
  ]);
  assert.equal(audit.records[0].gateRankPointsDelta,0);
  assert.deepEqual(audit.records[0].skillAdvances,[]);
  assert.equal(audit.byAction[0].positiveGateWindows,0);
});

test('separates selected actions from observed dispatch and command echoes',()=>{
  const first=decision('2026-09-21T17:00:00Z','forage',{skills:{foraging:1},
    rows:[{label:'1st survival',have:1,need:4}]});
  first.kind='command';
  first.command='forage';
  const next=decision('2026-09-21T17:00:05Z','wait',{skills:{foraging:2},
    rows:[{label:'1st survival',have:2,need:4}]});
  const audit=summarizeJevPlayerOutcomes([first,
    {type:'execution',kind:'command',command:'forage'},
    {type:'command',reason:'local:forage'},
    {type:'text',text:'You comb the ground but find nothing useful.'},next]);
  assert.equal(audit.records[0].dispatchObserved,true);
  assert.equal(audit.records[0].dispatchCount,1);
  assert.equal(audit.records[0].commandEchoObserved,true);
  assert.equal(audit.records[0].actionFeedback.status,'accepted');
  assert.equal(audit.records[0].skillAdvances[0].skill,'foraging');
  assert.equal(audit.byAction[0].dispatchedDecisions,1);
});

test('does not count another action dispatch or unmatched command echo as selected-action execution',()=>{
  const first=decision('2026-09-21T17:00:00Z','forage');
  first.kind='command';first.command='forage';
  const next=decision('2026-09-21T17:00:05Z','wait');
  const audit=summarizeJevPlayerOutcomes([first,
    {type:'execution',kind:'command',command:'hide'},
    {type:'command',reason:'local:practice_stealth'},next]);
  assert.equal(audit.records[0].dispatchObserved,false);
  assert.equal(audit.records[0].commandEchoObserved,false);
  assert.equal(audit.byAction[0].undispatchedDecisions,1);
});

test('bounded lookahead records delayed skill and gate movement without replacing adjacent evidence',()=>{
  const rows=[{label:'1st survival',have:0,need:4}];
  const audit=summarizeJevPlayerOutcomes([
    decision('2026-09-21T17:00:00Z','forage',{skills:{foraging:0},rows}),
    decision('2026-09-21T17:00:05Z','wait',{skills:{foraging:0},rows}),
    decision('2026-09-21T17:00:12Z','skin',{skills:{foraging:1},
      rows:[{label:'1st survival',have:1,need:4}]})]);
  assert.deepEqual(audit.records[0].skillAdvances,[],'adjacent window stays immediate');
  assert.deepEqual(audit.records[0].skillAdvancesWithinLookahead,
    [{skill:'foraging',from:0,to:1}]);
  assert.equal(audit.records[0].gateRankPointsDelta,0);
  assert.equal(audit.records[0].gateRankPointsDeltaWithinLookahead,1);
  assert.equal(audit.records[0].lookaheadDecisions,2);
  assert.deepEqual(audit.records[0].mappedActionSkills,['foraging']);
  assert.deepEqual(audit.records[0].mappedSkillAdvancesWithinLookahead,
    [{skill:'foraging',from:0,to:1}]);
});

test('bounded lookahead excludes later decisions outside either cap',()=>{
  const rows=[{label:'1st survival',have:0,need:4}];
  const audit=summarizeJevPlayerOutcomes([
    decision('2026-09-21T17:00:00Z','forage',{skills:{foraging:0},rows}),
    ...Array.from({length:5},(_,i)=>decision(new Date(Date.parse('2026-09-21T17:00:05Z')+i*15_000).toISOString(),
      'wait',{skills:{foraging:0},rows})),
    decision('2026-09-21T17:02:00Z','look',{skills:{foraging:3},
      rows:[{label:'1st survival',have:3,need:4}]})]);
  assert.equal(audit.records[0].lookaheadDecisions,4);
  assert.deepEqual(audit.records[0].skillAdvancesWithinLookahead,[]);
});
