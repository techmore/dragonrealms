// Enchanting recipes (clean-room). Worked at the Enchanting Society with the
// Enchanting skill (DR: the Artificing/Binding/Invoking discipline). A base
// crafted piece is bound with a mote of raw magic to carry a spell edge.

export const ENCHANT_RECIPES = {
  enstaff: {
    id: 'enstaff', name: 'runed oak staff', item: 'enstaff',
    ingredients: { carved_staff: 1, wisp_mote: 1 },
    minSkill: 5,
    desc: 'A carved staff bound with cold light. (1 carved staff + 1 wisp mote)',
  },
  enjerkin: {
    id: 'enjerkin', name: 'warded leather jerkin', item: 'enjerkin',
    ingredients: { cured_leather: 1, wisp_mote: 1 },
    minSkill: 10,
    desc: 'A jerkin stitched with a warding thread. (1 cured jerkin + 1 wisp mote)',
  },
  enblade: {
    id: 'enblade', name: 'spell-edged longsword', item: 'enblade',
    ingredients: { forged_steel_sword: 1, wisp_mote: 2 },
    minSkill: 25,
    desc: 'Steel that hums along its edge. (1 forged steel longsword + 2 wisp motes)',
  },
};

export function enchantRecipeById(id) {
  return ENCHANT_RECIPES[id] || null;
}
