// Disposable database initialization precedes all transitive Player imports.
import { setupGame, teardownGame, handleCommand, fakeWs, game, auth, createCharacter, loadPlayer } from './helpers.mjs';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { workOrderSnapshot, formatWorkOrder } from '../server/work-order.js';
import { craftStationVerbs, craftOrderMultiplier } from '../server/crafting-policy.js';
import { stationVerbs } from '../server/commands/verbs.js';
import { commandContract, readPanel } from '../server/commands/index.js';
import { ROOMS } from '../data/world.js';

before(setupGame);
after(teardownGame);

function player() {
  return {
    room: 'square', silver: 100, skills: { forging: { rank: 25 }, alchemy: { rank: 0 } },
    inventory: [], aliases: {}, craftTechs: {},
    workOrder: { verb: 'forge', recipeId: 'forged_short_sword', npc: 'Bram', pay: 100, qualMult: 1.2, qualName: 'well-crafted', done: false },
  };
}

test('snapshot reports the exact quality, recipe, station and current technique-adjusted payout without mutations', () => {
  const p = player();
  p.craftTechs.forging = ['master_patterns'];
  const before = JSON.stringify(p);
  const snapshot = workOrderSnapshot(p);
  assert.equal(snapshot.state, 'active');
  assert.equal(snapshot.recipePlan.id, 'forged_short_sword');
  assert.deepEqual(snapshot.quality, { minMultiplier: 1.2, label: 'well-crafted' });
  assert.equal(snapshot.basePay, 100);
  assert.equal(snapshot.payout, 125);
  assert.deepEqual(snapshot.eligibleStations, [{ roomId: 'forge', name: ROOMS.forge.name }]);
  assert.equal(snapshot.atEligibleStation, false);
  assert.match(formatWorkOrder(p), /Current payout: 125 silvers/);
  assert.match(formatWorkOrder(p), /recipes forging forged_short_sword/);
  assert.equal(JSON.stringify(p), before);
  p.room = 'forge';
  p.workOrder.done = true;
  assert.equal(workOrderSnapshot(p).atEligibleStation, true);
  assert.match(formatWorkOrder(p), /Complete; reward unclaimed/);
  assert.match(formatWorkOrder(p), /already set aside/);
});

test('claim stations follow actual overrides and never invent an engineering-order station', () => {
  const p = player();
  for (const room of Object.keys(ROOMS)) assert.deepEqual(stationVerbs({ room }), craftStationVerbs({ room }));
  p.workOrder = { verb: 'craft', recipeId: 'healing_draught', pay: 70, done: false };
  const stations = workOrderSnapshot(p).eligibleStations.map(station => station.roomId);
  assert.ok(stations.includes('brewery'));
  assert.ok(stations.includes('commodity_pit'));
  assert.ok(!stations.includes('forge'));
  assert.ok(!stations.includes('tailor_shop'));
  p.workOrder = { verb: 'shape', recipeId: 'carved_staff', pay: 100, done: true };
  assert.deepEqual(workOrderSnapshot(p).eligibleStations, []);
  assert.match(formatWorkOrder(p), /No supported claim station/);
  const rooms = { forge: { npcs: ['artisan'] }, tailor_shop: { npcs: ['artisan'] }, workshop: { npcs: ['artisan'] } };
  const npcs = { artisan: { role: 'craft' } };
  assert.deepEqual(craftStationVerbs({ room: 'forge' }, rooms, npcs), ['forge']);
  assert.deepEqual(craftStationVerbs({ room: 'tailor_shop' }, rooms, npcs), ['tailor']);
  assert.deepEqual(craftStationVerbs({ room: 'workshop' }, rooms, npcs), ['craft']);
});

test('shared payout policy preserves cumulative order bonuses and ignores other technique effects', () => {
  const p = player();
  p.craftTechs.forging = ['bonus1', 'bonus2', 'quality', 'missing'];
  const techniques = {
    bonus1: { effect: { kind: 'order', mag: 0.25 } }, bonus2: { effect: { kind: 'order', mag: 0.5 } },
    quality: { effect: { kind: 'quality', mag: 3 } },
  };
  assert.equal(craftOrderMultiplier(p, 'forging', techniques), 1.75);
  assert.equal(craftOrderMultiplier(p, 'alchemy', techniques), 1);
});

test('missing and malformed historical orders are readable and unsafe claims never change coin or assignments', () => {
  assert.equal(workOrderSnapshot({}), null);
  assert.match(formatWorkOrder({}), /no active order/);
  for (const damaged of [
    { verb: 'unknown' }, { verb: 'forge', recipeId: 'unknown' },
    { verb: 'constructor', recipeId: 'constructor' },
    { verb: 'forge', recipeId: 'forged_short_sword', pay: NaN },
    { verb: 'forge', recipeId: 'forged_short_sword', pay: -1 },
    { verb: 'forge', recipeId: 'forged_short_sword', pay: 100, qualMult: NaN },
  ]) {
    const p = { ...player(), room: 'forge', ws: fakeWs(), workOrder: { ...damaged, done: true } };
    const initial = JSON.stringify(p.workOrder);
    const snapshot = workOrderSnapshot(p);
    assert.equal(snapshot.supported, false);
    assert.doesNotThrow(() => formatWorkOrder(p));
    handleCommand({ status() {}, persistPlayer() { throw new Error('must not persist'); } }, p, 'order claim');
    assert.equal(p.silver, 100);
    assert.equal(JSON.stringify(p.workOrder), initial);
    assert.match(p.ws.msgs[0].msg, /historical order cannot be claimed/);
  }
});

test('orders and recipes panels remain passive anywhere, and bare order inspection never requests or claims work', () => {
  const p = player();
  p.ws = fakeWs();
  const initial = JSON.stringify({ ...p, ws: undefined });
  const stubGame = { status() {}, persistPlayer() { throw new Error('must not persist'); } };
  assert.equal(commandContract('orders').panelSafe, true);
  assert.equal(commandContract('recipes').panelSafe, true);
  assert.deepEqual(commandContract('orders').mutates, []);
  assert.equal(commandContract('orders').rt.gate, false);
  assert.match(readPanel(stubGame, p, 'orders').lines.join('\n'), /Work order — Bram/);
  assert.match(readPanel(stubGame, p, 'recipes').lines.join('\n'), /Recipe plans/);
  handleCommand(stubGame, p, 'orders');
  handleCommand(stubGame, p, 'order');
  assert.equal(JSON.stringify({ ...p, ws: undefined }), initial);
  p.workOrder = null;
  handleCommand(stubGame, p, 'orders');
  assert.equal(p.workOrder, null);
});

test('valid finished orders still pay the displayed amount exactly once and persist completion', async () => {
  const account = await auth.registerAccount('Orderinspect', 'secretword9');
  const id = createCharacter(account.accountId, { name: 'Artisan', race: 'human', guild: 'barbarian' });
  const p = loadPlayer(id);
  p.ws = fakeWs();
  game.addPlayer(p);
  Object.assign(p, { room: 'forge', workOrder: player().workOrder, craftTechs: { forging: ['master_patterns'] } });
  p.workOrder.done = true;
  const pay = workOrderSnapshot(p).payout;
  const before = p.silver;
  handleCommand(game, p, 'orders');
  assert.equal(p.silver, before);
  handleCommand(game, p, 'order claim');
  assert.equal(p.silver, before + pay);
  assert.equal(p.workOrder, null);
  assert.equal(loadPlayer(id).workOrder, null);
  handleCommand(game, p, 'order claim');
  assert.equal(p.silver, before + pay);
  game.removePlayer(p);
});
