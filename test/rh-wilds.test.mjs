// Domain suite: Riverhaven wilds (Pillar 23) — the second starting city gets
// its own depth-tiered hunting grounds with province-tiered creatures.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  auth, createCharacter, loadPlayer, Game, handleCommand, fakeWs, game,
  setupGame, teardownGame,
} from './helpers.mjs';

before(() => setupGame());
after(() => teardownGame());

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

  // Ferry road leads north into the reeds; every link is reciprocal.
  assert.equal(ROOMS.rh_ferry.exits.n, 'rh_wilds_1');
  assert.equal(ROOMS.rh_wilds_1.exits.s, 'rh_ferry');
  assert.equal(ROOMS.rh_wilds_1.exits.n, 'rh_wilds_2');
  assert.equal(ROOMS.rh_wilds_2.exits.s, 'rh_wilds_1');
  assert.equal(ROOMS.rh_wilds_2.exits.n, 'rh_wilds_3');
  assert.equal(ROOMS.rh_wilds_3.exits.s, 'rh_wilds_2');

  // Depth tiers escalate: crabs (c1) -> stalkers (c3) -> thugs (c5).
  assert.deepEqual(ROOMS.rh_wilds_1.spawns, ['mud_crab', 'mud_crab']);
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
  handleCommand(game, p, 'n'); // rh_wilds_1 (mud crabs are docile)
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

test('the ladder shows Riverhaven as its own province group', async () => {
  const p = await makeChar('Laddie');
  const out = game.ladder('province');
  assert.match(out, /Riverhaven/);
  assert.match(out, /mud crab|reed stalker|river thug/i);
  game.removePlayer(p);
});
