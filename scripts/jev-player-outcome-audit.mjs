#!/usr/bin/env node
// Read-only analysis of action-to-next-decision skill and gate observations.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { PLAYER_POLICY_VERSION, PLAYER_SUPERVISOR_VERSION } from './lib/jev-player-policy.mjs';
import { summarizeJevPlayerOutcomes } from './lib/jev-player-outcome-audit.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {values}=parseArgs({options:{run:{type:'string'},help:{type:'boolean',default:false}}});
if(values.help){console.log('node scripts/jev-player-outcome-audit.mjs --run RUN_ID');process.exit(0);}
if(!values.run||!/^jev-player-[A-Za-z0-9T._-]+$/.test(values.run))
  throw new Error('Provide a valid Jev-player run ID.');
const runDir=path.join(root,'public/live/jev-player',values.run);
const manifest=JSON.parse(fs.readFileSync(path.join(runDir,'manifest.json'),'utf8'));
const events=fs.readFileSync(path.join(runDir,'events.jsonl'),'utf8').split('\n')
  .filter(Boolean).map(line=>JSON.parse(line));
const summary=summarizeJevPlayerOutcomes(events);
const report={schema:'dragonrealms.jev-player-outcome-audit/1',
  createdAt:new Date().toISOString(),runId:values.run,
  sourceManifest:`/live/jev-player/${values.run}/manifest.json`,
  sourceEvents:`/live/jev-player/${values.run}/events.jsonl`,
  runSupervisorVersion:manifest.supervisorVersion || null,
  currentSupervisorVersion:PLAYER_SUPERVISOR_VERSION,
  currentPolicyVersion:PLAYER_POLICY_VERSION,
  ...summary};
const dir=path.join(root,'public/live/jev-player');
const id=new Date().toISOString().replace(/[:.]/g,'-')+`-${randomUUID().slice(0,6)}`;
const output=path.join(dir,`outcome-audit-${id}.json`);
fs.writeFileSync(`${output}.tmp`,JSON.stringify(report,null,2)+'\n');
fs.renameSync(`${output}.tmp`,output);
console.log(JSON.stringify({runId:values.run,runSupervisorVersion:report.runSupervisorVersion,
  decisions:report.decisionCount,observedOutcomeWindows:report.observedOutcomeWindows,
  byAction:report.byAction,report:output},null,2));
