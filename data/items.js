// Item catalog: weapons, armor, and miscellany (clean-room).

export const ITEMS = {
  // --- Weapons ---
  // Milgrym's Weapons (Crossing smith) stock: names/prices/types per the
  // clean-room reference docs/reference-milgryms-weapons.md
  // (Elanthipedia "Milgrym's Weapons", Kronars). Skill classes per that page;
  // damage/speed are our own abstract calibration within each class tier.
  dagger:        { id: 'dagger', name: 'a plain dagger', type: 'weapon', slot: 'hand', skill: 'small_edged', dmg: [3, 8], speed: 3, value: 25, burden: 0, desc: 'A small, serviceable blade.' },
  wide_bladed_dagger: { id: 'wide_bladed_dagger', name: 'a wide-bladed dagger', type: 'weapon', slot: 'hand', skill: 'small_edged', dmg: [4, 9], speed: 3, value: 200, burden: 0, desc: 'A broad stabbing blade with a wicked point.' },
  kris:          { id: 'kris', name: 'a short-handled kris', type: 'weapon', slot: 'hand', skill: 'small_edged', dmg: [4, 10], speed: 3, value: 250, burden: 0, desc: 'A wavy-edged dagger, quick in the hand.' },
  short_sword:   { id: 'short_sword', name: 'a refurbished short sword', type: 'weapon', slot: 'hand', skill: 'small_edged', dmg: [5, 11], speed: 4, value: 337, burden: 1, desc: 'An older blade re-honed to a soldier\'s edge.' },
  cavalry_sabre: { id: 'cavalry_sabre', name: 'a recurved cavalry sabre', type: 'weapon', slot: 'hand', skill: 'medium_edged', dmg: [8, 16], speed: 5, value: 562, burden: 1, desc: 'A curved saber made for sweeping cuts from the saddle.' },
  scimitar:      { id: 'scimitar', name: 'a watered steel scimitar', type: 'weapon', slot: 'hand', skill: 'medium_edged', dmg: [8, 17], speed: 5, value: 562, burden: 1, desc: 'A curved blade whose steel shows a watery pattern.' },
  cutlass:       { id: 'cutlass', name: 'a basket-hilt cutlass', type: 'weapon', slot: 'hand', skill: 'medium_edged', dmg: [9, 17], speed: 5, value: 575, burden: 1, desc: 'A heavy single-edged blade behind a full basket hilt.' },
  long_sword:    { id: 'long_sword', name: 'a long sword', type: 'weapon', slot: 'hand', skill: 'medium_edged', dmg: [9, 18], speed: 5, value: 200, burden: 1, desc: 'A well-worn but true long sword.' },
  broadsword:    { id: 'broadsword', name: 'a stout broadsword', type: 'weapon', slot: 'hand', skill: 'large_edged', dmg: [11, 22], speed: 6, value: 650, burden: 2, desc: 'A heavy, wide-bladed sword for hard swings.' },
  cinquedea:     { id: 'cinquedea', name: 'a long-bladed cinquedea', type: 'weapon', slot: 'hand', skill: 'large_edged', dmg: [12, 23], speed: 6, value: 662, burden: 2, desc: 'A civilian thrusting sword nearly as long as an arm.' },
  greatsword:    { id: 'greatsword', name: 'a scrimshaw-handled claymore', type: 'weapon', slot: 'hand', skill: 'twohanded_edged', dmg: [16, 30], speed: 8, value: 675, burden: 3, desc: 'A massive two-handed blade, its grip carved with scrimshaw.' },
  greataxe:      { id: 'greataxe', name: 'a double-bit greataxe', type: 'weapon', slot: 'hand', skill: 'twohanded_edged', dmg: [15, 29], speed: 8, value: 675, burden: 3, desc: 'A two-handed axe with twin crescent heads.' },
  mace:          { id: 'mace', name: 'a heavy flanged mace', type: 'weapon', slot: 'hand', skill: 'blunt', dmg: [7, 15], speed: 5, value: 206, burden: 1, desc: 'A stout mace with heavy flanges.' },
  warhammer:     { id: 'warhammer', name: 'an ironwood-hafted war hammer', type: 'weapon', slot: 'hand', skill: 'blunt', dmg: [10, 19], speed: 5, value: 375, burden: 1, desc: 'A hammer of ironwood and steel built to dent armor.' },
  club:          { id: 'club', name: 'a sturdy oaken club', type: 'weapon', slot: 'hand', skill: 'blunt', dmg: [4, 10], speed: 4, value: 112, burden: 1, desc: 'A simple, reliable club of dense oak.' },
  elkhorn_bludgeon: { id: 'elkhorn_bludgeon', name: 'a lead-weighted elkhorn bludgeon', type: 'weapon', slot: 'hand', skill: 'blunt', dmg: [7, 14], speed: 5, value: 562, burden: 1, desc: 'An antler tine capped with a pour of lead.' },
  flail:         { id: 'flail', name: "an iron-studded footman's flail", type: 'weapon', slot: 'hand', skill: 'twohanded_blunt', dmg: [14, 27], speed: 8, value: 500, burden: 3, desc: 'A two-handed flail, its head bristling with iron studs.' },
  sledgehammer:  { id: 'sledgehammer', name: 'a pine-handled sledgehammer', type: 'weapon', slot: 'hand', skill: 'large_blunt', dmg: [12, 24], speed: 7, value: 625, burden: 3, desc: 'More forge-tool than weapon, and no less deadly for it.' },
  greathammer:   { id: 'greathammer', name: 'an etched greathammer', type: 'weapon', slot: 'hand', skill: 'large_blunt', dmg: [13, 26], speed: 7, value: 681, burden: 3, desc: 'A great hammer etched with old battle-runes.' },
  staff:         { id: 'staff', name: 'an ironwood quarterstaff', type: 'weapon', slot: 'hand', skill: 'staff', dmg: [5, 12], speed: 5, value: 112, burden: 1, desc: 'A dense ironwood shaft worn smooth by grip and years.' },
  hunting_bow:   { id: 'hunting_bow', name: 'a leather-gripped yew shortbow', type: 'weapon', slot: 'hand', skill: 'bow', dmg: [6, 14], speed: 5, value: 162, burden: 1, desc: 'A short yew bow, quick to load and easy to carry.' },
  long_bow:      { id: 'long_bow', name: 'a leather-gripped yew longbow', type: 'weapon', slot: 'hand', skill: 'bow', dmg: [7, 16], speed: 6, value: 562, burden: 1, desc: 'A tall yew bow with a long, hungry draw.' },
  light_crossbow:{ id: 'light_crossbow', name: 'a lever-drawn light crossbow', type: 'weapon', slot: 'hand', skill: 'crossbow', dmg: [8, 16], speed: 7, value: 650, burden: 2, desc: 'A goat\'s-foot lever cocks this compact crossbow.' },
  spear:         { id: 'spear', name: 'a narrow-headed spear', type: 'weapon', slot: 'hand', skill: 'heavy_thrown', dmg: [9, 17], speed: 5, value: 250, burden: 2, desc: 'A slim-pointed spear, as good hurled as held.' },
  bola:          { id: 'bola', name: 'a triple-weighted bola', type: 'weapon', slot: 'hand', skill: 'thrown', dmg: [4, 9], speed: 4, value: 250, burden: 1, desc: 'Three weights on braided cords, whirled and loosed.' },
  halberd:       { id: 'halberd', name: 'an oak-hafted halberd', type: 'weapon', slot: 'hand', skill: 'polearm', dmg: [14, 26], speed: 7, value: 562, burden: 3, desc: 'Axe point and hook crowning a long oak haft.' },
  pike:          { id: 'pike', name: 'an ash-handled pike', type: 'weapon', slot: 'hand', skill: 'polearm', dmg: [12, 22], speed: 7, value: 637, burden: 3, desc: 'A long ash shaft ending in a slender steel point.' },
  throwing_knives: { id: 'throwing_knives', name: 'a set of throwing knives', type: 'weapon', slot: 'hand', skill: 'thrown', dmg: [3, 8], speed: 4, value: 30, burden: 0, desc: 'Balanced knives meant for the air.' },
  hand_axe:      { id: 'hand_axe', name: 'a balanced hand axe', type: 'weapon', slot: 'hand', skill: 'medium_edged', dmg: [8, 15], speed: 4, value: 65, burden: 1, desc: 'A short-hafted axe with a keen biting edge.' },
  // Tiered weapons (req = minimum circle to wield)
  steel_sword:   { id: 'steel_sword', name: 'a steel longsword', type: 'weapon', slot: 'hand', skill: 'medium_edged', dmg: [12, 22], speed: 5, value: 420, req: 3, burden: 1, desc: 'A fine steel longsword, well-tempered and true.' },
  steel_mace:    { id: 'steel_mace', name: 'a steel war mace', type: 'weapon', slot: 'hand', skill: 'large_blunt', dmg: [10, 19], speed: 5, value: 300, req: 3, burden: 1, desc: 'A heavy steel mace that crushes armor.' },
  steel_greatsword: { id: 'steel_greatsword', name: 'a steel greatsword', type: 'weapon', slot: 'hand', skill: 'twohanded_edged', dmg: [20, 34], speed: 8, value: 700, req: 5, burden: 3, desc: 'A massive steel blade fit for a veteran.' },
  yew_longbow:   { id: 'yew_longbow', name: 'a yew longbow', type: 'weapon', slot: 'hand', skill: 'bow', dmg: [10, 20], speed: 5, value: 420, req: 4, burden: 1, desc: 'A tall yew bow with a long, deadly draw.' },
  war_crossbow:  { id: 'war_crossbow', name: 'a war crossbow', type: 'weapon', slot: 'hand', skill: 'crossbow', dmg: [14, 26], speed: 6, value: 520, req: 6, burden: 2, desc: 'A heavy crossbow that punches through mail.' },
  mithril_blade: { id: 'mithril_blade', name: 'a mithril longsword', type: 'weapon', slot: 'hand', skill: 'medium_edged', dmg: [15, 27], speed: 4, value: 1200, req: 7, burden: 1, desc: 'A shimmering mithril blade, light and unbreakable.' },
  dragonsteel_greatsword: { id: 'dragonsteel_greatsword', name: 'a dragonsteel greatsword', type: 'weapon', slot: 'hand', skill: 'twohanded_edged', dmg: [26, 44], speed: 7, value: 2600, req: 10, burden: 2, desc: 'A legendary blade of dragonsteel, humming with old heat.' },
  // Ammo
  arrows:        { id: 'arrows', name: 'a bundle of arrows', type: 'misc', slot: null, value: 10, desc: 'A bundle of fletched arrows.' },
  bolts:         { id: 'bolts', name: 'a quiver of bolts', type: 'misc', slot: null, value: 12, desc: 'A quiver of crossbow bolts.' },

  // --- Armor ---
  padded_cloth:  { id: 'padded_cloth', name: 'padded cloth armor', type: 'armor', slot: 'torso', skill: 'light_armor', armor: 12, value: 40, burden: 0, desc: 'Quilted cloth that softens blows.' },
  leather:       { id: 'leather', name: 'a leather jerkin', type: 'armor', slot: 'torso', skill: 'light_armor', armor: 20, value: 90, burden: 0, desc: 'Supple, cured leather armor.' },
  studded:       { id: 'studded', name: 'studded leather', type: 'armor', slot: 'torso', skill: 'light_armor', armor: 28, value: 180, burden: 1, desc: 'Leather reinforced with metal studs.' },
  chainmail:     { id: 'chainmail', name: 'a chainmail hauberk', type: 'armor', slot: 'torso', skill: 'chain_armor', armor: 42, value: 400, burden: 2, desc: 'Interlocking rings of steel.' },
  brigandine_coat: { id: 'brigandine_coat', name: 'a brigandine coat', type: 'armor', slot: 'torso', skill: 'brigandine', armor: 55, value: 650, burden: 2, desc: 'Riveted plates sewn into a canvas coat.' },
  plate_cuirass: { id: 'plate_cuirass', name: 'a plate cuirass', type: 'armor', slot: 'torso', skill: 'plate_armor', armor: 72, value: 1100, burden: 3, desc: 'A gleaming breastplate of solid steel.' },
  helm:          { id: 'helm', name: 'an iron helm', type: 'armor', slot: 'head', skill: 'chain_armor', armor: 18, value: 120, burden: 1, desc: 'A simple iron headguard.' },
  leather_boots: { id: 'leather_boots', name: 'sturdy leather boots', type: 'armor', slot: 'feet', skill: 'light_armor', armor: 8, value: 30, burden: 0, desc: 'Worn but reliable boots.' },
  leather_sleeves: { id: 'leather_sleeves', name: 'a pair of leather sleeves', type: 'armor', slot: 'arms', skill: 'light_armor', armor: 10, value: 45, burden: 0, desc: 'Supple arm-guards laced from elbow to shoulder.' },
  chain_sleeves:   { id: 'chain_sleeves', name: 'a pair of mail sleeves', type: 'armor', slot: 'arms', skill: 'chain_armor', armor: 22, value: 260, req: 3, burden: 1, desc: 'Interlocked rings that rattle quietly down the forearm.' },
  leather_pants:   { id: 'leather_pants', name: 'a pair of leather leggings', type: 'armor', slot: 'legs', skill: 'light_armor', armor: 12, value: 55, burden: 0, desc: 'Cured hide trousers, supple at the knee.' },
  chain_leggings:  { id: 'chain_leggings', name: 'a pair of mail leggings', type: 'armor', slot: 'legs', skill: 'chain_armor', armor: 26, value: 300, req: 3, burden: 1, desc: 'A skirt of fine rings split for the saddle.' },
  shield_wood:   { id: 'shield_wood', name: 'a round wooden shield', type: 'armor', slot: 'shield', skill: 'shield_usage', armor: 20, value: 70, burden: 1, desc: 'A bossed round shield of oak.' },
  shield_steel:  { id: 'shield_steel', name: 'a steel kite shield', type: 'armor', slot: 'shield', skill: 'shield_usage', armor: 34, value: 320, burden: 2, desc: 'A sturdy steel kite shield.' },
  // Tiered armor
  ring_mail:     { id: 'ring_mail', name: 'ring mail armor', type: 'armor', slot: 'torso', skill: 'chain_armor', armor: 50, value: 600, req: 4, burden: 1, desc: 'A coat of riveted rings over leather.' },
  half_plate:    { id: 'half_plate', name: 'half plate armor', type: 'armor', slot: 'torso', skill: 'plate_armor', armor: 62, value: 950, req: 6, burden: 2, desc: 'Solid steel plates over a chain base.' },
  full_plate:    { id: 'full_plate', name: 'a suit of full plate', type: 'armor', slot: 'torso', skill: 'plate_armor', armor: 78, value: 1600, req: 8, burden: 3, desc: 'A full suit of polished plate, a fortress in steel.' },
  mithril_plate: { id: 'mithril_plate', name: 'mithril plate armor', type: 'armor', slot: 'torso', skill: 'plate_armor', armor: 90, value: 3200, req: 10, burden: 2, desc: 'Gleaming mithril plate, lighter than air and harder than dragon hide.' },
  steel_shield:  { id: 'steel_shield', name: 'a steel tower shield', type: 'armor', slot: 'shield', skill: 'shield_usage', armor: 42, value: 700, req: 6, burden: 2, desc: 'A great tower shield of interlocking steel.' },

  // --- Misc ---
  stick:         { id: 'stick', name: 'a dry stick', type: 'misc', slot: null, value: 2, desc: 'A dry stick suitable for kindling.' },
  branch:        { id: 'branch', name: 'a fallen branch', type: 'misc', slot: null, value: 4, desc: 'A sturdy fallen branch that should burn well.' },
  ration:        { id: 'ration', name: 'a dried ration', type: 'consumable', slot: null, value: 5, restore: 15, desc: 'A chewy ration that restores a little vigor.' },
  salve:         { id: 'salve', name: 'a healing salve', type: 'consumable', slot: null, value: 40, restore: 40, desc: 'A pungent salve that closes wounds.' },
  herb_mint:     { id: 'herb_mint', name: 'a sprig of trailmint', type: 'consumable', slot: null, value: 6, restore: 12, desc: 'A fragrant sprig that steadies the nerves.' },
  herb_root:     { id: 'herb_root', name: 'a bitter root', type: 'consumable', slot: null, value: 12, restore: 22, desc: 'A fibrous root that is said to draw out pain.' },
  potion_heal:   { id: 'potion_heal', name: 'a vial of healing draught', type: 'consumable', slot: null, value: 50, restore: 60, desc: 'A bubbling draught that knits flesh remarkably fast.' },
  potion_mana:   { id: 'potion_mana', name: 'a vial of essence tonic', type: 'consumable', slot: null, value: 55, restoreMana: 60, desc: 'A shimmering tonic that floods the mind with power.' },
  potion_frenzy: { id: 'potion_frenzy', name: 'a vial of frenzy draught', type: 'consumable', slot: null, value: 70, buff: { frenzy: 30 }, desc: 'A fiery draught that sets the blood boiling — +30% damage while it lasts.' },
  // Alchemical boost draughts (DR-flavored consumable buffs; the "swiftness"
  // draught is a learning aid: +50% skill experience while its effect lasts).
  potion_swiftness: { id: 'potion_swiftness', name: 'a vial of swiftness draught', type: 'consumable', slot: null, value: 60, buff: { keen: 40 }, desc: 'A quicksilver tonic that sharpens the mind — you learn much faster while it lasts.' },
  potion_vigor: { id: 'potion_vigor', name: 'a vial of vigor draught', type: 'consumable', slot: null, value: 65, buff: { vigor: 40 }, desc: 'An earthy brew that steadies the breath — fatigue costs melt away while it lasts.' },
  strongbox:     { id: 'strongbox', name: 'a locked strongbox', type: 'misc', slot: null, value: 20, desc: 'A heavy iron strongbox, locked and banded. Kobolds and bandits seem fond of these.' },
  // Gems: loose cut stones from the pockets of monsters and the depths.
  garnet:        { id: 'garnet', name: 'a blood garnet', type: 'misc', slot: null, value: 60, desc: 'A thumb-sized garnet, dark as old wine.' },
  sapphire:      { id: 'sapphire', name: 'a deep sapphire', type: 'misc', slot: null, value: 140, desc: 'A deep blue sapphire that catches the light.' },
  emerald:       { id: 'emerald', name: 'a forest emerald', type: 'misc', slot: null, value: 260, desc: 'A green emerald, bright as a new leaf.' },
  diamond:       { id: 'diamond', name: 'a cut diamond', type: 'misc', slot: null, value: 500, desc: 'A flawless diamond that burns with cold fire.' },

  // --- Magical devices (cambrinth) ---
  conjured_blade: { id: 'conjured_blade', name: 'a conjured blade of aether', type: 'weapon', slot: 'hand', skill: 'medium_edged', dmg: [12, 22], speed: 5, value: 0, burden: 0, desc: 'A blade of white-hot aether, humming with summoned power. It will not last.' },
  cambrinth_band:    { id: 'cambrinth_band', name: 'a cambrinth band', type: 'cambrinth', slot: null, capacity: 6, value: 150, desc: 'A ring of grey-black cambrinth that drinks and holds spell energy.' },
  cambrinth_pendant: { id: 'cambrinth_pendant', name: 'a cambrinth pendant', type: 'cambrinth', slot: null, capacity: 10, value: 280, desc: 'A pendant of grey-black cambrinth on a silver chain.' },
  cambrinth_orb:     { id: 'cambrinth_orb', name: 'a faceted cambrinth orb', type: 'cambrinth', slot: null, capacity: 30, value: 900, desc: 'A fist-sized orb of faceted cambrinth, humming with stored force.' },

  // --- Barbarian items ---
  warhorn:       { id: 'warhorn', name: 'a warhorn', type: 'misc', slot: null, value: 60, desc: 'A battered horn of brass and bone. Blow it to summon beasts from the wilds.' },
  chakrel_1:     { id: 'chakrel_1', name: 'a chakrel band', type: 'misc', slot: 'neck', value: 120, desc: 'A band of pale stone that quickens the body — it sharpens your meditations.' },
  warpaint:      { id: 'warpaint', name: 'a pot of war paint', type: 'consumable', slot: null, value: 90, buff: { warpaint: 40 }, desc: 'A clay pot of ochre-and-ash paint. Daubed on, your blows strike 15% harder while it lasts.' },
  roar_helm:     { id: 'roar_helm', name: 'a roar helm', type: 'armor', slot: 'head', skill: 'light_armor', armor: 14, value: 220, burden: 1, desc: 'A horned iron helm that magnifies the voice — roars cost half the voice and bite harder.' },
  // Creature loot (skins). Tier variants keep the curve honest: a c3
  // great_rat pelt outsells its c1 cousin, and a fire drake's scales are
  // worth more than the lizard's (economy audit F3).
  lout_vest:     { id: 'lout_vest', name: 'a stained vest', type: 'armor', slot: 'chest', value: 14, defense: 2, desc: 'A beer-stained leather vest, more bravado than protection.' },
  rat_pelt:      { id: 'rat_pelt', name: 'a rat pelt', type: 'misc', slot: null, value: 8, desc: 'A scrappy grey pelt.' },
  dire_rat_pelt: { id: 'dire_rat_pelt', name: 'a great rat pelt', type: 'misc', slot: null, value: 22, desc: 'A thick, battle-scarred pelt off a sewer giant. Tougher stock than the common rat.' },
  crab_shell:    { id: 'crab_shell', name: 'a mud crab shell', type: 'misc', slot: null, value: 10, desc: 'A broad green-brown shell, still smelling of the reeds.' },
  reed_skin:     { id: 'reed_skin', name: 'a reed stalker hide', type: 'misc', slot: null, value: 26, desc: 'Sleek dappled hide from the sloughs, prized for waterwork leathers.' },
  kobold_skin:   { id: 'kobold_skin', name: 'a kobold hide', type: 'misc', slot: null, value: 20, desc: 'A scaly kobold hide.' },
  hog_hide:      { id: 'hog_hide', name: 'a marsh hog hide', type: 'misc', slot: null, value: 24, desc: 'Thick bristled hide, cured mud still in the bristles. Tanners prize it for work leather.' },
  goblin_skin:   { id: 'goblin_skin', name: 'a goblin hide', type: 'misc', slot: null, value: 34, desc: 'A rank green goblin hide.' },
  wolf_pelt:     { id: 'wolf_pelt', name: 'a wolf pelt', type: 'misc', slot: null, value: 60, desc: 'A thick grey wolf pelt.' },
  cinder_scale:  { id: 'cinder_scale', name: 'a cinder scale', type: 'misc', slot: null, value: 120, desc: 'A smoking, heat-sheened scale from a drake.' },
  drake_scale:   { id: 'drake_scale', name: 'a fire drake scale', type: 'misc', slot: null, value: 190, desc: 'A broad plate scale from a true fire drake — hotter and harder than the lizard\'s.' },
  iron_ring:     { id: 'iron_ring', name: 'a heavy iron ring', type: 'misc', slot: null, value: 70, desc: 'A crudely worked ring of bandit-forged iron.' },
  silver_ring:   { id: 'silver_ring', name: 'a silver signet ring', type: 'misc', slot: null, value: 150, desc: 'A tarnished silver ring bearing a sigil — plunder of the captain.' },
  wisp_mote:     { id: 'wisp_mote', name: 'a glowing wisp mote', type: 'misc', slot: null, value: 90, desc: 'A tiny, drifting shard of cold light.' },
  wraith_essence:{ id: 'wraith_essence', name: 'a wraith essence', type: 'misc', slot: null, value: 260, desc: 'A whisper of cold blackness that seems to breathe.' },
  dread_sigil:   { id: 'dread_sigil', name: 'a dread knight sigil', type: 'misc', slot: null, value: 600, desc: 'A rune-etched sigil torn from a dark breastplate.' },
  troll_hide:    { id: 'troll_hide', name: 'a troll hide', type: 'misc', slot: null, value: 140, desc: 'A knotted, resilient troll hide.' },
  viper_fang:    { id: 'viper_fang', name: 'a viper fang', type: 'misc', slot: null, value: 45, desc: 'A curved, hollow fang, still glistening.' },
  organ_vial:    { id: 'organ_vial', name: 'a jar of preserved organs', type: 'misc', slot: null, value: 75, desc: 'A glass jar of pale organs in murky brine. Some collectors pay well for such things.' },
  // Named rare loot
  fang_of_shadowpaw: { id: 'fang_of_shadowpaw', name: 'the Fang of Shadowpaw', type: 'weapon', slot: 'hand', skill: 'small_edged', dmg: [10, 16], speed: 3, value: 900, req: 6, desc: 'A fang-dagger carved from the dire wolf Shadowpaw. It hums with the forest.' },
  chieftains_cleaver: { id: 'chieftains_cleaver', name: "the Chieftain's Cleaver", type: 'weapon', slot: 'hand', skill: 'twohanded_edged', dmg: [22, 38], speed: 7, value: 1800, req: 8, desc: 'A great cleaver taken from the Bandit Chieftain. It is still warm.' },
  drakeheart_amulet: { id: 'drakeheart_amulet', name: 'the Drakeheart Amulet', type: 'armor', slot: 'accessory', skill: 'light_armor', armor: 15, value: 2500, req: 10, desc: 'An amulet cut from the heart-stone of the Cinder Drake King. Heat radiates from it.' },

  // ---- Forging materials ----
  iron_ore:      { id: 'iron_ore', name: 'a lump of iron ore', type: 'misc', slot: null, value: 15, desc: 'A heavy lump of raw iron ore.' },
  // ---- Crafted gear (forged at the Ember Forge, quality-scaled) ----
  forged_short_sword: { id: 'forged_short_sword', name: 'a finely forged short sword', type: 'weapon', slot: 'hand', skill: 'medium_edged', dmg: [7, 15], speed: 4, value: 150, req: 1, burden: 1, desc: 'A short sword hammered out by a smith\u2019s own hand.' },
  enstaff:      { id: 'enstaff', name: 'a runed oak staff', type: 'weapon', slot: 'hand', skill: 'staff', dmg: [8, 17], speed: 5, value: 260, magicEdge: 3, req: 2, burden: 1, desc: 'A carved oak staff bound with a mote of cold light; runes crawl faintly along the grain.' },
  forged_steel_sword: { id: 'forged_steel_sword', name: 'a finely forged steel longsword', type: 'weapon', slot: 'hand', skill: 'medium_edged', dmg: [13, 24], speed: 5, value: 520, req: 3, burden: 1, desc: 'A steel longsword forged with real craft.' },
  forged_steel_greatsword: { id: 'forged_steel_greatsword', name: 'a finely forged steel greatsword', type: 'weapon', slot: 'hand', skill: 'twohanded_edged', dmg: [22, 36], speed: 8, value: 880, req: 5, burden: 3, desc: 'A greatsword of the smith\u2019s own making.' },
  forged_mithril_blade: { id: 'forged_mithril_blade', name: 'a finely forged mithril longsword', type: 'weapon', slot: 'hand', skill: 'medium_edged', dmg: [17, 29], speed: 4, value: 1450, req: 7, burden: 1, desc: 'Mithril, folded by hand into a blade of rare quality.' },
  forged_dragonsteel: { id: 'forged_dragonsteel', name: 'a finely forged dragonsteel greatsword', type: 'weapon', slot: 'hand', skill: 'twohanded_edged', dmg: [28, 47], speed: 7, value: 3000, req: 10, burden: 2, desc: 'A legend smelted from dragonsteel and fire.' },

  // ---- Engineering and outfitting wares (crafted, quality-scaled) ----
  sling:         { id: 'sling', name: 'a braided leather sling', type: 'weapon', slot: 'hand', skill: 'slings', dmg: [5, 12], speed: 4, value: 20, burden: 0, desc: 'A woven leather pouch on two cords — humble, and deadly in practiced hands.' },
  offhand_blade: { id: 'offhand_blade', name: 'a short parrying blade', type: 'weapon', slot: 'hand', skill: 'offhand', dmg: [4, 11], speed: 3, value: 55, burden: 0, desc: 'A slim straight blade made for the left hand — quick answers to quick attacks.' },
  carved_staff: { id: 'carved_staff', name: 'a carved oak staff', type: 'weapon', slot: 'hand', skill: 'staff', dmg: [6, 13], speed: 5, value: 90, req: 1, burden: 1, desc: 'A staff of carved oak, its grain showing through lacquer.' },
  arbalest:     { id: 'arbalest', name: 'a hand-worked arbalest', type: 'weapon', slot: 'hand', skill: 'crossbow', dmg: [10, 18], speed: 6, value: 240, req: 3, burden: 2, desc: 'A crossbow of clever steel-and-wood construction.' },
  cured_leather:    { id: 'cured_leather', name: 'a cured leather jerkin', type: 'armor', slot: 'torso', skill: 'light_armor', armor: 22, value: 110, req: 1, burden: 0, desc: 'A jerkin cured and cut by a tailor\'s hand.' },
  enjerkin:     { id: 'enjerkin', name: 'a warded leather jerkin', type: 'armor', slot: 'torso', skill: 'light_armor', armor: 26, value: 240, magicEdge: 2, req: 1, burden: 0, desc: 'A cured jerkin stitched through with a warding thread that warms when danger nears.' },
  enblade:      { id: 'enblade', name: 'a spell-edged longsword', type: 'weapon', slot: 'hand', skill: 'medium_edged', dmg: [15, 27], speed: 5, value: 640, magicEdge: 5, req: 4, burden: 1, desc: 'Forged steel bound with two motes of raw magic; the edge hums along its length.' },
  studded_crafted:  { id: 'studded_crafted', name: 'studded hide armor', type: 'armor', slot: 'torso', skill: 'light_armor', armor: 30, value: 220, req: 1, burden: 1, desc: 'Hide armor reinforced with iron studs.' },
};

// Per-unit carried weight for loose goods (fractional burden points).
// Pelts and hides are bulky; ores and shells are heavy for their size.
const ITEM_WEIGHTS = {
  rat_pelt: 0.5, crab_shell: 0.5, reed_skin: 0.5, kobold_skin: 0.5,
  hog_hide: 1, goblin_skin: 0.5, wolf_pelt: 1, troll_hide: 1, cinder_scale: 0.25,
  iron_ore: 1, iron_ring: 0.5, silver_ring: 0.1, wisp_mote: 0.05,
  viper_fang: 0.1, organ_vial: 0.25,
};
export function itemWeight(item) {
  return item && item.weight != null ? item.weight
    : item && ITEM_WEIGHTS[item.id] != null ? ITEM_WEIGHTS[item.id]
    : 0.25;
}

export function itemById(id) {
  return ITEMS[id] || null;
}

// Damage string for a weapon, e.g. "6-13".
export function weaponString(item) {
  if (item.type !== 'weapon') return '';
  return `${item.dmg[0]}-${item.dmg[1]}`;
}
