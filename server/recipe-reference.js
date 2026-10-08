// Passive plans mirror the four production command gates. They use carried
// inventory only and never roll quality, spend materials, or finish orders.
import { RECIPES } from '../data/recipes.js';
import { FORGE_RECIPES, ENGINEER_RECIPES, OUTFIT_RECIPES, CRAFT_TECHNIQUES } from '../data/forging.js';
import { ITEMS } from '../data/items.js';
import { ROOMS } from '../data/world.js';
import { NPCS } from '../data/npcs.js';

const CATALOGS = {
  alchemy: { verb: 'craft', recipes: RECIPES },
  forging: { verb: 'forge', recipes: FORGE_RECIPES, station: 'forge' },
  engineering: { verb: 'shape', recipes: ENGINEER_RECIPES, station: 'forge' },
  outfitting: { verb: 'tailor', recipes: OUTFIT_RECIPES, station: 'tailor_shop' },
};
const normalize = value => String(value || '').toLowerCase().replace(/_/g, ' ').trim().replace(/\s+/g, ' ');
const DEFAULT_DATA = { catalogs: CATALOGS, items: ITEMS, rooms: ROOMS, npcs: NPCS, techniques: CRAFT_TECHNIQUES };
const MAX_RESULTS = 8;

export function recipePlans(p, input = '', data = DEFAULT_DATA) {
  const parts = String(input || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  const discipline = Object.hasOwn(data.catalogs, parts[0]) ? parts.shift() : null;
  const query = normalize(parts.join(' '));
  const terms = query.split(' ').filter(Boolean);
  const entries = [];
  for (const [skill, catalog] of Object.entries(data.catalogs)) {
    if (discipline && skill !== discipline) continue;
    const stations = Object.entries(data.rooms).filter(([id, room]) => catalog.station ? id === catalog.station
      : (room.npcs || []).some(npcId => data.npcs[npcId]?.role === 'craft')).map(([id, room]) => ({ id, name: room.name }));
    for (const [id, recipe] of Object.entries(catalog.recipes)) {
      const outputName = data.items[recipe.item]?.name || recipe.item;
      const text = normalize(`${id} ${recipe.name} ${recipe.item} ${outputName} ${Object.keys(recipe.ingredients).join(' ')}`);
      if (!terms.every(term => text.includes(term))) continue;
      const ingredients = Object.entries(recipe.ingredients).map(([itemId, need]) => {
        const have = (p.inventory || []).filter(entry => entry.item?.id === itemId).reduce((sum, entry) => sum + entry.qty, 0);
        return { id: itemId, name: data.items[itemId]?.name || itemId, need, have, missing: Math.max(0, need - have) };
      });
      const rank = p.skills?.[skill]?.rank || 0;
      // Alchemy production has no skill gate; its rank affects success.
      const minRank = skill === 'alchemy' ? 0 : recipe.minSkill;
      const skillMet = rank >= minRank;
      const materialsMet = ingredients.every(ingredient => ingredient.missing === 0);
      const atStation = stations.some(station => station.id === p.room);
      const learned = (p.craftTechs?.[skill] || []).map(techId => data.techniques[techId]).filter(Boolean)
        .map(technique => ({ id: technique.id, name: technique.name, description: technique.desc }));
      entries.push({
        id, name: recipe.name, discipline: skill, verb: catalog.verb,
        output: { id: recipe.item, name: outputName, quantity: 1 },
        rank, minRank, skillMet, materialsMet, atStation, ready: skillMet && materialsMet && atStation,
        ingredients, stations, learned,
        matchesOrder: Boolean(p.workOrder && !p.workOrder.done && p.workOrder.verb === catalog.verb && p.workOrder.recipeId === id),
        exact: [id, recipe.name, recipe.item].some(value => normalize(value) === query),
      });
    }
  }
  entries.sort((a, b) => Number(b.exact) - Number(a.exact) || a.discipline.localeCompare(b.discipline) || a.minRank - b.minRank || a.id.localeCompare(b.id));
  return { discipline, query, total: entries.length, entries: entries.slice(0, MAX_RESULTS) };
}

export function formatRecipes(p, input = '', data = DEFAULT_DATA) {
  const result = recipePlans(p, input, data);
  const usage = 'Use "recipes [alchemy|forging|engineering|outfitting] [query]" to browse or narrow the list.';
  if (!result.total) return `No recipes match "${result.query}"${result.discipline ? ` in ${result.discipline}` : ''}.\n${usage}`;
  const lines = [`\nRecipe plans — ${result.discipline || 'all disciplines'} (${result.total} match${result.total === 1 ? '' : 'es'})`];
  for (const recipe of result.entries) {
    lines.push(`\n  ${recipe.name} [${recipe.id}] — "${recipe.verb} ${recipe.id}"`);
    lines.push(`    Skill: ${recipe.discipline} ${recipe.rank}/${recipe.minRank}${recipe.discipline === 'alchemy' ? ' — no minimum rank; skill affects brewing success' : recipe.skillMet ? ' — met' : ` — ${recipe.minRank - recipe.rank} more ranks needed`}.`);
    lines.push(`    Station: ${recipe.stations.map(station => `${station.name} [${station.id}]`).join(', ') || 'unavailable'}${recipe.atStation ? ' — you are here' : ' — travel required'}.`);
    lines.push(`    Inputs: ${recipe.ingredients.map(ingredient => `${ingredient.need}x ${ingredient.name} [${ingredient.id}] (carrying ${ingredient.have}${ingredient.missing ? `; missing ${ingredient.missing}` : ''})`).join(', ')}.`);
    lines.push(`    Output: ${recipe.output.quantity}x ${recipe.output.name} [${recipe.output.id}].`);
    lines.push(`    ${recipe.ready ? 'Prerequisites and materials met here; you can attempt this recipe.' : 'Before attempting: ' + [!recipe.skillMet && 'raise the required skill', !recipe.materialsMet && 'gather missing ingredients', !recipe.atStation && 'reach a station'].filter(Boolean).join('; ') + '.'}`);
    if (recipe.learned.length) lines.push(`    Optional learned techniques: ${recipe.learned.map(technique => `${technique.name} (${technique.description})`).join('; ')}`);
    if (recipe.matchesOrder) lines.push('    Matches your current work order; successful output of the required quality is set aside for that order.');
  }
  if (result.total > result.entries.length) lines.push(`\nShowing ${result.entries.length} of ${result.total} recipes. Choose a discipline or more specific search terms.`);
  lines.push('\nThese recipes require no separate tool or mandatory technique. Alchemy can fail; ingredients are consumed on attempts. Other disciplines produce variable quality.');
  lines.push('Readiness covers rank, carried materials and station; crafting commands still obey roundtime.');
  lines.push(usage);
  return lines.join('\n');
}
