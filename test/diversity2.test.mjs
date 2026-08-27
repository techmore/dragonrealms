// diversity2 variant: cap-driven TDP floor (8 -> 4) + helm retry at the
// errand bazaar stop.
//
// Evidence (kjvh, diversity, 2026-08-27): "[hall-skip] only 4 TDPs" fired
// while shortfall sat at 10 — but tdptrain costs 4+3*rank, so 4 TDPs IS the
// cheapest useful spend (rank-0 member). And the diversity kit's iron helm
// never once bought: the first-visit gate needs 120s silver while
// club(112s)+knives+armor drain the 150s purse. The helm block must retry at
// the errand stop, which every hall trip reaches with banked loot silver.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCircleScript } from '../scripts/lib/script-gen.mjs';

const e = (...d) => d.map((x) => ({ dir: x, to: 'y' }));
const mkCircle = (extra = {}) => buildCircleScript({
  cap: { guild: 'barbarian', scriptBase: 'tb', trainList: [], ...extra },
  fromArena: { back: e('s') },
  errands: { bazaarPath: e('n'), sellLoot: ['rat_pelt'], returnPath: e('s') },
});

test('tdpFloor knob flows into the TRAIN afford-gate (default 8, diversity2 4)', () => {
  assert.match(mkCircle(), /iflt tdp 8 goto BACK/, 'default floor stays 8');
  const src = mkCircle({ tdpFloor: 4 });
  assert.match(src, /iflt tdp 4 goto BACK/, 'diversity2 floor is 4');
  assert.ok(!src.includes('iflt tdp 8'), 'no stale 8-gates when floor is 4');
});

test('helmRetry adds an errand-stop helm buy (purse refills from loot silver)', () => {
  const src = mkCircle({ closeNth: true, helmRetry: true });
  const seg = src.slice(src.indexOf('HELM_RETRY:'), src.indexOf('ERRAND_DONE:'));
  assert.match(seg, /put buy iron helm/, 'retries the helm buy at the bazaar');
  assert.match(seg, /put wear iron helm/, 'and wears it — armor exp needs a WORN piece');
  assert.match(seg, /iflt silver 130 ERRAND_DONE/, 'purse-gated with margin');
  assert.match(seg, /matchre ERRAND_DONE Worn:[\s\S]*helm/, 'skips if already worn');
  // Without the knob the block stays out (one-lever A/B).
  const plain = mkCircle({ closeNth: true });
  assert.ok(!plain.includes('HELM_RETRY:'), 'no helm retry without the knob');
});

test('helmRetry labels do not collide with existing circle-script labels', () => {
  const src = mkCircle({ closeNth: true, helmRetry: true, tdpFloor: 4 });
  const labels = src.match(/^[A-Za-z_0-9]+:/gm)?.map((l) => l.slice(0, -1)) || [];
  assert.deepEqual(labels.filter((l, i) => labels.indexOf(l) !== i), []);
  assert.ok(!src.includes('${'), 'no un-interpolated template text');
});

// armorStack knob (diversity2stack): stack WORN light_armor pieces — the
// server-verdict answer to "naked-tank" (exp needs the piece WORN and does
// not depend on damage soaked, so the only lever is MORE pieces).
import { buildHuntScript } from '../scripts/lib/script-gen.mjs';

const e2 = (...d) => d.map((x) => ({ dir: x, to: 'y' }));
const mkHunt = (extra = {}) => buildHuntScript({
  cap: { guild: 'barbarian', scriptBase: 'tb', trainList: [], bazaarPath: e2('n'), closeNth: true, ...extra },
  arena: { id: 'sewers_1', hall: e2('n'), loop: e2('n'), fromHere: e2('w'), fromArmed: e2('s') },
  hallPath: e2('n'),
});

test('armorStack emits purse-gated buy+wear for sleeves/boots/leggings', () => {
  const src = mkHunt({ armorStack: true });
  for (const [tag, noun] of [['SLEEVES', 'leather sleeves'], ['BOOTS', 'leather boots'], ['LEGGINGS', 'leather leggings']]) {
    const seg = src.slice(src.indexOf(`STACK_${tag}:`), src.indexOf(`STACK_NEXT_${tag}:`));
    assert.match(seg, new RegExp(`put buy ${noun}`), tag);
    assert.match(seg, new RegExp(`put wear ${noun}`), tag);
    assert.match(seg, /iflt silver \d+ STACK_NEXT_/, `${tag} purse-gated`);
  }
  const plain = mkHunt({});
  assert.ok(!plain.includes('STACK_SLEEVES'), 'no stack block without the knob');
});

test('armorStack retry rides the errand stop on circle trips', () => {
  const src = mkCircle({ closeNth: true, helmRetry: true, tdpFloor: 4, armorStack: true });
  assert.match(src, /put buy leather sleeves/, 'retries stack buys at hall trips');
  const labels = src.match(/^[A-Za-z_0-9]+:/gm)?.map((l) => l.slice(0, -1)) || [];
  assert.deepEqual(labels.filter((l, i) => labels.indexOf(l) !== i), [], 'no label dupes');
  assert.ok(!src.includes('${'), 'no un-interpolated template text');
});
