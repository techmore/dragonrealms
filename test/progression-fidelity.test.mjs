// Cross-system invariants for the circle-10 progression contract. Source
// values come from docs/elanthipedia/<Guild>.md, "Circle Requirements" and
// "Cumulative" tables (local mirror captured 2026-08-12).
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'dr-progression-fidelity-'));
process.env.DR_DB_PATH = join(tmp, 'test.db');

const {
  GUILDS,
  circleRequirementSummary,
  circleRequirements,
  spellTierFor,
  SPELL_TIER_RANKS,
} = await import('../data/guilds.js');
const { SKILLS } = await import('../data/skills.js');
const { RANK_CAP } = await import('../server/player.js');
const { closeDb } = await import('../server/db.js');

after(() => {
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

function rankedSkills(rank = 0) {
  return Object.fromEntries(Object.keys(SKILLS).map((id) => [id, { rank, exp: 0 }]));
}

// Representative named and Nth rows for every guild. These are cumulative
// circle-10 ranks: each source 1-10 figure is paid once per circle.
const SOURCE_CIRCLE_10 = {
  barbarian: ['expertise (hard) 40', 'melee_mastery (hard) 40', 'tactics (hard) 10', '1st weapon 40', '4th weapon 10', '1st armor 30', '1st supernatural 10'],
  bard: ['performance (hard) 40', '1st weapon 30', '1st lore 30', '3rd lore 20', '4th magic 10'],
  cleric: ['shield_usage (hard) 10', 'theurgy (hard) 30', '1st weapon 30', '1st magic 40', '3rd lore 10'],
  empath: ['empathy (hard) 40', 'scholarship (hard) 30', 'first_aid (hard) 20', '1st lore 30', '3rd magic 20'],
  moonmage: ['scholarship (hard) 30', 'astrology (hard) 30', '1st magic 40', '4th magic 20', '4th survival 20'],
  necromancer: ['thanatology (hard) 30', '1st survival 40', '7th survival 20', '1st magic 30', 'small_edged (hard) 10'],
  paladin: ['conviction (hard) 30', 'defending (hard) 30', '1st armor 40', '1st weapon 30', 'evasion (hard) 20'],
  // Ranger "Instinct" is First Aid under its display name — soft in source.
  ranger: ['first_aid 20', '1st survival 40', '8th survival 20', '1st weapon 30', '2nd weapon 10', '1st armor 20'],
  // Thief "Inner Magic" is Primary Magic renamed for the thief skillset.
  thief: ['thievery 20', 'stealth 20', 'primary_magic (hard) 10', '1st survival 40', '8th survival 10', '1st weapon 30', '3rd lore 10', '1st magic 10'],
  trader: ['trading (hard) 40', 'appraisal (hard) 30', '1st lore 30', '1st survival 30', '2nd armor 10'],
  warmage: ['summoning (hard) 30', 'targeted_magic 40', '1st magic 40', '1st weapon 30', '1st armor 20'],
};

// Every guild's full requirement set must equal the source 1-10 bands ×10.
// Values transcribed from docs/elanthipedia/<Guild>.md "Circle Requirements"
// columns; the "Cumulative"@10 column anchors them (band × 10 == cum@10).
// Necromancer/Ranger archive pages lack Cumulative tables (archive gap);
// their bands were hand-checked against the per-circle increments instead.
const FULL_WIKI_AT_10 = {
  barbarian: { expertise: 40, melee_mastery: 40, inner_fire: 10, '1st supernatural': 10, parry: 40, '1st weapon': 40, '2nd weapon': 40, '3rd weapon': 20, '4th weapon': 10, '1st armor': 30, '2nd armor': 10, evasion: 30, '1st survival': 20, '2nd survival': 20, '3rd survival': 20, '4th survival': 10, tactics: 10, '1st lore': 10, '2nd lore': 10 },
  bard: { '1st armor': 20, parry: 20, '1st weapon': 30, '2nd weapon': 20, performance: 40, tactics: 20, '1st lore': 30, '2nd lore': 30, '3rd lore': 20, '1st magic': 30, '2nd magic': 20, '3rd magic': 20, '4th magic': 10, '1st survival': 10, '2nd survival': 10, '3rd survival': 10, '4th survival': 10 },
  cleric: { shield_usage: 10, '1st armor': 20, parry: 20, '1st weapon': 30, '1st lore': 20, '2nd lore': 20, '3rd lore': 10, theurgy: 30, attunement: 20, '1st magic': 40, '2nd magic': 40, '3rd magic': 30, '1st survival': 10, '2nd survival': 10, '3rd survival': 10, '4th survival': 10 },
  empath: { empathy: 40, scholarship: 30, '1st lore': 30, '2nd lore': 20, '3rd lore': 20, '1st magic': 30, '2nd magic': 20, '3rd magic': 20, first_aid: 20, foraging: 10, '1st survival': 10, '2nd survival': 10, '3rd survival': 10 },
  moonmage: { scholarship: 30, '1st lore': 20, '2nd lore': 20, '3rd lore': 10, astrology: 30, '1st magic': 40, '2nd magic': 40, '3rd magic': 30, '4th magic': 20, '1st survival': 20, '2nd survival': 20, '3rd survival': 20, '4th survival': 20 },
  necromancer: { thanatology: 30, '1st survival': 40, '2nd survival': 40, '3rd survival': 30, '4th survival': 30, '5th survival': 30, '6th survival': 30, '7th survival': 20, targeted_magic: 20, '1st magic': 30, '2nd magic': 30, '3rd magic': 20, '4th magic': 20, '1st lore': 20, '2nd lore': 20, small_edged: 10, '1st armor': 10 },
  paladin: { conviction: 30, defending: 30, shield_usage: 20, '1st armor': 40, '2nd armor': 20, parry: 30, '1st weapon': 30, tactics: 10, scholarship: 10, '1st lore': 20, '2nd lore': 10, '3rd lore': 10, '1st magic': 10, '2nd magic': 10, '3rd magic': 10, evasion: 20, '1st survival': 10, '2nd survival': 10, '3rd survival': 10, '4th survival': 10 },
  ranger: { first_aid: 20, '1st survival': 40, '2nd survival': 40, '3rd survival': 30, '4th survival': 30, '5th survival': 30, '6th survival': 20, '7th survival': 20, '8th survival': 20, '1st weapon': 30, '2nd weapon': 10, parry: 20, '1st armor': 20, defending: 10, '1st magic': 10, '2nd magic': 10, '3rd magic': 10, '1st lore': 10 },
  thief: { thievery: 20, stealth: 20, primary_magic: 10, '1st survival': 40, '2nd survival': 40, '3rd survival': 30, '4th survival': 30, '5th survival': 30, '6th survival': 20, '7th survival': 20, '8th survival': 10, '1st weapon': 30, '2nd weapon': 10, parry: 10, '1st armor': 20, '1st magic': 10, '1st lore': 10, '2nd lore': 10, '3rd lore': 10 },
  trader: { '1st armor': 20, '2nd armor': 10, '1st weapon': 10, trading: 40, appraisal: 30, '1st lore': 30, '2nd lore': 20, '3rd lore': 20, '1st survival': 30, '2nd survival': 20, '3rd survival': 20, '4th survival': 10, '5th survival': 10, '6th survival': 10 },
  warmage: { summoning: 30, targeted_magic: 40, '1st magic': 40, '2nd magic': 40, '3rd magic': 30, parry: 20, '1st weapon': 30, scholarship: 10, '1st lore': 20, '2nd lore': 20, '3rd lore': 10, defending: 10, '1st armor': 20, '1st survival': 10, '2nd survival': 10, '3rd survival': 10, '4th survival': 10 },
};

test('every requirement row equals the Elanthipedia band ×10 for all 11 guilds', () => {
  for (const [guildId, expected] of Object.entries(FULL_WIKI_AT_10)) {
    const got = {};
    for (const row of circleRequirementSummary(GUILDS[guildId], 10)) {
      const m = row.match(/^(.*?)(?:\s*\(hard\))? (\d+)$/);
      assert.ok(m, `${guildId}: unparseable summary row "${row}"`);
      got[m[1].trim()] = Number(m[2]);
    }
    assert.deepEqual(got, expected, `${guildId}: requirements diverge from docs/elanthipedia`);
  }
});

test('source 1-10 increments produce the documented circle-10 cumulative ranks', () => {
  for (const [guildId, expectedRows] of Object.entries(SOURCE_CIRCLE_10)) {
    const summary = circleRequirementSummary(GUILDS[guildId], 10);
    for (const row of expectedRows) {
      assert.ok(summary.includes(row), `${guildId}: expected source row "${row}"; got ${summary.join(', ')}`);
    }
  }
  // Ranger Instinct is SOFT in the source ("can be used toward Nth survival
  // requirements") — it must not be excluded from the survival Nth pool.
  assert.ok(!circleRequirementSummary(GUILDS.ranger, 10).some((r) => r.includes('(hard)') && r.startsWith('first_aid')),
    'Ranger first_aid (Instinct) must stay soft');
});

test('guild requirement tables contain no duplicate named or Nth rows', () => {
  for (const guild of Object.values(GUILDS)) {
    const keys = circleRequirementSummary(guild, 10).map((row) => row
      .replace(' (hard)', '')
      .replace(/ \d+$/, ''));
    assert.equal(new Set(keys).size, keys.length, `${guild.name} has duplicate requirement rows: ${keys.join(', ')}`);
  }
});

test('hard named requirements cannot also satisfy an Nth-skill row', () => {
  const cases = [
    { guild: 'barbarian', hard: 'tactics', pool: ['scholarship', 'tactics', 'performance', 'appraisal', 'forging', 'engineering', 'outfitting', 'alchemy', 'enchanting'], missing: /1st lore/ },
    { guild: 'barbarian', hard: 'evasion', pool: ['evasion', 'athletics', 'perception', 'stealth', 'lockpicking', 'first_aid', 'foraging', 'skinning'], missing: /survival/ },
    { guild: 'cleric', hard: 'shield_usage', pool: ['shield_usage', 'light_armor', 'chain_armor', 'brigandine', 'plate_armor'], missing: /1st armor/ },
    { guild: 'empath', hard: 'scholarship', pool: ['scholarship', 'tactics', 'performance', 'appraisal', 'forging', 'engineering', 'outfitting', 'alchemy', 'enchanting'], missing: /1st lore/ },
    { guild: 'trader', hard: 'appraisal', pool: ['scholarship', 'tactics', 'performance', 'appraisal', 'forging', 'engineering', 'outfitting', 'alchemy', 'enchanting'], missing: /1st lore/ },
  ];

  for (const c of cases) {
    const skills = rankedSkills(40);
    for (const id of c.pool) skills[id].rank = 0;
    skills[c.hard].rank = 40;
    const req = circleRequirements(GUILDS[c.guild], skills, 10);
    assert.equal(req.ok, false, `${c.guild}: ${c.hard} must not double-count`);
    assert.ok(req.missing.some((line) => c.missing.test(line)), `${c.guild}: expected ${c.missing} in ${req.missing.join(', ')}`);
  }
});

test('Thief soft Thievery counts for survival breadth but Barbarian restricted Thievery does not', () => {
  const thief = rankedSkills(40);
  for (const id of ['evasion', 'athletics', 'perception', 'stealth', 'lockpicking', 'first_aid', 'foraging', 'skinning', 'thievery']) {
    thief[id].rank = 0;
  }
  Object.assign(thief, {
    evasion: { rank: 8, exp: 0 }, athletics: { rank: 8, exp: 0 }, perception: { rank: 6, exp: 0 },
    stealth: { rank: 6, exp: 0 }, lockpicking: { rank: 6, exp: 0 }, first_aid: { rank: 4, exp: 0 },
    foraging: { rank: 4, exp: 0 }, thievery: { rank: 4, exp: 0 },
  });
  assert.equal(circleRequirements(GUILDS.thief, thief, 2).ok, true, 'soft Thievery supplies the eighth survival rank');

  const barbarian = rankedSkills(40);
  for (const id of ['evasion', 'athletics', 'perception', 'stealth', 'lockpicking', 'first_aid', 'foraging', 'skinning', 'thievery']) {
    barbarian[id].rank = 0;
  }
  // Wiki-correct band: Barbarians require FOUR qualifying survival skills at
  // c10 (4x2+4x2+2+1 = 20/20/20/10). Give three strong + thievery; the
  // restricted Thievery must not fill the fourth slot.
  Object.assign(barbarian, {
    evasion: { rank: 30, exp: 0 }, athletics: { rank: 20, exp: 0 },
    perception: { rank: 20, exp: 0 }, stealth: { rank: 0, exp: 0 },
    lockpicking: { rank: 0, exp: 0 }, first_aid: { rank: 0, exp: 0 },
    foraging: { rank: 0, exp: 0 }, skinning: { rank: 0, exp: 0 },
    thievery: { rank: 40, exp: 0 },
  });
  const req = circleRequirements(GUILDS.barbarian, barbarian, 10);
  assert.equal(req.ok, false, 'restricted Thievery cannot supply Barbarian survival breadth');
  assert.ok(req.missing.some((line) => /survival/.test(line)), req.missing.join(', '));
});

test('the flat DR rank cap covers every requirement with room to spare', () => {
  assert.equal(RANK_CAP, 1750, 'DR caps ranks flat at 1750 (Experience.md)');
  for (let circle = 1; circle <= 10; circle += 1) {
    // A c10-ready breadth spread: every named/Nth requirement tops out at
    // "1st weapon 40" (deepest row in any guild table). Named hard skills
    // are excluded from Nth pools automatically; soft named rows (thief
    // thievery/stealth, ranger first_aid) still satisfy their own row and
    // count toward breadth.
    const skills = rankedSkills(40);
    skills.melee_mastery.rank = 40;   // barbarian Primary Mastery band 4
    skills.primary_magic.rank = 40;   // thief Inner Magic band 1
    skills.inner_fire.rank = 40;      // barbarian hard magic skill
    for (const guild of Object.values(GUILDS)) {
      const req = circleRequirements(guild, skills, circle + 1 > 10 ? 10 : circle + 1);
      assert.equal(req.ok, true, `${guild.name} circle-${Math.min(circle + 1, 10)} requirements unmet at rank-40 spread: ${req.missing.join(', ')}`);
    }
  }
});

test('spell mastery thresholds are soft reference points in DR order', () => {
  const order = ['intro', 'basic', 'intermediate', 'advanced', 'esoteric'];
  for (let i = 1; i < order.length; i += 1) {
    assert.ok(SPELL_TIER_RANKS[order[i]] > SPELL_TIER_RANKS[order[i - 1]],
      `${order[i]} (${SPELL_TIER_RANKS[order[i]]}) must exceed ${order[i - 1]} (${SPELL_TIER_RANKS[order[i - 1]]})`);
  }
  // DR-scale thresholds (docs/FIDELITY.md §7): basic ~10, intermediate ~80,
  // advanced ~250, esoteric ~400+.
  assert.deepEqual(SPELL_TIER_RANKS, { intro: 0, basic: 10, intermediate: 80, advanced: 250, esoteric: 400 });
  for (const guild of Object.values(GUILDS)) {
    for (const spell of guild.spells || []) {
      const tier = spellTierFor(spell.minCircle);
      assert.ok(Number.isInteger(SPELL_TIER_RANKS[tier]), `${guild.name} ${spell.name}: missing ${tier} threshold`);
    }
  }
});
