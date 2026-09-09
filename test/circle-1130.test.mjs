// 11-30 circle-band verification: every transcribed guild row carries its own
// inc1130 from docs/elanthipedia/<Guild>.md "Circle Requirements" (1-10 +
// 11-30 columns), so circle 11+ gates use real per-row increments instead of
// the barbarian-derived BANDS_11_30 fallback. Anchors below are hand-computed
// from the wiki columns: need(c) = band110 * min(c,10) + inc1130 * max(0, c-10).
import test from 'node:test';
import assert from 'node:assert/strict';
import { GUILDS, circleRequirements, circleRequirementSummary } from '../data/guilds.js';

function needAt(guildId, label, circle) {
  const { rows } = circleRequirements(GUILDS[guildId], {}, circle);
  const row = rows.find((r) => r.label === label);
  assert.ok(row, `${guildId} c${circle} should have a "${label}" row`);
  return row.need;
}

test('every non-necromancer row carries its own inc1130', async (t) => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../data/guilds.js', import.meta.url), 'utf8');
  const tableSrc = src.slice(src.indexOf('const CIRCLE_TABLES'), src.indexOf('// Cumulative ranks required'));
  for (const guildId of Object.keys(GUILDS)) {
    const start = tableSrc.indexOf(`\n  ${guildId}: [`); // eslint-disable-line no-continue
    if (start < 0) continue; // eslint-disable-line no-continue
    const end = tableSrc.indexOf('\n  ],', start);
    const block = tableSrc.slice(start, end);
    const rows = block.match(/\{ (?:skill|nth):[^}]*\}/g) || [];
    assert.ok(rows.length > 0, `${guildId} has table rows`);
    for (const r of rows) {
      if (guildId === 'necromancer') continue; // eslint-disable-line no-continue
      assert.match(r, /inc1130: \d+/, `${guildId} row ${r} must carry inc1130`);
    }
  }
});

test('circle-20 anchors from the wiki 11-30 columns', () => {
  assert.equal(needAt('barbarian', '1st weapon', 20), 90, 'barb 4*10+5*10');
  assert.equal(needAt('bard', 'parry', 20), 50, 'bard parry 2*10+3*10 (fallback said 40)');
  assert.equal(needAt('bard', '1st weapon', 20), 60, 'bard 1st weapon 3*10+3*10 (fallback said 70)');
  assert.equal(needAt('cleric', 'theurgy', 20), 70, 'cleric theurgy 3*10+4*10');
  assert.equal(needAt('empath', 'empathy', 20), 90, 'empath empathy 4*10+5*10');
  assert.equal(needAt('moonmage', '1st magic', 20), 80, 'moonmage 1st magic 4*10+4*10');
  assert.equal(needAt('paladin', '1st armor', 20), 90, 'paladin 1st armor 4*10+5*10');
  assert.equal(needAt('ranger', '1st survival', 20), 80, 'ranger 1st survival 4*10+4*10');
  assert.equal(needAt('thief', '1st survival', 20), 80, 'thief 1st survival 4*10+4*10');
  assert.equal(needAt('trader', 'trading', 20), 90, 'trader trading 4*10+5*10');
  assert.equal(needAt('warmage', 'summoning', 20), 70, 'warmage summoning 3*10+4*10');
});

test('band-0 rows activate only past circle 10', () => {
  // Cleric 4th Magic: 0/circle in 1-10, 3/circle in 11-30.
  assert.equal(needAt('cleric', '4th magic', 11), 3);
  assert.equal(needAt('cleric', '4th magic', 20), 30);
  assert.equal(needAt('warmage', '2nd weapon', 20), 30);
  assert.equal(needAt('moonmage', '5th magic', 20), 30);
  const c10 = circleRequirementSummary(GUILDS.cleric, 10).join('\n');
  assert.doesNotMatch(c10, /4th magic/, 'no 4th-magic gate at c10');
  const c11 = circleRequirementSummary(GUILDS.cleric, 11).join('\n');
  assert.match(c11, /4th magic 3/, '4th-magic gate appears at c11 with need 3');
});

test('empath cumulative anchors match the wiki Cumulative table @30', () => {
  // docs/elanthipedia/Empath.md "Cumulative": Empathy 40|140, Scholarship
  // 30|90, 1st Lore 30|90, 2nd Lore 20|80, 3rd Lore 20|60, 1st Magic 30|90,
  // 2nd Magic 20|80, 3rd Magic 20|80, 4th Magic 0|40.
  const at30 = (label) => needAt('empath', label, 30);
  assert.equal(at30('empathy'), 140);
  assert.equal(at30('scholarship'), 90);
  assert.equal(at30('1st lore'), 90);
  assert.equal(at30('2nd lore'), 80);
  assert.equal(at30('3rd lore'), 60);
  assert.equal(at30('1st magic'), 90);
  assert.equal(at30('2nd magic'), 80);
  assert.equal(at30('3rd magic'), 80);
  assert.equal(at30('4th magic'), 40);
});

test('circle-10 gates unchanged by the transcription', () => {
  // Spot-check that 1-10 bands were not disturbed: need(c10) = band * 10.
  assert.equal(needAt('bard', 'parry', 10), 20);
  assert.equal(needAt('cleric', 'theurgy', 10), 30);
  assert.equal(needAt('warmage', '1st magic', 10), 40);
  assert.equal(needAt('thief', '1st survival', 10), 40);
});
