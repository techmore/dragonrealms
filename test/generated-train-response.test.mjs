// Native generated TRAIN response contract, using only a disposable test DB.
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import * as h from './helpers.mjs'; // Disposable DB before transitive backend imports.
import {buildCircleScript} from '../scripts/lib/script-gen.mjs';
import {createRunner} from '../public/js/script-engine.js';
import {virtualClock} from '../puffer_adapter/virtual_clock.mjs';
import {VARIANTS} from '../data/guild-scripts.js';
h.setupGame();after(()=>h.teardownGame());
function script(guild='warmage') {
 const source=buildCircleScript({cap:{guild,char:'Patchfixture',race:'human',scriptBase:'fixture',circle:1,
  trainList:['summoning'],skipCircle:true},fromArena:{hall:[],back:[]},errands:{}});
 return source.slice(source.indexOf('TRAIN:'),source.indexOf('BACK:'))+'BACK:\nexit\n';
}
async function player(name) {
 const a=await h.auth.registerAccount(name,'isolated-test-password');
 const p=h.loadPlayer(h.createCharacter(a.accountId,{name,race:'human',guild:'warmage'}));
 h.game.addPlayer(p);p.room='hall_warmage';p.ws=h.fakeWs();return p;
}
function host(p) {
 const pending=[],sent=[];
 const r=createRunner(script(),[],{send:line=>{pending.push(line);sent.push(line);}}).start();
 const dispatch=()=>{
  const line=pending.shift(),start=p.ws.msgs.length;h.handleCommand(h.game,p,line,0,{applyRT:true});
  const frames=p.ws.msgs.slice(start);for(const f of frames)if(f.msg)r.feed(f.msg,f.t);return frames;
 };
 return{r,pending,sent,dispatch};
}
test('generated TRAIN resolves message-only TDP then performs one native paid lesson',async()=>{
 const p=await player('PatchActual'),silver=p.silver,clock=virtualClock(),x=host(p);
 try {
  assert.deepEqual(x.sent,['tdp']);assert.deepEqual(x.dispatch().map(f=>f.t),['msg']);
  assert.equal(x.r.state.mode,'timer');clock.advance(1000);x.r.feed('',false);
  assert.deepEqual(x.sent,['tdp','train summoning']);
  assert.ok(x.dispatch().some(f=>f.t==='prompt'));assert.equal(x.r.running,false);
  assert.equal(p.silver,silver-40);assert.equal(p.skills.summoning.rank,0);assert.equal(p.skills.summoning.exp,80);
 }finally{x.r.stop();clock.close();}
});
test('generated TRAIN bounds missing TDP transport reply without synthetic prompts',async()=>{
 const p=await player('PatchNoReply'),clock=virtualClock(),x=host(p);
 try {
  x.pending.shift();clock.advance(4999);x.r.feed('',false);assert.deepEqual(x.sent,['tdp']);
  clock.advance(1);x.r.feed('',false);assert.equal(x.r.state.mode,'timer');
  clock.advance(1000);x.r.feed('',false);assert.deepEqual(x.sent,['tdp','train summoning']);
  assert.equal(p.silver,150);assert.equal(p.skills.summoning.exp,0,'no lesson was granted before real dispatch');
 }finally{x.r.stop();clock.close();}
});
test('common response contract keeps paid-lesson wait and all baseline variant knobs unchanged',()=>{
 for(const guild of ['barbarian','bard','cleric','empath','moonmage','necromancer','paladin','ranger','thief','trader','warmage']) {
  const s=script(guild);assert.match(s,/match TRAIN_TDP_DONE Training Points\n  put tdp\n  matchwait 5\nTRAIN_TDP_DONE:/);
  assert.match(s,/put train summoning\n  wait/);assert.equal((s.match(/TRAIN_TDP_DONE:/g)||[]).length,1);
 }
 assert.deepEqual(VARIANTS.baseline,{restPct:35,hallEvery:4,arenaBand:2,hallFallbackMs:240000,
  hypothesis:'Control — every other variant changes exactly one knob against it.'});
});
