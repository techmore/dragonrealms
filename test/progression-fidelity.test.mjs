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
const { maxRankFor } = await import('../server/player.js');
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
  barbarian: ['expertise (hard) 40', 'tactics (hard) 10', '1st weapon 40', '4th weapon 10', '1st armor 30'],
  bard: ['performance (hard) 40', '1st weapon 30', '1st lore 30', '3rd lore 20', '4th magic 10'],
  cleric: ['shield_usage (hard) 10', 'theurgy (hard) 30', '1st weapon 30', '1st magic 40', '3rd lore 10'],
  empath: ['empathy (hard) 40', 'scholarship (hard) 30', 'first_aid (hard) 20', '1st lore 30', '3rd magic 20'],
  moonmage: ['scholarship (hard) 30', 'astrology (hard) 30', '1st magic 40', '4th magic 20', '4th survival 20'],
  necromancer: ['thanatology (hard) 30', '1st survival 40', '7th survival 20', '1st magic 30', 'small_edged (hard) 10'],
  paladin: ['conviction (hard) 30', 'defending (hard) 30', '1st armor 40', '1st weapon 30', 'evasion (hard) 20'],
  ranger: ['1st survival 40', '8th survival 20', '1st weapon 30', '2nd weapon 10', '1st armor 20'],
  thief: ['thievery 20', 'stealth 20', '1st survival 40', '8th survival 10', '1st weapon 30', '3rd lore 10'],
  trader: ['trading (hard) 40', 'appraisal (hard) 30', '1st lore 30', '1st survival 30', '2nd armor 10'],
  warmage: ['summoning (hard) 30', 'targeted_magic 40', '1st magic 40', '1st weapon 30', '1st armor 20'],
};

test('source 1-10 increments produce the documented circle-10 cumulative ranks', () => {
  for (const [guildId, expectedRows] of Object.entries(SOURCE_CIRCLE_10)) {
    const summary = circleRequirementSummary(GUILDS[guildId], 10);
    for (const row of expectedRows) {
      assert.ok(summary.includes(row), `${guildId}: expected source row "${row}"; got ${summary.join(', ')}`);
    }
  }
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
  Object.assign(barbarian, {
    evasion: { rank: 30, exp: 0 }, athletics: { rank: 20, exp: 0 }, perception: { rank: 20, exp: 0 },
    stealth: { rank: 20, exp: 0 }, lockpicking: { rank: 10, exp: 0 }, thievery: { rank: 40, exp: 0 },
  });
  const req = circleRequirements(GUILDS.barbarian, barbarian, 10);
  assert.equal(req.ok, false, 'restricted Thievery cannot supply Barbarian survival breadth');
  assert.ok(req.missing.some((line) => /5th survival/.test(line)), req.missing.join(', '));
});

test('the current-circle rank cap reaches every next-circle requirement', () => {
  assert.equal(maxRankFor(9), 40, 'circle 9 can train the rank-40 rows needed for circle 10');
  for (let circle = 1; circle < 10; circle += 1) {
    const cap = maxRankFor(circle);
    const skills = rankedSkills(cap);
    for (const guild of Object.values(GUILDS)) {
      const req = circleRequirements(guild, skills, circle + 1);
      assert.equal(req.ok, true, `${guild.name} cannot reach circle ${circle + 1} under rank cap ${cap}: ${req.missing.join(', ')}`);
    }
  }
});

test('every spell mastery gate is reachable at that spell\'s unlock circle', () => {
  for (let circle = 1; circle <= 10; circle += 1) {
    const tier = spellTierFor(circle);
    assert.ok(SPELL_TIER_RANKS[tier] <= maxRankFor(circle), `${tier} gate exceeds the circle-${circle} cap`);
  }
  for (const guild of Object.values(GUILDS)) {
    for (const spell of guild.spells || []) {
      const tier = spellTierFor(spell.minCircle);
      const gate = SPELL_TIER_RANKS[tier];
      const cap = maxRankFor(spell.minCircle);
      assert.ok(Number.isInteger(gate), `${guild.name} ${spell.name}: missing ${tier} gate`);
      assert.ok(gate <= cap, `${guild.name} ${spell.name}: ${tier} gate ${gate} exceeds circle-${spell.minCircle} cap ${cap}`);
    }
  }
  assert.ok(SPELL_TIER_RANKS.esoteric <= maxRankFor(10), 'future circle-10 esoteric spells remain attainable');
});
