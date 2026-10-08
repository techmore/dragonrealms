// Data-integrity audit; no running server or database required.
import { readFileSync } from 'node:fs';
import { SKILLS } from '../data/skills.js';
import { GUILDS, SPELL_TIER_RANKS, SPELL_SLOT_COSTS, spellTierFor, spellSlotCost, spellSlotsTotal, spellSlotsUsed, guildMagicTier, guildSlotRate } from '../data/guilds.js';
import { ITEMS } from '../data/items.js';
import { CREATURES, RARES } from '../data/creatures.js';
import { NPCS } from '../data/npcs.js';
import { ROOMS, ZONES } from '../data/world.js';
import { RECIPES } from '../data/recipes.js';
import { BARBARIAN_ABILITIES } from '../data/abilities.js';
import { FORGE_RECIPES, ENGINEER_RECIPES, OUTFIT_RECIPES, CRAFT_TECHNIQUES, QUALITY_LADDER, craftSlotsFor } from '../data/forging.js';
import { GUILD_MANA, MANA_TYPES, manaCycle, manaRegenRate } from '../data/mana.js';

import { auditContent, parseCircleTables } from './lib/content-audit.mjs';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: node scripts/audit-data.mjs [--json]\nValidate content references, shapes, circle requirements and world reachability.');
} else if (args.some((arg) => arg !== '--json')) {
  console.error('Unknown argument. Usage: node scripts/audit-data.mjs [--json]');
  process.exitCode = 2;
} else {
  let result;
  try {
    const circleTables = parseCircleTables(readFileSync(new URL('../data/guilds.js', import.meta.url), 'utf8'));
    result = auditContent({ skills: SKILLS, guilds: GUILDS, items: ITEMS,
      creatures: CREATURES, rares: RARES, npcs: NPCS, rooms: ROOMS, zones: ZONES,
      recipes: RECIPES, forgeRecipes: FORGE_RECIPES, engineerRecipes: ENGINEER_RECIPES, outfitRecipes: OUTFIT_RECIPES,
      craftTechniques: CRAFT_TECHNIQUES, qualityLadder: QUALITY_LADDER,
      craftSlotSamples: [0, 9, 10, 20, 40, 50, 100, 1200].flatMap(rank => [false, true].map(affinity => ({ rank, affinity, slots: craftSlotsFor(rank, affinity) }))), mana: GUILD_MANA, abilities: BARBARIAN_ABILITIES, circleTables,
      manaTypes: MANA_TYPES, spellTierRanks: SPELL_TIER_RANKS, spellSlotCosts: SPELL_SLOT_COSTS,
      spellTierSamples: [1, 2, 4, 5, 6, 7, 9, 10, 20].map(circle => ({ circle, tier: spellTierFor(circle), cost: spellSlotCost({ minCircle: circle }) })),
      spellSlotSamples: Object.values(GUILDS).flatMap(guild => [1, 2, 5, 7, 10, 20].map(circle => ({ guild: guild.id, circle,
        tier: guildMagicTier(guild), rate: guildSlotRate(guild), regen: manaRegenRate(guild.id), total: spellSlotsTotal(guild, circle),
        used: spellSlotsUsed(guild, circle), forgottenAllUsed: spellSlotsUsed(guild, circle, guild.spells.map(spell => spell.id)) }))),
      manaCycleSamples: Object.keys(MANA_TYPES).flatMap(type => [0, 6, 12, 24, 72, 720].map(hours => ({ type, hours, level: manaCycle(type, hours) }))),
    }, { requireItemFields: true });
  } catch (error) {
    result = { schemaVersion: 1, ok: false, issueCount: 1,
      issues: [{ code: 'audit-load-error', path: 'circleTables', message: error.message }] };
  }
  if (args.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else console.log(result.ok ? 'ALL CROSS-REFERENCES VALID' : `ISSUES (${result.issueCount}):\n${result.issues.map((issue) => `[${issue.code}] ${issue.message}`).join('\n')}`);
  process.exitCode = result.ok ? 0 : 1;
}
