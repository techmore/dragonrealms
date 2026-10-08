// Equipment inspection cannot select verbs which equip, remove or repair gear.
export const INVENTORY_TABS = Object.freeze(['inventory', 'equipment']);
export function inventoryTab(key) { return key === 'equipment' ? key : 'inventory'; }
export function nextInventoryTab(current, key) {
  if (key === 'Home') return 'inventory';
  if (key === 'End') return 'equipment';
  return inventoryTab(current) === 'inventory' ? 'equipment' : 'inventory';
}
