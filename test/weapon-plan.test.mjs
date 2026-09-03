// Regression tests: if_N must jump to labels (DR branch-if-variable-set),
// and the weapon plan must emit both the full-kit buy block and rotation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunner } from '../public/js/script-engine.js';
import { buildHuntScript } from '../scripts/lib/script-gen.mjs';
import { ITEMS } from '../data/items.js';
import { roomById } from '../data/world.js';
import { npcById } from '../data/npcs.js';

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
  assert.match(src, /put buy sling/, 'buys sling');
  assert.doesNotMatch(src, /put buy throwing knives/, 'never requests an unstocked weapon');
  assert.match(src, /put buy mace/, 'buys mace');
  assert.match(src, /PLAN_DONE:/, 'plan block terminates');
});

test('every generated Barbarian weapon purchase resolves in the Crossing bazaar', () => {
  const stock = (roomById('bazaar').npcs || [])
    .map(npcById)
    .filter((n) => n?.role === 'shop')
    .flatMap((n) => Object.keys(n.stock || {}))
    .map((id) => ITEMS[id])
    .filter(Boolean);
  const allItems = Object.values(ITEMS);
  const caps = [
    {}, { closeNth: true },
    { closeNth: true, edgedKit: true, weaponAware: true },
    { closeNth: true, cheapWeaponKit: true, weaponAware: true },
    { closeNth: true, shieldKit: true },
    { closeNth: true, shieldKit: true, cheapWeaponKit: true },
  ];
  for (const extra of caps) {
    const src = buildHuntScript({
      cap: { guild: 'barbarian', scriptBase: 'tb', trainList: [], bazaarPath: e('n'), ...extra },
      arena: { id: 'sewers_1', hall: e('n'), loop: e('n'), fromHere: e('w'), fromArmed: e('s') },
      hallPath: e('n'),
    });
    for (const line of src.matchAll(/^\s*put buy (.+)$/gm)) {
      const noun = line[1].trim().split(/\s+/)[0]; // command dispatcher passes arg1
      const intended = allItems.find((i) => i.id === noun || i.name.includes(noun));
      if (intended?.type !== 'weapon') continue;
      const sold = stock.find((i) => i.id === noun || i.name.includes(noun));
      assert.ok(sold?.type === 'weapon', `${JSON.stringify(extra)} requests unavailable weapon "${line[1]}"`);
    }
  }
});

test('armed plan refresh preserves the current weapon across regeneration', () => {
  const src = buildHuntScript({
    cap: { guild: 'barbarian', scriptBase: 'tb', trainList: [], bazaarPath: e('n'), closeNth: true, edgedKit: true, weaponAware: true },
    arena: { id: 'sewers_1', hall: e('n'), loop: e('n'), fromHere: e('w'), fromArmed: e('s') },
    hallPath: e('n'),
  });
  assert.match(src, /matchre ARMED_NOW Worn:/, 'armed state is detected before upgrade gates');
  assert.match(src, /ARMED_NOW:[\s\S]*setvariable armed 1[\s\S]*ifge silver 562 goto GETWEAPON/, 'armed refresh may provision without losing state');
  assert.match(src, /PLAN_DONE:[\s\S]*ife armed 1 goto BUY_ARMOR/, 'armed refresh skips first-weapon re-wield');
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
