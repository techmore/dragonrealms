import test from 'node:test';
import assert from 'node:assert/strict';
import { formatOrderRoute } from '../server/order-route.js';
const rooms = {
  start: { name: 'Start', exits: { n: 'near', e: 'road' } },
  near: { name: 'Near Station', exits: {} },
  road: { name: 'Road', exits: { e: 'far' } },
  far: { name: 'Far Station', exits: {} },
  island: { name: 'Island Station', exits: {} },
};
test('work-order routes select nearest directed eligible station without changing the ledger', () => {
  const p = { room: 'start', workOrder: { done: true, pay: 100 } };
  const snapshot = { done: true, eligibleStations: [{ roomId: 'far' }, { roomId: 'near' }, { roomId: 'island' }] };
  const before = JSON.stringify(p);
  const text = formatOrderRoute(p, '1', rooms, snapshot);
  assert.match(text, /filled work awaits your explicit claim/);
  assert.match(text, /Near Station \[near\]/);
  assert.match(text, /1\. n/);
  assert.equal(JSON.stringify(p), before);
  assert.match(formatOrderRoute({ room: 'near' }, '', rooms, snapshot), /already at/);
});
test('missing, unsupported and unreachable orders are explicit and never invent routes', () => {
  assert.match(formatOrderRoute({}, '', rooms, null), /no work order/);
  assert.match(formatOrderRoute({}, '', rooms, { eligibleStations: [] }), /No eligible station/);
  assert.match(formatOrderRoute({}, '', rooms, { eligibleStations: [{ roomId: 'missing' }] }), /No eligible station/);
  assert.match(formatOrderRoute({ room: 'start' }, '', rooms, { eligibleStations: [{ roomId: 'island' }] }), /No ordinary walking route/);
  for (const steps of ['0', '-1', '21', '1.5', '1 extra']) assert.match(formatOrderRoute({}, steps, rooms, null), /Usage:/);
});
test('real order routing uses claim stations rather than the remembered issuer or all brew stations', () => {
  const p = { room: 'forge', workOrder: { verb: 'craft', recipeId: 'potion_heal', pay: 50, done: true, npc: 'Bram' } };
  assert.doesNotMatch(formatOrderRoute(p), /already at/);
  assert.match(formatOrderRoute(p), /Work-order station/);
  assert.match(formatOrderRoute({ ...p, workOrder: { ...p.workOrder, verb: 'shape', recipeId: 'carved_staff' } }), /No eligible station/);
});
