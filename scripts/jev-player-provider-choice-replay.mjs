#!/usr/bin/env node
// Offline counterfactual only: no Jev provider, game connection, or command.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { summarizeProviderGateChoiceRelease } from './lib/jev-provider-gate-choice-release.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {values}=parseArgs({options:{run:{type:'string'},save:{type:'boolean',default:false},help:{type:'boolean',default:false}}});
if(values.help||!values.run){
  console.log('node scripts/jev-player-provider-choice-replay.mjs --run RUN_ID [--save]');
  process.exit(values.help?0:2);
}
const runId=path.basename(values.run);
if(runId!==values.run||!runId.startsWith('jev-player-'))throw new Error('Provide a saved Jev player run ID, not a path.');
const source=path.join(root,'public/live/jev-player',runId,'events.jsonl');
const events=fs.readFileSync(source,'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
const report={schema:'dragonrealms.jev-player-provider-choice-replay/1',runId,
  auditedAt:new Date().toISOString(),sourceFile:`/live/jev-player/${runId}/events.jsonl`,
  ...summarizeProviderGateChoiceRelease(events)};
if(values.save){
  const output=path.join(root,'public/live/jev-player',`provider-choice-replay-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID().slice(0,6)}.json`);
  const temp=`${output}.tmp`;
  fs.writeFileSync(temp,JSON.stringify(report,null,2)+'\n');
  fs.renameSync(temp,output);
  report.report=`/live/jev-player/${path.basename(output)}`;
}
console.log(JSON.stringify(report,null,2));
