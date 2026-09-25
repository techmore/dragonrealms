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

const ACTIONS = ['field_medicine', 'stealth', 'barbarian_arts', 'knife_combat',
  'club_combat', 'skin_and_locks', 'rest', 'perform', 'guild', 'sword_combat', 'staff_combat', 'study'];

// Contract checks and a bounded scripted Circle 2 integration regression.
// No optimizer or comparative performance benchmark is launched here.
test('Barbarian subprocess: authoritative gates, deterministic fresh resets and real activity EXP', { timeout: 90000 }, async t => {
  const directory = mkdtempSync(join(tmpdir(), 'dr-barbarian-contract-'));
  const parentPath = join(directory, 'parent.db');
  const parent = new DatabaseSync(parentPath);
  parent.exec("CREATE TABLE sentinel(value TEXT); INSERT INTO sentinel VALUES ('untouched');");
  parent.close();
  const beforeBytes = readFileSync(parentPath);
  const child = spawn(process.execPath, [fileURLToPath(new URL('../puffer_adapter/engine_circle.mjs', import.meta.url)), '--guild', 'barbarian'], {
    env: { ...process.env, DR_DB_PATH: parentPath }, stdio: ['pipe', 'pipe', 'pipe'],
  });
  const exited = once(child, 'exit');
  let stderr = '';
  child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-12000); });
  const lines = createInterface({ input: child.stdout });
  const iterator = lines[Symbol.asyncIterator]();
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await exited;
    lines.close();
    rmSync(directory, { recursive: true, force: true });
  });
  async function nextLine() {
    let timer;
    try {
      return await Promise.race([iterator.next(), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Engine timeout: ' + stderr)), 8000);
      })]);
    } finally { clearTimeout(timer); }
  }
  async function request(value) {
    child.stdin.write((typeof value === 'string' ? value : JSON.stringify(value)) + '\n');
    const line = await nextLine();
    assert.equal(line.done, false, 'Unexpected engine exit: ' + stderr);
    return JSON.parse(line.value);
  }
  const spec = await request({ op: 'spec' });
  // Fail explicitly if the CLI flag is ignored (legacy Ranger implementation).
  assert.equal(spec.guild, 'barbarian');
  assert.equal(spec.race, 'gortog');
  assert.equal(spec.scenario_name, 'barbarian_circle2_client_wire_v1');
  assert.equal(spec.target_circle, 2);
  assert.equal(spec.mode, 'accelerated_real_timer_engine_client_observation');
  assert.deepEqual(spec.actions, ACTIONS);
  assert.equal(spec.actions.includes('magic'), false);
  assert.equal(spec.actions.includes('unarmed_combat'), false);
  assert.ok(Number.isInteger(spec.horizon) && spec.horizon > 0);
  assert.ok(Number.isInteger(spec.observation_size) && spec.observation_size > 0);
  assert.ok(spec.baseline_actions.length > 0);
  assert.ok(spec.baseline_actions.every(index => Number.isInteger(index) && index >= 0 && index < ACTIONS.length));
  const guild = guildById('barbarian');
  function check(result) {
    assert.equal(result.error, undefined, JSON.stringify(result));
    assert.equal(result.observation.length, spec.observation_size);
    assert.ok(result.observation.every(Number.isFinite));
    assert.equal(result.observation.length, spec.observation_features.length);
    assert.equal(spec.observation_features[0], 'hp_fraction');
    assert.equal(spec.observation_features.includes('episode_fraction'), false);
    const roomFeature = spec.observation_features.indexOf(`room:${result.info.room}`);
    assert.ok(roomFeature >= 0);
    assert.equal(result.observation[roomFeature], 1);
    assert.equal(result.info.observation_source, 'ordinary-client-frames');
    assert.ok(Number.isFinite(result.reward));
    assert.equal(typeof result.terminated, 'boolean');
    assert.equal(typeof result.truncated, 'boolean');
    assert.equal(result.info.database_isolated, true);
    assert.equal(result.info.guild, 'barbarian');
    assert.equal(result.info.race, 'gortog');
    const expected = circleRequirements(guild, result.info.skills, 2);
    assert.equal(expected.rows.length, 19);
    assert.deepEqual(result.info.requirements.rows, expected.rows, 'all 19 rows, ranks and eligible candidates must match production');
    assert.equal(result.info.requirements.ok, expected.ok);
    assert.deepEqual(result.info.requirements.missing, expected.missing);
    assert.equal(result.info.requirement_gap, expected.rows.reduce((sum, row) => sum + Math.max(0, row.need - row.have), 0));
    const skills = Object.values(result.info.skills);
    assert.equal(result.info.experience_absorbed, skills.reduce((sum, skill) => sum + skill.absorbed, 0));
    const pooled = skills.reduce((sum, skill) => sum + skill.pooled, 0);
    assert.ok(Math.abs(result.info.experience_pooled - pooled) <= 1e-9 * Math.max(1, Math.abs(pooled)));
  }
  const fresh = await request({ op: 'reset', seed: 42 });
  check(fresh);
  assert.equal(fresh.info.circle, 1);
  assert.equal(fresh.info.step, 0);
  assert.equal(fresh.info.experience_absorbed, 0);
  assert.equal(fresh.info.experience_pooled, 0);
  assert.equal(fresh.reward, 0);
  assert.equal(fresh.terminated, false);
  assert.equal(fresh.truncated, false);
  assert.deepEqual(fresh.info.requirements.rows, circleRequirements(guild, {}, 2).rows);

  await t.test('invalid input cannot invoke arbitrary commands or advance the episode', async () => {
    for (const action of [-1, ACTIONS.length, 0.5, '0', null]) {
      assert.equal(typeof (await request({ op: 'step', action })).error, 'string');
    }
    for (const value of ['{broken', null, [], { op: 'unknown' },
      { op: 'step', action: 0, command: 'train expertise' }]) {
      assert.equal(typeof (await request(value)).error, 'string');
    }
    const result = await request({ op: 'step', action: ACTIONS.indexOf('perform') });
    check(result);
    assert.equal(result.info.step, 1);
    assert.ok(result.info.skills.performance.absorbed > 0);
  });

  await t.test('seeded bounded activities teach real survival and lore skills repeatably', async () => {
    async function trajectory() {
      const reset = await request({ op: 'reset', seed: 42 });
      check(reset);
      assert.deepEqual(reset.observation, fresh.observation);
      const results = [];
      for (const activity of ['field_medicine', 'stealth', 'perform']) {
        const result = await request({ op: 'step', action: ACTIONS.indexOf(activity) });
        check(result);
        assert.equal(result.info.death, false);
        results.push(result);
      }
      assert.ok(results[0].info.skills.foraging.absorbed > 0);
      assert.ok(results[0].info.skills.first_aid.absorbed > 0);
      assert.ok(results[1].info.skills.stealth.absorbed > 0);
      assert.ok(results[2].info.skills.performance.absorbed > 0);
      return results;
    }
    const first = await trajectory(), replay = await trajectory();
    for (let i = 0; i < first.length; i++) {
      assert.deepEqual(replay[i].observation, first[i].observation);
      assert.deepEqual(replay[i].info.skills, first[i].info.skills);
      assert.equal(replay[i].reward, first[i].reward);
      assert.equal(replay[i].info.simulated_seconds, first[i].info.simulated_seconds);
    }
  });

  await t.test('bounded Barbarian arts and knife combat earn relevant skill EXP', async subtest => {
    await request({ op: 'reset', seed: 42 });
    let arts;
    for (let attempt = 0; attempt < 5; attempt++) {
      arts = await request({ op: 'step', action: ACTIONS.indexOf('barbarian_arts') });
      check(arts);
      assert.equal(arts.info.death, false);
      if (arts.info.skills.inner_fire.absorbed > 0 && arts.info.skills.augmentation.absorbed > 0) break;
    }
    const detail = JSON.stringify({ skills: { inner_fire: arts.info.skills.inner_fire,
      augmentation: arts.info.skills.augmentation }, messages: arts.info.last_messages });
    assert.ok(arts.info.skills.inner_fire.absorbed > 0, 'learned roar must train real Inner Fire: ' + detail);
    assert.ok(arts.info.skills.augmentation.absorbed > 0, 'learned roar must train eligible supernatural Augmentation: ' + detail);
    assert.ok(arts.info.skills.expertise.absorbed > 0, 'analyze trains Expertise');
    assert.ok(arts.info.skills.tactics.absorbed > 0, 'combat analysis and maneuvers train Tactics');
    // Maneuvers may be RT-blocked or lose their target during timer advances;
    // issuing a trip is not a promise of Brawling EXP in this bounded activity.
    subtest.diagnostic(`Arts telemetry: Inner Fire absorbed=${arts.info.skills.inner_fire.absorbed}; Augmentation absorbed=${arts.info.skills.augmentation.absorbed}; Brawling absorbed=${arts.info.skills.brawling.absorbed}, pooled=${arts.info.skills.brawling.pooled}.`);
    const combat = await request({ op: 'step', action: ACTIONS.indexOf('knife_combat') });
    check(combat);
    assert.ok(combat.info.skills.small_edged.absorbed > 0, 'dagger combat must train Small Edged');
  });

  await t.test('unaffordable club, broadsword and staff never fall back to another weapon lane', async () => {
    for (const activity of ['club_combat', 'sword_combat', 'staff_combat']) {
      await request({ op: 'reset', seed: 42 });
      const result = await request({ op: 'step', action: ACTIONS.indexOf(activity) });
      check(result);
      // Starting money buys cloth + shield, leaving too little for these
      // weapons. Recovery can teach Athletics; no combat lane should teach.
      for (const skill of ['small_edged', 'blunt', 'large_edged', 'staff', 'brawling', 'melee_mastery']) {
        assert.equal(result.info.skills[skill].absorbed + result.info.skills[skill].pooled, 0,
          `${activity} must stop when its weapon purchase fails (${skill})`);
      }
      assert.equal(result.info.equipment.hand, undefined);
      assert.equal(result.info.death, false);
    }
  });

  await t.test('earned performance income funds four distinct real weapon lanes', async () => {
    await request({ op: 'reset', seed: 42 });
    // Bounded fixture preparation using real tips. No silver, inventory,
    // rank or gate mutation; no optimizer or completion benchmark.
    for (let i = 0; i < 40; i++) {
      const result = await request({ op: 'step', action: ACTIONS.indexOf('perform') });
      check(result);
      assert.equal(result.info.death, false);
    }
    for (const [activity, item, skill] of [
      ['knife_combat', 'dagger', 'small_edged'],
      ['club_combat', 'club', 'blunt'],
      ['sword_combat', 'broadsword', 'large_edged'],
      ['staff_combat', 'staff', 'staff'],
    ]) {
      const result = await request({ op: 'step', action: ACTIONS.indexOf(activity) });
      check(result);
      assert.equal(result.info.death, false, activity);
      assert.equal(result.info.equipment.hand, item, `${activity} must equip its intended weapon`);
      assert.ok(result.info.skills[skill].absorbed > 0, `${activity} must train ${skill}`);
    }
  });

  await t.test('resets beyond MAX_CHARS remove old learning and equipment', async () => {
    for (let i = 0; i < 12; i++) {
      const result = await request({ op: 'reset', seed: 42 });
      check(result);
      assert.deepEqual(result.observation, fresh.observation);
      assert.deepEqual(result.info.inventory, fresh.info.inventory);
      assert.deepEqual(result.info.equipment, fresh.info.equipment);
      assert.equal(result.info.circle, 1);
      assert.equal(result.info.step, 0);
      assert.equal(result.info.experience_absorbed, 0);
      assert.equal(result.info.experience_pooled, 0);
      assert.equal(result.terminated, false);
      assert.deepEqual(result.info.milestones, []);
    }
  });
  await t.test('seed-42 scripted rotation earns Circle 2 against all production gates', async subtest => {
    let result = await request({ op: 'reset', seed: 42 });
    check(result);
    const limit = Math.min(2048, spec.horizon);
    for (let step = 0; step < limit && !result.terminated && !result.truncated; step++) {
      result = await request({ op: 'step', action: spec.baseline_actions[step % spec.baseline_actions.length] });
      check(result);
    }
    const detail = JSON.stringify({ step: result.info.step, death: result.info.death,
      room: result.info.room, gap: result.info.requirement_gap,
      missing: result.info.requirements.missing, messages: result.info.last_messages });
    assert.equal(result.info.death, false, detail);
    assert.equal(result.info.circle, 2, detail);
    assert.equal(result.info.requirements.ok, true, detail);
    assert.equal(circleRequirements(guild, result.info.skills, 2).ok, true, detail);
    assert.equal(result.info.requirement_gap, 0);
    assert.equal(result.terminated, true);
    assert.equal(result.truncated, false);
    assert.ok(result.info.milestones.some(m => m.circle === 2));
    assert.equal(typeof (await request({ op: 'step', action: 0 })).error, 'string');
    const reset = await request({ op: 'reset', seed: 42 });
    check(reset);
    assert.equal(reset.info.circle, 1);
    assert.equal(reset.info.step, 0);
    assert.equal(reset.info.experience_absorbed, 0);
    assert.equal(reset.info.experience_pooled, 0);
    assert.equal(reset.terminated, false);
    assert.deepEqual(reset.info.milestones, []);
    subtest.diagnostic(`Fixed scripted rotation earned Barbarian Circle 2 at ${result.info.step} activities; no neural-policy claim.`);
  });
  child.stdin.end(JSON.stringify({ op: 'close' }) + '\n');
  let end = await nextLine();
  if (!end.done) {
    assert.deepEqual(JSON.parse(end.value), { ok: true, closed: true });
    end = await nextLine();
  }
  assert.equal(end.done, true);
  const [code] = await exited;
  assert.equal(code, 0, stderr);
  assert.deepEqual(readFileSync(parentPath), beforeBytes);
  assert.deepEqual(readdirSync(directory), ['parent.db']);
});
