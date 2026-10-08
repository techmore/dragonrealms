// Gear arithmetic shared by production combat/repair and passive inspection.
export function finiteQuality(value) {
  const quality = Number(value);
  return Number.isFinite(quality) && quality > 0 ? quality : null;
}
export function conditionMult(item) {
  return item ? 0.6 + 0.4 * ((item.condition ?? 100) / 100) : 1;
}
export function qualityMult(item) {
  return finiteQuality(item?.quality) || 1;
}
export function armorContribution(item) {
  return Math.floor(item.armor * conditionMult(item) * qualityMult(item));
}
export function repairCost(item) {
  const missing = 100 - (item.condition ?? 100);
  return Math.max(5, Math.floor(missing * item.value / 100 * 2));
}
