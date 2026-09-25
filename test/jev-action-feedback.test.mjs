import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeActionFeedback } from '../scripts/lib/jev-action-feedback.mjs';

test('recognizes a valid forage attempt even when it finds no item',()=>{
  const result=summarizeActionFeedback('forage',[
    {type:'text',text:'You comb the ground but find nothing useful.'},
  ]);
  assert.equal(result.status,'accepted');
  assert.deepEqual(result.reportedRankImprovements,[]);
});

test('distinguishes rejected field actions from accepted feedback and explicit rank-ups',()=>{
  assert.equal(summarizeActionFeedback('forage',[
    {type:'text',text:'You find nothing worth foraging here. Try the wilds.'},
  ]).status,'rejected');
  const hide=summarizeActionFeedback('practice_stealth',[
    {type:'text',text:'You melt into the shadows of the North Fields. Your Stealth improved!'},
  ]);
  assert.equal(hide.status,'rank-improved');
  assert.deepEqual(hide.reportedRankImprovements,['stealth']);
});

test('unknown text remains unknown instead of being treated as action success',()=>{
  assert.equal(summarizeActionFeedback('forage',[
    {type:'text',text:'You cannot do that now.'},
  ]).status,'unknown');
});
