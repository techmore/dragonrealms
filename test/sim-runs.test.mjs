import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSimRuns, validateSimRun } from '../server/sim-runs.js';

test('sim time limits reject invalid values and retain the matched three-worker plan',()=>{
  for(const minutes of [0,121,1.5,'30',null,NaN]) assert.throws(()=>validateSimRun({minutes}));
  const config=validateSimRun({minutes:30,variants:['arbitrary']});
  assert.deepEqual(config.variants,['baseline','edgedSkinCheapKit','edgedSkinGapStudy']);
  assert.equal(config.concurrency,3);
});
test('launcher uses bounded arguments, rejects overlapping starts, and stops only its child',()=>{
  const dir=mkdtempSync(join(tmpdir(),'dr-launch-test-'))+'/';
  const child=new EventEmitter();const signals=[];child.kill=s=>signals.push(s);
  let invocation;
  const runs=createSimRuns({outputDir:dir,busy:()=>false,launch:(...args)=>{invocation=args;return child;}});
  try {
    assert.equal(runs.start({minutes:15},3456).status,'starting');
    assert.ok(invocation[1].includes('15'));
    assert.equal(invocation[2].env.DR_PORT,'3456');
    assert.equal(invocation[2].shell,undefined);
    assert.throws(()=>runs.start({minutes:30},3456),/already running/);
    child.emit('spawn');assert.equal(runs.status().status,'running');
    runs.stop();assert.deepEqual(signals,['SIGTERM']);
    child.emit('exit',0);assert.equal(runs.status().status,'stopped');
    runs.stop();assert.equal(signals.length,1);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test('external sweep blocks launching and failed spawn is recoverable',()=>{
  assert.throws(()=>createSimRuns({busy:()=>true}).start({minutes:30},3000),/already running/);
  const dir=mkdtempSync(join(tmpdir(),'dr-launch-test-'))+'/';
  const child=new EventEmitter();child.kill=()=>{};
  const runs=createSimRuns({outputDir:dir,busy:()=>false,launch:()=>child});
  try {runs.start({minutes:30},3000);child.emit('error',Error('spawn failed'));child.emit('exit',0);
    assert.equal(runs.status().status,'failed');
  } finally {rmSync(dir,{recursive:true,force:true});}
});
