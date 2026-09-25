import test from 'node:test';
import assert from 'node:assert/strict';
import { assessJevRunManifest, reconcileJevRunManifest } from '../scripts/lib/jev-run-reconcile.mjs';

const nowMs=Date.parse('2026-09-21T20:00:00.000Z');
const manifest=overrides=>({status:'playing',pid:1234,
  updatedAt:'2026-09-21T19:58:00.000Z',...overrides});

test('reconciler leaves live player processes alone',()=>{
  assert.deepEqual(assessJevRunManifest(manifest(),{nowMs,heartbeatGraceMs:60_000,
    isPidRunning:()=>true}),{
    action:'attention',reason:'stale-heartbeat-process-still-running',pid:1234,
    heartbeatAgeMs:120_000,
  });
});

test('reconciler marks only confirmed exited processes after stale-heartbeat grace',()=>{
  assert.deepEqual(assessJevRunManifest(manifest(),{nowMs,heartbeatGraceMs:60_000,
    isPidRunning:()=>false}),{
    action:'mark-failed',reason:'player-process-exited-with-stale-live-manifest',
    pid:1234,heartbeatAgeMs:120_000,
  });
});

test('recent exit and unknown process state require attention, not mutation',()=>{
  assert.equal(assessJevRunManifest(manifest({updatedAt:'2026-09-21T19:59:45.000Z'}),
    {nowMs,heartbeatGraceMs:60_000,isPidRunning:()=>false}).action,'attention');
  assert.equal(assessJevRunManifest(manifest(),{nowMs,heartbeatGraceMs:60_000,
    isPidRunning:()=>null}).action,'attention');
});

test('terminal manifests and invalid identity data are never reconciled',()=>{
  assert.equal(assessJevRunManifest(manifest({status:'complete'}),
    {nowMs,isPidRunning:()=>false}).action,'skip');
  assert.equal(assessJevRunManifest(manifest({pid:'unknown'}),
    {nowMs,isPidRunning:()=>false}).action,'attention');
});

test('reconciliation preserves run evidence and requires a confirmed stale-process finding',()=>{
  const source=manifest({decisions:42,errors:[],status:'starting'});
  const result=reconcileJevRunManifest(source,{action:'mark-failed',reason:'dead',pid:1234,
    heartbeatAgeMs:120_000},'2026-09-21T20:01:00.000Z');
  assert.equal(source.status,'starting');
  assert.equal(result.status,'failed');
  assert.equal(result.decisions,42);
  assert.equal(result.reconciliation.previousStatus,'starting');
  assert.throws(()=>reconcileJevRunManifest(source,{action:'attention'}),/confirmed stale-process/);
});
