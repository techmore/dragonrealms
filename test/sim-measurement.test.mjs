import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIVITY_HEALTH_NOTE, activityHealthLabel, activityHealthCounts, observedCircleGain, circleProgressBadges } from '../public/js/sim-measurement.js';

const run = fields => ({ variant: 'baseline', startingCircle: 1, circle: 1, durationMs: 900000,
  stallVerdict: 'healthy', targetCircle: 2, boost: 1, statPolicy: 'none', ...fields });

test('activity health counts only known verdicts and never implies leveling completion', () => {
  const rows = [run(), run({stallVerdict:'stalled'}), run({stallVerdict:'wedged'}),
    run({stallVerdict:'slow'}), run({stallVerdict:null}), run({stallVerdict:'complete'})];
  assert.deepEqual(activityHealthCounts(rows), {healthy:1,slow:1,stalled:1,wedged:1,unknown:2});
  assert.equal(activityHealthLabel('healthy'),'active (no stall detected)');
  for (const value of [null,undefined,'complete','<img src=x>']) assert.equal(activityHealthLabel(value),'unknown');
  assert.equal(activityHealthLabel('stalled'),'stalled');
  assert.match(ACTIVITY_HEALTH_NOTE,/does not prove target completion/);
  assert.equal(circleProgressBadges(rows).eligibleCount,0,
    'completed native 15-minute observations can be activity-healthy yet gain no circle');
});

test('circle gains require known consistent starting and final circles', () => {
  assert.equal(observedCircleGain(run()),0);
  assert.equal(observedCircleGain(run({startingCircle:5,circle:7})),2);
  for (const fields of [{startingCircle:null,circle:2,circles:1}, {startingCircle:undefined,circle:5},
    {startingCircle:'1',circle:2}, {startingCircle:0,circle:2}, {startingCircle:1.5,circle:2},
    {startingCircle:2,circle:1}, {circle:null}, {circle:Infinity}]) {
    assert.equal(observedCircleGain(run(fields)),null);
  }
});

test('progress badges reward gains and gain rate rather than inherited circle or shorter zero-gain caps', () => {
  const unchanged = run({circle:20,startingCircle:20,durationMs:1000});
  const unknown = run({circle:50,startingCircle:null,durationMs:1000,circles:49});
  const volume = run({variant:'volume',startingCircle:5,circle:8,durationMs:900000});
  const efficiency = run({variant:'rate',startingCircle:1,circle:2,durationMs:60000,stallVerdict:'slow'});
  const result = circleProgressBadges([unchanged,unknown,volume,efficiency]);
  assert.equal(result.eligibleCount,2);
  assert.equal(result.volume.row,volume);
  assert.equal(result.volume.gain,3);
  assert.equal(result.efficiency.row,efficiency);
  assert.equal(result.efficiency.gain,1);
});

test('missing activity evidence, stalls and invalid durations do not earn circle progress badges', () => {
  const invalid = [run({circle:2,stallVerdict:null}),run({circle:2,stallVerdict:'stalled'}),
    run({circle:2,stallVerdict:'wedged'}),run({circle:2,durationMs:0}),
    run({circle:2,durationMs:NaN}),run({circle:2,durationMs:Infinity})];
  assert.deepEqual(circleProgressBadges(invalid),{fastest:null,volume:null,efficiency:null,eligibleCount:0});
  assert.deepEqual(circleProgressBadges([]),{fastest:null,volume:null,efficiency:null,eligibleCount:0});
});

test('actual badge renderer displays honest empty evidence without dereferencing an absent target winner', async () => {
  const { readFile } = await import('node:fs/promises');
  const { runInNewContext } = await import('node:vm');
  const source = await readFile(new URL('../public/sims.html', import.meta.url),'utf8');
  const start = source.indexOf('    function renderBuildBadges() {');
  const end = source.indexOf('    function renderLeaderboard()',start);
  assert.ok(start >= 0 && end > start);
  const body = {innerHTML:''}, state = {textContent:''};
  const render = rows => {
    runInNewContext(source.slice(start,end)+'\nrenderBuildBadges();', {
      RUNS: rows, circleProgressBadges,
      $: id => id === 'badge-body' ? body : state,
      esc: value => String(value ?? ''),
    });
    return body.innerHTML;
  };
  const empty = render([run({kills:9,deaths:0})]);
  assert.match(empty,/No qualifying observed circle gains/);
  assert.doesNotMatch(empty,/badge-card gold|Fastest to target/);
  assert.match(state.textContent,/0\/1.*observed circle gains/);
  for (const fields of [{startingCircle:null}, {stallVerdict:null}, {targetCircle:3},
    {targetCircle:1}, {targetCircle:'2'}, {timeToCircleMs:-1}, {timeToCircleMs:NaN},
    {timeToCircleMs:Infinity}, {timeToCircleMs:900001}]) {
    assert.doesNotMatch(render([run({circle:2,timeToCircleMs:60000,...fields})]),/Fastest to target/);
  }
  const positive = render([run({variant:'gainer',circle:2,timeToCircleMs:60000})]);
  assert.match(positive,/Most circles gained/);
  assert.match(positive,/\+1 circles/);
  assert.match(positive,/0\.07 gained\/min/);
  assert.match(positive,/Fastest to target/);
  assert.doesNotMatch(positive,/No qualifying/);
});


test('fastest target achievement requires measured gain, target attainment and valid bounded timing', () => {
  const valid = run({circle:2,timeToCircleMs:60000});
  const faster = run({variant:'faster',circle:3,targetCircle:3,timeToCircleMs:30000});
  const stale = run({startingCircle:2,circle:3,targetCircle:2,timeToCircleMs:100});
  const mismatched = run({circle:2,targetCircle:3,timeToCircleMs:100});
  const unknown = run({circle:2,startingCircle:null,timeToCircleMs:100});
  const result = circleProgressBadges([valid,stale,mismatched,unknown,faster]);
  assert.equal(result.fastest.row,faster);
  assert.equal(circleProgressBadges([stale,mismatched,unknown]).fastest,null);
  assert.equal(circleProgressBadges([run({circle:2,timeToCircleMs:900000})]).fastest.row.durationMs,900000,
    'completion exactly at the observed cap is valid');
});
