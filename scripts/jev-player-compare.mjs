#!/usr/bin/env node
// Offline paired-run audit. It reads only saved Jev player manifests.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LANE_COACH_QUEUE } from './jev-player-lane-coach-queue.mjs';
import { compareJevPlayerPair } from './lib/jev-player-comparison.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'public/live/jev-player');
const [baselineId=LANE_COACH_QUEUE.baselineComparisonId,
  candidateId=LANE_COACH_QUEUE.candidateComparisonId]=process.argv.slice(2);

function findManifest(comparisonId) {
  const matches=[];
  for (const entry of fs.readdirSync(out,{withFileTypes:true}).filter(row=>row.isDirectory())) {
    const file=path.join(out,entry.name,'manifest.json');
    if (!fs.existsSync(file)) continue;
    try {
      const manifest=JSON.parse(fs.readFileSync(file,'utf8'));
      if (manifest.comparisonId===comparisonId) matches.push(manifest);
    } catch {}
  }
  if (matches.length>1) throw new Error(`Expected one run for ${comparisonId}; found ${matches.length}`);
  return matches[0] || null;
}

const baseline=findManifest(baselineId),candidate=findManifest(candidateId);
const report=compareJevPlayerPair(baseline,candidate);
report.createdAt=new Date().toISOString();
report.comparisonIds={baseline:baselineId,candidate:candidateId};
if (baseline && candidate) {
  const name=`pair-${baseline.runId}-vs-${candidate.runId}.json`;
  report.report=`/live/jev-player/${name}`;
  const file=path.join(out,name),temporary=`${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary,JSON.stringify(report,null,2)+'\n');
  fs.renameSync(temporary,file);
}
console.log(JSON.stringify(report,null,2));
if (report.verdict==='invalid-pair') process.exitCode=2;
