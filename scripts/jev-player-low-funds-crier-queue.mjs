#!/usr/bin/env node
// Durable, source-pinned queue for the low-funds crier-priority candidate.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { captureJevPlayerCodeHashes, assessJevQueueCodeIntegrity, invalidateJevQueueForIntegrity } from './lib/jev-player-code-hashes.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'), out=path.join(root,'public/live/jev-player');
export const LOW_FUNDS_CRIER_QUEUE={schema:'dragonrealms.jev-player-queue/1',
  queueId:'jev-player-low-funds-crier-v32-after-v31-20260921',
  prerequisiteQueueId:'jev-player-overload-recovery-v31-after-v30-20260921',
  baselineComparisonId:'local-qwen3-4b-supervisor-v28-control-natural-240m-physical-20260921',
  priorComparisonId:'local-qwen3-4b-overload-recovery-v31-natural-240m-physical-20260921',
  comparisonId:'local-qwen3-4b-low-funds-crier-v32-natural-240m-physical-20260921',
  durationMinutes:240,maxWaitMinutes:720,pollSeconds:15,
  settings:{provider:'local',model:'qwen3:4b',guild:'barbarian',race:'human',targetCircle:3,statPolicy:'physical-combat-v1',experienceBoost:1,progressionMode:'natural speed',lowFundsCrier:true}};
const usable=s=>['complete','incomplete'].includes(s);
export function lowFundsCrierQueueMayLaunch({prerequisiteQueueStatus,baselineStatus,priorStatus,activeLocalRuns=[]}={}) {
  return prerequisiteQueueStatus==='finished'&&usable(baselineStatus)&&usable(priorStatus)&&activeLocalRuns.length===0;
}
const atomic=(f,v)=>{const t=`${f}.${process.pid}.tmp`;fs.writeFileSync(t,JSON.stringify(v,null,2)+'\n');fs.renameSync(t,f);};
function runs(){return fs.readdirSync(out,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>path.join(out,e.name,'manifest.json')).filter(fs.existsSync).map(f=>{try{return {file:f,manifest:JSON.parse(fs.readFileSync(f,'utf8'))}}catch{return null}}).filter(Boolean);}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
  const qf=path.join(out,`${LOW_FUNDS_CRIER_QUEUE.queueId}.json`),lf=path.join(out,`launch-${LOW_FUNDS_CRIER_QUEUE.queueId}.log`);
  if(fs.existsSync(qf))throw new Error(`Queue record already exists: ${qf}`);
  const started=Date.now(),q={...LOW_FUNDS_CRIER_QUEUE,status:'waiting',queuedAt:new Date(started).toISOString(),queueFile:`/live/jev-player/${path.basename(qf)}`,launchLog:`/live/jev-player/${path.basename(lf)}`,dashboard:'/jev-player.html',baselineRunId:null,priorRunId:null,candidateRunId:null,childPid:null,activeLocalRuns:[],sourceHashesAtQueue:captureJevPlayerCodeHashes(root)};
  const save=()=>{q.lastCheckAt=new Date().toISOString();atomic(qf,q);};
  const inspect=()=>{const rs=runs(),b=rs.find(x=>x.manifest.comparisonId===q.baselineComparisonId),p=rs.find(x=>x.manifest.comparisonId===q.priorComparisonId);let pre=null;try{pre=JSON.parse(fs.readFileSync(path.join(out,`${q.prerequisiteQueueId}.json`),'utf8'));}catch{};q.baselineRunId=b?.manifest.runId||null;q.baselineStatus=b?.manifest.status||null;q.priorRunId=p?.manifest.runId||null;q.priorStatus=p?.manifest.status||null;q.prerequisiteQueueStatus=pre?.status||null;q.activeLocalRuns=rs.filter(x=>x.manifest.provider==='local'&&['starting','playing'].includes(x.manifest.status)&&![q.baselineComparisonId,q.priorComparisonId].includes(x.manifest.comparisonId)).map(x=>({runId:x.manifest.runId,comparisonId:x.manifest.comparisonId,status:x.manifest.status}));q.codeIntegrity=assessJevQueueCodeIntegrity({pinnedCodeHashes:q.sourceHashesAtQueue,currentCodeHashes:captureJevPlayerCodeHashes(root),prerequisiteCodeHashes:[b,p].filter(Boolean).map(x=>({id:x.manifest.runId,codeHashes:x.manifest.codeHashes}))});return q;};
  save();
  while(Date.now()-started<q.maxWaitMinutes*60000){inspect();if(!q.codeIntegrity.valid){invalidateJevQueueForIntegrity(q,q.codeIntegrity,'Source hashes changed while low-funds candidate waited.');save();return 3;}if(lowFundsCrierQueueMayLaunch({prerequisiteQueueStatus:q.prerequisiteQueueStatus,baselineStatus:q.baselineStatus,priorStatus:q.priorStatus,activeLocalRuns:q.activeLocalRuns}))break;save();await wait(q.pollSeconds*1000);}
  inspect();if(!lowFundsCrierQueueMayLaunch({prerequisiteQueueStatus:q.prerequisiteQueueStatus,baselineStatus:q.baselineStatus,priorStatus:q.priorStatus,activeLocalRuns:q.activeLocalRuns})){q.status='expired';q.finishedAt=new Date().toISOString();save();return 2;}
  q.status='launching';q.readyAt=new Date().toISOString();save();const preload=`--import=${path.join(root,'scripts/jev-player-low-funds-crier-preload.mjs')}`;const env={...process.env,JEV_PLAYER_PROVIDER:'local',JEV_PLAYER_LOCAL_MODEL:'qwen3:4b',JEV_PLAYER_GUILD:'barbarian',JEV_PLAYER_TARGET_CIRCLE:'3',JEV_PLAYER_MINUTES:'240',JEV_PLAYER_STAT_POLICY:'physical-combat-v1',JEV_PLAYER_TEST_BOOST:'1',JEV_PLAYER_COMPARISON_ID:q.comparisonId,JEV_PLAYER_LANE_COACH:'off',NODE_OPTIONS:[process.env.NODE_OPTIONS,preload].filter(Boolean).join(' ')};const fd=fs.openSync(lf,'a');const child=spawn(process.execPath,['scripts/jev-player-world.mjs','240'],{cwd:root,env,stdio:['ignore',fd,fd]});fs.closeSync(fd);q.childPid=child.pid||null;save();let exited=false,code=null,signal=null,err=null;child.on('error',e=>err=e);child.on('exit',(c,s)=>{exited=true;code=c;signal=s;});while(!exited){const r=runs().find(x=>x.manifest.comparisonId===q.comparisonId);if(r){q.candidateRunId=r.manifest.runId;q.candidateStatus=r.manifest.status;q.manifest=`/live/jev-player/${r.manifest.runId}/manifest.json`;q.dashboard=r.manifest.dashboard||q.dashboard;}if(err){q.status='failed';q.error=err.message;save();return 1;}save();await wait(q.pollSeconds*1000);}q.status=code===0?'finished':'failed';q.exitCode=code;q.signal=signal;q.finishedAt=new Date().toISOString();save();return code===0?0:1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().then(c=>process.exitCode=c).catch(e=>{console.error(e.message);process.exitCode=1;});
