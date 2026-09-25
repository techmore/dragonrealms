#!/usr/bin/env node
// Queue a matched Qwen3:8B control/advisory pair after the active Qwen3:4B
// V20/V21 comparison. Runs are sequential to avoid Ollama contention.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { captureJevPlayerCodeHashes, assessJevQueueCodeIntegrity,
  invalidateJevQueueForIntegrity } from './lib/jev-player-code-hashes.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'public/live/jev-player');
export const QWEN8B_PAIR_QUEUE={
  schema:'dragonrealms.jev-player-queue/1',
  queueId:'jev-player-qwen8b-pair-after-v21-20260921',
  prerequisiteComparisonId:'local-qwen3-4b-supervisor-v20-lane-coach-advisory-natural-240m-physical-20260921',
  blockerRunIds:['jev-player-2026-09-21T12-30-20-797Z-a0984e','jev-player-2026-09-21T13-30-57-871Z-78828f'],
  baselineComparisonId:'local-qwen3-8b-supervisor-v23-control-natural-240m-physical-20260921',
  candidateComparisonId:'local-qwen3-8b-supervisor-v23-lane-coach-advisory-natural-240m-physical-20260921',
  durationMinutes:240,maxWaitMinutes:720,pollSeconds:15,
  settings:{provider:'local',model:'qwen3:8b',guild:'barbarian',race:'human',
    targetCircle:3,statPolicy:'physical-combat-v1',experienceBoost:1,
    progressionMode:'natural speed',laneCoachPair:['off','advisory']},
};

export function qwen8bPairQueueMayLaunch({blockerStates={},prerequisiteSeen=false,
  prerequisiteState=null}={}) {
  const usable=status=>['complete','incomplete'].includes(status);
  return prerequisiteSeen && usable(prerequisiteState)
    && QWEN8B_PAIR_QUEUE.blockerRunIds.every(id=>usable(blockerStates[id]));
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

async function runCohort(queue,role,comparisonId,laneCoach) {
  const codeIntegrity=assessJevQueueCodeIntegrity({pinnedCodeHashes:queue.sourceHashesAtQueue,
    currentCodeHashes:captureJevPlayerCodeHashes(root)});
  if(!codeIntegrity.valid)throw new Error(`JEV_CODE_HASH_DRIFT:${JSON.stringify(codeIntegrity)}`);
  if(allManifests().some(row=>row.manifest.comparisonId===comparisonId))
    throw new Error(`${role} comparison already has a run manifest; refusing duplicate.`);
  const launchLog=path.join(out,`launch-${QWEN8B_PAIR_QUEUE.queueId}-${role}.log`);
  const env={...process.env,JEV_PLAYER_PROVIDER:'local',JEV_PLAYER_LOCAL_MODEL:'qwen3:8b',
    JEV_PLAYER_GUILD:'barbarian',JEV_PLAYER_TARGET_CIRCLE:'3',JEV_PLAYER_MINUTES:'240',
    JEV_PLAYER_STAT_POLICY:'physical-combat-v1',JEV_PLAYER_TEST_BOOST:'1',
    JEV_PLAYER_COMPARISON_ID:comparisonId,JEV_PLAYER_LANE_COACH:laneCoach};
  const logFd=fs.openSync(launchLog,'a');
  const child=spawn(process.execPath,['scripts/jev-player-world.mjs','240'],
    {cwd:root,env,stdio:['ignore',logFd,logFd]});
  fs.closeSync(logFd);
  queue.currentRole=role;queue.currentComparisonId=comparisonId;
  queue.childPid=child.pid || null;queue.status='launching';
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
      queue.dashboard=run.manifest.dashboard || `/jev-player.html?run=${run.manifest.runId}`;
      if(run.manifest.status==='playing')queue.status='playing';
    }
    if(childError)throw childError;
    queue.lastCheckAt=new Date().toISOString();atomicJson(queue.file,queue);
    await wait(QWEN8B_PAIR_QUEUE.pollSeconds*1000);
  }
  const finalRun=allManifests().find(row=>row.manifest.comparisonId===comparisonId);
  if(!finalRun)throw new Error(`${role} launcher exited without a run manifest (code ${exitCode}).`);
  queue[runIdField]=finalRun.manifest.runId;
  queue[runStateField]=finalRun.manifest.status;
  queue.lastChildExitCode=exitCode;queue.lastChildSignal=signal;
  queue.childPid=null;queue.lastCheckAt=new Date().toISOString();
  atomicJson(queue.file,queue);
  if(exitCode!==0)throw new Error(`${role} launcher exited with code ${exitCode}.`);
}

async function main() {
  const queuePath=path.join(out,`${QWEN8B_PAIR_QUEUE.queueId}.json`);
  if(fs.existsSync(queuePath))throw new Error(`Queue record already exists: ${queuePath}`);
  const ids=[QWEN8B_PAIR_QUEUE.prerequisiteComparisonId,
    QWEN8B_PAIR_QUEUE.baselineComparisonId,QWEN8B_PAIR_QUEUE.candidateComparisonId];
  if(allManifests().some(row=>ids.includes(row.manifest.comparisonId)))
    throw new Error('An 8B pair comparison already has a run manifest; refusing duplicate queue.');
  const queue={...QWEN8B_PAIR_QUEUE,status:'waiting',queuedAt:new Date().toISOString(),
    file:queuePath,queueFile:`/live/jev-player/${path.basename(queuePath)}`,
    launchLog:'/live/jev-player/launch-jev-player-qwen8b-pair-after-v21-20260921.log',
    dashboard:'/jev-player.html',baselineRunId:null,candidateRunId:null,
    childPid:null,lastCheckAt:null,blockerStates:{},prerequisiteSeen:false,
    prerequisiteState:null,sourceHashesAtQueue:captureJevPlayerCodeHashes(root)};
  const save=()=>{queue.lastCheckAt=new Date().toISOString();atomicJson(queuePath,queue);};
  save();
  const startedAt=Date.now();
  const observe=()=>{
    const manifests=allManifests();
    queue.blockerStates=Object.fromEntries(QWEN8B_PAIR_QUEUE.blockerRunIds.map(id=>{
      const row=manifests.find(item=>item.manifest.runId===id);
      return [id,row?.manifest.status || null];
    }));
    const prerequisite=manifests.find(row=>
      row.manifest.comparisonId===QWEN8B_PAIR_QUEUE.prerequisiteComparisonId);
    queue.prerequisiteSeen=Boolean(prerequisite);
    queue.prerequisiteRunId=prerequisite?.manifest.runId || null;
    queue.prerequisiteState=prerequisite?.manifest.status || null;
    queue.codeIntegrity=assessJevQueueCodeIntegrity({pinnedCodeHashes:queue.sourceHashesAtQueue,
      currentCodeHashes:captureJevPlayerCodeHashes(root),prerequisiteCodeHashes:prerequisite
        ? [{id:prerequisite.manifest.runId,codeHashes:prerequisite.manifest.codeHashes}] : []});
    queue.badPrerequisite=Object.values(queue.blockerStates).some(status=>
      status&&!['starting','playing','complete','incomplete'].includes(status))
      || Boolean(prerequisite&&!['complete','incomplete','starting','playing'].includes(prerequisite.manifest.status));
    return qwen8bPairQueueMayLaunch(queue)&&queue.codeIntegrity.valid;
  };
  while(Date.now()-startedAt<QWEN8B_PAIR_QUEUE.maxWaitMinutes*60_000) {
    if(observe())break;
    const prerequisite=allManifests().find(row=>
      row.manifest.comparisonId===QWEN8B_PAIR_QUEUE.prerequisiteComparisonId);
    const badPrerequisite=queue.badPrerequisite;
    if((queue.codeIntegrity&&!queue.codeIntegrity.valid)||badPrerequisite) {
      const integrity=badPrerequisite&&queue.codeIntegrity.valid
        ? {...queue.codeIntegrity,valid:false,prerequisiteDrift:['one-or-more-prerequisites-not-usable']}
        : queue.codeIntegrity;
      invalidateJevQueueForIntegrity(queue,integrity,
        badPrerequisite?'Prerequisite cohort did not complete normally.':
          'Source hashes changed or differ from the prerequisite cohort.');
      save();return 3;
    }
    save();await wait(QWEN8B_PAIR_QUEUE.pollSeconds*1000);
  }
  if(!observe()) {
    queue.status='expired';queue.finishedAt=new Date().toISOString();save();return 2;
  }
  queue.status='launching';queue.readyAt=new Date().toISOString();save();
  try {
    await runCohort(queue,'baseline',QWEN8B_PAIR_QUEUE.baselineComparisonId,'off');
    await runCohort(queue,'candidate',QWEN8B_PAIR_QUEUE.candidateComparisonId,'advisory');
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

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main().then(code=>{process.exitCode=code;}).catch(error=>{
    console.error(error.message);process.exitCode=1;
  });
