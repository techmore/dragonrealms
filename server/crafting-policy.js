// Shared crafting rules used by production and technique learning.
// Guild crafting affiliations (DR: free technique slots per discipline).
// A guild's crafters hold a natural edge in their traditional trades.
import { ROOMS } from '../data/world.js';
import { NPCS } from '../data/npcs.js';
import { CRAFT_TECHNIQUES } from '../data/forging.js';
const CRAFT_AFFINITY = {
  forge: { barbarian: 3 },  // Weaponsmithing
  shape: { trader: 2 },     // Engineering
  tailor: { paladin: 3, ranger: 2 }, // Armorsmithing, Tailoring
  craft: { empath: 2 },     // Remedies
  enchant: { warmage: 2, moonmage: 2 }, // Artificing/Binding
};

export function craftAffinity(guildId, craft) {
  return (CRAFT_AFFINITY[craft] && CRAFT_AFFINITY[craft][guildId]) || 0;
}

export function knownCraftTechs(p, skill) {
  return ((p.craftTechs || {})[skill]) || [];
}

// Order assignment, claims and technique teaching use these station gates.
// Keep the forge/tailor overrides: those rooms do not post alchemy orders.
export function craftStationVerbs(p, rooms = ROOMS, npcs = NPCS) {
  if (p.room === 'forge') return ['forge'];
  if (p.room === 'tailor_shop') return ['tailor'];
  return (rooms[p.room]?.npcs || []).some(id => npcs[id]?.role === 'craft') ? ['craft'] : [];
}

export function craftOrderMultiplier(p, skill, techniques = CRAFT_TECHNIQUES) {
  let multiplier = 1;
  for (const id of knownCraftTechs(p, skill)) {
    const technique = techniques[id];
    if (technique && technique.effect.kind === 'order') multiplier += technique.effect.mag;
  }
  return multiplier;
}
