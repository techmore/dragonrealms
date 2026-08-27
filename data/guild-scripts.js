// Guild scripting capabilities for automated test agents (race-guild sweep).
// Facts extracted from our own server implementations (server/commands/*.js,
// data/abilities.js, data/khri.js, data/guilds.js) — these describe what the
// world actually supports, not wiki lore.
//
// Each entry tells the script generator how that guild hunts, what signature
// ability to exercise for fidelity checks, and which skills to TDP-train when
// a circle requirement blocks. `attack` = weapon swings; `magic` = prepare/
// cast loops gated on %mana.

export const GUILD_SCRIPTS = {
  barbarian: {
    magic: false,
    // Weapon swing + barb expertise study; roar/berserk are fidelity probes.
    fight: ['put attack %target', 'put analyze'],
    preFight: [],            // roar needs an active fight — see signatureAfter
    // Where the signature ability goes in the fight loop. Two failure modes to
    // thread between, both measured:
    //   - AFTER all the swings: attack charges 3s RT and roar is in RT_BLOCK,
    //     so it was refused 417/417 times in one live run.
    //   - BEFORE any swing (preFight): barbarianAbility() requires an active
    //     combat, so it answers "That takes battle around you" and grants
    //     nothing.
    // The only slot that works is straight after the FIRST attack: combat now
    // exists, and the roar is parked by the engine until that attack's RT
    // drains, then applied. Index 1 = after fight[0].
    signatureAfter: 1,
    signature: { cmd: 'roar everilds_rage', ok: /roar a battle cry|blood ablaze|voice is spent/i, probe: 'ability' },
    armVerb: 'wield',        // club from the bazaar
    // Synergistic weapon plan — a deliberate 2-then-3 weapon kit, not a
    // random ladder. Circle 2 demands FOUR weapon skills (1st@8, 2nd@8,
    // 3rd@4, 4th@2); hunting with one weapon only ever trains its own
    // skill, leaving slots 2-4 to TDP-only grind (~130+ TDPs we cannot
    // afford). The plan pairs trainer-taught categories so every category
    // doubles as hall training: barbarian primary = twohanded_blunt /
    // large_edged, secondary = blunt / thrown.
    //   1. club (blunt)        112s  — day-one floor, funds itself
    //   2. throwing_knives (thrown) 30s — SECOND weapon immediately; 1H, no burden
    //   3. mace (blunt)        206s  — primary upgrade once pelts fund it
    // rotateEvery = kills per weapon swap: each kill then feeds whichever
    // weapon is wielded, so 2nd/3rd weapon ranks accrue from field exp
    // instead of TDPs alone.
    weaponPlan: {
      weapons: ['club', 'throwing_knives', 'mace'],
      rotateEvery: 4,
    },
    arena: null,             // nearest spawn room (generator picks)
    trainSets: {
      weapon: ['large_edged', 'twohanded_edged', 'twohanded_blunt', 'blunt', 'thrown', 'staff'],
      armor: ['light_armor', 'brigandine', 'chain_armor', 'shield_usage'],
      survival: ['perception', 'foraging', 'athletics', 'climbing', 'first_aid', 'scouting', 'hunting', 'tracking', 'skinning'],
      lore: ['appraisal', 'scholarship'],
    },
    defaultTrain: ['expertise', 'parry', 'evasion', 'light_armor', 'large_edged',
      'twohanded_blunt', 'fitness', 'perception', 'foraging', 'athletics',
      'scouting', 'hunting', 'appraisal', 'tactics', 'inner_fire'],
    // Abilities to learn on each guild-hall trip, in priority order. Taught
    // only at the hall (server/commands/combat.js learn()), and slots are
    // scarce early: barbarianSlots() gives 1 + floor(circle/2), so a circle-1
    // agent can hold exactly ONE. everilds_rage leads because it is req:0
    // (learnable immediately) AND is the ability the generated fight loop
    // already fires as the guild's signature verb. Later entries pick up as
    // circling frees slots; extras fail harmlessly with "no free ability
    // slots" / path-requirement prose and fall through.
    learnAbilities: ['everilds_rage', 'dragon', 'tenacity', 'wildfire', 'screech'],
    // Free ability slots at a given circle — used by the circle script to
    // learn only what can actually stick. barbarianSlots = 1 + floor(c/2).
    abilitySlots: (circle) => 1 + Math.floor(circle / 2),
    fidelityChecks: [
      { name: 'analyze-expertise', re: /You analyze|combo|expertise/i },
      { name: 'roar-ability', re: /roar a battle cry|blood ablaze|voice is spent/i },
    ],
  },

  thief: {
    magic: false,
    fight: ['put hide', 'put backstab %target', 'put attack %target'],
    preFight: ['put khri elusion'],   // concentration pool; stealth gated separately
    signature: { cmd: 'khri focus', ok: /You focus Khri/i, probe: 'khri' },
    armVerb: 'wield',
    trainSets: {
      weapon: ['small_edged', 'small_blunt', 'thrown', 'staff', 'large_edged'],
      armor: ['light_armor', 'shield_usage'],
      survival: ['stealth', 'perception', 'athletics', 'climbing', 'lockpicking', 'first_aid', 'hiding'],
      lore: ['appraisal', 'scholarship'],
    },
    defaultTrain: ['backstab', 'stealth', 'evasion', 'light_armor', 'small_edged',
      'perception', 'athletics', 'appraisal', 'lockpicking'],
    fidelityChecks: [
      { name: 'khri-focus', re: /You focus Khri/i },
      { name: 'backstab-attempt', re: /backstab|from behind|surprise/i },
    ],
  },

  trader: {
    magic: false,
    fight: ['put attack %target'],
    preFight: [],
    signature: { cmd: 'appraise club', ok: /worth about|apprais/i, probe: 'appraise' },
    // Identity verbs fired at the bazaar before the hunt: haggle like a
    // trader (chaffer), then work the field.
    identityVerbs: ['chaffer'],
    armVerb: 'wield',
    trainSets: {
      weapon: ['small_blunt', 'staff', 'thrown', 'large_blunt'],
      armor: ['light_armor', ' Brigandine'.trim().toLowerCase(), 'shield_usage'],
      survival: ['perception', 'foraging', 'athletics', 'first_aid', 'scouting'],
      lore: ['trading', 'appraisal', 'scholarship'],
    },
    defaultTrain: ['trading', 'appraisal', 'evasion', 'light_armor', 'small_blunt',
      'perception', 'foraging', 'athletics'],
    fidelityChecks: [
      { name: 'appraise-item', re: /worth about \d+ silvers/i },
      // Chaffer is the trader's signature haggling verb (fires in town before
      // the hunt; refusal prose still proves the verb ran).
      { name: 'chaffer', re: /roll your shoulders|next sale will run|Chaffer with whom/i },
    ],
  },

  warmage: {
    magic: true,
    // Caster loop: prepare -> cast at target; mana-gated by the driver script
    // via iflt mana. Weapon swings fill mana-poor rounds.
    fight: ['put prepare fire_shard', 'put wait', 'put cast %target'],
    fallbackFight: ['put attack %target'],
    preFight: [],
    signature: { cmd: 'prepare fire_shard', ok: /You begin preparing Fire Shard/i, probe: 'spell' },
    armVerb: 'wield',
    spellsByCircle: { 1: 'fire_shard', 3: 'lightning', 5: 'storm_burst' },
    trainSets: {
      weapon: ['medium_edged', 'blunt', 'staff'],
      armor: ['chain_armor', 'shield_usage'],
      survival: ['perception', 'athletics', 'first_aid', 'scouting'],
      lore: ['elemental_lore', 'attunement', 'scholarship', 'appraisal'],
      magic: ['war_magic', 'offensive_magic', 'primary_magic'],
    },
    defaultTrain: ['war_magic', 'offensive_magic', 'primary_magic', 'summoning',
      'targeted_magic', 'evasion', 'parry', 'chain_armor', 'shield_usage',
      'medium_edged', 'attunement', 'elemental_lore', 'scholarship', 'perception'],
    fidelityChecks: [
      { name: 'prepare-spell', re: /You begin preparing/i },
      { name: 'cast-lands', re: /You cast Fire Shard|engulfed for \d+ damage/i },
    ],
  },

  bard: {
    magic: true,
    fight: ['put prepare chime', 'put wait', 'put cast %target'],
    fallbackFight: ['put attack %target'],
    // Bardic identity first: start an enchante, then fight under it.
    preFight: ['put enchant war'],
    // Segue cycles between the other two songs each hunt (DR Segue) —
    // exercises transitions and keeps Bardic Lore training in the field.
    segueCycle: ['bravery', 'regen'],
    signature: { cmd: 'enchant war', ok: /begin an enchante|driving war march/i, probe: 'enchante' },
    armVerb: 'wield',
    spellsByCircle: { 1: 'chime', 3: 'lullaby', 5: 'song_of_woe' },
    trainSets: {
      weapon: ['small_edged', 'small_blunt', 'staff', 'thrown'],
      armor: ['light_armor', 'shield_usage'],
      survival: ['perception', 'athletics', 'first_aid', 'scouting', 'hiding'],
      lore: ['bardic_lore', 'scholarship', 'appraisal', 'attunement'],
      magic: ['offensive_magic', 'primary_magic', 'bardic_lore'],
    },
    defaultTrain: ['bardic_lore', 'primary_magic', 'offensive_magic', 'enchantes',
      'evasion', 'light_armor', 'small_edged', 'perception', 'scholarship'],
    fidelityChecks: [
      { name: 'enchante-start', re: /begin an enchante|war march/i },
      { name: 'cast-chime', re: /You cast Chime|engulfed for \d+ damage/i },
    ],
  },

  cleric: {
    magic: true,
    fight: ['put prepare sacred_flame', 'put wait', 'put cast %target'],
    fallbackFight: ['put attack %target'],
    preFight: [],
    signature: { cmd: 'pray', ok: /pray|peace steadies/i, probe: 'theurgy' },
    armVerb: 'wield',
    spellsByCircle: { 1: 'sacred_flame', 3: 'wrath', 5: 'judgement' },
    trainSets: {
      weapon: ['medium_blunt', 'large_blunt', 'staff'],
      armor: ['chain_armor', 'plate_armor', 'shield_usage'],
      survival: ['perception', 'first_aid', 'foraging', 'athletics'],
      lore: ['theurgy', 'attunement', 'scholarship'],
      magic: ['offensive_magic', 'primary_magic', 'theurgy'],
    },
    defaultTrain: ['theurgy', 'primary_magic', 'offensive_magic', 'defensive_magic',
      'evasion', 'chain_armor', 'medium_blunt', 'attunement', 'first_aid', 'perception'],
    fidelityChecks: [
      { name: 'pray-theurgy', re: /kneel.*pray|peace steadies/i },
      { name: 'cast-sacred-flame', re: /You cast Sacred Flame|engulfed for \d+ damage/i },
    ],
  },

  empath: {
    magic: true,
    fight: ['put attack %target'],   // empaths lean on weapons; heals are their magic
    healSpell: 'soothe',             // self-heal between fights instead of rest-only
    preFight: [],
    signature: { cmd: 'prepare soothe', ok: /You begin preparing Soothe/i, probe: 'spell' },
    armVerb: 'wield',
    spellsByCircle: { 1: 'soothe', 3: 'mending' },
    trainSets: {
      weapon: ['small_edged', 'staff', 'small_blunt'],
      armor: ['light_armor'],
      survival: ['first_aid', 'perception', 'foraging', 'athletics'],
      lore: ['empathy', 'attunement', 'scholarship'],
      magic: ['healing_magic', 'primary_magic', 'empathy'],
    },
    defaultTrain: ['empathy', 'primary_magic', 'defensive_magic', 'first_aid',
      'evasion', 'light_armor', 'small_edged', 'attunement', 'perception'],
    fidelityChecks: [
      { name: 'heal-soothe', re: /Soothe|warmth.*knit|soothing/i },
    ],
  },

  moonmage: {
    magic: true,
    fight: ['put prepare moon_bolt', 'put wait', 'put cast %target'],
    fallbackFight: ['put attack %target'],
    preFight: [],
    signature: { cmd: 'prepare moon_bolt', ok: /You begin preparing Moon Bolt/i, probe: 'spell' },
    armVerb: 'wield',
    spellsByCircle: { 1: 'moon_bolt', 3: 'shadowstep', 5: 'eclipse_ward' },
    trainSets: {
      weapon: ['staff', 'small_edged', 'large_edged'],
      armor: ['light_armor'],
      survival: ['perception', 'scouting', 'astrology', 'athletics', 'foraging'],
      lore: ['astrology', 'attunement', 'scholarship'],
      magic: ['offensive_magic', 'primary_magic', 'astrology'],
    },
    defaultTrain: ['astrology', 'primary_magic', 'offensive_magic', 'attunement',
      'evasion', 'light_armor', 'staff', 'perception', 'scouting'],
    fidelityChecks: [
      { name: 'cast-moon-bolt', re: /You cast Moon Bolt|engulfed for \d+ damage/i },
    ],
  },

  necromancer: {
    magic: true,
    fight: ['put prepare bone_spear', 'put wait', 'put cast %target'],
    fallbackFight: ['put attack %target'],
    preFight: [],
    signature: { cmd: 'prepare rot', ok: /You begin preparing Rot|learn Rot at circle/i, probe: 'spell' },
    armVerb: 'wield',
    spellsByCircle: { 1: 'bone_spear', 3: 'rot', 5: 'grave_mist' },
    trainSets: {
      weapon: ['large_edged', 'staff', 'small_blunt'],
      armor: ['light_armor', 'brigandine'],
      survival: ['first_aid', 'perception', 'thanatology', 'athletics'],
      lore: ['thanatology', 'attunement', 'scholarship'],
      magic: ['offensive_magic', 'primary_magic', 'thanatology'],
    },
    defaultTrain: ['thanatology', 'primary_magic', 'offensive_magic', 'attunement',
      'evasion', 'light_armor', 'large_edged', 'first_aid', 'perception'],
    fidelityChecks: [
      { name: 'cast-bone-spear', re: /You cast Bone Spear|engulfed for \d+ damage/i },
    ],
  },

  paladin: {
    magic: true,
    fight: ['put prepare smite', 'put wait', 'put cast %target', 'put attack %target'],
    fallbackFight: ['put attack %target'],
    preFight: [],            // ward/bulwark learned later; keep level-1 simple
    signature: { cmd: 'prepare smite', ok: /You begin preparing Smite/i, probe: 'spell' },
    armVerb: 'wield',
    spellsByCircle: { 1: 'smite', 3: 'ward', 5: 'holy_bulwark' },
    trainSets: {
      weapon: ['twohanded_edged', 'large_edged', 'large_blunt'],
      armor: ['plate_armor', 'chain_armor', 'shield_usage', 'brigandine'],
      survival: ['perception', 'first_aid', 'athletics', 'climbing'],
      lore: ['conviction', 'attunement', 'scholarship'],
      magic: ['defensive_magic', 'offensive_magic', 'conviction'],
    },
    defaultTrain: ['conviction', 'primary_magic', 'defensive_magic', 'offensive_magic',
      'evasion', 'chain_armor', 'twohanded_edged', 'shield_usage', 'first_aid', 'perception'],
    fidelityChecks: [
      { name: 'cast-smite', re: /You cast Smite|engulfed for \d+ damage/i },
    ],
  },

  ranger: {
    magic: true,
    fight: ['put attack %target'],   // rangers swing; hunters_mark is a buff probe
    preFight: [],
    signature: { cmd: 'track', ok: /track|signs|trail/i, probe: 'scout-cmd' },
    armVerb: 'wield',
    spellsByCircle: { 1: 'camouflage', 3: 'hunters_mark' },
    trainSets: {
      weapon: ['bow', 'small_edged', 'staff', 'thrown'],
      armor: ['light_armor'],
      survival: ['scouting', 'hunting', 'tracking', 'foraging', 'perception', 'climbing', 'skinning'],
      lore: ['attunement', 'scholarship'],
      magic: ['primary_magic', 'scouting'],
    },
    defaultTrain: ['scouting', 'hunting', 'tracking', 'primary_magic',
      'evasion', 'light_armor', 'small_edged', 'perception', 'foraging', 'skinning'],
    fidelityChecks: [
      { name: 'track-wilds', re: /read the signs|No tracks to follow|signs are too faint/i },
    ],
  },
};

export const RACE_MATRIX = {
  // Curated race pairs per guild archetype: racial-stat fit / mid / poor,
  // exercising chargen allocation spread without running all 12x11 combos.
  barbarian: ['giantman', 'human', 'halfling'],
  thief: ['halfling', 'prydaen', 'giantman'],
  trader: ['gnome', 'human', 'gortog'],
  warmage: ['elf', 'elothean', 'dwarf'],
  bard: ['elothean', 'human', 'gortog'],
  cleric: ['human', 'dwarf', 'skra'],
  empath: ['halfling', 'elf', 'kaldar'],
  moonmage: ['elothean', 'elf', 'gortog'],
  necromancer: ['kaldar', 'skra', 'halfling'],
  paladin: ['dwarf', 'human', 'prydaen'],
  ranger: ['prydaen', 'rakash', 'gnome'],
};

// Benchmark variant matrix — the single source of truth for the sweep CLI,
// the GM API (/api/gm/scripts) and the Sims page knob table. Each variant is
// ONE knob changed against baseline (kaizen rule), with its hypothesis
// written down so a variant whose diff spans several knobs can't hide.
//   restPct         — supervisor rest interlock floor (% of maxhp; stand at 90%)
//   hallEvery       — kills between forced guild-hall trips while hunting
//   arenaBand       — allowed creature-circle spread above the agent's circle
//   hallFallbackMs  — blind hall-trip timer; the rank-readiness gate still
//                     fires immediately when ranks actually qualify
export const VARIANTS = {
  baseline: {
    restPct: 35, hallEvery: 4, arenaBand: 2, hallFallbackMs: 240000,
    hypothesis: 'Control — every other variant changes exactly one knob against it.',
  },
  baseline_v2: {
    restPct: 35, hallEvery: 4, arenaBand: 2, hallFallbackMs: 540000,
    diff: ['hallFallbackMs'],
    hypothesis: 'Blind hall timer 4m -> 9m: trust the rank-readiness gate so short runs hunt instead of commuting.',
  },
  rest50: {
    restPct: 50, hallEvery: 4, arenaBand: 2, hallFallbackMs: 240000,
    diff: ['restPct'],
    hypothesis: 'Rest at 50% HP instead of 35% — fewer deaths vs less time hunting.',
  },
  hall8: {
    restPct: 35, hallEvery: 8, arenaBand: 2, hallFallbackMs: 240000,
    diff: ['hallEvery'],
    hypothesis: 'Hall trip every 8 kills instead of 4 — more hunting, slower TDP spend.',
  },
  wide2: {
    restPct: 35, hallEvery: 6, arenaBand: 4, hallFallbackMs: 240000,
    diff: ['hallEvery', 'arenaBand'],
    hypothesis: 'Wider creature weight class (+4 circles, hall every 6) — faster exp, higher death risk.',
  },
  roarSmart: {
    restPct: 35, hallEvery: 4, arenaBand: 2, hallFallbackMs: 240000,
    skipRage: true,
    diff: ['skipRage'],
    hypothesis: 'Skip the signature roar while a rage is already active. Rage lasts 12 ticks; a fight lasts ~2, so the per-fight roar is refused ("The rage already burns in you") on every fight after the first — wasted RT, stalled swings, fidelity-log noise. Rationale for exp impact: _useAbilityInner refuses the verb, so the wrapper grants NO augmentation either way (res.ok gate); roaring only when it can land loses nothing.',
  },
  diversity: {
    restPct: 35, hallEvery: 4, arenaBand: 2, hallFallbackMs: 240000,
    closeNth: true,
    diff: ['closeNth'],
    hypothesis: 'Close the Nth-set circle-2 slots (2nd/3rd/4th weapon, 2nd armor) that primary-pool grinding cannot reach: (1) the per-kill weapon rotation now branches on GROUND TRUTH (%wsp mirrored from the hands snapshot) instead of a %wphase flip-flop whose memory died with every cycle restart — after each restart the undefined variable interpolated literally and always took the club arm (log evidence: 16 remove-knives / 0 wield-knives in one run), and (2) hall tdptrain retargeting picks the EXACT Nth-ranked blocking pool member per missing set line instead of flooding every candidate; kit swaps mace (blunt dupe) -> staff and adds an iron helm for chain_armor field exp.',
  },
  diversity2: {
    restPct: 35, hallEvery: 4, arenaBand: 2, hallFallbackMs: 240000,
    closeNth: true,
    tdpFloor: 4,
    helmRetry: true,
    diff: ['tdpFloor', 'helmRetry'],
    hypothesis: 'Two evidence-backed closures on top of diversity: (1) tdpFloor 8 -> 4 — tdptrain costs 4+3*rank, so the cheapest useful spend is 4 TDPs; the floor of 8 blocked a hall trip at 4 TDPs while shortfall sat at 10 (kjvh log: "[hall-skip] only 4 TDPs"). At 4 the trip can still buy 1-2 rank-0 members (3rd-weapon / 2nd-survival slots sit at rank 0-2). (2) helmRetry — the diversity kit\'s iron helm never fires: the first-visit gate needs 120s silver but club(112s)+knives+armor drain the 150s purse, so 2nd armor was stuck 1/2 by economics. Every hall trip already passes the bazaar with banked loot silver; retry the buy there. Payoff beyond the 2nd armor slot itself: armor exp is granted PER WORN PIECE per landed blow (server/combat.js), so chain_armor worn roughly doubles 1st-armor income too (2/6 blocker).',
  },
};
