// Pure stat/rank/exp math for skills (extracted from data/skills.js so the
// skill *catalog* stays data and this stays the mechanics seam). All functions
// are pure: they read only their arguments and the module-local consts below —
// no Game/player/world state, no side effects. data/skills.js re-exports these
// so existing callers are behavior-identical.

// EXP required to advance from one rank to the next.
// Mirrors the source game's shape: ~200 bits for the first rank, then a small
// linear increase per rank. Higher ranks stay achievable rather than exploding.
export function expToNextRank(rank) {
  return 200 + rank;
}

// ---------------- Field-exp pulse groups (DR 200-second cycle) ----------------
// DR: every skill belongs to one of ten fixed groups; each group converts its
// pools once per 200 s, staggered 20 s apart, guild skills pulsing in the
// final group. Rows follow the documented table in
// docs/elanthipedia/Experience.md; slots the corpus table is silent on are
// marked and justified in docs/FIDELITY.md §6.2.
// Exported (and re-exported by data/skills.js) because test/exp-groups reads it.
export const PULSE_GROUPS = [
  /* 0 (0 s) armor & defending */
  ['shield_usage', 'light_armor', 'chain_armor', 'brigandine', 'plate_armor', 'defending'],
  /* 1 (20 s) parry & edged */
  ['parry', 'small_edged', 'large_edged', 'twohanded_edged', 'medium_edged'],
  /* 2 (40 s) blunt & missiles */
  ['blunt', 'large_blunt', 'twohanded_blunt', 'slings', 'bow', 'crossbow'],
  /* 3 (60 s) poles, thrown, brawling, offhand */
  ['staff', 'polearm', 'thrown', 'heavy_thrown', 'brawling', 'offhand', 'melee_mastery'],
  /* 4 (80 s) magic core + schools */
  ['missile_mastery', 'primary_magic', 'attunement', 'arcana', 'targeted_magic', 'augmentation',
   'offensive_magic', 'defensive_magic', 'warding_magic', 'healing_magic', 'holy_magic',
   'moon_magic', 'war_magic', 'illusion', 'necromancy'],
  /* 5 (100 s) debilitation/utility/warding/sorcery + body */
  ['debilitation', 'utility_magic', 'warding', 'sorcery', 'evasion', 'athletics', 'perception',
   'climbing', 'swimming', 'fitness', 'endurance'],
  /* 6 (120 s) stealth, locks, crime, outdoors */
  ['stealth', 'lockpicking', 'thievery', 'first_aid', 'foraging', 'hunting', 'tracking', 'hiding'],
  /* 7 (140 s) skinning alone (as documented) */
  ['skinning'],
  /* 8 (160 s) crafting & lore */
  ['forging', 'engineering', 'outfitting', 'alchemy', 'enchanting', 'scholarship', 'appraisal',
   'herbal_lore', 'elemental_lore', 'necromancy_lore'],
  /* 9 (180 s) performance, tactics, guild skills last */
  ['performance', 'tactics', 'empathy', 'expertise', 'scouting', 'backstab', 'bardic_lore',
   'conviction', 'thanatology', 'trading', 'summoning', 'astrology', 'theurgy', 'inner_fire'],
];

const PULSE_GROUP_OF = new Map();
PULSE_GROUPS.forEach((ids, g) => { for (const id of ids) PULSE_GROUP_OF.set(id, g); });

// Group index for a skill. Unknown ids hash into a stable bucket so content
// added later without a mapping still pulses deterministically.
export function pulseGroupFor(skillId) {
  const hit = PULSE_GROUP_OF.get(String(skillId));
  if (hit !== undefined) return hit;
  let h = 0;
  const id = String(skillId);
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 10;
}

// Mental-stat curve shared by Intelligence (pool size), Discipline (pool size,
// at a third of the slope) and Wisdom (pulse fraction — the corpus presents
// the underlying table as covering Int and Wis equally). Piecewise with break
// points at 30/60, normalized so a stat of 10 → 0 bonus (×1.00).
export function mentalStatBonus(x, kind = 'int') {
  const v = Math.max(1, Number(x) || 10);
  if (kind === 'disc') {
    if (v < 30) return ((v - 10) * 20) / 10;
    if (v <= 60) return (((v - 30) * 10) + 400) / 10;
    return (((v - 60) * 5) + 700) / 10;
  }
  if (v < 30) return ((v - 10) * 60) / 10;
  if (v <= 60) return (((v - 30) * 30) + 1200) / 10;
  return (((v - 60) * 15) + 2100) / 10;
}

// Total "rank points" is the sum of all skill ranks. Circles build on this.
export function totalRanks(skills) {
  let sum = 0;
  for (const v of Object.values(skills)) sum += v.rank || 0;
  return sum;
}

// DR mindstate ladder: 34 states from clear to mind lock, mapped by how full
// the current rank's exp pool is. Used by the `exp` command readout.
const MINDSTATES = [
  'clear', 'dabbling', 'perusing', 'learning', 'thoughtful', 'thinking',
  'considering', 'pondering', 'ruminating', 'concentrating', 'attentive',
  'deliberative', 'interested', 'examining', 'understanding', 'absorbing',
  'intrigued', 'scrutinizing', 'analyzing', 'studious', 'focused',
  'very focused', 'engaged', 'very engaged', 'cogitating', 'fascinated',
  'captivated', 'engrossed', 'riveted', 'very riveted', 'rapt', 'very rapt',
  'enthralled', 'nearly locked', 'mind lock',
];

export function mindstate(pct) {
  const idx = Math.min(MINDSTATES.length - 1, Math.floor((Math.max(0, pct) / 100) * MINDSTATES.length));
  return MINDSTATES[idx];
}

// DR skill-level messaging tiers: Novice -> Practitioner -> ... -> Avatar,
// with degree modifiers inside most tiers. Used by the `skills` output.
const TIERS = [
  { name: 'Novice', lo: 1, hi: 49, degree: ['Lowly', 'Promising', 'Able', 'Trained', 'Full'], width: 10 },
  { name: 'Practitioner', lo: 50, hi: 99, degree: ['Beginning', 'Competent', 'Proficient', 'Experienced', 'Skilled'], width: 10 },
  { name: 'Dilettante', lo: 100, hi: 149, degree: ['Beginning', 'Competent', 'Proficient', 'Experienced', 'Skilled'], width: 10 },
  { name: 'Aficionado', lo: 150, hi: 199, degree: ['Beginning', 'Competent', 'Proficient', 'Experienced', 'Skilled'], width: 10 },
  { name: 'Adept', lo: 200, hi: 299, degree: null, width: 0 },
  { name: 'Expert', lo: 300, hi: 399, degree: null, width: 0 },
  { name: 'Professional', lo: 400, hi: 499, degree: ['Exceptional', 'Outstanding', 'Renowned', 'True'], width: 20 },
  { name: 'Authority', lo: 500, hi: 599, degree: ['Exceptional', 'Outstanding', 'Renowned', 'True'], width: 20 },
  { name: 'Genius', lo: 600, hi: 699, degree: ['Exceptional', 'Outstanding', 'Renowned', 'True'], width: 20 },
  { name: 'Savant', lo: 700, hi: 799, degree: ['Distinguished', 'Venerated', 'Exalted', 'Transcendent'], width: 20 },
  { name: 'Master', lo: 800, hi: 899, degree: ['Distinguished', 'Venerated', 'Exalted', 'Transcendent'], width: 20 },
  { name: 'Grand Master', lo: 900, hi: 999, degree: ['Distinguished', 'Venerated', 'Exalted', 'Transcendent'], width: 20 },
  { name: 'Guru', lo: 1000, hi: 1249, degree: null, width: 0 },
  { name: 'Legend', lo: 1250, hi: 1499, degree: null, width: 0 },
  { name: 'Phenom', lo: 1500, hi: 1749, degree: null, width: 0 },
  { name: 'Avatar', lo: 1750, hi: 1750, degree: null, width: 0 },
];

export function skillTier(rank) {
  if (rank <= 0) return { tier: 'Novice', label: 'unskilled' };
  const t = TIERS.find((x) => rank >= x.lo && rank <= x.hi) || TIERS[0];
  if (!t.degree) return { tier: t.name, label: t.name };
  const off = rank - t.lo;
  // 10-wide tiers start their degrees at +0; 20-wide tiers (Professional+) at +20.
  const start = t.width === 20 ? 20 : 0;
  if (off < start) return { tier: t.name, label: t.name };
  const idx = Math.min(t.degree.length - 1, Math.floor((off - start) / t.width));
  return { tier: t.name, label: `${t.name} ${t.degree[idx]}` };
}
