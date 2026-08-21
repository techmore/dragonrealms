// Grid doctor: validate data/world.js against data/grid.js.
// Usage: node scripts/grid-doctor.mjs [--json]
import { ROOMS } from '../data/world.js';
import { GRID, validateWorld } from '../data/grid.js';

const { ok, issues } = validateWorld(ROOMS);
const missing = Object.keys(ROOMS).filter((id) => !GRID[id]);
const extra = Object.keys(GRID).filter((id) => !ROOMS[id]);

console.log(`rooms: ${Object.keys(ROOMS).length}  gridded: ${Object.keys(GRID).length}`);
if (missing.length) console.log('missing from GRID:', missing.join(', '));
if (extra.length) console.log('in GRID but not in ROOMS:', extra.join(', '));

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ ok, issues }, null, 2));
} else if (issues.length) {
  console.log(`\n${issues.length} issue(s):`);
  for (const i of issues) console.log('  -', i);
} else {
  console.log('world graph and universal grid agree — all exits are geometric.');
}

process.exit(ok && !missing.length && !extra.length ? 0 : 1);
