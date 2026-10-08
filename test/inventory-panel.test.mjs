import test from 'node:test';
import assert from 'node:assert/strict';
import { INVENTORY_TABS, inventoryTab, nextInventoryTab } from '../public/js/inventory-panel.js';

test('inventory tabs admit only passive inventory and equipment inspections', () => {
  assert.deepEqual(INVENTORY_TABS,['inventory','equipment']);
  assert.equal(Object.isFrozen(INVENTORY_TABS),true);
  assert.equal(inventoryTab('equipment'),'equipment');
  for(const key of ['inventory','equip','repair all','remove armor','equipment;repair',null]) assert.equal(inventoryTab(key),'inventory');
});

test('inventory tabs navigate with either arrow, Home and End', () => {
  for(const key of ['ArrowLeft','ArrowRight']) {
    assert.equal(nextInventoryTab('inventory',key),'equipment');
    assert.equal(nextInventoryTab('equipment',key),'inventory');
  }
  assert.equal(nextInventoryTab('equipment','Home'),'inventory');
  assert.equal(nextInventoryTab('inventory','End'),'equipment');
});
