#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { summarizeJevPlayerEfficiency } from './lib/jev-player-efficiency-audit.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const runRoot=path.join(root,'public/live/jev-player');

function parseArgs(args) {
  const values={};
  for(let i=0;i<args.length;i++) {
    if(args[i]==='--run') values.runId=args[++i];
    else if(args[i]==='--help') values.help=true;
    else throw new Error(`Unknown argument: ${args[i]}`);
  }
  if(!values.help&&!values.runId) throw new Error('--run RUN_ID is required');
  if(values.runId&&!/^[\w.-]+$/.test(values.runId)) throw new Error('Run ID contains unsupported characters.');
  return values;
}

try {
  const args=parseArgs(process.argv.slice(2));
  if(args.help) {
    console.log('node scripts/jev-player-efficiency-audit.mjs --run RUN_ID');
    process.exit(0);
  }
  const dir=path.join(runRoot,args.runId);
  const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
  const events=fs.readFileSync(path.join(dir,'events.jsonl'),'utf8').split('\n')
    .filter(Boolean).map(line=>JSON.parse(line));
  const report=summarizeJevPlayerEfficiency({manifest,events});
  const id=`${new Date().toISOString().replaceAll(':','-')}-${randomUUID().slice(0,6)}`;
  const output=path.join(dir,`efficiency-audit-${id}.json`);
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({...report,report:path.relative(root,output)},null,2));
} catch(error) {
  console.error(error.message);
  process.exitCode=1;
}
