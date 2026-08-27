// Regression tests: if_N must jump to labels (DR branch-if-variable-set),
// and the weapon plan must emit both the full-kit buy block and rotation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunner } from '../public/js/script-engine.js';
import { buildHuntScript } from '../scripts/lib/script-gen.mjs';

const e = (...d) => d.map((x) => ({ dir: x, to: 'y' }));

test('if_N jumps to labels when the variable is set (DR branch-if-variable-set)', () => {
  const script = [
    'X:',
    '  setvariable 1 yes',
    '  if_1 goto TAKEN',
    '  put SEND not-taken',
    'TAKEN:',
  ].join('\n');
  const sent = [];
  createRunner(script, [], { send: async (l) => sent.push(l) }).start();
  assert.deepEqual(sent, [], 'jumps over the not-taken verb; script parks at end');
});

test('if_N inline-verb form still executes the rest of the line', () => {
  const s2 = ['X:', '  setvariable 2 v', '  if_2 put echo taken', 'Y:'].join('\n');
  const sent = [];
  createRunner(s2, [], { send: async (l) => sent.push(l) }).start();
  assert.deepEqual(sent, ['echo taken'], 'inline verb executes');
});

test('if_N falls through cleanly when the variable is unset', () => {
  const script = ['X:', '  if_9 goto NOPE', '  put SEND fell-through'].join('\n');
  const sent = [];
  createRunner(script, [], { send: async (l) => sent.push(l) }).start();
  assert.deepEqual(sent, ['SEND fell-through']);
});

test('weaponPlan emits a buy for every kit weapon', () => {
  const src = buildHuntScript({
    cap: { guild: 'barbarian', scriptBase: 'tb', trainList: [], bazaarPath: e('n') },
    arena: { id: 'sewers_1', hall: e('n'), loop: e('n'), fromHere: e('w'), fromArmed: e('s') },
    hallPath: e('n'),
  });
  assert.match(src, /put buy club/, 'buys club');
  assert.match(src, /put buy throwing knives/, 'buies knives');
  assert.match(src, /put buy mace/, 'buys mace');
  assert.match(src, /PLAN_DONE:/, 'plan block terminates');
});

test('rotation flips between the two first plan weapons per kill', () => {
  const src = buildHuntScript({
    cap: { guild: 'barbarian', scriptBase: 'tb', trainList: [], bazaarPath: e('n') },
    arena: { id: 'sewers_1', hall: e('n'), loop: e('n'), fromHere: e('w'), fromArmed: e('s') },
    hallPath: e('n'),
  });
  const seg = src.slice(src.indexOf('SD_rat:'));
  assert.match(seg, /if_1 goto ROT_A_rat/, 'dispatch uses goto-label form');
  assert.match(seg, /setvariable wphase 1/, 'sets phase after wielding B');
  assert.match(seg, /put wield club[\s\S]*?setvariable wphase(?!\s+1)/m, 'clears phase after wielding A');
});
