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
