import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { instrumentJevOverloadRecoverySource } from '../scripts/lib/jev-overload-recovery.mjs';
import { load } from '../scripts/jev-player-overload-recovery-loader.mjs';
import { needsJevChoice, playerGoalOptions } from '../scripts/lib/jev-player-policy.mjs';

test('overload is environmental, does not blacklist the preceding command, and is attributed',()=>{
  const source=fs.readFileSync(new URL('../scripts/jev-player.mjs',import.meta.url),'utf8');
  const transformed=instrumentJevOverloadRecoverySource(source,{extensionHash:'fixture-hash'});
  assert.equal(transformed.includes('lastCommandActionId=null; lastCommandActionAt=0; const result = await walkTo(selected.targetRoom, selected.id);'),true);
  assert.match(transformed,/classification:'environmental-overload',blocked:false/);
  assert.match(transformed,/lastCommandActionId=null; lastCommandActionAt=0; } else if \(\/\^\(You cannot go that way\|Creatures block your path\|Go where\)/);
  assert.doesNotMatch(transformed,/You are overloaded\|Go where\)\/i\.test\(text\) && lastCommandActionId\) \{/);
  assert.match(transformed,/id:'jev-overload-recovery',version:1,sourceHash:"fixture-hash"/);
});

test('overload-only navigation failure is not permanently cooled; other failures remain blocked',()=>{
  const source=fs.readFileSync(new URL('../scripts/jev-player.mjs',import.meta.url),'utf8');
  const transformed=instrumentJevOverloadRecoverySource(source);
  assert.equal(transformed.includes("if (!(overloadedFlag && String(result.reason||'').startsWith('movement-unconfirmed'))) blockedActionIds.add(selected.id)"),true);
  assert.equal(transformed.includes("burdenRecovery:overloadedFlag&&String(result.reason||'').startsWith('movement-unconfirmed')"),true);
});

test('reproduces the observed low-HP deadlock when rest is incorrectly blocked',()=>{
  const vitals={guild:'barbarian',circle:1,hp:84,maxhp:145,rt:0,inCombat:false,
    room:'fields_furrow',bleeding:[],requirements:{circle:2,rows:[]},equipment:{},skills:{},silver:551,
    saleItems:['kobold_skin','hog_hide'],saleCounts:{kobold_skin:13,hog_hide:10},
    bundledItems:['kobold_skin'],overloaded:false};
  const room={roomId:'fields_furrow',msg:'',exits:{},contents:{npcs:[],items:[]}};
  const available=playerGoalOptions(vitals,room,[],[]);
  assert.deepEqual(available.map(action=>action.id),['sell_field_loot','rest']);
  assert.equal(needsJevChoice(available),true);
  const blocked=playerGoalOptions(vitals,room,[],['sell_field_loot','rest']);
  assert.deepEqual(blocked,[]);
  assert.equal(needsJevChoice(blocked),false);
});

test('overload recovery transformation fails closed on source drift',()=>{
  assert.throws(()=>instrumentJevOverloadRecoverySource('unrelated source'),/Expected one navigation failure anchor/);
});

test('fully transformed runner remains syntactically valid ESM',()=>{
  const source=fs.readFileSync(new URL('../scripts/jev-player.mjs',import.meta.url),'utf8');
  const transformed=instrumentJevOverloadRecoverySource(source,{extensionHash:'syntax-test'});
  const checked=spawnSync(process.execPath,['--check','--input-type=module'],{input:transformed,encoding:'utf8'});
  assert.equal(checked.status,0,checked.stderr||checked.stdout);
});

test('load hook transforms only the Jev runner entrypoint',async()=>{
  const runner=new URL('../scripts/jev-player.mjs',import.meta.url);
  const source=fs.readFileSync(runner,'utf8');
  const oldMain=process.argv[1];
  process.argv[1]=runner.pathname;
  try {
    const result=await load(runner.href,{},async()=>({format:'module',source}));
    assert.match(result.source,/jev-overload-recovery/);
    const other=await load('file:///tmp/not-jev.mjs',{},async()=>({format:'module',source}));
    assert.doesNotMatch(other.source,/jev-overload-recovery/);
  } finally {
    if(oldMain===undefined) delete process.argv[1];
    else process.argv[1]=oldMain;
  }
});
