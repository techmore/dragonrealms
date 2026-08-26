// Regression tests for the heartbeat() no-send breaker ordering in
// scripts/race-guild-sweep.mjs.
//
// Measured wedge (run dfix, 2026-08-26): the script engine parks in
// prompt/timer mode when server prompts stop arriving and reports
// running:true forever. The no-send breaker used to sit at the BOTTOM of
// heartbeat(), behind early returns (dead-runner branch, hall trips, the
// RT-stall breaker needing refusals that had stopped arriving, and the
// parked-watchdog gated on !inCombat with a stuck COMBAT flag). Result:
// 20+ minutes of total silence, "wedged" verdict, no recovery.
//
// These tests pin the ORDERING contract: a silent runner must be restarted
// even while every one of those gates is hostile.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../scripts/race-guild-sweep.mjs', import.meta.url), 'utf8');

// Extract the heartbeat() body up to the next method definition. The next
// method starts with a non-indented `  name(` line — comments also use two
// spaces, so match on a method-shaped line specifically.
function heartbeatBody() {
  const i = src.indexOf('  heartbeat() {');
  assert.ok(i > 0, 'heartbeat() exists');
  const rest = src.slice(i + 15);
  const j = rest.search(/\n  [a-zA-Z_$][\w$]*\(/);
  return j > -1 ? rest.slice(0, j) : rest;
}

test('no-send breaker runs at the TOP of heartbeat(), before every gated rescue', () => {
  const body = heartbeatBody();
  const breaker = body.indexOf('no-send breaker');
  assert.ok(breaker > -1, 'breaker comment present');
  // It must appear before: the dead-runner branch, hall-trip logic, the
  // RT-stall breaker, and the parked-watchdog gate — matched by CODE markers
  // (a string in a log call or a comment mention would false-match).
  for (const marker of ['updateStallVerdict', "'[rt-stall] ", '"[watchdog] parked']) {
    const at = body.indexOf(marker);
    if (at > -1) assert.ok(breaker < at,
      `no-send breaker must precede "${marker}" in heartbeat()`);
  }
});

test('breaker fires unconditionally on silence — no inCombat or refusal gating', () => {
  const cond = /if \(this\.runner && Date\.now\(\) - \(this\.lastSendAt \|\| 0\) > 90000 && !this\.restarting\)/
    .exec(heartbeatBody());
  assert.ok(cond, 'breaker condition is runner + 90s silence + not-already-restarting');
  // The old bottom-of-function copy must be gone — a second breaker below the
  // early returns would re-create the unreachable path this fixes.
  assert.equal((src.match(/no-send breaker/g) || []).length, 1,
    'exactly one no-send breaker');
  assert.ok(!/stalled 90s/.test(src), 'old bottom breaker removed');
});
