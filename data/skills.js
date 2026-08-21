// Skill definitions for Dragon Realms (clean-room), modeled on the source
// game's full skill taxonomy (six skillsets + guild skills).
// Categories group skills; guilds reference skills by id.
//
// Sub-skills and governing stats are documented from the source game's skill
// pages so the reference at /SKILLS.html stays faithful. Existing ids are
// stable — guild circle requirements depend on them.

export const CATEGORIES = {
  WEAPON: 'Weapon Skillset',
  ARMOR: 'Armor Skillset',
  COMBAT: 'Combat Manipulation',
  DEFENSE: 'Defense',
  LORE: 'Lore Skillset',
  MAGIC: 'Magic Skillset',
  SURVIVAL: 'Survival Skillset',
  GUILD: 'Guild Skills',
};

export const SKILLS = {
  // ================= WEAPON SKILLSET =================
  small_edged: {
    id: 'small_edged', name: 'Small Edged', cat: CATEGORIES.WEAPON, range: 'Melee',
    subskills: ['Knives', 'Daggers', 'Hatchets', 'Hand Axes', 'Short Swords', 'Rapiers', 'Scimitars'],
    training: 'Fight with daggers, short swords, and rapiers.',
  },
  medium_edged: {
    id: 'medium_edged', name: 'Medium Edged', cat: CATEGORIES.WEAPON, range: 'Melee',
    subskills: ['Hand-and-a-half Swords', 'Long Swords'],
    training: 'Fight with long swords and hand-and-a-half blades.',
  },
  large_edged: {
    id: 'large_edged', name: 'Large Edged', cat: CATEGORIES.WEAPON, range: 'Melee',
    subskills: ['Broadswords', 'Longswords', 'Battle Axes'],
    training: 'Fight with broadswords and battle axes.',
  },
  twohanded_edged: {
    id: 'twohanded_edged', name: 'Two-Handed Edged', cat: CATEGORIES.WEAPON, range: 'Melee',
    subskills: ['Greatswords', 'Greataxes', 'Flamberges', 'Claymores'],
    training: 'Fight with greatswords and greataxes.',
  },
  blunt: {
    id: 'blunt', name: 'Small Blunt', cat: CATEGORIES.WEAPON, range: 'Melee',
    subskills: ['Clubs', 'Gavels', 'Mallets', 'Maces'],
    training: 'Fight with clubs, gavels, and maces.',
  },
  // DR3: Large Blunt (2.0 "Heavy Blunt") — morning stars, hammers, ball and
  // chains, heavy maces (Elanthipedia "Large Blunt skill").
  large_blunt: {
    id: 'large_blunt', name: 'Large Blunt', cat: CATEGORIES.WEAPON, range: 'Melee',
    subskills: ['Morning Stars', 'War Hammers', 'Ball and Chains', 'Heavy Maces'],
    training: 'Fight with morning stars, war hammers, and heavy maces.',
  },
  twohanded_blunt: {
    id: 'twohanded_blunt', name: 'Two-Handed Blunt', cat: CATEGORIES.WEAPON, range: 'Melee',
    subskills: ['War Mattocks', 'Mauls'],
    training: 'Fight with mauls and war mattocks.',
  },
  polearm: {
    id: 'polearm', name: 'Polearms', cat: CATEGORIES.WEAPON, range: 'Melee/Pole',
    subskills: ['Spears', 'Pikes', 'Halberds', 'Scythes', 'Glaives', 'Voulges'],
    training: 'Fight with spears, halberds, and glaives.',
  },
  staff: {
    id: 'staff', name: 'Staves', cat: CATEGORIES.WEAPON, range: 'Melee/Pole',
    subskills: ['Nightsticks', 'Quarterstaves'],
    training: 'Fight with quarterstaves.',
  },
  brawling: {
    id: 'brawling', name: 'Brawling', cat: CATEGORIES.WEAPON, range: 'Melee',
    subskills: ['Brass Knuckles', 'Spike Knuckles', 'Elbow Spikes', 'Knee Spikes', 'Footwraps'],
    training: 'Fight unarmed.',
  },
  offhand: {
    id: 'offhand', name: 'Offhand Weapon', cat: CATEGORIES.WEAPON, range: 'Melee/Ranged',
    subskills: [],
    training: 'Fight with a weapon held in the left hand.',
  },
  melee_mastery: {
    id: 'melee_mastery', name: 'Melee Mastery', cat: CATEGORIES.WEAPON, range: 'Meta',
    subskills: [],
    training: 'A general skill with melee weapons; boosts any melee weapon skill below it.',
  },
  missile_mastery: {
    id: 'missile_mastery', name: 'Missile Mastery', cat: CATEGORIES.WEAPON, range: 'Meta',
    subskills: [],
    training: 'A general skill with ranged weapons; boosts any ranged weapon skill below it.',
  },
  bow: {
    id: 'bow', name: 'Bows', cat: CATEGORIES.WEAPON, range: 'Ranged',
    subskills: ['Shortbows', 'Longbows', 'Composite Bows'],
    training: 'Fight with bows (consumes arrows).',
  },
  crossbow: {
    id: 'crossbow', name: 'Crossbows', cat: CATEGORIES.WEAPON, range: 'Ranged',
    subskills: ['Light Crossbows', 'Heavy Crossbows', 'Arbalests', 'Stonebows'],
    training: 'Fight with crossbows (consumes bolts).',
  },
  slings: {
    id: 'slings', name: 'Slings', cat: CATEGORIES.WEAPON, range: 'Ranged',
    subskills: ['Slings', 'Slingshots', 'Staff Slings'],
    training: 'Fight with slings.',
  },
  thrown: {
    id: 'thrown', name: 'Light Thrown', cat: CATEGORIES.WEAPON, range: 'Ranged',
    subskills: ['Throwing Knives', 'Throwing Blades', 'Bolas', 'Boomerangs', 'Light Throwing Axes'],
    training: 'Fight with thrown blades and knives.',
  },
  heavy_thrown: {
    id: 'heavy_thrown', name: 'Heavy Thrown', cat: CATEGORIES.WEAPON, range: 'Ranged',
    subskills: ['Throwing Hammers', 'Hurling Axes', 'Throwing Spears'],
    training: 'Fight with hurling axes and throwing spears.',
  },
  parry: {
    id: 'parry', name: 'Parry Ability', cat: CATEGORIES.WEAPON, range: 'Melee/Pole',
    subskills: [],
    training: 'Fend off incoming melee and pole attacks.',
  },

  // ================= ARMOR SKILLSET =================
  shield_usage: {
    id: 'shield_usage', name: 'Shield Usage', cat: CATEGORIES.ARMOR,
    subskills: ['Small Shields', 'Medium Shields', 'Large Shields'],
    training: 'Take hits while a shield is equipped.',
  },
  light_armor: {
    id: 'light_armor', name: 'Light Armor', cat: CATEGORIES.ARMOR,
    subskills: ['Cloth', 'Leather', 'Bone'],
    training: 'Take hits while wearing light armor.',
  },
  chain_armor: {
    id: 'chain_armor', name: 'Chain Armor', cat: CATEGORIES.ARMOR,
    subskills: ['Mail', 'Chain', 'Ring'],
    training: 'Take hits while wearing chain armor.',
  },
  brigandine: {
    id: 'brigandine', name: 'Brigandine', cat: CATEGORIES.ARMOR,
    subskills: ['Lamellar', 'Brigandine', 'Scale'],
    training: 'Take hits while wearing brigandine.',
  },
  plate_armor: {
    id: 'plate_armor', name: 'Plate Armor', cat: CATEGORIES.ARMOR,
    subskills: ['Heavy Plate', 'Plate', 'Light Plate'],
    training: 'Take hits while wearing plate armor.',
  },
  defending: {
    id: 'defending', name: 'Defending', cat: CATEGORIES.ARMOR,
    subskills: [],
    training: 'General armor proficiency; grows with any armor training.',
  },

  // ================= COMBAT MANIPULATION =================
  martial_arts: {
    id: 'martial_arts', name: 'Martial Arts', cat: CATEGORIES.COMBAT,
    subskills: [],
    training: 'Mastered unarmed forms.',
  },
  warding: {
    id: 'warding', name: 'Warding', cat: CATEGORIES.COMBAT,
    subskills: [],
    training: 'Turn aside blows with disciplined parries.',
  },
  evasion: {
    id: 'evasion', name: 'Evasion', cat: CATEGORIES.SURVIVAL, governing: 'Reflex',
    subskills: [],
    training: 'Dodge attacks in combat.',
  },
  fitness: {
    id: 'fitness', name: 'Physical Fitness', cat: CATEGORIES.DEFENSE,
    subskills: [],
    training: 'Grow through combat and survival.',
  },
  endurance: {
    id: 'endurance', name: 'Endurance', cat: CATEGORIES.DEFENSE,
    subskills: [],
    training: 'Grow through long fights and hard work.',
  },

  // ================= MAGIC SKILLSET =================
  attunement: {
    id: 'attunement', name: 'Attunement', cat: CATEGORIES.MAGIC,
    subskills: [],
    training: 'Harness mana — gained by casting any spell.',
  },
  primary_magic: {
    id: 'primary_magic', name: 'Primary Magic', cat: CATEGORIES.MAGIC,
    subskills: [],
    training: 'General facility with magic; raised alongside any casting.',
  },
  arcana: {
    id: 'arcana', name: 'Arcana', cat: CATEGORIES.MAGIC,
    subskills: [],
    training: 'Facility with magical devices.',
  },
  augmentation: {
    id: 'augmentation', name: 'Augmentation', cat: CATEGORIES.MAGIC,
    subskills: [],
    training: 'Spells that enhance abilities and stats.',
  },
  debilitation: {
    id: 'debilitation', name: 'Debilitation', cat: CATEGORIES.MAGIC,
    subskills: [],
    training: 'Combat spells that cripple or curse.',
  },
  targeted_magic: {
    id: 'targeted_magic', name: 'Targeted Magic', cat: CATEGORIES.MAGIC,
    subskills: [],
    training: 'Offensive spells that damage enemies.',
  },
  offensive_magic: {
    id: 'offensive_magic', name: 'Offensive Magic', cat: CATEGORIES.MAGIC,
    subskills: [],
    training: 'Direct damage spells.',
  },
  defensive_magic: {
    id: 'defensive_magic', name: 'Defensive Magic', cat: CATEGORIES.MAGIC,
    subskills: [],
    training: 'Wards and protective spells.',
  },
  warding_magic: {
    id: 'warding_magic', name: 'Warding Magic', cat: CATEGORIES.MAGIC,
    subskills: [],
    training: 'Spells that prevent or mitigate damage.',
  },
  utility_magic: {
    id: 'utility_magic', name: 'Utility Magic', cat: CATEGORIES.MAGIC,
    subskills: [],
    training: 'Useful non-combat spells.',
  },
  healing_magic: {
    id: 'healing_magic', name: 'Healing Magic', cat: CATEGORIES.MAGIC,
    subskills: [],
    training: 'Mending and restoring spells.',
  },
  holy_magic: {
    id: 'holy_magic', name: 'Holy Magic', cat: CATEGORIES.MAGIC,
    subskills: [],
    training: 'Faith-wrought cleric and paladin magic.',
  },
  moon_magic: {
    id: 'moon_magic', name: 'Moon Magic', cat: CATEGORIES.MAGIC,
    subskills: [],
    training: 'Lunar and stellar magic.',
  },
  war_magic: {
    id: 'war_magic', name: 'War Magic', cat: CATEGORIES.MAGIC,
    subskills: [],
    training: 'Elemental battle magic.',
  },
  illusion: {
    id: 'illusion', name: 'Illusion', cat: CATEGORIES.MAGIC,
    subskills: [],
    training: 'Deceptive and phantasmal magic.',
  },
  necromancy: {
    id: 'necromancy', name: 'Necromancy', cat: CATEGORIES.MAGIC,
    subskills: [],
    training: 'Magic of death and decay.',
  },
  sorcery: {
    id: 'sorcery', name: 'Sorcery', cat: CATEGORIES.MAGIC,
    subskills: [],
    training: 'Casting outside your guild\'s domain; risks backlash.',
  },
  summoning: {
    id: 'summoning', name: 'Summoning', cat: CATEGORIES.MAGIC, guildSkill: 'warmage',
    subskills: [],
    training: 'Controlling familiars and summoned weapons.',
  },
  inner_fire: {
    id: 'inner_fire', name: 'Inner Fire', cat: CATEGORIES.MAGIC, guildSkill: 'barbarian',
    subskills: [],
    training: 'The fury that fuels barbarian powers; grows in battle.',
  },

  // ================= SURVIVAL SKILLSET =================
  athletics: {
    id: 'athletics', name: 'Athletics', cat: CATEGORIES.SURVIVAL, governing: 'Str, Sta',
    subskills: [],
    training: 'Climb and swim more surely.',
  },
  climbing: {
    id: 'climbing', name: 'Climbing', cat: CATEGORIES.SURVIVAL,
    subskills: [],
    training: 'Scale obstacles.',
  },
  swimming: {
    id: 'swimming', name: 'Swimming', cat: CATEGORIES.SURVIVAL,
    subskills: [],
    training: 'Move through water.',
  },
  perception: {
    id: 'perception', name: 'Perception', cat: CATEGORIES.SURVIVAL, governing: 'Wisdom',
    subskills: [],
    training: 'Hunt, track, and spot hidden things.',
  },
  hunting: {
    id: 'hunting', name: 'Hunting', cat: CATEGORIES.SURVIVAL,
    subskills: [],
    training: 'Stalk prey; grows alongside combat kills.',
  },
  tracking: {
    id: 'tracking', name: 'Tracking', cat: CATEGORIES.SURVIVAL,
    subskills: [],
    training: 'Use the "track" command to read the wilds.',
  },
  foraging: {
    id: 'foraging', name: 'Outdoorsmanship', cat: CATEGORIES.SURVIVAL, governing: 'Int, Wis',
    subskills: ['Foraging', 'Mining', 'Fishing', 'Animal Lore'],
    training: 'Use the "forage" command in the wilds.',
  },
  hiding: {
    id: 'hiding', name: 'Hiding', cat: CATEGORIES.SURVIVAL,
    subskills: [],
    training: 'Melt out of sight.',
  },
  stealth: {
    id: 'stealth', name: 'Stealth', cat: CATEGORIES.SURVIVAL, governing: 'Dis, Agi, Ref',
    subskills: [],
    training: 'Move unseen; backstabs strike from stealth.',
  },
  lockpicking: {
    id: 'lockpicking', name: 'Locksmithing', cat: CATEGORIES.SURVIVAL, governing: 'Agi, Ref',
    subskills: [],
    training: 'Disarm and pick locks.',
  },
  thievery: {
    id: 'thievery', name: 'Thievery', cat: CATEGORIES.SURVIVAL, governing: 'Agi, Dis',
    subskills: [],
    training: 'Pilfer coins and goods.',
  },
  first_aid: {
    id: 'first_aid', name: 'First Aid', cat: CATEGORIES.SURVIVAL,
    subskills: [],
    training: 'Use salves, herbs, and potions.',
  },
  skinning: {
    id: 'skinning', name: 'Skinning', cat: CATEGORIES.SURVIVAL, governing: 'Agi, Int, Dis',
    subskills: [],
    training: 'Skin the creatures you fell.',
  },
  herbal_lore: {
    id: 'herbal_lore', name: 'Herbal Lore', cat: CATEGORIES.LORE,
    subskills: [],
    training: 'Identify and gather useful plants.',
  },

  // ================= LORE SKILLSET =================
  appraisal: {
    id: 'appraisal', name: 'Appraisal', cat: CATEGORIES.LORE,
    subskills: [],
    training: 'Judge the quality and value of items.',
  },
  alchemy: {
    id: 'alchemy', name: 'Alchemy', cat: CATEGORIES.LORE,
    subskills: ['Reactants', 'Remedies'],
    training: 'Craft potions at the Tilted Retort.',
  },
  engineering: {
    id: 'engineering', name: 'Engineering', cat: CATEGORIES.LORE,
    subskills: ['Carving', 'Shaping', 'Tinkering'],
    training: 'Carve, shape, and tinker mechanical items.',
  },
  forging: {
    id: 'forging', name: 'Forging', cat: CATEGORIES.LORE,
    subskills: ['Blacksmithing', 'Armorsmithing', 'Weaponsmithing'],
    training: 'Smith metal into weapons and armor.',
  },
  enchanting: {
    id: 'enchanting', name: 'Enchanting', cat: CATEGORIES.LORE,
    subskills: [],
    training: 'Craft enchanted magical items.',
  },
  outfitting: {
    id: 'outfitting', name: 'Outfitting', cat: CATEGORIES.LORE,
    subskills: ['Artistry', 'Jewelry Making', 'Tailoring'],
    training: 'Tailor cloth, leather, and jewelry.',
  },
  scholarship: {
    id: 'scholarship', name: 'Scholarship', cat: CATEGORIES.LORE,
    subskills: [],
    training: 'Study books, tomes, and teachers.',
  },
  performance: {
    id: 'performance', name: 'Performance', cat: CATEGORIES.LORE,
    subskills: ['Instruments', 'Voice'],
    training: 'Play music and perform.',
  },
  tactics: {
    id: 'tactics', name: 'Tactics', cat: CATEGORIES.LORE,
    subskills: [],
    training: 'Gain advantage through combat maneuvers.',
  },
  astrology: {
    id: 'astrology', name: 'Astrology', cat: CATEGORIES.MAGIC, guildSkill: 'moonmage',
    subskills: [],
    training: 'Read the celestial spheres.',
  },
  theurgy: {
    id: 'theurgy', name: 'Theurgy', cat: CATEGORIES.MAGIC, guildSkill: 'cleric',
    subskills: [],
    training: 'Ritual devotion and faith magic.',
  },
  elemental_lore: {
    id: 'elemental_lore', name: 'Elemental Lore', cat: CATEGORIES.LORE,
    subskills: [],
    training: 'Knowledge of the elements.',
  },
  necromancy_lore: {
    id: 'necromancy_lore', name: 'Necromancy Lore', cat: CATEGORIES.LORE,
    subskills: [],
    training: 'Knowledge of death and the grave.',
  },

  // ================= GUILD SKILLS =================
  empathy: {
    id: 'empathy', name: 'Empathy', cat: CATEGORIES.GUILD, guildSkill: 'empath',
    subskills: [],
    training: 'Feel and mend the life force of others.',
  },
  expertise: {
    id: 'expertise', name: 'Expertise', cat: CATEGORIES.GUILD, guildSkill: 'barbarian',
    subskills: [],
    training: 'Barbarian analyze and combat mastery.',
  },
  scouting: {
    id: 'scouting', name: 'Scouting', cat: CATEGORIES.GUILD, guildSkill: 'ranger',
    subskills: [],
    training: 'Ranger trails and scouting reports.',
  },
  backstab: {
    id: 'backstab', name: 'Backstab', cat: CATEGORIES.GUILD, guildSkill: 'thief',
    subskills: [],
    training: 'Strike hidden foes from the shadows.',
  },
  bardic_lore: {
    id: 'bardic_lore', name: 'Bardic Lore', cat: CATEGORIES.GUILD, guildSkill: 'bard',
    subskills: [],
    training: 'Bardic songs, whistling, and recall.',
  },
  conviction: {
    id: 'conviction', name: 'Conviction', cat: CATEGORIES.GUILD, guildSkill: 'paladin',
    subskills: [],
    training: 'Paladin faith and smite.',
  },
  thanatology: {
    id: 'thanatology', name: 'Thanatology', cat: CATEGORIES.GUILD, guildSkill: 'necromancer',
    subskills: [],
    training: 'Necromancer rituals of the grave.',
  },
  trading: {
    id: 'trading', name: 'Trading', cat: CATEGORIES.GUILD, guildSkill: 'trader',
    subskills: [],
    training: 'Deal, bargain, and move silver.',
  },
};

export const skillList = Object.values(SKILLS);

export function skillById(id) {
  return SKILLS[id] || null;
}

// EXP required to advance from one rank to the next.
// Mirrors the source game's shape: ~200 bits for the first rank, then a small
// linear increase per rank. Higher ranks stay achievable rather than exploding.
export function expToNextRank(rank) {
  return 200 + rank;
}

// Total "rank points" is the sum of all skill ranks. Circles build on this.
export function totalRanks(skills) {
  let sum = 0;
  for (const v of Object.values(skills)) sum += v.rank || 0;
  return sum;
}

// DR mindstate ladder: 34 states from clear to mind lock, mapped by how full
// the current rank's exp pool is. Used by the `exp` command readout.
export const MINDSTATES = [
  'clear', 'dabbling', 'perusing', 'learning', 'thoughtful', 'thinking',
  'considering', 'pondering', 'ruminating', 'concentrating', 'attentive',
  'deliberative', 'interested', 'examining', 'understanding', 'absorbing',
  'intrigued', 'scrutinizing', 'analyzing', 'studious', 'focused',
  'very focused', 'engaged', 'very engaged', 'cogitating', 'fascinated',
  'captivated', 'engrossed', 'riveted', 'very riveted', 'rapt', 'very rapt',
  'enthralled', 'nearly locked', 'mind lock',
];

export function mindstate(pct) {
  const idx = Math.min(MINDSTATES.length - 1, Math.floor((Math.max(0, pct) / 100) * MINDSTATES.length));
  return MINDSTATES[idx];
}

// DR skill-level messaging tiers: Novice -> Practitioner -> ... -> Avatar,
// with degree modifiers inside most tiers. Used by the `skills` output.
const TIERS = [
  { name: 'Novice', lo: 1, hi: 49, degree: ['Lowly', 'Promising', 'Able', 'Trained', 'Full'], width: 10 },
  { name: 'Practitioner', lo: 50, hi: 99, degree: ['Beginning', 'Competent', 'Proficient', 'Experienced', 'Skilled'], width: 10 },
  { name: 'Dilettante', lo: 100, hi: 149, degree: ['Beginning', 'Competent', 'Proficient', 'Experienced', 'Skilled'], width: 10 },
  { name: 'Aficionado', lo: 150, hi: 199, degree: ['Beginning', 'Competent', 'Proficient', 'Experienced', 'Skilled'], width: 10 },
  { name: 'Adept', lo: 200, hi: 299, degree: null, width: 0 },
  { name: 'Expert', lo: 300, hi: 399, degree: null, width: 0 },
  { name: 'Professional', lo: 400, hi: 499, degree: ['Exceptional', 'Outstanding', 'Renowned', 'True'], width: 20 },
  { name: 'Authority', lo: 500, hi: 599, degree: ['Exceptional', 'Outstanding', 'Renowned', 'True'], width: 20 },
  { name: 'Genius', lo: 600, hi: 699, degree: ['Exceptional', 'Outstanding', 'Renowned', 'True'], width: 20 },
  { name: 'Savant', lo: 700, hi: 799, degree: ['Distinguished', 'Venerated', 'Exalted', 'Transcendent'], width: 20 },
  { name: 'Master', lo: 800, hi: 899, degree: ['Distinguished', 'Venerated', 'Exalted', 'Transcendent'], width: 20 },
  { name: 'Grand Master', lo: 900, hi: 999, degree: ['Distinguished', 'Venerated', 'Exalted', 'Transcendent'], width: 20 },
  { name: 'Guru', lo: 1000, hi: 1249, degree: null, width: 0 },
  { name: 'Legend', lo: 1250, hi: 1499, degree: null, width: 0 },
  { name: 'Phenom', lo: 1500, hi: 1749, degree: null, width: 0 },
  { name: 'Avatar', lo: 1750, hi: 1750, degree: null, width: 0 },
];

export function skillTier(rank) {
  if (rank <= 0) return { tier: 'Novice', label: 'unskilled' };
  const t = TIERS.find((x) => rank >= x.lo && rank <= x.hi) || TIERS[0];
  if (!t.degree) return { tier: t.name, label: t.name };
  const off = rank - t.lo;
  // 10-wide tiers start their degrees at +0; 20-wide tiers (Professional+) at +20.
  const start = t.width === 20 ? 20 : 0;
  if (off < start) return { tier: t.name, label: t.name };
  const idx = Math.min(t.degree.length - 1, Math.floor((off - start) / t.width));
  return { tier: t.name, label: `${t.name} ${t.degree[idx]}` };
}
