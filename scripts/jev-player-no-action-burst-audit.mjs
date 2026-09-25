#!/usr/bin/env node
// Offline/read-only audit of a saved Jev run.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { findJevNoActionBursts } from './lib/jev-no-action-bursts.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {values}=parseArgs({options:{run:{type:'string'},'min-waits':{type:'string',default:'6'},help:{type:'boolean',default:false}}});
if(values.help||!values.run){console.log('node scripts/jev-player-no-action-burst-audit.mjs --run RUN_ID [--min-waits 6]');process.exit(values.help?0:2);}
const runId=path.basename(values.run);if(runId!==values.run||!runId.startsWith('jev-player-'))throw new Error('Provide a Jev player run ID.');
const eventPath=path.join(root,'public/live/jev-player',runId,'events.jsonl');
const events=fs.readFileSync(eventPath,'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
console.log(JSON.stringify({runId,auditedAt:new Date().toISOString(),...findJevNoActionBursts(events,{minWaits:Number(values['min-waits'])})},null,2));
