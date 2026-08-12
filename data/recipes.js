// Alchemy recipes (clean-room). Crafted at the alchemist's brewery.
// Each recipe: id, name, result item id, and required ingredient quantities.

export const RECIPES = {
  healing_draught: {
    id: 'healing_draught', name: 'healing draught', item: 'potion_heal',
    ingredients: { herb_root: 2, herb_mint: 1 },
    desc: 'Knits flesh fast. (2 bitter roots + 1 trailmint)',
  },
  essence_tonic: {
    id: 'essence_tonic', name: 'essence tonic', item: 'potion_mana',
    ingredients: { herb_root: 1, wisp_mote: 2 },
    desc: 'Restores mana. (1 bitter root + 2 wisp motes)',
  },
  frenzy_draught: {
    id: 'frenzy_draught', name: 'frenzy draught', item: 'potion_frenzy',
    ingredients: { herb_mint: 3, wisp_mote: 1 },
    desc: '+30% damage for a short time. (3 trailmint + 1 wisp mote)',
  },
};

export function recipeById(id) {
  return RECIPES[id] || null;
}
