#!/usr/bin/env node
// Build a conservative, evidence-derived SFT corpus from completed sim logs.
// No model is used here: labels are generated only from final telemetry.
import fs from 'node:fs';
import path from 'node:path';

const [input = '/tmp/sep-corpus-check.jsonl', output = 'documentation/sep-data'] = process.argv.slice(2);
const rows = fs.readFileSync(input, 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
const out = [];
for (const row of rows) {
  const gap = row.evidence?.finalGap || '';
  const progress = row.evidence?.progress || '';
  if (!gap || !progress) continue;
  const shortfall = Number(gap.match(/shortfall:(\d+)/)?.[1] || 0);
  const gated = gap.match(/gated:(\d+\/\d+)/)?.[1] || 'unknown';
  const trains = Number(progress.match(/trains (\d+)/)?.[1] || 0);
  const deaths = Number(progress.match(/deaths (\d+)/)?.[1] || 0);
  const circles = Number(progress.match(/circles (\d+)/)?.[1] || 0);
  const blockers = [...gap.matchAll(/\| (.+?) ts:/g)][0]?.[1] || 'see final gap telemetry';
  const watchdogs = row.evidence.watchdogs || [];
  const stalled = watchdogs.some(w => /parked|dead-end|stranded/i.test(w));
  const outcome = circles > 0 ? 'circle milestone observed' : `did not circle; final shortfall ${shortfall}, gated ${gated}`;
  const diagnosis = trains === 0
    ? 'No training actions were recorded; the hall/training path is unproven and the run remained field-EXP limited.'
    : `Training telemetry recorded ${trains} actions; remaining gate evidence is ${blockers}.`;
  out.push({
    kind: 'sim-review', runId: row.runId, variant: row.variant,
    task: 'Review this completed DragonRealms simulation and identify the smallest evidence-backed Kaizen.',
    evidence: row.evidence,
    diagnosis,
    change: trains === 0 ? 'Verify and repair hall handoff/training execution before changing combat policy.' : 'Change only the named final gate owner and preserve the control.',
    outcome: `${outcome}; deaths ${deaths}; watchdog recovery observed: ${stalled ? 'yes' : 'no'}.`,
    quality: 'auto-evidence; human-review-required',
  });
}
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'curated.jsonl'), out.map(x => JSON.stringify(x)).join('\n') + (out.length ? '\n' : ''));
console.log(JSON.stringify({ inputRecords: rows.length, curatedRecords: out.length, output: path.join(output, 'curated.jsonl') }));
