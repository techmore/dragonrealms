#!/usr/bin/env node
// Sequential natural-speed comparison of health-aware RT ability prefetch.
// Starts only after the V20/V21/V23/V26 queue chain releases Ollama.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compareJevPlayerPair } from './lib/jev-player-comparison.mjs';
import { captureJevPlayerCodeHashes, assessJevQueueCodeIntegrity,
  invalidateJevQueueForIntegrity } from './lib/jev-player-code-hashes.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'public/live/jev-player');
const USABLE_QUEUES=new Set(['finished']);
const USABLE_RUNS=new Set(['complete','incomplete']);
export const PREFETCH_HEALTH_PAIR_QUEUE={
  schema:'dragonrealms.jev-player-queue/1',
  queueId:'jev-player-rt-health-floor-v27-after-v26-20260921',
  prerequisiteQueueIds:[
    'jev-player-control-v20-after-v12-v19-20260921',
    'jev-player-lane-coach-v21-after-v20-20260921',
    'jev-player-qwen8b-pair-after-v21-20260921',
    'jev-player-repeat-choice-release-v26-after-v23-pair-20260921',
  ],
  prerequisiteComparisonIds:[
    'local-qwen3-4b-supervisor-v20-analysis-health-band-natural-240m-physical-20260921',
    'local-qwen3-4b-supervisor-v20-lane-coach-advisory-natural-240m-physical-20260921',
    'local-qwen3-8b-supervisor-v23-control-natural-240m-physical-20260921',
    'local-qwen3-8b-supervisor-v23-lane-coach-advisory-natural-240m-physical-20260921',
    'local-qwen3-4b-supervisor-v26-repeat-choice-release-4-natural-240m-physical-20260921',
  ],
  baselineComparisonId:'local-qwen3-4b-supervisor-v27-prefetch-health-off-natural-240m-physical-20260921',
  candidateComparisonId:'local-qwen3-4b-supervisor-v27-prefetch-health-75-natural-240m-physical-20260921',
  durationMinutes:240,maxWaitMinutes:1440,pollSeconds:15,
  settings:{provider:'local',model:'qwen3:4b',guild:'barbarian',race:'human',
    targetCircle:3,statPolicy:'physical-combat-v1',experienceBoost:1,
    progressionMode:'natural speed',laneCoach:'off',
    rtAbilityPrefetchMinHpFractionPair:[0,0.75]},
};

export function prefetchHealthPairQueueMayLaunch({queueStates={},comparisonStates={}}={}) {
  return PREFETCH_HEALTH_PAIR_QUEUE.prerequisiteQueueIds.every(id=>USABLE_QUEUES.has(queueStates[id]))
    && PREFETCH_HEALTH_PAIR_QUEUE.prerequisiteComparisonIds.every(id=>USABLE_RUNS.has(comparisonStates[id]));
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

async function runCohort(queue,role,comparisonId,minHpFraction) {
  const integrity=assessJevQueueCodeIntegrity({pinnedCodeHashes:queue.sourceHashesAtQueue,
    currentCodeHashes:captureJevPlayerCodeHashes(root)});
  if(!integrity.valid)throw new Error(`JEV_CODE_HASH_DRIFT:${JSON.stringify(integrity)}`);
  if(allManifests().some(row=>row.manifest.comparisonId===comparisonId))
    throw new Error(`${role} comparison already has a manifest; refusing duplicate.`);
  const launchLog=path.join(out,`launch-${PREFETCH_HEALTH_PAIR_QUEUE.queueId}-${role}.log`);
  const env={...process.env,JEV_PLAYER_PROVIDER:'local',JEV_PLAYER_LOCAL_MODEL:'qwen3:4b',
    JEV_PLAYER_GUILD:'barbarian',JEV_PLAYER_TARGET_CIRCLE:'3',JEV_PLAYER_MINUTES:'240',
    JEV_PLAYER_STAT_POLICY:'physical-combat-v1',JEV_PLAYER_TEST_BOOST:'1',
    JEV_PLAYER_COMPARISON_ID:comparisonId,JEV_PLAYER_LANE_COACH:'off',
    JEV_PLAYER_REPEAT_OVERRIDE_RELEASE_AFTER:'0',
    JEV_PLAYER_RT_ABILITY_MIN_HP_FRACTION:String(minHpFraction)};
  const logFd=fs.openSync(launchLog,'a');
  const child=spawn(process.execPath,['scripts/jev-player-world.mjs','240'],
    {cwd:root,env,stdio:['ignore',logFd,logFd]});
  fs.closeSync(logFd);
  queue.currentRole=role;queue.currentComparisonId=comparisonId;
  queue.childPid=child.pid||null;queue.status='launching';
  const runIdField=role==='baseline'?'baselineRunId':'candidateRunId';
  const runStateField=role==='baseline'?'baselineState':'candidateState';
  let childError=null,exited=false,exitCode=null,signal=null;
  child.on('error',error=>{childError=error;});
  child.on('exit',(code,endedBy)=>{exited=true;exitCode=code;signal=endedBy;});
  while(!exited) {
    const run=allManifests().find(row=>row.manifest.comparisonId===comparisonId);
    if(run) {
      queue[runIdField]=run.manifest.runId;queue[runStateField]=run.manifest.status;
      queue.manifest=`/live/jev-player/${run.manifest.runId}/manifest.json`;
      queue.dashboard=run.manifest.dashboard||`/jev-player.html?run=${run.manifest.runId}`;
      if(run.manifest.status==='playing')queue.status='playing';
    }
    if(childError)throw childError;
    queue.lastCheckAt=new Date().toISOString();atomicJson(queue.file,queue);
    await wait(PREFETCH_HEALTH_PAIR_QUEUE.pollSeconds*1000);
  }
  const finalRun=allManifests().find(row=>row.manifest.comparisonId===comparisonId);
  if(!finalRun)throw new Error(`${role} launcher exited without a run manifest (code ${exitCode}).`);
  queue[runIdField]=finalRun.manifest.runId;queue[runStateField]=finalRun.manifest.status;
  queue.lastChildExitCode=exitCode;queue.lastChildSignal=signal;queue.childPid=null;
  queue.lastCheckAt=new Date().toISOString();atomicJson(queue.file,queue);
  if(exitCode!==0)throw new Error(`${role} launcher exited with code ${exitCode}.`);
}

async function main() {
  const queuePath=path.join(out,`${PREFETCH_HEALTH_PAIR_QUEUE.queueId}.json`);
  const launchLog=path.join(out,`launch-${PREFETCH_HEALTH_PAIR_QUEUE.queueId}.log`);
  if(fs.existsSync(queuePath))throw new Error(`Queue record already exists: ${queuePath}`);
  const pairIds=[PREFETCH_HEALTH_PAIR_QUEUE.baselineComparisonId,
    PREFETCH_HEALTH_PAIR_QUEUE.candidateComparisonId];
  if(allManifests().some(row=>pairIds.includes(row.manifest.comparisonId)))
    throw new Error('A V27 health-floor comparison already has a manifest; refusing duplicate queue.');
  const queue={...PREFETCH_HEALTH_PAIR_QUEUE,status:'waiting',queuedAt:new Date().toISOString(),
    queueFile:`/live/jev-player/${path.basename(queuePath)}`,
    launchLog:`/live/jev-player/${path.basename(launchLog)}`,dashboard:'/jev-player.html',
    baselineRunId:null,candidateRunId:null,childPid:null,lastCheckAt:null,
    queueStates:{},comparisonStates:{},sourceHashesAtQueue:captureJevPlayerCodeHashes(root)};
  const save=()=>{queue.lastCheckAt=new Date().toISOString();atomicJson(queuePath,queue);};
  save();
  const startedAt=Date.now();
  const observe=()=>{
    queue.queueStates=Object.fromEntries(PREFETCH_HEALTH_PAIR_QUEUE.prerequisiteQueueIds.map(id=>{
      const file=path.join(out,`${id}.json`);
      if(!fs.existsSync(file))return [id,null];
      try{return [id,JSON.parse(fs.readFileSync(file,'utf8')).status||null];}catch{return [id,null];}
    }));
    const manifests=allManifests();
    queue.comparisonStates=Object.fromEntries(PREFETCH_HEALTH_PAIR_QUEUE.prerequisiteComparisonIds.map(id=>{
      const row=manifests.find(item=>item.manifest.comparisonId===id);
      return [id,row?.manifest.status||null];
    }));
    queue.codeIntegrity=assessJevQueueCodeIntegrity({pinnedCodeHashes:queue.sourceHashesAtQueue,
      currentCodeHashes:captureJevPlayerCodeHashes(root),prerequisiteCodeHashes:
        PREFETCH_HEALTH_PAIR_QUEUE.prerequisiteComparisonIds.flatMap(id=>{
          const row=manifests.find(item=>item.manifest.comparisonId===id);
          return row?[{id,codeHashes:row.manifest.codeHashes}]:[];
        })});
    queue.badPrerequisite=Object.values(queue.queueStates).some(status=>
      status&&!['waiting','launching','playing','finished'].includes(status))
      || Object.values(queue.comparisonStates).some(status=>
        status&&!['starting','playing','complete','incomplete'].includes(status));
    return prefetchHealthPairQueueMayLaunch(queue)&&queue.codeIntegrity.valid&&!queue.badPrerequisite;
  };
  while(Date.now()-startedAt<PREFETCH_HEALTH_PAIR_QUEUE.maxWaitMinutes*60_000) {
    if(observe())break;
    if((queue.codeIntegrity&&!queue.codeIntegrity.valid)||queue.badPrerequisite) {
      const integrity=queue.badPrerequisite&&queue.codeIntegrity.valid
        ? {...queue.codeIntegrity,valid:false,prerequisiteDrift:['upstream-prerequisite-failed']}
        : queue.codeIntegrity;
      invalidateJevQueueForIntegrity(queue,integrity,
        'Upstream comparison failed integrity or runner source hashes drifted.');
      save();return 3;
    }
    save();await wait(PREFETCH_HEALTH_PAIR_QUEUE.pollSeconds*1000);
  }
  if(!observe()) {
    queue.status='expired';queue.finishedAt=new Date().toISOString();save();return 2;
  }
  queue.status='launching';queue.readyAt=new Date().toISOString();save();
  try {
    await runCohort(queue,'baseline',PREFETCH_HEALTH_PAIR_QUEUE.baselineComparisonId,0);
    await runCohort(queue,'candidate',PREFETCH_HEALTH_PAIR_QUEUE.candidateComparisonId,0.75);
    const manifests=allManifests();
    const baseline=manifests.find(row=>row.manifest.comparisonId===PREFETCH_HEALTH_PAIR_QUEUE.baselineComparisonId)?.manifest;
    const candidate=manifests.find(row=>row.manifest.comparisonId===PREFETCH_HEALTH_PAIR_QUEUE.candidateComparisonId)?.manifest;
    const report=compareJevPlayerPair(baseline,candidate,{baselineCoach:'off',candidateCoach:'off',
      expectedPrefetchHealthFloor:0.75});
    const reportPath=path.join(out,`${PREFETCH_HEALTH_PAIR_QUEUE.queueId}-comparison.json`);
    atomicJson(reportPath,report);queue.comparisonReport=`/live/jev-player/${path.basename(reportPath)}`;
    queue.status='finished';queue.finishedAt=new Date().toISOString();save();return 0;
  } catch(error) {
    if(error.message.startsWith('JEV_CODE_HASH_DRIFT:'))
      invalidateJevQueueForIntegrity(queue,JSON.parse(error.message.slice('JEV_CODE_HASH_DRIFT:'.length)),
        'Source hashes changed between paired arms.');
    else {queue.status='failed';queue.error=error.message;queue.finishedAt=new Date().toISOString();}
    save();
    console.error(error.message);return 1;
  }
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main().then(code=>{process.exitCode=code;}).catch(error=>{
    console.error(error.message);process.exitCode=1;
  });
