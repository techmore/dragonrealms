// Shared helpers for race-guild-sweep.mjs's report renderers (--report,
// --by-variant, --lab, --leaderboard, buildLeaderboard). Extracted from
// near-identical copies that had drifted between renderers.
export function pad(s, n) { return String(s).padEnd(n); }

export const fmtMin = (ms) => (ms == null ? '-' : (ms / 60000).toFixed(1) + 'm');

export const fmtMs = (ms) => ms == null ? '-' :
  `${Math.floor(ms / 60000)}:${String(Math.round(ms / 1000) % 60).padStart(2, '0')}`;

export function median(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}
