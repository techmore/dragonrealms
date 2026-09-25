import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SKILLS } from '../data/skills.js';
import { installJevSkillCensusInstrumentation } from '../scripts/lib/jev-skill-census-instrumentation.mjs';

function skillsText() {
  const lines=['Skills (total ranks: 5)','','Weapons'];
  for(const skill of Object.values(SKILLS)) {
    const rank=skill.id==='small_edged'?5:0;
    lines.push(`  ${skill.name.padEnd(24)} ${String(rank).padEnd(4)} ${rank?'Novice':'Untrained'}`);
  }
  return lines.join('\n');
}

function harness({now=200_000,...config}={}) {
  const writes=[];
  const timers=new Map();
  let timerId=0;
  class FakeWireSession {
    constructor(){this.pid=4242;this.commands=[];this.vitals={hp:120,maxhp:145,rt:0,
      inCombat:false,bleeding:[],skills:{small_edged:3}};}
    connect(handlers){this.handlers=handlers;return handlers;}
    cmd(line){this.commands.push(line);return Promise.resolve();}
  }
  installJevSkillCensusInstrumentation(FakeWireSession,{root:'/unused',now:()=>now,
    intervalMs:180_000,timeoutMs:5000,setTimer:(fn)=>{const id=++timerId;timers.set(id,fn);return id;},
    clearTimer:id=>timers.delete(id),writeEvent:(pid,event)=>writes.push({pid,event}),...config});
  return {FakeWireSession,writes,timers};
}

test('preload observer requests ordinary skills only on safe prompts and merges verified ranks',()=>{
  const {FakeWireSession,writes}=harness();
  const session=new FakeWireSession();
  session.connect({onPrompt(){},onText(){}});
  session.handlers.onEnter();
  session.handlers.onPrompt({},'');
  assert.deepEqual(session.commands,['skills']);
  session.handlers.onText(skillsText(),'msg');
  assert.equal(session.vitals.skills.small_edged,5);
  assert.equal(session.vitals.skills.foraging,0);
  assert.equal(session.vitals.skillSnapshotComplete,true);
  assert.equal(writes.length,2);
  assert.deepEqual(writes.map(row=>row.event.type),['skill-census-request','skill-census']);
  assert.equal(writes.every(row=>row.pid===4242),true);
  assert.equal(writes[1].event.complete,true);
});

test('preload observer respects safety and request cadence',()=>{
  const {FakeWireSession}=harness();
  const session=new FakeWireSession();
  session.connect({});session.handlers.onEnter();
  session.vitals.inCombat=true;session.handlers.onPrompt();
  assert.deepEqual(session.commands,[]);
  session.vitals.inCombat=false;session.vitals.rt=1;session.handlers.onPrompt();
  assert.deepEqual(session.commands,[]);
  session.vitals.rt=0;session.handlers.onPrompt();
  assert.deepEqual(session.commands,['skills']);
  session.handlers.onText(skillsText(),'msg');
  session.handlers.onPrompt();
  assert.deepEqual(session.commands,['skills']);
});

test('timeout records incomplete capture as unknown and never hydrates absent skills to zero',()=>{
  const {FakeWireSession,writes,timers}=harness();
  const session=new FakeWireSession();
  session.connect({});session.handlers.onEnter();session.handlers.onPrompt();
  session.handlers.onText('Skills (total ranks: 5)\n  Small Edged            5    Novice','msg');
  const [id,timeout]=[...timers.entries()][0];
  timeout();
  assert.equal(session.vitals.skillSnapshotComplete,undefined);
  assert.equal(session.vitals.skills.foraging,undefined);
  assert.equal(writes.at(-1).event.complete,false);
  assert.equal(writes.at(-1).event.skills,null);
  assert.equal(timers.has(id),false);
});

test('default writer appends census events only to the manifest matching this player PID',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'jev-census-trace-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const base=path.join(root,'public/live/jev-player');
  const own=path.join(base,'own-run');
  const other=path.join(base,'other-run');
  fs.mkdirSync(own,{recursive:true});fs.mkdirSync(other,{recursive:true});
  fs.writeFileSync(path.join(own,'manifest.json'),JSON.stringify({pid:4242}));
  fs.writeFileSync(path.join(other,'manifest.json'),JSON.stringify({pid:5252}));
  fs.writeFileSync(path.join(own,'events.jsonl'),'');
  fs.writeFileSync(path.join(other,'events.jsonl'),'');
  const timers=new Map();let timerId=0;
  class FakeWireSession {
    constructor(){this.pid=4242;this.vitals={hp:120,maxhp:145,rt:0,inCombat:false,bleeding:[],skills:{}};}
    connect(handlers){this.handlers=handlers;}
    cmd(){return Promise.resolve();}
  }
  installJevSkillCensusInstrumentation(FakeWireSession,{root,now:()=>200_000,
    setTimer:fn=>{const id=++timerId;timers.set(id,fn);return id;},
    clearTimer:id=>timers.delete(id)});
  const session=new FakeWireSession();session.connect({});session.handlers.onEnter();session.handlers.onPrompt();
  session.handlers.onText(skillsText(),'msg');
  const ownEvents=fs.readFileSync(path.join(own,'events.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
  const otherEvents=fs.readFileSync(path.join(other,'events.jsonl'),'utf8');
  assert.deepEqual(ownEvents.map(event=>event.type),['skill-census-request','skill-census']);
  assert.equal(ownEvents[1].complete,true);
  assert.equal(otherEvents,'');
});
