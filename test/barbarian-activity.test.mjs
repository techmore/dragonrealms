import test from 'node:test';
import assert from 'node:assert/strict';
import { barbarianActivity } from '../scripts/lib/barbarian-activity.mjs';
import { circleRequirementCandidates } from '../data/guilds.js';
import { VARIANTS } from '../data/guild-scripts.js';
import { buildSharedFightScript } from '../scripts/lib/script-gen.mjs';
import { createRunner } from '../public/js/script-engine.js';
const now=1000000;
const full=()=>Object.fromEntries([
  ...['weapon','armor','survival','lore','supernatural'].flatMap(set=>circleRequirementCandidates({id:'barbarian'},set)),
  'expertise','melee_mastery','inner_fire','parry','evasion','tactics',
].map(id=>[id,100]));
const plan=(ranks,extra={})=>barbarianActivity({ranks,circle:1,now,observedAt:now,...extra});

test('unknown/stale EXP requests observations instead of guessing zeroes',()=>{
  assert.equal(plan({}, {observedAt:undefined}).vars.gap_mode,'observe');
  assert.equal(plan(full(),{observedAt:now-90001}).vars.gap_mode,'observe');
});
test('completed combat stops optional drills and moves to town for lore',()=>{
  const ranks=full();for(const id of circleRequirementCandidates({id:'barbarian'},'lore'))ranks[id]=0;
  const p=plan(ranks);
  assert.equal(p.vars.gap_mode,'town');assert.equal(p.ready,false);
  for(const id of ['gap_analyze','gap_trip','gap_forage','gap_roar'])assert.equal(p.vars[id],'0');
  assert.equal(plan(full()).ready,true);
});
test('survival switches away from completed lanes and pauses full pools',()=>{
  const ranks=full();for(const id of circleRequirementCandidates({id:'barbarian'},'survival'))ranks[id]=0;
  ranks.skinning=4;ranks.athletics=4;
  assert.equal(plan(ranks).vars.gap_mode,'forage');
  ranks.foraging=4;
  assert.equal(plan(ranks).vars.gap_forage,'0');
  assert.equal(plan(ranks).vars.gap_mode,'hunt');
  assert.equal(plan(ranks,{locked:{perception:now}}).vars.gap_mode,'drain');
  ranks.perception=2;
  assert.equal(plan(ranks).vars.gap_mode,'town','fourth survival only needs two, not four');
});
test('missing skinning still calls for combat and a new circle reopens drills',()=>{
  const ranks=full();for(const id of circleRequirementCandidates({id:'barbarian'},'survival'))ranks[id]=0;
  ranks.foraging=4;ranks.perception=4;ranks.athletics=4;
  assert.equal(plan(ranks).vars.gap_mode,'combat');
  const done=full();done.expertise=8;
  assert.equal(plan(done).vars.gap_analyze,'0');
  assert.equal(plan(done,{circle:2}).vars.gap_analyze,'1');
});
test('new variant changes only the activity policy from the historical control',()=>{
  const {diff,hypothesis,gapActivity,...candidate}=VARIANTS.edgedSkinActivity;
  const {diff:d,hypothesis:h,...control}=VARIANTS.edgedSkinCheapKit;
  assert.equal(gapActivity,true);assert.deepEqual(candidate,control);
});
test('generated drill guard actually suppresses satisfied analyze commands',()=>{
  const src=buildSharedFightScript({guild:'barbarian',gapActivity:true});
  const match=src.match(/  ife gap_analyze 0 goto (ACT_SKIP_\d+)\n([\s\S]*?)\n\1:/);
  assert.ok(match);
  for(const value of ['0','1']){
    const sent=[];
    const runner=createRunner(match[0]+'\nexit',[],{send:line=>sent.push(line)});
    runner.setVar('gap_analyze',value);runner.start();
    assert.equal(sent.includes('analyze'),value==='1');runner.stop();
  }
});

test('a permanent zero-rank combat blocker cannot starve smaller survival gaps',()=>{
  const ranks=full();for(const id of circleRequirementCandidates({id:'barbarian'},'survival'))ranks[id]=0;
  ranks.skinning=4;ranks.athletics=4;ranks.foraging=1;ranks.perception=1;ranks.expertise=0;
  assert.equal(plan(ranks).vars.gap_mode,'combat');
  assert.equal(plan(ranks,{lastCombatAt:now-10000}).vars.gap_mode,'forage');
  assert.equal(plan(ranks,{lastCombatAt:now-30001}).vars.gap_mode,'combat');
});
