// Domain suite: specialized hunting ladders (Pillar 23) — creature kind flags
// and filtered ladder views (undead / construct / skins / boxes).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  auth, createCharacter, loadPlayer, Game, handleCommand, fakeWs, game,
  setupGame, teardownGame,
} from './helpers.mjs';

before(() => setupGame());
after(() => teardownGame());

async function makeChar(name) {
  const acc = await auth.registerAccount('Lad' + name + Math.floor(Math.random() * 9999), 's3cretword');
  const charId = createCharacter(acc.accountId, { name, race: 'human', guild: 'ranger' });
  const p = loadPlayer(charId);
  p.ws = fakeWs();
  game.addPlayer(p);
  return p;
}

test('every creature carries valid kind flags', async () => {
  const { CREATURES } = await import('../data/creatures.js');
  const VALID = new Set(['beast', 'humanoid', 'undead', 'construct', 'spirit', 'vermin']);
  for (const c of Object.values(CREATURES)) {
    assert.ok(Array.isArray(c.kinds) && c.kinds.length, `${c.id} has kinds`);
    for (const k of c.kinds) assert.ok(VALID.has(k), `${c.id} kind ${k} is valid`);
  }
});

test('undead ladder lists the blackwood dead and excludes living prey', async () => {
  const p = await makeChar('Undead');
  const out = game.ladder('undead');
  assert.match(out, /Hunting ladder — undead/);
  assert.match(out, /blackwood wraith/);
  assert.match(out, /dread knight/);
  assert.doesNotMatch(out, /sewer rat/);
  game.removePlayer(p);
});

test('locksmith ladder (boxes) surfaces strongbox droppers', async () => {
  const p = await makeChar('Boxy');
  const out = game.ladder('boxes');
  assert.match(out, /kobold/);
  assert.doesNotMatch(out, /marsh wisp/);
  game.removePlayer(p);
});

test('skins ladder lists skinnable prey; plain ladder is unchanged', async () => {
  const p = await makeChar('Skinner');
  const skins = game.ladder('skins');
  assert.match(skins, /grey wolf/);
  const plain = game.ladder(null);
  assert.match(plain, /Hunting ladder \(skill ranks a creature teaches best\)/);
  assert.match(plain, /sewer rat/);
  // Invalid filters are refused by the command layer.
  handleCommand(game, p, 'ladder nonsense');
  assert.match(
    p.ws.msgs.map((m) => m.msg || '').join('\n'),
    /Usage: ladder/,
  );
  game.removePlayer(p);
});
