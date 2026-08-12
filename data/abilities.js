// Barbarian abilities (clean-room, modeled on the source game's taxonomy:
// berserks, forms, meditations, roars, and passive masteries gated by paths).
// Abilities are learned at the guild hall with ability slots — 1 at circle 1,
// +1 every even circle (tertiary rate). Paths (Flame / Horde / Predator) gate
// higher-tier abilities on how many abilities of the same path are known.

export const ABILITY_PATHS = {
  flame: 'Flame',
  horde: 'Horde',
  predator: 'Predator',
};

export const BARBARIAN_ABILITIES = [
  {
    id: 'berserk', name: 'Berserk', kind: 'berserk', path: 'horde', req: 0, known: true,
    desc: 'Enter a state of unbridled fury, striking harder while ignoring defense.',
  },
  {
    id: 'wildfire', name: 'Wildfire', kind: 'berserk', path: 'flame', req: 1,
    desc: 'Fury races through your limbs — your attacks come faster while it lasts.',
  },
  {
    id: 'dragon', name: 'Dragon Form', kind: 'form', path: 'flame', req: 0,
    desc: 'The beast within surfaces — your blows land heavier while the form holds.',
  },
  {
    id: 'tenacity', name: 'Tenacity Meditation', kind: 'meditation', path: 'flame', req: 1,
    desc: 'Harden your flesh against harm for a time.',
  },
  {
    id: 'everilds_rage', name: "Everild's Rage", kind: 'roar', path: 'predator', req: 0,
    desc: 'A battle roar that sets your blood ablaze — your damage rises.',
  },
  {
    id: 'screech', name: 'Screech of Madness', kind: 'roar', path: 'predator', req: 1,
    desc: 'A piercing shriek that stuns and slows a foe.',
  },
  {
    id: 'whirlwind', name: 'Whirlwind', kind: 'special', path: 'horde', req: 0, minCircle: 6,
    desc: 'Rotate in place, lashing out at every foe in reach.',
  },
  {
    id: 'war_stomp', name: 'War Stomp', kind: 'special', path: 'horde', req: 0, minCircle: 8,
    desc: 'Shiver the ground with your rage, knocking all foes off balance.',
  },
  {
    id: 'choke', name: 'Choke', kind: 'special', path: 'predator', req: 0, minCircle: 5,
    desc: 'Seize a foe by the throat — its blows falter while you grip it.',
  },
  {
    id: 'dual_load', name: 'Dual Load', kind: 'special', path: 'predator', req: 0, minCircle: 7,
    desc: 'Nock two arrows at once — your bow fires twice the steel at half again the force.',
  },
  {
    id: 'duelist', name: 'Duelist', kind: 'mastery', path: null, req: 0,
    desc: 'Passive mastery — your inner fire burns brighter out of combat (passive regen cap +25).',
  },
  {
    id: 'juggernaut', name: 'Juggernaut', kind: 'mastery', path: null, req: 0,
    desc: 'Passive mastery — hardened beyond fury, you shrug off a share of every blow.',
  },
];

export const FORGET_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

export function barbarianAbilityById(id) {
  return BARBARIAN_ABILITIES.find((a) => a.id === id) || null;
}

export function barbarianAbilitiesFor(p) {
  const known = new Set(p.abilities || []);
  return BARBARIAN_ABILITIES.map((a) => {
    const inPath = (p.abilities || []).filter((id) => {
      const def = barbarianAbilityById(id);
      return def && def.path === a.path;
    }).length;
    return {
      ...a,
      learned: known.has(a.id),
      learnable: !known.has(a.id) && !a.known && inPath >= a.req,
    };
  });
}

// Ability slots: 1 at circle 1, +1 every even circle (DR tertiary rate).
export function barbarianSlots(circle) {
  return 1 + Math.floor(Math.max(0, circle) / 2);
}

export const VOICE_POOL = 40;
