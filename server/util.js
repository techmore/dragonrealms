// Small shared string/format helpers. Consolidated from per-module copies
// (pad lived in chargen + economy, cap in game/gm-play/wilds/combat, DIRS in
// game/spectate/commands) — one definition each so they can't drift.
export const DIR_ALIASES = {
  n: 'n', north: 'n', s: 's', south: 's', e: 'e', east: 'e', w: 'w', west: 'w',
  ne: 'ne', northeast: 'ne', nw: 'nw', northwest: 'nw', se: 'se', southeast: 'se',
  sw: 'sw', southwest: 'sw', u: 'u', up: 'u', d: 'd', down: 'd',
};

export function pad(s, n) {
  s = String(s);
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

export function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

// short -> long direction names (for prose like "Obvious exits: north, ...").
export const DIR_NAMES = {
  n: 'north', s: 'south', e: 'east', w: 'west',
  ne: 'northeast', nw: 'northwest', se: 'southeast', sw: 'southwest',
  u: 'up', d: 'down', up: 'up', down: 'down',
};
