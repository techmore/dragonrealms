import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { instrumentJevLowFundsCrierSource } from '../scripts/lib/jev-low-funds-crier.mjs';
import { load } from '../scripts/jev-player-low-funds-crier-loader.mjs';

const source=()=>fs.readFileSync(new URL('../scripts/jev-player.mjs',import.meta.url),'utf8');
test('low-funds crier overlay selects an offered quest before field routing',()=>{
  const out=instrumentJevLowFundsCrierSource(source(),{extensionHash:'fixture'});
  assert.match(out,/take-quest-before-field-route-when-low-funds/);
  assert.match(out,/options\.find\(option => option\.id === 'take_quest'\)/);
  assert.match(out,/id:'jev-low-funds-crier',version:1,sourceHash:"fixture"/);
});
test('overlay fails closed and remains valid ESM',()=>{
  assert.throws(()=>instrumentJevLowFundsCrierSource('x'),/Expected one supervised choice anchor/);
  const checked=spawnSync(process.execPath,['--check','--input-type=module'],{input:instrumentJevLowFundsCrierSource(source()),encoding:'utf8'});
  assert.equal(checked.status,0,checked.stderr||checked.stdout);
});
test('loader is exact-entrypoint scoped',async()=>{
  const entry=new URL('../scripts/jev-player.mjs',import.meta.url), old=process.argv[1];process.argv[1]=entry.pathname;
  try { const a=await load(entry.href,{},async()=>({format:'module',source:source()})); assert.match(a.source,/jev-low-funds-crier/); const b=await load('file:///tmp/other.mjs',{},async()=>({format:'module',source:source()})); assert.doesNotMatch(b.source,/jev-low-funds-crier/); }
  finally { if(old===undefined) delete process.argv[1]; else process.argv[1]=old; }
});
