// Versioned bounded sensory features, derived only from the owned test player.
import {ITEMS} from '../data/items.js';

export const ECONOMIC_SCHEMA = 'dragonrealms.puffer.economy/1';
export const KIT_ITEMS = Object.freeze(['padded_cloth','shield_wood','dagger','club','broadsword','staff']);
export function itemCosts() {
  return Object.fromEntries(KIT_ITEMS.map(id=>{
    const price=ITEMS[id]?.value;
    if (!Number.isFinite(price) || price<=0) throw new Error('Unknown kit price');
    return [id,price];
  }));
}
export function economicObservation(player) {
  if (!Number.isFinite(player.silver) || player.silver<0 || !Array.isArray(player.inventory)
      || !player.equipment || typeof player.equipment!=='object') throw new Error('Unknown economic state');
  const owned = new Set([...player.inventory.map(i=>i.item?.id),...Object.values(player.equipment).map(i=>i?.id)]);
  const costs = itemCosts();
  const features = [Math.min(1,player.silver/1000),
    ...KIT_ITEMS.map(id=>Number(owned.has(id))),
    ...KIT_ITEMS.map(id=>Math.min(1,player.silver/costs[id]))];
  return {schema:ECONOMIC_SCHEMA, silver:player.silver, features,
    labels:['silver_up_to_1000',...KIT_ITEMS.map(id=>`owns_${id}`),...KIT_ITEMS.map(id=>`affords_${id}`)]};
}
