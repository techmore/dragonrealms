import test from 'node:test';
import assert from 'node:assert/strict';
import { inferBarbarianFormUses } from '../public/js/jev-ability-trace.js';

const run=innerFire=>({type:'local-decision',ts:'2026-09-21T18:10:03.506Z',id:'ability_dragon',
  state:{innerFire,roundtime:0,inCombat:true}});

test('infers form use from dispatch and the subsequent resource snapshot without claiming server acknowledgement',()=>{
  const events=[run(100),{type:'execution',ts:'2026-09-21T18:10:03.507Z',command:'form dragon'},
    {type:'text',ts:'2026-09-21T18:10:04.000Z',text:'You strike the foe.'},
    {type:'local-decision',ts:'2026-09-21T18:10:08.146Z',id:'analyze_flame',
      state:{innerFire:77,roundtime:1,inCombat:true}}];
  assert.deepEqual(inferBarbarianFormUses(events),[{
    abilityId:'dragon',dispatchedAt:'2026-09-21T18:10:03.507Z',
    observedAt:'2026-09-21T18:10:08.146Z',innerFireBefore:100,innerFireAfter:77,
    netDrop:23,evidence:'resource-drop-consistent-with-use',
    confidence:'inferred-not-server-acknowledged',
  }]);
});

test('does not infer a use from a dispatched command without the expected resource drop',()=>{
  const events=[run(100),{type:'execution',ts:'2026-09-21T18:10:03.507Z',command:'form dragon'},
    {type:'local-decision',ts:'2026-09-21T18:10:08.146Z',id:'wait',state:{innerFire:96}}];
  assert.equal(inferBarbarianFormUses(events)[0].evidence,'insufficient-resource-delta');
});

test('does not count a prefetch that was canceled before dispatch',()=>{
  const events=[run(100),{type:'rt-action-prefetched',ts:'2026-09-21T18:10:03.507Z',id:'ability_dragon'},
    {type:'rt-action-prefetch-cancelled',ts:'2026-09-21T18:10:04.507Z',id:'ability_dragon'}];
  assert.deepEqual(inferBarbarianFormUses(events),[]);
});
