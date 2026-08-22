// Travel-route fidelity vs Tjololo's Crossing Travel script (Elanthipedia).
// See data/travel-routes.js for the sourced hop counts and the model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findPath } from '../data/grid.js';
import { ROUTES } from '../data/travel-routes.js';

test('sourced DR travel routes are walkable at comparable distance', () => {
  const failures = [];
  for (const r of ROUTES) {
    const path = findPath(r.a, r.b);
    if (!path) { failures.push(`${r.a} -> ${r.b}: UNREACHABLE`); continue; }
    const hops = path.length;
    const min = r.hops;                       // never shorter than real DR
    const max = r.maxHops ?? Math.ceil(r.hops * 2.2) + 4;  // densifier slack
    if (hops < min || hops > max) {
      failures.push(`${r.a} -> ${r.b}: ${hops} hops (sourced ${r.hops}, allowed ${min}-${max})`);
    }
  }
  assert.deepEqual(failures, [], `travel-route mismatches:\n  ${failures.join('\n  ')}`);
});
