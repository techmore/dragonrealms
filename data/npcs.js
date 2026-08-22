// NPC templates: service NPCs that stock shops, train guilds, and heal (clean-room).

export const NPCS = {
  towncrier: {
    id: 'towncrier', name: 'the town crier', role: 'info',
    desc: 'A loud-voiced fellow in a patched tabard ringing a small brass bell.',
    greeting: 'Hear ye! Ask me about the realm with "ask crier help".',
  },
  guard: {
    id: 'guard', name: 'a town guard', role: 'info',
    desc: 'A grim guard in a steel helm, hand resting on his sword.',
    greeting: 'Keep the peace, and the Crossing will keep you. New to the walls? Ask me "hunting" and I\'ll point you at what the gates hold back.',
  },
  shopkeeper: {
    id: 'shopkeeper', name: 'Marlene, the general storekeeper', role: 'shop',
    desc: 'A round-cheeked woman in an apron, wiping her hands on a rag.',
    greeting: 'Welcome! Everything you could need, at fair prices. Type "list" to browse.',
    stock: { ration: 20, salve: 10, arrows: 30, bolts: 20, dagger: 8, sling: 10, herb_mint: 15, herb_root: 10, potion_heal: 5, potion_frenzy: 40, potion_swiftness: 60, potion_vigor: 30, cambrinth_band: 3, cambrinth_pendant: 2, warhorn: 2, chakrel_1: 1 },
    buys: ['rat_pelt', 'kobold_skin', 'goblin_skin', 'wolf_pelt', 'wisp_mote', 'troll_hide'],
  },
  weaponsmith: {
    id: 'weaponsmith', name: 'Old Thorne, the weaponsmith', role: 'shop',
    desc: 'A grizzled smith with soot in his beard, arms like tree roots.',
    greeting: 'Steel wants to be swung, friend. Browse my rack and pick your poison.',
    stock: { short_sword: 6, long_sword: 4, broadsword: 3, greatsword: 2, mace: 6, warhammer: 2, staff: 5, hunting_bow: 4, light_crossbow: 3, throwing_knives: 8, club: 10, hand_axe: 6, offhand_blade: 5 },
    buys: [],
  },
  armorer: {
    id: 'armorer', name: 'Briga, the armorer', role: 'shop',
    desc: 'A stern woman whose arms gleam in rings of mail.',
    greeting: 'Armor is a promise. Type "list" and keep your promises.',
    stock: { padded_cloth: 8, leather: 6, studded: 4, chainmail: 3, brigandine_coat: 2, plate_cuirass: 1, helm: 5, leather_boots: 8, shield_wood: 5, shield_steel: 2 },
    buys: [],
  },
  quartermaster: {
    id: 'quartermaster', name: 'Sergeant Voss, the quartermaster', role: 'shop',
    desc: 'A hard-eyed soldier in a patched uniform, keys jangling at his belt.',
    greeting: 'High-tier kit for proven hands. If you can\'t wield it yet, you\'ll not buy it. Type "list".',
    stock: {
      steel_sword: 3, steel_mace: 3, steel_greatsword: 2, yew_longbow: 3, war_crossbow: 2,
      mithril_blade: 1, dragonsteel_greatsword: 1, ring_mail: 3, half_plate: 2, full_plate: 1,
      mithril_plate: 1, steel_shield: 2, cambrinth_orb: 1,
    },
    buys: ['wisp_mote', 'troll_hide', 'iron_ring', 'silver_ring', 'garnet', 'sapphire', 'emerald', 'diamond'],
  },
  tanner: {
    id: 'tanner', name: 'Aldric, the tanner', role: 'shop',
    desc: 'A stooped man with hands stained dark from curing hides, stretching a fresh pelt over a wooden frame.',
    greeting: 'Bring me your hides and trophies — skins, scales, and stranger things. I pay well. Type "list" to see my leathers.',
    stock: { leather: 4, leather_boots: 5, shield_wood: 3 },
    buys: ['rat_pelt', 'crab_shell', 'reed_skin', 'kobold_skin', 'hog_hide', 'goblin_skin', 'wolf_pelt', 'troll_hide', 'cinder_scale', 'wraith_essence', 'dread_sigil', 'viper_fang', 'organ_vial'],
  },
  banker: {
    id: 'banker', name: 'Galen, the banker', role: 'bank',
    desc: 'A neat man in sober wool who counts coins without looking down.',
    greeting: 'Keep your silvers safe with us. Try "deposit <amount>" or "withdraw <amount>".',
  },
  healer: {
    id: 'healer', name: 'Sister Cora, the healer', role: 'healer',
    desc: 'A calm woman in white robes, hands folded, patient eyes kind.',
    greeting: 'Come, let me see your wounds. Say "heal" and I will tend you for a small offering.',
  },
  alchemist: {
    id: 'alchemist', name: 'Fennel, the alchemist', role: 'craft',
    desc: 'A small, soot-smudged man surrounded by bubbling glassware and hanging herbs.',
    greeting: 'Herbs, motes, and patience — that is all alchemy asks. Say "craft" to see my recipes.',
  },
  fane_keeper: {
    id: 'fane_keeper', name: 'Grandmaster Odal, the fane keeper', role: 'info',
    desc: 'A sinewy old master with eyes like flint, arms folded across a scarred chest.',
    greeting: 'TDPs are spent here, in the Fane of Training. Type "train <stat>" twice to steel yourself and commit.',
  },
  forge_master: {
    id: 'forge_master', name: 'Bram the Ironhand, the forge master', role: 'craft',
    desc: 'A barrel-chested smith with soot-etched arms, hammer resting on one shoulder.',
    greeting: 'Bring me ore and cinder scale, and I\'ll teach your hands the hammer. Say "forge" to see the recipes.',
  },
  tailor: {
    id: 'tailor', name: 'Mara, the tailor', role: 'craft',
    desc: 'A quick-fingered woman surrounded by hides, needles, and spools of tough thread.',
    greeting: 'Bring me pelts and hides, and I\'ll teach you the cut and the stitch. Say "tailor" to see the patterns.',
  },
  jailer: {
    id: 'jailer', name: 'Jailer Grum', role: 'info',
    desc: 'A tired man in a rusted breastplate, keys clinking at his belt.',
    greeting: 'Plead guilty and pay your fine, or plead innocent and wait for the judge. Either way, you\'ll think twice about thieving.',
  },
  dockmaster: {
    id: 'dockmaster', name: 'Old Whit, the dockmaster', role: 'info',
    desc: 'A weathered man in tar-stained oilskins, watching the river with knowing eyes.',
    greeting: 'The barge upriver to Riverhaven leaves from the Amusement Pier. Ask me about the town with "ask Whit help".',
  },
  pier_master: {
    id: 'pier_master', name: 'Rollo, the pier master', role: 'info',
    desc: 'A showman in a velvet vest, rattling a cup of coppers.',
    greeting: 'Try your luck at the coin table — "play" for a copper. The house is always fair. Almost always.',
  },
  pit_master: {
    id: 'pit_master', name: 'Sable, the pit master', role: 'craft',
    desc: 'A razor-thin woman in grey, chalk in hand, watching the board with hungry eyes.',
    greeting: 'The board moves every hour. Buy low, sell high, and don\'t blink. Say "pit" to read the prices.',
  },
  mags: {
    id: 'mags', name: 'Mags, the firewood peddler', role: 'shop',
    desc: 'Short and round, Mags is a motherly peddler in bright, oft-patched garments and a merry blue scarf. A bin half full of sticks and branches rests beside her.',
    greeting: 'Sell me sticks and branches for a few coppers, dearie. Say "sell branch" or "sell stick" — I pay fair for kindling.',
    stock: {},
    buys: ['stick', 'branch'],
  },
  stablehand: {
    id: 'stablehand', name: 'Nance, the stablehand', role: 'info',
    desc: 'A cheerful woman in a leather vest, forking hay and chatting with caravan drivers.',
    greeting: 'The caravans water their teams here on the way to the ruins and the north. Ask me about the town with "ask Nance help".',
  },

  // Guild leaders (trainers)
  leader_barbarian: { id: 'leader_barbarian', name: 'Warchief Ulfgar', role: 'guild', guild: 'barbarian', desc: 'A mountain of a man with a beard braided with trophies.', greeting: 'The wild calls to those with fury in their blood. Say "circle" when you are ready to advance.' },
  leader_bard: { id: 'leader_bard', name: 'Lyra Brighttune', role: 'guild', guild: 'bard', desc: 'A silver-haired bard with a lute and a knowing smile.', greeting: 'Music is the oldest magic. Say "circle" when your song grows.' },
  leader_cleric: { id: 'leader_cleric', name: 'Father Aldermac', role: 'guild', guild: 'cleric', desc: 'A stern priest whose robes hide a warrior\'s build.', greeting: 'The gods test their servants. Say "circle" when you are worthy.' },
  leader_empath: { id: 'leader_empath', name: 'Healer Lissa', role: 'guild', guild: 'empath', desc: 'A gentle soul whose eyes carry the weight of every wound she has felt.', greeting: 'Feel, then mend. Say "circle" when you are ready.' },
  leader_moonmage: { id: 'leader_moonmage', name: 'Star-Speaker Vess', role: 'guild', guild: 'moonmage', desc: 'A robed figure whose eyes seem to hold the night sky.', greeting: 'The moons favor the patient. Say "circle" when the stars align.' },
  leader_necromancer: { id: 'leader_necromancer', name: 'Gravewarden Mort', role: 'guild', guild: 'necromancer', desc: 'A pale scholar in funereal black, smelling of earth and herbs.', greeting: 'Death is a door, not an end. Say "circle" when you are ready.' },
  leader_paladin: { id: 'leader_paladin', name: 'Sir Valeran', role: 'guild', guild: 'paladin', desc: 'A knight in silvered plate, shield bearing a radiant sun.', greeting: 'Steel and faith. Say "circle" when you are proven.' },
  leader_ranger: { id: 'leader_ranger', name: 'Keeper Rowan', role: 'guild', guild: 'ranger', desc: 'A lean woodsman in greens, fox-cloak over one shoulder.', greeting: 'The woods keep their own score. Say "circle" when the trail calls.' },
  leader_thief: { id: 'leader_thief', name: 'Mist, of the shadow hand', role: 'guild', guild: 'thief', desc: 'A figure you only half-notice, hooded and still as stone.', greeting: 'Quiet work. Say "circle" when the shadows know your name.' },
  leader_trader: { id: 'leader_trader', name: 'Margrave Kessel', role: 'guild', guild: 'trader', desc: 'A merchant in rich silks, rings flashing on every finger.', greeting: 'Everything is a bargain. Say "circle" when your ledger is full.' },
  leader_warmage: { id: 'leader_warmage', name: 'Pyra Ignis', role: 'guild', guild: 'warmage', desc: 'A battle-mage whose gauntlets glow with faint runes.', greeting: 'Burn brightly. Say "circle" when you command the elements.' },
};

export function npcById(id) {
  return NPCS[id] || null;
}
