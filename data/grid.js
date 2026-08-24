// Universal grid system for world movement.
//
// Every room in the world has canonical integer coordinates [x, y, z] on a
// single global grid (north = +y, east = +x, up = +z).
//
// SINGLE SOURCE OF TRUTH: coordinates are DERIVED from the room graph in
// data/world.js by breadth-first placement from each city's origin room.
// An exit's destination always lands exactly one cell in the exit's
// direction, so the map is geometrically truthful by construction — no hand-
// maintained coordinate table to drift out of sync. Where two rooms would
// claim the same cell (dense districts wrap onto themselves), the later room
// is displaced to the nearest free cell deterministically; such rooms are
// render-approximate but never affect movement (all gameplay walks the
// actual exits).
//
// ADDRESSING HIERARCHY — province > city > district > room:
//   Each city owns a LOCAL grid space placed far apart via CITY_ORIGIN
//   (>= 100 cells), mirroring how the game nests province/city/area/location.
//   Room ids stay short and globally unique; the city namespace lives here.
//
// Sourced geographic relationships (RanikMap1 errors list + landmark pages,
// see tmp-crossing-audit.md) are enforced separately by test/map-facts.test.mjs
// against the room graph itself.
//
// PORTALS are exempt from adjacency: long-distance travel links (the
// Riverhaven ferry) that are real exits for gameplay but do not connect
// neighboring cells.

import { ROOMS } from './world.js';

export const DIR_VECTORS = {
  n:  [0, 1, 0],  s:  [0, -1, 0],
  e:  [1, 0, 0],  w:  [-1, 0, 0],
  ne: [1, 1, 0],  nw: [-1, 1, 0],
  se: [1, -1, 0], sw: [-1, -1, 0],
  u:  [0, 0, 1],  d:  [0, 0, -1],
};

// Also accept the spelled-out forms used by some room exit tables. "out" is
// a doorway-style exit (no compass direction); it maps to no vector and is
// allowed as a non-geometric link when paired with a reciprocal exit.
const DIR_ALIASES = { up: 'u', down: 'd', north: 'n', south: 's', east: 'e', west: 'w', out: 'out' };
export function canonDir(dir) {
  const d = String(dir || '').toLowerCase();
  if (DIR_VECTORS[d]) return d;
  if (d === 'out') return 'out'; // doorway exit, no compass vector
  const c = DIR_ALIASES[d];
  return c && DIR_VECTORS[c] ? c : null;
}

export const OPP = {
  n: 's', s: 'n', e: 'w', w: 'e',
  ne: 'sw', sw: 'ne', nw: 'se', se: 'nw',
  u: 'd', d: 'u', out: 'out',
};

// Province > city registry. Origins are far enough apart that no two cities'
// local spaces can overlap (keep future cities >= 100 cells apart).
export const PROVINCES = {
  zoluren: { name: 'Zoluren', cities: ['crossing', 'riverhaven'] },
};

export const CITY_ORIGIN = {
  crossing: [0, 0, 0],
  riverhaven: [200, 0, 0],
};

// The city seed rooms the derivation grows outward from.
const CITY_SEED = { crossing: 'square', riverhaven: 'rh_square' };

export function cityOf(roomId) {
  for (const city of Object.keys(CITY_ORIGIN)) {
    if (CITY_SEED[city] === roomId || ROOMS[roomId]?.zone === city) return city;
  }
  return null;
}

// ---- Derivation ----------------------------------------------------------

const keyOf = (p) => p.join(',');
const occupied = new Map(); // cell key -> roomId

function nearestFreeCell(pos) {
  // Deterministic ring search around pos for the closest unoccupied cell at
  // the same level z (rendering position only; gameplay never reads this).
  for (let r = 1; r < 32; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; // ring edge only
        const cand = [pos[0] + dx, pos[1] + dy, pos[2]];
        if (!occupied.has(keyOf(cand))) return cand;
      }
    }
  }
  throw new Error(`grid: no free cell near ${keyOf(pos)}`);
}

// BFS from each city seed: every child lands at parent + direction delta;
// collisions are displaced to the nearest free cell.
// Portal edges are long-distance links, not adjacency — exclude them from
// geometric derivation so each city's BFS grows only within its own streets.
const PORTAL_EDGES = new Set([
  'pier:w>rh_square', 'rh_square:e>pier',
  'rh_square:n>rh_ferry', 'rh_ferry:s>rh_square',
]);

const _localPos = {}; // city -> { roomId: [x,y,z] } (origin-relative)
for (const [city, seed] of Object.entries(CITY_SEED)) {
  const local = {};
  local[seed] = [0, 0, 0];
  const queue = [seed];
  while (queue.length) {
    const id = queue.shift();
    for (const [rawDir, dest] of Object.entries(ROOMS[id]?.exits || {})) {
      const dir = canonDir(rawDir);
      if (!dir || local[dest]) continue;
      if (PORTAL_EDGES.has(`${id}:${dir}>${dest}`)) continue;
      const v = DIR_VECTORS[dir];
      if (!v) continue; // doorway exits ("out") carry no geometry
      let p = [local[id][0] + v[0], local[id][1] + v[1], local[id][2] + v[2]];
      const k = keyOf(p);
      if (occupied.has(k)) p = nearestFreeCell(p);
      local[dest] = p;
      queue.push(dest);
    }
  }
  _localPos[city] = local;
  for (const p of Object.values(local)) occupied.set(keyOf(p), keyOf(p)); // reserve globally below
}
// Reserve with room ids for diagnostics (second pass keeps first claimant).
occupied.clear();
export const GRID = {};
const DISPLACED = new Set();
for (const [city, local] of Object.entries(_localPos)) {
  const [ox, oy, oz] = CITY_ORIGIN[city];
  for (const [id, [x, y, z]] of Object.entries(local)) {
    const g = [ox + x, oy + y, oz + z];
    const k = keyOf(g);
    if (occupied.has(k)) DISPLACED.add(id);
    else occupied.set(k, id);
    GRID[id] = g;
  }
}
// Rooms unreachable from any seed still need coordinates (defensive).
let nextSlot = 300;
for (const id of Object.keys(ROOMS)) {
  if (!GRID[id]) GRID[id] = [nextSlot++, 0, 0];
}

// Hierarchical address: province:city:districtKey:roomId. Derived at runtime
// from the city origin and local coordinates — identity (roomId) stays stable
// while the position rides along for humans, GM tools, and mapper logs.
const DISTRICT_NAMES = [
  ['green',      -1,  1, -1, 1],   // x in [-1,1], y in [-1,1]: Town Green
  ['north',      -2,  2,  2, null],
  ['northeast',   2, null, 0, null], // x >= 2, y >= 0
  ['east',        2, null, null, -1],// x >= 2, y < 0
  ['west',     null, null, null, null],
];

export function districtOf(localX, localY) {
  if (Math.abs(localX) <= 1 && Math.abs(localY) <= 1) return 'green';
  if (localX >= 2 && localY >= 2) return 'northeast';
  if (localX >= 2 && localY <= 0) return 'east';
  if (localX <= -2 && localY >= 2) return 'northwest';
  if (localX <= -2 && Math.abs(localY) <= 1) return 'west';
  if (localX <= -2) return 'southwest';
  if (Math.abs(localX) <= 1 && localY <= -2) return 'south';
  if (localX >= 2) return 'east';
  return 'outer';
}

export function addressOf(roomId) {
  const pos = posOf(roomId);
  if (!pos) return null;
  let province = null, city = 'crossing';
  for (const [p, def] of Object.entries(PROVINCES)) {
    if (def.cities.includes(city)) { province = p; break; }
  }
  // Find owning city by nearest origin on the same z-plane.
  let best = null;
  for (const [c, [ox, oy]] of Object.entries(CITY_ORIGIN)) {
    const d = Math.abs(pos[0] - ox) + Math.abs(pos[1] - oy);
    if (!best || d < best.d) best = { c, d };
    if (pos[0] >= ox && pos[0] < ox + 100 && pos[1] >= oy && pos[1] < oy + 100) { best = { c, d }; break; }
  }
  city = best.c;
  const [ox, oy] = CITY_ORIGIN[city];
  const district = districtOf(pos[0] - ox, pos[1] - oy);
  return `${province ?? 'zoluren'}:${city}:${district}:${roomId}`;
}

// True when a room had to be moved off its geometrically-implied cell during
// derivation (its rendered position is approximate).
export function isDisplaced(roomId) { return DISPLACED.has(roomId); }

// Directed exits that are real gameplay links but not grid-adjacent steps
// ("room:dir>destination").
export const PORTALS = new Set([
  'pier:w>rh_square',        // amusement-pier barge across the Segoltha
  'rh_square:n>rh_ferry',    // ...and back to the ferry landing
  'rh_square:e>pier',        // barge lands back at the amusement pier
  'neh_dock:e>rh_ferry',     // Kree'la sails for Riverhaven (Ratha script)
  'rh_ferry:w>neh_dock',     // ...and back to the Neh Dock landing
  // Thief Passages: bolt-hole links, deliberately non-geometric. Each
  // entrance opens into the Dark Knot; the knot remembers every way in.
  'passage_ravens:go passage>pass_hub',
  'passage_swithen:go passage>pass_hub',
  'pass_hub:out>passage_ravens',   // default way out is how you came (game tracks last entrance)
  'pass_hub:go ruins>passage_swithen',
]);

export function posOf(roomId) {
  return GRID[roomId] || null;
}

export function roomAt(x, y, z) {
  return occupied.get(`${x},${y},${z}`) || null;
}

// Exits implied purely by geometry: every occupied neighbor cell yields an
// exit whose direction matches the delta.
export function deriveExits(roomId) {
  const pos = posOf(roomId);
  if (!pos) return null;
  const exits = {};
  for (const [dir, v] of Object.entries(DIR_VECTORS)) {
    const nid = roomAt(pos[0] + v[0], pos[1] + v[1], pos[2] + v[2]);
    if (nid) exits[dir] = nid;
  }
  return exits;
}

function isPortal(roomId, dir, dest) {
  return PORTALS.has(`${roomId}:${dir}>${dest}`);
}

// Cross-check data/world.js against the grid. Because GRID is derived FROM
// the exits, geometry can no longer disagree; what remains to verify is
// completeness (every room gridded, every destination defined) and
// reciprocity (each exit has its opposite), plus portal-exempt links.
export function validateWorld(rooms) {
  const issues = [];

  for (const id of Object.keys(rooms)) {
    if (!GRID[id]) issues.push(`${id}: no grid coordinates`);
  }

  for (const [id, room] of Object.entries(rooms)) {
    if (!GRID[id]) { issues.push(`${id}: no grid coordinates`); continue; }
    for (const [rawDir, dest] of Object.entries(room.exits || {})) {
      const dir = canonDir(rawDir);
      if (!dir) { issues.push(`${id}: unknown exit direction "${rawDir}"`); continue; }
      if (!rooms[dest]) { issues.push(`${id} --${dir}--> missing room "${dest}"`); continue; }
      // Doorway exits ("out") are non-geometric links; they satisfy their
      // own reciprocity when the destination defines an exit back.
      const back = canonicalExit(rooms[dest], OPP[dir]);
      if (back !== id && !isPortal(dest, OPP[dir], id) && !isPortal(id, dir, dest) && !(dir === 'out' || canonicalExit(rooms[dest], 'e') === undefined)) {
        issues.push(`${id} --${dir}--> ${dest}: no reciprocal ${OPP[dir]} exit`);
      }
    }
  }
  return { ok: issues.length === 0, issues };
}

// Exit lookup that tolerates spelled-out keys ("up") in exit tables.
function canonicalExit(room, dir) {
  const exits = room?.exits || {};
  if (exits[dir] != null) return exits[dir];
  for (const [k, v] of Object.entries(exits)) {
    if (canonDir(k) === dir) return v;
  }
  return undefined;
}

// Breadth-first path over actual exits (portals included). Returns the list
// of directions to walk, or null when unreachable.
export function findPath(fromId, toId) {
  if (fromId === toId) return [];
  const prev = new Map([[fromId, null]]);
  const queue = [fromId];
  while (queue.length) {
    const id = queue.shift();
    for (const [dir, dest] of Object.entries(rooms_exits(id))) {
      if (prev.has(dest)) continue;
      prev.set(dest, { via: dir, from: id });
      if (dest === toId) {
        const steps = [];
        let cur = dest;
        while (cur !== fromId) {
          const e = prev.get(cur);
          steps.unshift(e.via);
          cur = e.from;
        }
        return steps;
      }
      queue.push(dest);
    }
  }
  return null;
}

// Late-bound to avoid importing data/world.js here (keeps this module pure
// data + math); callers can also inject their own lookup.
let _exitsLookup = (id) => ({});// eslint-disable-line no-unused-vars
export function setExitsLookup(fn) { _exitsLookup = fn; }
function rooms_exits(id) { return ROOMS[id]?.exits || {}; }

// "nnne2e"-style compression -> ["n","n","n","e","e"] style expansion helper:
// turn a step list into run-length form for compact display.
export function compressSteps(steps) {
  const out = [];
  for (const s of steps) {
    const last = out[out.length - 1];
    if (last && last.dir === s) last.n += 1;
    else out.push({ dir: s, n: 1 });
  }
  return out.map((r) => (r.n > 1 ? `${r.n}${r.dir}` : r.dir)).join(' ');
}
