// World rooms and spawns (clean-room; grounded in Elanthipedia references).
// Rooms form the playable map. `npc` lists npc ids present, `spawns` lists
// creature ids that may be found here (with a per-room chance).
//
// The Crossing's layout follows the text-source audit (tmp-crossing-audit.md):
// the Town Green hub, roads fanning to the four gates, the Bard Guild just
// east of the Oxenwaithe Bridge (Bard Guildhall page), the craft societies
// clustered off Magen Road and Herald Street (society pages + RanikMap1
// errors list), the Trader guild in west Crossing by the Guard House
// (Trader Guildhall page), and the riverfront Strand along the Segoltha.
// Landmark placements with no citable source are marked APPROXIMATE.

export const ZONES = {
  town: { name: 'Crossing', desc: 'The bustling heart of the Crossing.' },
  fields: { name: 'North Fields', desc: 'Hedged farmland between the North Gate and the trade route.' },
  wilds: { name: 'The Wilds', desc: 'Untamed country beyond the city walls.' },
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
    desc: 'A broad grassy green at the center of the Crossing, ringed by flagstone walks and old shade trees. Townsfolk gather here around a weathered fountain, and a tiny pond glints below its bank. Streets and lane-mouths fan out in every direction, and a caretaker keeps the green tidy.',
    exits: { n: 'dens_square_tg_n_0', ne: 'dens_square_tg_ne_0', e: 'dens_square_tg_e_0', se: 'dens_square_tg_se_0', s: 'dens_square_tg_s_0', sw: 'dens_square_tg_sw_0', w: 'dens_square_tg_w_0', nw: 'dens_square_tg_nw_0', d: 'tg_pond' },
  },
  tg_pond: {
    id: 'tg_pond', zone: 'town', name: 'Town Green Pond',
    desc: 'You stand on the bank of a tiny pond in the middle of the green. Cool water laps against soft, velvety silt, and in the distance you can hear the bustle of the town. A massive domesticated gelapod lounges in the pond, content and not the least bit aggressive.',
    exits: { up: 'square' },
  },

  // ---------- West district (Guild District & West Gate road) ----------
  tg_w: {
    id: 'tg_w', zone: 'town', name: 'Town Green West',
    desc: 'The western walk of the green gives onto an avenue of guild banners and caravan traffic, running out toward the West Gate. A lane of music shops and buskers — Bards\' Walk — branches northwest.',
    exits: { e: 'dens_square_tg_w_1', w: 'dens_guild_district_tg_w_1', n: 'dens_tg_nw_tg_w_1', s: 'dens_tg_sw_tg_w_1', nw: 'dens_bards_walk_tg_w_1' },
  },
  guild_district: {
    id: 'guild_district', zone: 'town', name: 'Caravan Way', npcs: ['towncrier'],
    desc: 'A cobbled way where caravans queue for the gate. Haldofurd\'s great barn stands to the west, its doors open to teams of draught animals, and the West Gate itself looms beyond.',
    exits: { e: 'dens_guild_district_tg_w_0', w: 'haldofurd_barn' },
  },
  haldofurd_barn: {
    id: 'haldofurd_barn', zone: 'town', name: "Haldofurd's Barn", npcs: ['stablehand'],
    desc: 'A great covered stable two rooms inside the West Gate, where caravans water their teams before the long haul to the ruins and the north.',
    exits: { e: 'guild_district', w: 'west_road' },
  },
  west_road: {
    id: 'west_road', zone: 'town', name: 'West Road', npcs: ['tanner'],
    desc: "The last stretch of road before the wall. The Needle & Thread sits to the north, a rough track splits south toward the hills beyond the river, and a cramped alley mouth slips between tenements to the west.",
    exits: { e: 'haldofurd_barn', w: 'passage_ravens', n: 'dens_tailor_shop_west_road_1' },
  },
  west_gate: {
    id: 'west_gate', zone: 'town', name: 'West Gate', npcs: ['guard'],
    desc: 'The massive west gate stands open. Guards watch the road that vanishes toward the Siergelde Ruins, and a caravan barn stands two rooms back inside the wall.',
    exits: { e: 'passage_ravens', s: 'trav_grove_16' },
  },
  tailor_shop: {
    id: 'tailor_shop', zone: 'town', name: 'The Needle & Thread', npcs: ['tailor'],
    desc: 'A warm shop crowded with stretched hides and half-stitched leathers. A long workbench runs the length of the wall, needles and awls standing ready in their racks.',
    exits: { s: 'dens_tailor_shop_west_road_0', e: 'trav_academy_tailor_1' },
  },

  // ---------- Bard Guild quarter (west-central streets) ----------
  // Hooked off the green's west walk; the bridge road leads to the Trader side.
  bards_walk: {
    id: 'bards_walk', zone: 'town', name: "Bards' Walk", APPROXIMATE: true,
    desc: 'A lane where buskers test new verses between sets. Chalked set-lists cover the wall by the corner.',
    exits: { se: 'dens_bards_walk_tg_w_0', e: 'dens_bards_walk_music_shop_0' },
  },
  music_shop: {
    id: 'music_shop', zone: 'town', name: 'The Music Shop', APPROXIMATE: true,
    desc: 'Lutes, drums and silver whistles hang from the rafters in careful rows. A luthier tunes a guitarra by lamplight.',
    exits: { w: 'dens_bards_walk_music_shop_1', s: 'academy', n: 'trav_academy_tailor_0' },
  },
  academy: {
    id: 'academy', zone: 'town', name: 'Asemath Academy',
    desc: 'The gates of the College of Asemath stand one room east of the Bard Guild, opening onto a cloister lined with scrolls and star charts. Scholars murmur over desks, and the air smells of old parchment and ink. A second entry opens north onto the Music Shop.',
    exits: { e: 'hall_bard', n: 'music_shop' },
  },
  hall_bard: {
    id: 'hall_bard', zone: 'town', name: 'Bard Guildhall', npcs: ['leader_bard'],
    desc: 'Just east of the Oxenwaithe Bridge: velvet drapes muffle the warm glow of lanterns. A lone lute rests on a stand, still humming.',
    exits: { w: 'academy', sw: 'oxenwaithe_bridge', n: 'taelberts_inn', s: 'outfitting_row' },
  },
  taelberts_inn: {
    id: 'taelberts_inn', zone: 'town', name: "Taelbert's Inn", tavern: true,
    desc: 'A northern-Crossing inn of lobby, bar and dining room, its quiet corners favored by traveling players. Step out the door and the Bard Guild stands across the way.',
    exits: { s: 'hall_bard' },
  },
  oxenwaithe_bridge: {
    id: 'oxenwaithe_bridge', zone: 'town', name: 'Oxenwaithe Bridge',
    desc: 'A stone span over the quick brown waters of the Oxenwaithe. The Bard Guild stands just east; the road climbs northwest toward the ranger and cleric quarter, and a merchant way runs on toward the Trader guild.',
    exits: { ne: 'hall_bard', nw: 'oxenwaithe_road', w: 'traders_road' },
  },
  outfitting_row: {
    id: 'outfitting_row', zone: 'town', name: 'Outfitting Row', APPROXIMATE: true,
    desc: 'Bolts of cloth and racks of half-finished garments line the walk south of the Bard Guild.',
    exits: { n: 'hall_bard', s: 'outfitting_row_s' },
  },
  outfitting_row_s: {
    id: 'outfitting_row_s', zone: 'town', name: 'Outfitting Row', APPROXIMATE: true,
    desc: 'Tailors\' dummies crowd the walk here. The Outfitting Society stands just south.',
    exits: { n: 'outfitting_row', s: 'outfitting_soc' },
  },
  outfitting_soc: {
    id: 'outfitting_soc', zone: 'town', name: 'Outfitting Society',
    desc: 'Three rooms south of the Bard Guild stands the Outfitting Society: spinning room, weaving room and workroom behind a modest entry hall.',
    exits: { n: 'outfitting_row_s' },
  },

  // ---------- North district (toward the North Gate) ----------
  tg_n: {
    id: 'tg_n', zone: 'town', name: 'Town Green North',
    desc: 'The northern edge of the green gives way to a broad avenue of shops and inns. Lanterns sway over the heads of the crowd, and the great North Gate looms in the distance.',
    exits: { s: 'dens_square_tg_n_1', n: 'dens_north_road_tg_n_1', e: 'dens_tg_n_tg_ne_0', w: 'dens_tg_n_tg_nw_0' },
  },
  north_road: {
    id: 'north_road', zone: 'town', name: 'North Road',
    desc: 'A broad road leading north toward the wall. Fine manors line the way, and carts roll steadily past toward the gate.',
    exits: { s: 'dens_north_road_tg_n_0', n: 'north_road_n' },
  },
  north_road_n: {
    id: 'north_road_n', zone: 'town', name: 'North Road',
    desc: 'The road crests a low rise. Ahead the North Gate stands open between its drum towers; a side lane branches northeast toward the manor grounds.',
    exits: { s: 'north_road', w: 'north_gate', ne: 'jadewater_way' },
  },
  north_gate: {
    id: 'north_gate', zone: 'town', name: 'North Gate', npcs: ['guard'],
    desc: 'The North Gate stands sentinel atop the rise, its great timber doors thrown wide at last. Beyond, hedged farmland rolls away toward the Northern Trade Route — and the wild things that came down upon it are still out there. The guard eyes your weapon: "Fields beyond the wall, if you fancy your chances."',
    exits: { e: 'north_road_n', n: 'fields_gate' },
  },
  fields_gate: {
    id: 'fields_gate', zone: 'fields', name: 'North Fields Gate', APPROXIMATE: true,
    desc: 'A gap in the hedgerow where the cart track leaves the cobbles. The furrows run away north between low stone walls, and something has been rooting along their edges.',
    exits: { s: 'north_gate', n: 'fields_furrow' },
  },
  fields_furrow: {
    id: 'fields_furrow', zone: 'fields', name: 'Plowed Furrows', spawns: ['marsh_hog', 'kobold'], APPROXIMATE: true,
    desc: 'Long ranks of turned earth, scattered with hoofprints. A bristled shape grunts somewhere ahead among the rows.',
    exits: { s: 'fields_gate', n: 'fields_stonebridge', ne: 'fields_orchard' },
  },
  fields_orchard: {
    id: 'fields_orchard', zone: 'fields', name: 'Roadside Orchard', spawns: ['kobold', 'reed_stalker'], APPROXIMATE: true,
    desc: 'An abandoned orchard gone half to scrub. Windfalls rot sweetly between the rows, and not all of the movement in the branches is wind.',
    exits: { sw: 'fields_furrow' },
  },
  fields_stonebridge: {
    id: 'fields_stonebridge', zone: 'fields', name: 'Field Stone Bridge', spawns: ['reed_stalker', 'wolf'], APPROXIMATE: true,
    desc: 'A squat stone bridge crosses a quick, cold stream on the way to the trade route. Claw marks score the old mortar on the far side.',
    exits: { s: 'fields_furrow' },
  },
  jadewater_way: {
    id: 'jadewater_way', zone: 'town', name: 'Jadewater Way',
    desc: 'Two rooms from the North Gate stands a grand manor set back from the road, its wrought-iron gates standing open.',
    exits: { sw: 'north_road_n', e: 'jadewater' },
  },
  jadewater: {
    id: 'jadewater', zone: 'town', name: 'Jadewater Mansion',
    desc: 'A stately manor, the headquarters of the Lorethew Mentor Society. New arrivals find their bearings here, and a snug inn — the Tenderfoot — sits within its grounds, where fresh adventurers sleep three to a bunk.',
    exits: { w: 'jadewater_way', s: 'tenderfoot' },
  },
  tenderfoot: {
    id: 'tenderfoot', zone: 'town', name: 'The Tenderfoot Inn', tavern: true,
    desc: 'A board-and-timber inn on the Jadewater grounds where new arrivals sleep three to a bunk. The common room smells of woodsmoke and hot stew, and the pallets are dry — a good place to get your wind back.',
    exits: { n: 'jadewater' },
  },

  // ---------- Northwest: festival way, carousel, Town Hall, temple quarter ----
  tg_nw: {
    id: 'tg_nw', zone: 'town', name: 'Town Green Northwest',
    desc: 'The northwestern corner of the green, where a festival way strung with lantern-lines runs north toward the carousel square, and a quieter road climbs toward the temple quarter.',
    exits: { se: 'dens_square_tg_nw_1', s: 'dens_tg_nw_tg_w_0', n: 'dens_nw_road_tg_nw_1', w: 'dens_festival_way_tg_nw_1', e: 'dens_tg_n_tg_nw_1' },
  },
  festival_way: {
    id: 'festival_way', zone: 'town', name: 'Festival Way',
    desc: 'A festive avenue lined with painted stalls. Gaily colored beasts turn slowly on the carousel ahead, their calliope drifting over the crowd.',
    exits: { e: 'dens_festival_way_tg_nw_0', w: 'carousel' },
  },
  carousel: {
    id: 'carousel', zone: 'town', name: 'The Carousel',
    desc: 'A gaily painted carousel turns in the middle of the square, carrying painted wooden beasts for a few coppers a ride. Children shriek with delight. Orem\'s Bathhouse steams quietly to the west.',
    exits: { e: 'festival_way', w: 'orems_bathhouse', n: 'hall_walk' },
  },
  hall_walk: {
    id: 'hall_walk', zone: 'town', name: 'Hall Walk',
    desc: 'A short walk north of the carousel. The sturdy facade of the Town Hall rises to the east, its clock ticking solemnly over the lintel.',
    exits: { s: 'carousel', e: 'town_hall' },
  },
  town_hall: {
    id: 'town_hall', zone: 'town', name: 'Town Hall',
    desc: 'The seat of the Crossing\'s civic offices — citizenship, registration, genealogy and the lottery. Clerks hurry past with ledgers, and a long noticeboard lists the day\'s business.',
    exits: { w: 'hall_walk' },
  },
  orems_bathhouse: {
    id: 'orems_bathhouse', zone: 'town', name: "Orem's Bathhouse", APPROXIMATE: true,
    desc: 'A steam-wreathed hall of tiled pools and sweating stone, its door propped open a hand\'s width despite the chill.',
    exits: { e: 'carousel' },
  },
  nw_road: {
    id: 'nw_road', zone: 'town', name: 'Northwest Road',
    desc: 'A quiet, tree-lined road climbing northwest out of the green. The walk grows hushed and grave as it nears the temples, and incense drifts on the air.',
    exits: { s: 'dens_nw_road_tg_nw_0', n: 'temple_row' },
  },
  temple_row: {
    id: 'temple_row', zone: 'town', name: 'Temple Row', npcs: ['healer'],
    desc: 'A quiet street of shrines and prayer houses at the foot of the temple hill. The healer\'s sanctuary is here, and an iron grate in the cobbles leads down into the old sewers. An austere training hall stands to the west.',
    exits: { s: 'nw_road', n: 'temple', w: 'fane', d: 'sewers_1' },
  },
  fane: {
    id: 'fane', zone: 'town', name: 'Fane of Training', npcs: ['fane_keeper'],
    desc: 'A vaulted training hall hung with the banners of a hundred pilgrims. Eight alcoves ring the walls, each devoted to a single attribute. Novices squat in meditation, steeling body and mind.',
    exits: { e: 'temple_row' },
  },
  temple: {
    id: 'temple', zone: 'town', name: 'Temple of the Pantheon', npcs: ['healer'],
    desc: 'A vaulted hall lit by candles and shafts of stained light. Priests tend the wounded on low cots, and a great library shelves the scrolls of the faith. A door at the back leads into the High Temple.',
    exits: { s: 'temple_row', n: 'dens_high_temple_temple_1' },
  },
  high_temple: {
    id: 'high_temple', zone: 'town', name: 'The High Temple',
    desc: 'The great temple of the Crossing, its vaulted ceiling painted with the deeds of the gods. Altars to the Thirteen ring the sanctum, each crowned by a blazing Eye, and the air itself weighs heavy with faith.',
    exits: { s: 'dens_high_temple_temple_0', n: 'dens_high_temple_immortals_approach_0' },
  },
  immortals_approach: {
    id: 'immortals_approach', zone: 'town', name: "Immortals' Approach",
    desc: 'A paved approach leading from the temple quarter to the great spherical mass of the Crossing High Temple. Priests and pilgrims pass here on their way to the gates of the sanctuary.',
    exits: { s: 'dens_high_temple_immortals_approach_1' },
  },

  // ---------- Northeast district (NE Gate, Magen Rd, Herald St) ----------
  tg_ne: {
    id: 'tg_ne', zone: 'town', name: 'Town Green Northeast',
    desc: 'The northeast corner of the green, where footpaths converge toward the mistshrouded fields beyond the Northeast Gate. Eveners and merchants share the way.',
    exits: { sw: 'dens_square_tg_ne_1', w: 'dens_tg_n_tg_ne_1', s: 'dens_tg_e_tg_ne_1', e: 'dens_ne_road_tg_ne_1' },
  },
  ne_road: {
    id: 'ne_road', zone: 'town', name: 'Northeast Road',
    desc: 'A busy road climbing toward the Northeast Gate. Guild masters and peddlers crowd the margins, and the air smells of resin and hot steel.',
    exits: { w: 'dens_ne_road_tg_ne_0', ne: 'ne_gate', e: 'trav_ne_road_gateyard_0' },
  },
  ne_gate: {
    id: 'ne_gate', zone: 'town', name: 'Northeast Gate', npcs: ['guard'],
    desc: 'The great Northeast Gate, where invasions are thrown back and hunting parties sally forth. A trail passes through the wall toward the Warrior Mage grounds, and Magen Road bends away southwest along the inside of the wall.',
    exits: { sw: 'ne_road', w: 'magen_rd', e: 'wm_path' },
  },
  magen_rd: {
    id: 'magen_rd', zone: 'town', name: 'Magen Road',
    desc: 'Magen Road runs between the Northeast Gate and the city\'s craft societies. Doors of the Enchanting Society stand away to the west down Craft Row, and Herald Street begins to the east.',
    exits: { e: 'ne_gate', w: 'craft_row' },
  },
  craft_row: {
    id: 'craft_row', zone: 'town', name: 'Craft Row',
    desc: 'A row of society halls, each flying the sign of its craft. The Enchanting Society stands at the row\'s western end.',
    exits: { e: 'magen_rd', w: 'craft_row_w' },
  },
  craft_row_w: {
    id: 'craft_row_w', zone: 'town', name: 'Craft Row',
    desc: 'The western end of Craft Row. The Enchanting Society\'s doors stand open, and the smell of ozone drifts from within.',
    exits: { e: 'craft_row', w: 'enchanting_soc' },
  },
  enchanting_soc: {
    id: 'enchanting_soc', zone: 'town', name: 'Enchanting Society',
    desc: 'Four rooms west of the Northeast Gate stands the Enchanting Society. Racks of tools and bundled reagents crowd the entry, and the air shimmers faintly with latent magic.',
    exits: { e: 'craft_row_w' },
  },
  gateyard: {
    id: 'gateyard', zone: 'town', name: 'Gate Yard',
    desc: 'A cobbled yard hard against the inside of the northeast wall. Herald Street runs away south between close-built tenements, and Magen Road bends west past the Empaths\' Guild.',
    exits: { w: 'trav_ne_road_gateyard_2', s: 'trav_gateyard_herald_st_0', sw: 'hall_empath' },
  },
  herald_st: {
    id: 'herald_st', zone: 'town', name: 'Herald Street',
    desc: 'Herald Street climbs north toward its top by the gate yard. Tenement doors give onto the cobbles, and the street narrows as it rises.',
    exits: { n: 'trav_gateyard_herald_st_2', s: 'herald_mid' },
  },
  magen_walk: {
    id: 'magen_walk', zone: 'town', name: 'Magen Road',
    desc: 'A garden-flanked stretch of Magen Road behind the gate yard. The Empaths\' Guild door stands among the flower beds to the south.',
    exits: { s: 'hall_empath' },
  },
  herald_mid: {
    id: 'herald_mid', zone: 'town', name: 'Herald Street',
    desc: 'The middle reach of Herald Street. A lamplighter works his rounds, and laundry lines cross overhead.',
    exits: { n: 'herald_st', s: 'herald_s' },
  },
  herald_s: {
    id: 'herald_s', zone: 'town', name: 'Herald Street',
    desc: 'At the head of Herald Street a heavy door bears the sigil of the Paladins\' Guild, and the smell of horse and oiled steel drifts from beyond it.',
    exits: { n: 'herald_mid', s: 'hall_paladin' },
  },
  hall_paladin: {
    id: 'hall_paladin', zone: 'town', name: 'Paladin Guildhall', npcs: ['leader_paladin'],
    desc: 'A barracks of gleaming plate and hanging banners at the top of Herald Street. Rows of warhorses stamp in a courtyard beyond.',
    exits: { n: 'herald_s', e: 'trav_meeting_hall_hall_paladin_4' },
  },

  // ---- Guild cluster around Champions\' Square (audit §3) ----
  // Empath entrance near the NE gate; Barbarian 1S of it; Meeting Hall 1W of
  // Barbarian; Forging Society S of Barbarian; Apostle HQ S,W,W of Empath.
  hall_empath: {
    id: 'hall_empath', zone: 'town', name: 'Empath Guildhall', npcs: ['leader_empath'],
    desc: 'A sunlit garden room of soft cushions and trickling water on Magen Road near the Northeast Gate. The air feels warm and alive, and a cart by the wall holds gifts for the wounded.',
    exits: { n: 'magen_walk', s: 'hall_barbarian', w: 'apostle_arch', ne: 'gateyard' },
  },
  apostle_arch: {
    id: 'apostle_arch', zone: 'town', name: 'Apostles\' Archway', APPROXIMATE: true,
    desc: 'An archway in the guild wall opens onto a small court of recruiting offices.',
    exits: { e: 'hall_empath', w: 'apostle_hq' },
  },
  hall_barbarian: {
    id: 'hall_barbarian', zone: 'town', name: 'Barbarian Guildhall', npcs: ['leader_barbarian'],
    desc: 'Raw timbers, rough stone, and the smell of woodsmoke around Champions\' Square. Trophies of tooth and claw hang from the walls.',
    exits: {  n: 'hall_empath', w: 'meeting_hall', s: 'forging_soc', e: 'trav_hall_barbarian_hall_paladin_0' },
  },
  meeting_hall: {
    id: 'meeting_hall', zone: 'town', name: 'Crossing Meeting Hall',
    desc: 'One room west of the Barbarian Guild, a plain hall of benches and a speaker\'s dais where the town gathers when voices must be heard.',
    exits: { e: 'hall_barbarian', w: 'trav_meeting_hall_hall_paladin_0' },
  },
  apostle_hq: {
    id: 'apostle_hq', zone: 'town', name: 'Order of the Apostle HQ', APPROXIMATE: true,
    desc: 'Through the archway: the recruiting offices of the Apostles, banners of the order hanging still in the still air.',
    exits: { e: 'apostle_arch' },
  },
  forging_soc: {
    id: 'forging_soc', zone: 'town', name: 'Forging Society', npcs: ['forge_master'],
    desc: 'South of the Barbarian Guild stands the Forging Society, an anvil and grindstone outside its doors and the ring of hammers within.',
    exits: { n: 'hall_barbarian' },
  },

  // ---- Warrior Mage trail (outside the NE gate) ----
  wm_path: {
    id: 'wm_path', zone: 'town', name: 'Warrior Mage Trail',
    desc: 'A path slips through the postern beside the Northeast Gate and winds southeastward into the hills.',
    exits: { w: 'ne_gate', e: 'dens_wm_path_wm_road_0' },
  },
  wm_road: {
    id: 'wm_road', zone: 'town', name: 'Warrior Mage Trail',
    desc: 'The trail climbs through wind-scoured pines. Runes are cut into the waystones here, each one warm to the touch.',
    exits: { w: 'dens_wm_path_wm_road_1', e: 'dens_hall_warmage_wm_road_1' },
  },
  hall_warmage: {
    id: 'hall_warmage', zone: 'town', name: 'Warrior Mage Guildhall', npcs: ['leader_warmage'],
    desc: 'Nestled safely outside the Northeast Gate: scorch marks ring the dueling circle at the center, and elemental runes pulse along the stone columns.',
    exits: { w: 'dens_hall_warmage_wm_road_0' },
  },

  // ---------- West-central: Bard Guild, bridge, academy, shops ----------
  tg_e: {
    id: 'tg_e', zone: 'town', name: 'Town Green East',
    desc: 'The eastern walk of the green spills onto a broad market that stretches away to the bank and the gates.',
    exits: { w: 'dens_square_tg_e_1', e: 'dens_bazaar_tg_e_1', n: 'dens_tg_e_tg_ne_0', s: 'dens_tg_e_tg_se_0' },
  },
  tg_se: {
    id: 'tg_se', zone: 'town', name: 'Town Green Southeast',
    desc: 'The southeastern walk of the green opens onto the East Road, by which travelers reach the East Gate and the marsh beyond.',
    exits: { nw: 'dens_square_tg_se_1', n: 'dens_tg_e_tg_se_1', w: 'dens_tg_s_tg_se_1', e: 'dens_east_road_tg_se_1' },
  },
  bazaar: {
    id: 'bazaar', zone: 'town', name: "Mongers' Bazaar", npcs: ['mags', 'shopkeeper', 'weaponsmith', 'armorer'],
    desc: "The Mongers' Bazaar is a crowded warren of canvas stalls and awnings. Vendors hawk herbs, hot glass, blades and leathers, and the firewood peddler Mags sits at a bin of sticks near the heart of it.",
    exits: { w: 'dens_bazaar_tg_e_0', e: 'dens_bazaar_market_way_0' },
  },
  market_way: {
    id: 'market_way', zone: 'town', name: 'Market Way', npcs: ['towncrier'],
    desc: 'The market lanes funnel east toward the bank. Canvas awnings flap overhead while crowds of buyers and porters surge past.',
    exits: { w: 'dens_bazaar_market_way_1', e: 'bank_plaza', n: 'dens_brewery_market_way_1', s: 'dens_forge_row_market_way_1' },
  },
  brewery: {
    id: 'brewery', zone: 'town', name: 'The Tilted Retort', npcs: ['alchemist'],
    desc: 'A warm little workshop thick with steam and the smell of crushed roots. Mortars, alembics, and jars of floating light crowd every shelf. A hammer rings from the workshop beyond.',
    exits: { s: 'dens_brewery_market_way_0', e: 'dens_brewery_forge_0' },
  },
  forge: {
    id: 'forge', zone: 'town', name: 'The Ember Forge', npcs: ['forge_master'],
    desc: 'The air shimmers over a great anvil. Bellow-fires roar in a hearth of black stone, and racks of finished steel line the walls. Ore waits in bins, patient for the hammer.',
    exits: { w: 'dens_brewery_forge_1' },
  },
  forge_row: {
    id: 'forge_row', zone: 'town', name: 'Smiths Row',
    desc: 'A short lane of smithies and workshops running south of Market Way toward the river.',
    exits: { n: 'dens_forge_row_market_way_0', s: 'dens_auction_house_forge_row_1' },
  },
  auction_house: {
    id: 'auction_house', zone: 'town', name: "The Merchants' Auction Hall",
    desc: 'A panelled hall where the Crossing does its real trading. Lots are chalked on a great board as they come in — gear, salvage, and stranger goods, each with an asking price. The hall\'s scribes take three percent of every sale.',
    exits: { n: 'dens_auction_house_forge_row_0', se: 'dens_auction_house_commodity_pit_0' },
  },
  commodity_pit: {
    id: 'commodity_pit', zone: 'town', name: 'The Grain Pit', npcs: ['pit_master'],
    desc: 'A long hall of ledger counters and grain chutes. Slaves to the market scrawl prices on a great board as they change. Merchants whisper, gamble, and watch the board.',
    exits: { nw: 'dens_auction_house_commodity_pit_1' },
  },
  bank_plaza: {
    id: 'bank_plaza', zone: 'town', name: 'Court of the Bank', npcs: ['banker', 'quartermaster'],
    desc: 'A cobbled court before the low, iron-doored facade of the First Provincial Bank. Guards clatter by with wagons of bound steel. A ramp on the bank\'s east side climbs to the Market Plaza, and Herilo\'s shopfront faces the court from the north.',
    exits: { w: 'market_way', e: 'bank_plaza_e', s: 'order_hq', n: 'herilos_artifacts', se: 'market_plaza' },
  },
  market_plaza: {
    id: 'market_plaza', zone: 'town', name: 'Market Plaza',
    desc: 'A broad plaza of stepped terraces reached by a ramp rising from the bank court. Player-owned shops fill its halls and galleries, with guards at the doors keeping the peace.',
    exits: { nw: 'bank_plaza' },
  },
  order_hq: {
    id: 'order_hq', zone: 'town', name: 'Order Headquarters',
    desc: 'One room south of the bank stands the Order Headquarters, where the recruiting offices of the town\'s orders ply their trade among banners and mustering lists.',
    exits: { n: 'bank_plaza' },
  },
  herilos_artifacts: {
    id: 'herilos_artifacts', zone: 'town', name: "Herilo's Artifacts",
    desc: 'A cluttered storefront of curious relics and mounted trophies. Herilo herself holds court behind a counter of polished horn.',
    exits: { s: 'bank_plaza', n: 'poetry_in_motion' },
  },
  poetry_in_motion: {
    id: 'poetry_in_motion', zone: 'town', name: 'Poetry in Motion',
    desc: 'One room north of Herilo\'s, a slim shop of letterpresses and vellum where verses are set and bound to order.',
    exits: { s: 'herilos_artifacts' },
  },

  // ---------- Southeast / east (East Road, gate, Longbow Bridge) ----------
  east_road: {
    id: 'east_road', zone: 'town', name: 'East Road',
    desc: 'A wide road heading east from the green. The cold mist of the marsh hangs low over the fields ahead, and to the south a bridge spans the river toward the Tatting Street homes.',
    exits: { w: 'dens_east_road_tg_se_0', e: 'east_gate', s: 'longbow' },
  },
  east_gate: {
    id: 'east_gate', zone: 'town', name: 'East Gate', npcs: ['guard'],
    desc: 'The East Gate opens onto farmlands, and a cold mist rises from a low marsh beyond the fields. The Middens junkyard sprawls just inside the wall.',
    exits: { w: 'east_road', e: 'marsh_1', s: 'middens' },
  },
  middens: {
    id: 'middens', zone: 'town', name: 'The Middens',
    desc: 'A sprawling junkyard where the town throws what it cannot sell. Rusted pikes, cracked amphorae, and heaps of nameless scrap lie in drifts. Scavengers pick through the refuse for anything worth a copper.',
    exits: { n: 'east_gate' },
  },
  longbow: {
    id: 'longbow', zone: 'town', name: 'Longbow Bridge',
    desc: 'A broad timber bridge arcing over the water. One room south of here the fine homes of Tatting Street and Riverlace Lane begin.',
    exits: { n: 'east_road', s: 'tatting_st' },
  },
  tatting_st: {
    id: 'tatting_st', zone: 'town', name: 'Tatting Street',
    desc: 'An upper-class street of stately homes running south from the Longbow Bridge before it becomes Riverlace Lane. Crofton Walk branches to the west.',
    exits: { n: 'longbow', s: 'riverlace', w: 'crofton_walk' },
  },
  riverlace: {
    id: 'riverlace', zone: 'town', name: 'Riverlace Lane',
    desc: 'The quiet southern turn of the housing district, where fine manors stand behind hedges and fountains. Gaethrend\'s Court opens to the south.',
    exits: { n: 'tatting_st', s: 'gaethrends_court' },
  },
  gaethrends_court: {
    id: 'gaethrends_court', zone: 'town', name: "Gaethrend's Court", tavern: true,
    desc: 'A residential court around a snug drink shop — foyer, barroom, dining room and a promenade under a widow\'s walk, with four hallways of homes behind them.',
    exits: { n: 'riverlace' },
  },
  crofton_walk: {
    id: 'crofton_walk', zone: 'town', name: 'Crofton Walk',
    desc: 'A middle-class residential lane of tidy cottages that curls into Smithy Lane. Garden tools wait by doors and laundry snaps on lines overhead.',
    exits: { e: 'tatting_st', s: 'dens_crofton_walk_smithy_lane_0' },
  },
  smithy_lane: {
    id: 'smithy_lane', zone: 'town', name: 'Smithy Lane',
    desc: 'A lane of trim red-brick and stone-block homes named for the old smithy at its head.',
    exits: { n: 'dens_crofton_walk_smithy_lane_1' },
  },

  // ---------- South (stockyard, South Road) ----------
  tg_s: {
    id: 'tg_s', zone: 'town', name: 'Town Green South',
    desc: 'The southern walk of the green gives onto a quieter quarter of shrines, guard offices and the town\'s dockward roads.',
    exits: { n: 'dens_square_tg_s_1', s: 'dens_stockyard_tg_s_1', w: 'dens_tg_s_tg_sw_0', e: 'dens_tg_s_tg_se_0' },
  },
  stockyard: {
    id: 'stockyard', zone: 'town', name: 'Stockyard',
    desc: 'A guarded yard of pens and muster points. The Crossing Guardhouse stands here, its cells reached down a stair from the yard, and a disreputable dive called Viper\'s Nest slouches next door.',
    exits: { n: 'dens_stockyard_tg_s_0', s: 'dens_south_road_stockyard_1', d: 'jail', e: 'dens_stockyard_viper_nest_0' },
  },
  jail: {
    id: 'jail', zone: 'town', name: 'The Town Cells', npcs: ['jailer'],
    desc: 'A low stone cell with a heavy door of iron bars. A narrow slit of daylight falls from the street above. Scratched into the wall: a list of names, and a warning.',
    exits: { up: 'stockyard' },
  },
  viper_nest: {
    id: 'viper_nest', zone: 'town', name: "Viper's Nest Inn", tavern: true, APPROXIMATE: true,
    desc: 'One dim room of smoke and muttering — the dregs of society drink here, and strangers are watched more than served.',
    exits: { w: 'dens_stockyard_viper_nest_1' },
  },
  south_road: {
    id: 'south_road', zone: 'town', name: 'South Road',
    desc: 'A road winding south toward the wharfs and the western reaches of town.',
    exits: { n: 'dens_south_road_stockyard_0', w: 'dens_south_road_strand_0', e: 'dens_market_end_south_road_1' },
  },

  // ---------- Southwest / riverside (Strand, portage, Segoltha stair) ----
  tg_sw: {
    id: 'tg_sw', zone: 'town', name: 'Town Green Southwest',
    desc: 'The southwestern walk of the green gives onto a lane that winds down to the riverside Strand below the bank.',
    exits: { ne: 'dens_square_tg_sw_1', s: 'dens_sw_road_tg_sw_1', e: 'dens_tg_s_tg_sw_1', n: 'dens_tg_sw_tg_w_0' },
  },
  sw_road: {
    id: 'sw_road', zone: 'town', name: 'Southwest Road',
    desc: 'A riverside road skirting the far southwestern corner of town, past the bank\'s water-stair to the Segoltha and the old riverfront portage.',
    exits: { n: 'dens_sw_road_tg_sw_0', s: 'dens_strand_sw_road_1' },
  },
  strand: {
    id: 'strand', zone: 'town', name: 'The Strand',
    desc: 'A tree-lined river walk along the banks of the Segoltha. Boats bob at the piers and gulls wheel overhead. The Strand Communal Center stands among the trees to the south, and the Riverfront Portage lies downstream to the west.',
    exits: { n: 'dens_strand_sw_road_0', e: 'dens_south_road_strand_1', s: 'dens_strand_strand_communal_0', w: 'dens_river_portage_strand_1' },
  },
  river_portage: {
    id: 'river_portage', zone: 'town', name: 'Riverfront Portage',
    desc: 'Downstream on the Strand, haulers drag barges along rollers of greased timber. The Shardstar shipping office keeps its ledgers here.',
    exits: { e: 'dens_river_portage_strand_0', w: 'dens_river_portage_shardstar_office_0' },
  },
  shardstar_office: {
    id: 'shardstar_office', zone: 'town', name: 'Shardstar Shipping Office', APPROXIMATE: true,
    desc: 'A plank office stamped with the Shardstar crest, smelling of tar and river weed. Clerks tally manifests for the far ports.',
    exits: { e: 'dens_river_portage_shardstar_office_1' },
  },
  strand_communal: {
    id: 'strand_communal', zone: 'town', name: 'Strand Communal Center',
    desc: 'A sheltered community hall on the Strand, its doors open to the riverside breeze. Travellers rest under the veranda and watch the ferries ply the water.',
    exits: { n: 'dens_strand_strand_communal_1', sw: 'dens_segoltha_stair_strand_communal_1' },
  },
  segoltha_stair: {
    id: 'segoltha_stair', zone: 'town', name: 'Bank Stair',
    desc: 'A stair descends from the far southwest corner of town to a landing where the bank moors boats on the Segoltha.',
    exits: { ne: 'dens_segoltha_stair_strand_communal_0' },
  },

  // ---------- Docks ----------
  market_end: {
    id: 'market_end', zone: 'town', name: 'Bank Landing', npcs: ['banker', 'quartermaster'],
    desc: 'The water-gate to the bank\'s riverfront, where crates of coin and ledger-scrolls are landed. The docks lie upriver, and the Sand Spit tavern leans over the water to the east.',
    exits: { w: 'dens_market_end_south_road_0', s: 'dens_docks_market_end_1', e: 'dens_market_end_sand_spit_0' },
  },
  sand_spit: {
    id: 'sand_spit', zone: 'town', name: 'Sand Spit Tavern', tavern: true, APPROXIMATE: true,
    desc: "A nautical tavern of ship-lap and brass, all riverfront theme: a barroom, dark corners, a cellar with a witchclaw door, and a speakeasy called the Raven's Nest below. A door in the back wall opens onto the ruins next door.",
    exits: { w: 'dens_market_end_sand_spit_1', out: 'passage_swithen' },
  },
  // Thief Passages (DR clean-room): hidden bolt-holes scattered around town,
  // no central hub above ground. Entrances are marked by the guild's sign —
  // visible only to guilded thieves who know Passages. Sources: Elanthipedia
  // Thief page (Crossing has many passages, no hub) + Thief Secrets (Raven's
  // Court/Silver Walk knocker-door; Swithen's Court prison ruins; Sand Spit
  // barrel). Our three entrances sit at the tavern and the west quarter.
  passage_ravens: {
    id: 'passage_ravens', zone: 'town', name: "Raven's Court", PASSAGE_ENTRANCE: 'pass_hub',
    desc: "A cramped court behind Silver Walk's tenements, so named for the birds that own its eaves. A slitted door with a golden knocker faces the alley — unremarkable, unless you know what it opens.",
    exits: { e: 'west_road', w: 'west_gate' },
  },
  passage_swithen: {
    id: 'passage_swithen', zone: 'town', name: "Swithen's Court Ruins", PASSAGE_ENTRANCE: 'pass_hub',
    desc: "The ruins of the old prison: tumbled foundation stones and one leaning wall. Among the rubble, some stones carry a carved sign — the mark of the Thieves' Guild.",
    exits: { e: 'sand_spit' },
  },
  // The tunnel network itself: no hub above ground, but below there is one
  // dark knot of passages under the guild quarter. Portal-linked to each
  // entrance (registered in grid.js PORTALS) — geometry is deliberately
  // non-literal; these are bolt-holes, not streets.
  pass_hub: {
    id: 'pass_hub', zone: 'town', name: "Thieves' Passage, Dark Knot", PASSAGE_HUB: true,
    desc: "A low-ceiled knot of smugglers' tunnels beneath the west quarter. Torchlight from no visible source stains the brickwork amber, and chalked signs mark the ways out.",
    exits: { d: 'pass_den' },
  },
  pass_den: {
    id: 'pass_den', zone: 'town', name: "Passage Bolt-Hole", npcs: ['fence'],
    desc: 'A dry bolt-hole behind a false wall: a stool, a lantern, and a donation bin for goods that need to disappear. The guild keeps its friends close, and its loot closer.',
    exits: { u: 'pass_hub' },
  },
  docks: {
    id: 'docks', zone: 'town', name: 'The Docks', npcs: ['dockmaster'],
    desc: 'Planked piers crowd the riverbank, where barges and fishing skiffs creak at their moorings. Stevedores haul crates down the gangplanks, and the river smells of wet rope and fish. A barge at the far pier takes passengers across, and the Half Pint inn door stands open to the east.',
    exits: { n: 'dens_docks_market_end_0', e: 'half_pint', s: 'dens_docks_pier_0', se: 'neh_dock' },
  },
  half_pint: {
    id: 'half_pint', zone: 'town', name: 'The Half Pint Inn', tavern: true,
    desc: 'A dockside inn of creaking timber and salt haze. Bards and stevedores crowd the taproom, and a balcony over the river lets customers watch the gulls and the ferries. The bunks are dry and the ale is brisk — a good place to rest.',
    exits: { w: 'docks' },
  },
  pier: {
    id: 'pier', zone: 'town', name: 'Amusement Pier', npcs: ['pier_master'],
    desc: 'A gaily painted pier of stalls and games. Lanterns bob overhead, and a crowd gathers around a coin-toss table where a grinning fellow wins more than he loses. A barge moors at the end of the pier.',
    exits: { n: 'dens_docks_pier_1', w: 'rh_square' },
  },

  // ---------- Southwest streets: trader row & far-west riverbank quarter ----
  traders_road: {
    id: 'traders_road', zone: 'town', name: "Traders' Road", APPROXIMATE: true,
    desc: 'A merchant road of warehouses and wagon yards running west toward the Trader guild.',
    exits: { w: 'engineering_soc', e: 'oxenwaithe_bridge' },
  },
  engineering_soc: {
    id: 'engineering_soc', zone: 'town', name: 'Engineering Society',
    desc: 'A hall of drafting tables, models and half-built mechanisms. Rangu\'s repair shop and a carving depot share the building.',
    exits: { w: 'alchemy_soc', e: 'traders_road' }
  },
  alchemy_soc: {
    id: 'alchemy_soc', zone: 'town', name: 'Alchemy Society',
    desc: 'One room east of the Engineering Society stands the Alchemy Society, its entry thick with the smell of sulphur and dried herbs.',
    exits: { e: 'engineering_soc', s: 'trader_alley' },
  },
  trader_alley: {
    id: 'trader_alley', zone: 'town', name: "Traders' Alley", APPROXIMATE: true,
    desc: 'A fenced alley running south behind the society halls toward the Trader guild\'s north entrance.',
    exits: { n: 'alchemy_soc', s: 'dens_hall_trader_trader_alley_1' },
  },
  trader_shipment: {
    id: 'trader_shipment', zone: 'town', name: 'Shipment Center', APPROXIMATE: true,
    desc: 'The Trader guild\'s freight yard, where crates are weighed, sealed and consigned to the caravans.',
    exits: { e: 'dens_hall_trader_trader_shipment_1' }
  },
  hall_trader: {
    id: 'hall_trader', zone: 'town', name: 'Trader Guildhall', npcs: ['leader_trader'],
    desc: 'In west Crossing: a ledger room of polished wood and locked chests. The alley runs north to the society halls, and the south door opens by the Guard House.',
    exits: { n: 'dens_hall_trader_trader_alley_0', s: 'trader_south', w: 'dens_hall_trader_trader_shipment_0' },
  },
  guard_house: {
    id: 'guard_house', zone: 'town', name: 'Crossing Guard House', npcs: ['guard'],
    desc: 'The garrison house of the town watch, one room west of the Trader guild\'s south entrance. Boots ring on the drill yard behind it.',
    exits: { e: 'trader_south' },
  },
  trader_south: {
    id: 'trader_south', zone: 'town', name: "Traders' Guild, South Door",
    desc: 'The south entrance of the Trader guild, one room east of the Guard House. Wagons load beneath a wide timber canopy.',
    exits: { w: 'guard_house', n: 'hall_trader' },
  },

  // ---------- Far west riverbank: ranger/cleric/moonmage/necromancer quarter
  oxenwaithe_road: {
    id: 'oxenwaithe_road', zone: 'town', name: 'Oxenwaithe Road', APPROXIMATE: true,
    desc: 'The road follows the riverbank upstream, quiet under old willows, away from the bustle of the bridge.',
    exits: { se: 'oxenwaithe_bridge', w: 'dens_hall_moonmage_oxenwaithe_road_1' },
  },
  hall_moonmage: {
    id: 'hall_moonmage', zone: 'town', name: 'Moon Mage Guildhall', npcs: ['leader_moonmage'], APPROXIMATE: true,
    desc: 'A domed observatory open to the sky. Constellations are charted across the ceiling in silver.',
    exits: { e: 'dens_hall_moonmage_oxenwaithe_road_0', w: 'dens_hall_moonmage_hall_ranger_0' },
  },
  hall_ranger: {
    id: 'hall_ranger', zone: 'town', name: 'Ranger Guildhall', npcs: ['leader_ranger'], APPROXIMATE: true,
    desc: 'Living branches form the walls in northwest Crossing. Hounds doze by a great hearth, and the ceiling is a canopy of leaves. Pine Needle Path leads into the Wilds from the hall.',
    exits: { e: 'dens_hall_moonmage_hall_ranger_1', n: 'pine_needle_path', s: 'dens_hall_cleric_hall_ranger_1' },
  },
  pine_needle_path: {
    id: 'pine_needle_path', zone: 'wilds', name: 'Pine Needle Path', APPROXIMATE: true,
    desc: 'A soft path of fallen needles winding out of the Ranger guild grounds into the deep woods.',
    exits: { s: 'hall_ranger', nw: 'woods_1' },
  },
  hall_necromancer: {
    id: 'hall_necromancer', zone: 'town', name: 'Necromancer Guildhall', npcs: ['leader_necromancer'], APPROXIMATE: true,
    desc: 'A cold, quiet hall of dark marble. Candle flames burn with an odd, steady stillness.',
    exits: { w: 'dens_hall_cleric_hall_necromancer_1' },
  },
  // The Thieves' Guild is intentionally hidden in DR (urchin guides omit it);
  // we place an unmarked door off the far-west quarter. APPROXIMATE position.
  hall_thief: {
    id: 'hall_thief', zone: 'town', name: 'Thieves\' Guildhall', npcs: ['leader_thief'], APPROXIMATE: true,
    desc: 'An unremarkable tenement door opens onto a den of quiet shadows and muffled counting.',
    exits: { e: 'dens_hall_cleric_hall_thief_1' },
  },

  hall_cleric: {
    id: 'hall_cleric', zone: 'town', name: 'Cleric Guildhall', npcs: ['leader_cleric'], APPROXIMATE: true,
    desc: 'In the far northwest of Crossing: a hall of incense and candlelight, its walls painted with the stories of the gods. Soft hymns echo from a chapel beyond.',
    exits: { n: 'dens_hall_cleric_hall_ranger_0', w: 'dens_hall_cleric_hall_thief_0', e: 'dens_hall_cleric_hall_necromancer_0' },
  },

  // ================= HUNTING GROUNDS =================
  sewers_1: {
    id: 'sewers_1', zone: 'sewers', name: 'Sewer Entrance', spawns: ['rat', 'rat'],
    desc: 'Cold water drips in the dark. A grate of rusted iron lets light fall in thin stripes. You can hear skittering in the tunnels ahead.',
    exits: { up: 'temple_row', n: 'sewers_2' },
  },
  sewers_2: {
    id: 'sewers_2', zone: 'sewers', name: 'Sewer Junction', spawns: ['rat', 'silverfish'],
    desc: 'Tunnels meet here in a foul pool of runoff. Red eyes gleam at the edges of your light.',
    exits: { s: 'sewers_1', n: 'sewers_3' },
  },
  sewers_3: {
    id: 'sewers_3', zone: 'sewers', name: 'Kobold Warrens', spawns: ['kobold', 'silverfish', 'rat'],
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
    id: 'woods_path', zone: 'woods', name: 'Siergelde Road', spawns: ['goblin', 'marsh_hog'],
    desc: 'A rutted trail winds between towering pines toward the Siergelde Ruins. Shadows flicker between the trunks, and the mud is churned where hogs root for mast. A rough track climbs into the southern hills.',
    exits: { n: 'trav_grove_15', s: 'woods_1', e: 'camp_path' },
  },
  woods_1: {
    id: 'woods_1', zone: 'woods', name: 'Clearing', spawns: ['goblin', 'goblin', 'wolf'],
    desc: 'A mossy clearing ringed by ancient oaks. The canopy cuts the light into dapples. A cart track heads west toward the river ferry.',
    exits: { n: 'woods_path', s: 'woods_2', w: 'rh_ferry', se: 'pine_needle_path' },
  },
  woods_2: {
    id: 'woods_2', zone: 'woods', name: 'Wolf Dens', spawns: ['wolf', 'wolf'],
    desc: 'The ground is scored with claw marks. A distant howl rises and falls in the wind.',
    exits: { n: 'woods_1', s: 'deep_1' },
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
    id: 'deep_1', zone: 'deepwoods', name: 'Deep Wood', spawns: ['marsh_hog', 'troll'],
    desc: 'The oaks here are vast and dark, their roots older than the town. Hog-rooted mud pocks the shadowline where the big things begin. Something heavy breathes nearby.',
    exits: { n: 'woods_2', e: 'deep_2' },
  },
  deep_2: {
    id: 'deep_2', zone: 'deepwoods', name: 'Troll Mounds', spawns: ['troll', 'shadowpaw'],
    desc: 'Great mounds of earth and broken stone heave under moss. The trolls den here. A dark path leads east into ruins.',
    exits: { w: 'deep_1', e: 'black_1' },
  },

  // ================ BANDIT CAMP ================
  camp_path: {
    id: 'camp_path', zone: 'camp', name: 'Camp Trail', spawns: ['bandit'],
    desc: 'A rough track climbs into scrubby hills. Faint voices and the smell of smoke carry on the wind.',
    exits: { w: 'woods_path', e: 'camp_hollow' },
  },
  camp_hollow: {
    id: 'camp_hollow', zone: 'camp', name: 'Bandit Hollow', spawns: ['bandit', 'bandit'],
    desc: 'A trampled hollow ringed by tents of patched hide. A great fire gutters in the center.',
    exits: { w: 'camp_path', n: 'camp_den' },
  },
  camp_den: {
    id: 'camp_den', zone: 'camp', name: 'Captain\'s Den', spawns: ['bandit_captain', 'bandit_chieftain'],
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
    id: 'cinder_2', zone: 'cinder', name: 'Cinder Gorge', spawns: ['cinder_lizard', 'fire_drake', 'cinder_drake_king'],
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

  // ================ RIVERHAVEN (second starting city; own grid space) ====
  rh_square: {
    id: 'rh_square', zone: 'riverhaven', name: 'Riverhaven Town Square', npcs: ['towncrier'],
    desc: 'A broad square of red cobbles by the river. Fishing boats bob at the piers, gulls wheel overhead, and the smells of river mud and woodsmoke fill the air. Streets lead off in every direction.',
    exits: { e: 'rh_market', s: 'rh_temple', w: 'rh_guilds', n: 'rh_ferry' },
  },
  rh_market: {
    id: 'rh_market', zone: 'riverhaven', name: 'Riverside Market', npcs: ['shopkeeper', 'weaponsmith', 'armorer', 'quartermaster', 'banker'],
    desc: 'A lively market along the waterfront. Carts of fish, cloth, and iron crowd the cobbles, and the bank stands behind a bronze door.',
    exits: { w: 'rh_square', n: 'rh_enchanting', e: 'rh_noble_inn' },
  },
  rh_temple: {
    id: 'rh_temple', zone: 'riverhaven', name: 'Harbor Shrine', npcs: ['healer'],
    desc: 'A small shrine where sailors light candles before sailing. Sister Cora tends the wounded under a painted sky.',
    exits: { n: 'rh_square', s: 'rh_temple_garden' },
  },
  rh_guilds: {
    id: 'rh_guilds', zone: 'riverhaven', name: 'Guild Hall Row',
    desc: 'Eleven guildhalls face the river, their banners snapping in the wind. Trainers of every order hold court on the steps.',
    npcs: [
      'leader_barbarian', 'leader_bard', 'leader_cleric', 'leader_empath', 'leader_moonmage',
      'leader_necromancer', 'leader_paladin', 'leader_ranger', 'leader_thief', 'leader_trader', 'leader_warmage',
    ],
    exits: { e: 'rh_square', w: 'rh_hall_barbarian', n: 'rh_academy', s: 'rh_hall_bard', nw: 'rh_hall_cleric', ne: 'rh_hall_empath', sw: 'rh_hall_moonmage' },
  },
  bank_plaza_e: {
    id: 'bank_plaza_e', zone: 'town', name: 'Bank Court East',
    desc: 'The court continues east of the bank, lined with smithys and the ring of anvils.',
    exits: { w: 'bank_plaza', e: 'catrox_forge' },
  },
  catrox_forge: {
    id: 'catrox_forge', zone: 'town', name: "Catrox's Forge",
    desc: 'The rush of the street gives way to the roar of the bellows. Part of the hurry here is generated by Catrox\'s Forge, where hammer meets steel from dawn to dusk.',
    exits: { w: 'bank_plaza_e' },
  },

  rh_enchanting: {
    id: 'rh_enchanting', zone: 'riverhaven', name: 'Enchanting Society',
    desc: 'A hall humming with contained mana. Enchanted trinkets rest on warded shelves, and a society clerk notes arrivals without looking up.',
    exits: { s: 'rh_market' },
  },
  rh_noble_inn: {
    id: 'rh_noble_inn', zone: 'riverhaven', name: 'The Noble Inn', tavern: true,
    desc: "A well-kept inn of dark river timber. A side room serves as the local Paladin office — Remen keeps the ledgers there — and the hearth never seems to cool.",
    exits: { w: 'rh_market' },
  },
  rh_temple_garden: {
    id: 'rh_temple_garden', zone: 'riverhaven', name: 'Temple Garden',
    desc: 'Behind the temple, a walled garden of herbs and memorial stones. The resurrection altar stands at its center, evergreen despite the season.',
    exits: { n: 'rh_temple' },
  },
  rh_academy: {
    id: 'rh_academy', zone: 'riverhaven', name: 'Dance Academy',
    desc: 'A polished floor rings with the steps of students. Mirrors of polished silver line one wall, and an instructor counts time at the front of the room.',
    exits: { s: 'rh_guilds' },
  },
  rh_hall_barbarian: {
    id: 'rh_hall_barbarian', zone: 'riverhaven', name: 'Barbarian Guildhall', npcs: ['leader_barbarian'],
    desc: "Mo Glawroak's hall: a Gor'Tog fortress of a building hung with axes and the open-hand crest above a clenched gauntlet. The register for blunt ranks lies open on a scarred table.",
    exits: { e: 'rh_guilds' },
  },
  rh_hall_bard: {
    id: 'rh_hall_bard', zone: 'riverhaven', name: 'Bard Guildhall',
    desc: "Rebuilt tall upon the ashes of its predecessor, the bards' river hall rings with rehearsal. Balconies overlook the main stage from every side.",
    exits: { n: 'rh_guilds' },
  },
  rh_hall_cleric: {
    id: 'rh_hall_cleric', zone: 'riverhaven', name: 'Cleric Guildhall',
    desc: "Guildmistress Jelna Sarik's quiet hall of candles and carved gods. The air smells of incense and old stone.",
    exits: { se: 'rh_guilds' },
  },
  rh_hall_empath: {
    id: 'rh_hall_empath', zone: 'riverhaven', name: 'Empath Guildhall', npcs: ['leader_empath'],
    desc: 'Nebela Mentrade keeps a calm infirmary-hall of clean linens and murmured comfort, the empath crest carved over the hearth.',
    exits: { sw: 'rh_guilds' },
  },
  rh_hall_moonmage: {
    id: 'rh_hall_moonmage', zone: 'riverhaven', name: 'Moon Mage Guildhall',
    desc: "A tower of river stone with a crow's nest observatory. Gylwyn watches the sky from the top; star charts paper the lower room.",
    exits: { ne: 'rh_guilds' },
  },

  rh_ferry: {
    id: 'rh_ferry', zone: 'riverhaven', name: 'The River Ferry',
    desc: 'A stout ferry moors here, its bell ringing across the water. A dirt road winds east from the landing into the wild woods, and reed-choked shallows stretch away north.',
    exits: { e: 'woods_1', sw: 'rh_wilds_1', s: 'rh_square', w: 'neh_dock' },
  },
  rh_wilds_1: {
    id: 'rh_wilds_1', zone: 'riverhaven', name: 'Reedwater Shore', spawns: ['mud_crab', 'mud_crab', 'marsh_hog'],
    desc: 'Muddy shallows lap at a shore of broken reeds. Crab tracks stitch the mud in neat, deliberate lines, and the river breathes cool fog over everything. Tusk-rutted mud trails off toward the sedge.',
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

  dens_square_tg_n_0: {
    id: 'dens_square_tg_n_0', zone: 'town', name: 'Square North Way',
    desc: 'The street runs straight between close-built tenements; laundry lines sag overhead and the cobbles are worn smooth by cart traffic.',
    exits: { n: 'dens_square_tg_n_1', s: 'square' },
  },
  dens_square_tg_n_1: {
    id: 'dens_square_tg_n_1', zone: 'town', name: 'Square North Way, Second House',
    desc: 'Shopfronts give way to shuttered windows here. The smell of baking bread drifts from somewhere unseen.',
    exits: { n: 'tg_n', s: 'dens_square_tg_n_0' },
  },
  dens_square_tg_ne_0: {
    id: 'dens_square_tg_ne_0', zone: 'town', name: 'Square Northeast Way',
    desc: 'Shopfronts give way to shuttered windows here. The smell of baking bread drifts from somewhere unseen.',
    exits: { ne: 'dens_square_tg_ne_1', sw: 'square' },
  },
  dens_square_tg_ne_1: {
    id: 'dens_square_tg_ne_1', zone: 'town', name: 'Square Northeast Way, Second House',
    desc: 'A narrow drain runs down the middle of the lane. The buildings lean inward overhead, nearly touching.',
    exits: { ne: 'tg_ne', sw: 'dens_square_tg_ne_0' },
  },
  dens_square_tg_e_0: {
    id: 'dens_square_tg_e_0', zone: 'town', name: 'Square East Way',
    desc: 'A narrow drain runs down the middle of the lane. The buildings lean inward overhead, nearly touching.',
    exits: { e: 'dens_square_tg_e_1', w: 'square' },
  },
  dens_square_tg_e_1: {
    id: 'dens_square_tg_e_1', zone: 'town', name: 'Square East Way, Second House',
    desc: 'The crowd thins on this stretch. A busker\'s upturned cap lies empty at the base of a rain barrel.',
    exits: { e: 'tg_e', w: 'dens_square_tg_e_0' },
  },
  dens_square_tg_se_0: {
    id: 'dens_square_tg_se_0', zone: 'town', name: 'Square Southeast Way',
    desc: 'The crowd thins on this stretch. A busker\'s upturned cap lies empty at the base of a rain barrel.',
    exits: { se: 'dens_square_tg_se_1', nw: 'square' },
  },
  dens_square_tg_se_1: {
    id: 'dens_square_tg_se_1', zone: 'town', name: 'Square Southeast Way, Second House',
    desc: 'The street runs straight between close-built tenements; laundry lines sag overhead and the cobbles are worn smooth by cart traffic.',
    exits: { se: 'tg_se', nw: 'dens_square_tg_se_0' },
  },
  dens_square_tg_s_0: {
    id: 'dens_square_tg_s_0', zone: 'town', name: 'Square South Way',
    desc: 'The street runs straight between close-built tenements; laundry lines sag overhead and the cobbles are worn smooth by cart traffic.',
    exits: { s: 'dens_square_tg_s_1', n: 'square' },
  },
  dens_square_tg_s_1: {
    id: 'dens_square_tg_s_1', zone: 'town', name: 'Square South Way, Second House',
    desc: 'Shopfronts give way to shuttered windows here. The smell of baking bread drifts from somewhere unseen.',
    exits: { s: 'tg_s', n: 'dens_square_tg_s_0' },
  },
  dens_square_tg_sw_0: {
    id: 'dens_square_tg_sw_0', zone: 'town', name: 'Square Southwest Way',
    desc: 'Shopfronts give way to shuttered windows here. The smell of baking bread drifts from somewhere unseen.',
    exits: { sw: 'dens_square_tg_sw_1', ne: 'square' },
  },
  dens_square_tg_sw_1: {
    id: 'dens_square_tg_sw_1', zone: 'town', name: 'Square Southwest Way, Second House',
    desc: 'A narrow drain runs down the middle of the lane. The buildings lean inward overhead, nearly touching.',
    exits: { sw: 'tg_sw', ne: 'dens_square_tg_sw_0' },
  },
  dens_square_tg_w_0: {
    id: 'dens_square_tg_w_0', zone: 'town', name: 'Square West Way',
    desc: 'A narrow drain runs down the middle of the lane. The buildings lean inward overhead, nearly touching.',
    exits: { w: 'dens_square_tg_w_1', e: 'square' },
  },
  dens_square_tg_w_1: {
    id: 'dens_square_tg_w_1', zone: 'town', name: 'Square West Way, Second House',
    desc: 'The crowd thins on this stretch. A busker\'s upturned cap lies empty at the base of a rain barrel.',
    exits: { w: 'tg_w', e: 'dens_square_tg_w_0' },
  },
  dens_square_tg_nw_0: {
    id: 'dens_square_tg_nw_0', zone: 'town', name: 'Square Northwest Way',
    desc: 'The crowd thins on this stretch. A busker\'s upturned cap lies empty at the base of a rain barrel.',
    exits: { nw: 'dens_square_tg_nw_1', se: 'square' },
  },
  dens_square_tg_nw_1: {
    id: 'dens_square_tg_nw_1', zone: 'town', name: 'Square Northwest Way, Second House',
    desc: 'The street runs straight between close-built tenements; laundry lines sag overhead and the cobbles are worn smooth by cart traffic.',
    exits: { nw: 'tg_nw', se: 'dens_square_tg_nw_0' },
  },
  dens_guild_district_tg_w_0: {
    id: 'dens_guild_district_tg_w_0', zone: 'town', name: 'Guild District West Way',
    desc: 'The street runs straight between close-built tenements; laundry lines sag overhead and the cobbles are worn smooth by cart traffic.',
    exits: { e: 'dens_guild_district_tg_w_1', w: 'guild_district' },
  },
  dens_guild_district_tg_w_1: {
    id: 'dens_guild_district_tg_w_1', zone: 'town', name: 'Guild District West Way, Second House',
    desc: 'Shopfronts give way to shuttered windows here. The smell of baking bread drifts from somewhere unseen.',
    exits: { e: 'tg_w', w: 'dens_guild_district_tg_w_0' },
  },
  dens_tailor_shop_west_road_0: {
    id: 'dens_tailor_shop_west_road_0', zone: 'town', name: 'Tailor Shop West Road Path',
    desc: 'Shopfronts give way to shuttered windows here. The smell of baking bread drifts from somewhere unseen.',
    exits: { s: 'dens_tailor_shop_west_road_1', n: 'tailor_shop' },
  },
  dens_tailor_shop_west_road_1: {
    id: 'dens_tailor_shop_west_road_1', zone: 'town', name: 'Tailor Shop West Road Path, Second House',
    desc: 'A narrow drain runs down the middle of the lane. The buildings lean inward overhead, nearly touching.',
    exits: { s: 'west_road', n: 'dens_tailor_shop_west_road_0' },
  },
  dens_bards_walk_tg_w_0: {
    id: 'dens_bards_walk_tg_w_0', zone: 'town', name: 'Bards\' Walk, West Way',
    desc: 'A narrow drain runs down the middle of the lane. The buildings lean inward overhead, nearly touching.',
    exits: { se: 'dens_bards_walk_tg_w_1', nw: 'bards_walk' },
  },
  dens_bards_walk_tg_w_1: {
    id: 'dens_bards_walk_tg_w_1', zone: 'town', name: 'Bards\' Walk, West Way, Second House',
    desc: 'The crowd thins on this stretch. A busker\'s upturned cap lies empty at the base of a rain barrel.',
    exits: { se: 'tg_w', nw: 'dens_bards_walk_tg_w_0' },
  },
  dens_bards_walk_music_shop_0: {
    id: 'dens_bards_walk_music_shop_0', zone: 'town', name: 'Bards\' Walk Music Shop Path',
    desc: 'The crowd thins on this stretch. A busker\'s upturned cap lies empty at the base of a rain barrel.',
    exits: { e: 'dens_bards_walk_music_shop_1', w: 'bards_walk' },
  },
  dens_bards_walk_music_shop_1: {
    id: 'dens_bards_walk_music_shop_1', zone: 'town', name: 'Bards\' Walk Music Shop Path, Second House',
    desc: 'The street runs straight between close-built tenements; laundry lines sag overhead and the cobbles are worn smooth by cart traffic.',
    exits: { e: 'music_shop', w: 'dens_bards_walk_music_shop_0' },
  },
  dens_tg_n_tg_ne_0: {
    id: 'dens_tg_n_tg_ne_0', zone: 'town', name: 'Town Green North, Northeast Way',
    desc: 'The street runs straight between close-built tenements; laundry lines sag overhead and the cobbles are worn smooth by cart traffic.',
    exits: { e: 'dens_tg_n_tg_ne_1', w: 'tg_n' },
  },
  dens_tg_n_tg_ne_1: {
    id: 'dens_tg_n_tg_ne_1', zone: 'town', name: 'Town Green North, Northeast Way, Second House',
    desc: 'Shopfronts give way to shuttered windows here. The smell of baking bread drifts from somewhere unseen.',
    exits: { e: 'tg_ne', w: 'dens_tg_n_tg_ne_0' },
  },
  dens_tg_n_tg_nw_0: {
    id: 'dens_tg_n_tg_nw_0', zone: 'town', name: 'Town Green North, Northwest Way',
    desc: 'Shopfronts give way to shuttered windows here. The smell of baking bread drifts from somewhere unseen.',
    exits: { w: 'dens_tg_n_tg_nw_1', e: 'tg_n' },
  },
  dens_tg_n_tg_nw_1: {
    id: 'dens_tg_n_tg_nw_1', zone: 'town', name: 'Town Green North, Northwest Way, Second House',
    desc: 'A narrow drain runs down the middle of the lane. The buildings lean inward overhead, nearly touching.',
    exits: { w: 'tg_nw', e: 'dens_tg_n_tg_nw_0' },
  },
  dens_north_road_tg_n_0: {
    id: 'dens_north_road_tg_n_0', zone: 'town', name: 'North Road North Way',
    desc: 'A narrow drain runs down the middle of the lane. The buildings lean inward overhead, nearly touching.',
    exits: { s: 'dens_north_road_tg_n_1', n: 'north_road' },
  },
  dens_north_road_tg_n_1: {
    id: 'dens_north_road_tg_n_1', zone: 'town', name: 'North Road North Way, Second House',
    desc: 'The crowd thins on this stretch. A busker\'s upturned cap lies empty at the base of a rain barrel.',
    exits: { s: 'tg_n', n: 'dens_north_road_tg_n_0' },
  },
  dens_tg_nw_tg_w_0: {
    id: 'dens_tg_nw_tg_w_0', zone: 'town', name: 'Northwest Way',
    desc: 'The crowd thins on this stretch. A busker\'s upturned cap lies empty at the base of a rain barrel.',
    exits: { s: 'dens_tg_nw_tg_w_1', n: 'tg_nw' },
  },
  dens_tg_nw_tg_w_1: {
    id: 'dens_tg_nw_tg_w_1', zone: 'town', name: 'Northwest Way, Second House',
    desc: 'The street runs straight between close-built tenements; laundry lines sag overhead and the cobbles are worn smooth by cart traffic.',
    exits: { s: 'tg_w', n: 'dens_tg_nw_tg_w_0' },
  },
  dens_festival_way_tg_nw_0: {
    id: 'dens_festival_way_tg_nw_0', zone: 'town', name: 'Festival Way Northwest Way',
    desc: 'The street runs straight between close-built tenements; laundry lines sag overhead and the cobbles are worn smooth by cart traffic.',
    exits: { e: 'dens_festival_way_tg_nw_1', w: 'festival_way' },
  },
  dens_festival_way_tg_nw_1: {
    id: 'dens_festival_way_tg_nw_1', zone: 'town', name: 'Festival Way Northwest Way, Second House',
    desc: 'Shopfronts give way to shuttered windows here. The smell of baking bread drifts from somewhere unseen.',
    exits: { e: 'tg_nw', w: 'dens_festival_way_tg_nw_0' },
  },
  dens_nw_road_tg_nw_0: {
    id: 'dens_nw_road_tg_nw_0', zone: 'town', name: 'Nw Road Northwest Way',
    desc: 'Shopfronts give way to shuttered windows here. The smell of baking bread drifts from somewhere unseen.',
    exits: { s: 'dens_nw_road_tg_nw_1', n: 'nw_road' },
  },
  dens_nw_road_tg_nw_1: {
    id: 'dens_nw_road_tg_nw_1', zone: 'town', name: 'Nw Road Northwest Way, Second House',
    desc: 'A narrow drain runs down the middle of the lane. The buildings lean inward overhead, nearly touching.',
    exits: { s: 'tg_nw', n: 'dens_nw_road_tg_nw_0' },
  },
  dens_high_temple_temple_0: {
    id: 'dens_high_temple_temple_0', zone: 'town', name: 'High Temple Temple Path',
    desc: 'A narrow drain runs down the middle of the lane. The buildings lean inward overhead, nearly touching.',
    exits: { s: 'dens_high_temple_temple_1', n: 'high_temple' },
  },
  dens_high_temple_temple_1: {
    id: 'dens_high_temple_temple_1', zone: 'town', name: 'High Temple Temple Path, Second House',
    desc: 'The crowd thins on this stretch. A busker\'s upturned cap lies empty at the base of a rain barrel.',
    exits: { s: 'temple', n: 'dens_high_temple_temple_0' },
  },
  dens_high_temple_immortals_approach_0: {
    id: 'dens_high_temple_immortals_approach_0', zone: 'town', name: 'High Temple Immortals Approach Path',
    desc: 'The crowd thins on this stretch. A busker\'s upturned cap lies empty at the base of a rain barrel.',
    exits: { n: 'dens_high_temple_immortals_approach_1', s: 'high_temple' },
  },
  dens_high_temple_immortals_approach_1: {
    id: 'dens_high_temple_immortals_approach_1', zone: 'town', name: 'High Temple Immortals Approach Path, Second House',
    desc: 'The street runs straight between close-built tenements; laundry lines sag overhead and the cobbles are worn smooth by cart traffic.',
    exits: { n: 'immortals_approach', s: 'dens_high_temple_immortals_approach_0' },
  },
  dens_ne_road_tg_ne_0: {
    id: 'dens_ne_road_tg_ne_0', zone: 'town', name: 'Ne Road Northeast Way',
    desc: 'The street runs straight between close-built tenements; laundry lines sag overhead and the cobbles are worn smooth by cart traffic.',
    exits: { w: 'dens_ne_road_tg_ne_1', e: 'ne_road' },
  },
  dens_ne_road_tg_ne_1: {
    id: 'dens_ne_road_tg_ne_1', zone: 'town', name: 'Ne Road Northeast Way, Second House',
    desc: 'Shopfronts give way to shuttered windows here. The smell of baking bread drifts from somewhere unseen.',
    exits: { w: 'tg_ne', e: 'dens_ne_road_tg_ne_0' },
  },
  dens_wm_path_wm_road_0: {
    id: 'dens_wm_path_wm_road_0', zone: 'town', name: 'Wm Path Wm Road Path',
    desc: 'Shopfronts give way to shuttered windows here. The smell of baking bread drifts from somewhere unseen.',
    exits: { e: 'dens_wm_path_wm_road_1', w: 'wm_path' },
  },
  dens_wm_path_wm_road_1: {
    id: 'dens_wm_path_wm_road_1', zone: 'town', name: 'Wm Path Wm Road Path, Second House',
    desc: 'A narrow drain runs down the middle of the lane. The buildings lean inward overhead, nearly touching.',
    exits: { e: 'wm_road', w: 'dens_wm_path_wm_road_0' },
  },
  dens_hall_warmage_wm_road_0: {
    id: 'dens_hall_warmage_wm_road_0', zone: 'town', name: 'Hall Warmage Wm Road Path',
    desc: 'A narrow drain runs down the middle of the lane. The buildings lean inward overhead, nearly touching.',
    exits: { w: 'dens_hall_warmage_wm_road_1', e: 'hall_warmage' },
  },
  dens_hall_warmage_wm_road_1: {
    id: 'dens_hall_warmage_wm_road_1', zone: 'town', name: 'Hall Warmage Wm Road Path, Second House',
    desc: 'The crowd thins on this stretch. A busker\'s upturned cap lies empty at the base of a rain barrel.',
    exits: { w: 'wm_road', e: 'dens_hall_warmage_wm_road_0' },
  },
  dens_tg_e_tg_ne_0: {
    id: 'dens_tg_e_tg_ne_0', zone: 'town', name: 'Town Green East, Northeast Way',
    desc: 'The crowd thins on this stretch. A busker\'s upturned cap lies empty at the base of a rain barrel.',
    exits: { n: 'dens_tg_e_tg_ne_1', s: 'tg_e' },
  },
  dens_tg_e_tg_ne_1: {
    id: 'dens_tg_e_tg_ne_1', zone: 'town', name: 'Town Green East, Northeast Way, Second House',
    desc: 'The street runs straight between close-built tenements; laundry lines sag overhead and the cobbles are worn smooth by cart traffic.',
    exits: { n: 'tg_ne', s: 'dens_tg_e_tg_ne_0' },
  },
  dens_tg_e_tg_se_0: {
    id: 'dens_tg_e_tg_se_0', zone: 'town', name: 'Town Green East, Southeast Way',
    desc: 'The street runs straight between close-built tenements; laundry lines sag overhead and the cobbles are worn smooth by cart traffic.',
    exits: { s: 'dens_tg_e_tg_se_1', n: 'tg_e' },
  },
  dens_tg_e_tg_se_1: {
    id: 'dens_tg_e_tg_se_1', zone: 'town', name: 'Town Green East, Southeast Way, Second House',
    desc: 'Shopfronts give way to shuttered windows here. The smell of baking bread drifts from somewhere unseen.',
    exits: { s: 'tg_se', n: 'dens_tg_e_tg_se_0' },
  },
  dens_bazaar_tg_e_0: {
    id: 'dens_bazaar_tg_e_0', zone: 'town', name: 'Bazaar East Way',
    desc: 'Shopfronts give way to shuttered windows here. The smell of baking bread drifts from somewhere unseen.',
    exits: { w: 'dens_bazaar_tg_e_1', e: 'bazaar' },
  },
  dens_bazaar_tg_e_1: {
    id: 'dens_bazaar_tg_e_1', zone: 'town', name: 'Bazaar East Way, Second House',
    desc: 'A narrow drain runs down the middle of the lane. The buildings lean inward overhead, nearly touching.',
    exits: { w: 'tg_e', e: 'dens_bazaar_tg_e_0' },
  },
  dens_bazaar_market_way_0: {
    id: 'dens_bazaar_market_way_0', zone: 'town', name: 'Bazaar Market Way Path',
    desc: 'A narrow drain runs down the middle of the lane. The buildings lean inward overhead, nearly touching.',
    exits: { e: 'dens_bazaar_market_way_1', w: 'bazaar' },
  },
  dens_bazaar_market_way_1: {
    id: 'dens_bazaar_market_way_1', zone: 'town', name: 'Bazaar Market Way Path, Second House',
    desc: 'The crowd thins on this stretch. A busker\'s upturned cap lies empty at the base of a rain barrel.',
    exits: { e: 'market_way', w: 'dens_bazaar_market_way_0' },
  },
  dens_brewery_market_way_0: {
    id: 'dens_brewery_market_way_0', zone: 'town', name: 'Brewery Market Way Path',
    desc: 'The crowd thins on this stretch. A busker\'s upturned cap lies empty at the base of a rain barrel.',
    exits: { s: 'dens_brewery_market_way_1', n: 'brewery' },
  },
  dens_brewery_market_way_1: {
    id: 'dens_brewery_market_way_1', zone: 'town', name: 'Brewery Market Way Path, Second House',
    desc: 'The street runs straight between close-built tenements; laundry lines sag overhead and the cobbles are worn smooth by cart traffic.',
    exits: { s: 'market_way', n: 'dens_brewery_market_way_0' },
  },
  dens_brewery_forge_0: {
    id: 'dens_brewery_forge_0', zone: 'town', name: 'Brewery Forge Path',
    desc: 'The street runs straight between close-built tenements; laundry lines sag overhead and the cobbles are worn smooth by cart traffic.',
    exits: { e: 'dens_brewery_forge_1', w: 'brewery' },
  },
  dens_brewery_forge_1: {
    id: 'dens_brewery_forge_1', zone: 'town', name: 'Brewery Forge Path, Second House',
    desc: 'Shopfronts give way to shuttered windows here. The smell of baking bread drifts from somewhere unseen.',
    exits: { e: 'forge', w: 'dens_brewery_forge_0' },
  },
  dens_forge_row_market_way_0: {
    id: 'dens_forge_row_market_way_0', zone: 'town', name: 'Forge Row Market Way Path',
    desc: 'Shopfronts give way to shuttered windows here. The smell of baking bread drifts from somewhere unseen.',
    exits: { n: 'dens_forge_row_market_way_1', s: 'forge_row' },
  },
  dens_forge_row_market_way_1: {
    id: 'dens_forge_row_market_way_1', zone: 'town', name: 'Forge Row Market Way Path, Second House',
    desc: 'A narrow drain runs down the middle of the lane. The buildings lean inward overhead, nearly touching.',
    exits: { n: 'market_way', s: 'dens_forge_row_market_way_0' },
  },
  dens_auction_house_forge_row_0: {
    id: 'dens_auction_house_forge_row_0', zone: 'town', name: 'Auction House Forge Row Path',
    desc: 'A narrow drain runs down the middle of the lane. The buildings lean inward overhead, nearly touching.',
    exits: { n: 'dens_auction_house_forge_row_1', s: 'auction_house' },
  },
  dens_auction_house_forge_row_1: {
    id: 'dens_auction_house_forge_row_1', zone: 'town', name: 'Auction House Forge Row Path, Second House',
    desc: 'The crowd thins on this stretch. A busker\'s upturned cap lies empty at the base of a rain barrel.',
    exits: { n: 'forge_row', s: 'dens_auction_house_forge_row_0' },
  },
  dens_auction_house_commodity_pit_0: {
    id: 'dens_auction_house_commodity_pit_0', zone: 'town', name: 'Auction House Commodity Pit Path',
    desc: 'The crowd thins on this stretch. A busker\'s upturned cap lies empty at the base of a rain barrel.',
    exits: { se: 'dens_auction_house_commodity_pit_1', nw: 'auction_house' },
  },
  dens_auction_house_commodity_pit_1: {
    id: 'dens_auction_house_commodity_pit_1', zone: 'town', name: 'Auction House Commodity Pit Path, Second House',
    desc: 'The street runs straight between close-built tenements; laundry lines sag overhead and the cobbles are worn smooth by cart traffic.',
    exits: { se: 'commodity_pit', nw: 'dens_auction_house_commodity_pit_0' },
  },
  dens_east_road_tg_se_0: {
    id: 'dens_east_road_tg_se_0', zone: 'town', name: 'East Road Southeast Way',
    desc: 'The street runs straight between close-built tenements; laundry lines sag overhead and the cobbles are worn smooth by cart traffic.',
    exits: { e: 'east_road', w: 'dens_east_road_tg_se_1' },
  },
  dens_east_road_tg_se_1: {
    id: 'dens_east_road_tg_se_1', zone: 'town', name: 'East Road Southeast Way, Second House',
    desc: 'Shopfronts give way to shuttered windows here. The smell of baking bread drifts from somewhere unseen.',
    exits: { e: 'dens_east_road_tg_se_0', w: 'tg_se' },
  },
  dens_crofton_walk_smithy_lane_0: {
    id: 'dens_crofton_walk_smithy_lane_0', zone: 'town', name: 'Crofton Walk Smithy Lane Path',
    desc: 'Shopfronts give way to shuttered windows here. The smell of baking bread drifts from somewhere unseen.',
    exits: { s: 'dens_crofton_walk_smithy_lane_1', n: 'crofton_walk' },
  },
  dens_crofton_walk_smithy_lane_1: {
    id: 'dens_crofton_walk_smithy_lane_1', zone: 'town', name: 'Crofton Walk Smithy Lane Path, Second House',
    desc: 'A narrow drain runs down the middle of the lane. The buildings lean inward overhead, nearly touching.',
    exits: { s: 'smithy_lane', n: 'dens_crofton_walk_smithy_lane_0' },
  },
  dens_tg_s_tg_sw_0: {
    id: 'dens_tg_s_tg_sw_0', zone: 'town', name: 'Town Green South, Southwest Way',
    desc: 'A narrow drain runs down the middle of the lane. The buildings lean inward overhead, nearly touching.',
    exits: { w: 'dens_tg_s_tg_sw_1', e: 'tg_s' },
  },
  dens_tg_s_tg_sw_1: {
    id: 'dens_tg_s_tg_sw_1', zone: 'town', name: 'Town Green South, Southwest Way, Second House',
    desc: 'The crowd thins on this stretch. A busker\'s upturned cap lies empty at the base of a rain barrel.',
    exits: { w: 'tg_sw', e: 'dens_tg_s_tg_sw_0' },
  },
  dens_tg_s_tg_se_0: {
    id: 'dens_tg_s_tg_se_0', zone: 'town', name: 'Town Green South, Southeast Way',
    desc: 'The crowd thins on this stretch. A busker\'s upturned cap lies empty at the base of a rain barrel.',
    exits: { e: 'dens_tg_s_tg_se_1', w: 'tg_s' },
  },
  dens_tg_s_tg_se_1: {
    id: 'dens_tg_s_tg_se_1', zone: 'town', name: 'Town Green South, Southeast Way, Second House',
    desc: 'The street runs straight between close-built tenements; laundry lines sag overhead and the cobbles are worn smooth by cart traffic.',
    exits: { e: 'tg_se', w: 'dens_tg_s_tg_se_0' },
  },
  dens_stockyard_tg_s_0: {
    id: 'dens_stockyard_tg_s_0', zone: 'town', name: 'Stockyard South Way',
    desc: 'The street runs straight between close-built tenements; laundry lines sag overhead and the cobbles are worn smooth by cart traffic.',
    exits: { n: 'dens_stockyard_tg_s_1', s: 'stockyard' },
  },
  dens_stockyard_tg_s_1: {
    id: 'dens_stockyard_tg_s_1', zone: 'town', name: 'Stockyard South Way, Second House',
    desc: 'Shopfronts give way to shuttered windows here. The smell of baking bread drifts from somewhere unseen.',
    exits: { n: 'tg_s', s: 'dens_stockyard_tg_s_0' },
  },
  dens_stockyard_viper_nest_0: {
    id: 'dens_stockyard_viper_nest_0', zone: 'town', name: 'Stockyard Viper Nest Path',
    desc: 'Shopfronts give way to shuttered windows here. The smell of baking bread drifts from somewhere unseen.',
    exits: { e: 'dens_stockyard_viper_nest_1', w: 'stockyard' },
  },
  dens_stockyard_viper_nest_1: {
    id: 'dens_stockyard_viper_nest_1', zone: 'town', name: 'Stockyard Viper Nest Path, Second House',
    desc: 'A narrow drain runs down the middle of the lane. The buildings lean inward overhead, nearly touching.',
    exits: { e: 'viper_nest', w: 'dens_stockyard_viper_nest_0' },
  },
  dens_south_road_stockyard_0: {
    id: 'dens_south_road_stockyard_0', zone: 'town', name: 'South Road Stockyard Path',
    desc: 'A narrow drain runs down the middle of the lane. The buildings lean inward overhead, nearly touching.',
    exits: { n: 'dens_south_road_stockyard_1', s: 'south_road' },
  },
  dens_south_road_stockyard_1: {
    id: 'dens_south_road_stockyard_1', zone: 'town', name: 'South Road Stockyard Path, Second House',
    desc: 'The crowd thins on this stretch. A busker\'s upturned cap lies empty at the base of a rain barrel.',
    exits: { n: 'stockyard', s: 'dens_south_road_stockyard_0' },
  },
  dens_south_road_strand_0: {
    id: 'dens_south_road_strand_0', zone: 'town', name: 'South Road Strand Path',
    desc: 'The crowd thins on this stretch. A busker\'s upturned cap lies empty at the base of a rain barrel.',
    exits: { w: 'dens_south_road_strand_1', e: 'south_road' },
  },
  dens_south_road_strand_1: {
    id: 'dens_south_road_strand_1', zone: 'town', name: 'South Road Strand Path, Second House',
    desc: 'The street runs straight between close-built tenements; laundry lines sag overhead and the cobbles are worn smooth by cart traffic.',
    exits: { w: 'strand', e: 'dens_south_road_strand_0' },
  },
  dens_tg_sw_tg_w_0: {
    id: 'dens_tg_sw_tg_w_0', zone: 'town', name: 'Southwest Way',
    desc: 'The street runs straight between close-built tenements; laundry lines sag overhead and the cobbles are worn smooth by cart traffic.',
    exits: { n: 'dens_tg_sw_tg_w_1', s: 'tg_sw' },
  },
  dens_tg_sw_tg_w_1: {
    id: 'dens_tg_sw_tg_w_1', zone: 'town', name: 'Southwest Way, Second House',
    desc: 'Shopfronts give way to shuttered windows here. The smell of baking bread drifts from somewhere unseen.',
    exits: { n: 'tg_w', s: 'dens_tg_sw_tg_w_0' },
  },
  dens_sw_road_tg_sw_0: {
    id: 'dens_sw_road_tg_sw_0', zone: 'town', name: 'Sw Road Southwest Way',
    desc: 'Shopfronts give way to shuttered windows here. The smell of baking bread drifts from somewhere unseen.',
    exits: { n: 'dens_sw_road_tg_sw_1', s: 'sw_road' },
  },
  dens_sw_road_tg_sw_1: {
    id: 'dens_sw_road_tg_sw_1', zone: 'town', name: 'Sw Road Southwest Way, Second House',
    desc: 'A narrow drain runs down the middle of the lane. The buildings lean inward overhead, nearly touching.',
    exits: { n: 'tg_sw', s: 'dens_sw_road_tg_sw_0' },
  },
  dens_strand_sw_road_0: {
    id: 'dens_strand_sw_road_0', zone: 'town', name: 'Strand Sw Road Path',
    desc: 'A narrow drain runs down the middle of the lane. The buildings lean inward overhead, nearly touching.',
    exits: { n: 'dens_strand_sw_road_1', s: 'strand' },
  },
  dens_strand_sw_road_1: {
    id: 'dens_strand_sw_road_1', zone: 'town', name: 'Strand Sw Road Path, Second House',
    desc: 'The crowd thins on this stretch. A busker\'s upturned cap lies empty at the base of a rain barrel.',
    exits: { n: 'sw_road', s: 'dens_strand_sw_road_0' },
  },
  dens_strand_strand_communal_0: {
    id: 'dens_strand_strand_communal_0', zone: 'town', name: 'Strand Strand Communal Path',
    desc: 'The crowd thins on this stretch. A busker\'s upturned cap lies empty at the base of a rain barrel.',
    exits: { s: 'dens_strand_strand_communal_1', n: 'strand' },
  },
  dens_strand_strand_communal_1: {
    id: 'dens_strand_strand_communal_1', zone: 'town', name: 'Strand Strand Communal Path, Second House',
    desc: 'The street runs straight between close-built tenements; laundry lines sag overhead and the cobbles are worn smooth by cart traffic.',
    exits: { s: 'strand_communal', n: 'dens_strand_strand_communal_0' },
  },
  dens_river_portage_strand_0: {
    id: 'dens_river_portage_strand_0', zone: 'town', name: 'River Portage Strand Path',
    desc: 'The street runs straight between close-built tenements; laundry lines sag overhead and the cobbles are worn smooth by cart traffic.',
    exits: { e: 'dens_river_portage_strand_1', w: 'river_portage' },
  },
  dens_river_portage_strand_1: {
    id: 'dens_river_portage_strand_1', zone: 'town', name: 'River Portage Strand Path, Second House',
    desc: 'Shopfronts give way to shuttered windows here. The smell of baking bread drifts from somewhere unseen.',
    exits: { e: 'strand', w: 'dens_river_portage_strand_0' },
  },
  dens_river_portage_shardstar_office_0: {
    id: 'dens_river_portage_shardstar_office_0', zone: 'town', name: 'River Portage Shardstar Office Path',
    desc: 'Shopfronts give way to shuttered windows here. The smell of baking bread drifts from somewhere unseen.',
    exits: { w: 'dens_river_portage_shardstar_office_1', e: 'river_portage' },
  },
  dens_river_portage_shardstar_office_1: {
    id: 'dens_river_portage_shardstar_office_1', zone: 'town', name: 'River Portage Shardstar Office Path, Second House',
    desc: 'A narrow drain runs down the middle of the lane. The buildings lean inward overhead, nearly touching.',
    exits: { w: 'shardstar_office', e: 'dens_river_portage_shardstar_office_0' },
  },
  dens_segoltha_stair_strand_communal_0: {
    id: 'dens_segoltha_stair_strand_communal_0', zone: 'town', name: 'Segoltha Stair Strand Communal Path',
    desc: 'A narrow drain runs down the middle of the lane. The buildings lean inward overhead, nearly touching.',
    exits: { ne: 'dens_segoltha_stair_strand_communal_1', sw: 'segoltha_stair' },
  },
  dens_segoltha_stair_strand_communal_1: {
    id: 'dens_segoltha_stair_strand_communal_1', zone: 'town', name: 'Segoltha Stair Strand Communal Path, Second House',
    desc: 'The crowd thins on this stretch. A busker\'s upturned cap lies empty at the base of a rain barrel.',
    exits: { ne: 'strand_communal', sw: 'dens_segoltha_stair_strand_communal_0' },
  },
  dens_market_end_south_road_0: {
    id: 'dens_market_end_south_road_0', zone: 'town', name: 'Market End South Road Path',
    desc: 'The crowd thins on this stretch. A busker\'s upturned cap lies empty at the base of a rain barrel.',
    exits: { w: 'dens_market_end_south_road_1', e: 'market_end' },
  },
  dens_market_end_south_road_1: {
    id: 'dens_market_end_south_road_1', zone: 'town', name: 'Market End South Road Path, Second House',
    desc: 'The street runs straight between close-built tenements; laundry lines sag overhead and the cobbles are worn smooth by cart traffic.',
    exits: { w: 'south_road', e: 'dens_market_end_south_road_0' },
  },
  dens_market_end_sand_spit_0: {
    id: 'dens_market_end_sand_spit_0', zone: 'town', name: 'Market End Sand Spit Path',
    desc: 'The street runs straight between close-built tenements; laundry lines sag overhead and the cobbles are worn smooth by cart traffic.',
    exits: { e: 'dens_market_end_sand_spit_1', w: 'market_end' },
  },
  dens_market_end_sand_spit_1: {
    id: 'dens_market_end_sand_spit_1', zone: 'town', name: 'Market End Sand Spit Path, Second House',
    desc: 'Shopfronts give way to shuttered windows here. The smell of baking bread drifts from somewhere unseen.',
    exits: { e: 'sand_spit', w: 'dens_market_end_sand_spit_0' },
  },
  dens_docks_market_end_0: {
    id: 'dens_docks_market_end_0', zone: 'town', name: 'Docks Market End Path',
    desc: 'Shopfronts give way to shuttered windows here. The smell of baking bread drifts from somewhere unseen.',
    exits: { n: 'dens_docks_market_end_1', s: 'docks' },
  },
  dens_docks_market_end_1: {
    id: 'dens_docks_market_end_1', zone: 'town', name: 'Docks Market End Path, Second House',
    desc: 'A narrow drain runs down the middle of the lane. The buildings lean inward overhead, nearly touching.',
    exits: { n: 'market_end', s: 'dens_docks_market_end_0' },
  },
  dens_docks_pier_0: {
    id: 'dens_docks_pier_0', zone: 'town', name: 'Docks Pier Path',
    desc: 'A narrow drain runs down the middle of the lane. The buildings lean inward overhead, nearly touching.',
    exits: { s: 'dens_docks_pier_1', n: 'docks' },
  },
  dens_docks_pier_1: {
    id: 'dens_docks_pier_1', zone: 'town', name: 'Docks Pier Path, Second House',
    desc: 'The crowd thins on this stretch. A busker\'s upturned cap lies empty at the base of a rain barrel.',
    exits: { s: 'pier', n: 'dens_docks_pier_0' },
  },
  dens_hall_trader_trader_alley_0: {
    id: 'dens_hall_trader_trader_alley_0', zone: 'town', name: 'Hall Trader Trader Alley Path',
    desc: 'The crowd thins on this stretch. A busker\'s upturned cap lies empty at the base of a rain barrel.',
    exits: { n: 'dens_hall_trader_trader_alley_1', s: 'hall_trader' },
  },
  dens_hall_trader_trader_alley_1: {
    id: 'dens_hall_trader_trader_alley_1', zone: 'town', name: 'Hall Trader Trader Alley Path, Second House',
    desc: 'The street runs straight between close-built tenements; laundry lines sag overhead and the cobbles are worn smooth by cart traffic.',
    exits: { n: 'trader_alley', s: 'dens_hall_trader_trader_alley_0' },
  },
  dens_hall_trader_trader_shipment_0: {
    id: 'dens_hall_trader_trader_shipment_0', zone: 'town', name: 'Hall Trader Trader Shipment Path',
    desc: 'The street runs straight between close-built tenements; laundry lines sag overhead and the cobbles are worn smooth by cart traffic.',
    exits: { w: 'dens_hall_trader_trader_shipment_1', e: 'hall_trader' },
  },
  dens_hall_trader_trader_shipment_1: {
    id: 'dens_hall_trader_trader_shipment_1', zone: 'town', name: 'Hall Trader Trader Shipment Path, Second House',
    desc: 'Shopfronts give way to shuttered windows here. The smell of baking bread drifts from somewhere unseen.',
    exits: { w: 'trader_shipment', e: 'dens_hall_trader_trader_shipment_0' },
  },
  dens_hall_moonmage_oxenwaithe_road_0: {
    id: 'dens_hall_moonmage_oxenwaithe_road_0', zone: 'town', name: 'Hall Moonmage Oxenwaithe Road Path',
    desc: 'Shopfronts give way to shuttered windows here. The smell of baking bread drifts from somewhere unseen.',
    exits: { e: 'dens_hall_moonmage_oxenwaithe_road_1', w: 'hall_moonmage' },
  },
  dens_hall_moonmage_oxenwaithe_road_1: {
    id: 'dens_hall_moonmage_oxenwaithe_road_1', zone: 'town', name: 'Hall Moonmage Oxenwaithe Road Path, Second House',
    desc: 'A narrow drain runs down the middle of the lane. The buildings lean inward overhead, nearly touching.',
    exits: { e: 'oxenwaithe_road', w: 'dens_hall_moonmage_oxenwaithe_road_0' },
  },
  dens_hall_moonmage_hall_ranger_0: {
    id: 'dens_hall_moonmage_hall_ranger_0', zone: 'town', name: 'Hall Moonmage Hall Ranger Path',
    desc: 'A narrow drain runs down the middle of the lane. The buildings lean inward overhead, nearly touching.',
    exits: { w: 'dens_hall_moonmage_hall_ranger_1', e: 'hall_moonmage' },
  },
  dens_hall_moonmage_hall_ranger_1: {
    id: 'dens_hall_moonmage_hall_ranger_1', zone: 'town', name: 'Hall Moonmage Hall Ranger Path, Second House',
    desc: 'The crowd thins on this stretch. A busker\'s upturned cap lies empty at the base of a rain barrel.',
    exits: { w: 'hall_ranger', e: 'dens_hall_moonmage_hall_ranger_0' },
  },
  dens_hall_cleric_hall_ranger_0: {
    id: 'dens_hall_cleric_hall_ranger_0', zone: 'town', name: 'Hall Cleric Hall Ranger Path',
    desc: 'The crowd thins on this stretch. A busker\'s upturned cap lies empty at the base of a rain barrel.',
    exits: { n: 'dens_hall_cleric_hall_ranger_1', s: 'hall_cleric' },
  },
  dens_hall_cleric_hall_ranger_1: {
    id: 'dens_hall_cleric_hall_ranger_1', zone: 'town', name: 'Hall Cleric Hall Ranger Path, Second House',
    desc: 'The street runs straight between close-built tenements; laundry lines sag overhead and the cobbles are worn smooth by cart traffic.',
    exits: { n: 'hall_ranger', s: 'dens_hall_cleric_hall_ranger_0' },
  },
  dens_hall_cleric_hall_thief_0: {
    id: 'dens_hall_cleric_hall_thief_0', zone: 'town', name: 'Hall Cleric Hall Thief Path',
    desc: 'The street runs straight between close-built tenements; laundry lines sag overhead and the cobbles are worn smooth by cart traffic.',
    exits: { w: 'dens_hall_cleric_hall_thief_1', e: 'hall_cleric' },
  },
  dens_hall_cleric_hall_thief_1: {
    id: 'dens_hall_cleric_hall_thief_1', zone: 'town', name: 'Hall Cleric Hall Thief Path, Second House',
    desc: 'Shopfronts give way to shuttered windows here. The smell of baking bread drifts from somewhere unseen.',
    exits: { w: 'hall_thief', e: 'dens_hall_cleric_hall_thief_0' },
  },
  dens_hall_cleric_hall_necromancer_0: {
    id: 'dens_hall_cleric_hall_necromancer_0', zone: 'town', name: 'Hall Cleric Hall Necromancer Path',
    desc: 'Shopfronts give way to shuttered windows here. The smell of baking bread drifts from somewhere unseen.',
    exits: { e: 'dens_hall_cleric_hall_necromancer_1', w: 'hall_cleric' },
  },
  dens_hall_cleric_hall_necromancer_1: {
    id: 'dens_hall_cleric_hall_necromancer_1', zone: 'town', name: 'Hall Cleric Hall Necromancer Path, Second House',
    desc: 'A narrow drain runs down the middle of the lane. The buildings lean inward overhead, nearly touching.',
    exits: { e: 'hall_necromancer', w: 'dens_hall_cleric_hall_necromancer_0' },
  },

  trav_grove_0: {
    id: 'trav_grove_0', zone: 'woods', name: 'Western Grove',
    desc: 'Well-worn paths lead through a grove of trees, the canopy whispering with each passing breeze.',
    exits: { s: 'trav_grove_1', n: 'trav_grove_16' },
  },
  trav_grove_1: {
    id: 'trav_grove_1', zone: 'woods', name: 'Western Grove',
    desc: 'The grove thickens here, birch and elm crowding the path from both sides.',
    exits: { s: 'trav_grove_2', n: 'trav_grove_0' },
  },
  trav_grove_2: {
    id: 'trav_grove_2', zone: 'woods', name: 'Western Grove',
    desc: 'A fallen log spans the path, soft with moss. Beyond it the trees press closer.',
    exits: { s: 'trav_grove_3', n: 'trav_grove_1' },
  },
  trav_grove_3: {
    id: 'trav_grove_3', zone: 'woods', name: 'Western Grove',
    desc: 'Dappled light falls through the leaves. Somewhere off the path, a woodpecker works at dead bark.',
    exits: { s: 'trav_grove_4', n: 'trav_grove_2' },
  },
  trav_grove_4: {
    id: 'trav_grove_4', zone: 'woods', name: 'Western Grove',
    desc: 'The trail bends around an ancient oak whose roots buckle the earth.',
    exits: { s: 'trav_grove_5', n: 'trav_grove_3' },
  },
  trav_grove_5: {
    id: 'trav_grove_5', zone: 'woods', name: 'Western Grove',
    desc: 'Well-worn paths lead through a grove of trees, the canopy whispering with each passing breeze.',
    exits: { s: 'trav_grove_6', n: 'trav_grove_4' },
  },
  trav_grove_6: {
    id: 'trav_grove_6', zone: 'woods', name: 'Western Grove',
    desc: 'The grove thickens here, birch and elm crowding the path from both sides.',
    exits: { s: 'trav_grove_7', n: 'trav_grove_5' },
  },
  trav_grove_7: {
    id: 'trav_grove_7', zone: 'woods', name: 'Western Grove',
    desc: 'A fallen log spans the path, soft with moss. Beyond it the trees press closer.',
    exits: { s: 'trav_grove_8', n: 'trav_grove_6' },
  },
  trav_grove_8: {
    id: 'trav_grove_8', zone: 'woods', name: 'Western Grove',
    desc: 'Dappled light falls through the leaves. Somewhere off the path, a woodpecker works at dead bark.',
    exits: { s: 'trav_grove_9', n: 'trav_grove_7' },
  },
  trav_grove_9: {
    id: 'trav_grove_9', zone: 'woods', name: 'Western Grove',
    desc: 'The trail bends around an ancient oak whose roots buckle the earth.',
    exits: { s: 'trav_grove_10', n: 'trav_grove_8' },
  },
  trav_grove_10: {
    id: 'trav_grove_10', zone: 'woods', name: 'Western Grove',
    desc: 'Well-worn paths lead through a grove of trees, the canopy whispering with each passing breeze.',
    exits: { s: 'trav_grove_11', n: 'trav_grove_9' },
  },
  trav_grove_11: {
    id: 'trav_grove_11', zone: 'woods', name: 'Western Grove',
    desc: 'The grove thickens here, birch and elm crowding the path from both sides.',
    exits: { s: 'trav_grove_12', n: 'trav_grove_10' },
  },
  trav_grove_12: {
    id: 'trav_grove_12', zone: 'woods', name: 'Western Grove',
    desc: 'A fallen log spans the path, soft with moss. Beyond it the trees press closer.',
    exits: { s: 'trav_grove_13', n: 'trav_grove_11' },
  },
  trav_grove_13: {
    id: 'trav_grove_13', zone: 'woods', name: 'Western Grove',
    desc: 'Dappled light falls through the leaves. Somewhere off the path, a woodpecker works at dead bark.',
    exits: { s: 'trav_grove_14', n: 'trav_grove_12' },
  },
  trav_grove_14: {
    id: 'trav_grove_14', zone: 'woods', name: 'Western Grove',
    desc: 'The trail bends around an ancient oak whose roots buckle the earth.',
    exits: { s: 'trav_grove_15', n: 'trav_grove_13' },
  },
  trav_grove_15: {
    id: 'trav_grove_15', zone: 'woods', name: 'Western Grove',
    desc: 'Well-worn paths lead through a grove of trees, the canopy whispering with each passing breeze.',
    exits: { s: 'woods_path', n: 'trav_grove_14' },
  },

  trav_meeting_hall_hall_paladin_0: {
    id: 'trav_meeting_hall_hall_paladin_0', zone: 'town', name: 'Crossing Street',
    desc: 'Traffic thins along this stretch of street, though the wear on the cobbles says plenty still pass this way.',
    exits: { e: 'meeting_hall', w: 'trav_meeting_hall_hall_paladin_1' },
  },
  trav_meeting_hall_hall_paladin_1: {
    id: 'trav_meeting_hall_hall_paladin_1', zone: 'town', name: 'Crossing Street',
    desc: 'Traffic thins along this stretch of street, though the wear on the cobbles says plenty still pass this way.',
    exits: { e: 'trav_meeting_hall_hall_paladin_0', w: 'trav_meeting_hall_hall_paladin_2' },
  },
  trav_meeting_hall_hall_paladin_2: {
    id: 'trav_meeting_hall_hall_paladin_2', zone: 'town', name: 'Crossing Street',
    desc: 'Traffic thins along this stretch of street, though the wear on the cobbles says plenty still pass this way.',
    exits: { e: 'trav_meeting_hall_hall_paladin_1', w: 'trav_meeting_hall_hall_paladin_3' },
  },
  trav_meeting_hall_hall_paladin_3: {
    id: 'trav_meeting_hall_hall_paladin_3', zone: 'town', name: 'Crossing Street',
    desc: 'Traffic thins along this stretch of street, though the wear on the cobbles says plenty still pass this way.',
    exits: { e: 'trav_meeting_hall_hall_paladin_2', w: 'trav_meeting_hall_hall_paladin_4' },
  },
  trav_meeting_hall_hall_paladin_4: {
    id: 'trav_meeting_hall_hall_paladin_4', zone: 'town', name: 'Crossing Street',
    desc: 'Traffic thins along this stretch of street, though the wear on the cobbles says plenty still pass this way.',
    exits: { e: 'trav_meeting_hall_hall_paladin_3', w: 'hall_paladin' },
  },

  trav_gateyard_herald_st_0: {
    id: 'trav_gateyard_herald_st_0', zone: 'town', name: 'Herald Street',
    desc: 'Traffic thins along this stretch of street, though the wear on the cobbles says plenty still pass this way.',
    exits: { s: 'trav_gateyard_herald_st_1', n: 'gateyard' },
  },
  trav_gateyard_herald_st_1: {
    id: 'trav_gateyard_herald_st_1', zone: 'town', name: 'Herald Street',
    desc: 'Traffic thins along this stretch of street, though the wear on the cobbles says plenty still pass this way.',
    exits: { s: 'trav_gateyard_herald_st_2', n: 'trav_gateyard_herald_st_0' },
  },
  trav_gateyard_herald_st_2: {
    id: 'trav_gateyard_herald_st_2', zone: 'town', name: 'Herald Street',
    desc: 'Traffic thins along this stretch of street, though the wear on the cobbles says plenty still pass this way.',
    exits: { s: 'herald_st', n: 'trav_gateyard_herald_st_1' },
  },

  trav_hall_barbarian_hall_paladin_0: {
    id: 'trav_hall_barbarian_hall_paladin_0', zone: 'town', name: 'Crossing Street',
    desc: 'Traffic thins along this stretch of street, though the wear on the cobbles says plenty still pass this way.',
    exits: { e: 'trav_hall_barbarian_hall_paladin_1', w: 'hall_barbarian' },
  },
  trav_hall_barbarian_hall_paladin_1: {
    id: 'trav_hall_barbarian_hall_paladin_1', zone: 'town', name: 'Crossing Street',
    desc: 'Traffic thins along this stretch of street, though the wear on the cobbles says plenty still pass this way.',
    exits: { e: 'trav_hall_barbarian_hall_paladin_2', w: 'trav_hall_barbarian_hall_paladin_0' },
  },
  trav_hall_barbarian_hall_paladin_2: {
    id: 'trav_hall_barbarian_hall_paladin_2', zone: 'town', name: 'Crossing Street',
    desc: 'Traffic thins along this stretch of street, though the wear on the cobbles says plenty still pass this way.',
    exits: { e: 'trav_hall_barbarian_hall_paladin_3', w: 'trav_hall_barbarian_hall_paladin_1' },
  },
  trav_hall_barbarian_hall_paladin_3: {
    id: 'trav_hall_barbarian_hall_paladin_3', zone: 'town', name: 'Crossing Street',
    desc: 'Traffic thins along this stretch of street, though the wear on the cobbles says plenty still pass this way.',
    exits: { e: 'trav_hall_barbarian_hall_paladin_4', w: 'trav_hall_barbarian_hall_paladin_2' },
  },
  trav_hall_barbarian_hall_paladin_4: {
    id: 'trav_hall_barbarian_hall_paladin_4', zone: 'town', name: 'Crossing Street',
    desc: 'Traffic thins along this stretch of street, though the wear on the cobbles says plenty still pass this way.',
    exits: { w: 'trav_hall_barbarian_hall_paladin_3' },
  },

  trav_ne_road_gateyard_0: {
    id: 'trav_ne_road_gateyard_0', zone: 'town', name: 'Crossing Street',
    desc: 'Traffic thins along this stretch of street, though the wear on the cobbles says plenty still pass this way.',
    exits: { e: 'trav_ne_road_gateyard_1', w: 'ne_road' },
  },
  trav_ne_road_gateyard_1: {
    id: 'trav_ne_road_gateyard_1', zone: 'town', name: 'Crossing Street',
    desc: 'Traffic thins along this stretch of street, though the wear on the cobbles says plenty still pass this way.',
    exits: { e: 'trav_ne_road_gateyard_2', w: 'trav_ne_road_gateyard_0' },
  },
  trav_ne_road_gateyard_2: {
    id: 'trav_ne_road_gateyard_2', zone: 'town', name: 'Crossing Street',
    desc: 'Traffic thins along this stretch of street, though the wear on the cobbles says plenty still pass this way.',
    exits: { e: 'gateyard', w: 'trav_ne_road_gateyard_1' },
  },

  trav_academy_tailor_0: {
    id: 'trav_academy_tailor_0', zone: 'town', name: "Tanners' Row",
    desc: 'The smell of tanning oil hangs over this stretch, where leatherworkers keep their shops away from the open flames of the smithys.',
    exits: { s: 'music_shop', n: 'trav_academy_tailor_1' },
  },
  trav_academy_tailor_1: {
    id: 'trav_academy_tailor_1', zone: 'town', name: "Randal's Yard",
    desc: 'A small building structured from logs and mud stands on the side of the road here, its door propped open to the breeze.',
    exits: { s: 'trav_academy_tailor_0', w: 'tailor_shop' },
  },

  trav_grove_16: {
    id: 'trav_grove_16', zone: 'woods', name: 'Western Grove',
    desc: 'Well-worn paths lead through a grove of trees to the open fields beyond the wall.',
    exits: { n: 'west_gate', s: 'trav_grove_0' },
  },

  neh_dock: {
    id: 'neh_dock', zone: 'town', name: 'Neh Dock', APPROXIMATE: true,
    desc: "A weathered pier at the river mouth. Harbor hands call departures over the gulls: the Kree'la sails for Riverhaven, the Skirr'lolasu downriver to the Crossing.",
    exits: { nw: 'docks', e: 'rh_ferry' },
  },

};

export function roomById(id) {
  return ROOMS[id] || null;
}
