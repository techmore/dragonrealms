#!/usr/bin/env node
// Sequential natural-speed lane-coach comparison. Waits for the current
// V12/V19 cohorts and queued V20 control to finish before consuming Ollama.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { captureJevPlayerCodeHashes, assessJevQueueCodeIntegrity,
  invalidateJevQueueForIntegrity } from './lib/jev-player-code-hashes.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'public/live/jev-player');
export const LANE_COACH_QUEUE={
  schema:'dragonrealms.jev-player-queue/1',
  queueId:'jev-player-lane-coach-v29-after-v28-20260921',
  candidateComparisonId:'local-qwen3-4b-supervisor-v29-lane-coach-advisory-natural-240m-physical-20260921',
  baselineComparisonId:'local-qwen3-4b-supervisor-v28-control-natural-240m-physical-20260921',
  blockerRunIds:['jev-player-2026-09-21T12-30-20-797Z-a0984e','jev-player-2026-09-21T13-30-57-871Z-78828f'],
  durationMinutes:240,maxWaitMinutes:720,pollSeconds:15,
  settings:{provider:'local',model:'qwen3:4b',guild:'barbarian',race:'human',
    targetCircle:3,statPolicy:'physical-combat-v1',experienceBoost:1,
    progressionMode:'natural speed',laneCoach:'advisory'},
};

export function queueMayLaunch({blockerStates={},baselineState,baselineSeen=false}) {
  const usable=status=>['complete','incomplete'].includes(status);
  return baselineSeen && usable(baselineState)
    && LANE_COACH_QUEUE.blockerRunIds.every(id=>usable(blockerStates[id]));
}

function atomicJson(file,value) {
  const temporary=`${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary,JSON.stringify(value,null,2)+'\n');
  fs.renameSync(temporary,file);
}

function allManifests() {
  return fs.readdirSync(out,{withFileTypes:true}).filter(entry=>entry.isDirectory())
    .map(entry=>path.join(out,entry.name,'manifest.json')).filter(fs.existsSync)
    .map(file=>{try{return {file,manifest:JSON.parse(fs.readFileSync(file,'utf8'))};}catch{return null;}})
    .filter(Boolean);
}

const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main() {
const queuePath=path.join(out,`${LANE_COACH_QUEUE.queueId}.json`);
const launchLog=path.join(out,`launch-${LANE_COACH_QUEUE.queueId}.log`);
if(fs.existsSync(queuePath))throw new Error(`Queue record already exists: ${queuePath}`);
if(allManifests().some(row=>row.manifest.comparisonId===LANE_COACH_QUEUE.candidateComparisonId))
  throw new Error('The lane-coach comparison already has a run manifest; refusing to duplicate it.');
const startedAt=Date.now();
const queue={...LANE_COACH_QUEUE,status:'waiting',queuedAt:new Date(startedAt).toISOString(),
  queueFile:`/live/jev-player/${path.basename(queuePath)}`,
  launchLog:`/live/jev-player/${path.basename(launchLog)}`,
  dashboard:'/jev-player.html',baselineRunId:null,candidateRunId:null,childPid:null,
  lastCheckAt:null,blockerStates:{},baselineState:null,
  sourceHashesAtQueue:captureJevPlayerCodeHashes(root)};
const save=()=>{queue.lastCheckAt=new Date().toISOString();atomicJson(queuePath,queue);};
save();
const observeReadiness=()=>{
  const manifests=allManifests();
  const blockers=Object.fromEntries(LANE_COACH_QUEUE.blockerRunIds.map(id=>{
    const found=manifests.find(row=>row.manifest.runId===id);
    return [id,found?.manifest.status || null];
  }));
  const baseline=manifests.find(row=>row.manifest.comparisonId===LANE_COACH_QUEUE.baselineComparisonId);
  Object.assign(queue,{blockerStates:blockers,baselineRunId:baseline?.manifest.runId || null,
    baselineSeen:Boolean(baseline),baselineState:baseline?.manifest.status || null});
  const badTerminal=status=>status&&!['starting','playing','complete','incomplete'].includes(status);
  queue.badPrerequisiteStatus=Boolean(baseline&&badTerminal(baseline.manifest.status))
    || Object.values(blockers).some(badTerminal);
  queue.codeIntegrity=assessJevQueueCodeIntegrity({pinnedCodeHashes:queue.sourceHashesAtQueue,
    currentCodeHashes:captureJevPlayerCodeHashes(root),prerequisiteCodeHashes:baseline
      ? [{id:baseline.manifest.runId,codeHashes:baseline.manifest.codeHashes}] : []});
  return queueMayLaunch({blockerStates:blockers,baselineState:queue.baselineState,
    baselineSeen:queue.baselineSeen}) && queue.codeIntegrity.valid;
};
while(Date.now()-startedAt<LANE_COACH_QUEUE.maxWaitMinutes*60_000) {
  if(observeReadiness())break;
  if(queue.codeIntegrity && !queue.codeIntegrity.valid) {
    invalidateJevQueueForIntegrity(queue,queue.codeIntegrity,
      'Source hashes changed or differ from the prerequisite baseline.');
    save();return 3;
  }
  if(queue.badPrerequisiteStatus) {
    invalidateJevQueueForIntegrity(queue,{valid:false,sourceDrift:[],
      prerequisiteDrift:['one-or-more-prerequisite-runs-not-complete-or-incomplete']},
      'A prerequisite run failed or needs attention.');
    save();return 3;
  }
  save();
  await wait(LANE_COACH_QUEUE.pollSeconds*1000);
}

if(!observeReadiness()) {
  queue.status='expired';queue.finishedAt=new Date().toISOString();save();return 2;
}

queue.status='launching';queue.readyAt=new Date().toISOString();save();
const env={...process.env,JEV_PLAYER_PROVIDER:'local',JEV_PLAYER_LOCAL_MODEL:'qwen3:4b',
  JEV_PLAYER_GUILD:'barbarian',JEV_PLAYER_TARGET_CIRCLE:'3',JEV_PLAYER_MINUTES:'240',
  JEV_PLAYER_STAT_POLICY:'physical-combat-v1',JEV_PLAYER_TEST_BOOST:'1',
  JEV_PLAYER_COMPARISON_ID:LANE_COACH_QUEUE.candidateComparisonId,
  JEV_PLAYER_LANE_COACH:'advisory'};
const logFd=fs.openSync(launchLog,'a');
const child=spawn(process.execPath,['scripts/jev-player-world.mjs','240'],
  {cwd:root,env,stdio:['ignore',logFd,logFd]});
fs.closeSync(logFd);
queue.childPid=child.pid || null;save();
let childError=null;
child.on('error',error=>{childError=error;});
let exited=false,exitCode=null,signal=null;
child.on('exit',(code,endedBy)=>{exited=true;exitCode=code;signal=endedBy;});
while(!exited) {
  const candidate=allManifests().find(row=>row.manifest.comparisonId===LANE_COACH_QUEUE.candidateComparisonId);
  if(candidate){queue.candidateRunId=candidate.manifest.runId;queue.candidateState=candidate.manifest.status;
    queue.dashboard=candidate.manifest.dashboard || `/jev-player.html?run=${candidate.manifest.runId}`;
    queue.manifest=`/live/jev-player/${candidate.manifest.runId}/manifest.json`;
    if(candidate.manifest.status==='playing')queue.status='playing';}
  if(childError){queue.status='failed';queue.error=childError.message;save();return 1;}
  save();
  await wait(LANE_COACH_QUEUE.pollSeconds*1000);
}
queue.status=exitCode===0?'finished':'failed';queue.exitCode=exitCode;queue.signal=signal;
queue.finishedAt=new Date().toISOString();save();
process.exitCode=exitCode===0?0:1;
return process.exitCode;
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main().then(code=>{process.exitCode=code;}).catch(error=>{
    console.error(error.message);process.exitCode=1;
  });
