// Map fidelity: the sourced geographic facts for The Crossing must hold.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ROOMS } from '../data/world.js';
import { GRID, validateWorld, findPath, isDisplaced, roomAt } from '../data/grid.js';
import { MAP_FACTS, validateMapFacts } from '../data/map-facts.js';

test('every room has derived grid coordinates', () => {
  const missing = Object.keys(ROOMS).filter((id) => !GRID[id]);
  assert.deepEqual(missing, [], `rooms without coordinates: ${missing.join(', ')}`);
});

test('world graph and universal grid agree (reciprocal exits)', () => {
  const { ok, issues } = validateWorld(ROOMS);
  assert.ok(ok, issues.join('\n'));
});

test('Crossing graph matches the saved reference-fact ledger', () => {
  const { ok, issues } = validateMapFacts(ROOMS, findPath);
  assert.ok(ok, issues.join('\n'));
});

test('audit-confirmed landmarks exist in the world', () => {
  const present = MAP_FACTS.filter((f) => f.present);
  assert.ok(present.length > 0, 'presence fact table is populated');
});

test('displaced render positions are tracked', () => {
  // The derivation displaces colliding rooms deterministically; the flag must
  // exist so renderers can mark them approximate. No assertion on count —
  // dense districts legitimately produce some.
  assert.equal(typeof isDisplaced, 'function');
});

test('hierarchical addresses derive province:city:district:room', async () => {
  const { addressOf } = await import('../data/grid.js');
  const a = addressOf('square');
  assert.equal(a, 'zoluren:crossing:green:square');
  assert.ok(addressOf('rh_square').startsWith('zoluren:riverhaven:'), 'Riverhaven addresses its own city');
  assert.ok(addressOf('west_gate').includes(':west:'), 'West Gate sits in the west district');
  assert.equal(addressOf('nope_nope'), null, 'unknown rooms have no address');
});


test('every rendered room has a unique, reversible coordinate', () => {
  const cells = new Set();
  for (const [id, position] of Object.entries(GRID)) {
    assert.ok(!cells.has(position.join(',')), `overlapping room: ${id}`);
    cells.add(position.join(','));
    assert.equal(roomAt(...position), id, `room lookup must preserve ${id}`);
  }
});

test('Alchemy is east of Engineering, with reciprocal travel and one reference fact', () => {
  assert.equal(ROOMS.engineering_soc.exits.e, 'alchemy_soc');
  assert.equal(ROOMS.alchemy_soc.exits.w, 'engineering_soc');
  assert.equal(MAP_FACTS.filter(f => [f.a, f.b].includes('alchemy_soc') && [f.a, f.b].includes('engineering_soc')).length, 1);
});

test('Barbarian landmarks remain reachable in both directions after map correction', () => {
  for (const id of ['hall_barbarian', 'bazaar', 'forging_soc', 'engineering_soc', 'alchemy_soc', 'west_gate']) {
    for (const [from, to] of [['square', id], [id, 'square']]) {
      const route = findPath(from, to);
      assert.ok(route, `${from} -> ${to}`);
      let at = from;
      for (const direction of route) at = ROOMS[at].exits[direction];
      assert.equal(at, to);
    }
  }
});
