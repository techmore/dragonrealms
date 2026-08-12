// Commodity pits (clean-room, DR-flavored): prices fluctuate deterministically
// with time; traders buy low and sell high. Holdings are tracked per player
// with their average cost.

export const COMMODITIES = {
  grain: { id: 'grain', name: 'grain', base: 20, volatility: 8, phase: 1.7 },
  wool: { id: 'wool', name: 'wool', base: 32, volatility: 12, phase: 4.2 },
  silk: { id: 'silk', name: 'silk', base: 55, volatility: 18, phase: 2.9 },
  spices: { id: 'spices', name: 'spices', base: 45, volatility: 22, phase: 5.5 },
};

const TWO_PI = Math.PI * 2;

// Deterministic price at the current time: base + sine wave (48-min cycle).
export function commodityPrice(id, now = Date.now()) {
  const c = COMMODITIES[id];
  if (!c) return null;
  const t = now / (48 * 60 * 1000);
  return Math.max(5, Math.round(c.base + Math.sin(TWO_PI * t + c.phase) * c.volatility));
}

export function commodityById(name) {
  const n = String(name || '').toLowerCase();
  return COMMODITIES[n] || null;
}

export function commodityHoldings(p) {
  if (!p.commodities) p.commodities = {};
  return p.commodities;
}
