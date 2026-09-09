// f210 engine half: the circle-up ENGINE grants a circle past 10 (and up to
// 20) whenever the requirement rows are satisfied — the blocker is world
// content (no c11-20 creatures/gear), NOT the requirement engine or the grant
// path. This locks the "engine can calculate/apply c20" claim so the remaining
// f210 work is purely the content tier.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  auth, createCharacter, loadPlayer, handleCommand, game,
  setupGame, teardownGame,
} from './helpers.mjs';

before(() => setupGame());
after(() => teardownGame());

async function circleTo20(guildId, accountName, charName) {
  const acc = await auth.registerAccount(accountName, 'f210secretpass');
  assert.equal(acc.ok, true, 'register should succeed');
  const charId = createCharacter(acc.accountId, { name: charName, race: 'human', guild: guildId });
  const p = loadPlayer(charId);
  p.ws = { send() {} };
  game.addPlayer(p);

  // Satisfy every requirement row up to circle 20: park every skill at a rank
  // above the highest c20 need (~90-120), so named HARD rows and every Nth
  // weapon/armor/lore/magic/survival row are met regardless of setter choice.
  const { SKILLS } = await import('../data/skills.js');
  for (const id of Object.keys(SKILLS)) p.skills[id] = { rank: 250, exp: 0 };

  // Stand in the guild's own hall (fresh chars start at the Crossing green).
  p.room = `hall_${guildId}`;

  let guard = 0;
  const failures = [];
  while (p.circle < 20 && guard++ < 40) {
    const before = p.circle;
    handleCommand(game, p, 'circle');
    if (p.circle !== before + 1) {
      failures.push(`circle ${before + 1} not granted (still ${p.circle})`);
      break;
    }
  }
  game.removePlayer(p);
  return { p, failures };
}

test('f210 engine: warmage circle-up grants 1 -> 20 with skills present', async () => {
  const { p, failures } = await circleTo20('warmage', 'F210Warmage', 'Fwarm');
  assert.deepEqual(failures, [], 'every circle step should grant');
  assert.equal(p.circle, 20, 'should reach circle 20');
});

test('f210 engine: barbarian circle-up grants 1 -> 20 with skills present', async () => {
  // Barbarian c20 needs rank-90 weapons/mastery — the content-hard rows.
  const { p, failures } = await circleTo20('barbarian', 'F210Barbarian', 'Fbarb');
  assert.deepEqual(failures, [], 'every circle step should grant');
  assert.equal(p.circle, 20, 'should reach circle 20');
});
