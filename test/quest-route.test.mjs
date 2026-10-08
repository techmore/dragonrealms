import test from 'node:test';
import assert from 'node:assert/strict';
import { questRouteDestination, formatQuestRoute } from '../server/quest-route.js';

const rooms = {
  start: { name: 'Start', exits: { n: 'delivery', e: 'leader' }, npcs: [] },
  delivery: { name: 'Recipient', exits: { n: 'far' }, npcs: ['towncrier'] },
  far: { name: 'Far Crier', exits: {}, npcs: ['towncrier', 'wrong'] },
  leader: { name: 'Guild Hall', exits: {}, npcs: ['right'] },
  island: { name: 'Island Hall', exits: {}, npcs: ['right'] },
};
const npcs = { right: { role: 'guild', guild: 'bard' }, wrong: { role: 'guild', guild: 'cleric' } };

test('unfinished deliveries route to their recorded destination without changing objective state', () => {
  const p = { room: 'start', quest: { kind: 'deliver', source: 'crier', target: { room: 'delivery' }, done: false } };
  const before = JSON.stringify(p);
  assert.equal(questRouteDestination(p, rooms, npcs).roomId, 'delivery');
  assert.match(formatQuestRoute(p, '1', rooms, npcs), /Delivery destination.*\n[\s\S]*1\. n/);
  assert.equal(JSON.stringify(p), before);
  p.room = 'delivery';
  assert.match(formatQuestRoute(p, '', rooms, npcs), /already at/);
});

test('completed deliveries route to nearest reachable crier rather than delivery recipient', () => {
  const p = { room: 'start', quest: { kind: 'deliver', done: true, target: { room: 'far' } } };
  assert.equal(questRouteDestination(p, rooms, npcs).roomId, 'delivery');
  assert.match(formatQuestRoute(p, '', rooms, npcs), /The town crier/);
});

test('guild completion chooses only the current guild and a reachable authored placement', () => {
  const p = { room: 'start', guild: { id: 'bard' }, quest: { kind: 'kill', source: 'leader', done: true } };
  assert.equal(questRouteDestination(p, rooms, npcs).roomId, 'leader');
  assert.match(formatQuestRoute(p, '', rooms, npcs), /Your guild leader/);
  p.guild = null;
  assert.equal(questRouteDestination(p, rooms, npcs).state, 'unknown');
});

test('missing destinations, unrouteable givers and unfinished hunts remain explicit', () => {
  assert.equal(questRouteDestination({ room: 'start' }, rooms, npcs).state, 'none');
  for (const kind of ['kill', 'skin', 'recover', 'unknown']) {
    assert.match(formatQuestRoute({ room: 'start', quest: { kind } }, '', rooms, npcs), /no single travel destination/);
  }
  assert.equal(questRouteDestination({ room: 'start', quest: { kind: 'deliver', target: { room: 'missing' } } }, rooms, npcs).state, 'unknown');
  assert.match(formatQuestRoute({ room: 'island', quest: { kind: 'kill', done: true } }, '', rooms, npcs), /No ordinary walking route/);
  for (const steps of ['0', '21', '-1', '1.5', '1 extra']) assert.match(formatQuestRoute({}, steps, rooms, npcs), /Usage:/);
});
