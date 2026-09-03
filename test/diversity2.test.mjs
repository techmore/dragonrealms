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
import { buildCircleScript, buildHuntScript, trainListFromMissing } from '../scripts/lib/script-gen.mjs';

const e = (...d) => d.map((x) => ({ dir: x, to: 'y' }));
const mkCircle = (extra = {}) => buildCircleScript({
  cap: { guild: 'barbarian', scriptBase: 'tb', trainList: [], ...extra },
  fromArena: { back: e('s') },
  errands: { bazaarPath: e('n'), sellLoot: ['rat_pelt'], returnPath: e('s') },
});

test('TDP floor is a supervisor decision, never a skill-exp gate in the circle script', () => {
  assert.doesNotMatch(mkCircle(), /iflt tdp/);
  assert.doesNotMatch(mkCircle({ tdpFloor: 4 }), /iflt tdp/);
  assert.doesNotMatch(mkCircle(), /tdptrain/);
});

test('circle script expands Barbarian ability learning with the live circle', () => {
  const c1 = mkCircle({ circle: 1 });
  const c2 = mkCircle({ circle: 2 });
  const learnCount = (src) => (src.match(/^  put learn /gm) || []).length;
  assert.equal(learnCount(c1), 1, 'circle 1 has one available ability slot');
  assert.equal(learnCount(c2), 2, 'circle 2 exposes the newly available slot');
});

test('circle attempt precedes silver-based skill training', () => {
  const src = mkCircle({ tdpFloor: 4 });
  const circle = src.indexOf('put circle');
  assert.ok(circle >= 0, 'circle attempt remains present');
  assert.doesNotMatch(src, /tdptrain/);
});

test('Nth retargeting uses the circle-eligible pool, not the broader guild curriculum', () => {
  const ranks = {
    athletics: 49,
    perception: 16,
    foraging: 14,
    hunting: 107,
    skinning: 2,
  };
  const missing = '4th survival at least rank 3 (your 4th is 2)';
  assert.deepEqual(
    trainListFromMissing(missing, 'barbarian', { targetNth: true, ranks }),
    ['skinning'],
    'skinning is the fourth eligible survival skill; hunting is not eligible',
  );
});

test('hunt script leaves the bazaar through its bazaar-origin route after provisioning', () => {
  const src = buildHuntScript({
    cap: { guild: 'barbarian', race: 'gortog', char: 'Test', scriptBase: 'tb', bazaarPath: [{ dir: 'e' }], closeNth: true },
    arena: { id: 'sewers_1', fromHere: [{ dir: 'n' }], fromArmed: [{ dir: 'w' }] },
  });
  const bazaarLabel = src.indexOf('\nARMED_FROM_BAZAAR:\n') + 1;
  const normalLabel = src.indexOf('\nARMED:\n') + 1;
  assert.ok(bazaarLabel > normalLabel, 'bazaar-origin route is explicit');
  const armorSegment = src.slice(src.indexOf('BUY_ARMOR:'), src.indexOf('BROKE:'));
  assert.match(armorSegment, /goto ARMED_FROM_BAZAAR/);
  assert.doesNotMatch(armorSegment, /goto ARMED\n/);
  assert.match(src.slice(bazaarLabel, src.indexOf('ARMED_HERE:')), /move w/);
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

test('shieldLadder buys and wears a shield plus four independent weapon lanes', () => {
  const src = mkHunt({ shieldKit: true, armorStack: true });
  assert.match(src, /put buy wooden shield/);
  assert.match(src, /put wear wooden shield/);
  assert.match(src, /matchre PLAN_WEAPONS Worn:\[\\s\\S\]\*shield\|carrying:\[\\s\\S\]\*shield/);
  for (const weapon of ['dagger', 'club', 'broadsword', 'greatsword']) {
    assert.match(src, new RegExp(`put buy ${weapon}`), weapon);
  }
  for (const skill of ['small_edged', 'blunt', 'large_edged', 'twohanded_edged']) {
    assert.match(src, new RegExp(`iflt wsr_${skill} 12`), skill);
  }
  const labels = src.match(/^[A-Za-z_0-9]+:/gm)?.map((l) => l.slice(0, -1)) || [];
  assert.deepEqual(labels.filter((l, i) => labels.indexOf(l) !== i), [], 'no label dupes');
  assert.ok(!mkHunt({}).includes('buy wooden shield'), 'shield remains opt-in');
});

test('shieldLadder retries the shield during a later hall errand', () => {
  const src = mkCircle({ closeNth: true, helmRetry: true, armorStack: true, shieldKit: true, tdpFloor: 4 });
  const retry = src.slice(src.indexOf('SHIELD_RETRY:'), src.indexOf('ERRAND_DONE:'));
  assert.match(retry, /iflt silver 75 ERRAND_DONE/);
  assert.match(retry, /matchre ERRAND_DONE Worn:[\s\S]*shield/);
  assert.match(retry, /put buy wooden shield/);
  assert.match(retry, /put wear wooden shield/);
});

test('cheapWeaponKit is a standalone four-lane kit with errand retries', () => {
  const hunt = mkHunt({ closeNth: true, cheapWeaponKit: true, weaponAware: true });
  for (const weapon of ['dagger', 'sling', 'club', 'staff']) {
    assert.match(hunt, new RegExp(`put buy ${weapon}`), weapon);
  }
  assert.doesNotMatch(hunt, /put buy throwing knives/, 'every cheap lane must exist in bazaar stock');
  assert.match(hunt, /ARMED_NOW Worn:.*sling/, 'a wielded sling survives watchdog arm checks');
  assert.match(hunt, /ifge silver 112 goto GETWEAPON/, 'retry as soon as a missing club or staff is affordable');
  assert.match(hunt, /matchre BUY_SKIP_DAGGER Worn:/, 'owned lanes are not repurchased');
  assert.ok(!hunt.includes('buy wooden shield'), 'cheap kit does not implicitly buy a shield');

  const circle = mkCircle({ closeNth: true, cheapWeaponKit: true, tdpFloor: 4 });
  for (const [tag, noun, cost] of [
    ['DAGGER', 'dagger', 25], ['SLING', 'sling', 20],
    ['CLUB', 'club', 112], ['STAFF', 'staff', 112],
  ]) {
    assert.match(circle, new RegExp(`WEAPON_RETRY_${tag}:`));
    assert.match(circle, new RegExp(`iflt silver ${cost}`));
    assert.match(circle, new RegExp(`put buy ${noun}`));
  }
});

test('weaponFirst reserves starter purse for a second 112-silver lane', () => {
  const hunt = mkHunt({ closeNth: true, cheapWeaponKit: true, weaponFirst: true });
  assert.match(hunt, /BUY_DAGGER:[\s\S]*BUY_CLUB:[\s\S]*BUY_SLING:[\s\S]*BUY_STAFF:/);
});

test('weaponReserve defers sling until after staff', () => {
  const hunt = mkHunt({ closeNth: true, cheapWeaponKit: true, weaponReserve: true });
  assert.match(hunt, /BUY_DAGGER:[\s\S]*BUY_CLUB:[\s\S]*BUY_STAFF:[\s\S]*BUY_SLING:/);
});

test('weaponReserveV2 defers armor provisioning while staff is missing', () => {
  const hunt = buildHuntScript({
    cap: { guild: 'barbarian', scriptBase: 'tb', trainList: [], bazaarPath: e2('n'), closeNth: true, cheapWeaponKit: true, weaponReserveV2: true },
    arena: { id: 'sewers_1', hall: e2('n'), loop: e2('n'), fromHere: e2('w'), fromArmed: e2('s') },
    candidates: [{ id: 'sewers_2', fromHere: e2('n') }], hallPath: e2('n'),
  });
  assert.match(hunt, /RESERVE_HAVE_STAFF/);
  assert.match(hunt, /ifge silver 112 goto GETWEAPON/);
  assert.ok(hunt.indexOf('RESERVE_HAVE_STAFF:') < hunt.indexOf('put buy padded cloth armor'));
  assert.match(hunt, /PICK_ROOM_DONE:[\s\S]*ifgt pcount 0 goto SCAN/);
});

test('weaponReserveV3 does not buy sling before staff is owned', () => {
  const hunt = mkHunt({ closeNth: true, cheapWeaponKit: true, weaponReserveV3: true });
  const sling = hunt.indexOf('BUY_SLING:');
  const ready = hunt.indexOf('STAFF_READY:');
  assert.ok(ready > sling);
  assert.match(hunt.slice(sling, ready), /goto BUY_SKIP_SLING/);
});
