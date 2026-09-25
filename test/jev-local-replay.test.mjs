import test from 'node:test';
import assert from 'node:assert/strict';
import { selectLocalReplayEvents } from '../scripts/lib/jev-local-replay.mjs';

const decision=(ts,ids)=>({type:'local-decision',ts,state:{circle:1},options:ids.map(id=>({id}))});

test('local replay selects only saved actionable decisions and preserves log order',()=>{
  const events=[{type:'prompt',ts:'0'},decision('1',['wait']),
    {type:'local-decision',ts:'2',state:null,options:[]},
    {type:'local-decision',ts:'2b',state:{circle:1},options:[]},decision('3',['wield_club','attack_0']),
    decision('4',['rest'])];
  assert.deepEqual(selectLocalReplayEvents(events,{limit:2}).map(event=>event.ts),['3','4']);
  assert.deepEqual(selectLocalReplayEvents(events,{requiredAction:'wield_club'}).map(event=>event.ts),['3']);
  assert.deepEqual(selectLocalReplayEvents(events,{eventTimestamp:'3'}).map(event=>event.ts),['3']);
  assert.deepEqual(selectLocalReplayEvents(events,{eventTimestamp:'missing'}),[]);
  assert.throws(()=>selectLocalReplayEvents(events,{limit:0}),/from 1 to 10/);
  assert.throws(()=>selectLocalReplayEvents(events,{limit:11}),/from 1 to 10/);
});
