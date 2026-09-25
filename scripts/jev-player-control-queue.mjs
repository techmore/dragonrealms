#!/usr/bin/env node
// Wait for the legacy cohorts to clear before starting the uncoached V20
// control. This keeps its local-model load matched to the sequential V21 run.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { captureJevPlayerCodeHashes, assessJevQueueCodeIntegrity,
  invalidateJevQueueForIntegrity } from './lib/jev-player-code-hashes.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'public/live/jev-player');
export const CONTROL_QUEUE={
  schema:'dragonrealms.jev-player-queue/1',
  queueId:'jev-player-control-v28-after-v12-v19-20260921',
  comparisonId:'local-qwen3-4b-supervisor-v28-control-natural-240m-physical-20260921',
  blockerRunIds:['jev-player-2026-09-21T12-30-20-797Z-a0984e','jev-player-2026-09-21T13-30-57-871Z-78828f'],
  durationMinutes:240,maxWaitMinutes:720,pollSeconds:15,
  settings:{provider:'local',model:'qwen3:4b',guild:'barbarian',race:'human',
    targetCircle:3,statPolicy:'physical-combat-v1',experienceBoost:1,
    progressionMode:'natural speed',laneCoach:'off'},
};

export function controlQueueMayLaunch(blockerStates={}) {
  const usable=status=>['complete','incomplete'].includes(status);
  return CONTROL_QUEUE.blockerRunIds.every(id=>
    usable(blockerStates[id]));
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
  const queuePath=path.join(out,`${CONTROL_QUEUE.queueId}.json`);
  const launchLog=path.join(out,`launch-${CONTROL_QUEUE.queueId}.log`);
  if(fs.existsSync(queuePath))throw new Error(`Queue record already exists: ${queuePath}`);
  if(allManifests().some(row=>row.manifest.comparisonId===CONTROL_QUEUE.comparisonId))
    throw new Error('The V20 control already has a run manifest; refusing to duplicate it.');
  const startedAt=Date.now();
  const queue={...CONTROL_QUEUE,status:'waiting',queuedAt:new Date(startedAt).toISOString(),
    queueFile:`/live/jev-player/${path.basename(queuePath)}`,
    launchLog:`/live/jev-player/${path.basename(launchLog)}`,
    dashboard:'/jev-player.html',runId:null,childPid:null,lastCheckAt:null,blockerStates:{},
    sourceHashesAtQueue:captureJevPlayerCodeHashes(root)};
  const save=()=>{queue.lastCheckAt=new Date().toISOString();atomicJson(queuePath,queue);};
  save();
  const observe=()=>{
    const manifests=allManifests();
    queue.blockerStates=Object.fromEntries(CONTROL_QUEUE.blockerRunIds.map(id=>{
      const row=manifests.find(item=>item.manifest.runId===id);
      return [id,row?.manifest.status || null];
    }));
    queue.codeIntegrity=assessJevQueueCodeIntegrity({pinnedCodeHashes:queue.sourceHashesAtQueue,
      currentCodeHashes:captureJevPlayerCodeHashes(root)});
    queue.badPrerequisiteStatus=Object.values(queue.blockerStates).some(status=>
      status&&!['starting','playing','complete','incomplete'].includes(status));
    return controlQueueMayLaunch(queue.blockerStates)&&queue.codeIntegrity.valid;
  };
  while(Date.now()-startedAt<CONTROL_QUEUE.maxWaitMinutes*60_000) {
    if(observe())break;
    if(queue.codeIntegrity&&!queue.codeIntegrity.valid) {
      invalidateJevQueueForIntegrity(queue,queue.codeIntegrity,
        'Source hashes changed while the control waited to launch.');
      save();return 3;
    }
    if(queue.badPrerequisiteStatus) {
      invalidateJevQueueForIntegrity(queue,{valid:false,sourceDrift:[],
        prerequisiteDrift:['one-or-more-blocker-runs-failed-or-needs-attention']},
        'A blocker run failed or needs attention.');
      save();return 3;
    }
    save();await wait(CONTROL_QUEUE.pollSeconds*1000);
  }
  if(!observe()) {
    queue.status='expired';queue.finishedAt=new Date().toISOString();save();return 2;
  }
  if(allManifests().some(row=>row.manifest.comparisonId===CONTROL_QUEUE.comparisonId))
    throw new Error('V20 manifest appeared while waiting; refusing a duplicate launch.');
  queue.status='launching';queue.readyAt=new Date().toISOString();save();
  const env={...process.env,JEV_PLAYER_PROVIDER:'local',JEV_PLAYER_LOCAL_MODEL:'qwen3:4b',
    JEV_PLAYER_GUILD:'barbarian',JEV_PLAYER_TARGET_CIRCLE:'3',JEV_PLAYER_MINUTES:'240',
    JEV_PLAYER_STAT_POLICY:'physical-combat-v1',JEV_PLAYER_TEST_BOOST:'1',
    JEV_PLAYER_COMPARISON_ID:CONTROL_QUEUE.comparisonId,JEV_PLAYER_LANE_COACH:'off'};
  const logFd=fs.openSync(launchLog,'a');
  const child=spawn(process.execPath,['scripts/jev-player-world.mjs','240'],
    {cwd:root,env,stdio:['ignore',logFd,logFd]});
  fs.closeSync(logFd);
  queue.childPid=child.pid || null;save();
  let childError=null,exited=false,exitCode=null,signal=null;
  child.on('error',error=>{childError=error;});
  child.on('exit',(code,endedBy)=>{exited=true;exitCode=code;signal=endedBy;});
  while(!exited) {
    const run=allManifests().find(row=>row.manifest.comparisonId===CONTROL_QUEUE.comparisonId);
    if(run) {
      queue.runId=run.manifest.runId;queue.runState=run.manifest.status;
      queue.dashboard=run.manifest.dashboard || `/jev-player.html?run=${run.manifest.runId}`;
      queue.manifest=`/live/jev-player/${run.manifest.runId}/manifest.json`;
      if(run.manifest.status==='playing')queue.status='playing';
    }
    if(childError){queue.status='failed';queue.error=childError.message;save();return 1;}
    save();await wait(CONTROL_QUEUE.pollSeconds*1000);
  }
  queue.status=exitCode===0?'finished':'failed';queue.exitCode=exitCode;
  queue.signal=signal;queue.finishedAt=new Date().toISOString();save();
  process.exitCode=exitCode===0?0:1;
  return process.exitCode;
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main().then(code=>{process.exitCode=code;}).catch(error=>{
    console.error(error.message);process.exitCode=1;
  });
