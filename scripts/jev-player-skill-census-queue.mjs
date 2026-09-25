#!/usr/bin/env node
// Wait for the matched V28/V29 local-model comparison to finish, then run one
// otherwise-matched V30 with the optional rank-census observer enabled.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { captureJevPlayerCodeHashes, assessJevQueueCodeIntegrity,
  invalidateJevQueueForIntegrity } from './lib/jev-player-code-hashes.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'public/live/jev-player');
export const SKILL_CENSUS_QUEUE={
  schema:'dragonrealms.jev-player-queue/1',
  queueId:'jev-player-skill-census-v30-after-v29-20260921',
  prerequisiteQueueId:'jev-player-lane-coach-v29-after-v28-20260921',
  baselineComparisonId:'local-qwen3-4b-supervisor-v28-control-natural-240m-physical-20260921',
  priorTreatmentComparisonId:'local-qwen3-4b-supervisor-v29-lane-coach-advisory-natural-240m-physical-20260921',
  comparisonId:'local-qwen3-4b-supervisor-v30-skill-census-natural-240m-physical-20260921',
  durationMinutes:240,maxWaitMinutes:720,pollSeconds:15,
  settings:{provider:'local',model:'qwen3:4b',guild:'barbarian',race:'human',
    targetCircle:3,statPolicy:'physical-combat-v1',experienceBoost:1,
    progressionMode:'natural speed',laneCoach:'off',skillCensus:true},
};

const usable=status=>['complete','incomplete'].includes(status);
export function skillCensusQueueMayLaunch({prerequisiteQueueStatus,baselineStatus,
  priorTreatmentStatus,activeLocalRuns=[]}={}) {
  return prerequisiteQueueStatus==='finished'&&usable(baselineStatus)
    &&usable(priorTreatmentStatus)&&activeLocalRuns.length===0;
}
function atomicJson(file,value) {
  const temporary=`${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary,JSON.stringify(value,null,2)+'\n');
  fs.renameSync(temporary,file);
}
function allRuns() {
  return fs.readdirSync(out,{withFileTypes:true}).filter(entry=>entry.isDirectory())
    .map(entry=>path.join(out,entry.name,'manifest.json')).filter(fs.existsSync)
    .map(file=>{try{return {file,manifest:JSON.parse(fs.readFileSync(file,'utf8'))};}catch{return null;}})
    .filter(Boolean);
}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function main() {
  const queuePath=path.join(out,`${SKILL_CENSUS_QUEUE.queueId}.json`);
  const launchLog=path.join(out,`launch-${SKILL_CENSUS_QUEUE.queueId}.log`);
  if(fs.existsSync(queuePath))throw new Error(`Queue record already exists: ${queuePath}`);
  const startedAt=Date.now();
  const queue={...SKILL_CENSUS_QUEUE,status:'waiting',queuedAt:new Date(startedAt).toISOString(),
    queueFile:`/live/jev-player/${path.basename(queuePath)}`,
    launchLog:`/live/jev-player/${path.basename(launchLog)}`,
    dashboard:'/jev-player.html',baselineRunId:null,priorTreatmentRunId:null,
    candidateRunId:null,childPid:null,lastCheckAt:null,activeLocalRuns:[],
    sourceHashesAtQueue:captureJevPlayerCodeHashes(root)};
  const save=()=>{queue.lastCheckAt=new Date().toISOString();atomicJson(queuePath,queue);};
  const inspect=()=>{
    const runs=allRuns();
    const baseline=runs.find(row=>row.manifest.comparisonId===SKILL_CENSUS_QUEUE.baselineComparisonId);
    const prior=runs.find(row=>row.manifest.comparisonId===SKILL_CENSUS_QUEUE.priorTreatmentComparisonId);
    const prerequisitePath=path.join(out,`${SKILL_CENSUS_QUEUE.prerequisiteQueueId}.json`);
    let prerequisite=null;
    try{prerequisite=JSON.parse(fs.readFileSync(prerequisitePath,'utf8'));}catch{}
    const activeLocalRuns=runs.filter(row=>row.manifest.provider==='local'
      &&['starting','playing'].includes(row.manifest.status)
      &&![SKILL_CENSUS_QUEUE.baselineComparisonId,
        SKILL_CENSUS_QUEUE.priorTreatmentComparisonId].includes(row.manifest.comparisonId))
      .map(row=>({runId:row.manifest.runId,comparisonId:row.manifest.comparisonId,
        model:row.manifest.model,status:row.manifest.status}));
    Object.assign(queue,{baselineRunId:baseline?.manifest.runId||null,
      baselineStatus:baseline?.manifest.status||null,
      priorTreatmentRunId:prior?.manifest.runId||null,
      priorTreatmentStatus:prior?.manifest.status||null,
      prerequisiteQueueStatus:prerequisite?.status||null,activeLocalRuns});
    queue.codeIntegrity=assessJevQueueCodeIntegrity({
      pinnedCodeHashes:queue.sourceHashesAtQueue,
      currentCodeHashes:captureJevPlayerCodeHashes(root),
      prerequisiteCodeHashes:[baseline,prior].filter(Boolean).map(row=>
        ({id:row.manifest.runId,codeHashes:row.manifest.codeHashes})),
    });
    return queue;
  };
  save();
  while(Date.now()-startedAt<SKILL_CENSUS_QUEUE.maxWaitMinutes*60_000) {
    inspect();
    if(!queue.codeIntegrity.valid) {
      invalidateJevQueueForIntegrity(queue,queue.codeIntegrity,
        'Source hashes changed while the census run waited to launch.');
      save();return 3;
    }
    if(skillCensusQueueMayLaunch({prerequisiteQueueStatus:queue.prerequisiteQueueStatus,
      baselineStatus:queue.baselineStatus,priorTreatmentStatus:queue.priorTreatmentStatus,
      activeLocalRuns:queue.activeLocalRuns}))break;
    save();await wait(SKILL_CENSUS_QUEUE.pollSeconds*1000);
  }
  inspect();
  if(!skillCensusQueueMayLaunch({prerequisiteQueueStatus:queue.prerequisiteQueueStatus,
    baselineStatus:queue.baselineStatus,priorTreatmentStatus:queue.priorTreatmentStatus,
    activeLocalRuns:queue.activeLocalRuns})) {
    queue.status='expired';queue.finishedAt=new Date().toISOString();save();return 2;
  }
  if(allRuns().some(row=>row.manifest.comparisonId===SKILL_CENSUS_QUEUE.comparisonId))
    throw new Error('V30 census comparison already has a run; refusing duplicate launch.');
  queue.status='launching';queue.readyAt=new Date().toISOString();save();
  const preload=`--import=${path.join(root,'scripts/jev-player-skill-census-preload.mjs')}`;
  const env={...process.env,JEV_PLAYER_PROVIDER:'local',JEV_PLAYER_LOCAL_MODEL:'qwen3:4b',
    JEV_PLAYER_GUILD:'barbarian',JEV_PLAYER_TARGET_CIRCLE:'3',JEV_PLAYER_MINUTES:'240',
    JEV_PLAYER_STAT_POLICY:'physical-combat-v1',JEV_PLAYER_TEST_BOOST:'1',
    JEV_PLAYER_COMPARISON_ID:SKILL_CENSUS_QUEUE.comparisonId,JEV_PLAYER_LANE_COACH:'off',
    NODE_OPTIONS:[process.env.NODE_OPTIONS,preload].filter(Boolean).join(' ')};
  const logFd=fs.openSync(launchLog,'a');
  const child=spawn(process.execPath,['scripts/jev-player-world.mjs','240'],
    {cwd:root,env,stdio:['ignore',logFd,logFd]});
  fs.closeSync(logFd);queue.childPid=child.pid||null;save();
  let childError=null,exited=false,exitCode=null,signal=null;
  child.on('error',error=>{childError=error;});
  child.on('exit',(code,endedBy)=>{exited=true;exitCode=code;signal=endedBy;});
  while(!exited) {
    const run=allRuns().find(row=>row.manifest.comparisonId===SKILL_CENSUS_QUEUE.comparisonId);
    if(run) {
      queue.candidateRunId=run.manifest.runId;queue.candidateStatus=run.manifest.status;
      queue.manifest=`/live/jev-player/${run.manifest.runId}/manifest.json`;
      queue.dashboard=run.manifest.dashboard||`/jev-player.html?run=${run.manifest.runId}`;
    }
    if(childError){queue.status='failed';queue.error=childError.message;save();return 1;}
    save();await wait(SKILL_CENSUS_QUEUE.pollSeconds*1000);
  }
  const final=allRuns().find(row=>row.manifest.comparisonId===SKILL_CENSUS_QUEUE.comparisonId);
  queue.status=exitCode===0?'finished':'failed';queue.exitCode=exitCode;queue.signal=signal;
  if(final){queue.candidateRunId=final.manifest.runId;queue.candidateStatus=final.manifest.status;}
  queue.finishedAt=new Date().toISOString();save();
  return exitCode===0?0:1;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main().then(code=>{process.exitCode=code;}).catch(error=>{
    console.error(error.message);process.exitCode=1;
  });
