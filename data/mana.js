// Mana types and ambient mana (clean-room, modeled on the source game's mana
// spectrum and per-type cycles). Each magic guild draws one type of mana;
// the ambient strength of a room is its zone base modulated by that type's
// slow, deterministic cycle.

export const MANA_TYPES = {
  elemental:   { name: 'Elemental',   desc: 'Derives from the churn of the elements — strengthened by storm and weather.' },
  holy:        { name: 'Holy',        desc: 'The presence of the Immortals — waxes and wanes with the holy days.' },
  life:        { name: 'Life',        desc: 'The antithesis of entropy — rises and falls with the seasons.' },
  lunar:       { name: 'Lunar',       desc: 'Constant across the land, varying only with the hours and the moons.' },
  necromantic: { name: 'Necromantic', desc: 'An illusory blend of elemental, life, and lunar mana, visible only to necromancers.' },
  none:        { name: 'None',        desc: 'No mana stirs for your kind.' },
};

export const GUILD_MANA = {
  barbarian: 'none', thief: 'none',
  bard: 'elemental', warmage: 'elemental',
  cleric: 'holy', paladin: 'holy',
  empath: 'life', ranger: 'life',
  moonmage: 'lunar', trader: 'lunar',
  necromancer: 'necromantic',
};

export function manaTypeFor(guild) {
  const type = GUILD_MANA[guild.id] || 'none';
  return { type, def: MANA_TYPES[type] };
}

// Magic-training rate per guild: primary-magic guilds attune fastest,
// secondary slower, tertiary slowest (source-game regen ordering).
const GUILD_MANA_RATE = {
  cleric: 'primary', moonmage: 'primary', warmage: 'primary',
  bard: 'secondary', empath: 'secondary', necromancer: 'secondary',
  paladin: 'tertiary', ranger: 'tertiary', trader: 'tertiary',
};

const RATE_PULSE = { primary: 0.04, secondary: 0.03, tertiary: 0.025 };

export function manaRegenRate(guildId) {
  return RATE_PULSE[GUILD_MANA_RATE[guildId] || 'secondary'] || 0;
}

// Base ambient mana by zone (how rich a place is in raw mana).
const ZONE_MANA = {
  town: 0.35, sewers: 0.3, woods: 0.55, marsh: 0.6,
  deepwoods: 0.7, camp: 0.55, cinder: 0.5, blackwood: 0.65,
};

export function zoneManaBase(zone) {
  return ZONE_MANA[zone] ?? 0.5;
}

// Slow deterministic cycle per mana type (0..1 swing), keyed on real hours.
export function manaCycle(type, hours = Date.now() / 3600000) {
  const wave = (periodHours, phase = 0) => 0.5 + 0.5 * Math.sin((hours / periodHours) * Math.PI * 2 + phase);
  switch (type) {
    case 'lunar':   return wave(12);            // half-day rhythm
    case 'holy':    return wave(72);            // three-day holy cycle
    case 'life':    return wave(24 * 30);       // monthly seasonal tide
    case 'elemental': return wave(24);          // day/night rhythm
    case 'necromantic': {
      const e = wave(24); const l = wave(24 * 30); const m = wave(12);
      return (e + l + m) / 3;
    }
    default: return 0.5;
  }
}

// Effective 0..1 mana level in a room for a guild's mana type.
export function roomManaLevel(guild, zone) {
  const { type } = manaTypeFor(guild);
  if (type === 'none') return 0;
  const swing = 0.6 + 0.8 * manaCycle(type);
  return Math.max(0.05, Math.min(1, zoneManaBase(zone) * swing));
}

const DESCRIPTORS = [
  ['dim', 0.2], ['faint', 0.35], ['steady', 0.5], ['bright', 0.7], ['brilliant', 1.01],
];

export function manaDescriptor(level) {
  for (const [word, threshold] of DESCRIPTORS) {
    if (level <= threshold) return word;
  }
  return 'blinding';
}

// Overchanneling model: spells can be prepared past their base mana for more
// power. Primary Magic raises the safe ceiling; beyond it, backfire risk grows.
export function safeOverchannelPct(primaryMagicRanks) {
  return 100 + Math.floor(primaryMagicRanks * 0.6);
}

export function backfireChance(pct, safePct) {
  if (pct <= safePct) return 0;
  return Math.min(0.8, (pct - safePct) / 100);
}
