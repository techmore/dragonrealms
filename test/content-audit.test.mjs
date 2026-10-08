import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { auditContent, parseCircleTables } from '../scripts/lib/content-audit.mjs';

const options = { origins: ['start'], verbLinks: [], oneWayExits: [] };
function fixture() {
  return {
    skills: { sword: { id: 'sword' } },
    guilds: { fighter: { id: 'fighter', primary: ['sword'], secondary: [], spells: [] } },
    mana: { fighter: 'none' }, circleTables: { fighter: [{ skill: 'sword', rank: 1 }] },
    items: { sword: { id: 'sword', type: 'weapon', skill: 'sword', dmg: [1, 4] }, leaf: { id: 'leaf', type: 'herb' } },
    creatures: { rat: { id: 'rat', weapon: { skill: 'sword' }, loot: ['leaf'], teaches: [0, 10] } },
    rares: { town: { id: 'rare_rat', weapon: { skill: 'sword' }, loot: ['leaf'] } },
    zones: { town: { name: 'Town' } },
    npcs: { trainer: { id: 'trainer', role: 'guild', guild: 'fighter', stock: { sword: 1 }, buys: ['leaf'] } },
    rooms: {
      start: { id: 'start', zone: 'town', npcs: ['trainer'], spawns: ['rat'], exits: { e: 'end' } },
      end: { id: 'end', zone: 'town', exits: { w: 'start' } },
    },
    recipes: { potion: { id: 'potion', item: 'leaf', ingredients: { leaf: 2 } } }, abilities: [],
  };
}
const codes = (result) => result.issues.map((issue) => issue.code);

test('valid complete fixture passes without mutation', () => {
  const content = fixture();
  const before = structuredClone(content);
  const result = auditContent(content, options);
  assert.equal(result.ok, true);
  assert.equal(result.reachableRooms, 2);
  assert.equal(result.counts.guilds, 1);
  assert.deepEqual(content, before);
});

test('reference failures have stable source paths and do not accept inherited keys', () => {
  const content = fixture();
  content.rooms.start.exits.e = 'missing';
  content.rooms.start.npcs.push('toString');
  content.creatures.rat.loot.push('missing_loot');
  content.npcs.trainer.guild = 'unknown';
  content.guilds.fighter.spells.push({ id: 'bad', skill: 'unknown' });
  const result = auditContent(content, options);
  assert.equal(result.ok, false);
  for (const path of ['rooms.start.exits.e', 'rooms.start.npcs', 'creatures.rat.loot', 'npcs.trainer.guild', 'guilds.fighter.spells.0.skill']) {
    assert.ok(result.issues.some((issue) => issue.path === path && issue.code === 'missing-reference'), path);
  }
  assert.ok(codes(result).includes('missing-field'));
});

test('connected islands are unreachable and verb travel restores reachability', () => {
  const content = fixture();
  content.rooms.island = { id: 'island', zone: 'town', exits: { e: 'island2' } };
  content.rooms.island2 = { id: 'island2', zone: 'town', exits: { w: 'island' } };
  const result = auditContent(content, options);
  assert.equal(result.issues.filter((issue) => issue.code === 'unreachable-room').length, 2);
  const linked = auditContent(content, { ...options, verbLinks: [['end', 'island']] });
  assert.equal(linked.ok, true);
  assert.equal(linked.reachableRooms, 4);
  const broken = auditContent(content, { ...options, verbLinks: [['end', 'missing']] });
  assert.ok(broken.issues.some((issue) => issue.path === 'travel.end.to'));
});

test('one-way exits need explicit allowances and rares cannot stock as ordinary spawns', () => {
  const content = fixture();
  content.rooms.end.exits = {};
  content.rooms.start.spawns.push('rare_rat');
  assert.ok(codes(auditContent(content, options)).includes('one-way-exit'));
  assert.ok(codes(auditContent(content, options)).includes('rare-spawn'));
  content.rooms.start.spawns.pop();
  assert.equal(auditContent(content, { ...options, oneWayExits: ['start>end'] }).ok, true);
});

test('malformed catalogs and nested values yield diagnostics rather than throwing', () => {
  const content = fixture();
  content.skills = null;
  content.items.broken = null;
  content.guilds.fighter.primary = {};
  content.guilds.fighter.spells = [null];
  content.creatures.rat.weapon = null;
  content.creatures.rat.loot = 'leaf';
  content.rooms.start.exits = null;
  content.rooms.start.npcs = {};
  content.npcs.trainer.stock = [];
  content.recipes.potion.ingredients = null;
  content.circleTables.fighter = [null];
  content.abilities = [null];
  const result = auditContent(content, options);
  assert.equal(result.ok, false);
  assert.ok(result.issues.filter((issue) => issue.code === 'invalid-shape').length >= 10);
  assert.doesNotThrow(() => auditContent(null));
});

test('range, identity, quantities and circle requirements are validated', () => {
  const content = fixture();
  content.items.sword.id = 'wrong';
  content.items.sword.dmg = [5, 1];
  content.creatures.rat.teaches = [0, Number.NaN];
  content.recipes.potion.ingredients.leaf = -1;
  content.circleTables.fighter = [{ nth: 0, set: 'bogus', rank: -1 }];
  const result = auditContent(content, options);
  for (const code of ['id-mismatch', 'invalid-range', 'invalid-quantity', 'invalid-requirement', 'unknown-skillset']) assert.ok(codes(result).includes(code), code);
});

test('private circle-table parser retains values and rejects unrecognized formats', () => {
  const source = "const CIRCLE_TABLES = {\n  fighter: [\n    // Ignore { skill: 'fake' }\n    { skill: 'sword', rank: 4, hard: true }, { nth: 1, set: 'weapon', rank: 0 },\n  ],\n};";
  assert.deepEqual(parseCircleTables(source), { fighter: [{ skill: 'sword', rank: 4, hard: true }, { nth: 1, set: 'weapon', rank: 0 }] });
  assert.throws(() => parseCircleTables('export const other = {};'), /not found/);
  assert.throws(() => parseCircleTables(source.replace('rank: 4', 'rank: compute()')), /Unsupported circle row/);
  assert.throws(() => parseCircleTables('const CIRCLE_TABLES = {\n  fighter: [],\n};'), /empty/);
  assert.ok(Object.keys(parseCircleTables(readFileSync(new URL('../data/guilds.js', import.meta.url), 'utf8'))).length >= 10);
});

test('CLI validates repository content and emits parseable structured results', () => {
  const cli = new URL('../scripts/audit-data.mjs', import.meta.url);
  const run = spawnSync(process.execPath, [cli.pathname, '--json'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const result = JSON.parse(run.stdout);
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.ok, true);
  assert.equal(result.issueCount, 0);
  assert.ok(result.counts.rooms > 100);
  for (const key of ['forgingRecipes', 'engineeringRecipes', 'outfittingRecipes', 'craftTechniques', 'qualityLevels', 'craftSlotSamples']) assert.ok(result.counts[key] > 0, key);
  const bad = spawnSync(process.execPath, [cli.pathname, '--unknown'], { encoding: 'utf8' });
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /Unknown argument/);
});

function craftingFixture() {
  const content = fixture();
  for (const id of ['forging', 'engineering', 'outfitting', 'alchemy']) content.skills[id] = { id };
  for (const name of ['forgeRecipes', 'engineerRecipes', 'outfitRecipes']) content[name] = { blade: { id: 'blade', item: 'sword', ingredients: { leaf: 1 }, minSkill: 0 } };
  content.craftTechniques = {
    hammer: { id: 'hammer', skill: 'forging', minRank: 25, effect: { kind: 'quality', mag: 3 } },
    brew: { id: 'brew', skill: 'alchemy', minRank: 0, effect: { kind: 'brew', mag: 0.05 } },
  };
  content.qualityLadder = [{ name: 'rough', min: 0, mult: 0.9 }, { name: 'fine', min: 0.5, mult: 1.1 }];
  content.craftSlotSamples = [{ rank: 0, affinity: false, slots: 1 }, { rank: 0, affinity: true, slots: 2 }, { rank: 50, affinity: false, slots: 6 }, { rank: 50, affinity: true, slots: 6 }];
  return content;
}

test('crafting catalogs are optional but provided malformed catalogs fail', () => {
  assert.equal(auditContent(fixture(), options).ok, true);
  const content = fixture();
  for (const name of ['forgeRecipes', 'engineerRecipes', 'outfitRecipes', 'craftTechniques']) content[name] = null;
  content.qualityLadder = {}; content.craftSlotSamples = null;
  const result = auditContent(content, options);
  for (const path of ['forgeRecipes', 'engineerRecipes', 'outfitRecipes', 'craftTechniques', 'qualityLadder', 'craftSlotSamples']) assert.ok(result.issues.some(issue => issue.path === path && issue.code === 'invalid-shape'), path);
});

test('valid forging/engineering/outfitting and technique fixtures report counts without mutation', () => {
  const content = craftingFixture(), before = structuredClone(content);
  const result = auditContent(content, options);
  assert.equal(result.ok, true);
  assert.equal(result.counts.alchemyRecipes, 1);
  for (const discipline of ['forging', 'engineering', 'outfitting']) assert.equal(result.counts[`${discipline}Recipes`], 1);
  assert.equal(result.counts.forgingTechniques, 1);
  assert.equal(result.counts.alchemyTechniques, 1);
  assert.equal(result.counts.engineeringTechniques, 0);
  assert.equal(result.counts.qualityLevels, 2);
  assert.equal(result.counts.craftSlotSamples, 4);
  assert.deepEqual(content, before);
});

test('craft recipes validate IDs, outputs, ingredients, quantities and skill thresholds', () => {
  const content = craftingFixture();
  content.forgeRecipes.blade.id = 'wrong';
  content.forgeRecipes.blade.item = 'missing';
  content.forgeRecipes.blade.ingredients = { absent: 0 };
  content.engineerRecipes.blade.minSkill = -1;
  content.outfitRecipes.blade.minSkill = Number.NaN;
  const result = auditContent(content, options);
  for (const [path, code] of [['forgeRecipes.blade', 'id-mismatch'], ['forgeRecipes.blade.item', 'missing-reference'], ['forgeRecipes.blade.ingredients.absent', 'missing-reference'], ['forgeRecipes.blade.ingredients.absent', 'invalid-quantity'], ['engineerRecipes.blade.minSkill', 'invalid-rank'], ['outfitRecipes.blade.minSkill', 'invalid-rank']]) assert.ok(result.issues.some(issue => issue.path === path && issue.code === code), path);
  delete content.forgeRecipes.blade.minSkill;
  content.outfitRecipes.blade.ingredients = {};
  assert.ok(codes(auditContent(content, options)).includes('missing-ingredients'));
});

test('techniques validate discipline references, IDs, ranks and effective effect kinds/magnitudes', () => {
  const content = craftingFixture();
  content.craftTechniques.hammer.id = 'wrong';
  content.craftTechniques.hammer.skill = 'sword';
  content.craftTechniques.hammer.minRank = 0.5;
  content.craftTechniques.hammer.effect = { kind: 'brew', mag: Number.NaN };
  content.craftTechniques.brew.skill = 'missing';
  const result = auditContent(content, options);
  for (const code of ['id-mismatch', 'invalid-discipline', 'missing-reference', 'invalid-rank', 'effect-discipline-mismatch', 'invalid-effect']) assert.ok(codes(result).includes(code), code);
  content.craftTechniques.brew.effect = null;
  assert.doesNotThrow(() => auditContent(content, options));
});

test('quality thresholds and multipliers must be finite, ordered and named; ladders cannot be empty', () => {
  const content = craftingFixture();
  content.qualityLadder = [{ name: 'same', min: 0.1, mult: 1 }, { name: 'same', min: 0.05, mult: 0 }, { name: '', min: 2, mult: Number.NaN }, null];
  const result = auditContent(content, options);
  for (const code of ['invalid-quality-name', 'invalid-quality-threshold', 'invalid-quality-multiplier', 'invalid-shape']) assert.ok(codes(result).includes(code), code);
  content.qualityLadder = [];
  assert.ok(codes(auditContent(content, options)).includes('invalid-quality-ladder'));
});

test('craft slot samples validate cap, monotonic ranks, affinity bonuses and duplicate samples', () => {
  const content = craftingFixture();
  content.craftSlotSamples = [
    { rank: 0, affinity: false, slots: 2 }, { rank: 0, affinity: true, slots: 1 },
    { rank: 10, affinity: false, slots: 1 }, { rank: 10, affinity: true, slots: 7 },
    { rank: 10, affinity: false, slots: 1 }, { rank: -1, affinity: 'yes', slots: 0 }, null,
  ];
  const result = auditContent(content, options);
  for (const code of ['invalid-slot-count', 'invalid-affinity-slots', 'nonmonotonic-slots', 'duplicate-slot-sample', 'invalid-slot-sample', 'invalid-shape']) assert.ok(codes(result).includes(code), code);
});

function magicFixture() {
  const content = fixture();
  content.guilds.fighter.magic = true;
  content.guilds.fighter.spells = [
    { id: 'strike', name: 'Strike', skill: 'sword', mana: 10, minCircle: 1, kind: 'damage', base: 5 },
    { id: 'shroud', name: 'Shroud', skill: 'sword', mana: 15, minCircle: 3, kind: 'buff', base: 0, buff: { key: 'shadow', ticks: 20 } },
  ];
  content.mana.fighter = 'elemental';
  content.manaTypes = { elemental: { name: 'Elemental', desc: 'Elemental mana.' }, none: { name: 'None', desc: 'No mana.' } };
  content.spellTierRanks = { intro: 0, basic: 10, intermediate: 80, advanced: 250, esoteric: 400 };
  content.spellSlotCosts = { intro: 2, basic: 6, intermediate: 10, advanced: 14, esoteric: 18 };
  content.spellTierSamples = [{ circle: 1, tier: 'intro', cost: 2 }, { circle: 2, tier: 'basic', cost: 6 }];
  content.spellSlotSamples = [
    { guild: 'fighter', circle: 1, tier: 'primary', rate: 1, regen: 0.04, total: 8, used: 2, forgottenAllUsed: 0 },
    { guild: 'fighter', circle: 3, tier: 'primary', rate: 1, regen: 0.04, total: 22, used: 8, forgottenAllUsed: 0 },
  ];
  content.manaCycleSamples = [{ type: 'elemental', hours: 0, level: 0.5 }, { type: 'none', hours: 24, level: 0.5 }];
  return content;
}

test('valid spell curricula and optional mana/tier/helper samples pass without mutation', () => {
  const content = magicFixture(), before = structuredClone(content);
  const result = auditContent(content, options);
  assert.equal(result.ok, true);
  assert.equal(result.counts.guildSpells, 2);
  assert.equal(result.counts.magicalGuilds, 1);
  assert.equal(result.counts.manaTypes, 2);
  assert.equal(result.counts.spellTierSamples, 2);
  assert.equal(result.counts.spellSlotSamples, 2);
  assert.equal(result.counts.manaCycleSamples, 2);
  assert.deepEqual(content, before);
});

test('spell IDs are unique within guild, and authored costs/circle/kinds/power/buffs must be valid', () => {
  const content = magicFixture();
  content.guilds.fighter.spells[0].mana = -1;
  content.guilds.fighter.spells[0].minCircle = 0;
  content.guilds.fighter.spells[0].base = Number.NaN;
  content.guilds.fighter.spells[0].kind = 'unimplemented';
  content.guilds.fighter.spells[1].id = 'strike';
  content.guilds.fighter.spells[1].buff = { key: '', ticks: 0 };
  const result = auditContent(content, options);
  for (const code of ['invalid-spell-cost', 'invalid-spell-circle', 'invalid-spell-power', 'unsupported-spell-kind', 'duplicate-spell-id', 'invalid-spell-buff']) assert.ok(codes(result).includes(code), code);
  content.guilds.fighter.spells[1].buff = null;
  assert.doesNotThrow(() => auditContent(content, options));
});

test('nonmagical guilds may retain a mana assignment but may not carry curricula', () => {
  const content = magicFixture();
  content.guilds.fighter.magic = false;
  assert.ok(codes(auditContent(content, options)).includes('nonmagical-curriculum'));
  content.guilds.fighter.spells = [];
  content.spellSlotSamples = [];
  assert.equal(auditContent(content, options).ok, true);
});

test('mana assignments require known guilds/types, named definitions, and active mana for magical guilds', () => {
  const content = magicFixture();
  content.mana.unknownGuild = 'missingType';
  content.mana.fighter = 'none';
  content.manaTypes.elemental.name = '';
  const result = auditContent(content, options);
  for (const code of ['missing-reference', 'magical-guild-no-mana', 'invalid-mana-definition']) assert.ok(codes(result).includes(code), code);
  for (const name of ['manaTypes', 'spellTierRanks', 'spellSlotCosts']) {
    content[name] = null;
    assert.ok(auditContent(content, options).issues.some(issue => issue.path === name && issue.code === 'invalid-shape'), name);
  }
});

test('tier ranks/costs and helper samples catch broken order, unknown tiers and mismatched costs', () => {
  const content = magicFixture();
  content.spellTierRanks.intro = 1;
  content.spellSlotCosts.basic = -1;
  content.spellTierRanks.unknown = 500;
  content.spellTierSamples = [{ circle: 7, tier: 'advanced', cost: 999 }, { circle: 8, tier: 'intro', cost: 2 }];
  const result = auditContent(content, options);
  for (const code of ['invalid-intro-rank', 'invalid-spell-tier-value', 'unknown-spell-tier', 'spell-slot-cost-mismatch', 'nonmonotonic-spell-tier']) assert.ok(codes(result).includes(code), code);
});

test('slot and mana helpers check finite bounds, forgotten slots and monotonic budgets without assuming curriculum fits budget', () => {
  const content = magicFixture();
  content.spellSlotSamples[0].used = 100;
  assert.equal(auditContent(content, options).ok, true);
  content.spellSlotSamples[1].total = 1;
  content.spellSlotSamples[1].forgottenAllUsed = 3;
  content.spellSlotSamples[1].regen = Number.NaN;
  content.manaCycleSamples[0].level = 1.5;
  content.manaCycleSamples[1].hours = Number.POSITIVE_INFINITY;
  const result = auditContent(content, options);
  for (const code of ['nonmonotonic-spell-slots', 'forgotten-spell-slots', 'invalid-magic-rate', 'invalid-mana-cycle']) assert.ok(codes(result).includes(code), code);
  content.spellSlotSamples = [null];
  content.spellTierSamples = [null];
  content.manaCycleSamples = [null];
  assert.doesNotThrow(() => auditContent(content, options));
});

test('lightweight item fixtures may omit optional fields, while complete catalog mode requires authored essentials', () => {
  const content = fixture();
  assert.equal(auditContent(content, options).ok, true);
  const result = auditContent(content, { ...options, requireItemFields: true });
  for (const path of ['items.sword.name', 'items.sword.slot', 'items.sword.value', 'items.sword.speed']) assert.ok(result.issues.some(issue => issue.path === path && issue.code === 'missing-item-field'), path);
});

test('item names, types, prices, carried burden, circle gates and weapon fields reject explicit malformed values', () => {
  const cases = [
    ['name', '', 'invalid-item-field'], ['type', 1, 'invalid-item-field'], ['slot', {}, 'invalid-item-slot'],
    ['value', -1, 'invalid-item-number'], ['burden', Number.NaN, 'invalid-item-number'], ['weight', 'heavy', 'invalid-item-number'],
    ['magicEdge', Number.POSITIVE_INFINITY, 'invalid-item-number'], ['req', 1.5, 'invalid-item-circle'],
    ['speed', 0, 'invalid-item-number'], ['skill', '', 'missing-reference'], ['slot', 'torso', 'weapon-slot-mismatch'],
  ];
  for (const [field, value, code] of cases) {
    const content = fixture(); content.items.sword[field] = value;
    assert.ok(auditContent(content, options).issues.some(issue => issue.path === `items.sword.${field}` && issue.code === code), field);
  }
});

test('authored armor slots and fractional nonnegative burdens are compatible; item audits are read-only', () => {
  const content = fixture();
  content.items.sword = { ...content.items.sword, name: 'Sword', slot: 'hand', speed: 3, value: 0, burden: 0.5, weight: 0.1, req: 0, magicEdge: 0 };
  for (const slot of ['torso', 'chest', 'accessory', 'neck', 'shield']) content.items[slot] = { id: slot, name: slot, type: 'armor', slot, armor: 1, skill: 'sword', value: 1 };
  const before = structuredClone(content);
  assert.equal(auditContent(content, options).ok, true);
  assert.deepEqual(content, before);
  content.items.chest.armor = -1;
  content.items.shield.slot = null;
  assert.ok(codes(auditContent(content, options)).includes('invalid-range'));
  assert.ok(codes(auditContent(content, options)).includes('armor-slot-mismatch'));
});

test('consumable restoration/buff effects and cambrinth capacities match concrete consume semantics', () => {
  const content = fixture();
  content.items.potion = { id: 'potion', type: 'consumable', slot: null, restore: 10, restoreMana: 5 };
  content.items.paint = { id: 'paint', type: 'consumable', slot: null, buff: { warpaint: 40 } };
  content.items.device = { id: 'device', type: 'cambrinth', slot: null, capacity: 10 };
  assert.equal(auditContent(content, options).ok, true);
  content.items.potion.slot = 'neck';
  content.items.potion.buff = { keen: 40 };
  content.items.paint.buff = { warpaint: 0 };
  content.items.device.capacity = Number.NaN;
  const result = auditContent(content, options);
  for (const code of ['consumable-slot-mismatch', 'shadowed-consumable-effect', 'invalid-item-buff', 'invalid-cambrinth-capacity']) assert.ok(codes(result).includes(code), code);
  content.items.paint.buff = null;
  content.items.sword.restore = 10;
  assert.doesNotThrow(() => auditContent(content, options));
  assert.ok(codes(auditContent(content, options)).includes('consumable-effect-type'));
});
