// Activity verdicts and leveling outcomes are separate public measurements.
export const ACTIVITY_HEALTH_NOTE = 'Activity health detects stalls; it does not prove target completion or acceptable leveling pace.';
const ACTIVITY_VERDICTS = new Set(['healthy', 'slow', 'stalled', 'wedged']);
export function activityHealthLabel(verdict) {
  return verdict === 'healthy' ? 'active (no stall detected)'
    : ACTIVITY_VERDICTS.has(verdict) ? verdict : 'unknown';
}
export function activityHealthCounts(rows) {
  const counts = { healthy: 0, slow: 0, stalled: 0, wedged: 0, unknown: 0 };
  for (const row of rows) counts[ACTIVITY_VERDICTS.has(row.stallVerdict) ? row.stallVerdict : 'unknown']++;
  return counts;
}
export function observedCircleGain(row) {
  const { startingCircle, circle } = row;
  if (!Number.isSafeInteger(startingCircle) || startingCircle < 1
    || !Number.isSafeInteger(circle) || circle < startingCircle) return null;
  return circle - startingCircle;
}
export function circleProgressBadges(rows) {
  const measured = rows.map(row => ({ row, gain: observedCircleGain(row) }))
    .filter(({ row, gain }) => gain > 0 && Number.isFinite(row.durationMs) && row.durationMs > 0
      && ['healthy', 'slow'].includes(row.stallVerdict));
  const rate = ({ row, gain }) => gain / row.durationMs * 60000;
  const fastest = measured.filter(({ row }) => Number.isSafeInteger(row.targetCircle)
    && row.targetCircle > row.startingCircle && row.circle >= row.targetCircle
    && Number.isFinite(row.timeToCircleMs) && row.timeToCircleMs > 0
    && row.timeToCircleMs <= row.durationMs)
    .sort((a, b) => a.row.timeToCircleMs - b.row.timeToCircleMs)[0] ?? null;
  const volume = [...measured].sort((a, b) => b.gain - a.gain || rate(b) - rate(a))[0] ?? null;
  const efficiency = [...measured].sort((a, b) => rate(b) - rate(a) || b.gain - a.gain)[0] ?? null;
  return { fastest, volume, efficiency, eligibleCount: measured.length };
}
