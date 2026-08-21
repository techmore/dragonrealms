// Universal grid system for world movement.
//
// Every room in the world has canonical integer coordinates [x, y, z] on a
// single global grid (north = +y, east = +x, up = +z). Exits between rooms
// must agree with their coordinate delta — "n" means literally one cell
// north — so the map is geometrically truthful and we can validate, pathfind
// and render it mechanically.
//
// Layout of the Crossing is grounded in Sabina's Map 1 (Elanthipedia page
// "RanikMap1" / image CrossingMap.png): Town Green hub with eight spokes,
// roads fanning to the four gates, market district east, guild rows west,
// temple quarter northwest, riverfront (Strand/docks) south along the
// Segoltha. Coordinates are our own clean-room encoding of that layout.
//
// A small set of PORTALS are exempt from adjacency: long-distance travel
// links (the Riverhaven ferry) that are real exits for gameplay but do not
// connect neighboring cells.

export const DIR_VECTORS = {
  n:  [0, 1, 0],  s:  [0, -1, 0],
  e:  [1, 0, 0],  w:  [-1, 0, 0],
  ne: [1, 1, 0],  nw: [-1, 1, 0],
  se: [1, -1, 0], sw: [-1, -1, 0],
  u:  [0, 0, 1],  d:  [0, 0, -1],
};

// Also accept the spelled-out forms used by some room exit tables.
const DIR_ALIASES = { up: 'u', down: 'd', north: 'n', south: 's', east: 'e', west: 'w' };
export function canonDir(dir) {
  const d = String(dir || '').toLowerCase();
  if (DIR_VECTORS[d]) return d;
  const c = DIR_ALIASES[d];
  return c && DIR_VECTORS[c] ? c : null;
}

export const OPP = {
  n: 's', s: 'n', e: 'w', w: 'e',
  ne: 'sw', sw: 'ne', nw: 'se', se: 'nw',
  u: 'd', d: 'u',
};

// roomId -> [x, y, z]
export const GRID = {
  // ---- The Crossing: Town Green (origin) ----
  square: [0, 0, 0], tg_pond: [0, 0, -1],
  tg_n: [0, 1, 0], tg_ne: [1, 1, 0], tg_e: [1, 0, 0], tg_se: [1, -1, 0],
  tg_s: [0, -1, 0], tg_sw: [-1, -1, 0], tg_w: [-1, 0, 0], tg_nw: [-1, 1, 0],

  // ---- North: North Gate road, carousel & Town Hall, Jadewater ----
  north_road: [0, 2, 0], north_gate: [0, 3, 0],
  carousel_way: [1, 3, 0], carousel: [2, 3, 0], hall_street: [3, 3, 0], town_hall: [4, 3, 0],
  jadewater_way: [1, 4, 0], jadewater: [2, 4, 0], tenderfoot: [3, 4, 0],

  // ---- Northeast: NE Gate road & craft societies ----
  ne_road: [2, 1, 0], ne_gate: [3, 2, 0], herald_st: [2, 2, 0], enchanting_soc: [1, 2, 0],

  // ---- East: Mongers' Bazaar, bank, East Gate ----
  bazaar: [2, 0, 0], market_plaza: [2, -1, 0], market_way: [3, 0, 0],
  brewery: [3, 1, 0], forge: [4, 1, 0],
  forge_row: [3, -1, 0], auction_house: [3, -2, 0], commodity_pit: [4, -3, 0],
  bank_plaza: [4, 0, 0], order_hq: [4, -1, 0],
  east_road: [5, 0, 0], east_gate: [6, 0, 0], middens: [6, -1, 0],

  // ---- Southeast housing: Longbow Bridge, Tatting Street ----
  longbow: [5, -1, 0], tatting_st: [5, -2, 0], riverlace: [5, -3, 0],
  crofton_walk: [4, -2, 0], smithy_lane: [3, -3, 0],

  // ---- South: stockyard, South Road, riverfront Strand ----
  stockyard: [0, -2, 0], jail: [0, -2, -1], south_road: [0, -3, 0],
  strand: [-1, -3, 0], strand_communal: [-1, -4, 0], segoltha_stair: [-2, -5, 0],
  sw_road: [-1, -2, 0],

  // ---- Docks & amusement pier ----
  market_end: [1, -3, 0], docks: [1, -4, 0], half_pint: [2, -4, 0], pier: [1, -5, 0],

  // ---- West: Guild District rows & Asemath Academy ----
  guild_district: [-2, 0, 0], guild_halls_n: [-3, 0, 0], academy: [-3, -1, 0],
  hall_barbarian: [-4, 0, 0], hall_bard: [-5, 0, 0], hall_cleric: [-6, 0, 0],
  hall_empath: [-7, 0, 0], hall_moonmage: [-8, 0, 0], hall_necromancer: [-9, 0, 0],
  guild_halls_s: [-2, -1, 0], hall_paladin: [-2, -2, 0], hall_ranger: [-2, -3, 0],
  hall_thief: [-2, -4, 0], hall_trader: [-3, -4, 0], hall_warmage: [-3, -5, 0],

  // ---- Northwest: temple quarter & sewers below ----
  nw_road: [-2, 1, 0], temple_row: [-3, 1, 0], fane: [-4, 1, 0],
  temple: [-4, 2, 0], high_temple: [-5, 2, 0], immortals_approach: [-5, 3, 0],
  sewers_1: [-3, 1, -1], sewers_2: [-3, 2, -1], sewers_3: [-3, 3, -1],
  sewers_4: [-3, 3, -2], sewers_5: [-3, 3, -3],

  // ---- West Gate road, tailor, caravan barn ----
  west_road: [-1, 2, 0], tailor_shop: [-1, 3, 0], aldoran_barn: [-2, 3, 0],
  west_gate: [-2, 2, 0],

  // ---- Siergelde woods, ferry landing, deep wilds ----
  woods_path: [-3, 2, 0], woods_1: [-3, 3, 0], rh_ferry: [-4, 3, 0],
  rh_wilds_1: [-5, 6, 0], rh_wilds_2: [-5, 5, 0], rh_wilds_3: [-6, 5, 0],
  woods_2: [-3, 4, 0], deep_1: [-3, 5, 0], deep_2: [-2, 5, 0],
  black_1: [-1, 5, 0], black_2: [-1, 5, -1],

  // ---- Bandit camp & Cinder Cavern (hills north of West Road) ----
  camp_path: [-1, 4, 0], camp_hollow: [0, 4, 0], camp_den: [0, 5, 0],
  cinder_1: [0, 5, -1], cinder_2: [0, 6, -1],

  // ---- Marsh beyond the East Gate ----
  marsh_1: [7, 0, 0], marsh_2: [7, -1, 0],

  // ---- Riverhaven (far away across the Segoltha; ferry is a portal) ----
  rh_square: [100, 0, 0], rh_market: [101, 0, 0], rh_temple: [100, -1, 0],
  rh_guilds: [99, 0, 0],
};

// Directed exits that are real gameplay links but not grid-adjacent steps
// ("room:dir>destination"). Their reciprocals are listed too when present.
export const PORTALS = new Set([
  'pier:w>rh_square',        // amusement-pier barge across the Segoltha
  'rh_square:n>rh_ferry',    // ...and back to the ferry landing
  'rh_ferry:s>rh_square',    // ferry downstream to Riverhaven
  'rh_ferry:sw>rh_wilds_1',  // ferry landing trail out to the wilds
  'rh_wilds_1:ne>rh_ferry',  // ...and back
]);

const keyOf = (p) => p.join(',');
const add = (a, v) => [a[0] + v[0], a[1] + v[1], a[2] + v[2]];

const CELL_INDEX = (() => {
  const m = new Map();
  for (const [id, p] of Object.entries(GRID)) {
    if (m.has(keyOf(p))) throw new Error(`grid: ${id} overlaps ${m.get(keyOf(p))} at ${keyOf(p)}`);
    m.set(keyOf(p), id);
  }
  return m;
})();

export function posOf(roomId) {
  return GRID[roomId] || null;
}

export function roomAt(x, y, z) {
  return CELL_INDEX.get(`${x},${y},${z}`) || null;
}

// Exits implied purely by geometry: every occupied neighbor cell yields an
// exit whose direction matches the delta.
export function deriveExits(roomId) {
  const pos = posOf(roomId);
  if (!pos) return null;
  const exits = {};
  for (const [dir, v] of Object.entries(DIR_VECTORS)) {
    const nid = roomAt(...add(pos, v));
    if (nid) exits[dir] = nid;
  }
  return exits;
}

function isPortal(roomId, dir, dest) {
  return PORTALS.has(`${roomId}:${dir}>${dest}`);
}

// Cross-check data/world.js against the grid. Returns { ok, issues } where
// each issue is a short human-readable string. Clean output means the world
// graph and the grid agree everywhere.
export function validateWorld(rooms) {
  const issues = [];

  for (const id of Object.keys(rooms)) {
    if (!GRID[id]) issues.push(`${id}: no grid coordinates`);
  }
  for (const id of Object.keys(GRID)) {
    if (!rooms[id]) issues.push(`grid: ${id} has coordinates but no room`);
  }

  for (const [id, room] of Object.entries(rooms)) {
    const pos = GRID[id];
    if (!pos) continue;
    for (const [rawDir, dest] of Object.entries(room.exits || {})) {
      const dir = canonDir(rawDir);
      if (!dir) { issues.push(`${id}: unknown exit direction "${rawDir}"`); continue; }
      if (!rooms[dest]) { issues.push(`${id} --${dir}--> missing room "${dest}"`); continue; }
      if (isPortal(id, dir, dest)) continue;

      const destPos = GRID[dest];
      if (!destPos) { issues.push(`${id} --${dir}--> ${dest}: destination off-grid`); continue; }
      const want = add(pos, DIR_VECTORS[dir]);
      if (keyOf(want) !== keyOf(destPos)) {
        issues.push(`${id} --${dir}--> ${dest}: ${dest} sits at (${destPos}) but ${dir} implies (${want})`);
      }
      const back = canonicalExit(rooms[dest], OPP[dir]);
      if (back !== id && !isPortal(dest, OPP[dir], id)) {
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
let _exitsLookup = (id) => ({});
export function setExitsLookup(fn) { _exitsLookup = fn; }
function rooms_exits(id) { return _exitsLookup(id) || {}; }

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
