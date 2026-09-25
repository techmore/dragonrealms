import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { circleRequirements, guildById } from '../data/guilds.js';

// Integration contract only: the activity curriculum belongs to engine_circle.
// The earned-circle regression uses a fixed scripted rotation, not a neural policy.
test('circle activity subprocess uses real learning and an isolated fresh world', { timeout: 30000 }, async t => {
  const directory = mkdtempSync(join(tmpdir(), 'dr-circle-contract-'));
  const parentPath = join(directory, 'parent.db');
  const parent = new DatabaseSync(parentPath);
  parent.exec("CREATE TABLE sentinel(value TEXT); INSERT INTO sentinel VALUES ('untouched');");
  parent.close();
  const parentBytes = readFileSync(parentPath);
  const child = spawn(process.execPath, [fileURLToPath(new URL('../puffer_adapter/engine_circle.mjs', import.meta.url))], {
    env: { ...process.env, DR_DB_PATH: parentPath }, stdio: ['pipe', 'pipe', 'pipe'],
  });
  const exit = once(child, 'exit');
  let stderr = '';
  child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-12000); });
  const lines = createInterface({ input: child.stdout });
  const iterator = lines[Symbol.asyncIterator]();
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await exit;
    lines.close();
    rmSync(directory, { recursive: true, force: true });
  });
  async function nextLine() {
    let timer;
    try {
      return await Promise.race([
        iterator.next(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Engine response timeout: ' + stderr)), 8000); }),
      ]);
    } finally { clearTimeout(timer); }
  }
  async function request(value) {
    child.stdin.write((typeof value === 'string' ? value : JSON.stringify(value)) + '\n');
    const line = await nextLine();
    assert.equal(line.done, false, 'Engine exited before response: ' + stderr);
    return JSON.parse(line.value); // stdout must contain only JSONL.
  }
  const spec = await request({ op: 'spec' });
  let fresh;
  function checkSnapshot(result) {
    assert.equal(result.error, undefined, JSON.stringify(result));
    assert.equal(result.observation.length, spec.observation_size);
    assert.ok(result.observation.every(Number.isFinite));
    assert.ok(Number.isFinite(result.reward));
    assert.equal(typeof result.terminated, 'boolean');
    assert.equal(typeof result.truncated, 'boolean');
    assert.equal(result.observation.length, spec.observation_features.length);
    assert.equal(spec.observation_features[0], 'hp_fraction');
    assert.equal(spec.observation_features.includes('episode_fraction'), false);
    const roomFeature = spec.observation_features.indexOf(`room:${result.info.room}`);
    assert.ok(roomFeature >= 0);
    assert.equal(result.observation[roomFeature], 1);
    assert.equal(result.info.observation_source, 'ordinary-client-frames');
    assert.equal(result.info.database_isolated, true);
    const skills = Object.values(result.info.skills);
    assert.equal(result.info.experience_absorbed, skills.reduce((sum, skill) => sum + skill.absorbed, 0));
    const pooled = skills.reduce((sum, skill) => sum + skill.pooled, 0);
    // Pools may contain fractional values; map insertion order can change
    // floating-point summation by a few ulps over long episodes.
    assert.ok(Math.abs(result.info.experience_pooled - pooled) <= 1e-9 * Math.max(1, Math.abs(pooled)));
    assert.equal(result.info.requirement_gap,
      result.info.requirements.rows.reduce((sum, row) => sum + Math.max(0, row.need - row.have), 0));
  }
  await t.test('spec reports the actual activity environment and horizon', () => {
    assert.equal(spec.mode, 'accelerated_real_timer_engine_client_observation');
    assert.equal(spec.target_circle, 2);
    assert.equal(spec.horizon, 2048, 'circle horizon must not inherit the 128-step skilling horizon');
    assert.ok(Number.isInteger(spec.observation_size) && spec.observation_size > 0);
    assert.ok(Array.isArray(spec.actions) && spec.actions.length > 0);
    assert.equal(new Set(spec.actions).size, spec.actions.length);
    for (const action of ['field_medicine', 'stealth', 'magic', 'perform', 'guild']) assert.ok(spec.actions.includes(action));
    assert.ok(spec.baseline_actions.every(index => Number.isInteger(index) && index >= 0 && index < spec.actions.length));
  });
  await t.test('fresh reset and rejected inputs preserve the step contract', async () => {
    fresh = await request({ op: 'reset', seed: 42 });
    checkSnapshot(fresh);
    assert.equal(fresh.reward, 0);
    assert.equal(fresh.info.step, 0);
    assert.equal(fresh.info.circle, 1);
    assert.equal(fresh.info.experience_absorbed, 0);
    assert.equal(fresh.info.experience_pooled, 0);
    assert.equal(fresh.info.room, 'pine_needle_path');
    assert.equal(fresh.terminated, false);
    assert.equal(fresh.truncated, false);
    for (const action of [-1, spec.actions.length, 0.5, '0', null]) {
      assert.equal(typeof (await request({ op: 'step', action })).error, 'string');
    }
    for (const input of ['{broken', null, [], { op: 'unknown' },
      { op: 'step', action: 0, command: 'train foraging' }]) {
      assert.equal(typeof (await request(input)).error, 'string');
    }
    const performed = await request({ op: 'step', action: spec.actions.indexOf('perform') });
    checkSnapshot(performed);
    assert.equal(performed.info.step, 1, 'rejected requests must not advance the episode');
    assert.ok(performed.info.skills.performance.absorbed > 0);
    assert.ok(performed.info.simulated_seconds > fresh.info.simulated_seconds);
  });
  await t.test('real field medicine and magic change the relevant skills', async () => {
    await request({ op: 'reset', seed: 42 });
    let medicine = await request({ op: 'step', action: spec.actions.indexOf('field_medicine') });
    checkSnapshot(medicine);
    assert.ok(medicine.reward > 0, 'absorbed fractional learning earns dense reward before integer gates change');
    assert.ok(medicine.info.skills.foraging.absorbed > 0);
    assert.ok(medicine.info.skills.first_aid.absorbed > 0, 'foraged consumables train First Aid through use');
    // A single activity banks EXP but need not complete a rank. Allow the
    // real scheduled pulses to absorb it over a bounded short curriculum.
    for (let i = 0; i < 7 && medicine.info.skills.foraging.rank === 0; i++) {
      medicine = await request({ op: 'step', action: spec.actions.indexOf('field_medicine') });
      checkSnapshot(medicine);
    }
    assert.ok(medicine.info.skills.foraging.rank > 0, 'real rank threshold crossed');
    const magic = await request({ op: 'step', action: spec.actions.indexOf('magic') });
    checkSnapshot(magic);
    assert.ok(magic.info.skills.attunement.absorbed > 0);
    assert.ok(magic.info.skills.utility_magic.absorbed > 0);
    assert.ok(magic.info.experience_absorbed > medicine.info.experience_absorbed);
    assert.equal(magic.terminated, false);
    assert.equal(magic.truncated, false);
  });
  await t.test('more than MAX_CHARS resets clear previous learning and inventory', async () => {
    for (let i = 0; i < 12; i++) {
      const reset = await request({ op: 'reset', seed: 42 });
      checkSnapshot(reset);
      assert.equal(reset.info.step, 0);
      assert.equal(reset.info.circle, 1);
      assert.equal(reset.info.experience_absorbed, 0);
      assert.equal(reset.info.experience_pooled, 0);
      assert.deepEqual(reset.info.inventory, fresh.info.inventory);
      assert.deepEqual(reset.info.equipment, fresh.info.equipment);
      assert.deepEqual(reset.observation, fresh.observation);
      const learned = await request({ op: 'step', action: spec.actions.indexOf('field_medicine') });
      checkSnapshot(learned);
      assert.ok(learned.info.experience_absorbed > 0);
    }
  });
  await t.test('seed 42 scripted rotation earns Circle 2 within 512 activities and replays deterministically', async () => {
    assert.ok(spec.baseline_actions.length > 0);
    async function earnCircle() {
      let result = await request({ op: 'reset', seed: 42 });
      checkSnapshot(result);
      for (let step = 0; step < 512 && !result.terminated && !result.truncated; step++) {
        result = await request({ op: 'step', action: spec.baseline_actions[step % spec.baseline_actions.length] });
        checkSnapshot(result);
        assert.equal(result.info.death, false, 'scripted curriculum must survive');
      }
      const detail = JSON.stringify({ step: result.info.step, room: result.info.room, missing: result.info.requirements.missing });
      assert.equal(result.info.circle, 2, detail);
      assert.equal(result.info.max_circle, 2);
      assert.equal(result.info.requirements.ok, true, detail);
      assert.equal(result.info.requirement_gap, 0, detail);
      assert.ok(result.info.requirements.rows.every(row => row.have >= row.need));
      // Recompute gates using production requirements, independently of the
      // subprocess's reported ok flag. Rank progress must actually satisfy them.
      assert.equal(circleRequirements(guildById('ranger'), result.info.skills, 2).ok, true);
      assert.equal(result.terminated, true);
      assert.equal(result.truncated, false);
      assert.ok(result.info.step <= 512);
      assert.ok(result.info.milestones.some(m => m.circle === 2));
      assert.equal(typeof (await request({ op: 'step', action: spec.baseline_actions[0] })).error, 'string');
      const reset = await request({ op: 'reset', seed: 42 });
      checkSnapshot(reset);
      assert.equal(reset.info.circle, 1);
      assert.equal(reset.info.max_circle, 1);
      assert.equal(reset.info.step, 0);
      assert.equal(reset.info.experience_absorbed, 0);
      assert.equal(reset.info.experience_pooled, 0);
      assert.equal(reset.terminated, false);
      assert.equal(reset.truncated, false);
      assert.deepEqual(reset.info.milestones, []);
      return result;
    }
    const firstRun = await earnCircle();
    const replay = await earnCircle();
    assert.equal(replay.info.step, firstRun.info.step);
    assert.deepEqual(replay.observation, firstRun.observation);
    assert.deepEqual(replay.info.skills, firstRun.info.skills);
    assert.deepEqual(replay.info.milestones, firstRun.info.milestones);
    t.diagnostic(`Scripted seed-42 rotation earned Circle 2 at ${firstRun.info.step} activities on both runs.`);
  });
  await t.test('close exits cleanly and never modifies the parent DB', async () => {
    // Current circle protocol closes stdout without a response; also permit
    // an explicit acknowledgment if the host adds one.
    child.stdin.end(JSON.stringify({ op: 'close' }) + '\n');
    let line = await nextLine();
    if (!line.done) {
      const acknowledgment = JSON.parse(line.value);
      assert.equal(acknowledgment.ok, true);
      assert.equal(acknowledgment.closed, true);
      line = await nextLine();
    }
    assert.equal(line.done, true);
    const [code] = await exit;
    assert.equal(code, 0, stderr);
    assert.deepEqual(readFileSync(parentPath), parentBytes);
    assert.deepEqual(readdirSync(directory), ['parent.db'], 'no parent WAL or other files created');
  });
});
