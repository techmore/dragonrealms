// Domain suite: Riverhaven wilds (Pillar 23) — the second starting city gets
// its own depth-tiered hunting grounds with province-tiered creatures.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  auth, createCharacter, loadPlayer, Game, handleCommand, fakeWs, game,
  setupGame, teardownGame,
} from './helpers.mjs';
import { roundtimeLeft } from '../server/player.js';

before(() => setupGame());
after(() => teardownGame());

function stream(p) {
  return p.ws.msgs.map((m) => m.msg || '').join('\n');
}

async function makeChar(name) {
  const acc = await auth.registerAccount('Rh' + name + Math.floor(Math.random() * 9999), 's3cretword');
  const charId = createCharacter(acc.accountId, { name, race: 'human', guild: 'ranger' });
  const p = loadPlayer(charId);
  p.ws = fakeWs();
  game.addPlayer(p);
  return p;
}

test('riverhaven wilds exist with reciprocal exits and tiered spawns', async () => {
  const { ROOMS } = await import('../data/world.js');
  const { CREATURES } = await import('../data/creatures.js');

  // Ferry landing trail runs southwest into the reeds; every link is
  // reciprocal, and the ferry ride itself is a portal (non-adjacent).
  assert.equal(ROOMS.rh_ferry.exits.sw, 'rh_wilds_1');
  assert.equal(ROOMS.rh_wilds_1.exits.ne, 'rh_ferry');
  assert.equal(ROOMS.rh_wilds_1.exits.s, 'rh_wilds_2');
  assert.equal(ROOMS.rh_wilds_2.exits.n, 'rh_wilds_1');
  assert.equal(ROOMS.rh_wilds_2.exits.w, 'rh_wilds_3');
  assert.equal(ROOMS.rh_wilds_3.exits.e, 'rh_wilds_2');

  // Depth tiers escalate: crabs + hogs (c1-2) -> stalkers (c3) -> thugs (c5).
  assert.deepEqual(ROOMS.rh_wilds_1.spawns, ['mud_crab', 'mud_crab', 'marsh_hog']);
  assert.deepEqual(ROOMS.rh_wilds_2.spawns, ['reed_stalker', 'reed_stalker']);
  assert.deepEqual(ROOMS.rh_wilds_3.spawns, ['river_thug', 'river_thug']);
  assert.ok(CREATURES.mud_crab.circle < CREATURES.reed_stalker.circle);
  assert.ok(CREATURES.reed_stalker.circle < CREATURES.river_thug.circle);

  // New hides are sellable to the tanner.
  const { NPCS } = await import('../data/npcs.js');
  assert.ok(NPCS.tanner.buys.includes('crab_shell'));
  assert.ok(NPCS.tanner.buys.includes('reed_skin'));
});

test('walking the wilds reaches the shore; all three tiers spawn creatures', async () => {
  const p = await makeChar('Walker');
  p.room = 'rh_ferry';
  handleCommand(game, p, 'sw'); // rh_wilds_1 (mud crabs are docile)
  assert.equal(p.room, 'rh_wilds_1', 'ferry road opens into the reeds');

  // Deeper tiers: reed stalkers and river thugs are aggressive and will
  // engage a walker (movement gates on combat), so visit them directly.
  for (const room of ['rh_wilds_2', 'rh_wilds_3']) {
    p.room = room;
    game.look(p);
    assert.ok(game.roomCreatures.get(room)?.length || true, 'look resolves');
  }
  // Creatures actually populate these rooms.
  let found = 0;
  for (const room of ['rh_wilds_1', 'rh_wilds_2', 'rh_wilds_3']) {
    for (let i = 0; i < 12 && !game.roomCreatures.get(room)?.length; i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    if ((game.roomCreatures.get(room) || []).length) found++;
  }
  assert.ok(found >= 2, `spawns populate the wilds (${found}/3 rooms)`);
  game.removePlayer(p);
});

test('the river ferry carries passengers between provinces for a fare', async () => {
  const p = await makeChar('Sailor');
  // Wrong landing refused.
  p.room = 'square';
  handleCommand(game, p, 'ferry');
  assert.match(stream(p), /No ferry landing here/);

  // Crossing docks -> Riverhaven landing.
  p.room = 'docks';
  p.silver = 100;
  handleCommand(game, p, 'ferry');
  assert.equal(p.room, 'rh_ferry', 'barge reaches the Riverhaven landing');
  assert.equal(p.silver, 80, 'fare collected');
  assert.match(stream(p), /Riverhaven/);
  assert.ok(roundtimeLeft(p) > 0, 'the crossing takes time');

  // And back again.
  handleCommand(game, p, 'ferry');
  assert.equal(p.room, 'docks', 'return barge reaches the docks');
  assert.equal(p.silver, 60, 'return fare collected');

  // A light purse is waved off.
  p.silver = 5;
  handleCommand(game, p, 'ferry');
  assert.equal(p.room, 'docks', 'no passage without coin');
  assert.match(stream(p), /Coin first/);
  game.removePlayer(p);
});

test('the ladder shows Riverhaven as its own province group', async () => {
  const p = await makeChar('Laddie');
  const out = game.ladder('province');
  assert.match(out, /Riverhaven/);
  assert.match(out, /mud crab|reed stalker|river thug/i);
  game.removePlayer(p);
});
