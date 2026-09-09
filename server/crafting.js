// Item ownership and work-order completion share a durable transaction.
// Commands handle skill checks, random outcomes, experience, and prose.
import { db } from './db.js';
import { addItem, removeItem } from './player.js';
import { transferInventory } from './inventory-transfer.js';

export function finishCraft(p, verb, recipe, quality = null, success = true) {
  const order = p.workOrder;
  const fillsOrder = success && order && !order.done && order.verb === verb
    && order.recipeId === recipe.id
    && !(order.qualMult && quality != null && quality < order.qualMult);
  const nextOrder = fillsOrder ? { ...order, done: true } : order;
  const nextQuality = success && quality != null
    ? { ...p.forgedQuality, [recipe.item]: quality } : p.forgedQuality;
  transferInventory([p], () => {
    for (const [id, qty] of Object.entries(recipe.ingredients)) removeItem(p, id, qty);
    if (success && !fillsOrder) addItem(p, recipe.item, 1, {
      ...(quality != null ? { quality, condition: 100 } : {}), maker: p.name,
    });
    db.prepare(`UPDATE characters SET persistent_state=json_set(
      persistent_state, '$.workOrder', json(?), '$.forgedQuality', json(?)) WHERE id=?`)
      .run(JSON.stringify(nextOrder || null), JSON.stringify(nextQuality || {}), p.charId);
  });
  // Preserve references held by the active order UI/command callers.
  if (fillsOrder) order.done = true;
  p.workOrder = order;
  p.forgedQuality = nextQuality;
  return fillsOrder ? `You set it aside for ${order.npc}'s order — "order claim" collects your ${order.pay} silvers.` : null;
}

export function claimWorkOrder(p, pay) {
  transferInventory([p], () => {
    p.silver += pay;
    db.prepare("UPDATE characters SET persistent_state=json_set(persistent_state, '$.workOrder', json('null')) WHERE id=?")
      .run(p.charId);
  });
  p.workOrder = null;
}
