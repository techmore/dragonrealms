// Regression test for audit finding C4: the roundtime gate (RT_BLOCK) must
// cover the alias spellings of RT-gated verbs, not just canonical forms —
// kill (alias of attack) and the combat maneuvers bash/shield-bash/disarm/
// trip. appr is covered too: it already sat beside appraise, and both
// spellings must stay gated (same pattern as tend/bandage).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  auth, createCharacter, loadPlayer, handleCommand, fakeWs, game,
  setupGame, teardownGame,
} from './helpers.mjs';
import { setRoundtime } from '../server/player.js';

before(() => setupGame());
after(() => teardownGame());

test('roundtime gate refuses RT-gated commands and their aliases (C4)', async () => {
  const acc = await auth.registerAccount('RtAlias', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Rtal', race: 'human', guild: 'barbarian' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  // Simulate an active roundtime; every RT action must be refused while it runs.
  setRoundtime(p, 30);

  const refused = (verb) => {
    ws.msgs.length = 0;
    handleCommand(game, p, `${verb} rat`, 0, { applyRT: true });
    const last = ws.msgs.filter((m) => m.t === 'msg').at(-1)?.msg || '';
    assert.match(last, /You must wait/, `"${verb}" must be refused during roundtime (got: ${last})`);
  };

  // Sanity: the canonical verb is refused, proving the gate is armed here.
  refused('attack');

  // Alias spellings that resolve to RT-gated verbs.
  for (const alias of ['kill', 'bash', 'shield-bash', 'disarm', 'trip', 'appr']) {
    refused(alias);
  }
});
