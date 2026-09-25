import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('JSONL engine: real EXP, deterministic resets, isolated DB and bounded episodes', { timeout: 30000 }, async t => {
  const directory = mkdtempSync(join(tmpdir(), 'puffer-parent-test-'));
  const sentinel = join(directory, 'must-not-open.db');
  writeFileSync(sentinel, 'parent database must remain untouched');
  const child = spawn(process.execPath, [fileURLToPath(new URL('../puffer_adapter/engine.mjs', import.meta.url))], {
    env: { ...process.env, DR_DB_PATH: sentinel }, stdio: ['pipe', 'pipe', 'pipe'],
  });
  const exited = once(child, 'exit');
  let stderr = '';
  child.stderr.on('data', data => { stderr += data; });
  const lines = createInterface({ input: child.stdout });
  const iterator = lines[Symbol.asyncIterator]();
  t.after(() => { child.kill(); lines.close(); rmSync(directory, { recursive: true, force: true }); });
  async function request(value) {
    child.stdin.write((typeof value === 'string' ? value : JSON.stringify(value)) + '\n');
    const result = await iterator.next();
    assert.equal(result.done, false, stderr);
    return JSON.parse(result.value); // Any stdout diagnostics fail this test.
  }
  const spec = await request({ op: 'spec' });
  assert.deepEqual(spec.actions, ['look', 'forage', 'track', 'hunt', 'perform']);
  assert.equal(spec.observation_size, spec.observation_fields.length);
  assert.equal(spec.horizon, 128);
  assert.equal(spec.mode, 'accelerated_engine');
  assert.deepEqual(spec.baseline_actions, [1, 2, 3, 4]);
  assert.equal(spec.scenario_name, 'pine_needle_ranger_skilling_v1');
  assert.equal(spec.clock_semantics.seconds_per_step, 200);
  assert.match((await request({ op: 'step', action: 1 })).error, /reset/);
  const first = await request({ op: 'reset', seed: 42 });
  assert.equal(first.reward, 0);
  assert.equal(first.info.experience_absorbed, 0);
  assert.equal(first.info.experience_pooled, 0);
  assert.equal(first.info.room, 'pine_needle_path');
  assert.equal(first.info.database_isolated, true);
  assert.equal(first.terminated, false);
  assert.equal(first.truncated, false);
  const idle = await request({ op: 'step', action: 0 });
  assert.equal(idle.reward, 0, 'look cannot fabricate skill reward');
  for (const action of [-1, 5, 1.5, '1', null]) {
    assert.match((await request({ op: 'step', action })).error, /action/);
  }
  assert.match((await request({ op: 'step', action: 1, command: 'attack' })).error, /arbitrary/);
  assert.ok((await request('{broken')).error);
  assert.ok((await request({ op: 'unknown' })).error);
  assert.ok((await request({ op: 'reset', seed: -1 })).error);
  const forage = await request({ op: 'step', action: 1 });
  assert.equal(forage.info.step, 2, 'invalid requests did not advance state');
  assert.ok(forage.reward > 0);
  assert.ok(forage.info.skills.foraging.exp > 0, 'real skill rank bits changed');
  assert.ok(forage.info.experience_pooled > 0, 'real field EXP remains banked');
  assert.equal(forage.reward, (forage.info.experience_absorbed - idle.info.experience_absorbed) / 10);
  // Compare the full selected-scenario trajectory, including random forage outcomes.
  async function trajectory() {
    const results = [await request({ op: 'reset', seed: 42 })];
    for (let i = 0; i < 12; i++) results.push(await request({ op: 'step', action: i % spec.actions.length }));
    return results;
  }
  assert.deepEqual(await trajectory(), await trajectory());
  await request({ op: 'reset', seed: 7 });
  let previous = 0, result;
  for (let i = 1; i <= 128; i++) {
    result = await request({ op: 'step', action: 2 });
    assert.equal(result.observation.length, spec.observation_size);
    assert.ok(result.observation.every(Number.isFinite));
    assert.equal(result.reward, (result.info.experience_absorbed - previous) / 10);
    assert.ok(result.reward > 0, 'tracking trains actual tracking/scouting skills');
    previous = result.info.experience_absorbed;
    assert.equal(result.truncated, i === 128);
    assert.equal(result.terminated, false);
  }
  assert.ok(result.info.skills.tracking.rank > 0, 'real rank thresholds crossed');
  assert.ok(result.info.skills.scouting.rank > 0);
  assert.equal(result.info.episode_end, 'horizon');
  assert.match((await request({ op: 'step', action: 2 })).error, /reset/);
  assert.equal((await request({ op: 'reset', seed: 42 })).info.experience_absorbed, 0);
  // Exceed MAX_CHARS (10) on the same subprocess/account. Every reset must
  // roll back both the old character and any inventory rows it acquired.
  for (let i = 0; i < 15; i++) {
    const fresh = await request({ op: 'reset', seed: 42 });
    assert.deepEqual(fresh, first, 'reset restores a fresh character beyond MAX_CHARS');
    const learned = await request({ op: 'step', action: 1 });
    assert.ok(learned.info.experience_absorbed > 0);
    assert.ok(learned.info.experience_pooled > 0);
  }
  assert.deepEqual(await request({ op: 'close' }), { ok: true, closed: true });
  child.stdin.end();
  const [code] = await exited;
  assert.equal(code, 0, stderr);
  assert.equal(readFileSync(sentinel, 'utf8'), 'parent database must remain untouched');
});
