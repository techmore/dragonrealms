// Bleeding wounds (DR clean-room): hits can open bleeding wounds whose
// severity drives continuous vitality loss. First Aid's `tend` staunched
// them — higher ranks handle worse bleeders with less roundtime.
// Source: docs/elanthipedia/Damage.md (Bleeding Levels) and
// docs/elanthipedia/First Aid skill.md (Skill to Tend table).

// Condensed severity ladder (DR's 20+ levels → 8 playable bands).
export const BLEED_LEVELS = [
  { level: 1, name: 'slight', rate: 1, tendRanks: 5 },
  { level: 2, name: 'light', rate: 2, tendRanks: 8 },
  { level: 3, name: 'moderate', rate: 3, tendRanks: 12 },
  { level: 4, name: 'bad', rate: 5, tendRanks: 18 },
  { level: 5, name: 'heavy', rate: 8, tendRanks: 26 },
  { level: 6, name: 'severe', rate: 12, tendRanks: 36 },
  { level: 7, name: 'profuse', rate: 18, tendRanks: 50 },
  { level: 8, name: 'gushing', rate: 26, tendRanks: 70 },
];

export const BODY_PARTS = ['head', 'left arm', 'right arm', 'chest', 'abdomen', 'left leg', 'right leg', 'back'];

export function bleedInfo(level) {
  return BLEED_LEVELS.find((b) => b.level === level) || BLEED_LEVELS[0];
}

// Total bleed damage per tick from all open (untended) wounds.
export function bleedRate(wounds) {
  return (wounds || [])
    .filter((w) => w.tended !== true)
    .reduce((sum, w) => sum + bleedInfo(w.level).rate, 0);
}

// Roll whether a damaging hit opens a wound, and how bad. Bigger hits and
// harder-hitting creatures cause worse wounds. Returns a wound or null.
export function rollWound(dmg, attackerCircle, rng = Math.random) {
  // ~10% of solid hits open a wound; chance scales mildly with damage.
  if (dmg < 6 || rng() > 0.08 + dmg * 0.003) return null;
  // Severity 1-8: driven by damage relative to the attacker's tier, but a
  // single hit rarely opens worse than a moderate bleeder (DR wounds come
  // from accumulation, not one swing).
  const power = dmg / 14 + attackerCircle * 0.12;
  const level = Math.max(1, Math.min(4, Math.floor(power * (0.6 + rng() * 0.8))));
  const part = BODY_PARTS[Math.floor(rng() * BODY_PARTS.length)];
  return { part, level, tended: false, since: Date.now() };
}

// First Aid tend check. DR: each severity band needs ~ranks; failure costs
// big roundtime and can worsen the wound. Success steps severity down one
// band per success until tended. Returns { ok, msg, rt }.
export function tendWound(wound, firstAidRank, rng = Math.random) {
  const info = bleedInfo(wound.level);
  const need = info.tendRanks;
  // Success chance: 1.0 at need ranks, scaling down for worse wounds.
  const chance = Math.max(0.1, Math.min(0.98, 0.3 + (firstAidRank / need) * 0.7));
  if (rng() > chance) {
    // Botched bandage: the wound tears worse (cap at gushing).
    wound.level = Math.min(8, wound.level + 1);
    return { ok: false, rt: 6, msg: `Your bandaging slips — the ${wound.part} wound bleeds worse now!` };
  }
  if (wound.level > 1) {
    wound.level -= 1;
    const now = bleedInfo(wound.level);
    return { ok: true, rt: 4, msg: `You wrap the ${wound.part} wound tight — the bleeding slows to ${now.name}.` };
  }
  wound.tended = true;
  return { ok: true, rt: 3, msg: `You tie off the ${wound.part} wound. The bleeding stops. (tended)` };
}

// First Aid ranks reduce the roundtime for tending (DR: high ranks tend
// great bleeders without roundtime).
export function tendRoundtime(baseRt, firstAidRank) {
  return Math.max(0, baseRt - Math.floor(firstAidRank / 20));
}

// Natural clotting: tended wounds heal fully after a while out of combat;
// untended wounds very slowly improve on their own (DR clots).
export function clotTick(wounds, inCombat) {
  let changed = false;
  for (const w of wounds || []) {
    if (w.tended) {
      // Tended wounds resolve after ~2 minutes.
      if (Date.now() - w.since > 120 * 1000) {
        w.resolved = true;
        changed = true;
      }
    } else if (!inCombat && Date.now() - w.since > 180 * 1000 && w.level > 1) {
      w.level -= 1;
      w.since = Date.now();
      changed = true;
    }
  }
  return changed;
}
