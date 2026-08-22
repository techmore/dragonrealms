// Density expansion: insert filler walk-rooms along unconstrained town edges.
// Fact-safe by construction: any edge that could influence a map-fact
// measurement (endpoints or interior of any asserted path, plus all edges
// within max-steps of a near-fact anchor) is protected from densification.
//
// Run: node scripts/densify.mjs [--depth N]
import { ROOMS } from '../data/world.js';
import { MAP_FACTS } from '../data/map-facts.js';
import { writeFileSync, readFileSync } from 'node:fs';

const depthArg = process.argv.indexOf('--depth');
const DEPTH = Number(depthArg >= 0 ? process.argv[depthArg + 1] : 2);

const OPP = { n:'s', s:'n', e:'w', w:'e', ne:'sw', sw:'ne', nw:'se', se:'nw', up:'down', down:'up' };
function neighbors(id) {
  const out = [];
  for (const [d, dest] of Object.entries(ROOMS[id]?.exits || {})) {
    if (ROOMS[dest]) out.push([d, dest]);
  }
  return out;
}

// ---- Protection set ----
const protectedRooms = new Set();
for (const f of MAP_FACTS) {
  for (const id of [f.a, f.b, f.near].filter(Boolean)) protectedRooms.add(id);
  if (f.present) for (const id of f.present) protectedRooms.add(id);
}
// Protect every room that can influence a hop-count measurement: for each
// near fact, any room x on a shortest route a->b with len == steps.
function bfsDist(from) {
  const dist = new Map([[from, 0]]);
  const q = [from];
  while (q.length) {
    const id = q.shift();
    for (const [, nb] of neighbors(id)) {
      if (!dist.has(nb)) { dist.set(nb, dist.get(id) + 1); q.push(nb); }
    }
  }
  return dist;
}
{
  const toA = new Map(); // roomId -> dist from anchor a
  const anchors = new Set();
  for (const f of MAP_FACTS) if (f.near != null && f.steps != null) {
    if (!anchors.has(f.a)) { anchors.add(f.a); toA.set(f.a, bfsDist(f.a)); }
    const dA = toA.get(f.a), dB = bfsDist(f.near);
    for (const [x] of Object.entries(ROOMS)) {
      if (dA.has(x) && dB.has(x) && dA.get(x) + dB.get(x) === f.steps) protectedRooms.add(x);
    }
  }
}

// ---- Candidate edges ----
const edits = [];
for (const [id, room] of Object.entries(ROOMS)) {
  if (room.zone !== 'town') continue;
  if (id.startsWith('dens_')) continue;
  if (protectedRooms.has(id)) continue;
  for (const [dir, dest] of Object.entries(room.exits || {})) {
    if (!ROOMS[dest] || ROOMS[dest].zone !== 'town') continue;
    if (dest.startsWith('dens_') || protectedRooms.has(dest)) continue;
    if (id > dest) continue; // each pair once
    edits.push({ a: id, b: dest, dir });
  }
}

// ---- Apply ----
let src = readFileSync(new URL('../data/world.js', import.meta.url), 'utf8');
const newRooms = [];
let added = 0;
const DESCS = [
  'The street runs straight between close-built tenements; laundry lines sag overhead and the cobbles are worn smooth by cart traffic.',
  "A quiet stretch of road. Lantern brackets stand empty in the daylight, and a stray cat watches from a doorstep.",
  'Shopfronts give way to shuttered windows here. The smell of baking bread drifts from somewhere unseen.',
  'The way widens slightly where delivery carts once turned. Deep ruts channel the rainwater toward the gutter.',
  "A narrow drain runs down the middle of the lane. The buildings lean inward overhead, nearly touching.",
  "Chalked children's games mark the flagstones. Someone has propped a broom against a door as if interrupted mid-sweep.",
  "The crowd thins on this stretch. A busker's upturned cap lies empty at the base of a rain barrel.",
  'Moss climbs the north-facing walls. The air carries river damp and woodsmoke in equal measure.',
];
const NAMES = ['Walk', 'Stretch', 'Row', 'Lane', 'Passage', 'Way'];

for (const { a, b, dir } of edits) {
  const opp = OPP[dir];
  if (!opp) continue;
  const ids = Array.from({ length: DEPTH }, (_, i) => `dens_${a}_${b}_${i}`.replace(/[^a-z0-9_]/g, '_'));
  // Rewire a.dir -> ids[0] and b.opp -> ids[last].
  const patA = new RegExp(`(id: '${a}'.*?exits: \\{[^}]*?\\b${dir}: ')${b}(')`, 's');
  if (!patA.test(src)) continue;
  src = src.replace(patA, `$1${ids[0]}$2`);
  const patB = new RegExp(`(id: '${b}'.*?exits: \\{[^}]*?)\\b${opp}: '${a}'`, 's');
  if (!patB.test(src)) {
    // asymmetric edge: revert A rewiring to keep reciprocity
    src = src.replace(new RegExp(`(id: '${a}'.*?exits: \\{[^}]*?\\b${dir}: ')${ids[0]}(')`, 's'), `$1${b}$2`);
    continue;
  }
  src = src.replace(patB, `$1${opp}: '${ids[ids.length - 1]}'`);
  for (let i = 0; i < ids.length; i++) {
    const prev = i === 0 ? a : ids[i - 1];
    const next = i === ids.length - 1 ? b : ids[i + 1];
    const desc = DESCS[(added + i) % DESCS.length].replace(/'/g, "\\'");
    newRooms.push(`  ${ids[i]}: {\n    id: '${ids[i]}', zone: 'town', name: 'Crossing ${NAMES[(added + i) % NAMES.length]}',\n    desc: '${desc}',\n    exits: { ${dir}: '${next}', ${opp}: '${prev}' },\n  },\n`);
    added++;
  }
}

const tailAnchor = src.lastIndexOf('\n};');
src = src.slice(0, tailAnchor) + '\n' + newRooms.join('') + src.slice(tailAnchor);
writeFileSync(new URL('../data/world.js', import.meta.url), src);
console.log(`densified ${newRooms.length / Math.max(DEPTH,1) | 0} edges, ${added} rooms added`);
