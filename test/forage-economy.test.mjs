import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  auth, createCharacter, loadPlayer, setupGame, teardownGame,
} from './helpers.mjs';

const { addItem } = await import('../server/player.js');

let game;

before(() => { game = setupGame(); });
after(() => teardownGame());

test('Mags buys the firewood produced by foraging', async () => {
  const account = await auth.registerAccount('Magseller', 's3cretword');
  const charId = createCharacter(account.accountId, {
    name: 'Kindler', race: 'human', guild: 'ranger',
  });
  const p = loadPlayer(charId);
  p.room = 'bazaar';
  addItem(p, 'stick', 1);
  addItem(p, 'branch', 1);

  const beforeSilver = p.silver;
  const stick = game.sell(p, 'stick');
  const branch = game.sell(p, 'branch');

  assert.equal(stick.ok, true);
  assert.equal(branch.ok, true);
  assert.equal(p.silver, beforeSilver + 3);
});
