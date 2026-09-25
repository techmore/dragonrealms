import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS } from '../data/items.js';
import { skinnedItemIds, skinnedCreatureName, soldQuantityFromText, visibleCorpseCounts,
  consumedStrongboxFromText } from '../scripts/lib/jev-loot.mjs';

test('skin loot parser matches the trailing comma in ordinary game prose', () => {
  assert.deepEqual(skinnedItemIds(
    'You carefully skin a marsh hog and add  a marsh hog hide, to your pack.', ITEMS),
  ['hog_hide']);
});

test('skin loot parser records each catalog item in a multi-item harvest', () => {
  assert.deepEqual(skinnedItemIds(
    'You carefully skin a kobold and add  a kobold hide, a locked strongbox, to your pack.', ITEMS),
  ['kobold_skin', 'strongbox']);
});

test('skin loot parser ignores unrelated prose and uncatalogued drops', () => {
  assert.deepEqual(skinnedItemIds('You find a sprig of trailmint growing here.', ITEMS), []);
});

test('corpse tracking counts visible bodies and identifies a successful skin', () => {
  assert.deepEqual(visibleCorpseCounts('the corpse of a kobold, the corpse of a marsh hog lie on the ground.'),
    {kobold:1,'marsh hog':1});
  assert.equal(skinnedCreatureName('You carefully skin a marsh hog and add  a marsh hog hide, to your pack.'), 'marsh hog');
  assert.equal(skinnedCreatureName('You fumble the cut and ruin your work on a marsh hog.'), '');
});

test('sale quantity parser tracks the entire batched tanner transaction', () => {
  assert.equal(soldQuantityFromText('You sell 7x a marsh hog hide to Aldric for 84 silvers.'), 7);
  assert.equal(soldQuantityFromText('You sell a kobold hide to Aldric for 10 silvers.'), 1);
  assert.equal(soldQuantityFromText('No one here is interested.'), 0);
});

test('strongbox accounting distinguishes consumed picks from recoverable failures', () => {
  assert.equal(consumedStrongboxFromText('You work the lock and the box springs open, revealing 27 silvers!'),1);
  assert.equal(consumedStrongboxFromText('The lock defies your picks, and the mechanism jams for good.'),1);
  assert.equal(consumedStrongboxFromText('The lock defies your picks — the box survives to try again.'),0);
  assert.equal(consumedStrongboxFromText('You need a locked strongbox.'),0);
});
