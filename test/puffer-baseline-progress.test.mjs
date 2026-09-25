import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('production control progresses beyond the two repaired wait stalls in an isolated engine', () => {
  const result = spawnSync(process.execPath, ['puffer_adapter/engine_script.mjs',
    '--seed','7740620','--target','20','--commands','500','--simulated-seconds','10000','--seconds','5'],
  {cwd:new URL('..',import.meta.url),encoding:'utf8',timeout:15000,maxBuffer:4*1024*1024});
  assert.equal(result.status,0,result.stderr);
  assert.ok(result.stdout.trim().split('\n').every(line=>JSON.parse(line).schema!=='dragonrealms.puffer.script-command/1'));
  const final = JSON.parse(result.stdout.trim().split('\n').at(-1));
  assert.equal(final.reason,'command_cap');
  assert.equal(final.commands,500);
  assert.ok(final.simulated_seconds < 10000);
  assert.equal(final.death,false);
  assert.equal(final.source_unchanged,true);
  assert.equal(final.database_isolated,true);
  // This guards interpreter progress only, not circle completion or superiority.
});

test('explicit isolated trace records bounded real command replies without changing control outcome',()=>{
  const args=['puffer_adapter/engine_script.mjs','--hall-supervisor','--seed','7740620',
    '--target','20','--commands','500','--simulated-seconds','10000','--seconds','5'];
  const run=extra=>spawnSync(process.execPath,[...args,...extra],
    {cwd:new URL('..',import.meta.url),encoding:'utf8',timeout:15000,maxBuffer:8*1024*1024});
  const normal=run([]),traced=run(['--trace-commands']);
  assert.equal(normal.status,0,normal.stderr);assert.equal(traced.status,0,traced.stderr);
  const rows=traced.stdout.trim().split('\n').map(line=>JSON.parse(line));
  const commands=rows.filter(r=>r.schema==='dragonrealms.puffer.script-command/1');
  assert.equal(commands.length,500);
  assert.ok(commands.every((r,i)=>r.index===i+1&&r.database_isolated&&r.replies.length<=32));
  assert.ok(commands.some(r=>r.command==='train melee_mastery'&&r.replies.some(reply=>/does not teach/.test(reply.text))));
  const control=JSON.parse(normal.stdout.trim().split('\n').at(-1)),final=rows.at(-1);
  for(const key of ['circle','death','commands','simulated_seconds','reason','requirement_gap'])
    assert.equal(final[key],control[key],key);
});

test('opt-in observed hall supervisor enters the guild and returns without granting progress',()=>{
  const result=spawnSync(process.execPath,['puffer_adapter/engine_script.mjs','--hall-supervisor',
    '--seed','7740620','--target','20','--commands','2000','--simulated-seconds','10000','--seconds','5'],
    {cwd:new URL('..',import.meta.url),encoding:'utf8',timeout:15000,maxBuffer:4*1024*1024});
  assert.equal(result.status,0,result.stderr);
  const final=JSON.parse(result.stdout.trim().split('\n').at(-1));
  assert.equal(final.hall_supervisor,true);
  assert.equal(final.reason,'command_cap');
  assert.equal(final.commands,2000);
  assert.ok(final.simulated_seconds<10000);
  assert.ok(final.handoffs.filter(h=>h.event==='hall_script_return').length>=2);
  assert.equal(final.control_equivalent_to_sims,false);
  assert.ok(final.handoffs.some(h=>h.event==='hall_enter'&&h.room==='hall_barbarian'));
  assert.ok(final.handoffs.some(h=>h.event==='hall_script_return'&&h.room==='sewers_3'));
  assert.equal(final.death,false);
  assert.equal(final.database_isolated,true);
});
