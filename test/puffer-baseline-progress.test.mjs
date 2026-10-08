import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
const bounds = ['--seed','7740620','--target','20','--commands','500','--simulated-seconds','10000','--seconds','5'];
function run(extra = [], script = 'puffer_adapter/engine_script.mjs', args = bounds) {
  const result = spawnSync(process.execPath, [script, ...args, ...extra], { cwd: new URL('..', import.meta.url), encoding: 'utf8', timeout: 15000, maxBuffer: 8*1024*1024 });
  assert.equal(result.status, 0, result.stderr);
  const rows = result.stdout.trim().split('\n').map(line => JSON.parse(line));
  return { rows, final: rows.at(-1), commands: rows.filter(row => row.schema === 'dragonrealms.puffer.script-command/1') };
}
function assertNativeFatalControl(result) {
  const { final, commands } = result;
  assert.equal(final.reason, 'death'); assert.equal(final.death, true);
  assert.ok(final.commands > 39 && final.commands < 500, 'passes old orphan wait, stops before cap');
  assert.ok(final.simulated_seconds < 10000);
  assert.equal(final.source_unchanged, true); assert.equal(final.database_isolated, true);
  assert.equal(final.room, 'temple');
  assert.ok(final.last_messages.some(text => /You awaken in the Temple.*belongings lie with your corpse/s.test(text)), 'native death and corpse response');
  assert.ok(commands.some(row => /^(attack|slice|chop|jab|swing|thrust|punch|kick)\b/.test(row.command) && row.replies.some(reply => reply.type === 'combat')), 'actual native attack, not a look/EXP loop');
  assert.equal(commands.length, final.commands); assert.equal(commands.at(-1).command, final.last_command);
  assert.ok(commands.every(row => row.simulated_seconds <= final.simulated_seconds));
  assert.equal(result.rows.at(-1).status, 'completed', 'terminal record ends stream; no post-stop command records');
}
// Prior 500/2000-command + no-death checks rewarded a look/EXP loop which
// never attacked. Correct native combat exposes a fatal fixed-arena control.
// These tests prove behavior; that death remains a progression limitation.
test('production control passes the orphan wait, fights natively and reports its fatal stop truthfully', () => {
  assertNativeFatalControl(run(['--trace-commands']));
});
test('bounded native traces preserve exact untraced fatal outcomes and command accounting', () => {
  const normal = run(['--hall-supervisor']), traced = run(['--hall-supervisor','--trace-commands']);
  assertNativeFatalControl(traced);
  assert.ok(normal.rows.every(row => row.schema !== 'dragonrealms.puffer.script-command/1'));
  for (const key of ['circle','death','commands','simulated_seconds','reason','requirement_gap','room','last_command','handoffs','script_hashes']) assert.deepEqual(traced.final[key], normal.final[key], key);
  assert.ok(traced.commands.every((row,index) => row.index === index+1 && row.database_isolated && row.replies.length <= 32));
});
test('early command cap still stops exactly before combat without extra command records', () => {
  const result = run(['--trace-commands'], undefined, ['--seed','7740620','--target','20','--commands','4','--simulated-seconds','10000','--seconds','5']);
  assert.equal(result.final.reason, 'command_cap'); assert.equal(result.final.commands, 4); assert.equal(result.commands.length, 4);
  assert.equal(result.final.death, false); assert.equal(result.final.source_unchanged, true); assert.equal(result.final.database_isolated, true);
  assert.ok(!result.commands.some(row => /^(attack|slice|chop|jab|swing|thrust)\b/.test(row.command)));
});
test('isolated production hall script enters, pays for native training, observes refusal and returns', () => {
  const { final } = run([], 'test/fixtures/puffer-native-hall.mjs', []);
  assert.equal(final.completed, true); assert.equal(final.room, 'sewers_3'); assert.ok(final.rooms.includes('hall_barbarian'));
  assert.ok(final.commands.includes('train expertise')); assert.ok(final.commands.includes('train melee_mastery'));
  assert.ok(final.messages.some(text => /drills you in Expertise.*\(\d+ silvers\)/.test(text)));
  assert.ok(final.messages.some(text => /does not teach that skill/.test(text))); assert.ok(final.messages.some(text => /not yet ready/.test(text)));
  const lesson = final.payments.find(row => row.command === 'train expertise');
  const refusal = final.payments.find(row => row.command === 'train melee_mastery');
  assert.equal(lesson.silverBefore - lesson.silverAfter, final.lessonCost);
  assert.ok(final.lessonCost > 0); assert.ok(lesson.expertiseAfter > lesson.expertiseBefore);
  assert.equal(refusal.silverBefore, refusal.silverAfter, 'refused lesson charges no money');
  assert.equal(final.silverSpent, final.payments.reduce((sum,row) => sum+row.silverBefore-row.silverAfter,0), 'native lessons and generated bazaar errands reconcile');
  assert.ok(final.expertiseAfter > final.expertiseBefore);
  assert.equal(final.circle, 1); assert.equal(final.death, false); assert.equal(final.combatStarted, false); assert.equal(final.commandsAfterStop, 0);
  assert.equal(final.sourceUnchanged, true); assert.equal(final.databaseIsolated, true); assert.equal(final.grantsUsed, false);
});
