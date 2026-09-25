import test from 'node:test';
import assert from 'node:assert/strict';
import { providerGateChoiceRelease, summarizeProviderGateChoiceRelease } from '../scripts/lib/jev-provider-gate-choice-release.mjs';

function decision(overrides={}) {
  return {type:'local-decision',ts:'2026-09-21T19:00:00.000Z',providerChoice:'appraise_dagger',
    id:'travel_fields_furrow',supervisorOverride:'route-to-fields-for-open-combat-gates',
    options:[{id:'appraise_dagger'},{id:'travel_fields_furrow'}],
    state:{inCombat:false,hp:120,maxHp:145,bleeding:[],quest:null,
      skills:{appraisal:0},requirements:{rows:[
        {label:'1st lore',have:0,need:2,eligible:['appraisal','performance']},
      ]}},...overrides};
}

test('releases only a legal safe provider action mapped to an open requirement',()=>{
  const result=providerGateChoiceRelease(decision());
  assert.equal(result.eligible,true);
  assert.equal(result.choice,'appraise_dagger');
  assert.deepEqual(result.skills,['appraisal']);
  assert.equal(result.displacedAction,'travel_fields_furrow');
  assert.match(result.interpretation,/does not predict/);
});

test('does not release choices without the exact route override or offered menu action',()=>{
  assert.equal(providerGateChoiceRelease(decision({supervisorOverride:'other'})).eligible,false);
  assert.equal(providerGateChoiceRelease(decision({options:[{id:'travel_fields_furrow'}]})).eligible,false);
});

test('preserves the counterfactual safety boundary and requires an open mapped lane',()=>{
  assert.equal(providerGateChoiceRelease(decision({state:{...decision().state,inCombat:true}})).reason,'unsafe-or-unknown-vitals');
  assert.equal(providerGateChoiceRelease(decision({state:{...decision().state,hp:100,maxHp:145}})).reason,'unsafe-or-unknown-vitals');
  assert.equal(providerGateChoiceRelease(decision({state:{...decision().state,bleeding:[{part:'arm'}]}})).reason,'unsafe-or-unknown-vitals');
  assert.equal(providerGateChoiceRelease(decision({state:{...decision().state,quest:{type:'delivery',completed:false}}})).reason,'pending-delivery-quest');
  const closed={...decision().state,requirements:{rows:[{label:'1st lore',have:2,need:2,eligible:['appraisal']}]}};
  assert.equal(providerGateChoiceRelease(decision({state:closed})).reason,'provider-choice-not-mapped-to-an-open-requirement');
});

test('summary counts safe releases and displaced actions without inventing outcomes',()=>{
  const report=summarizeProviderGateChoiceRelease([decision(),decision({state:{...decision().state,
    quest:{type:'delivery',completed:false}}})]);
  assert.equal(report.decisions,2);
  assert.equal(report.routeOverrideMenus,2);
  assert.equal(report.releases,1);
  assert.deepEqual(report.byAction,{appraise_dagger:1});
  assert.deepEqual(report.bySkill,{appraisal:1});
  assert.match(report.scope,/no command is executed/);
});
