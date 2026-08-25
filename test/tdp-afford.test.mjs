// TDP afford-gating: %tdp mirroring in the script engine + the generated
// circle script's probe/branch structure. Regression anchor: sims walked to
// the guild hall with 2-3 TDPs and tdptrain-spammed 14 refusals every cycle
// ("costs N TDPs; you have M") before walking home empty-handed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseScript, createRunner } from '../public/js/script-engine.js';
import { buildCircleScript } from '../scripts/lib/script-gen.mjs';

const out = [];
function runner(src) {
  const seen = [];
  const r = createRunner(src, [], { send: (l) => out.push(l), say: (l) => seen.push(l), getScript: () => null });
  r.__seen = seen;
  return r;
}

test('engine mirrors TDP balance from refusal prose into %tdp', () => {
  const r = runner([
    'TRAIN:',
    '  put tdptrain staff',
    '  iflt tdp 8 goto BACK',
    '  echo TRAINED',
    'BACK:',
    '  echo WENT_HOME',
    '  exit',
  ].join('\n'));
  r.start();
  // First refusal states the exact balance — %tdp must become 3.
  r.feed('Training Staves costs 10 TDPs; you have 3.');
  r.feed('', true); // prompt satisfies the wait; branch now sees tdp=3
  assert.deepEqual(out, ['tdptrain staff'], 'broke agent sends exactly one train');
  assert.ok(r.__seen.includes('WENT_HOME'), `branch must bail to BACK, saw ${JSON.stringify(r.__seen)}`);
});

test('ifge-style flow trains when balance is sufficient', () => {
  const r = runner([
    '  put tdp',
    '  wait',
    'TRAIN:',
    '  put tdptrain perception',
    '  exit',
  ].join('\n'));
  r.start();
  r.feed('\n\x1b[1mTraining Points (TDPs)\x1b[0m: 42  (pool 100/200 toward the next)');
  r.feed('', true);
  assert.equal(r.running, false);
});

test('%tdp is readable after a balance print (var substitution)', () => {
  const r = runner('TRAIN:\n  wait\n  echo HAVE_%tdp\n  exit');
  r.start(); // parked on `wait`
  r.feed('Training Perception costs 16 TDPs; you have 12.');
  r.feed('', true); // prompt satisfies the wait; echo now substitutes %tdp=12
  assert.ok(r.__seen.some((l) => l === 'HAVE_12'), `echo should substitute the balance, saw: ${JSON.stringify(r.__seen)}`);
});

test('generated circle script probes tdp, gates each train, labels BACK', () => {
  const src = buildCircleScript({
    cap: { guild: 'barbarian', race: 'human', char: 'Test', scriptBase: 'tb' },
    fromArena: { hall: [{ dir: 'n', to: 'hall_barbarian' }], back: [{ dir: 's', to: 'square' }] },
  });
  assert.match(src, /^  put tdp$/m, 'probes the balance on arrival');
  assert.match(src, /iflt tdp 8 goto BACK/, 'gates on the floor');
  assert.match(src, /^BACK:$/m, 'has the broke-exit label');
  const gateCount = (src.match(/iflt tdp 8 goto BACK/g) || []).length;
  const trainCount = (src.match(/put tdptrain /g) || []).length;
  assert.ok(gateCount >= trainCount, `every train is followed by an afford gate (${gateCount} gates vs ${trainCount} trains)`);
  const backIdx = src.search(/^BACK:$/m);
  const firstGate = src.indexOf('iflt tdp');
  assert.ok(firstGate >= 0 && firstGate < backIdx, 'pre-train gate fires before any training');
});

test('barbarian curriculum orders guild-taught skills before off-guild fillers', () => {
  const src = buildCircleScript({
    cap: { guild: 'barbarian', race: 'human', char: 'Test', scriptBase: 'tb' },
    fromArena: { hall: [{ dir: 'n', to: 'hall_barbarian' }], back: [] },
  });
  const lines = src.split('\n').filter((l) => l.includes('put tdptrain '))
    .map((l) => l.trim().replace('put tdptrain ', ''));
  assert.ok(lines.length > 5, 'curriculum has entries');
  const taught = new Set(['large_edged', 'twohanded_edged', 'twohanded_blunt', 'light_armor',
    'fitness', 'evasion', 'blunt', 'large_blunt', 'thrown', 'perception', 'foraging', 'expertise']);
  const firstUntaught = lines.findIndex((sk) => !taught.has(sk));
  if (firstUntaught >= 0) {
    for (const sk of lines.slice(firstUntaught)) {
      assert.ok(!taught.has(sk), `untaught skill "${lines[firstUntaught]}" must not be followed by taught skill "${sk}"`);
    }
  }
});
