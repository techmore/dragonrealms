import test from 'node:test';
import assert from 'node:assert/strict';
import { bridgeKitFundingAction, bridgeCurriculumAction, JEV_CURRICULUM_BRIDGE_VERSION } from '../scripts/lib/jev-curriculum-bridge.mjs';

const base = {
  guild: 'barbarian', hp: 100, maxHp: 100, silver: 47,
  purchasedItems: ['dagger', 'padded_cloth', 'shield_wood'],
  equipment: { hand: [{id:'dagger'}], torso: [{id:'padded_cloth'}], shield: [{id:'shield_wood'}] },
};

test('kit bridge uses only the offered perform action while remaining kit is unaffordable', () => {
  const result = bridgeKitFundingAction([
    {id:'perform', kind:'command', command:'perform'},
    {id:'travel_fields_furrow', kind:'navigate'},
  ], base);
  assert.equal(result.action.id, 'perform');
  assert.equal(result.reason, 'fund-required-barbarian-kit-before-combat-curriculum');
  assert.deepEqual(result.missingItems, ['club', 'broadsword', 'staff']);
  assert.ok(result.missingCost > base.silver);
  assert.match(JEV_CURRICULUM_BRIDGE_VERSION, /legal-menu/);
});

test('kit bridge prefers an offered bazaar trip or legal purchase over performance', () => {
  const route = bridgeKitFundingAction([
    {id:'starter_kit', kind:'navigate', targetRoom:'bazaar'},
    {id:'perform', kind:'command', command:'perform'},
  ], base);
  assert.equal(route.action.id, 'starter_kit');
  assert.equal(route.phase, 'kit-purchase');

  const purchase = bridgeKitFundingAction([
    {id:'buy_club', kind:'command', command:'buy club'},
    {id:'perform', kind:'command', command:'perform'},
  ], {...base, silver: 112});
  assert.equal(purchase.action.id, 'buy_club');
  assert.equal(purchase.reason, 'buy-offered-distinct-barbarian-kit-lane');

  const crier = bridgeKitFundingAction([
    {id:'quest_crier', kind:'navigate', targetRoom:'square'},
    {id:'perform', kind:'command', command:'perform'},
  ], {...base, silver: 15});
  assert.equal(crier.action.id, 'quest_crier');
  assert.equal(crier.reason, 'take-offered-training-funds-quest-before-field-combat');
});

test('kit bridge yields after the full kit is funded so Jev can choose', () => {
  assert.equal(bridgeKitFundingAction([{id:'perform'}], {
    ...base, silver: 1000,
    purchasedItems: ['dagger','club','broadsword','staff','padded_cloth','shield_wood'],
  }), null);
});

test('kit bridge never overrides combat, recovery, or a completed quest', () => {
  const options = [{id:'perform'}];
  assert.equal(bridgeKitFundingAction(options, {...base, inCombat:true}), null);
  assert.equal(bridgeKitFundingAction(options, {...base, hp:50}), null);
  assert.equal(bridgeKitFundingAction(options, {...base, quest:{done:true}}), null);
  assert.equal(bridgeKitFundingAction([{id:'travel_fields_furrow'}], base), null);
});

test('curriculum bridge follows open supernatural, lore, survival, then weapon lanes', () => {
  const baseState={...base, purchasedItems:['dagger','club','broadsword','staff','padded_cloth','shield_wood'],
    requirements:{rows:[
      {label:'1st supernatural',have:0,need:2,eligible:['augmentation']},
      {label:'1st lore',have:0,need:2,eligible:['scholarship','appraisal']},
      {label:'1st survival',have:0,need:4,eligible:['foraging','stealth']},
      {label:'1st weapon',have:0,need:8,eligible:['blunt']},
    ]}, skills:{foraging:0,stealth:1}};
  assert.equal(bridgeCurriculumAction([{id:'learn_ability_dragon'},{id:'lore_library'},{id:'forage'}],baseState).phase,'supernatural');
  const noSuper={...baseState,requirements:{rows:baseState.requirements.rows.slice(1)}};
  assert.equal(bridgeCurriculumAction([{id:'lore_library'},{id:'forage'}],noSuper).phase,'lore');
  const noLore={...noSuper,requirements:{rows:noSuper.requirements.rows.slice(1)}};
  assert.equal(bridgeCurriculumAction([{id:'forage'},{id:'practice_stealth'}],noLore).action.id,'forage');
});

test('curriculum bridge yields to an active quest after kit funding', () => {
  const state={...base,purchasedItems:['dagger','club','broadsword','staff','padded_cloth','shield_wood'],
    quest:{kind:'kill',done:false},requirements:{rows:[
      {label:'1st lore',have:0,need:2,eligible:['scholarship']},
    ]}};
  assert.equal(bridgeCurriculumAction([{id:'lore_library'}],state),null);
});
