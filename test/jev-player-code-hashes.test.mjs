import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assessJevQueueCodeIntegrity, captureJevPlayerCodeHashes,
  invalidateJevQueueForIntegrity, mismatchedJevPlayerCodeHashes }
  from '../scripts/lib/jev-player-code-hashes.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

test('Jev player source snapshot uses the manifest hash keys and detects post-queue edits',()=>{
  const snapshot=captureJevPlayerCodeHashes(root);
  assert.deepEqual(Object.keys(snapshot).sort(),[
    'codeHashRegistry','combatEvidence','decisionPolicy','isolatedWorldLauncher','jevClient','jevProviderPolicy',
    'laneCoach','lootAccounting','observationPolicy','player','progressObserver','rtPrefetch',
    'statPolicy','wireSession',
  ].sort());
  assert.deepEqual(mismatchedJevPlayerCodeHashes(snapshot,{...snapshot,decisionPolicy:'changed'}),
    ['decisionPolicy']);
  assert.deepEqual(mismatchedJevPlayerCodeHashes(snapshot,null),['missing-code-hashes']);
});

test('queued comparison integrity requires unchanged code and matching prerequisite hashes',()=>{
  const hashes={player:'p',policy:'a'};
  assert.deepEqual(assessJevQueueCodeIntegrity({pinnedCodeHashes:hashes,
    currentCodeHashes:hashes,prerequisiteCodeHashes:[{id:'base',codeHashes:hashes}]}),
  {valid:true,sourceDrift:[],prerequisiteDrift:[]});
  const drift=assessJevQueueCodeIntegrity({pinnedCodeHashes:hashes,
    currentCodeHashes:{...hashes,policy:'b'},
    prerequisiteCodeHashes:[{id:'base',codeHashes:{...hashes,player:'old'}}]});
  assert.equal(drift.valid,false);
  assert.deepEqual(drift.sourceDrift,['policy']);
  assert.deepEqual(drift.prerequisiteDrift,['base:player']);
});

test('invalidated queues retain explicit integrity evidence and terminal timestamp',()=>{
  const queue={status:'waiting'};
  const result=invalidateJevQueueForIntegrity(queue,{valid:false,
    sourceDrift:['player'],prerequisiteDrift:['base:decisionPolicy']},'Hash drift');
  assert.equal(result,true);
  assert.equal(queue.status,'invalidated');
  assert.ok(Number.isFinite(Date.parse(queue.finishedAt)));
  assert.deepEqual(queue.integrityFailure,{reason:'Hash drift',
    sourceDrift:['player'],prerequisiteDrift:['base:decisionPolicy']});
});

test('roundtime refusal stores the in-scope retry deadline',()=>{
  const source=fs.readFileSync(path.join(root,'scripts/jev-player.mjs'),'utf8');
  assert.match(source,/const retryAfter\s*=\s*Date\.now\(\)\s*\+\s*seconds\s*\*\s*1000;[\s\S]*?retryAt\s*:\s*retryAfter/,
    'the queued combat action must persist the deadline actually defined by this callback');
});
