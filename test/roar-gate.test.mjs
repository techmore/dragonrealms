// roarSmart variant: the signature roar must be gated behind %rage when
// cap.skipRage is set, and left ungated otherwise.
//
// Why: rage lasts 12 ticks (server/combat.js rageTicks=12) while a fight lasts
// ~2, so an ungated per-fight roar is refused with "The rage already burns in
// you" on every fight after the first — charged roundtime, stalled swing
// block, fidelity-log noise. The refused roar banks NO augmentation either way
// (the useAbility wrapper gates on res.ok), so skipping costs zero exp.
//
// Labels are PER-SPECIES (RAGE_LIT_<sp>) because the engine's label map is
// last-definition-wins: shared labels across species blocks made a creature of
// species A jump into species B's fight block (multi-species arenas like
// sewers_3). Each species block must carry its own gate label.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHuntScript } from '../scripts/lib/script-gen.mjs';

const e = (...d) => d.map((x) => ({ dir: x, to: 'y' }));
const mk = (skipRage) => {
  const src = buildHuntScript({
    cap: {
      guild: 'barbarian', scriptBase: 'tb', trainList: [],
      bazaarPath: e('n'), skipRage,
    },
    arena: { id: 'sewers_1', hall: e('n'), loop: e('n'), fromHere: e('w'), fromArmed: e('s') },
    hallPath: e('n'),
  });
  // last-wins means the first species block is also the LAST defined one for
  // sewers_1 ("rat","rat" dedupes to one species) — slice from its FIGHT label.
  const seg = src.slice(src.indexOf('FIGHT_rat:'));
  return { src, seq: seg.split('\n').map((l) => l.trim()) };
};

test('skipRage variant gates the roar on %rage', () => {
  const { src, seq } = mk(true);
  const gate = seq.indexOf('ifge rage 1 goto RAGE_LIT_rat');
  const roar = seq.findIndex((l) => l.startsWith('put roar'));
  const label = seq.indexOf('RAGE_LIT_rat:');
  assert.ok(gate > -1, `an ifge rage guard exists (${src.split('\n').find((l) => l.includes('ifge rage'))})`);
  assert.ok(roar > gate, 'roar sits AFTER the guard');
  assert.ok(label === roar + 1, `RAGE_LIT_rat label follows the roar directly (got idx ${label}, roar ${roar})`);
});

test('baseline (no skipRage) keeps the ungated roar — one knob, no drift', () => {
  const { seq } = mk(false);
  assert.equal(seq.filter((l) => l.startsWith('put roar')).length, 1,
    'exactly one roar line');
  assert.ok(!seq.some((l) => l.includes('RAGE_LIT')), 'no rage gate in baseline');
});

// The generator previously emitted shared labels TARGET_GONE/FIGHT_NOW/
// SCAN_DONE once per species; the engine resolves labels LAST-definition-wins,
// so with a multi-species arena every match hit jumped into the final block.
test('fight-block labels are unique per species', () => {
  const mkMulti = () => buildHuntScript({
    cap: { guild: 'barbarian', scriptBase: 'tb', trainList: [], bazaarPath: e('n') },
    arena: { id: 'sewers_3', fromHere: e('w'), fromArmed: e('s') },
    hallPath: e('n'),
  });
  const defs = mkMulti().match(/^[A-Za-z_0-9]+:/gm)?.map((l) => l.slice(0, -1)) || [];
  const dupes = defs.filter((l, i) => defs.indexOf(l) !== i);
  assert.deepEqual(dupes, [], 'no duplicate label definitions');
});
