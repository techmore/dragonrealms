// Roadmap P11: "bonus stance points do not yet change allocation or combat
// outcomes." This pins the fix: a barbarian's Defending-rank bonus (+1 per 60
// ranks) must add to their effective defense in creature combat.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { auth, createCharacter, loadPlayer, fakeWs, game, setupGame, teardownGame } from './helpers.mjs';

before(() => setupGame());
after(() => teardownGame());

test('barbarian bonus stance points raise effective defense in combat', async () => {
  const { Combat } = await import('../server/combat.js');

  const acc = await auth.registerAccount('BnsStance1', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Bracer', race: 'human', guild: 'barbarian' });
  const p = loadPlayer(charId);
  p.ws = fakeWs();
  game.addPlayer(p);

  p.skills.evasion.rank = 50;
  p.stance = 'balanced';

  const enemyDef = { id: 'rat', name: 'a sewer rat', circle: 1,
    stats: { str: 10, ref: 10, agi: 10 }, hp: 50, attacks: ['bite'] };

  // Below the first +60 band → no bonus; above it → +1 point of edge.
  p.skills.defending.rank = 30;
  const base = Combat.stanceEdge(p);
  p.skills.defending.rank = 90;
  const boosted = Combat.stanceEdge(p);
  assert.ok(boosted > base, `defending 90 (${boosted}) must beat defending 30 (${base})`);

  game.removePlayer(p);
});
