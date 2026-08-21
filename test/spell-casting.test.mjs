// Focused regressions for the command-to-combat spell-casting seam.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  auth, createCharacter, loadPlayer, handleCommand, fakeWs, game,
  setupGame, teardownGame,
} from './helpers.mjs';
import { CREATURES } from '../data/creatures.js';

before(() => setupGame());
after(() => teardownGame());

async function makePlayer(account, name, guild) {
  const registered = await auth.registerAccount(account, 's3cretword');
  const charId = createCharacter(registered.accountId, { name, race: 'human', guild });
  const p = loadPlayer(charId);
  p.ws = fakeWs();
  game.addPlayer(p);
  return p;
}

test('combat self-buffs need no target and spend mana once', async () => {
  const p = await makePlayer('BuffCastAccount', 'Buffcaster', 'ranger');
  try {
    p.mana = 50;
    game.startCombat(p, [CREATURES.rat]);

    const manaBefore = p.mana;
    handleCommand(game, p, 'cast camouflage');

    assert.equal(p.buffs.shadow, 20, 'the self-buff takes hold during combat');
    assert.equal(manaBefore - p.mana, 6, 'the combat cast charges its mana exactly once');
    const narrative = p.ws.msgs.map((m) => m.msg || '').join(' ');
    assert.doesNotMatch(narrative, /fizzles without a target/i);
  } finally {
    game.removePlayer(p);
  }
});

test('cost modifiers preserve overchannel power scaling', async () => {
  const p = await makePlayer('PowerCastAccount', 'Powercaster', 'warmage');
  const realRandom = Math.random;
  try {
    p.circle = 5;
    p.mana = 100;
    p.skills.primary_magic = { rank: 20, exp: 0 };
    p.skills.war_magic = { rank: 20, exp: 0 };
    // Cold Casting makes 125% safe; Aether Efficiency supplies the cost
    // modifier that previously replaced the spell's power multiplier.
    p.techniques = ['cold_casting', 'aether_efficiency'];
    Math.random = () => 0; // both contested casts hit and roll equal damage
    game.startCombat(p, [CREATURES.dread_knight, CREATURES.dread_knight]);
    const combat = game.combat.getFor(p);
    const [baseTarget, overTarget] = combat.enemies;

    combat.setTarget(baseTarget.uid);
    let manaBefore = p.mana;
    handleCommand(game, p, 'prepare lightning 100');
    handleCommand(game, p, 'cast');
    const baseDamage = baseTarget.maxHp - baseTarget.hp;
    assert.equal(manaBefore - p.mana, 15, 'efficiency charges the 100% cast once');

    combat.setTarget(overTarget.uid);
    manaBefore = p.mana;
    handleCommand(game, p, 'prepare lightning 125');
    handleCommand(game, p, 'cast');
    const overDamage = overTarget.maxHp - overTarget.hp;

    assert.equal(manaBefore - p.mana, 18, 'efficiency charges the 125% cast once');
    assert.equal(overDamage, Math.round(baseDamage * 1.25),
      'the cost modifier does not erase the prepared power multiplier');
  } finally {
    Math.random = realRandom;
    game.removePlayer(p);
  }
});
