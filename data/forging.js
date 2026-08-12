// Forging recipes (clean-room). Crafted at the Ember Forge with the Forging
// skill; quality scales with skill (DR: practically worthless -> masterfully-crafted).

export const FORGE_RECIPES = {
  forged_short_sword: {
    id: 'forged_short_sword', name: 'forged short sword', item: 'forged_short_sword',
    ingredients: { iron_ore: 2 },
    minSkill: 0,
    desc: 'A serviceable blade. (2 iron ore)',
  },
  forged_steel_sword: {
    id: 'forged_steel_sword', name: 'forged steel longsword', item: 'forged_steel_sword',
    ingredients: { iron_ore: 3, cinder_scale: 1 },
    minSkill: 10,
    desc: 'A steel longsword. (3 iron ore + 1 cinder scale)',
  },
  forged_steel_greatsword: {
    id: 'forged_steel_greatsword', name: 'forged steel greatsword', item: 'forged_steel_greatsword',
    ingredients: { iron_ore: 5, cinder_scale: 2 },
    minSkill: 20,
    desc: 'A greatsword of steel. (5 iron ore + 2 cinder scales)',
  },
  forged_mithril_blade: {
    id: 'forged_mithril_blade', name: 'forged mithril longsword', item: 'forged_mithril_blade',
    ingredients: { iron_ore: 4, cinder_scale: 2, wraith_essence: 1 },
    minSkill: 35,
    desc: 'Mithril, folded by hand. (4 iron ore + 2 cinder scales + 1 wraith essence)',
  },
  forged_dragonsteel: {
    id: 'forged_dragonsteel', name: 'forged dragonsteel greatsword', item: 'forged_dragonsteel',
    ingredients: { iron_ore: 6, cinder_scale: 3, dread_sigil: 1 },
    minSkill: 50,
    desc: 'A legend of dragonsteel. (6 iron ore + 3 cinder scales + 1 dread sigil)',
  },
};

export function forgeRecipeById(id) {
  return FORGE_RECIPES[id] || null;
}

// Engineering recipes (clean-room): wood-and-steel work at the Ember Forge
// with the Engineering skill (DR: the Engineering discipline).
export const ENGINEER_RECIPES = {
  carved_staff: {
    id: 'carved_staff', name: 'carved oak staff', item: 'carved_staff',
    ingredients: { iron_ore: 1, herb_root: 1 },
    minSkill: 0,
    desc: 'A staff of carved oak, iron-shod. (1 iron ore + 1 bitter root)',
  },
  arbalest: {
    id: 'arbalest', name: 'hand-worked arbalest', item: 'arbalest',
    ingredients: { iron_ore: 2, cinder_scale: 1 },
    minSkill: 10,
    desc: 'A crossbow built by a clever hand. (2 iron ore + 1 cinder scale)',
  },
};

export function engineerRecipeById(id) {
  return ENGINEER_RECIPES[id] || null;
}

// Outfitting recipes (clean-room): leather and hide work at the Needle &
// Thread with the Outfitting skill (DR: the Outfitting discipline).
export const OUTFIT_RECIPES = {
  cured_leather: {
    id: 'cured_leather', name: 'cured leather jerkin', item: 'cured_leather',
    ingredients: { wolf_pelt: 1, herb_root: 1 },
    minSkill: 0,
    desc: 'A jerkin of cured wolf hide. (1 wolf pelt + 1 bitter root)',
  },
  studded_crafted: {
    id: 'studded_crafted', name: 'studded hide armor', item: 'studded_crafted',
    ingredients: { wolf_pelt: 2, goblin_skin: 1 },
    minSkill: 15,
    desc: 'Hide armor stitched with studs. (2 wolf pelts + 1 goblin hide)',
  },
};

export function outfittingRecipeById(id) {
  return OUTFIT_RECIPES[id] || null;
}

// DR quality ladder: quality improves the forged item's stats.
export const QUALITY_LADDER = [
  { name: 'practically worthless', mult: 0.9, min: 0.0 },
  { name: 'mediocre', mult: 1.0, min: 0.25 },
  { name: 'about average', mult: 1.1, min: 0.5 },
  { name: 'well-crafted', mult: 1.2, min: 0.75 },
  { name: 'masterfully-crafted', mult: 1.3, min: 0.9 },
];

export function qualityRoll(skill) {
  const roll = Math.min(0.97, Math.max(0.05, 0.3 + skill * 0.013 + Math.random() * 0.2));
  const q = [...QUALITY_LADDER].reverse().find((x) => roll >= x.min) || QUALITY_LADDER[0];
  return { ...q, roll };
}
