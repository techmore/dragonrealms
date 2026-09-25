import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { instrumentJevNoActionSource } from '../scripts/lib/jev-no-action-diagnostics.mjs';
import { load } from '../scripts/jev-player-diagnostics-loader.mjs';

test('diagnostic transform adds action-filter context only to the no-action event',()=>{
  const source=fs.readFileSync(new URL('../scripts/jev-player.mjs',import.meta.url),'utf8');
  const transformed=instrumentJevNoActionSource(source);
  assert.equal(transformed.includes("schema:'jev-no-action/1'"),true);
  assert.equal(transformed.includes('candidateActions:options.map'),true);
  assert.equal(transformed.includes('blockedActions:[...blockedActionIds]'),true);
  assert.equal(transformed.includes("log({type:'wait',reason:'only-legal-action',retryInSeconds:10,room:v.room});"),false);
  assert.equal(transformed.includes("log({type:'wait',reason:'only-legal-action',retryInSeconds:10,room:v.room,diagnostics:"),true);
});

test('diagnostic transform fails closed when runner source shape changes',()=>{
  assert.throws(()=>instrumentJevNoActionSource('export const unrelated = true;'),/Expected one only-legal-action log site/);
  assert.throws(()=>instrumentJevNoActionSource('x; only-legal-action; only-legal-action;'),/found 0/);
});

test('optional loader decorates only the exact Jev runner entrypoint',async()=>{
  const runner=new URL('../scripts/jev-player.mjs',import.meta.url);
  const source=fs.readFileSync(runner,'utf8');
  const oldMain=process.argv[1];
  process.argv[1]=new URL(runner).pathname;
  try {
    const transformed=await load(runner.href,{},async()=>({format:'module',source}));
    assert.equal(transformed.source.includes("schema:'jev-no-action/1'"),true);
    const other=await load('file:///tmp/other-runner.mjs',{},async()=>({format:'module',source}));
    assert.equal(other.source.includes("schema:'jev-no-action/1'"),false);
  } finally {
    if(oldMain===undefined) delete process.argv[1];
    else process.argv[1]=oldMain;
  }
});
