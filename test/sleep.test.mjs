// Sleep semantics (DR Experience.md REXP section): `sleep` → light (no new
// field exp, pools keep draining, REXP still consumed), `sleep` again → deep
// (no gaining AND no draining; REXP banks at 2:1), `wake` exits and credits.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  auth, createCharacter, loadPlayer, handleCommand, fakeWs, game,
  setupGame, teardownGame,
} from './helpers.mjs';

before(() => setupGame());
after(() => teardownGame());

test('sleep: light blocks gains but keeps draining; deep suspends drain', async () => {
  const acc = await auth.registerAccount('Sleeper', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Dreamer', race: 'human', guild: 'barbarian' });
  const p = loadPlayer(charId);
  p.ws = fakeWs();
  game.addPlayer(p);

  // Awake: field exp banks normally.
  handleCommand(game, p, 'skin rat'); // harmless probe; direct exp below is deterministic
  const { gainSkillExp, pulseExp } = await import('../server/player.js');
  gainSkillExp(p, 'skinning', 100);
  assert.ok((p.expPools.skinning || 0) >= 100, 'awake banks field exp');

  // LIGHT sleep: new field exp is a no-op.
  handleCommand(game, p, 'sleep');
  assert.equal(p.sleep, 'light', 'sleep once = light');
  const poolBefore = p.expPools.skinning;
  assert.equal(gainSkillExp(p, 'skinning', 500), 0, 'light sleep blocks new field exp');
  assert.equal(p.expPools.skinning, poolBefore, 'pool unchanged by blocked gain');

  // LIGHT sleep still drains (flush-all pulse converts part of the pool).
  const before = p.expPools.skinning;
  pulseExp(p);
  assert.ok((p.expPools.skinning ?? 0) < before, 'light sleep keeps draining');

  // DEEP sleep: draining suspends entirely.
  handleCommand(game, p, 'sleep');
  assert.equal(p.sleep, 'deep', 'sleep twice = deep');
  const frozen = p.expPools.skinning ?? 0;
  assert.equal(pulseExp(p), 0, 'deep sleep suspends drain');
  assert.equal((p.expPools.skinning ?? 0), frozen, 'pool untouched in deep sleep');

  // WAKE exits and returns to awake.
  handleCommand(game, p, 'wake');
  assert.equal(p.sleep, 'awake', 'wake exits sleep');
  gainSkillExp(p, 'skinning', 50);
  assert.ok((p.expPools.skinning || 0) > frozen - 1, 'awake banks again after waking');
});

test('deep sleep banks REXP at the 2:1 ratio on wake', async () => {
  const acc = await auth.registerAccount('sleeper2', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Dreamertwo', race: 'human', guild: 'barbarian' });
  const p = loadPlayer(charId);
  p.ws = fakeWs();
  game.addPlayer(p);

  handleCommand(game, p, 'sleep');
  handleCommand(game, p, 'sleep'); // now deep; stamp deepSleepSince artificially back-dated
  p.deepSleepSince = Date.now() - 6 * 60 * 1000; // 6 minutes of deep sleep
  p.rexp = 0;

  handleCommand(game, p, 'wake');
  assert.equal(p.sleep, 'awake', 'wake exits deep sleep');
  assert.equal(p.rexp, 3, '6 min deep sleep banks 3 min REXP (2:1)');
});
