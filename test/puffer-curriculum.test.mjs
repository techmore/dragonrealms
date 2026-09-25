import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GUILDS, circleRequirements} from '../data/guilds.js';
import {SKILLS} from '../data/skills.js';
import {nextGate, gateSnapshot, progressionReward} from '../puffer_adapter/curriculum.mjs';

const guild = GUILDS.barbarian;
const skills = rank => Object.fromEntries(Object.keys(SKILLS).map(id => [id, {rank, exp:0}]));
test('curriculum follows all real Barbarian gates through 20, including band change', () => {
  for (let circle=1; circle<=20; circle++) {
    const result = gateSnapshot(guild, skills(0), circle, 20);
    assert.equal(result.gate, Math.min(20, circle+1));
    assert.deepEqual(result.requirements, circleRequirements(guild, skills(0), result.gate));
  }
  assert.equal(gateSnapshot(guild, skills(0), 19, 20).requirements.rows.find(r=>r.label==='1st weapon').need, 90);
  for (const target of [1,21,NaN,2.5,'20']) assert.throws(()=>nextGate(1,target));
  assert.throws(()=>nextGate(21,20));
});
test('earning a circle never incurs a penalty from the next gate opening', () => {
  for (let circle=1; circle<20; circle++) {
    const rank = Math.max(...circleRequirements(guild, skills(0), circle+1).rows.map(r=>r.need));
    const state = skills(rank);
    const result = progressionReward({guild,beforeSkills:state,afterSkills:state,
      beforeCircle:circle,afterCircle:circle+1,target:20,dead:false,elapsedSeconds:6});
    assert.equal(result.reward,1);
    assert.equal(result.progress,0);
    assert.equal(result.gate,circle+1);
  }
});
test('excess skills cannot farm reward; time cost is separate and opt-in', () => {
  const input = {guild,beforeSkills:skills(100),afterSkills:skills(200),
    beforeCircle:1,afterCircle:1,target:20,dead:false,elapsedSeconds:3600};
  assert.equal(progressionReward(input).reward,0);
  assert.equal(progressionReward({...input,timeCostPerHour:.01}).reward,-.01);
  assert.equal(progressionReward({...input,dead:true}).reward,-1);
  assert.throws(()=>progressionReward({...input,timeCostPerHour:NaN}));
  assert.throws(()=>progressionReward({...input,afterCircle:3}));
  assert.throws(()=>progressionReward({...input,afterCircle:2,afterSkills:skills(0)}));
});
