// Canonical passive view of the order ledger; never assigns or claims work.
import { ROOMS } from '../data/world.js';
import { RECIPES } from '../data/recipes.js';
import { FORGE_RECIPES, ENGINEER_RECIPES, OUTFIT_RECIPES, QUALITY_LADDER } from '../data/forging.js';
import { craftStationVerbs, craftOrderMultiplier } from './crafting-policy.js';
import { recipePlans } from './recipe-reference.js';

export const WORK_ORDER_CATALOGS = {
  forge: { npc: 'Bram', skill: 'forging', recipes: FORGE_RECIPES },
  shape: { npc: 'Bram', skill: 'engineering', recipes: ENGINEER_RECIPES },
  tailor: { npc: 'Mara', skill: 'outfitting', recipes: OUTFIT_RECIPES },
  craft: { npc: 'Fennel', skill: 'alchemy', recipes: RECIPES },
};

export function workOrderSnapshot(p) {
  const order = p.workOrder;
  if (!order) return null;
  const catalog = Object.hasOwn(WORK_ORDER_CATALOGS, order.verb) ? WORK_ORDER_CATALOGS[order.verb] : null;
  const recipe = catalog && Object.hasOwn(catalog.recipes, order.recipeId) ? catalog.recipes[order.recipeId] : null;
  const issues = [];
  if (!catalog) issues.push('The order discipline is unavailable.');
  if (!recipe) issues.push('The order recipe is unavailable.');
  const basePay = Number.isFinite(order.pay) && order.pay >= 0 ? order.pay : null;
  if (basePay === null) issues.push('The order payout is unavailable.');
  const qualityKnown = order.qualMult == null || order.qualMult === 0 || Number.isFinite(order.qualMult) && order.qualMult > 0;
  if (!qualityKnown) issues.push('The quality requirement is unavailable.');
  const multiplier = catalog ? craftOrderMultiplier(p, catalog.skill) : null;
  const computedPay = basePay !== null && multiplier !== null ? Math.round(basePay * multiplier) : NaN;
  const payout = Number.isFinite(computedPay) && computedPay >= 0 ? computedPay : null;
  if (basePay !== null && catalog && payout === null) issues.push('The current payout cannot be calculated.');
  const quality = order.qualMult && qualityKnown ? {
    minMultiplier: order.qualMult,
    label: order.qualName || QUALITY_LADDER.find(entry => entry.mult === order.qualMult)?.name || `quality multiplier ${order.qualMult}`,
  } : { minMultiplier: null, label: qualityKnown ? catalog?.skill === 'alchemy' ? 'any serviceable batch' : 'any successful item' : 'unavailable' };
  const eligibleStations = catalog ? Object.entries(ROOMS).filter(([roomId]) => craftStationVerbs({ room: roomId }).includes(order.verb))
    .map(([roomId, room]) => ({ roomId, name: room.name })) : [];
  return {
    verb: order.verb || null, skill: catalog?.skill || null,
    recipeId: order.recipeId || null, recipeName: recipe?.name || order.recipeId || 'unknown recipe',
    issuer: order.npc || catalog?.npc || 'the task giver',
    done: Boolean(order.done), state: order.done ? 'complete' : 'active',
    supported: issues.length === 0, issues, quality, basePay, payout, multiplier,
    eligibleStations, atEligibleStation: eligibleStations.some(station => station.roomId === p.room),
    recipePlan: recipe ? recipePlans(p, `${catalog.skill} ${order.recipeId}`).entries.find(entry => entry.id === order.recipeId) || null : null,
  };
}

export function formatWorkOrder(p) {
  const order = workOrderSnapshot(p);
  if (!order) return '\nWork orders: no active order. Visit a craft station and type "order" to request work. "recipes" helps plan materials before you begin.';
  const lines = [`\nWork order — ${order.issuer}`, `Status: ${order.done ? 'Complete; reward unclaimed' : 'In progress'}`, `Recipe: ${order.recipeName} [${order.recipeId || 'unavailable'}]`, `Quality: ${order.quality.label}${order.quality.minMultiplier ? ' or better' : ''}.`];
  lines.push(order.basePay === null ? 'Base pay: unavailable.' : `Base pay: ${order.basePay} silvers.`);
  lines.push(order.payout === null ? 'Current payout: unavailable.' : `Current payout: ${order.payout} silvers${order.multiplier !== 1 ? ` (${order.multiplier}× with your learned work-order techniques)` : ''}.`);
  lines.push(order.eligibleStations.length ? `Claim stations: ${order.eligibleStations.map(station => `${station.name} [${station.roomId}]`).join(', ')}${order.atEligibleStation ? ' — you are here' : ''}.`
    : 'No supported claim station is available for this order.');
  lines.push(...order.issues);
  if (order.recipePlan && !order.done) {
    const plan = order.recipePlan;
    lines.push(`Plan: "recipes ${plan.discipline} ${plan.id}" shows required rank, materials and production stations.`);
    lines.push(`Attempt: "${plan.verb} ${plan.id}" at a production station; only output meeting the order's quality fills it.`);
  }
  if (order.done) lines.push('Qualifying output is already set aside for this order; it does not need to be carried in your inventory.');
  if (order.eligibleStations.length && order.supported) lines.push(order.done
    ? 'Use "route order" to find a claim station, then type "order claim" when you choose to collect your pay.'
    : 'Complete a qualifying craft, then use "route order" and "order claim" to collect your pay.');
  lines.push('Reading work orders does not request work, claim pay or abandon the assignment.');
  return lines.join('\n');
}
