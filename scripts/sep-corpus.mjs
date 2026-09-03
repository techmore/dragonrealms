#!/usr/bin/env node
// Read-only starter corpus exporter. It emits one evidence record per completed
// fidelity log; humans add diagnosis/change labels before fine-tuning.
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2] || 'public/live';
const out = process.argv[3] || '-';
const files = fs.readdirSync(dir).filter(f => f.startsWith('fidelity-') && f.endsWith('.log'));
const records = [];
for (const file of files) {
  const text = fs.readFileSync(path.join(dir, file), 'utf8');
  if (!text.includes('[gaps-final]')) continue;
  const header = text.match(/^=== sweep run (\S+) \[(.*?)\] \((.*?) (.*?)\) entered/m);
  const name = file.match(/^fidelity-[^-]+-(.+?)-(gortog|giantman|human|dwarf|elf|gnome|halfling|kaldar|prydaen|rakash|skra)-([a-z0-9]+)-/i);
  const finalGap = text.match(/^\[gaps-final\].*$/m)?.[0] || '';
  const progress = [...text.matchAll(/^\[progress\].*$/gm)].at(-1)?.[0] || '';
  const watchdogs = [...text.matchAll(/^\[watchdog\].*$/gm)].map(m => m[0]).slice(-8);
  records.push({
    kind: 'sim-review', runId: header?.[1] || name?.[3] || 'unknown', variant: header?.[2] || name?.[1] || 'unknown',
    task: 'Explain the completed simulation gate outcome and identify the next falsifiable change.',
    evidence: { file, finalGap, progress, watchdogs },
    diagnosis: '', change: '', outcome: '', quality: 'needs-review',
  });
}
records.sort((a, b) => `${a.runId}/${a.variant}`.localeCompare(`${b.runId}/${b.variant}`));
const body = records.map(r => JSON.stringify(r)).join('\n') + (records.length ? '\n' : '');
if (out === '-') process.stdout.write(body); else fs.writeFileSync(out, body);
console.error(`SEP corpus: ${records.length} completed evidence records`);
