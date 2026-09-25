#!/usr/bin/env node
// Summarize long repeated decisions from one saved Jev player event stream.
// This is offline/read-only and never connects to a game or changes policy.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { auditJevDecisionLoops } from './lib/jev-loop-audit.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {values}=parseArgs({options:{
  run:{type:'string'},'min-decisions':{type:'string',default:'10'},
  'min-span-seconds':{type:'string',default:'120'},save:{type:'boolean',default:false},
  help:{type:'boolean',default:false},
}});
if (values.help || !values.run) {
  console.log('node scripts/jev-player-loop-audit.mjs --run RUN_ID [--min-decisions 10] [--min-span-seconds 120] [--save]');
  process.exit(values.help?0:2);
}
const runId=path.basename(values.run);
if (runId!==values.run || !runId.startsWith('jev-player-')) throw new Error('Provide a saved Jev player run ID, not a path.');
const minDecisions=Number(values['min-decisions']),minSpanSeconds=Number(values['min-span-seconds']);
if (!Number.isInteger(minDecisions)||minDecisions<2||!Number.isFinite(minSpanSeconds)||minSpanSeconds<0)
  throw new Error('Audit thresholds must be at least 2 decisions and a nonnegative span.');
const eventPath=path.join(root,'public/live/jev-player',runId,'events.jsonl');
const events=fs.readFileSync(eventPath,'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
const report={runId,auditedAt:new Date().toISOString(),...auditJevDecisionLoops(events,{minDecisions,minSpanSeconds})};
const json=JSON.stringify(report,null,2)+'\n';
if (values.save) {
  const outputPath=path.join(path.dirname(eventPath),'loop-audit.json');
  fs.writeFileSync(outputPath,json);
  console.log(`Saved ${path.relative(root,outputPath)}`);
}
console.log(json);
