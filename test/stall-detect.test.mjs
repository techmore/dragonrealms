// Unit tests for scripts/lib/stall-detect.mjs — the per-run stall classifier
// shared by sweep live verdicts and end-of-run rows.
//
// Regression anchor: thief-human post-fix showed 4 kills with a busy refusal
// stream (RT-gated steps near spawns) and was misread as "stalled — refusal
// storm". Productive agents must never classify as stalled on refusal count
// alone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyStall } from '../scripts/lib/stall-detect.mjs';

const NOW = 1_800_000_000_000;
const MIN = 60_000;
const REFUSAL_WINDOW_MS = 120 * 1000;

// Snapshot factory matching what SweepAgent.stallSnapshot feeds classifyStall.
function snap(over = {}) {
  return {
    startedAt: NOW - 10 * MIN,
    guild: 'thief',
    room: 'sewers_1',
    kills: 0,
    circles: 0,
    trains: 0,
    refusalTimes: [],
    roomChangedAt: NOW - 5 * MIN,
    lastProgressAt: NOW - 5 * MIN,
    lowHpSince: null,
    inCombat: false,
    ...over,
  };
}

const refusalsInWindow = (n, spreadMin = 1) =>
  Array.from({ length: n }, (_, i) => NOW - Math.round((spreadMin * MIN * i) / n));

test('productive agent in a refusal storm is never "stalled" (thief-human regression)', () => {
  const st = snap({
    kills: 4,
    trains: 18,
    refusalTimes: refusalsInWindow(20), // well over STALL_REFUSALS
    lastProgressAt: NOW - 30 * 1000,    // killed/moved seconds ago
  });
  const v = classifyStall(st, NOW);
  // 4 kills in 10m (~24/h) legitimately reads "slow" vs the thief baseline —
  // that's honest pacing signal. The bug was the hard "stalled — refusal
  // storm" verdict on a killing agent.
  assert.notEqual(v.verdict, 'stalled');
});

test('killless but actively moving through refusals is not a storm-stall', () => {
  const st = snap({
    startedAt: NOW - 2 * MIN, // past grace, below SLOW_MIN_MS so only these rules apply
    refusalTimes: refusalsInWindow(16),
    lastProgressAt: NOW - 20 * 1000, // fresh moves keep arriving
    roomChangedAt: NOW - 40 * 1000,
  });
  const v = classifyStall(st, NOW);
  assert.equal(v.verdict, 'healthy');
});

test('idle + killless + storming still reads stalled', () => {
  const st = snap({
    startedAt: NOW - 2 * MIN,
    roomChangedAt: NOW - 90 * 1000, // recent arrival — no wedge signature
    refusalTimes: refusalsInWindow(15),
    lastProgressAt: NOW - 5 * MIN, // silent far beyond STALL_SILENCE_MS
  });
  const v = classifyStall(st, NOW);
  assert.equal(v.verdict, 'stalled');
  assert.match(v.reason, /refusal storm/);
});

test('resting between fights in the same room is not parked-idle', () => {
  // Kills keep arriving but the agent hasn't changed rooms in minutes —
  // normal arena behavior, must stay healthy.
  const st = snap({
    kills: 3,
    startedAt: NOW - 2 * MIN, // past grace, below SLOW_MIN_MS so only these rules apply
    lastProgressAt: NOW - 20 * 1000,
    roomChangedAt: NOW - 5 * MIN,
  });
  const v = classifyStall(st, NOW);
  assert.equal(v.verdict, 'healthy');
});

test('wedged: parked in one room, climbing refusals, zero kills', () => {
  const st = snap({
    startedAt: NOW - 8 * MIN,
    refusalTimes: refusalsInWindow(8),
    roomChangedAt: NOW - 5 * MIN, // parked past WEDGE_ROOM_MS
  });
  const v = classifyStall(st, NOW);
  assert.equal(v.verdict, 'wedged');
  assert.match(v.reason, /parked in sewers_1/);
});

test('silent agent wedges after WEDGE_SILENCE_MS', () => {
  const st = snap({ lastProgressAt: NOW - 7 * MIN });
  const v = classifyStall(st, NOW);
  assert.equal(v.verdict, 'wedged');
  assert.match(v.reason, /no progress/);
});

test('low kill rate reads slow once past SLOW_MIN_MS', () => {
  const st = snap({
    guild: 'barbarian', // baseline 90/h -> slow floor 36/h
    kills: 1,           // ~7.5/h over 8 minutes
    lastProgressAt: NOW - 10 * 1000,
  });
  const v = classifyStall(st, NOW);
  assert.equal(v.verdict, 'slow');
  assert.match(v.reason, /baseline/);
});

test('grace window never judges a fresh run', () => {
  const st = snap({ startedAt: NOW - 30 * 1000, lastProgressAt: NOW - 30 * 1000 });
  const v = classifyStall(st, NOW);
  assert.equal(v.verdict, 'healthy');
  assert.match(v.reason, /warming up/);
});
