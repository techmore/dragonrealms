#!/usr/bin/env node
// Deterministic post-run summary. No LLM or live process is required.
import { readFileSync } from 'node:fs';

const file = process.argv[2] || 'public/live/fidelity-summary.jsonl';
const runId = process.argv[3];
const rows = readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)
  .filter((r) => !runId || r.run_id === runId);
if (!rows.length) throw new Error(`no rows found${runId ? ` for ${runId}` : ''}`);
for (const r of rows) {
  const missing = (r.finalRequirements?.missing || []).map((x) => `${x.label} ${x.have}/${x.need}`);
  const zeroRates = (r.expRateSamples || []).filter((x) => x.delta === 0).length;
  console.log(JSON.stringify({
    run: r.run_id, variant: r.variant, circle: r.circle, target: r.targetCircle,
    reached: Boolean(r.completedTarget), kills: r.kills, deaths: r.deaths,
    verdict: r.stallVerdict, shortfall: r.shortfall, closurePerMin: r.closurePerMin,
    zeroExpMinutes: zeroRates, blocker: missing[0] || null, missing,
  }));
}
