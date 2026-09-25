#!/usr/bin/env node
// Sequential natural-speed test of the opt-in repeated-choice autonomy guard.
// It waits for the existing 4B and 8B comparisons to finish before using Ollama.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { captureJevPlayerCodeHashes, assessJevQueueCodeIntegrity,
  invalidateJevQueueForIntegrity } from './lib/jev-player-code-hashes.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'public/live/jev-player');
export const OVERRIDE_RELEASE_QUEUE={
  schema:'dragonrealms.jev-player-queue/1',
  queueId:'jev-player-repeat-choice-release-v26-after-v23-pair-20260921',
  prerequisiteQueueIds:[
    'jev-player-control-v20-after-v12-v19-20260921',
    'jev-player-lane-coach-v21-after-v20-20260921',
    'jev-player-qwen8b-pair-after-v21-20260921',
  ],
  prerequisiteComparisonIds:[
    'local-qwen3-4b-supervisor-v20-analysis-health-band-natural-240m-physical-20260921',
    'local-qwen3-4b-supervisor-v20-lane-coach-advisory-natural-240m-physical-20260921',
    'local-qwen3-8b-supervisor-v23-control-natural-240m-physical-20260921',
    'local-qwen3-8b-supervisor-v23-lane-coach-advisory-natural-240m-physical-20260921',
  ],
  comparisonId:'local-qwen3-4b-supervisor-v26-repeat-choice-release-4-natural-240m-physical-20260921',
  durationMinutes:240,maxWaitMinutes:1440,pollSeconds:15,
  settings:{provider:'local',model:'qwen3:4b',guild:'barbarian',race:'human',
    targetCircle:3,statPolicy:'physical-combat-v1',experienceBoost:1,
    progressionMode:'natural speed',laneCoach:'off',repeatedOverrideReleaseAfter:4},
};

export function overrideReleaseQueueMayLaunch({queueStates={},comparisonStates={}}={}) {
  return OVERRIDE_RELEASE_QUEUE.prerequisiteQueueIds.every(id=>queueStates[id]==='finished')
    && OVERRIDE_RELEASE_QUEUE.prerequisiteComparisonIds.every(id=>comparisonStates[id]
      && !['starting','playing'].includes(comparisonStates[id]));
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
  const queuePath=path.join(out,`${OVERRIDE_RELEASE_QUEUE.queueId}.json`);
  const launchLog=path.join(out,`launch-${OVERRIDE_RELEASE_QUEUE.queueId}.log`);
  if(fs.existsSync(queuePath))throw new Error(`Queue record already exists: ${queuePath}`);
  if(allManifests().some(row=>row.manifest.comparisonId===OVERRIDE_RELEASE_QUEUE.comparisonId))
    throw new Error('The repeated-choice-release comparison already has a run manifest; refusing duplicate.');
  const startedAt=Date.now();
  const queue={...OVERRIDE_RELEASE_QUEUE,status:'waiting',queuedAt:new Date(startedAt).toISOString(),
    queueFile:`/live/jev-player/${path.basename(queuePath)}`,
    launchLog:`/live/jev-player/${path.basename(launchLog)}`,
    dashboard:'/jev-player.html',runId:null,childPid:null,manifest:null,
    lastCheckAt:null,queueStates:{},comparisonStates:{},
    sourceHashesAtQueue:captureJevPlayerCodeHashes(root)};
  const save=()=>{queue.lastCheckAt=new Date().toISOString();atomicJson(queuePath,queue);};
  const observeReadiness=()=>{
    queue.queueStates=Object.fromEntries(OVERRIDE_RELEASE_QUEUE.prerequisiteQueueIds.map(id=>{
      const file=path.join(out,`${id}.json`);
      if(!fs.existsSync(file))return [id,null];
      try{return [id,JSON.parse(fs.readFileSync(file,'utf8')).status || null];}
      catch{return [id,null];}
    }));
    const manifests=allManifests();
    queue.comparisonStates=Object.fromEntries(OVERRIDE_RELEASE_QUEUE.prerequisiteComparisonIds.map(id=>{
      const row=manifests.find(item=>item.manifest.comparisonId===id);
      return [id,row?.manifest.status || null];
    }));
    queue.codeIntegrity=assessJevQueueCodeIntegrity({pinnedCodeHashes:queue.sourceHashesAtQueue,
      currentCodeHashes:captureJevPlayerCodeHashes(root),prerequisiteCodeHashes:
        OVERRIDE_RELEASE_QUEUE.prerequisiteComparisonIds.flatMap(id=>{
          const row=manifests.find(item=>item.manifest.comparisonId===id);
          return row?[{id,codeHashes:row.manifest.codeHashes}]:[];
        })});
    queue.badPrerequisite=Object.values(queue.queueStates).some(status=>
      status&&!['waiting','launching','playing','finished'].includes(status))
      || Object.values(queue.comparisonStates).some(status=>
        status&&!['starting','playing','complete','incomplete'].includes(status));
    return overrideReleaseQueueMayLaunch(queue)&&queue.codeIntegrity.valid&&!queue.badPrerequisite;
  };
  while(Date.now()-startedAt<OVERRIDE_RELEASE_QUEUE.maxWaitMinutes*60_000) {
    if(observeReadiness())break;
    if((queue.codeIntegrity&&!queue.codeIntegrity.valid)||queue.badPrerequisite) {
      const integrity=queue.badPrerequisite&&queue.codeIntegrity.valid
        ? {...queue.codeIntegrity,valid:false,prerequisiteDrift:['upstream-prerequisite-failed']}
        : queue.codeIntegrity;
      invalidateJevQueueForIntegrity(queue,integrity,
        'Upstream comparison failed integrity or runner source hashes drifted.');
      save();return 3;
    }
    save();await wait(OVERRIDE_RELEASE_QUEUE.pollSeconds*1000);
  }
  if(!observeReadiness()) {
    queue.status='expired';queue.finishedAt=new Date().toISOString();save();return 2;
  }

  queue.status='launching';queue.readyAt=new Date().toISOString();save();
  const env={...process.env,JEV_PLAYER_PROVIDER:'local',JEV_PLAYER_LOCAL_MODEL:'qwen3:4b',
    JEV_PLAYER_GUILD:'barbarian',JEV_PLAYER_TARGET_CIRCLE:'3',JEV_PLAYER_MINUTES:'240',
    JEV_PLAYER_STAT_POLICY:'physical-combat-v1',JEV_PLAYER_TEST_BOOST:'1',
    JEV_PLAYER_COMPARISON_ID:OVERRIDE_RELEASE_QUEUE.comparisonId,
    JEV_PLAYER_LANE_COACH:'off',JEV_PLAYER_REPEAT_OVERRIDE_RELEASE_AFTER:'4'};
  const logFd=fs.openSync(launchLog,'a');
  const child=spawn(process.execPath,['scripts/jev-player-world.mjs','240'],
    {cwd:root,env,stdio:['ignore',logFd,logFd]});
  fs.closeSync(logFd);
  queue.childPid=child.pid || null;save();
  let childError=null,exited=false,exitCode=null,signal=null;
  child.on('error',error=>{childError=error;});
  child.on('exit',(code,endedBy)=>{exited=true;exitCode=code;signal=endedBy;});
  while(!exited) {
    const run=allManifests().find(row=>row.manifest.comparisonId===OVERRIDE_RELEASE_QUEUE.comparisonId);
    if(run) {
      queue.runId=run.manifest.runId;queue.runState=run.manifest.status;
      queue.dashboard=run.manifest.dashboard || `/jev-player.html?run=${run.manifest.runId}`;
      queue.manifest=`/live/jev-player/${run.manifest.runId}/manifest.json`;
      if(run.manifest.status==='playing')queue.status='playing';
    }
    if(childError){queue.status='failed';queue.error=childError.message;save();return 1;}
    save();await wait(OVERRIDE_RELEASE_QUEUE.pollSeconds*1000);
  }
  const finalRun=allManifests().find(row=>row.manifest.comparisonId===OVERRIDE_RELEASE_QUEUE.comparisonId);
  if(!finalRun)throw new Error('Candidate launcher exited without a run manifest.');
  queue.runId=finalRun.manifest.runId;queue.runState=finalRun.manifest.status;
  queue.exitCode=exitCode;queue.signal=signal;queue.childPid=null;
  queue.status=exitCode===0?'finished':'failed';queue.finishedAt=new Date().toISOString();save();
  return exitCode===0?0:1;
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main().then(code=>{process.exitCode=code;}).catch(error=>{
    console.error(error.message);process.exitCode=1;
  });
