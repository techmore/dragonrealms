#!/usr/bin/env node
// Offline audit of whether recorded Jev choices map to open progression lanes.
// It does not call a provider, execute commands, or alter the source run.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { buildLaneCoachContext, recordLaneChoice } from './lib/jev-lane-coach.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {values}=parseArgs({options:{run:{type:'string'},help:{type:'boolean',default:false}}});
if(values.help){console.log('node scripts/jev-lane-coach-replay.mjs --run RUN_ID');process.exit(0);}
if(!values.run||!/^jev-player-[A-Za-z0-9T._-]+$/.test(values.run))
  throw new Error('Provide a valid Jev-player run ID.');
const source=path.join(root,'public/live/jev-player',values.run,'events.jsonl');
const events=fs.readFileSync(source,'utf8').split('\n').filter(Boolean).map(JSON.parse)
  .filter(event=>['local-decision','jev-decision'].includes(event.type)
    &&Array.isArray(event.options)&&event.state&&typeof (event.providerChoice||event.choice)==='string');
let commitment=null,previousLane=null,eligibleChoices=0,unmappedChoices=0,transitions=0;
const rows=[];
for(const event of events){
  const choice=event.providerChoice||event.choice;
  const context=buildLaneCoachContext(event.state,event.options,commitment);
  const selected=recordLaneChoice(context,choice);
  if(selected){
    eligibleChoices++;
    if(previousLane&&previousLane!==selected.skill&&context.commitment?.skill===previousLane)
      transitions++;
    commitment=selected;
    previousLane=selected.skill;
  }else{
    unmappedChoices++;
    if(commitment&&!context.commitment)commitment=null;
  }
  rows.push({ts:event.ts,provider:event.provider||event.type,choice,
    lane:selected?.skill||null,advances:selected?.rows||[],
    activeCommitment:context.commitment?.skill||null,
    changedLane:Boolean(selected&&context.commitment&&selected.skill!==context.commitment.skill)});
}
const report={schema:'dragonrealms.jev-player-lane-coach-replay/1',createdAt:new Date().toISOString(),
  sourceRun:values.run,sourceFile:`/live/jev-player/${values.run}/events.jsonl`,
  scope:'Offline menu audit only; lane guidance was not shown to the provider and no choices were changed.',
  decisions:events.length,eligibleChoices,unmappedChoices,
  gateLaneChoiceRate:events.length?eligibleChoices/events.length:0,
  switchesAwayFromOpenCommitment:transitions,records:rows};
const outputDir=path.join(root,'public/live/jev-player');
const output=path.join(outputDir,`lane-coach-replay-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID().slice(0,6)}.json`);
fs.writeFileSync(`${output}.tmp`,JSON.stringify(report,null,2)+'\n');
fs.renameSync(`${output}.tmp`,output);
console.log(JSON.stringify({sourceRun:values.run,decisions:report.decisions,
  eligibleChoices,unmappedChoices,gateLaneChoiceRate:report.gateLaneChoiceRate,
  switchesAwayFromOpenCommitment:transitions,report:output},null,2));
