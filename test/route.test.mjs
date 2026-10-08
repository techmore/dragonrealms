// Helpers must initialize DR_DB_PATH before any registry/Player DB imports.
import { setupGame, teardownGame, handleCommand, fakeWs } from './helpers.mjs';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { ROOMS } from '../data/world.js';
import { walkingRoute, planRoute, formatRoute } from '../server/route.js';
import { commandContract, readPanel } from '../server/commands/index.js';

before(setupGame);
after(teardownGame);

const fixture = {
  start: { name: 'Start', exits: { n: 'long', e: 'short', ferry: 'island', out: 'hidden' } },
  long: { name: 'Long Road', exits: { n: 'longer', s: 'start' } },
  longer: { name: 'Longer Road', exits: { n: 'finish' } },
  short: { name: 'Short Road', exits: { up: 'finish' } },
  finish: { name: 'Destination', exits: {} },
  island: { name: 'Island', exits: {} },
  hidden: { name: 'Hidden', exits: {} },
};

test('routes are shortest directed walks and accept the same up/down spellings as movement', () => {
  assert.deepEqual(walkingRoute('start', 'finish', fixture).map(step => step.direction), ['e', 'u']);
  assert.equal(walkingRoute('finish', 'start', fixture), null);
  assert.deepEqual(walkingRoute('start', 'start', fixture), []);
  assert.equal(walkingRoute('missing', 'start', fixture), null);
  const rooms = { ...fixture, short: { name: 'Short Road', exits: { u: 'island', up: 'finish' } } };
  assert.deepEqual(walkingRoute('start', 'finish', rooms).map(step => step.direction), ['n', 'n', 'n']);
});

test('command-only ferry and passage exits never become walk steps and unreachable destinations explain them', () => {
  for (const id of ['island', 'hidden']) {
    assert.equal(walkingRoute('start', id, fixture), null);
    assert.match(formatRoute('start', id, fixture), /No ordinary walking route/);
    assert.match(formatRoute('start', id, fixture), /Ferry commands, special passages or travel magic/);
  }
  // The real graph authors this crossing as an ordinary compass exit; its
  // visual portal label must not make that actual movement edge disappear.
  assert.deepEqual(walkingRoute('rh_ferry', 'neh_dock').map(step => step.direction), ['w']);
});

test('IDs win over fuzzy names, exact duplicated names remain ambiguous, and errors stay bounded', () => {
  const rooms = { ...fixture, other: { name: 'Destination', exits: {} } };
  assert.equal(planRoute('start', 'FINISH', rooms).destination, 'finish');
  assert.equal(planRoute('start', 'destination', rooms).state, 'ambiguous');
  assert.equal(planRoute('start', 'long road', rooms).destination, 'long');
  assert.match(formatRoute('start', 'destination', rooms), /\[finish\].*\n.*\[other\]/);
  assert.match(formatRoute('finish', 'finish', rooms), /already at/);
  assert.match(formatRoute('start', 'missing', rooms), /No room matches/);
  assert.match(formatRoute('missing', 'finish', rooms), /current room is unavailable/);
  assert.match(formatRoute('start', '', rooms), /Usage: route/);
  for (const steps of ['0', '-1', '1.5', '21', '99999999999999999999']) {
    assert.match(formatRoute('start', `finish ${steps}`, rooms), /whole number from 1 to 20/);
  }
});

test('step output is bounded and ambiguous lists show IDs without silently choosing', () => {
  const rooms = {};
  for (let index = 0; index < 26; index++) rooms[`road_${index}`] = {
    name: 'Long Passage', exits: index < 25 ? { n: `road_${index + 1}` } : {},
  };
  const defaultOutput = formatRoute('road_0', 'road_25', rooms);
  assert.equal((defaultOutput.match(/^  \d+\./gm) || []).length, 8);
  assert.match(defaultOutput, /25 steps/);
  const maxOutput = formatRoute('road_0', 'road_25 20', rooms);
  assert.equal((maxOutput.match(/^  \d+\./gm) || []).length, 20);
  assert.match(maxOutput, /Showing the first 20 steps/);
  const ambiguous = planRoute('road_0', 'long passage', rooms);
  assert.equal(ambiguous.state, 'ambiguous');
  assert.equal(ambiguous.total, 26);
  assert.equal(ambiguous.matches.length, 8);
});

test('wilds routes use real traversable room exits rather than inferred coordinate neighbors', () => {
  const plan = planRoute('woods_2', 'square');
  assert.equal(plan.state, 'route');
  for (const step of plan.path) {
    const exits = ROOMS[step.from].exits;
    assert.equal(exits[step.direction] || exits[{ u: 'up', d: 'down' }[step.direction]], step.to);
  }
  assert.match(formatRoute('woods_2', 'square 1'), /Movement restrictions.*combat, stocks and jail/);
});

test('route dispatch is passive, ungated, and cannot become a movement command or panel mutation', () => {
  const p = { room: 'woods_2', aliases: {}, silver: 100, ws: fakeWs() };
  const game = { status() {}, move() { throw new Error('must not move'); }, persistPlayer() { throw new Error('must not persist'); } };
  const before = JSON.stringify({ room: p.room, silver: p.silver, aliases: p.aliases });
  handleCommand(game, p, 'route square 2', 0, { applyRT: true });
  assert.match(p.ws.msgs[0].msg, /Walking route to/);
  assert.equal(JSON.stringify({ room: p.room, silver: p.silver, aliases: p.aliases }), before);
  assert.deepEqual(commandContract('route').mutates, []);
  assert.equal(commandContract('route').rt.gate, false);
  assert.equal(commandContract('route').panelSafe, false);
  assert.equal(readPanel(game, p, 'route').ok, false);
});

 test('route quest dispatch follows a delivery and preserves the active task', () => {
  const p = { room: 'square', aliases: {}, ws: fakeWs(), quest: { kind: 'deliver', target: { room: 'temple' }, done: false } };
  const before = JSON.stringify(p.quest);
  handleCommand({ status() {} }, p, 'route quest 2');
  assert.match(p.ws.msgs[0].msg, /Delivery destination/);
  assert.match(p.ws.msgs[0].msg, /\[temple\]/);
  assert.equal(p.room, 'square');
  assert.equal(JSON.stringify(p.quest), before);
});

test('route order dispatch inspects eligible stations without moving or claiming work', () => {
  const p = { room: 'square', aliases: {}, ws: fakeWs(), workOrder: { verb: 'forge', recipeId: 'forged_short_sword', pay: 50, done: true, npc: 'Bram' } };
  const before = JSON.stringify(p.workOrder);
  handleCommand({ status() {}, move() { throw new Error('must not move'); } }, p, 'route order 2');
  assert.match(p.ws.msgs[0].msg, /Work-order station/);
  assert.match(p.ws.msgs[0].msg, /\[forge\]/);
  assert.equal(p.room, 'square');
  assert.equal(JSON.stringify(p.workOrder), before);
});
