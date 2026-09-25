#!/usr/bin/env node
// Offline fixed-menu counterfactual; it never connects to a provider or game.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { replaySafeLaneBudget } from './lib/jev-safe-lane-budget-replay.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {values}=parseArgs({options:{run:{type:'string'},every:{type:'string',default:'4'},save:{type:'boolean',default:false},help:{type:'boolean',default:false}}});
if(values.help||!values.run){
  console.log('node scripts/jev-player-safe-lane-budget-replay.mjs --run RUN_ID [--every 4] [--save]');
  process.exit(values.help?0:2);
}
const runId=path.basename(values.run),every=Number(values.every);
if(runId!==values.run||!runId.startsWith('jev-player-'))throw new Error('Provide a saved Jev player run ID, not a path.');
const source=path.join(root,'public/live/jev-player',runId,'events.jsonl');
const events=fs.readFileSync(source,'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
const report={schema:'dragonrealms.jev-player-safe-lane-budget-replay/1',runId,
  auditedAt:new Date().toISOString(),sourceFile:`/live/jev-player/${runId}/events.jsonl`,
  ...replaySafeLaneBudget(events,{every})};
if(values.save){
  const output=path.join(root,'public/live/jev-player',`safe-lane-budget-replay-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID().slice(0,6)}.json`);
  const temp=`${output}.tmp`;fs.writeFileSync(temp,JSON.stringify(report,null,2)+'\n');fs.renameSync(temp,output);
  report.report=`/live/jev-player/${path.basename(output)}`;
}
console.log(JSON.stringify({...report,records:undefined},null,2));
