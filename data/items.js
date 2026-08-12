// Item catalog: weapons, armor, and miscellany (clean-room).

export const ITEMS = {
  // --- Weapons ---
  dagger:        { id: 'dagger', name: 'a plain dagger', type: 'weapon', slot: 'hand', skill: 'small_edged', dmg: [3, 8], speed: 3, value: 25, desc: 'A small, serviceable blade.' },
  short_sword:   { id: 'short_sword', name: 'a short sword', type: 'weapon', slot: 'hand', skill: 'medium_edged', dmg: [6, 13], speed: 4, value: 80, desc: 'A hand-and-a-half blade balanced for quick work.' },
  long_sword:    { id: 'long_sword', name: 'a long sword', type: 'weapon', slot: 'hand', skill: 'medium_edged', dmg: [9, 18], speed: 5, value: 200, desc: 'A well-worn but true long sword.' },
  broadsword:    { id: 'broadsword', name: 'a broadsword', type: 'weapon', slot: 'hand', skill: 'large_edged', dmg: [11, 22], speed: 6, value: 320, desc: 'A heavy, wide-bladed sword for hard swings.' },
  greatsword:    { id: 'greatsword', name: 'a greatsword', type: 'weapon', slot: 'hand', skill: 'twohanded_edged', dmg: [16, 30], speed: 8, value: 520, desc: 'A massive blade demanding two hands and courage.' },
  mace:          { id: 'mace', name: 'a flanged mace', type: 'weapon', slot: 'hand', skill: 'blunt', dmg: [7, 15], speed: 5, value: 90, desc: 'A stout mace with heavy flanges.' },
  warhammer:     { id: 'warhammer', name: 'a warhammer', type: 'weapon', slot: 'hand', skill: 'twohanded_blunt', dmg: [13, 26], speed: 8, value: 380, desc: 'A ponderous hammer built to crush armor.' },
  staff:         { id: 'staff', name: 'an iron-shod staff', type: 'weapon', slot: 'hand', skill: 'staff', dmg: [5, 12], speed: 5, value: 60, desc: 'A walking staff capped in iron.' },
  hunting_bow:   { id: 'hunting_bow', name: 'a hunting bow', type: 'weapon', slot: 'hand', skill: 'bow', dmg: [6, 14], speed: 5, value: 150, desc: 'A recurved bow of supple wood.' },
  light_crossbow:{ id: 'light_crossbow', name: 'a light crossbow', type: 'weapon', slot: 'hand', skill: 'crossbow', dmg: [8, 16], speed: 7, value: 180, desc: 'A compact crossbow that hits hard.' },
  throwing_knives: { id: 'throwing_knives', name: 'a set of throwing knives', type: 'weapon', slot: 'hand', skill: 'thrown', dmg: [3, 8], speed: 4, value: 30, desc: 'Balanced knives meant for the air.' },
  club:          { id: 'club', name: 'a stout club', type: 'weapon', slot: 'hand', skill: 'blunt', dmg: [4, 10], speed: 4, value: 15, desc: 'A simple, reliable club.' },
  // Tiered weapons (req = minimum circle to wield)
  steel_sword:   { id: 'steel_sword', name: 'a steel longsword', type: 'weapon', slot: 'hand', skill: 'medium_edged', dmg: [12, 22], speed: 5, value: 420, req: 3, desc: 'A fine steel longsword, well-tempered and true.' },
  steel_mace:    { id: 'steel_mace', name: 'a steel war mace', type: 'weapon', slot: 'hand', skill: 'blunt', dmg: [10, 19], speed: 5, value: 300, req: 3, desc: 'A heavy steel mace that crushes armor.' },
  steel_greatsword: { id: 'steel_greatsword', name: 'a steel greatsword', type: 'weapon', slot: 'hand', skill: 'twohanded_edged', dmg: [20, 34], speed: 8, value: 700, req: 5, desc: 'A massive steel blade fit for a veteran.' },
  yew_longbow:   { id: 'yew_longbow', name: 'a yew longbow', type: 'weapon', slot: 'hand', skill: 'bow', dmg: [10, 20], speed: 5, value: 420, req: 4, desc: 'A tall yew bow with a long, deadly draw.' },
  war_crossbow:  { id: 'war_crossbow', name: 'a war crossbow', type: 'weapon', slot: 'hand', skill: 'crossbow', dmg: [14, 26], speed: 6, value: 520, req: 6, desc: 'A heavy crossbow that punches through mail.' },
  mithril_blade: { id: 'mithril_blade', name: 'a mithril longsword', type: 'weapon', slot: 'hand', skill: 'medium_edged', dmg: [15, 27], speed: 4, value: 1200, req: 7, desc: 'A shimmering mithril blade, light and unbreakable.' },
  dragonsteel_greatsword: { id: 'dragonsteel_greatsword', name: 'a dragonsteel greatsword', type: 'weapon', slot: 'hand', skill: 'twohanded_edged', dmg: [26, 44], speed: 7, value: 2600, req: 10, desc: 'A legendary blade of dragonsteel, humming with old heat.' },
  // Ammo
  arrows:        { id: 'arrows', name: 'a bundle of arrows', type: 'misc', slot: null, value: 10, desc: 'A bundle of fletched arrows.' },
  bolts:         { id: 'bolts', name: 'a quiver of bolts', type: 'misc', slot: null, value: 12, desc: 'A quiver of crossbow bolts.' },

  // --- Armor ---
  padded_cloth:  { id: 'padded_cloth', name: 'padded cloth armor', type: 'armor', slot: 'torso', skill: 'light_armor', armor: 12, value: 40, desc: 'Quilted cloth that softens blows.' },
  leather:       { id: 'leather', name: 'a leather jerkin', type: 'armor', slot: 'torso', skill: 'light_armor', armor: 20, value: 90, desc: 'Supple, cured leather armor.' },
  studded:       { id: 'studded', name: 'studded leather', type: 'armor', slot: 'torso', skill: 'light_armor', armor: 28, value: 180, desc: 'Leather reinforced with metal studs.' },
  chainmail:     { id: 'chainmail', name: 'a chainmail hauberk', type: 'armor', slot: 'torso', skill: 'chain_armor', armor: 42, value: 400, desc: 'Interlocking rings of steel.' },
  brigandine_coat: { id: 'brigandine_coat', name: 'a brigandine coat', type: 'armor', slot: 'torso', skill: 'brigandine', armor: 55, value: 650, desc: 'Riveted plates sewn into a canvas coat.' },
  plate_cuirass: { id: 'plate_cuirass', name: 'a plate cuirass', type: 'armor', slot: 'torso', skill: 'plate_armor', armor: 72, value: 1100, desc: 'A gleaming breastplate of solid steel.' },
  helm:          { id: 'helm', name: 'an iron helm', type: 'armor', slot: 'head', skill: 'chain_armor', armor: 18, value: 120, desc: 'A simple iron headguard.' },
  leather_boots: { id: 'leather_boots', name: 'sturdy leather boots', type: 'armor', slot: 'feet', skill: 'light_armor', armor: 8, value: 30, desc: 'Worn but reliable boots.' },
  shield_wood:   { id: 'shield_wood', name: 'a round wooden shield', type: 'armor', slot: 'shield', skill: 'shield_usage', armor: 20, value: 70, desc: 'A bossed round shield of oak.' },
  shield_steel:  { id: 'shield_steel', name: 'a steel kite shield', type: 'armor', slot: 'shield', skill: 'shield_usage', armor: 34, value: 320, desc: 'A sturdy steel kite shield.' },
  // Tiered armor
  ring_mail:     { id: 'ring_mail', name: 'ring mail armor', type: 'armor', slot: 'torso', skill: 'chain_armor', armor: 50, value: 600, req: 4, desc: 'A coat of riveted rings over leather.' },
  half_plate:    { id: 'half_plate', name: 'half plate armor', type: 'armor', slot: 'torso', skill: 'plate_armor', armor: 62, value: 950, req: 6, desc: 'Solid steel plates over a chain base.' },
  full_plate:    { id: 'full_plate', name: 'a suit of full plate', type: 'armor', slot: 'torso', skill: 'plate_armor', armor: 78, value: 1600, req: 8, desc: 'A full suit of polished plate, a fortress in steel.' },
  mithril_plate: { id: 'mithril_plate', name: 'mithril plate armor', type: 'armor', slot: 'torso', skill: 'plate_armor', armor: 90, value: 3200, req: 10, desc: 'Gleaming mithril plate, lighter than air and harder than dragon hide.' },
  steel_shield:  { id: 'steel_shield', name: 'a steel tower shield', type: 'armor', slot: 'shield', skill: 'shield_usage', armor: 42, value: 700, req: 6, desc: 'A great tower shield of interlocking steel.' },

  // --- Misc ---
  ration:        { id: 'ration', name: 'a dried ration', type: 'consumable', slot: null, value: 5, restore: 15, desc: 'A chewy ration that restores a little vigor.' },
  salve:         { id: 'salve', name: 'a healing salve', type: 'consumable', slot: null, value: 40, restore: 40, desc: 'A pungent salve that closes wounds.' },
  herb_mint:     { id: 'herb_mint', name: 'a sprig of trailmint', type: 'consumable', slot: null, value: 6, restore: 12, desc: 'A fragrant sprig that steadies the nerves.' },
  herb_root:     { id: 'herb_root', name: 'a bitter root', type: 'consumable', slot: null, value: 12, restore: 22, desc: 'A fibrous root that is said to draw out pain.' },
  potion_heal:   { id: 'potion_heal', name: 'a vial of healing draught', type: 'consumable', slot: null, value: 50, restore: 60, desc: 'A bubbling draught that knits flesh remarkably fast.' },
  potion_mana:   { id: 'potion_mana', name: 'a vial of essence tonic', type: 'consumable', slot: null, value: 55, restoreMana: 60, desc: 'A shimmering tonic that floods the mind with power.' },
  potion_frenzy: { id: 'potion_frenzy', name: 'a vial of frenzy draught', type: 'consumable', slot: null, value: 70, buff: { frenzy: 30 }, desc: 'A fiery draught that sets the blood boiling — +30% damage while it lasts.' },
  strongbox:     { id: 'strongbox', name: 'a locked strongbox', type: 'misc', slot: null, value: 20, desc: 'A heavy iron strongbox, locked and banded. Kobolds and bandits seem fond of these.' },

  // --- Magical devices (cambrinth) ---
  cambrinth_band:    { id: 'cambrinth_band', name: 'a cambrinth band', type: 'cambrinth', slot: null, capacity: 6, value: 150, desc: 'A ring of grey-black cambrinth that drinks and holds spell energy.' },
  cambrinth_pendant: { id: 'cambrinth_pendant', name: 'a cambrinth pendant', type: 'cambrinth', slot: null, capacity: 10, value: 280, desc: 'A pendant of grey-black cambrinth on a silver chain.' },
  cambrinth_orb:     { id: 'cambrinth_orb', name: 'a faceted cambrinth orb', type: 'cambrinth', slot: null, capacity: 30, value: 900, desc: 'A fist-sized orb of faceted cambrinth, humming with stored force.' },

  // --- Barbarian items ---
  warhorn:       { id: 'warhorn', name: 'a warhorn', type: 'misc', slot: null, value: 60, desc: 'A battered horn of brass and bone. Blow it to summon beasts from the wilds.' },
  chakrel_1:     { id: 'chakrel_1', name: 'a chakrel band', type: 'misc', slot: 'neck', value: 120, desc: 'A band of pale stone that quickens the body — it sharpens your meditations.' },
  // Creature loot (skins)
  rat_pelt:      { id: 'rat_pelt', name: 'a rat pelt', type: 'misc', slot: null, value: 8, desc: 'A scrappy grey pelt.' },
  kobold_skin:   { id: 'kobold_skin', name: 'a kobold hide', type: 'misc', slot: null, value: 20, desc: 'A scaly kobold hide.' },
  goblin_skin:   { id: 'goblin_skin', name: 'a goblin hide', type: 'misc', slot: null, value: 30, desc: 'A rank green goblin hide.' },
  wolf_pelt:     { id: 'wolf_pelt', name: 'a wolf pelt', type: 'misc', slot: null, value: 55, desc: 'A thick grey wolf pelt.' },
  cinder_scale:  { id: 'cinder_scale', name: 'a cinder scale', type: 'misc', slot: null, value: 120, desc: 'A smoking, heat-sheened scale from a drake.' },
  iron_ring:     { id: 'iron_ring', name: 'a heavy iron ring', type: 'misc', slot: null, value: 70, desc: 'A crudely worked ring of bandit-forged iron.' },
  silver_ring:   { id: 'silver_ring', name: 'a silver signet ring', type: 'misc', slot: null, value: 150, desc: 'A tarnished silver ring bearing a sigil — plunder of the captain.' },
  wisp_mote:     { id: 'wisp_mote', name: 'a glowing wisp mote', type: 'misc', slot: null, value: 90, desc: 'A tiny, drifting shard of cold light.' },
  wraith_essence:{ id: 'wraith_essence', name: 'a wraith essence', type: 'misc', slot: null, value: 260, desc: 'A whisper of cold blackness that seems to breathe.' },
  dread_sigil:   { id: 'dread_sigil', name: 'a dread knight sigil', type: 'misc', slot: null, value: 600, desc: 'A rune-etched sigil torn from a dark breastplate.' },
  troll_hide:    { id: 'troll_hide', name: 'a troll hide', type: 'misc', slot: null, value: 140, desc: 'A knotted, resilient troll hide.' },
  // Named rare loot
  fang_of_shadowpaw: { id: 'fang_of_shadowpaw', name: 'the Fang of Shadowpaw', type: 'weapon', slot: 'hand', skill: 'small_edged', dmg: [10, 16], speed: 3, value: 900, req: 6, desc: 'A fang-dagger carved from the dire wolf Shadowpaw. It hums with the forest.' },
  chieftains_cleaver: { id: 'chieftains_cleaver', name: "the Chieftain's Cleaver", type: 'weapon', slot: 'hand', skill: 'twohanded_edged', dmg: [22, 38], speed: 7, value: 1800, req: 8, desc: 'A great cleaver taken from the Bandit Chieftain. It is still warm.' },
  drakeheart_amulet: { id: 'drakeheart_amulet', name: 'the Drakeheart Amulet', type: 'armor', slot: 'accessory', skill: 'light_armor', armor: 15, value: 2500, req: 10, desc: 'An amulet cut from the heart-stone of the Cinder Drake King. Heat radiates from it.' },

  // ---- Forging materials ----
  iron_ore:      { id: 'iron_ore', name: 'a lump of iron ore', type: 'misc', slot: null, value: 15, desc: 'A heavy lump of raw iron ore.' },
  // ---- Crafted gear (forged at the Ember Forge, quality-scaled) ----
  forged_short_sword: { id: 'forged_short_sword', name: 'a finely forged short sword', type: 'weapon', slot: 'hand', skill: 'medium_edged', dmg: [7, 15], speed: 4, value: 150, req: 1, desc: 'A short sword hammered out by a smith\u2019s own hand.' },
  forged_steel_sword: { id: 'forged_steel_sword', name: 'a finely forged steel longsword', type: 'weapon', slot: 'hand', skill: 'medium_edged', dmg: [13, 24], speed: 5, value: 520, req: 3, desc: 'A steel longsword forged with real craft.' },
  forged_steel_greatsword: { id: 'forged_steel_greatsword', name: 'a finely forged steel greatsword', type: 'weapon', slot: 'hand', skill: 'twohanded_edged', dmg: [22, 36], speed: 8, value: 880, req: 5, desc: 'A greatsword of the smith\u2019s own making.' },
  forged_mithril_blade: { id: 'forged_mithril_blade', name: 'a finely forged mithril longsword', type: 'weapon', slot: 'hand', skill: 'medium_edged', dmg: [17, 29], speed: 4, value: 1450, req: 7, desc: 'Mithril, folded by hand into a blade of rare quality.' },
  forged_dragonsteel: { id: 'forged_dragonsteel', name: 'a finely forged dragonsteel greatsword', type: 'weapon', slot: 'hand', skill: 'twohanded_edged', dmg: [28, 47], speed: 7, value: 3000, req: 10, desc: 'A legend smelted from dragonsteel and fire.' },
};

export function itemById(id) {
  return ITEMS[id] || null;
}

// Damage string for a weapon, e.g. "6-13".
export function weaponString(item) {
  if (item.type !== 'weapon') return '';
  return `${item.dmg[0]}-${item.dmg[1]}`;
}
