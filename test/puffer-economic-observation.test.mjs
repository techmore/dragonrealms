import {test} from 'node:test';
import assert from 'node:assert/strict';
import {economicObservation,itemCosts,KIT_ITEMS} from '../puffer_adapter/economic_observation.mjs';
import {ITEMS} from '../data/items.js';

test('economic features distinguish an unaffordable weapon and expose only explicit state',()=>{
  const player={silver:150,inventory:[],equipment:{},privateChat:'never included'};
  const before=structuredClone(player);
  const poor=economicObservation(player);
  const rich=economicObservation({...player,silver:1000});
  assert.equal(poor.features.length,13);
  assert.equal(poor.labels.length,13);
  assert.ok(poor.features[poor.labels.indexOf('affords_broadsword')]<1);
  assert.equal(rich.features[rich.labels.indexOf('affords_broadsword')],1);
  assert.deepEqual(player,before);
  assert.ok(!JSON.stringify(poor).includes('never included'));
  for(const id of KIT_ITEMS)assert.equal(itemCosts()[id],ITEMS[id].value);
});
test('equipment ownership survives wielding and features stay bounded at high wealth',()=>{
  const snapshot=economicObservation({silver:1e12,inventory:[{item:ITEMS.club}],equipment:{hand:ITEMS.dagger}});
  assert.equal(snapshot.features[snapshot.labels.indexOf('owns_dagger')],1);
  assert.equal(snapshot.features[snapshot.labels.indexOf('owns_club')],1);
  assert.ok(snapshot.features.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
  assert.throws(()=>economicObservation({silver:NaN,inventory:[],equipment:{}}));
});
