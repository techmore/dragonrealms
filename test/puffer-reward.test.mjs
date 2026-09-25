import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requirementPotential} from '../puffer_adapter/circle_reward.mjs';
import {expToNextRank} from '../data/skills.js';

const named=[{label:'first_aid',need:4,eligible:['first_aid']}];
test('absorbed progress earns a signal before a whole rank without modifying state',()=>{
  const skills={first_aid:{rank:0,exp:expToNextRank(0)/2}};
  const before=structuredClone(skills);
  assert.equal(requirementPotential(named,skills),.125);
  assert.deepEqual(skills,before);
  assert.equal(requirementPotential(named,{first_aid:{rank:1,exp:0}}),.25);
});
test('met requirements saturate, including excessive ranks and unused skills',()=>{
  assert.equal(requirementPotential(named,{first_aid:{rank:4,exp:0}}),1);
  assert.equal(requirementPotential(named,{first_aid:{rank:100,exp:500},foraging:{rank:100,exp:500}}),1);
});
test('Nth requirements reward the correct eligible ranked skill and handle ties',()=>{
  const rows=[{label:'2nd survival',need:4,eligible:['a','b','c']}];
  const skills={a:{rank:20,exp:0},b:{rank:1,exp:expToNextRank(1)/2},c:{rank:1,exp:0}};
  assert.equal(requirementPotential(rows,skills),1.5/4);
  skills.c.exp=expToNextRank(1)/2;
  assert.equal(requirementPotential(rows,skills),1.5/4);
  skills.a.rank=100;
  assert.equal(requirementPotential(rows,skills),1.5/4);
});
test('missing skills start at zero, invalid states fail closed',()=>{
  assert.equal(requirementPotential(named,{}),0);
  assert.throws(()=>requirementPotential(named,{first_aid:{rank:1,exp:NaN}}));
  assert.throws(()=>requirementPotential([{label:'unknown',need:4,eligible:['a','b']}],{}));
});
