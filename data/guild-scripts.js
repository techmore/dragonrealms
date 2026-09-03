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
    // NOTE (2026-08-29): the roar's server response ("You roar a battle cry…")
    // was never observed in the sweep because the engine was leaking the parked
    // roar out ~during the attack's roundtime ("You must wait N seconds"), so
    // the fidelity regex /roar a battle cry|blood ablaze|voice is spent/ never
    // fired (honest 0/2, not a bad regex). Fixed in script-engine.js: rtUntil
    // is now a floor (Math.max) so an early/low-RT prompt can't shorten the
    // deadline a parked verb fires on.
    signatureAfter: 1,
    signature: { cmd: 'roar everilds_rage', ok: /roar a battle cry|blood ablaze|voice is spent/i, probe: 'ability' },
    armVerb: 'wield',        // club from the bazaar
    // Synergistic weapon plan — a deliberate 2-then-3 weapon kit, not a
    // random ladder. Circle 2 demands FOUR weapon skills (1st@8, 2nd@8,
    // 3rd@4, 4th@2); hunting with one weapon only ever trains its own
    // skill, leaving slots 2-4 untrained. The plan pairs trainer-taught categories so every category
    // doubles as hall training: barbarian primary = twohanded_blunt /
    // large_edged, secondary coverage begins with stocked blunt / slings.
    //   1. club (blunt)        112s  — day-one floor, funds itself
    //   2. sling (slings)        20s — stocked SECOND weapon immediately; no burden
    //   3. mace (blunt)        206s  — primary upgrade once pelts fund it
    // rotateEvery = kills per weapon swap: each kill then feeds whichever
    // weapon is wielded, so 2nd/3rd weapon ranks accrue from field exp
    // instead of TDPs alone.
    // Mandated baseline kit: four distinct shop-stocked weapon lanes plus a
    // shield and two armor categories. Variants may tune rotation/resting,
    // but must not reopen basic gear decisions below the high-level tier.
    weaponPlan: {
      weapons: ['dagger', 'club', 'broadsword', 'sling'],
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
      // Match the *analyze* ability's own prose, NOT the `exp` command's
      // "expertise at least rank N (you have 0)" requirement line — the old
      // /expertise/ clause false-positived on exp output, inflating the score.
      { name: 'analyze-expertise', re: /study the flow of battle|finish your \w+ combo/i },
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
    // KAIZEN (2026-08-28): dropped the literal `put wait` from the fight
    // array. The generator (script-gen.mjs) ALREADY appends a `wait` after
    // every step, so `'put wait'` became a stray verb sent to the server —
    // sandwiched between two engine `wait`s. When the engine RT-parks and
    // retries that stray step, it desynced the engine's rtUntil from the
    // server's real roundtime, so the following `cast` slipped out ~2s early
    // and was refused ("You must wait 2 seconds") every cycle → kills stayed 0
    // → could never circle. The same stray literal was present in bard/cleric/
    // moonmage/necromancer/paladin too; ALL casters now omit it (2026-08-29)
    // so the prepare→cast loop is gated purely by the generator's per-step
    // `wait` plus the engine's RT-park.
    fight: ['put prepare fire_shard', 'put cast %target'],
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
    // No literal `put wait`: the generator (script-gen.mjs) appends a `wait`
    // after every step, so a stray `put wait` becomes a real verb that desyncs
    // the engine's rtUntil from the server's roundtime and gets the following
    // `cast` refused ("You must wait N seconds") every cycle. Same latent
    // blocker that was fixed for warmage — applied uniformly to all casters.
    fight: ['put prepare chime', 'put cast %target'],
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
    // No literal `put wait` (see bard note): generator appends `wait` per step.
    fight: ['put prepare sacred_flame', 'put cast %target'],
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
    // No literal `put wait` (see bard note): generator appends `wait` per step.
    fight: ['put prepare moon_bolt', 'put cast %target'],
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
    // No literal `put wait` (see bard note): generator appends `wait` per step.
    fight: ['put prepare bone_spear', 'put cast %target'],
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
    // No literal `put wait` (see bard note): generator appends `wait` per step.
    fight: ['put prepare smite', 'put cast %target', 'put attack %target'],
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
      survival: ['scouting', 'hunting', 'tracking', 'foraging', 'perception', 'climbing', 'skinning', 'first_aid'],
      lore: ['attunement', 'scholarship'],
      magic: ['primary_magic', 'scouting'],
    },
    defaultTrain: ['scouting', 'hunting', 'tracking', 'primary_magic',
      'evasion', 'light_armor', 'small_edged', 'perception', 'foraging', 'skinning', 'first_aid'],
    fidelityChecks: [
      { name: 'track-wilds', re: /read the signs|No tracks to follow|signs are too faint/i },
    ],
  },
};

export const RACE_MATRIX = {
  // Curated race pairs per guild archetype: racial-stat fit / mid / poor,
  // exercising chargen allocation spread without running all 12x11 combos.
  // DR-faithful races only — giantman was a GemStone IV leak. Gor'Tog is
  // DR's biggest frame (barbarian fit), Kaldar the bulky mid; halfling stays
  // the poor-fit pole to exercise chargen spread.
  barbarian: ['gortog', 'kaldar', 'halfling'],
  thief: ['halfling', 'prydaen', 'gortog'],
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
  diversity2stack: {
    restPct: 35, hallEvery: 4, arenaBand: 2, hallFallbackMs: 240000,
    closeNth: true,
    tdpFloor: 4,
    helmRetry: true,
    armorStack: true,
    diff: ['armorStack'],
    hypothesis: 'Close the LAST circle-2 blocker (1st armor 5/6, apaa run) by stacking WORN light_armor pieces. Server-side verdict first (2026-08-27): the armor-exp loop in server/combat.js grants `circle*3 + piece.armor/8` per LANDED BLOW per WORN piece — independent of damage soaked (armor only scales dmg, never deflects a blow), so a "naked-tank" pull trains NOTHING (the loop body is Object.entries(player.equipment)) and a cheaper piece trains nothing extra. The only lever is pieces WORN: the kit had exactly ONE light_armor piece (padded cloth torso) + the chain helm. armorStack buys+wears leather sleeves (45s), leather boots (30s) and leather leggings (55s) at the bazaar (purse-gated; retried at every hall-trip errand stop like helmRetry) — ~4x light_armor exp per landed blow. One variable vs diversity2.',
  },
  diversity2stackRot: {
    restPct: 35, hallEvery: 4, arenaBand: 2, hallFallbackMs: 240000,
    closeNth: true,
    tdpFloor: 4,
    helmRetry: true,
    armorStack: true,
    rotMargin: 1,
    diff: ['rotMargin'],
    hypothesis: 'diversity2stack closes 1st armor but 3rd weapon (staff, circle-2 need 4) flatlines at 3/4 from ~min 50 — the requirement-aware rotation treats blunt/thrown as "done" at need+MARGIN(4)=12 and stops feeding staff, so it starves 1 rank short (TDP can\'t afford it either). rotMargin 1 keeps staff in active rotation until it actually clears its 4-rank need, so the last c2 slot closes and the agent circles. One knob (rotMargin) vs diversity2stack.',
  },
  diversity2stackRotHF120: {
    restPct: 35, hallEvery: 4, arenaBand: 2, hallFallbackMs: 120000,
    closeNth: true,
    tdpFloor: 4,
    helmRetry: true,
    armorStack: true,
    rotMargin: 1,
    diff: ['hallFallbackMs'],
    hypothesis: 'Speed-run lever: the binding c2 requirement is a TDP-trained survival/armor skill (not weapons) that lags because the bot only trains at the hall. Halving hallFallbackMs (240000->120000) makes hall trips twice as frequent, so survival/armor cross sooner and the c2 gate drops. Risk: more hall walks = more travel overhead; measure net c2-gate vs circle-2 reached.',
  },
  diversity2stackRotHF60: {
    restPct: 35, hallEvery: 4, arenaBand: 2, hallFallbackMs: 60000,
    closeNth: true,
    tdpFloor: 4,
    helmRetry: true,
    armorStack: true,
    rotMargin: 1,
    diff: ['hallFallbackMs'],
    hypothesis: 'Speed-run lever extreme: hallFallbackMs 240000->60000 (4x hall frequency). Push the c2 gate as low as possible. Risk: hall walks may dominate the loop and starve field exp; if kills/h collapse the gate may not improve. Compare c2-gate + circle-2 reached vs HF120.',
  },
  edgedBow: {
    restPct: 35, hallEvery: 4, arenaBand: 2, hallFallbackMs: 240000,
    closeNth: true,
    tdpFloor: 4,
    helmRetry: true,
    armorStack: true,
    edgedKit: true,
    diff: ['edgedKit'],
    hypothesis: 'Root-cause fix for the 3rd/4th-weapon starve: the default kit (club+mace+knives+staff) only spans 3 DISTINCT weapon categories (blunt, thrown, staff) because mace==blunt, so the circle-2 ladder (1st/2nd/3rd/4th weapon @ 4/4/2/1) can never all fill from the field. edgedKit = dagger+broadsword+greatsword+hunting_bow = small_edged + large_edged + twohanded_edged + bow = 4 DISTINCT categories, so every Nth-weapon slot trains in parallel with no collision. rotMargin kept at default (4) — if a lane still starves it can be lowered, but the category collision is the real bug. Shield (shield_usage) trains from worn armor being hit and is handled by armorStack independently. One structural change (edgedKit) vs diversity2stack.',
  },
  edgedBowAware: {
    restPct: 35, hallEvery: 4, arenaBand: 2, hallFallbackMs: 240000,
    closeNth: true, tdpFloor: 4, helmRetry: true, armorStack: true,
    edgedKit: true, weaponAware: true, rotMargin: 0,
    diff: ['weaponAware'],
    hypothesis: 'Weapon-exp-aware edgedBow: keep all four distinct lanes active until each reaches its actual circle-2 Nth-set threshold (1st/2nd 8, 3rd 4, 4th 2), instead of feeding every lane toward the primary 8-rank target and over-training the first lane.',
  },
  edgedSkinAware: {
    restPct: 35, hallEvery: 4, arenaBand: 2, hallFallbackMs: 240000,
    closeNth: true, tdpFloor: 4, helmRetry: true, armorStack: true,
    edgedKit: true, weaponAware: true, rotMargin: 0, economyFallback: true,
    diff: ['economyFallback'],
    hypothesis: 'Keep the EXP-aware four-lane edged kit, but permit a measured Barbarian fallback town trip every four minutes after a kill so skin proceeds can be sold and missing edged weapons retried. The bazaar retry checks inventory and purse before each purchase, so it funds dagger first, then bow, broadsword, and greatsword as money arrives without duplicate buys.',
  },
  shieldLadder: {
    restPct: 35, hallEvery: 4, arenaBand: 2, hallFallbackMs: 240000,
    closeNth: true,
    tdpFloor: 4,
    helmRetry: true,
    armorStack: true,
    shieldKit: true,
    diff: ['shieldKit'],
    hypothesis: 'Test a shielded four-lane Barbarian kit: keep the diversity2stack light-armor coverage, add a worn wooden shield for shield_usage exp on every landed blow, and rotate distinct blunt / small-edged / large-edged / two-handed-edged weapons. This should close armor coverage without promoting it until matched repeats prove that the extra gear and slower weapon purchases do not hurt circle completion.',
  },
  survivalBreadth: {
    restPct: 35, hallEvery: 4, arenaBand: 2, hallFallbackMs: 240000,
    closeNth: true, tdpFloor: 4, helmRetry: true, armorStack: true,
    shieldKit: true, survivalBreadth: true,
    diff: ['survivalBreadth'],
    hypothesis: 'Keep the defensive four-lane kit fixed, but rotate forage, track, and hunt during empty-room scans. This should distribute field EXP across foraging, tracking, and perception instead of relying on skinning alone, closing neglected survival Nth slots without more hall trips.',
  },
  survivalFocus: {
    restPct: 35, hallEvery: 4, arenaBand: 2, hallFallbackMs: 240000,
    closeNth: true, tdpFloor: 4, helmRetry: true, armorStack: true,
    shieldKit: true, survivalBreadth: true, survivalFocus: true, leaveCombatOnLock: true,
    diff: ['survivalFocus'],
    hypothesis: 'Keep the defensive kit and combat rotation fixed, but perform two deliberate forage/track/hunt passes during each empty-room wait. This should convert more field time into neglected survival lanes instead of relying on a single opportunistic pass per respawn cycle.'
  },
  shieldLadderFocus: {
    restPct: 35, hallEvery: 4, arenaBand: 2, hallFallbackMs: 240000,
    closeNth: true, tdpFloor: 4, helmRetry: true, armorStack: true,
    shieldKit: true, cheapWeaponKit: true,
    diff: ['cheapWeaponKit'],
    hypothesis: 'ShieldLadder stalled on the 2nd/3rd weapon lanes because the shield-first purse gate left only the dagger equipped. Buy a stocked affordable multi-lane starter kit first—dagger, sling, club, staff—then attempt the shield, so field rotation closes 2nd/3rd weapon and survival ranks before expensive upgrades.',
  },
  edgedSkinRest50: {
    restPct: 50, hallEvery: 4, arenaBand: 2, hallFallbackMs: 240000,
    closeNth: true, tdpFloor: 4, helmRetry: true, armorStack: true,
    edgedKit: true, weaponAware: true, rotMargin: 0, economyFallback: true,
    diff: ['restPct'],
    hypothesis: 'Keep the current edged/economy winner unchanged but rest at 50% HP instead of 35%: the prior matched run closed to shortfall 24 with 3 deaths, so earlier recovery should trade some hunting uptime for fewer deaths and a more repeatable closure.',
  },
  edgedSkinCheapKit: {
    restPct: 50, hallEvery: 4, arenaBand: 2, hallFallbackMs: 240000,
    closeNth: true, tdpFloor: 4, helmRetry: true, armorStack: true,
    cheapWeaponKit: true, weaponAware: true, rotMargin: 0, economyFallback: true,
    diff: ['cheapWeaponKit'],
    hypothesis: 'Keep edgedSkinRest50 recovery and training controls, but use four bazaar-stocked affordable lanes (dagger, sling, club, staff), skip already-owned weapons, and retry once 112 silver can fund a missing club/staff. The incomplete hmni cohort proved the old layout requested unsold throwing knives, repeatedly repurchased daggers, and never established a fourth live lane; this should close 3rd/4th weapon before Circle 2 while preserving silver for armor.',
  },
  edgedSkinWeaponFirst: {
    restPct: 50, hallEvery: 4, arenaBand: 2, hallFallbackMs: 240000,
    closeNth: true, tdpFloor: 4, helmRetry: true, armorStack: true,
    cheapWeaponKit: true, weaponAware: true, rotMargin: 0, economyFallback: true,
    weaponFirst: true,
    diff: ['weaponFirst'],
    hypothesis: 'Keep edgedSkinCheapKit unchanged except purchase order: buy dagger then club before the cheap sling, allowing a 150-silver starter purse to establish two distinct weapon lanes (137s) and preserving later sling/staff retries for hunt proceeds. This tests whether the 4th-weapon stall is purse ordering rather than shop availability or rotation.',
  },
  edgedSkinWeaponReserve: {
    restPct: 50, hallEvery: 4, arenaBand: 2, hallFallbackMs: 240000,
    closeNth: true, tdpFloor: 4, helmRetry: true, armorStack: true,
    cheapWeaponKit: true, weaponAware: true, rotMargin: 0, economyFallback: true,
    weaponReserve: true,
    diff: ['weaponReserve'],
    hypothesis: 'Keep edgedSkinCheapKit unchanged except defer the 20-silver sling until after the 112-silver staff. This reserves every early coin for the missing staff lane; if the 4th-weapon blocker is acquisition timing, staff should appear before the run spends on the low-cost lane.',
  },
  edgedSkinWeaponReserveV2: {
    restPct: 50, hallEvery: 4, arenaBand: 2, hallFallbackMs: 240000,
    closeNth: true, tdpFloor: 4, helmRetry: true, armorStack: true,
    cheapWeaponKit: true, weaponAware: true, rotMargin: 0, economyFallback: true,
    weaponReserve: true, weaponReserveV2: true,
    diff: ['weaponReserveV2'],
    hypothesis: 'Keep the reserved dagger/club/staff/sling order, and defer optional armor purchases whenever staff is still absent. The agent must secure the fourth weapon lane before spending on helm or stacked light armor; once staff is owned, normal armor provisioning resumes.',
  },
  edgedSkinWeaponReserveV3: {
    restPct: 50, hallEvery: 4, arenaBand: 2, hallFallbackMs: 240000,
    closeNth: true, tdpFloor: 4, helmRetry: true, armorStack: true,
    cheapWeaponKit: true, weaponAware: true, rotMargin: 0, economyFallback: true,
    weaponReserve: true, weaponReserveV2: true, weaponReserveV3: true,
    diff: ['weaponReserveV3'],
    hypothesis: 'Keep weaponReserveV2 unchanged, but hard-block the 20-silver sling purchase until staff is confirmed. V2 still fell through to sling when staff was unaffordable, so the 112-silver fourth lane never appeared; this isolates the missing reservation guard.',
  },
  edgedSkinReserveSafe: {
    restPct: 65, hallEvery: 4, arenaBand: 2, hallFallbackMs: 240000,
    closeNth: true, tdpFloor: 4, helmRetry: true, armorStack: true,
    cheapWeaponKit: true, weaponAware: true, rotMargin: 0, economyFallback: true,
    weaponReserve: true, weaponReserveV2: true,
    diff: ['restPct'],
    hypothesis: 'Keep weaponReserveV2 acquisition and occupancy behavior unchanged, but recover at 65% HP instead of 50%. The prior matched run closed the weapon blockers but suffered 2 deaths; earlier recovery should preserve the weapon gain while reducing death-driven downtime.',
  },
};
