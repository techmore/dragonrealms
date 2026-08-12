// Creature catalog for hunting grounds (clean-room).

export const CREATURES = {
  rat: {
    id: 'rat', name: 'a sewer rat', plural: 'sewer rats', circle: 1,
    desc: 'A mangy, red-eyed rat the size of a cat. It hisses and shows its teeth.',
    teaches: [0, 6],
    stats: { str: 5, con: 6, ref: 10, agi: 12 },
    weapon: { skill: 'brawling', dmg: [1, 4], speed: 3 },
    armor: 2, defense: 5,
    loot: ['rat_pelt'], lootTags: ['skins'], exp: 30, aggressive: false,
  },
  kobold: {
    id: 'kobold', name: 'a kobold', plural: 'kobolds', circle: 2,
    desc: 'A wiry, scaly creature clutching a rusty blade and muttering in a chittering tongue.',
    teaches: [1, 9],
    stats: { str: 9, con: 8, ref: 10, agi: 9 },
    weapon: { skill: 'small_edged', dmg: [4, 9], speed: 4 },
    armor: 8, defense: 10,
    loot: ['kobold_skin', 'strongbox'], lootTags: ['skins', 'box'], exp: 80, aggressive: false,
  },
  // Deep sewers (circle 3-5): the lower drains.
  great_rat: {
    id: 'great_rat', name: 'a great rat', plural: 'great rats', circle: 3,
    desc: 'A rat grown to the size of a hound, its fur crusted with filth and its eyes burning with hunger.',
    teaches: [4, 13],
    stats: { str: 10, con: 10, ref: 12, agi: 13 },
    weapon: { skill: 'brawling', dmg: [5, 10], speed: 3 },
    armor: 6, defense: 13,
    loot: ['rat_pelt', 'strongbox'], lootTags: ['skins', 'box'], gems: ['garnet'], exp: 170, aggressive: true,
  },
  sewer_viper: {
    id: 'sewer_viper', name: 'a sewer viper', plural: 'sewer vipers', circle: 4,
    desc: 'A mottled viper as thick as a man\'s arm, gliding through the blackwater with a soft hiss.',
    teaches: [8, 19],
    stats: { str: 9, con: 9, ref: 16, agi: 17 },
    weapon: { skill: 'brawling', dmg: [7, 13], speed: 3 },
    armor: 4, defense: 21,
    loot: ['viper_fang'], lootTags: ['skins', 'gems'], gems: ['sapphire'], exp: 270, aggressive: true,
  },
  goblin: {
    id: 'goblin', name: 'a goblin', plural: 'goblins', circle: 3,
    desc: 'A squat, green-skinned goblin with yellow eyes, hefting a crude club.',
    teaches: [3, 12],
    stats: { str: 12, con: 10, ref: 10, agi: 8 },
    weapon: { skill: 'blunt', dmg: [6, 12], speed: 5 },
    armor: 12, defense: 12,
    loot: ['goblin_skin'], lootTags: ['skins'], exp: 140, aggressive: true,
  },
  wolf: {
    id: 'wolf', name: 'a grey wolf', plural: 'grey wolves', circle: 4,
    desc: 'A lean grey wolf, nostrils flared, stalking you with patient hunger.',
    teaches: [5, 15],
    stats: { str: 14, con: 12, ref: 14, agi: 14 },
    weapon: { skill: 'brawling', dmg: [8, 16], speed: 4 },
    armor: 10, defense: 18,
    loot: ['wolf_pelt'], lootTags: ['skins'], exp: 220, aggressive: true,
  },
  wisp: {
    id: 'wisp', name: 'a marsh wisp', plural: 'marsh wisps', circle: 5,
    desc: 'A floating orb of pale blue light that shivers and hums, trailing cold sparks.',
    teaches: [8, 20],
    stats: { str: 6, con: 10, ref: 16, agi: 16 },
    weapon: { skill: 'offensive_magic', dmg: [10, 18], speed: 6 },
    armor: 15, defense: 22,
    loot: ['wisp_mote'], lootTags: ['gems'], gems: ['garnet', 'sapphire'], exp: 340, aggressive: true,
  },
  troll: {
    id: 'troll', name: 'a forest troll', plural: 'forest trolls', circle: 6,
    desc: 'A hulking, mossy troll whose regeneration knit wounds even as you watch. It stinks of rot and rage.',
    teaches: [10, 24],
    stats: { str: 20, con: 18, ref: 10, agi: 8 },
    weapon: { skill: 'blunt', dmg: [14, 26], speed: 7 },
    armor: 30, defense: 20, regen: 4,
    loot: ['troll_hide', 'iron_ore'], lootTags: ['skins', 'gems'], gems: ['garnet'], exp: 520, aggressive: true,
  },
  bandit: {
    id: 'bandit', name: 'a bandit', plural: 'bandits', circle: 5,
    desc: 'A lean cutthroat with a rag-wrapped blade and cold, watchful eyes.',
    teaches: [8, 20],
    stats: { str: 14, con: 12, ref: 13, agi: 13 },
    weapon: { skill: 'medium_edged', dmg: [9, 18], speed: 5 },
    armor: 22, defense: 18,
    loot: ['iron_ring', 'strongbox'], lootTags: ['coin', 'box', 'gems'], gems: ['garnet', 'sapphire'], exp: 380, aggressive: true,
  },
  bandit_captain: {
    id: 'bandit_captain', name: 'a bandit captain', plural: 'bandit captains', circle: 7,
    desc: 'A scarred brute in a rusted hauberk, shouting orders and swinging a great cleaver.',
    teaches: [14, 28],
    stats: { str: 18, con: 16, ref: 12, agi: 10 },
    weapon: { skill: 'twohanded_edged', dmg: [16, 30], speed: 7 },
    armor: 34, defense: 22,
    loot: ['iron_ring', 'silver_ring', 'iron_ore'], lootTags: ['gems', 'coin'], gems: ['sapphire', 'emerald'], exp: 700, aggressive: true,
  },

  // ---- Cinder Cavern (circle 5-7) ----
  cinder_lizard: {
    id: 'cinder_lizard', name: 'a cinder lizard', plural: 'cinder lizards', circle: 5,
    desc: 'A four-foot lizard whose hide smolders, shedding embers as it skitters across the rock.',
    teaches: [10, 22],
    stats: { str: 12, con: 12, ref: 14, agi: 15 },
    weapon: { skill: 'brawling', dmg: [10, 18], speed: 5 },
    armor: 24, defense: 20,
    loot: ['cinder_scale'], lootTags: ['skins'], exp: 360, aggressive: true,
  },
  fire_drake: {
    id: 'fire_drake', name: 'a fire drake', plural: 'fire drakes', circle: 6,
    desc: 'A serpentine drake wreathed in slow-burning flame, its eyes like furnace doors.',
    teaches: [12, 26],
    stats: { str: 16, con: 14, ref: 12, agi: 10 },
    weapon: { skill: 'brawling', dmg: [14, 26], speed: 6 },
    armor: 30, defense: 22,
    loot: ['cinder_scale'], lootTags: ['skins', 'gems'], gems: ['sapphire', 'emerald'], exp: 480, aggressive: true,
  },

  // ---- Blackwood Ruins (circle 7-10) ----
  wraith: {
    id: 'wraith', name: 'a blackwood wraith', plural: 'blackwood wraiths', circle: 7,
    desc: 'A tattered figure of black mist that whispers in a language older than the town.',
    teaches: [14, 28],
    stats: { str: 14, con: 12, ref: 16, agi: 16 },
    weapon: { skill: 'offensive_magic', dmg: [16, 30], speed: 6 },
    armor: 20, defense: 26,
    loot: ['wraith_essence'], lootTags: ['gems'], gems: ['sapphire', 'emerald'], exp: 620, aggressive: true,
  },
  revenant: {
    id: 'revenant', name: 'a clanking revenant', plural: 'clanking revenants', circle: 8,
    desc: 'A dead knight in rusted plate, moving with the jerky certainty of a marionette.',
    teaches: [16, 32],
    stats: { str: 18, con: 16, ref: 13, agi: 10 },
    weapon: { skill: 'large_edged', dmg: [18, 34], speed: 6 },
    armor: 42, defense: 28,
    loot: ['wraith_essence', 'silver_ring', 'iron_ore'], lootTags: ['gems', 'coin'], gems: ['emerald', 'diamond'], exp: 800, aggressive: true,
  },
  dread_knight: {
    id: 'dread_knight', name: 'a dread knight', plural: 'dread knights', circle: 10,
    desc: 'A towering figure in black plate whose helm burns with balefire. It bows — and draws a sword of shadow.',
    teaches: [20, 40],
    stats: { str: 24, con: 20, ref: 14, agi: 12 },
    weapon: { skill: 'twohanded_edged', dmg: [24, 44], speed: 7 },
    armor: 52, defense: 32,
    loot: ['dread_sigil', 'iron_ore'], lootTags: ['gems', 'coin'], gems: ['diamond'], exp: 1200, aggressive: true,
  },
};

// Rare named creatures: a chance to replace a zone spawn with a named variant
// that carries unique loot.
export const RARES = {
  deepwoods: {
    id: 'shadowpaw', name: 'Shadowpaw the Dire Wolf', plural: 'dire wolves', circle: 8,
    desc: 'A dire wolf the size of a pony, its pelt silver-black. One eye gleams with terrible intelligence.',
    teaches: [16, 34],
    stats: { str: 22, con: 18, ref: 18, agi: 18 },
    weapon: { skill: 'brawling', dmg: [20, 34], speed: 4 },
    armor: 30, defense: 30,
    loot: ['fang_of_shadowpaw'], lootTags: ['gems', 'named'], gems: ['emerald'], exp: 1500, aggressive: true,
  },
  camp: {
    id: 'bandit_chieftain', name: 'the Bandit Chieftain', plural: 'bandit chieftains', circle: 9,
    desc: 'A wall of scarred muscle wearing a crown of nailed hide. His cleaver is wet and ready.',
    teaches: [18, 36],
    stats: { str: 26, con: 20, ref: 14, agi: 12 },
    weapon: { skill: 'twohanded_edged', dmg: [24, 40], speed: 7 },
    armor: 44, defense: 28,
    loot: ['chieftains_cleaver'], lootTags: ['gems', 'named'], gems: ['emerald', 'diamond'], exp: 1800, aggressive: true,
  },
  cinder: {
    id: 'cinder_drake_king', name: 'the Cinder Drake King', plural: 'cinder drake kings', circle: 10,
    desc: 'A great drake crowned in molten stone, breathing columns of white heat.',
    teaches: [20, 40],
    stats: { str: 28, con: 22, ref: 16, agi: 12 },
    weapon: { skill: 'brawling', dmg: [26, 46], speed: 6 },
    armor: 50, defense: 32,
    loot: ['drakeheart_amulet'], lootTags: ['gems', 'named'], gems: ['diamond'], exp: 2200, aggressive: true,
  },
};

export function creatureById(id) {
  return CREATURES[id] || null;
}
