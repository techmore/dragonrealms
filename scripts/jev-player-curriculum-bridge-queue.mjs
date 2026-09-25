#!/usr/bin/env node
// Run the independent Puffer-informed curriculum bridge after the current
// Jev comparison. The queue is durable and source-pinned; native DR remains
// outside the candidate.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { captureJevPlayerCodeHashes, assessJevQueueCodeIntegrity,
  invalidateJevQueueForIntegrity } from './lib/jev-player-code-hashes.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'public/live/jev-player');
const curriculumBridgeHash=()=>{
  const files=['scripts/jev-player-curriculum-bridge-preload.mjs',
    'scripts/jev-player-curriculum-bridge-loader.mjs','scripts/lib/jev-curriculum-bridge.mjs'];
  const hash=createHash('sha256');
  for(const file of files) hash.update(file).update('\0').update(fs.readFileSync(path.join(root,file)));
  return hash.digest('hex');
};
export const CURRICULUM_BRIDGE_QUEUE={
  schema:'dragonrealms.jev-player-queue/1',
  queueId:'jev-player-curriculum-bridge-v39-after-v29-20260921',
  prerequisiteComparisonId:'local-qwen3-4b-supervisor-v29-lane-coach-advisory-natural-240m-physical-20260921',
  baselineComparisonId:'local-qwen3-4b-supervisor-v28-control-natural-240m-physical-20260921',
  comparisonId:'local-qwen3-4b-curriculum-bridge-v39-natural-240m-physical-20260921',
  durationMinutes:240,maxWaitMinutes:720,pollSeconds:15,
  settings:{provider:'local',model:'qwen3:4b',guild:'barbarian',race:'human',
    targetCircle:3,statPolicy:'physical-combat-v1',experienceBoost:1,
    progressionMode:'natural speed',laneCoach:'advisory',curriculumBridge:true},
};
const usable=status=>['complete','incomplete'].includes(status);
export function curriculumBridgeQueueMayLaunch({prerequisiteStatus,baselineStatus,
  activeLocalRuns=[]}={}) {
  return usable(prerequisiteStatus)&&usable(baselineStatus)&&activeLocalRuns.length===0;
}
function atomicJson(file,value) { const temporary=`${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary,JSON.stringify(value,null,2)+'\n'); fs.renameSync(temporary,file); }
function allRuns() { return fs.readdirSync(out,{withFileTypes:true}).filter(entry=>entry.isDirectory())
  .map(entry=>path.join(out,entry.name,'manifest.json')).filter(fs.existsSync)
  .map(file=>{try{return {file,manifest:JSON.parse(fs.readFileSync(file,'utf8'))};}catch{return null;}}).filter(Boolean); }
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function main() {
  const queuePath=path.join(out,`${CURRICULUM_BRIDGE_QUEUE.queueId}.json`);
  const launchLog=path.join(out,`launch-${CURRICULUM_BRIDGE_QUEUE.queueId}.log`);
  if(fs.existsSync(queuePath)) throw new Error(`Queue record already exists: ${queuePath}`);
  const queue={...CURRICULUM_BRIDGE_QUEUE,status:'waiting',queuedAt:new Date().toISOString(),
    queueFile:`/live/jev-player/${path.basename(queuePath)}`,launchLog:`/live/jev-player/${path.basename(launchLog)}`,
    dashboard:'/jev-player.html',baselineRunId:null,prerequisiteRunId:null,candidateRunId:null,
    childPid:null,lastCheckAt:null,activeLocalRuns:[],sourceHashesAtQueue:captureJevPlayerCodeHashes(root),
    curriculumBridgeHashAtQueue:curriculumBridgeHash()};
  const save=()=>{queue.lastCheckAt=new Date().toISOString();atomicJson(queuePath,queue);};
  const inspect=()=>{
    const runs=allRuns();
    const prerequisite=runs.find(row=>row.manifest.comparisonId===CURRICULUM_BRIDGE_QUEUE.prerequisiteComparisonId);
    const baseline=runs.find(row=>row.manifest.comparisonId===CURRICULUM_BRIDGE_QUEUE.baselineComparisonId);
    const activeLocalRuns=runs.filter(row=>row.manifest.provider==='local'
      &&['starting','playing'].includes(row.manifest.status)
      &&![CURRICULUM_BRIDGE_QUEUE.prerequisiteComparisonId,CURRICULUM_BRIDGE_QUEUE.baselineComparisonId]
        .includes(row.manifest.comparisonId))
      .map(row=>({runId:row.manifest.runId,comparisonId:row.manifest.comparisonId,model:row.manifest.model,status:row.manifest.status}));
    Object.assign(queue,{prerequisiteRunId:prerequisite?.manifest.runId||null,
      prerequisiteStatus:prerequisite?.manifest.status||null,baselineRunId:baseline?.manifest.runId||null,
      baselineStatus:baseline?.manifest.status||null,activeLocalRuns});
    const coreIntegrity=assessJevQueueCodeIntegrity({pinnedCodeHashes:queue.sourceHashesAtQueue,
      currentCodeHashes:captureJevPlayerCodeHashes(root),prerequisiteCodeHashes:[prerequisite,baseline]
        .filter(Boolean).map(row=>({id:row.manifest.runId,codeHashes:row.manifest.codeHashes}))});
    const bridgeDrift=queue.curriculumBridgeHashAtQueue!==curriculumBridgeHash();
    queue.codeIntegrity={valid:coreIntegrity.valid&&!bridgeDrift,
      sourceDrift:bridgeDrift?[...coreIntegrity.sourceDrift,'curriculumBridge']:coreIntegrity.sourceDrift,
      prerequisiteDrift:coreIntegrity.prerequisiteDrift};
    return queue;
  };
  save();
  while(Date.now()-Date.parse(queue.queuedAt)<CURRICULUM_BRIDGE_QUEUE.maxWaitMinutes*60_000) {
    inspect();
    if(!queue.codeIntegrity.valid) { invalidateJevQueueForIntegrity(queue,queue.codeIntegrity,
      'Source hashes changed while the curriculum bridge waited to launch.'); save(); return 3; }
    if(curriculumBridgeQueueMayLaunch({prerequisiteStatus:queue.prerequisiteStatus,
      baselineStatus:queue.baselineStatus,activeLocalRuns:queue.activeLocalRuns})) break;
    save(); await wait(CURRICULUM_BRIDGE_QUEUE.pollSeconds*1000);
  }
  inspect();
  if(!curriculumBridgeQueueMayLaunch({prerequisiteStatus:queue.prerequisiteStatus,
    baselineStatus:queue.baselineStatus,activeLocalRuns:queue.activeLocalRuns})) {
    queue.status='expired';queue.finishedAt=new Date().toISOString();save();return 2;
  }
  if(allRuns().some(row=>row.manifest.comparisonId===CURRICULUM_BRIDGE_QUEUE.comparisonId))
    throw new Error('The curriculum bridge comparison already has a run; refusing duplicate launch.');
  queue.status='launching';queue.readyAt=new Date().toISOString();save();
  const env={...process.env,JEV_PLAYER_PROVIDER:'local',JEV_PLAYER_LOCAL_MODEL:'qwen3:4b',
    JEV_PLAYER_GUILD:'barbarian',JEV_PLAYER_TARGET_CIRCLE:'3',JEV_PLAYER_MINUTES:'240',
    JEV_PLAYER_STAT_POLICY:'physical-combat-v1',JEV_PLAYER_TEST_BOOST:'1',
    JEV_PLAYER_COMPARISON_ID:CURRICULUM_BRIDGE_QUEUE.comparisonId,JEV_PLAYER_LANE_COACH:'advisory',
    NODE_OPTIONS:[process.env.NODE_OPTIONS,`--import=${path.join(root,'scripts/jev-player-curriculum-bridge-preload.mjs')}`]
      .filter(Boolean).join(' ')};
  const logFd=fs.openSync(launchLog,'a');
  const child=spawn(process.execPath,['scripts/jev-player-world.mjs','240'],{cwd:root,env,stdio:['ignore',logFd,logFd]});
  fs.closeSync(logFd);queue.childPid=child.pid||null;save();
  let exited=false,exitCode=null,signal=null,childError=null;
  child.on('error',error=>{childError=error;}); child.on('exit',(code,endedBy)=>{exited=true;exitCode=code;signal=endedBy;});
  while(!exited) {
    const candidate=allRuns().find(row=>row.manifest.comparisonId===CURRICULUM_BRIDGE_QUEUE.comparisonId);
    if(candidate){queue.candidateRunId=candidate.manifest.runId;queue.candidateStatus=candidate.manifest.status;
      queue.manifest=`/live/jev-player/${candidate.manifest.runId}/manifest.json`;
      queue.dashboard=candidate.manifest.dashboard||`/jev-player.html?run=${candidate.manifest.runId}`;
      if(candidate.manifest.status==='playing')queue.status='playing';}
    if(childError){queue.status='failed';queue.error=childError.message;save();return 1;}
    save();await wait(CURRICULUM_BRIDGE_QUEUE.pollSeconds*1000);
  }
  const final=allRuns().find(row=>row.manifest.comparisonId===CURRICULUM_BRIDGE_QUEUE.comparisonId);
  queue.status=exitCode===0?'finished':'failed';queue.exitCode=exitCode;queue.signal=signal;
  if(final){queue.candidateRunId=final.manifest.runId;queue.candidateStatus=final.manifest.status;}
  queue.finishedAt=new Date().toISOString();save();return exitCode===0?0:1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main().then(code=>{process.exitCode=code;}).catch(error=>{console.error(error.message);process.exitCode=1;});
