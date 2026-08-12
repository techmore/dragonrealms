// Thief khri (clean-room, modeled on the source game's concentration-based
// buffs). Each khri costs concentration; the pool grows with circle and the
// Stealth skill. Khri last KHRI_TICKS and drop when the thief is struck.

export const KHRI = {
  elusion: {
    id: 'elusion', name: 'Elusion', cost: 4,
    desc: 'Your body flows like water — 20% harder to hit.',
  },
  focus: {
    id: 'focus', name: 'Focus', cost: 4,
    desc: 'Blades sing in your grip — +4 effective weapon skill.',
  },
  nimbleness: {
    id: 'nimbleness', name: 'Nimbleness', cost: 5,
    desc: 'Your hands blur — attack speed improves.',
  },
  dampen: {
    id: 'dampen', name: 'Dampen', cost: 4,
    desc: 'You move in perfect silence — ambushes strike harder.',
  },
  strike: {
    id: 'strike', name: 'Strike', cost: 6,
    desc: 'Every blow lands with killing intent — +25% damage.',
  },
  sight: {
    id: 'sight', name: 'Sight', cost: 5,
    desc: 'You read the fight like a page — +6 to hit and ambushes find their mark.',
  },
  stealth: {
    id: 'stealth', name: 'Stealth', cost: 6,
    desc: 'Your presence fades to nothing — ambushes and backstabs bite deeper.',
  },
  swiftness: {
    id: 'swiftness', name: 'Swiftness', cost: 5,
    desc: 'The ground burns beneath you — you strike faster and flee more surely.',
  },
  clarity: {
    id: 'clarity', name: 'Clarity', cost: 4,
    desc: 'Your mind is a still pool — hostile magic breaks against it.',
  },
};

export const KHRI_TICKS = 60;

export function khriById(id) {
  return KHRI[id] || null;
}

// Concentration pool: base 8, +1 per 3 circles, +1 per 10 Stealth ranks.
export function concentrationPool(p) {
  const stealth = (p.skills && p.skills.stealth ? p.skills.stealth.rank : 0) || 0;
  return 8 + Math.floor(p.circle / 3) + Math.floor(stealth / 10);
}

export function khriConcentrationUsed(p) {
  if (!p.khri) return 0;
  let used = 0;
  for (const [id, ticks] of Object.entries(p.khri)) {
    if (ticks > 0 && KHRI[id]) used += KHRI[id].cost;
  }
  return used;
}
