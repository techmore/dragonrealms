import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluationSummary, requirementBlip, historyCurve } from '../public/js/puffer-results.js';
test('history curves preserve missing values and reset drops without inventing progress',()=>{
  assert.equal(historyCurve([{steps:128,circle:null}],'circle'),null);
  const curve=historyCurve([{steps:128,circle:20},{steps:256,circle:null},{steps:384,circle:1}],'circle');
  assert.equal(curve.samples,2);assert.equal(curve.ymin,1);assert.equal(curve.ymax,20);
  assert.equal((curve.path.match(/M/g)||[]).length,2);
  const flat=historyCurve([{steps:128,reward:0},{steps:256,reward:0}],'reward');
  assert.equal(flat.ymax,0);assert.ok(!flat.path.includes('NaN'));
});
test('requirement colors are relative to the gate with unknowns kept unknown', () => {
  for (const [have, tone] of [[0,'behind'],[80,'behind'],[97,'behind'],[98,'close'],[99,'close'],[100,'met'],[101,'met'],[102,'over'],[103,'over'],[130,'over']]) {
    assert.equal(requirementBlip({have,need:100}).tone,tone);
  }
  for (const row of [{},{have:null,need:10},{have:5,need:0},{have:NaN,need:10}]) assert.equal(requirementBlip(row).tone,'unknown');
  assert.equal(requirementBlip({have:80,need:200}).tone,'behind');
});
test('evaluation cards use matching completed evidence, distinct seeds and actual target', () => {
  const manifest = {run_id:'puffer-test',target_circle:3};
  const row = {policy:'trained_greedy',seed:1,circle:3,requirements:{ok:true},death:false};
  const progress = {run_id:manifest.run_id, rows:[row,row,{...row,seed:2,circle:2},{...row,seed:3,death:true}],current:{...row,seed:4}};
  assert.deepEqual(evaluationSummary(manifest,progress,null).groups[0], {policy:'trained_greedy',label:'PPO · best-choice actions',completed:3,reached:1});
  assert.equal(evaluationSummary(manifest,{...progress,run_id:'other'},null).groups.length,0);
  assert.equal(evaluationSummary(manifest,progress,{run_id:manifest.run_id,rows:[]}).groups.length,0);
});
