// Shared crafting rules used by production and technique learning.
// Guild crafting affiliations (DR: free technique slots per discipline).
// A guild's crafters hold a natural edge in their traditional trades.
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
