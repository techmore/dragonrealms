import test from 'node:test';
import assert from 'node:assert/strict';
import { SKILLS } from '../data/skills.js';
import { mergeSkillCensusIntoState, parseSkillCensus, skillCensusEvent,
  SkillCensusProbe, shouldRequestSkillCensus } from '../scripts/lib/jev-skill-census.mjs';

function skillsText({omit=null,ansi=false}={}) {
  const lines=['Skills (total ranks: 5)','','Weapons'];
  for(const [id,skill] of Object.entries(SKILLS)) {
    if(id===omit)continue;
    const rank=id==='small_edged'?5:0;
    const name=ansi?`\x1b[1m${skill.name}\x1b[0m`:skill.name;
    lines.push(`  ${name.padEnd(24)} ${String(rank).padEnd(4)} ${rank?'Novice':'Untrained'}`);
  }
  return lines.join('\n');
}

test('parses a complete native skills panel including rank zero and ANSI styling',()=>{
  const census=parseSkillCensus(skillsText({ansi:true}));
  assert.equal(census.complete,true);
  assert.equal(census.parsedSkillCount,census.expectedSkillCount);
  assert.equal(census.totalRanks,5);
  assert.equal(census.totalRanksMatch,true);
  assert.equal(census.skills.small_edged,5);
  assert.equal(census.skills.athletics,0);
  assert.deepEqual(census.missingSkillIds,[]);
});

test('partial output remains explicitly incomplete rather than defaulting absent lanes to zero',()=>{
  const census=parseSkillCensus(skillsText({omit:'large_edged'}));
  assert.equal(census.complete,false);
  assert.equal(Object.hasOwn(census.skills,'large_edged'),false);
  assert.deepEqual(census.missingSkillIds,['large_edged']);
});

test('missing native total-rank header prevents a complete census claim',()=>{
  const census=parseSkillCensus(skillsText().replace(/Skills \(total ranks: \d+\)/,''));
  assert.equal(census.complete,false);
  assert.equal(census.parsedSkillCount,census.expectedSkillCount);
  assert.equal(census.totalRanks,null);
});

test('rank-total mismatch and duplicate skill rows invalidate otherwise full output',()=>{
  const wrongTotal=parseSkillCensus(skillsText().replace('total ranks: 5','total ranks: 6'));
  assert.equal(wrongTotal.complete,false);
  assert.equal(wrongTotal.sumSkillRanks,5);
  assert.equal(wrongTotal.totalRanksMatch,false);
  const duplicateText=skillsText().replace(/(  Small Edged\s+5\s+Novice)/,'$1\n$1');
  const duplicate=parseSkillCensus(duplicateText);
  assert.equal(duplicate.complete,false);
  assert.deepEqual(duplicate.duplicateSkillIds,['small_edged']);
});

test('a complete census replaces mirrored ranks and records its provenance',()=>{
  const census=parseSkillCensus(skillsText());
  const at='2026-09-21T12:00:00.000Z';
  const state=mergeSkillCensusIntoState({skills:{small_edged:1,foraging:9}},census,at);
  assert.equal(state.skills.small_edged,5);
  assert.equal(state.skills.foraging,0);
  assert.equal(state.skillSnapshotComplete,true);
  assert.equal(state.skillSnapshotSource,'skills-command');
  assert.equal(state.skillSnapshotAt,at);
  assert.equal(state.skillCensusTotalRanks,census.totalRanks);
});

test('a partial census invalidates completeness without inventing missing ranks',()=>{
  const census=parseSkillCensus(skillsText({omit:'large_edged'}));
  const state=mergeSkillCensusIntoState({skills:{large_edged:7}},census,'2026-09-21T12:00:00.000Z');
  assert.equal(state.skillSnapshotComplete,false);
  assert.equal(state.skillSnapshotSource,'partial-skills-command');
  assert.equal(state.skills.large_edged,7);
});

test('trace events preserve complete maps but never publish partial maps as complete',()=>{
  const complete=parseSkillCensus(skillsText());
  const completeEvent=skillCensusEvent(complete,'2026-09-21T12:00:00.000Z');
  assert.equal(completeEvent.type,'skill-census');
  assert.equal(completeEvent.complete,true);
  assert.equal(completeEvent.skills.small_edged,5);
  const partial=parseSkillCensus(skillsText({omit:'large_edged'}));
  const partialEvent=skillCensusEvent(partial,'2026-09-21T12:00:00.000Z');
  assert.equal(partialEvent.complete,false);
  assert.equal(partialEvent.skills,null);
});

test('opt-in probe brackets multi-message skills output and emits exactly one bounded trace event',()=>{
  const emitted=[];
  const probe=new SkillCensusProbe({onCensus:event=>emitted.push(event)});
  assert.equal(probe.begin('2026-09-21T12:00:00.000Z'),true);
  assert.equal(probe.begin('2026-09-21T12:00:01.000Z'),false);
  const lines=skillsText().split('\n');
  probe.text(lines.slice(0,20).join('\n'));
  probe.text(lines.slice(20).join('\n'));
  const event=probe.finish('2026-09-21T12:00:02.000Z');
  assert.equal(event.complete,true);
  assert.equal(event.command,'skills');
  assert.equal(event.requestedAt,'2026-09-21T12:00:00.000Z');
  assert.equal(event.skills.small_edged,5);
  assert.equal(emitted.length,1);
  assert.equal(probe.finish(),null);
  assert.equal(probe.text('late unrelated text'),false);
});

test('probe cancel discards an unfinished response rather than recording false zeroes',()=>{
  const emitted=[];
  const probe=new SkillCensusProbe({onCensus:event=>emitted.push(event)});
  probe.begin();
  probe.text('Skills (total ranks: 100)');
  assert.equal(probe.cancel(),true);
  assert.equal(probe.finish(),null);
  assert.deepEqual(emitted,[]);
});

test('probe bounds captured response memory and reports overflow as incomplete',()=>{
  const probe=new SkillCensusProbe({maxBytes:8});
  probe.begin('2026-09-21T12:00:00.000Z');
  assert.equal(probe.text('123456789'),false);
  const event=probe.finish('2026-09-21T12:00:01.000Z');
  assert.equal(event.complete,false);
  assert.equal(event.skills,null);
  assert.equal(event.captureError,'response-too-large');
  assert.equal(event.responseBytes,9);
});

test('census scheduler requires a healthy out-of-combat zero-RT window and interval',()=>{
  const ready={inCombat:false,hp:120,maxHp:145,rt:0,bleeding:[]};
  assert.equal(shouldRequestSkillCensus(ready,{now:600_000,lastRequestedAt:0}),true);
  assert.equal(shouldRequestSkillCensus(ready,{now:179_999,lastRequestedAt:0}),false);
  assert.equal(shouldRequestSkillCensus({...ready,rt:1},{now:600_000}),false);
  assert.equal(shouldRequestSkillCensus({...ready,inCombat:true},{now:600_000}),false);
  assert.equal(shouldRequestSkillCensus({...ready,hp:100},{now:600_000}),false);
  assert.equal(shouldRequestSkillCensus({...ready,bleeding:['arm']},{now:600_000}),false);
  assert.equal(shouldRequestSkillCensus({...ready,rt:undefined},{now:600_000}),false);
});
