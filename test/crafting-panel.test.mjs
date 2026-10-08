import test from 'node:test';
import assert from 'node:assert/strict';
import { craftingAvailable, craftingTab } from '../public/js/crafting-panel.js';

test('crafting inspection requires a connected playing session with panel protocol', () => {
  const playing = { value: 'playing', inChargen: false, spectating: false };
  assert.equal(craftingAvailable(playing, 'connected', true), true);
  for (const phase of ['idle','connecting','retrying','read-only']) assert.equal(craftingAvailable(playing, phase, true), false);
  for (const value of ['login','charselect','charcreate','charcreate_playing']) assert.equal(craftingAvailable({...playing,value}, 'connected', true), false);
  assert.equal(craftingAvailable({...playing,inChargen:true}, 'connected', true), false);
  assert.equal(craftingAvailable({...playing,spectating:true}, 'connected', true), false);
  assert.equal(craftingAvailable(playing, 'connected', false), false);
});

test('crafting tabs admit only the two passive inspection commands', () => {
  assert.equal(craftingTab('orders'), 'orders');
  for(const key of ['recipes','order','order cancel','recipes;attack','',null]) assert.equal(craftingTab(key), 'recipes');
});
