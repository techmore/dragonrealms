// Guild definitions (clean-room). Each guild trains a primary and secondary
// set of skills. To advance a circle (level) you must raise those skills and
// visit your guild's trainer. Guilds with `magic` use mana and cast spells.

export const GUILDS = {
  barbarian: {
    id: 'barbarian', name: 'Barbarian', color: '#b5651d',
    desc: 'Lone wolves of the wild, barbarians channel raw fury into overwhelming violence. They shun magic and trust the axe, the bow, and the howl of battle.',
    magic: false,
    primary: ['large_edged', 'twohanded_edged', 'twohanded_blunt', 'light_armor', 'fitness', 'evasion'],
    secondary: ['blunt', 'large_blunt', 'thrown', 'perception', 'foraging'],
    guildSkill: "expertise",
    spell: null,
    spells: [],
    power: { name: 'Berserk', desc: 'Enter a state of unbridled fury, striking harder while ignoring defense.' },
  },
  bard: {
    id: 'bard', name: 'Bard', color: '#7a2f8f',
    desc: 'Wandering storytellers and bladesingers whose song shapes reality. Bards weave illusion and inspire allies.',
    magic: true,
    primary: ['medium_edged', 'small_edged', 'light_armor', 'illusion', 'utility_magic', 'perception'],
    secondary: ['attunement', 'appraisal', 'fitness', 'evasion'],
    guildSkill: "bardic_lore",
    spell: null,
    spells: [
      { id: 'chime', name: 'Dissonant Chime', skill: 'illusion', mana: 12, minCircle: 1, kind: 'damage', base: 7, desc: 'Send a jarring note at a foe, staggering them.' },
      { id: 'lullaby', name: 'Minor Lullaby', skill: 'illusion', mana: 18, minCircle: 3, kind: 'sleep', base: 2, desc: 'Weave a haunting tune that lulls a foe into stupor.' },
      { id: 'song_of_woe', name: 'Song of Woe', skill: 'illusion', mana: 24, minCircle: 5, kind: 'damage', base: 16, desc: 'Weave a grinding dirge that wounds the mind.' },
      { id: 'finale', name: 'Finale', skill: 'illusion', mana: 34, minCircle: 8, kind: 'damage', base: 24, desc: 'End the song in a crashing chord that flattens a foe.' },
      { id: 'crescendo', name: 'Crescendo', skill: 'illusion', mana: 36, minCircle: 7, kind: 'damage', base: 30, desc: 'Build the music to a deafening peak that tears at a foe.' },
    ],
    power: null,
  },
  cleric: {
    id: 'cleric', name: 'Cleric', color: '#c9b458',
    desc: 'Servants of the divine pantheon, clerics burn their faith into holy wrath and mend the wounds of the faithful.',
    magic: true,
    primary: ['blunt', 'medium_edged', 'chain_armor', 'holy_magic', 'theurgy', 'healing_magic'],
    secondary: ['attunement', 'defensive_magic', 'fitness', 'shield_usage'],
    guildSkill: "theurgy",
    spell: null,
    spells: [
      { id: 'sacred_flame', name: 'Sacred Flame', skill: 'holy_magic', mana: 10, minCircle: 1, kind: 'damage', base: 6, desc: 'Scorch a foe with searing holy fire.' },
      { id: 'wrath', name: 'Wrath of Heaven', skill: 'holy_magic', mana: 20, minCircle: 3, kind: 'damage', base: 15, desc: 'Call down blinding divine wrath upon a foe.' },
      { id: 'judgement', name: 'Hand of Judgement', skill: 'holy_magic', mana: 26, minCircle: 5, kind: 'damage', base: 18, desc: 'Call down a divine hand that crushes a foe.' },
      { id: 'judgement_sun', name: 'Judgement of the Sun', skill: 'holy_magic', mana: 36, minCircle: 8, kind: 'damage', base: 26, desc: 'Call down the sun itself — a pillar of white fire.' },
      { id: 'holy_aegis', name: 'Aegis of Faith', skill: 'holy_magic', mana: 30, minCircle: 7, kind: 'buff', base: 0, buff: { key: 'ironhide', ticks: 60 }, desc: 'Wrap yourself in a veil of faith that blunts incoming blows.' },
    ],
    power: null,
  },
  empath: {
    id: 'empath', name: 'Empath', color: '#4aa3a3',
    desc: 'Healers bound to the life force of others. Empaths mend body and spirit, and defend themselves when pressed.',
    magic: true,
    primary: ['blunt', 'small_edged', 'light_armor', 'healing_magic', 'attunement', 'evasion'],
    secondary: ['first_aid', 'herbal_lore', 'fitness', 'utility_magic'],
    guildSkill: "empathy",
    spell: null,
    spells: [
      { id: 'soothe', name: 'Soothe', skill: 'healing_magic', mana: 8, minCircle: 1, kind: 'heal', base: 18, desc: 'Restore a modest measure of health to a target.' },
      { id: 'mending', name: 'Mending Touch', skill: 'healing_magic', mana: 16, minCircle: 3, kind: 'heal', base: 45, desc: 'Mend deeper wounds with a focused touch.' },
      { id: 'warm_embrace', name: 'Warm Embrace', skill: 'healing_magic', mana: 28, minCircle: 5, kind: 'heal', base: 80, desc: 'Wrap yourself in living warmth, mending deep wounds.' },
      { id: 'rekindle', name: 'Rekindle', skill: 'healing_magic', mana: 36, minCircle: 8, kind: 'heal', base: 130, desc: 'Re-light the fire of life itself — a torrent of healing.' },
      { id: 'life_shield', name: 'Life Shield', skill: 'healing_magic', mana: 30, minCircle: 7, kind: 'buff', base: 0, buff: { key: 'ironhide', ticks: 60 }, desc: 'Wrap yourself in living aether that blunts incoming harm.' },
    ],
    power: null,
  },
  moonmage: {
    id: 'moonmage', name: 'Moon Mage', color: '#9aa6b8',
    desc: 'Readers of the celestial spheres, moon mages bend the light of moons and stars to their will.',
    magic: true,
    primary: ['small_edged', 'medium_edged', 'light_armor', 'moon_magic', 'astrology', 'attunement'],
    secondary: ['utility_magic', 'defensive_magic', 'perception', 'evasion'],
    guildSkill: "astrology",
    spell: null,
    spells: [
      { id: 'moon_bolt', name: 'Moon Bolt', skill: 'moon_magic', mana: 11, minCircle: 1, kind: 'damage', base: 7, desc: 'Lash a foe with silvery lunar light.' },
      { id: 'shadowstep', name: 'Shadowstep', skill: 'moon_magic', mana: 14, minCircle: 3, kind: 'teleport', base: 0, desc: 'Bend the shadows and slip through them to escape.' },
      { id: 'eclipse_ward', name: 'Eclipse Ward', skill: 'defensive_magic', mana: 24, minCircle: 5, kind: 'ward', base: 18, desc: 'Bend moonlight into a ward that turns aside blows.' },
      { id: 'stellar_cascade', name: 'Stellar Cascade', skill: 'moon_magic', mana: 38, minCircle: 8, kind: 'damage', base: 26, desc: 'Unleash a rain of falling stars upon a foe.' },
      { id: 'eclipse_binding', name: 'Eclipse Binding', skill: 'moon_magic', mana: 30, minCircle: 7, kind: 'sleep', base: 5, desc: 'Bind a foe in the shadow of the dark moon, stupefying it.' },
    ],
    power: null,
  },
  necromancer: {
    id: 'necromancer', name: 'Necromancer', color: '#5f7a3a',
    desc: 'Scholars of the grave who barter with death. Necromancers command decay and the restless dead.',
    magic: true,
    primary: ['small_edged', 'blunt', 'chain_armor', 'necromancy', 'necromancy_lore', 'attunement'],
    secondary: ['offensive_magic', 'utility_magic', 'perception', 'fitness'],
    guildSkill: "thanatology",
    spell: null,
    spells: [
      { id: 'bone_spear', name: 'Bone Spear', skill: 'necromancy', mana: 10, minCircle: 1, kind: 'damage', base: 7, desc: 'Hurl a lance of jagged bone at a foe.' },
      { id: 'rot', name: 'Crippling Rot', skill: 'necromancy', mana: 18, minCircle: 3, kind: 'damage', base: 8, desc: 'Wreathe a foe in decaying magic that gnaws flesh and slows its blows.' },
      { id: 'grave_mist', name: 'Grave Mist', skill: 'necromancy', mana: 22, minCircle: 5, kind: 'sleep', base: 4, desc: 'Exhale a chill mist that smothers a foe\'s attacks.' },
      { id: 'blood_harvest', name: 'Blood Harvest', skill: 'necromancy', mana: 34, minCircle: 8, kind: 'drain', base: 18, desc: 'Tear life from a foe and drink it down.' },
      { id: 'soul_drain', name: 'Soul Drain', skill: 'necromancy', mana: 34, minCircle: 7, kind: 'drain', base: 24, desc: 'Draw the soul-thread from a foe, stealing its vitality.' },
    ],
    power: null,
  },
  paladin: {
    id: 'paladin', name: 'Paladin', color: '#d6c9a0',
    desc: 'Armored champions of order, paladins bind steel and prayer into an unbreakable shield.',
    magic: true,
    primary: ['large_edged', 'medium_edged', 'plate_armor', 'shield_usage', 'holy_magic', 'defensive_magic'],
    secondary: ['attunement', 'fitness', 'parry', 'theurgy'],
    guildSkill: "conviction",
    spell: null,
    spells: [
      { id: 'smite', name: 'Smite', skill: 'holy_magic', mana: 12, minCircle: 1, kind: 'damage', base: 8, desc: 'Strike a foe with divine judgment.' },
      { id: 'ward', name: 'Guardian Ward', skill: 'defensive_magic', mana: 15, minCircle: 3, kind: 'ward', base: 12, desc: 'Raise a shimmering ward that turns aside blows for a time.' },
      { id: 'holy_bulwark', name: 'Holy Bulwark', skill: 'defensive_magic', mana: 26, minCircle: 5, kind: 'ward', base: 22, desc: 'Raise a radiant bulwark that blunts incoming harm.' },
      { id: 'righteous_aegis', name: 'Righteous Aegis', skill: 'defensive_magic', mana: 34, minCircle: 8, kind: 'buff', buff: { key: 'ironhide', ticks: 30 }, base: 0, desc: 'Shroud yourself in righteous iron — incoming blows are blunted.' },
      { id: 'sunburst', name: 'Sunburst', skill: 'holy_magic', mana: 34, minCircle: 7, kind: 'damage', base: 30, desc: 'Release a blinding burst of holy light that sears a foe.' },
    ],
    power: null,
  },
  ranger: {
    id: 'ranger', name: 'Ranger', color: '#4f7942',
    desc: 'Guardians of the wild, rangers are masters of bow, blade, and the living land around them.',
    magic: true,
    primary: ['bow', 'large_edged', 'light_armor', 'tracking', 'foraging', 'evasion'],
    secondary: ['medium_edged', 'fitness', 'swimming', 'climbing', 'perception'],
    guildSkill: "scouting",
    spell: null,
    spells: [
      { id: 'camouflage', name: 'Camouflage', skill: 'utility_magic', mana: 6, minCircle: 1, kind: 'buff', buff: { key: 'shadow', ticks: 20 }, base: 0, desc: 'Melt into the surroundings — 15% harder to hit for a time.' },
      { id: 'hunters_mark', name: "Hunter's Mark", skill: 'tracking', mana: 12, minCircle: 3, kind: 'mark', base: 4, desc: 'Mark a foe, guiding your blows for a time.' },
      { id: 'swift_wound', name: 'Swift Wound', skill: 'tracking', mana: 24, minCircle: 5, kind: 'mark', base: 8, desc: 'Mark a foe for death — your blows strike with dread precision.' },
      { id: 'hunters_aspect', name: "Hunter's Aspect", skill: 'tracking', mana: 34, minCircle: 8, kind: 'buff', buff: { key: 'frenzy', ticks: 30 }, base: 0, desc: 'Take on the hunter\'s aspect — your blows land with killing force.' },
      { id: 'thorns', name: 'Thorn Ward', skill: 'utility_magic', mana: 26, minCircle: 7, kind: 'buff', buff: { key: 'omen', ticks: 60 }, base: 0, desc: 'Call the wild\'s thorns about you — harm slides off you.' },
    ],
    power: null,
  },
  thief: {
    id: 'thief', name: 'Thief', color: '#555555',
    desc: 'Masters of shadow and lockpick, thieves strike unseen and leave only silence behind.',
    magic: false,
    primary: ['small_edged', 'medium_edged', 'light_armor', 'hiding', 'stealth', 'evasion'],
    secondary: ['lockpicking', 'perception', 'appraisal', 'brawling'],
    guildSkill: "backstab",
    spell: null,
    spells: [],
    power: { name: 'Backstab', desc: 'Strike a hidden foe for devastating surprise damage.' },
  },
  trader: {
    id: 'trader', name: 'Trader', color: '#b0893c',
    desc: 'Merchants and dealmakers who turn silver into destiny. Traders negotiate contracts and survive on wit.',
    magic: false,
    primary: ['small_edged', 'blunt', 'light_armor', 'appraisal', 'perception', 'brawling'],
    secondary: ['fitness', 'evasion', 'foraging', 'utility_magic'],
    guildSkill: "trading",
    spell: null,
    spells: [],
    power: { name: 'Contract', desc: 'Call in favors and coin from a network of contacts.' },
  },
  warmage: {
    id: 'warmage', name: 'Warrior Mage', color: '#c0392b',
    desc: 'Elemental battle-casters who sculpt fire, lightning, and stone into instruments of war.',
    magic: true,
    primary: ['medium_edged', 'blunt', 'chain_armor', 'war_magic', 'offensive_magic', 'attunement'],
    secondary: ['elemental_lore', 'defensive_magic', 'fitness', 'evasion'],
    guildSkill: "summoning",
    spell: null,
    spells: [
      { id: 'fire_shard', name: 'Fire Shard', skill: 'war_magic', mana: 9, minCircle: 1, kind: 'damage', base: 6, desc: 'Blast a foe with a shard of blazing flame.' },
      { id: 'lightning', name: 'Lightning Bolt', skill: 'war_magic', mana: 16, minCircle: 3, kind: 'damage', base: 14, desc: 'Hurl a crackling bolt of lightning that arcs to its mark.' },
      { id: 'storm_burst', name: 'Storm Burst', skill: 'war_magic', mana: 26, minCircle: 5, kind: 'damage', base: 20, desc: 'Unleash a crackling stormburst upon a foe.' },
      { id: 'cataclysm', name: 'Cataclysm', skill: 'war_magic', mana: 38, minCircle: 8, kind: 'damage', base: 30, desc: 'Unleash your masterwork — an eruption of elemental fury.' },
      { id: 'flame_ward', name: 'Flame Ward', skill: 'war_magic', mana: 30, minCircle: 7, kind: 'ward', base: 18, desc: 'Raise a veil of dancing flame that turns aside blows.' },
    ],
    power: null,
  },
};

export const guildList = Object.values(GUILDS);

export function guildById(id) {
  return GUILDS[id] || null;
}

// All skills a guild trains (primary + secondary), used for display.
export function guildTrainedSkills(guild) {
  return [...guild.primary, ...guild.secondary];
}

// Everything a guild's trainer teaches, including its guild skill.
export function trainableSkills(guild) {
  return guild.guildSkill ? [...guild.primary, ...guild.secondary, guild.guildSkill] : guildTrainedSkills(guild);
}

// Spells a guild knows at or below the given circle.
export function spellsFor(guild, circle) {
  if (!guild.spells) return [];
  return guild.spells.filter((s) => s.minCircle <= circle);
}

// Guild rank titles, one per circle (1..10).
export const TITLES = {
  barbarian: ['Furrier', 'Outcast', 'Khan', 'Fury', 'Skald', 'Berserker', 'Wildling', 'Warcaller', 'Chieftain', 'Warlord'],
  bard: ['Minstrel', 'Troubadour', 'Bard', 'Songsmith', 'Talespinner', 'Balladeer', 'Maestro', 'Virtuoso', 'Rhapsodist', 'Loremaster'],
  cleric: ['Acolyte', 'Novice', 'Clergy', 'Priest', 'Curate', 'Vicar', 'High Priest', 'Bishop', 'Archon', 'High Cleric'],
  empath: ['Listener', 'Comforter', 'Empath', 'Soul Healer', 'Life Mender', 'Vivifier', 'Renewer', 'Hearth Keeper', 'Soulwarden', 'Guardian of Life'],
  moonmage: ['Star Gazer', 'Lunar Initiate', 'Moon Mage', 'Astrologue', 'Celestial Seer', 'Moon Speaker', 'Starcaller', 'Voidwalker', 'Moon Lord', 'Astral Prophet'],
  necromancer: ['Gravehand', 'Corpsewright', 'Necromancer', 'Bonecrafter', 'Deathspeaker', 'Shadeweaver', 'Grave Lord', 'Soul Reaper', 'Lich-Kin', 'Deathlord'],
  paladin: ['Squire', 'Armiger', 'Paladin', 'Knight Errant', 'Knight', 'Champion', 'Crusader', 'Sentinel', 'Defender', 'Paragon'],
  ranger: ['Greenhand', 'Trailwarden', 'Ranger', 'Pathfinder', 'Woodsman', 'Warden', 'Beastmaster', 'Stalker', 'Huntmaster', 'Ranger-King'],
  thief: ['Urchin', 'Cutpurse', 'Thief', 'Shadow', 'Rooftopper', 'Burglar', 'Nightblade', 'Shade', 'Shadowmaster', 'Ghost'],
  trader: ['Hawker', 'Pedlar', 'Trader', 'Merchant', 'Factor', 'Negotiator', 'Magnate', 'Tycoon', 'Merchant Prince', 'Merchant King'],
  warmage: ['Apprentice', 'Battle Magus', 'Warrior Mage', 'Pyromancer', 'Elementalist', 'War Wizard', 'Battlemage', 'Archmagus', 'Storm Lord', 'War Magus'],
};

export function guildTitle(guild, circle) {
  const titles = TITLES[guild.id];
  if (!titles) return guild.name;
  const idx = Math.max(0, Math.min(titles.length - 1, circle - 1));
  return titles[idx];
}

// Circle-10 capstones: a signature passive every guild unlocks at the top of
// the ladder. Applied by the combat/economy systems when p.circle >= 10.
export const CAPSTONES = {
  barbarian: { name: 'Fury of Ages', desc: 'Berserk no longer leaves you open — you strike with total abandon.' },
  bard: { name: 'Golden Voice', desc: 'Your song sustains you: mana returns to you even in the thick of battle.' },
  cleric: { name: 'Wrath of the Pantheon', desc: 'Your holy magic burns 30% hotter.' },
  empath: { name: 'Lifebinder', desc: 'You mend yourself constantly in battle, regaining health each moment.' },
  moonmage: { name: 'Moonsight', desc: 'The moons guide your step — you are 20% harder to hit.' },
  necromancer: { name: 'Death Pact', desc: 'A portion of every wound you deal returns to you as stolen life.' },
  paladin: { name: 'Aegis of Faith', desc: 'Your faith turns aside blows — a chance to completely negate incoming damage.' },
  ranger: { name: 'Wild Stride', desc: 'The wilds themselves shelter you — 20% harder to hit in the wilds.' },
  thief: { name: 'Phantom', desc: 'Your backstab heals and returns twice as fast.' },
  trader: { name: 'Golden Touch', desc: 'Everything you sell fetches 25% more silver.' },
  warmage: { name: 'Pyromaster', desc: 'Your spells detonate with 30% greater force.' },
};

export function capstoneFor(guild) {
  return CAPSTONES[guild.id] || null;
}

export function spellById(guild, nameOrId) {
  if (!guild.spells) return null;
  const n = String(nameOrId || '').toLowerCase();
  return guild.spells.find((s) =>
    s.id === n || s.name.toLowerCase().includes(n) || s.name.toLowerCase() === n
  ) || null;
}

// Skill pools eligible to satisfy "Nth skill" requirements per skillset
// (source-game rules: mastery skills and Sorcery/Thievery never count).
const NTH_POOLS = {
  weapon: [
    'small_edged', 'medium_edged', 'large_edged', 'twohanded_edged', 'blunt', 'large_blunt', 'twohanded_blunt',
    'slings', 'bow', 'crossbow', 'staff', 'polearm', 'thrown', 'heavy_thrown', 'brawling',
  ],
  armor: ['light_armor', 'chain_armor', 'brigandine', 'plate_armor', 'shield_usage'],
  survival: ['evasion', 'athletics', 'perception', 'stealth', 'lockpicking', 'first_aid', 'foraging', 'skinning'],
  lore: ['scholarship', 'tactics', 'performance', 'appraisal', 'forging', 'engineering', 'outfitting', 'alchemy', 'enchanting'],
  magic: ['attunement', 'arcana', 'augmentation', 'debilitation', 'targeted_magic', 'utility_magic', 'warding_magic'],
  supernatural: ['augmentation', 'debilitation', 'targeted_magic', 'utility_magic', 'warding_magic'],
};

// Eligibility exceptions are guild-specific in the source tables. Thievery
// is a soft survival requirement for Thieves, while guilds such as Barbarians
// explicitly restrict it from Nth-skill credit.
const NTH_ADDITIONS = {
  thief: { survival: ['thievery'] },
};

// DR-style circle requirement tables (Elanthipedia, 1-10 band). Each rank is
// the per-circle increment for that band, not the cumulative circle-10 total.
// Rows: { skill, rank, hard } for named skills; { nth, set, rank } for Nth-of-skillset.
const CIRCLE_TABLES = {
  barbarian: [
    { skill: 'expertise', rank: 4, hard: true },
    { skill: 'inner_fire', rank: 1, hard: true },
    { nth: 5, set: 'survival', rank: 1 },
    { skill: 'parry', rank: 4, hard: true },
    { nth: 1, set: 'weapon', rank: 4 }, { nth: 2, set: 'weapon', rank: 4 },
    { nth: 3, set: 'weapon', rank: 2 }, { nth: 4, set: 'weapon', rank: 1 },
    { nth: 1, set: 'armor', rank: 3 }, { nth: 2, set: 'armor', rank: 1 },
    { skill: 'evasion', rank: 3, hard: true },
    { nth: 1, set: 'survival', rank: 2 }, { nth: 2, set: 'survival', rank: 2 },
    { nth: 3, set: 'survival', rank: 2 }, { nth: 4, set: 'survival', rank: 1 },
    { skill: 'tactics', rank: 1, hard: true },
    { nth: 1, set: 'lore', rank: 2 },
  ],
  bard: [
    { nth: 1, set: 'armor', rank: 2 },
    { skill: 'parry', rank: 2, hard: true },
    { nth: 1, set: 'weapon', rank: 3 }, { nth: 2, set: 'weapon', rank: 2 },
    { skill: 'performance', rank: 4, hard: true },
    { skill: 'tactics', rank: 2 },
    { nth: 1, set: 'lore', rank: 3 }, { nth: 2, set: 'lore', rank: 3 }, { nth: 3, set: 'lore', rank: 2 },
    { nth: 1, set: 'magic', rank: 3 }, { nth: 2, set: 'magic', rank: 2 },
    { nth: 3, set: 'magic', rank: 2 }, { nth: 4, set: 'magic', rank: 1 },
    { nth: 1, set: 'survival', rank: 1 }, { nth: 2, set: 'survival', rank: 1 },
    { nth: 3, set: 'survival', rank: 1 }, { nth: 4, set: 'survival', rank: 1 },
  ],
  cleric: [
    { skill: 'shield_usage', rank: 1, hard: true },
    { nth: 1, set: 'armor', rank: 2 },
    { skill: 'parry', rank: 2, hard: true },
    { nth: 1, set: 'weapon', rank: 3 },
    { nth: 1, set: 'lore', rank: 2 }, { nth: 2, set: 'lore', rank: 2 }, { nth: 3, set: 'lore', rank: 1 },
    { skill: 'theurgy', rank: 3, hard: true },
    { skill: 'attunement', rank: 2 },
    { nth: 1, set: 'magic', rank: 4 }, { nth: 2, set: 'magic', rank: 4 }, { nth: 3, set: 'magic', rank: 3 },
    { nth: 1, set: 'survival', rank: 1 }, { nth: 2, set: 'survival', rank: 1 },
    { nth: 3, set: 'survival', rank: 1 }, { nth: 4, set: 'survival', rank: 1 },
  ],
  empath: [
    { skill: 'empathy', rank: 4, hard: true },
    { skill: 'scholarship', rank: 3, hard: true },
    { nth: 1, set: 'lore', rank: 3 }, { nth: 2, set: 'lore', rank: 2 }, { nth: 3, set: 'lore', rank: 2 },
    { skill: 'first_aid', rank: 2, hard: true },
    { skill: 'foraging', rank: 1 },
    { nth: 1, set: 'magic', rank: 3 }, { nth: 2, set: 'magic', rank: 2 }, { nth: 3, set: 'magic', rank: 2 },
    { nth: 1, set: 'survival', rank: 1 }, { nth: 2, set: 'survival', rank: 1 }, { nth: 3, set: 'survival', rank: 1 },
  ],
  moonmage: [
    { skill: 'scholarship', rank: 3, hard: true },
    { nth: 1, set: 'lore', rank: 2 }, { nth: 2, set: 'lore', rank: 2 }, { nth: 3, set: 'lore', rank: 1 },
    { skill: 'astrology', rank: 3, hard: true },
    { nth: 1, set: 'magic', rank: 4 }, { nth: 2, set: 'magic', rank: 4 },
    { nth: 3, set: 'magic', rank: 3 }, { nth: 4, set: 'magic', rank: 2 },
    { nth: 1, set: 'survival', rank: 2 }, { nth: 2, set: 'survival', rank: 2 },
    { nth: 3, set: 'survival', rank: 2 }, { nth: 4, set: 'survival', rank: 2 },
  ],
  necromancer: [
    { skill: 'thanatology', rank: 3, hard: true },
    { nth: 1, set: 'survival', rank: 4 }, { nth: 2, set: 'survival', rank: 4 },
    { nth: 3, set: 'survival', rank: 3 }, { nth: 4, set: 'survival', rank: 3 },
    { nth: 5, set: 'survival', rank: 3 }, { nth: 6, set: 'survival', rank: 3 }, { nth: 7, set: 'survival', rank: 2 },
    { skill: 'targeted_magic', rank: 2 },
    { nth: 1, set: 'magic', rank: 3 }, { nth: 2, set: 'magic', rank: 3 },
    { nth: 3, set: 'magic', rank: 2 }, { nth: 4, set: 'magic', rank: 2 },
    { nth: 1, set: 'lore', rank: 2 }, { nth: 2, set: 'lore', rank: 2 },
    { skill: 'small_edged', rank: 1, hard: true },
    { nth: 1, set: 'armor', rank: 1 },
  ],
  paladin: [
    { skill: 'conviction', rank: 3, hard: true },
    { skill: 'defending', rank: 3, hard: true },
    { skill: 'shield_usage', rank: 2 },
    { nth: 1, set: 'armor', rank: 4 }, { nth: 2, set: 'armor', rank: 2 },
    { skill: 'parry', rank: 3, hard: true },
    { nth: 1, set: 'weapon', rank: 3 },
    { skill: 'tactics', rank: 1 },
    { skill: 'scholarship', rank: 1 },
    { nth: 1, set: 'lore', rank: 2 }, { nth: 2, set: 'lore', rank: 1 }, { nth: 3, set: 'lore', rank: 1 },
    { nth: 1, set: 'magic', rank: 1 }, { nth: 2, set: 'magic', rank: 1 }, { nth: 3, set: 'magic', rank: 1 },
    { skill: 'evasion', rank: 2, hard: true },
    { nth: 1, set: 'survival', rank: 1 }, { nth: 2, set: 'survival', rank: 1 },
    { nth: 3, set: 'survival', rank: 1 }, { nth: 4, set: 'survival', rank: 1 },
  ],
  ranger: [
    { nth: 1, set: 'survival', rank: 4 }, { nth: 2, set: 'survival', rank: 4 },
    { nth: 3, set: 'survival', rank: 3 }, { nth: 4, set: 'survival', rank: 3 },
    { nth: 5, set: 'survival', rank: 3 }, { nth: 6, set: 'survival', rank: 2 },
    { nth: 7, set: 'survival', rank: 2 }, { nth: 8, set: 'survival', rank: 2 },
    { nth: 1, set: 'weapon', rank: 3 }, { nth: 2, set: 'weapon', rank: 1 },
    { skill: 'parry', rank: 2, hard: true },
    { nth: 1, set: 'armor', rank: 2 },
    { skill: 'defending', rank: 1, hard: true },
    { nth: 1, set: 'magic', rank: 1 }, { nth: 2, set: 'magic', rank: 1 }, { nth: 3, set: 'magic', rank: 1 },
    { nth: 1, set: 'lore', rank: 1 },
  ],
  thief: [
    { skill: 'thievery', rank: 2 },
    { skill: 'stealth', rank: 2 },
    { nth: 1, set: 'survival', rank: 4 }, { nth: 2, set: 'survival', rank: 4 },
    { nth: 3, set: 'survival', rank: 3 }, { nth: 4, set: 'survival', rank: 3 },
    { nth: 5, set: 'survival', rank: 3 }, { nth: 6, set: 'survival', rank: 2 },
    { nth: 7, set: 'survival', rank: 2 }, { nth: 8, set: 'survival', rank: 1 },
    { nth: 1, set: 'weapon', rank: 3 }, { nth: 2, set: 'weapon', rank: 1 },
    { skill: 'parry', rank: 1, hard: true },
    { nth: 1, set: 'armor', rank: 2 },
    { nth: 1, set: 'lore', rank: 1 }, { nth: 2, set: 'lore', rank: 1 }, { nth: 3, set: 'lore', rank: 1 },
  ],
  trader: [
    { nth: 1, set: 'armor', rank: 2 }, { nth: 2, set: 'armor', rank: 1 },
    { nth: 1, set: 'weapon', rank: 1 },
    { skill: 'trading', rank: 4, hard: true },
    { skill: 'appraisal', rank: 3, hard: true },
    { nth: 1, set: 'lore', rank: 3 }, { nth: 2, set: 'lore', rank: 2 }, { nth: 3, set: 'lore', rank: 2 },
    { nth: 1, set: 'survival', rank: 3 }, { nth: 2, set: 'survival', rank: 2 },
    { nth: 3, set: 'survival', rank: 2 }, { nth: 4, set: 'survival', rank: 1 },
    { nth: 5, set: 'survival', rank: 1 }, { nth: 6, set: 'survival', rank: 1 },
  ],
  warmage: [
    { skill: 'summoning', rank: 3, hard: true },
    { skill: 'targeted_magic', rank: 4 },
    { nth: 1, set: 'magic', rank: 4 }, { nth: 2, set: 'magic', rank: 4 }, { nth: 3, set: 'magic', rank: 3 },
    { skill: 'parry', rank: 2, hard: true },
    { nth: 1, set: 'weapon', rank: 3 },
    { skill: 'scholarship', rank: 1 },
    { nth: 1, set: 'lore', rank: 2 }, { nth: 2, set: 'lore', rank: 2 }, { nth: 3, set: 'lore', rank: 1 },
    { skill: 'defending', rank: 1, hard: true },
    { nth: 1, set: 'armor', rank: 2 },
    { nth: 1, set: 'survival', rank: 1 }, { nth: 2, set: 'survival', rank: 1 },
    { nth: 3, set: 'survival', rank: 1 }, { nth: 4, set: 'survival', rank: 1 },
  ],
};

// Cumulative ranks required within the 1-10 band. For example, a band value
// of 4 requires 40 ranks at circle 10 (matching the source cumulative tables).
function needFor(band, circle) {
  return Math.max(1, band * circle);
}

function nthCandidates(guildId, table, set) {
  const hardSkills = new Set(
    table.filter((r) => r.skill && r.hard).map((r) => r.skill),
  );
  const additions = NTH_ADDITIONS[guildId]?.[set] || [];
  return [...(NTH_POOLS[set] || []), ...additions]
    .filter((id, idx, all) => all.indexOf(id) === idx && !hardSkills.has(id));
}

function nthLabel(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// Whether a character meets the requirements to reach `targetCircle`.
// DR model: named skills (hard/soft) plus "Nth skill" checks against each
// skillset's eligible pool. Returns {ok, missing}.
export function circleRequirements(guild, skills, targetCircle) {
  if (targetCircle <= 1) return { ok: true, missing: [] };
  const table = CIRCLE_TABLES[guild.id] || [];
  const n = Math.min(targetCircle, 10);
  const missing = [];
  for (const r of table) {
    if (!r.rank || r.rank <= 0) continue;
    const need = needFor(r.rank, n);
    if (r.skill) {
      const rank = (skills[r.skill] || {}).rank || 0;
      if (rank < need) missing.push(`${r.skill} at least rank ${need} (you have ${rank})`);
    } else {
      const ranks = nthCandidates(guild.id, table, r.set)
        .map((id) => (skills[id] || {}).rank || 0)
        .sort((a, b) => b - a);
      const have = ranks[r.nth - 1] || 0;
      if (have < need) missing.push(`${nthLabel(r.nth)} ${r.set} at least rank ${need} (your ${nthLabel(r.nth)} is ${have})`);
    }
  }
  return { ok: missing.length === 0, missing };
}

// Human-readable list of requirements for the target circle, e.g. for ask dialogs.
export function circleRequirementSummary(guild, targetCircle) {
  const table = CIRCLE_TABLES[guild.id] || [];
  const n = Math.min(targetCircle, 10);
  const out = [];
  for (const r of table) {
    if (!r.rank || r.rank <= 0) continue;
    const need = needFor(r.rank, n);
    if (r.skill) out.push(`${r.skill}${r.hard ? ' (hard)' : ''} ${need}`);
    else out.push(`${nthLabel(r.nth)} ${r.set} ${need}`);
  }
  return out.length ? out : ['No requirements below circle 2.'];
}

// The concrete skills a character still needs to raise for the target circle,
// mapped to the weakest member of each skillset pool. Used by the progression
// simulator (and available to future guild-leader dialogue).
export function circleRequirementNeeds(guild, skills, targetCircle) {
  if (targetCircle <= 1) return [];
  const table = CIRCLE_TABLES[guild.id] || [];
  const n = Math.min(targetCircle, 10);
  const out = [];
  for (const r of table) {
    if (!r.rank || r.rank <= 0) continue;
    const need = needFor(r.rank, n);
    if (r.skill) {
      const rank = (skills[r.skill] || {}).rank || 0;
      if (rank < need) out.push({ skill: r.skill, need });
    } else {
      const candidates = nthCandidates(guild.id, table, r.set);
      const ranked = candidates
        .map((id) => ({ id, rank: (skills[id] || {}).rank || 0 }))
        .sort((a, b) => b.rank - a.rank);
      const weak = ranked[r.nth - 1];
      if (weak && weak.rank < need) {
        out.push({ skill: weak.id, need, set: r.set, nth: r.nth, candidates });
      }
    }
  }
  return out;
}

// Spell difficulty tiers (DR): a spell's circle gate maps to how many ranks
// of its skill you must command before it obeys. Intro spells come freely;
// the high circles demand real mastery. Gates stay at or below the highest
// rank a character can train when the earliest spell in that tier unlocks.
// Spell difficulty tiers with DR's rank thresholds. These are soft mastery
// reference points — circle/knowledge unlocks a spell; ranks drive its power
// (DR never blocks casting on ranks).
export const SPELL_TIER_RANKS = { intro: 0, basic: 10, intermediate: 80, advanced: 250, esoteric: 400 };

export function spellTierFor(minCircle) {
  if (minCircle >= 10) return 'esoteric';
  if (minCircle >= 7) return 'advanced';
  if (minCircle >= 5) return 'intermediate';
  if (minCircle >= 2) return 'basic';
  return 'intro';
}

// ---- Spell-slot economy (compressed parity) ----
// Each known spell holds slots by tier; the budget grows with circle and the
// guild's magic tier (primary attunes fastest, tertiary slowest). A free
// magical feat at circle 2 grants +2 slots. Holding limits are soft: release
// is free, so sequencing choices dissolve by circle 10.
export const SPELL_SLOT_COSTS = { intro: 2, basic: 6, intermediate: 10, advanced: 14, esoteric: 18 };

export function guildMagicTier(guild) {
  // Primary magic guilds (Cleric, Moon Mage, Warrior Mage) ×1.0; secondary
  // (Bard, Empath, Necromancer) ×0.85; tertiary (Paladin, Ranger, Trader) ×0.72.
  const primary = new Set(['cleric', 'moonmage', 'warmage']);
  const secondary = new Set(['bard', 'empath', 'necromancer']);
  if (primary.has(guild.id)) return 'primary';
  if (secondary.has(guild.id)) return 'secondary';
  return 'tertiary';
}

export function guildSlotRate(guild) {
  return { primary: 1, secondary: 0.85, tertiary: 0.72 }[guildMagicTier(guild)] || 0.72;
}

export function spellSlotsTotal(guild, circle) {
  if (!guild || !guild.magic) return 0;
  const feat = circle >= 2 ? 2 : 0; // free magical feat at circle 2
  return Math.round((2 + 6 * circle) * guildSlotRate(guild)) + feat;
}

export function spellSlotCost(spell) {
  return SPELL_SLOT_COSTS[spellTierFor(spell.minCircle)] || 6;
}

export function spellSlotsUsed(guild, circle, forgottenIds) {
  const forgotten = new Set(forgottenIds || []);
  let used = 0;
  for (const s of guild.spells || []) {
    if (s.minCircle <= circle && !forgotten.has(s.id)) used += spellSlotCost(s);
  }
  return used;
}
