#!/usr/bin/env node
// Reconcile Jev player manifests after crashes; dry-run unless --apply is set.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assessJevRunManifest, reconcileJevRunManifest } from './lib/jev-run-reconcile.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const runRoot=path.join(root,'public/live/jev-player');

function pidIsJevPlayer(pid) {
  try { process.kill(pid,0); } catch(error) {
    if (error?.code==='ESRCH') return false;
    if (error?.code==='EPERM') return true;
    return null;
  }
  const result=spawnSync('ps',['-p',String(pid),'-o','command='],{encoding:'utf8'});
  if (result.error || result.status!==0) return null;
  const command=result.stdout.trim();
  if (!command) return false;
  return /(?:^|\/)scripts\/jev-player\.mjs(?:\s|$)/.test(command);
}

function atomicJson(file,value) {
  const temporary=`${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary,JSON.stringify(value,null,2)+'\n');
  fs.renameSync(temporary,file);
}

function parseArgs(args) {
  const result={apply:false,runId:null,heartbeatGraceSeconds:60};
  for(let i=0;i<args.length;i++) {
    if(args[i]==='--apply') result.apply=true;
    else if(args[i]==='--run') result.runId=args[++i] || null;
    else if(args[i]==='--heartbeat-grace-seconds') result.heartbeatGraceSeconds=Number(args[++i]);
    else if(args[i]==='--help') result.help=true;
    else throw new Error(`Unknown argument: ${args[i]}`);
  }
  if (!Number.isFinite(result.heartbeatGraceSeconds)||result.heartbeatGraceSeconds<1)
    throw new Error('--heartbeat-grace-seconds must be a positive number');
  return result;
}

function manifestsFor(runId) {
  if(runId) {
    if(!/^[\w.-]+$/.test(runId)) throw new Error('Run ID contains unsupported characters.');
    const file=path.join(runRoot,runId,'manifest.json');
    return fs.existsSync(file)?[file]:[];
  }
  return fs.readdirSync(runRoot,{withFileTypes:true})
    .filter(entry=>entry.isDirectory())
    .map(entry=>path.join(runRoot,entry.name,'manifest.json'))
    .filter(fs.existsSync);
}

function main() {
  const args=parseArgs(process.argv.slice(2));
  if(args.help) {
    console.log('node scripts/jev-player-reconcile.mjs [--run RUN_ID] [--heartbeat-grace-seconds N] [--apply]');
    console.log('Dry-run by default. --apply marks only confirmed dead player processes with stale live manifests as failed.');
    return;
  }
  const files=manifestsFor(args.runId);
  const findings=[];
  for(const file of files) {
    let manifest;
    try { manifest=JSON.parse(fs.readFileSync(file,'utf8')); }
    catch { findings.push({file:path.relative(root,file),action:'attention',reason:'invalid-json'});continue; }
    const assessment=assessJevRunManifest(manifest,{
      heartbeatGraceMs:args.heartbeatGraceSeconds*1000,isPidRunning:pidIsJevPlayer,
    });
    if(assessment.action==='skip'||assessment.action==='healthy') continue;
    const finding={runId:manifest.runId || path.basename(path.dirname(file)),...assessment,
      applied:false};
    if(args.apply&&assessment.action==='mark-failed') {
      const reconciledAt=new Date().toISOString();
      atomicJson(file,reconcileJevRunManifest(manifest,assessment,reconciledAt));
      finding.applied=true;
    }
    findings.push(finding);
  }
  console.log(JSON.stringify({mode:args.apply?'apply':'dry-run',scanned:files.length,
    findings},null,2));
}

try { main(); }
catch(error) { console.error(error.message); process.exitCode=1; }
