// World rooms and spawns (clean-room; grounded in Elanthipedia references).
// Rooms form the playable map. `npc` lists npc ids present, `spawns` lists
// creature ids that may be found here (with a per-room chance).
//
// The town of Crossing is laid out authentically around the Town Green hub,
// with roads fanning to the gates (West, East, Northeast, North), the
// Mongers' Bazaar and bank to the east, the Guild District, the riverside
// Strand along the Segoltha, and residential courts (Tatting Street, Crofton
// Walk, Elmod Close) beyond the walls.

export const ZONES = {
  town: { name: 'Crossing', desc: 'The bustling heart of the Crossing.' },
  sewers: { name: 'Crossing Sewers', desc: 'Dank tunnels beneath the town.' },
  woods: { name: 'Siergelde Ruins Road', desc: 'Thick, shadowy forest.' },
  marsh: { name: 'Whispering Marsh', desc: 'Soggy lowlands wreathed in mist.' },
  deepwoods: { name: 'Deep Wilds', desc: 'Dark woods where big things prowl.' },
  camp: { name: 'Bandit Camp', desc: 'A lawless camp of cutthroats.' },
  cinder: { name: 'Cinder Cavern', desc: 'A smoke-choked cavern of hot stone.' },
  blackwood: { name: 'Blackwood Ruins', desc: 'A dead keep where the dark gathers.' },
  riverhaven: { name: 'Riverhaven', desc: 'A river town of piers and red roofs.' },
};

export const ROOMS = {
  // ================= TOWN: THE TOWN GREEN =================
  // The green is the heart of the city. Compass spokes reach every district.
  square: {
    id: 'square', zone: 'town', name: 'Town Green', npcs: ['towncrier'],
    desc: 'A broad grassy green at the center of the Crossing, ringed by flagstone walks and old shade trees. Townsfolk gather here around a weathered fountain, and a tiny pond glints to the north. Streets and lane-mouths fan out in every direction, and a caretaker keeps the green tidy.',
    exits: { n: 'tg_n', ne: 'tg_ne', e: 'tg_e', se: 'tg_se', s: 'tg_s', sw: 'tg_sw', w: 'tg_w', nw: 'tg_nw', d: 'tg_pond' },
  },
  tg_pond: {
    id: 'tg_pond', zone: 'town', name: 'Town Green Pond',
    desc: 'You stand on the bank of a tiny pond in the middle of the green. Cool water laps against soft, velvety silt, and in the distance you can hear the bustle of the town. A massive domesticated gelapod lounges in the pond, content and not the least bit aggressive.',
    exits: { up: 'square' },
  },

  // ---------- West district (West Road toward the gate) ----------
  tg_w: {
    id: 'tg_w', zone: 'town', name: 'Town Green West',
    desc: 'The western walk of the green gives onto the West Road, which runs out to the West Gate, and to the Guild District, whose banners rise over the avenue to the west.',
    exits: { e: 'square', w: 'guild_district', n: 'tg_nw', s: 'tg_sw' },
  },

  // ---------- North district (toward the North Gate) ----------
  tg_n: {
    id: 'tg_n', zone: 'town', name: 'Town Green North',
    desc: 'The northern edge of the green gives way to a broad avenue of shops and inns. Lanterns sway over the heads of the crowd, and the great North Gate looms in the distance.',
    exits: { s: 'square', n: 'north_road', e: 'tg_ne', w: 'tg_nw' },
  },
  carousel_way: {
    id: 'carousel_way', zone: 'town', name: 'North Avenue',
    desc: 'A wide, well-kept avenue running north. A brightly painted carousel turns to the north, its music drifting on the air, and the town hall stands beyond to the east.',
    exits: { sw: 'north_road', e: 'carousel' },
  },
  carousel: {
    id: 'carousel', zone: 'town', name: 'The Carousel',
    desc: 'A gaily painted carousel turns in the middle of the avenue, carrying painted wooden beasts for a few coppers a ride. Children shriek with delight. To the east the road climbs toward the Town Hall.',
    exits: { w: 'carousel_way', e: 'hall_street' },
  },
  hall_street: {
    id: 'hall_street', zone: 'town', name: 'Hall Street',
    desc: 'A short street climbing gently east. The sturdy facade of the Town Hall rises ahead, its clock ticking solemnly over the lintel.',
    exits: { w: 'carousel', e: 'town_hall' },
  },
  town_hall: {
    id: 'town_hall', zone: 'town', name: 'Town Hall',
    desc: 'The seat of the Crossing\'s civic offices — citizenship, registration, genealogy and the lottery. Clerks hurry past with ledgers, and a long noticeboard lists the day\'s business.',
    exits: { w: 'hall_street' },
  },
  north_road: {
    id: 'north_road', zone: 'town', name: 'North Road',
    desc: 'A broad road leading to the North Gate. Fine manors line the way, and carts roll steadily toward the wall.',
    exits: { s: 'tg_n', n: 'north_gate', ne: 'carousel_way' },
  },
  north_gate: {
    id: 'north_gate', zone: 'town', name: 'North Gate', npcs: ['guard'],
    desc: 'The North Gate stands sentinel at the top of the North Road. Jadewater Mansion lies two rooms east of the gate, and the wilds roll away beyond the wall.',
    exits: { s: 'north_road', ne: 'jadewater_way' },
  },
  jadewater_way: {
    id: 'jadewater_way', zone: 'town', name: 'Jadewater Way',
    desc: 'Two rooms east of the North Gate stands a grand manor set back from the road, its wrought-iron gates standing open.',
    exits: { sw: 'north_gate', e: 'jadewater' },
  },
  jadewater: {
    id: 'jadewater', zone: 'town', name: 'Jadewater Mansion',
    desc: 'A stately manor, the headquarters of the Lorethew Mentor Society. New arrivals find their bearings here, and a snug inn — the Tenderfoot — sits within its grounds, where fresh adventurers sleep three to a bunk.',
    exits: { w: 'jadewater_way', e: 'tenderfoot' },
  },
  tenderfoot: {
    id: 'tenderfoot', zone: 'town', name: 'The Tenderfoot Inn', tavern: true,
    desc: 'A board-and-timber inn on the Jadewater grounds where new arrivals sleep three to a bunk. The common room smells of woodsmoke and hot stew, and the pallets are dry — a good place to get your wind back.',
    exits: { w: 'jadewater' },
  },

  // ---------- Northeast district (NE Gate, Herald St, craft societies) ----------
  tg_ne: {
    id: 'tg_ne', zone: 'town', name: 'Town Green Northeast',
    desc: 'The northeast corner of the green, where footpaths converge toward the mistshrouded fields beyond the Northeast Gate. Eveners and merchants share the way.',
    exits: { sw: 'square', w: 'tg_n', s: 'tg_e', e: 'ne_road' },
  },
  ne_road: {
    id: 'ne_road', zone: 'town', name: 'Northeast Road',
    desc: 'A busy road climbing toward the Northeast Gate. Guild masters and peddlers crowd the margins, and the air smells of resin and hot steel.',
    exits: { w: 'tg_ne', ne: 'ne_gate', n: 'herald_st' },
  },
  ne_gate: {
    id: 'ne_gate', zone: 'town', name: 'Northeast Gate', npcs: ['guard'],
    desc: 'The great Northeast Gate, where invasions are thrown back and hunting parties sally forth. The Paladins keep a trail just inside the wall, and the Warrior Mage guild lies beyond the gate.',
    exits: { sw: 'ne_road' },
  },
  herald_st: {
    id: 'herald_st', zone: 'town', name: 'Herald Street',
    desc: 'A trim street running south from the Northeast Road, lined with the doorways of the city\'s craft societies.',
    exits: { s: 'ne_road', w: 'enchanting_soc' },
  },
  enchanting_soc: {
    id: 'enchanting_soc', zone: 'town', name: 'Enchanting Society',
    desc: 'Four rooms west of the Northeast Gate stands the Enchanting Society. Racks of tools and bundled reagents crowd the entry, and the air shimmers faintly with latent magic.',
    exits: { e: 'herald_st' },
  },

  // ---------- East district (Mongers' Bazaar, bank, Market Plaza) ----------
  tg_e: {
    id: 'tg_e', zone: 'town', name: 'Town Green East',
    desc: 'The eastern walk of the green spills onto a broad market that stretches away to the bank and the gates.',
    exits: { w: 'square', e: 'bazaar', n: 'tg_ne', s: 'tg_se' },
  },
  bazaar: {
    id: 'bazaar', zone: 'town', name: 'Mongers\' Bazaar', npcs: ['mags', 'shopkeeper', 'weaponsmith', 'armorer'],
    desc: 'The Mongers\' Bazaar is a crowded warren of canvas stalls and awnings. Vendors hawk herbs, hot glass, blades and leathers, and the firewood peddler Mags sits at a bin of sticks near the heart of it. A shuttered pit hall stands to the west.',
    exits: { w: 'tg_e', e: 'market_way', s: 'market_plaza' },
  },
  market_plaza: {
    id: 'market_plaza', zone: 'town', name: 'Market Plaza',
    desc: 'A broad plaza of stepped terraces reached by a ramp rising to the southeast of the bazaar, just over from the bank. Player-owned shops fill its halls and galleries, with guards at the doors keeping the peace.',
    exits: { n: 'bazaar', w: 'tg_se' },
  },
  market_way: {
    id: 'market_way', zone: 'town', name: 'Market Way', npcs: ['towncrier'],
    desc: 'The market lanes funnel east through the wall. Canvas awnings flap overhead while crowds of buyers and porters surge past, toward the bank and the eastern gate.',
    exits: { w: 'bazaar', e: 'bank_plaza', n: 'brewery', s: 'forge_row' },
  },
  brewery: {
    id: 'brewery', zone: 'town', name: 'The Tilted Retort', npcs: ['alchemist'],
    desc: 'A warm little workshop thick with steam and the smell of crushed roots. Mortars, alembics, and jars of floating light crowd every shelf. A hammer rings from the workshop beyond.',
    exits: { s: 'market_way', e: 'forge' },
  },
  forge: {
    id: 'forge', zone: 'town', name: 'The Ember Forge', npcs: ['forge_master'],
    desc: 'The air shimmers over a great anvil. Bellow-fires roar in a hearth of black stone, and racks of finished steel line the walls. Ore waits in bins, patient for the hammer.',
    exits: { w: 'brewery' },
  },
  forge_row: {
    id: 'forge_row', zone: 'town', name: 'Smiths Row',
    desc: 'A short lane of smithies and workshops running south of Market Way toward the river.',
    exits: { n: 'market_way', s: 'auction_house' },
  },
  auction_house: {
    id: 'auction_house', zone: 'town', name: 'The Merchants\' Auction Hall',
    desc: 'A panelled hall where the Crossing does its real trading. Lots are chalked on a great board as they come in — gear, salvage, and stranger goods, each with an asking price. The hall takes no cut on the first sales.',
    exits: { n: 'forge_row', se: 'commodity_pit' },
  },
  commodity_pit: {
    id: 'commodity_pit', zone: 'town', name: 'The Grain Pit', npcs: ['pit_master'],
    desc: 'A long hall of ledger counters and grain chutes. Slaves to the market scrawl prices on a great board as they change. Merchants whisper, gamble, and watch the board.',
    exits: { nw: 'auction_house' },
  },
  bank_plaza: {
    id: 'bank_plaza', zone: 'town', name: 'Court of the Bank', npcs: ['banker', 'quartermaster'],
    desc: 'A cobbled court before the low, iron-doored facade of the First Provincial Bank. Guards clatter by with wagons of bound steel. A ramp on the bank\'s east side climbs to the Market Plaza, and the road continues east toward the East Gate.',
    exits: { w: 'market_way', e: 'east_road', s: 'order_hq' },
  },
  order_hq: {
    id: 'order_hq', zone: 'town', name: 'Order Headquarters',
    desc: 'One room east of the bank stands the Order Headquarters, where the recruiting offices of the town\'s orders ply their trade among banners and mustering lists.',
    exits: { n: 'bank_plaza' },
  },

  // ---------- Southeast / south (East Road, gate, Longbow Bridge) ----------
  tg_se: {
    id: 'tg_se', zone: 'town', name: 'Town Green Southeast',
    desc: 'The southeastern walk of the green opens onto the East Road, by which travelers reach the East Gate and the marsh beyond.',
    exits: { nw: 'square', n: 'tg_e', w: 'tg_s', e: 'market_plaza' },
  },
  east_road: {
    id: 'east_road', zone: 'town', name: 'East Road',
    desc: 'A wide road heading east past the market. The cold mist of the marsh hangs low over the fields ahead, and to the south a bridge spans the river toward the Tatting Street homes.',
    exits: { w: 'bank_plaza', e: 'east_gate', s: 'longbow' },
  },
  east_gate: {
    id: 'east_gate', zone: 'town', name: 'East Gate', npcs: ['guard'],
    desc: 'The East Gate opens onto farmlands, and a cold mist rises from a low marsh beyond the fields. The Middens junkyard sprawls just inside the wall.',
    exits: { w: 'east_road', e: 'marsh_1', s: 'middens' },
  },
  longbow: {
    id: 'longbow', zone: 'town', name: 'Longbow Bridge',
    desc: 'A broad timber bridge arcing over the water. One room north of here the fine homes of Tatting Street and Riverlace Lane begin.',
    exits: { n: 'east_road', s: 'tatting_st' },
  },
  tatting_st: {
    id: 'tatting_st', zone: 'town', name: 'Tatting Street',
    desc: 'An upper-class street of stately homes running south from the Longbow Bridge before it becomes Riverlace Lane. West from room one the way returns to the bustle of the Crossing streets.',
    exits: { n: 'longbow', s: 'riverlace', w: 'crofton_walk' },
  },
  riverlace: {
    id: 'riverlace', zone: 'town', name: 'Riverlace Lane',
    desc: 'The quiet southern turn of the housing district, where fine manors stand behind hedges and fountains. The river glints beyond the rooftops.',
    exits: { n: 'tatting_st' },
  },
  crofton_walk: {
    id: 'crofton_walk', zone: 'town', name: 'Crofton Walk',
    desc: 'A middle-class residential lane of tidy cottages that curls into Smithy Lane. Garden tools wait by doors and laundry snaps on lines overhead.',
    exits: { e: 'tatting_st', sw: 'smithy_lane' },
  },
  smithy_lane: {
    id: 'smithy_lane', zone: 'town', name: 'Smithy Lane',
    desc: 'A lane of trim red-brick and stone-block homes named for the old smithy at its head.',
    exits: { ne: 'crofton_walk' },
  },

  // ---------- South (toward the marsh / barracks) ----------
  tg_s: {
    id: 'tg_s', zone: 'town', name: 'Town Green South',
    desc: 'The southern walk of the green gives onto a quieter quarter of shrines, guard offices and the town\'s dockward roads.',
    exits: { n: 'square', s: 'stockyard', w: 'tg_sw', e: 'tg_se' },
  },
  stockyard: {
    id: 'stockyard', zone: 'town', name: 'Stockyard',
    desc: 'A guarded yard of pens and muster points. The Crossing Guardhouse stands here, its cells reached down a stair from the yard.',
    exits: { n: 'tg_s', s: 'south_road', d: 'jail' },
  },
  jail: {
    id: 'jail', zone: 'town', name: 'The Town Cells', npcs: ['jailer'],
    desc: 'A low stone cell with a heavy door of iron bars. A narrow slit of daylight falls from the street above. Scratched into the wall: a list of names, and a warning.',
    exits: { up: 'stockyard' },
  },
  south_road: {
    id: 'south_road', zone: 'town', name: 'South Road',
    desc: 'A road winding south toward the wharfs and the western reaches of town.',
    exits: { n: 'stockyard', w: 'strand', e: 'market_end' },
  },

  // ---------- Southwest / west (West Road, gate, Segoltha, strands) ----------
  tg_sw: {
    id: 'tg_sw', zone: 'town', name: 'Town Green Southwest',
    desc: 'The southwestern walk of the green gives onto a lane that winds down to the riverside Strand below the bank.',
    exits: { ne: 'square', s: 'sw_road', e: 'tg_s', n: 'tg_w' },
  },
  west_road: {
    id: 'west_road', zone: 'town', name: 'West Road', npcs: ['tanner'],
    desc: 'A dusty road heading north and west from the green. A rough track splits north toward the hills, and the West Gate stands at the road\'s end. The Needle & Thread sits at its eastern turn.',
    exits: { n: 'tailor_shop', nw: 'aldoran_barn', w: 'west_gate', s: 'tg_nw' },
  },
  tailor_shop: {
    id: 'tailor_shop', zone: 'town', name: 'The Needle & Thread', npcs: ['tailor'],
    desc: 'A warm shop crowded with stretched hides and half-stitched leathers. A long workbench runs the length of the wall, needles and awls standing ready in their racks.',
    exits: { s: 'west_road', n: 'camp_path' },
  },
  west_gate: {
    id: 'west_gate', zone: 'town', name: 'West Gate', npcs: ['guard'],
    desc: 'The massive west gate stands open. Guards watch the road that vanishes toward the Siergelde Ruins, and a caravan barn stands two rooms back inside the wall.',
    exits: { e: 'west_road', w: 'woods_path' },
  },
  aldoran_barn: {
    id: 'aldoran_barn', zone: 'town', name: 'Haldofurd\'s Barn', npcs: ['stablehand'],
    desc: 'A great covered stable two rooms inside the West Gate, where caravans water their teams before the long haul to the ruins and the north.',
    exits: { se: 'west_road' },
  },
  strand: {
    id: 'strand', zone: 'town', name: 'The Strand',
    desc: 'A tree-lined river walk along the banks of the Segoltha. Boats bob at the piers and gulls wheel overhead. The Strand Communal Center stands among the trees to the south, and a bank stair climbs toward the far southwestern reaches.',
    exits: { n: 'sw_road', e: 'south_road', s: 'strand_communal' },
  },
  strand_communal: {
    id: 'strand_communal', zone: 'town', name: 'Strand Communal Center',
    desc: 'A sheltered community hall on the Strand, its doors open to the riverside breeze. Travellers rest under the veranda and watch the ferries ply the water.',
    exits: { n: 'strand', sw: 'segoltha_stair' },
  },
  sw_road: {
    id: 'sw_road', zone: 'town', name: 'Southwest Road',
    desc: 'A riverside road skirting the far southwestern corner of town, past the bank\'s water-stair to the Segoltha and the old riverfront portage.',
    exits: { n: 'tg_sw', s: 'strand' },
  },
  segoltha_stair: {
    id: 'segoltha_stair', zone: 'town', name: 'Bank Stair',
    desc: 'A stair descends from the far southwest corner of town to a landing where the bank moors boats on the Segoltha, and the Shardstar shipping office keeps the riverfront portage.',
    exits: { ne: 'strand_communal' },
  },

  // ---------- Northwest (the temple quarter) ----------
  tg_nw: {
    id: 'tg_nw', zone: 'town', name: 'Town Green Northwest',
    desc: 'The northwestern corner of the green, where a quiet, tree-lined road curves toward the temple quarter of the city.',
    exits: { se: 'square', w: 'nw_road', n: 'west_road', e: 'tg_n', s: 'tg_w' },
  },
  nw_road: {
    id: 'nw_road', zone: 'town', name: 'Northwest Road',
    desc: 'A quiet, tree-lined road climbing northwest out of the green. The walk grows hushed and grave as it nears the temples, and incense drifts on the air.',
    exits: { e: 'tg_nw', w: 'temple_row' },
  },
  temple_row: {
    id: 'temple_row', zone: 'town', name: 'Temple Row', npcs: ['healer'],
    desc: 'A quiet street of shrines and prayer houses at the foot of the temple hill. The healer\'s sanctuary is here, and an iron grate in the cobbles leads down into the old sewers. An austere training hall stands to the south.',
    exits: { nw: 'temple', w: 'fane', e: 'nw_road', d: 'sewers_1' },
  },
  fane: {
    id: 'fane', zone: 'town', name: 'Fane of Training', npcs: ['fane_keeper'],
    desc: 'A vaulted training hall hung with the banners of a hundred pilgrims. Eight alcoves ring the walls, each devoted to a single attribute. Novices squat in meditation, steeling body and mind.',
    exits: { e: 'temple_row' },
  },
  temple: {
    id: 'temple', zone: 'town', name: 'Temple of the Pantheon', npcs: ['healer'],
    desc: 'A vaulted hall lit by candles and shafts of stained light. Priests tend the wounded on low cots, and a great library shelves the scrolls of the faith. A door at the back leads into the High Temple.',
    exits: { w: 'high_temple', se: 'temple_row' },
  },
  high_temple: {
    id: 'high_temple', zone: 'town', name: 'The High Temple',
    desc: 'The great temple of the Crossing, its vaulted ceiling painted with the deeds of the gods. Altars to the Thirteen ring the sanctum, each crowned by a blazing Eye, and the air itself weighs heavy with faith.',
    exits: { n: 'immortals_approach', e: 'temple' },
  },
  immortals_approach: {
    id: 'immortals_approach', zone: 'town', name: 'Immortals\' Approach',
    desc: 'A paved approach leading from the northwest quarter to the great spherical mass of the Crossing High Temple. Priests and pilgrims pass here on their way to the gates of the sanctuary.',
    exits: { s: 'high_temple' },
  },

  // ---------- The Guild District (west of the green) ----------
  guild_district: {
    id: 'guild_district', zone: 'town', name: 'Guild District', npcs: ['towncrier'],
    desc: 'An avenue of grand guildhalls, each flying a banner of its order. Stone faces watch the street. Rows of halls run north and south, and the quiet cloister of Asemath Academy stands to the east.',
    exits: { e: 'tg_w', s: 'guild_halls_s', w: 'guild_halls_n' },
  },
  academy: {
    id: 'academy', zone: 'town', name: 'Asemath Academy',
    desc: 'A quiet cloister of the College of Asemath, its walls lined with scrolls and star charts. Scholars murmur over desks, and the air smells of old parchment and ink.',
    exits: { n: 'guild_halls_n' },
  },
  guild_halls_n: {
    id: 'guild_halls_n', zone: 'town', name: 'North Guild Row',
    desc: 'The northern row of guildhalls, each door bearing the sigil of its order.',
    exits: { e: 'guild_district', w: 'hall_barbarian', s: 'academy' },
  },
  hall_barbarian: { id: 'hall_barbarian', zone: 'town', name: 'Barbarian Guildhall', npcs: ['leader_barbarian'], desc: 'Raw timbers, rough stone, and the smell of woodsmoke. Trophies of tooth and claw hang from the walls.', exits: { e: 'guild_halls_n', w: 'hall_bard' } },
  hall_bard: { id: 'hall_bard', zone: 'town', name: 'Bard Guildhall', npcs: ['leader_bard'], desc: 'Velvet drapes muffle the warm glow of lanterns. A lone lute rests on a stand, still humming.', exits: { e: 'hall_barbarian', w: 'hall_cleric' } },
  hall_cleric: { id: 'hall_cleric', zone: 'town', name: 'Cleric Guildhall', npcs: ['leader_cleric'], desc: 'A hall of incense and candlelight, its walls painted with the stories of the gods. Soft hymns echo from a chapel beyond.', exits: { e: 'hall_bard', w: 'hall_empath' } },
  hall_empath: { id: 'hall_empath', zone: 'town', name: 'Empath Guildhall', npcs: ['leader_empath'], desc: 'A sunlit garden room of soft cushions and trickling water. The air feels warm and alive.', exits: { e: 'hall_cleric', w: 'hall_moonmage' } },
  hall_moonmage: { id: 'hall_moonmage', zone: 'town', name: 'Moon Mage Guildhall', npcs: ['leader_moonmage'], desc: 'A domed observatory open to the sky. Constellations are charted across the ceiling in silver.', exits: { e: 'hall_empath', w: 'hall_necromancer' } },
  hall_necromancer: { id: 'hall_necromancer', zone: 'town', name: 'Necromancer Guildhall', npcs: ['leader_necromancer'], desc: 'A cold, quiet hall of dark marble. Candle flames burn with an odd, steady stillness.', exits: { e: 'hall_moonmage' } },
  guild_halls_s: {
    id: 'guild_halls_s', zone: 'town', name: 'South Guild Row',
    desc: 'The southern row of guildhalls, older and more weathered than the north.',
    exits: { n: 'guild_district', s: 'hall_paladin' },
  },
  hall_paladin: { id: 'hall_paladin', zone: 'town', name: 'Paladin Guildhall', npcs: ['leader_paladin'], desc: 'A barracks of gleaming plate and hanging banners. Rows of warhorses stamp in a courtyard beyond.', exits: { n: 'guild_halls_s', s: 'hall_ranger' } },
  hall_ranger: { id: 'hall_ranger', zone: 'town', name: 'Ranger Guildhall', npcs: ['leader_ranger'], desc: 'Living branches form the walls. Hounds doze by a great hearth, and the ceiling is a canopy of leaves.', exits: { n: 'hall_paladin', s: 'hall_thief' } },
  hall_thief: { id: 'hall_thief', zone: 'town', name: 'Thief Guildhall', npcs: ['leader_thief'], desc: 'An unremarkable tenement door opens onto a den of quiet shadows and muffled counting.', exits: { n: 'hall_ranger', w: 'hall_trader' } },
  hall_trader: { id: 'hall_trader', zone: 'town', name: 'Trader Guildhall', npcs: ['leader_trader'], desc: 'A ledger room of polished wood and locked chests. Scale models of ships and wagons sit on shelves.', exits: { e: 'hall_thief', s: 'hall_warmage' } },
  hall_warmage: { id: 'hall_warmage', zone: 'town', name: 'Warrior Mage Guildhall', npcs: ['leader_warmage'], desc: 'Scorch marks ring the dueling circle at the center. Elemental runes pulse along the stone columns.', exits: { n: 'hall_trader' } },

  // ---------- East Gate & docks ----------
  middens: {
    id: 'middens', zone: 'town', name: 'The Middens',
    desc: 'A sprawling junkyard where the town throws what it cannot sell. Rusted pikes, cracked amphorae, and heaps of nameless scrap lie in drifts. Scavengers pick through the refuse for anything worth a copper.',
    exits: { n: 'east_gate' },
  },
  docks: {
    id: 'docks', zone: 'town', name: 'The Docks', npcs: ['dockmaster'],
    desc: 'Planked piers crowd the riverbank, where barges and fishing skiffs creak at their moorings. Stevedores haul crates down the gangplanks, and the river smells of wet rope and fish. A barge at the far pier takes passengers upriver, and an inn door stands open to the west.',
    exits: { n: 'market_end', e: 'half_pint', s: 'pier' },
  },
  half_pint: {
    id: 'half_pint', zone: 'town', name: 'The Half Pint Inn', tavern: true,
    desc: 'A dockside inn of creaking timber and salt haze. Bards and stevedores crowd the taproom, and a balcony over the river lets customers watch the gulls and the ferries. The bunks are dry and the ale is brisk — a good place to rest.',
    exits: { w: 'docks' },
  },
  pier: {
    id: 'pier', zone: 'town', name: 'Amusement Pier', npcs: ['pier_master'],
    desc: 'A gaily painted pier of stalls and games. Lanterns bob overhead, and a crowd gathers around a coin-toss table where a grinning fellow wins more than he loses. A barge moors at the end of the pier.',
    exits: { n: 'docks', w: 'rh_square' },
  },
  market_end: {
    id: 'market_end', zone: 'town', name: 'Bank Landing', npcs: ['banker', 'quartermaster'],
    desc: 'The water-gate to the bank\'s riverfront, where crates of coin and ledger-scrolls are landed. The docks lie upriver, and the market court climbs away south.',
    exits: { w: 'south_road', s: 'docks' },
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
    exits: { s: 'sewers_1', n: 'sewers_3' },
  },
  sewers_3: {
    id: 'sewers_3', zone: 'sewers', name: 'Kobold Warrens', spawns: ['kobold', 'kobold', 'rat'],
    desc: 'The smell of unwashed scales and stolen food is thick. Crude bone charms rattle overhead.',
    exits: { s: 'sewers_2', d: 'sewers_4' },
  },
  sewers_4: {
    id: 'sewers_4', zone: 'sewers', name: 'Lower Drains', spawns: ['great_rat', 'great_rat'],
    desc: 'The tunnels slope deeper here, where the runoff grows slow and black. Things drag in the dark beyond the lantern\'s reach.',
    exits: { up: 'sewers_3', d: 'sewers_5' },
  },
  sewers_5: {
    id: 'sewers_5', zone: 'sewers', name: 'The Blackwater', spawns: ['sewer_viper', 'great_rat'],
    desc: 'A sump of stagnant black water where the brickwork has crumbled away. Ripples cross the surface without any wind.',
    exits: { up: 'sewers_4' },
  },
  woods_path: {
    id: 'woods_path', zone: 'woods', name: 'Siergelde Road', spawns: ['goblin'],
    desc: 'A rutted trail winds between towering pines toward the Siergelde Ruins. Shadows flicker between the trunks.',
    exits: { e: 'west_gate', n: 'woods_1' },
  },
  woods_1: {
    id: 'woods_1', zone: 'woods', name: 'Clearing', spawns: ['goblin', 'goblin', 'wolf'],
    desc: 'A mossy clearing ringed by ancient oaks. The canopy cuts the light into dapples. A cart track heads west toward the river town.',
    exits: { s: 'woods_path', n: 'woods_2', w: 'rh_ferry' },
  },
  woods_2: {
    id: 'woods_2', zone: 'woods', name: 'Wolf Dens', spawns: ['wolf', 'wolf'],
    desc: 'The ground is scored with claw marks. A distant howl rises and falls in the wind.',
    exits: { s: 'woods_1', n: 'deep_1' },
  },
  marsh_1: {
    id: 'marsh_1', zone: 'marsh', name: 'Marsh Edge', spawns: ['wisp'],
    desc: 'Reeds and stagnant water stretch to the horizon. Pale lights drift over the bog.',
    exits: { w: 'east_gate', s: 'marsh_2' },
  },
  marsh_2: {
    id: 'marsh_2', zone: 'marsh', name: 'Bog Hollow', spawns: ['wisp', 'wisp'],
    desc: 'A sunken hollow where the mist pools thick as breath. The air hums with cold magic.',
    exits: { n: 'marsh_1' },
  },
  deep_1: {
    id: 'deep_1', zone: 'deepwoods', name: 'Deep Wood', spawns: ['troll'],
    desc: 'The oaks here are vast and dark, their roots older than the town. Something heavy breathes nearby.',
    exits: { s: 'woods_2', e: 'deep_2' },
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
    exits: { s: 'tailor_shop', e: 'camp_hollow' },
  },
  camp_hollow: {
    id: 'camp_hollow', zone: 'camp', name: 'Bandit Hollow', spawns: ['bandit', 'bandit'],
    desc: 'A trampled hollow ringed by tents of patched hide. A great fire gutters in the center.',
    exits: { w: 'camp_path', n: 'camp_den' },
  },
  camp_den: {
    id: 'camp_den', zone: 'camp', name: 'Captain\'s Den', spawns: ['bandit_captain', 'bandit'],
    desc: 'A cave mouth draped in looted finery. The bandit captain rules from a crude throne of crates. Faint heat rises from a deeper shaft.',
    exits: { s: 'camp_hollow', d: 'cinder_1' },
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

  // ================ RIVERHAVEN (second starting city) ================
  rh_square: {
    id: 'rh_square', zone: 'riverhaven', name: 'Riverhaven Town Square', npcs: ['towncrier'],
    desc: 'A broad square of red cobbles by the river. Fishing boats bob at the piers, gulls wheel overhead, and the smells of river mud and woodsmoke fill the air. Streets lead off in every direction.',
    exits: { e: 'rh_market', s: 'rh_temple', w: 'rh_guilds', n: 'rh_ferry' },
  },
  rh_market: {
    id: 'rh_market', zone: 'riverhaven', name: 'Riverside Market', npcs: ['shopkeeper', 'weaponsmith', 'armorer', 'quartermaster', 'banker'],
    desc: 'A lively market along the waterfront. Carts of fish, cloth, and iron crowd the cobbles, and the bank stands behind a bronze door.',
    exits: { w: 'rh_square' },
  },
  rh_temple: {
    id: 'rh_temple', zone: 'riverhaven', name: 'Harbor Shrine', npcs: ['healer'],
    desc: 'A small shrine where sailors light candles before sailing. Sister Cora tends the wounded under a painted sky.',
    exits: { n: 'rh_square' },
  },
  rh_guilds: {
    id: 'rh_guilds', zone: 'riverhaven', name: 'Guild Hall Row',
    desc: 'Eleven guildhalls face the river, their banners snapping in the wind. Trainers of every order hold court on the steps.',
    npcs: [
      'leader_barbarian', 'leader_bard', 'leader_cleric', 'leader_empath', 'leader_moonmage',
      'leader_necromancer', 'leader_paladin', 'leader_ranger', 'leader_thief', 'leader_trader', 'leader_warmage',
    ],
    exits: { e: 'rh_square' },
  },
  rh_ferry: {
    id: 'rh_ferry', zone: 'riverhaven', name: 'The River Ferry',
    desc: 'A stout ferry moors here, its bell ringing across the water. A dirt road winds east from the landing into the wild woods, and reed-choked shallows stretch away north.',
    exits: { e: 'woods_1', sw: 'rh_wilds_1', s: 'rh_square' },
  },
  rh_wilds_1: {
    id: 'rh_wilds_1', zone: 'riverhaven', name: 'Reedwater Shore', spawns: ['mud_crab', 'mud_crab'],
    desc: 'Muddy shallows lap at a shore of broken reeds. Crab tracks stitch the mud in neat, deliberate lines, and the river breathes cool fog over everything.',
    exits: { ne: 'rh_ferry', s: 'rh_wilds_2' },
  },
  rh_wilds_2: {
    id: 'rh_wilds_2', zone: 'riverhaven', name: 'Otter Slough', spawns: ['reed_stalker', 'reed_stalker'],
    desc: 'Black water pools between hummocks of sedge. Something sleek leaves wake-lines through the reeds where no wind blows, and small bones litter the muck.',
    exits: { n: 'rh_wilds_1', w: 'rh_wilds_3' },
  },
  rh_wilds_3: {
    id: 'rh_wilds_3', zone: 'riverhaven', name: "Thug's Landing", spawns: ['river_thug', 'river_thug'],
    desc: 'A smugglers\u2019 landing of lashed logs, crates pried open and left to rot. The kind of quiet that listens back.',
    exits: { e: 'rh_wilds_2' },
  },
};

export function roomById(id) {
  return ROOMS[id] || null;
}
