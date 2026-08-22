// Generate scripts/mapper-routes.json from the derived grid.
// Routes are CHAINED: each begins where the previous ended, so the walk order
// is always valid regardless of where the persisted mapper character logged in
// (the first route homes to `square` from any room via BFS).
import { writeFileSync } from 'node:fs';
import { ROOMS } from '../data/world.js';
import { findPath, addressOf } from '../data/grid.js';

// Ordered legs: [label, destination]. Each leg walks from the previous leg's
// end room, so the chain is always walkable.
const LEGS = [
  ['home-to-square', 'square'],
  ['west-gate', 'west_gate'],
  ['siergelde-road', 'woods_path'],
  ['woods-clearing', 'woods_1'],
  ['wolf-dens', 'woods_2'],
  ['deep-wood', 'deep_1'],
  ['troll-mounds', 'deep_2'],
  ['blackwood', 'black_1'],
  ['back-to-mounds', 'deep_2'],
  ['back-to-deep-wood', 'deep_1'],
  ['back-to-dens', 'woods_2'],
  ['back-to-clearing', 'woods_1'],
  ['camp-trail', 'camp_path'],
  ['bandit-hollow', 'camp_hollow'],
  ['captains-den', 'camp_den'],
  ['cinder-descent', 'cinder_2'],
  ['cinder-exit-den', 'camp_den'],
  ['exit-to-trail', 'camp_path'],
  ['trail-to-woods-path', 'woods_path'],
  ['east-gate', 'east_gate'],
  ['marsh-edge', 'marsh_1'],
  ['bog-hollow', 'marsh_2'],
  ['marsh-back', 'marsh_1'],
  ['marsh-home', 'square'],
  ['temple-row', 'temple_row'],
  ['sewer-entrance', 'sewers_1'],
  ['sewer-junction', 'sewers_3'],
  ['lower-drains', 'sewers_5'],
  ['sewer-climb-out', 'sewers_3'],
  ['sewer-exit', 'sewers_1'],
  ['sewer-up', 'temple_row'],
  ['home-from-temple', 'square'],
  ['ranger-quarter', 'hall_ranger'],
  ['pine-needle-path', 'pine_needle_path'],
  ['path-to-woods', 'woods_1'],
  ['woods-back-to-ranger', 'hall_ranger'],
  ['ranger-home', 'square'],
  ['herald-street', 'hall_paladin'],
  ['paladin-home', 'square'],
  // Riverhaven (via pier barge from Crossing docks)
  ['to-docks', 'docks'],
  ['barge-to-riverhaven', 'rh_square'],
  ['rh-market', 'rh_market'],
  ['rh-enchanting', 'rh_enchanting'],
  ['rh-noble-inn', 'rh_noble_inn'],
  ['rh-back-to-square', 'rh_square'],
  ['rh-temple', 'rh_temple'],
  ['rh-temple-garden', 'rh_temple_garden'],
  ['rh-garden-back', 'rh_temple'],
  ['rh-guilds-street', 'rh_guilds'],
  ['rh-barbarian-hall', 'rh_hall_barbarian'],
  ['rh-bard-hall', 'rh_hall_bard'],
  ['rh-cleric-hall', 'rh_hall_cleric'],
  ['rh-empath-hall', 'rh_hall_empath'],
  ['rh-moonmage-hall', 'rh_hall_moonmage'],
  ['rh-academy', 'rh_academy'],
  ['rh-ferry-landing', 'rh_ferry'],
  ['rh-wilds-head', 'rh_wilds_1'],
  ['home-from-riverhaven', 'square'],
];

const out = [];
let cur = 'square';
for (const [name, dest] of LEGS) {
  const from = cur; // chained: each leg starts where the last ended
  const steps = findPath(from, dest);
  if (!steps) { console.error(`UNREACHABLE: ${from} -> ${dest}`); process.exit(1); }
  // Waypoints: the room the walker should occupy after each step. The agent
  // uses these to re-home via the debug API when a step fails (combat flee).
  let room = from;
  const rooms = [room];
  for (const step of steps) {
    room = ROOMS[room].exits[step] ?? room;
    rooms.push(room);
  }
  out.push({ name: `${name} (${from}->${dest})`, steps, rooms, fromAddr: addressOf(from), toAddr: addressOf(dest) });
  cur = dest;
}
writeFileSync(new URL('./mapper-routes.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.log(`wrote ${out.length} chained routes, ${out.reduce((n, r) => n + r.steps.length, 0)} total steps`);
