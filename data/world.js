// World rooms and spawns (clean-room).
// Rooms form the playable map. `npc` lists npc ids present, `spawns` lists
// creature ids that may be found here (with a per-room chance).

export const ZONES = {
  town: { name: 'Crossing', desc: 'The bustling heart of the Crossing.' },
  sewers: { name: 'Old Sewers', desc: 'Dank tunnels beneath the town.' },
  woods: { name: 'Old Woods', desc: 'Thick, shadowy forest.' },
  marsh: { name: 'Whispering Marsh', desc: 'Soggy lowlands wreathed in mist.' },
  deepwoods: { name: 'Deep Wilds', desc: 'Dark woods where big things prowl.' },
  camp: { name: 'Bandit Camp', desc: 'A lawless camp of cutthroats.' },
  cinder: { name: 'Cinder Cavern', desc: 'A smoke-choked cavern of hot stone.' },
  blackwood: { name: 'Blackwood Ruins', desc: 'A dead keep where the dark gathers.' },
};

export const ROOMS = {
  // ================= TOWN =================
  square: {
    id: 'square', zone: 'town', name: 'Town Square', npcs: ['towncrier'],
    desc: 'The broad flagstones of the Crossing town square bustle with merchants, guards, and travelers. A weathered fountain burbles at the center. Streets lead off in every direction.',
    exits: { n: 'market_way', s: 'temple_row', e: 'guild_district', w: 'west_road' },
  },
  east_road: {
    id: 'east_road', zone: 'town', name: 'East Road',
    desc: 'A wide road heading east past the market. The cold mist of the marsh hangs low over the fields ahead.',
    exits: { w: 'market_end', e: 'east_gate' },
  },
  market_way: {
    id: 'market_way', zone: 'town', name: 'Market Way', npcs: ['shopkeeper', 'weaponsmith', 'armorer'],
    desc: 'A crowded market lane lined with stalls. Canvas awnings flap overhead while vendors hawk their wares. The scent of herbs and hot glass drifts from the east.',
    exits: { s: 'square', n: 'market_end', e: 'brewery' },
  },
  brewery: {
    id: 'brewery', zone: 'town', name: 'The Tilted Retort', npcs: ['alchemist'],
    desc: 'A warm little workshop thick with steam and the smell of crushed roots. Mortars, alembics, and jars of floating light crowd every shelf.',
    exits: { w: 'market_way' },
  },
  market_end: {
    id: 'market_end', zone: 'town', name: 'Market Way North', npcs: ['banker', 'quartermaster'],
    desc: 'The market lane ends at the low, iron-doored facade of the bank. Guards clatter by with wagons of bound steel — the quartermaster\'s stock. A road continues east toward the gate.',
    exits: { s: 'market_way', e: 'east_road' },
  },
  temple_row: {
    id: 'temple_row', zone: 'town', name: 'Temple Row', npcs: ['healer'],
    desc: 'A quiet street of shrines and prayer houses. The soft murmur of chanting drifts from open doors. The healer\'s sanctuary is here, and an iron grate in the cobbles leads down into the old sewers.',
    exits: { n: 'square', s: 'temple', d: 'sewers_1' },
  },
  temple: {
    id: 'temple', zone: 'town', name: 'Temple of the Pantheon', npcs: ['healer'],
    desc: 'A vaulted hall lit by candles and shafts of stained light. Priests tend the wounded on low cots.',
    exits: { n: 'temple_row' },
  },
  guild_district: {
    id: 'guild_district', zone: 'town', name: 'Guild District', npcs: ['towncrier'],
    desc: 'An avenue of grand guildhalls, each flying a banner of its order. Stone faces watch the street. North and south run long rows of guild halls.',
    exits: { w: 'square', n: 'guild_halls_n', s: 'guild_halls_s' },
  },
  guild_halls_n: {
    id: 'guild_halls_n', zone: 'town', name: 'North Guild Row',
    desc: 'The northern row of guildhalls, each door bearing the sigil of its order.',
    exits: { s: 'guild_district', n: 'hall_barbarian' },
  },
  hall_barbarian: { id: 'hall_barbarian', zone: 'town', name: 'Barbarian Guildhall', npcs: ['leader_barbarian'], desc: 'Raw timbers, rough stone, and the smell of woodsmoke. Trophies of tooth and claw hang from the walls.', exits: { s: 'guild_halls_n', n: 'hall_bard' } },
  hall_bard: { id: 'hall_bard', zone: 'town', name: 'Bard Guildhall', npcs: ['leader_bard'], desc: 'Velvet drapes muffle the warm glow of lanterns. A lone lute rests on a stand, still humming.', exits: { s: 'hall_barbarian', n: 'hall_cleric' } },
  hall_cleric: { id: 'hall_cleric', zone: 'town', name: 'Cleric Guildhall', npcs: ['leader_cleric'], desc: 'Incense smoke curls beneath painted arches. Altars line the walls, each to a different god.', exits: { s: 'hall_bard', n: 'hall_empath' } },
  hall_empath: { id: 'hall_empath', zone: 'town', name: 'Empath Guildhall', npcs: ['leader_empath'], desc: 'A sunlit garden room of soft cushions and trickling water. The air feels warm and alive.', exits: { s: 'hall_cleric', n: 'hall_moonmage' } },
  hall_moonmage: { id: 'hall_moonmage', zone: 'town', name: 'Moon Mage Guildhall', npcs: ['leader_moonmage'], desc: 'A domed observatory open to the sky. Constellations are charted across the ceiling in silver.', exits: { s: 'hall_empath', n: 'hall_necromancer' } },
  hall_necromancer: { id: 'hall_necromancer', zone: 'town', name: 'Necromancer Guildhall', npcs: ['leader_necromancer'], desc: 'A cold, quiet hall of dark marble. Candle flames burn with an odd, steady stillness.', exits: { s: 'hall_moonmage' } },
  guild_halls_s: {
    id: 'guild_halls_s', zone: 'town', name: 'South Guild Row',
    desc: 'The southern row of guildhalls, older and more weathered than the north.',
    exits: { n: 'guild_district', s: 'hall_paladin' },
  },
  hall_paladin: { id: 'hall_paladin', zone: 'town', name: 'Paladin Guildhall', npcs: ['leader_paladin'], desc: 'A barracks of gleaming plate and hanging banners. Rows of warhorses stamp in a courtyard beyond.', exits: { n: 'guild_halls_s', s: 'hall_ranger' } },
  hall_ranger: { id: 'hall_ranger', zone: 'town', name: 'Ranger Guildhall', npcs: ['leader_ranger'], desc: 'Living branches form the walls. Hounds doze by a great hearth, and the ceiling is a canopy of leaves.', exits: { n: 'hall_paladin', s: 'hall_thief' } },
  hall_thief: { id: 'hall_thief', zone: 'town', name: 'Thief Guildhall', npcs: ['leader_thief'], desc: 'An unremarkable tenement door opens onto a den of quiet shadows and muffled counting.', exits: { n: 'hall_ranger', s: 'hall_trader' } },
  hall_trader: { id: 'hall_trader', zone: 'town', name: 'Trader Guildhall', npcs: ['leader_trader'], desc: 'A ledger room of polished wood and locked chests. Scale models of ships and wagons sit on shelves.', exits: { n: 'hall_thief', s: 'hall_warmage' } },
  hall_warmage: { id: 'hall_warmage', zone: 'town', name: 'Warrior Mage Guildhall', npcs: ['leader_warmage'], desc: 'Scorch marks ring the dueling circle at the center. Elemental runes pulse along the stone columns.', exits: { n: 'hall_trader' } },
  west_road: {
    id: 'west_road', zone: 'town', name: 'West Road', npcs: ['tanner'],
    desc: 'A dusty road heading west past shops and toward the town gate. The smell of the forest begins to creep in, and a rough track splits north toward the hills.',
    exits: { e: 'square', w: 'west_gate', n: 'camp_path' },
  },
  west_gate: {
    id: 'west_gate', zone: 'town', name: 'West Gate', npcs: ['guard'],
    desc: 'The massive west gate stands open. Guards watch the road that vanishes into the Old Woods.',
    exits: { e: 'west_road', w: 'woods_path' },
  },
  east_gate: {
    id: 'east_gate', zone: 'town', name: 'East Gate', npcs: ['guard'],
    desc: 'The east gate opens onto farmlands. A cold mist rises from a low marsh beyond the fields.',
    exits: { w: 'east_road', e: 'marsh_1' },
  },

  // ================ HUNTING GROUNDS ================
  sewers_1: {
    id: 'sewers_1', zone: 'sewers', name: 'Sewer Entrance', spawns: ['rat', 'rat'],
    desc: 'Cold water drips in the dark. A grate of rusted iron lets light fall in thin stripes. You can hear skittering in the tunnels ahead.',
    exits: { up: 'temple_row', n: 'sewers_2' },
  },
  sewers_2: {
    id: 'sewers_2', zone: 'sewers', name: 'Sewer Junction', spawns: ['rat', 'kobold'],
    desc: 'Tunnels meet here in a foul pool of runoff. Red eyes gleam at the edges of your light.',
    exits: { s: 'sewers_1', n: 'sewers_3', e: 'sewers_3' },
  },
  sewers_3: {
    id: 'sewers_3', zone: 'sewers', name: 'Kobold Warrens', spawns: ['kobold', 'kobold', 'rat'],
    desc: 'The smell of unwashed scales and stolen food is thick. Crude bone charms rattle overhead.',
    exits: { s: 'sewers_2' },
  },
  woods_path: {
    id: 'woods_path', zone: 'woods', name: 'Forest Trail', spawns: ['goblin'],
    desc: 'A rutted trail winds between towering pines. Shadows flicker between the trunks.',
    exits: { e: 'west_gate', n: 'woods_1', s: 'woods_2' },
  },
  woods_1: {
    id: 'woods_1', zone: 'woods', name: 'Clearing', spawns: ['goblin', 'goblin', 'wolf'],
    desc: 'A mossy clearing ringed by ancient oaks. The canopy cuts the light into dapples.',
    exits: { s: 'woods_path', n: 'deep_1' },
  },
  woods_2: {
    id: 'woods_2', zone: 'woods', name: 'Wolf Dens', spawns: ['wolf', 'wolf'],
    desc: 'The ground is scored with claw marks. A distant howl rises and falls in the wind.',
    exits: { n: 'woods_path', s: 'marsh_1' },
  },
  marsh_1: {
    id: 'marsh_1', zone: 'marsh', name: 'Marsh Edge', spawns: ['wisp'],
    desc: 'Reeds and stagnant water stretch to the horizon. Pale lights drift over the bog.',
    exits: { w: 'east_gate', n: 'woods_2', s: 'marsh_2' },
  },
  marsh_2: {
    id: 'marsh_2', zone: 'marsh', name: 'Bog Hollow', spawns: ['wisp', 'wisp'],
    desc: 'A sunken hollow where the mist pools thick as breath. The air hums with cold magic.',
    exits: { n: 'marsh_1' },
  },
  deep_1: {
    id: 'deep_1', zone: 'deepwoods', name: 'Deep Wood', spawns: ['troll'],
    desc: 'The oaks here are vast and dark, their roots older than the town. Something heavy breathes nearby.',
    exits: { s: 'woods_1', e: 'deep_2' },
  },
  deep_2: {
    id: 'deep_2', zone: 'deepwoods', name: 'Troll Mounds', spawns: ['troll', 'troll'],
    desc: 'Great mounds of earth and broken stone heave under moss. The trolls den here. A dark path leads east into ruins.',
    exits: { w: 'deep_1', e: 'black_1' },
  },

  // ================ BANDIT CAMP ================
  camp_path: {
    id: 'camp_path', zone: 'camp', name: 'Camp Trail', spawns: ['bandit'],
    desc: 'A rough track climbs into scrubby hills. Faint voices and the smell of smoke carry on the wind.',
    exits: { s: 'west_road', n: 'camp_hollow' },
  },
  camp_hollow: {
    id: 'camp_hollow', zone: 'camp', name: 'Bandit Hollow', spawns: ['bandit', 'bandit'],
    desc: 'A trampled hollow ringed by tents of patched hide. A great fire gutters in the center.',
    exits: { s: 'camp_path', e: 'camp_den' },
  },
  camp_den: {
    id: 'camp_den', zone: 'camp', name: 'Captain\'s Den', spawns: ['bandit_captain', 'bandit'],
    desc: 'A cave mouth draped in looted finery. The bandit captain rules from a crude throne of crates. Faint heat rises from a deeper shaft.',
    exits: { w: 'camp_hollow', d: 'cinder_1' },
  },

  // ================ CINDER CAVERN (circle 5-7) ================
  cinder_1: {
    id: 'cinder_1', zone: 'cinder', name: 'Cavern Mouth', spawns: ['cinder_lizard'],
    desc: 'A smoke-hazed cavern where the air shimmers with heat. Glowing cracks vein the rock like molten rivers.',
    exits: { up: 'camp_den', n: 'cinder_2' },
  },
  cinder_2: {
    id: 'cinder_2', zone: 'cinder', name: 'Cinder Gorge', spawns: ['cinder_lizard', 'fire_drake'],
    desc: 'A great gorge of black basalt crossed by a natural bridge of fused stone. Drakes wheel overhead through the ash.',
    exits: { s: 'cinder_1' },
  },

  // ================ BLACKWOOD RUINS (circle 7-10) ================
  black_1: {
    id: 'black_1', zone: 'blackwood', name: 'Blackwood Ruins', spawns: ['wraith', 'revenant'],
    desc: 'A half-collapsed keep where black trees grow through the stone. Candle-flames float in the ruins, each one a watcher.',
    exits: { w: 'deep_2', d: 'black_2' },
  },
  black_2: {
    id: 'black_2', zone: 'blackwood', name: 'Crypt of the Dread Knight', spawns: ['dread_knight', 'revenant'],
    desc: 'A cold crypt ringed by standing stones. At the center waits the Dread Knight, its sword of shadow resting point-down.',
    exits: { up: 'black_1' },
  },
};

export function roomById(id) {
  return ROOMS[id] || null;
}
