// Playable races (clean-room).
// STATS: {str, con, ref, agi, cha, dis, wis, int}
// 0.0 modifier => no adjustment from the base of 35. Values are flat bonuses.

export const RACES = {
  human: {
    id: 'human', name: 'Human', desc: 'Adaptable and ambitious, humans excel at nothing but suffer no weakness.',
    stats: { str: 0, con: 0, ref: 0, agi: 0, cha: 0, dis: 0, wis: 0, int: 0 },
    height: "tall", weight: 'a human frame', lifespan: 'a century',
  },
  dwarf: {
    id: 'dwarf', name: 'Dwarf', desc: 'Sturdy and stubborn, dwarves are at home in stone and against the forge.',
    stats: { str: 5, con: 10, ref: -3, agi: -5, cha: -2, dis: 8, wis: 0, int: -2 },
    height: 'short', weight: 'a dense dwarf frame', lifespan: 'three centuries',
  },
  elf: {
    id: 'elf', name: 'Elf', desc: 'Graceful forest folk with keen senses and long memories.',
    stats: { str: -4, con: -4, ref: 7, agi: 6, cha: 4, dis: 0, wis: 4, int: 3 },
    height: 'tall and slender', weight: 'a light elf frame', lifespan: 'seven centuries',
  },
  elothean: {
    id: 'elothean', name: 'Elothean', desc: 'A scholarly race blessed with patience, focus and foresight.',
    stats: { str: -4, con: -3, ref: 0, agi: 0, cha: 2, dis: 8, wis: 6, int: 8 },
    height: 'average', weight: 'an elothean frame', lifespan: 'nine centuries',
  },
  gnome: {
    id: 'gnome', name: 'Gnome', desc: 'Small, quick-witted tinkerers with a talent for detail.',
    stats: { str: -8, con: -4, ref: 8, agi: 8, cha: 3, dis: 0, wis: 3, int: 6 },
    height: 'tiny', weight: 'a small gnome frame', lifespan: 'two centuries',
  },
  gortog: {
    id: 'gortog', name: "Gor'Tog", desc: 'Massive, tireless warriors bred for war and endurance.',
    stats: { str: 12, con: 10, ref: -6, agi: -6, cha: -5, dis: 4, wis: -3, int: -6 },
    height: 'enormous', weight: 'a colossal frame', lifespan: 'a century',
  },
  giantman: {
    id: 'giantman', name: 'Giantman', desc: 'Towering children of the northern wastes, giants among men in strength and stature.',
    stats: { str: 10, con: 8, ref: -4, agi: -6, cha: -3, dis: 3, wis: -2, int: -4 },
    height: 'immense', weight: 'a giantman frame', lifespan: 'a century and a half',
  },
  halfling: {
    id: 'halfling', name: 'Halfling', desc: 'Cheerful and quick, halflings are natural survivors with light feet.',
    stats: { str: -6, con: 2, ref: 7, agi: 9, cha: 5, dis: 2, wis: 2, int: 0 },
    height: 'small', weight: 'a slight halfling frame', lifespan: 'a century and a half',
  },
  kaldar: {
    id: 'kaldar', name: 'Kaldar', desc: 'Fierce and proud, kaldar balance raw strength with keen instinct.',
    stats: { str: 6, con: 6, ref: 2, agi: 0, cha: 0, dis: 2, wis: 0, int: -2 },
    height: 'tall and broad', weight: 'a powerful kaldar frame', lifespan: 'two centuries',
  },
  prydaen: {
    id: 'prydaen', name: 'Prydaen', desc: 'Catlike and graceful, prydaen stalk the wilds with unmatched agility.',
    stats: { str: 0, con: -2, ref: 6, agi: 8, cha: 4, dis: -1, wis: 0, int: 0 },
    height: 'lean', weight: 'a lithe prydaen frame', lifespan: 'two centuries',
  },
  rakash: {
    id: 'rakash', name: 'Rakash', desc: 'Wolf-kin whose sharp senses and pack loyalty define them.',
    stats: { str: 3, con: 4, ref: 5, agi: 4, cha: 0, dis: 3, wis: 2, int: -2 },
    height: 'tall and lean', weight: 'a rakash frame', lifespan: 'a century',
  },
  skra: {
    id: 'skra', name: "S'Kra Mur", desc: 'Cold-blooded serpent kin, patient, lethal, and calculating.',
    stats: { str: 5, con: 2, ref: 5, agi: 4, cha: 2, dis: 4, wis: 2, int: 3 },
    height: 'tall', weight: 'a scaled frame', lifespan: 'six centuries',
  },
};

export const raceList = Object.values(RACES);

export function raceById(id) {
  return RACES[id] || null;
}

// Derived combat attributes from stats.
export function hpFromStats(stats, circle = 1) {
  const base = 40 + stats.con * 2 + stats.str;
  return Math.floor(base * (1 + (circle - 1) * 0.08));
}

export function manaFromStats(stats, guild, circle = 1) {
  if (guild && !guild.magic) return 0;
  const base = 20 + stats.wis * 2 + stats.int + stats.dis;
  return Math.floor(base * (1 + (circle - 1) * 0.06));
}
