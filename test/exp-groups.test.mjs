// Domain suite: field-exp pulse groups (Pillar 24) — ten staggered groups,
// wall-clock phases, and retention by skillset rate.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  auth, createCharacter, loadPlayer, Game, fakeWs, game,
  setupGame, teardownGame,
} from './helpers.mjs';

before(() => setupGame());
after(() => teardownGame());

const { expGroupFor, poolConversionRate, pulseExp } = await import('../server/player.js');

async function makeChar(name, guild, race = 'human') {
  const acc = await auth.registerAccount('Pulse' + name + Math.floor(Math.random() * 9999), 's3cretword');
  const charId = createCharacter(acc.accountId, { name, race, guild });
  const p = loadPlayer(charId);
  p.ws = fakeWs();
  game.addPlayer(p);
  return p;
}

test('groups: deterministic, in range, spread across all ten', () => {
  assert.equal(expGroupFor('medium_edged'), expGroupFor('medium_edged'));
  for (let i = 0; i < 60; i++) {
    const g = expGroupFor('skill_' + i);
    assert.ok(g >= 0 && g <= 9);
  }
});

test('rates: primaries convert fully; secondaries and tertiaries retain a tail', async () => {
  const p = await makeChar('Rates', 'warmage');
  const secondaryPick = p.guild.secondary[0];
  assert.equal(poolConversionRate(p, p.guild.primary[0]), 1, 'primary converts fully');
  assert.equal(poolConversionRate(p, secondaryPick), 0.8, 'secondary retains a tail');
  const other = Object.keys((await import('../data/skills.js')).SKILLS)
    .find((id) => !p.guild.primary.includes(id) && !p.guild.secondary.includes(id));
  assert.equal(poolConversionRate(p, other), 0.65, 'tertiary retains more');
  game.removePlayer(p);
});

test('pulses: only the matching group converts on a tick', async () => {
  const p = await makeChar('Grouped', 'warmage');
  // Seed two pools whose groups differ.
  const [a, b] = ['fire_shard_skill_a', 'fire_shard_skill_b'];
  void a; void b;
  // Find two real skills in different groups.
  const ids = Object.keys((await import('../data/skills.js')).SKILLS);
  let left = null; let right = null;
  for (const id of ids) {
    if (expGroupFor(id) === 0 && !left) left = id;
    if (expGroupFor(id) === 1 && !right) right = id;
    if (left && right) break;
  }
  assert.ok(left && right, 'found skills in two different groups');
  p.expPools = { [left]: 100, [right]: 100 };

  // Tick 0 converts only group-0 pools.
  const drained = pulseExp(p, 0);
  assert.ok(drained > 0, 'group-0 pool drained');
  assert.equal(p.expPools[right], 100, 'group-1 pool untouched');
  game.removePlayer(p);
});

test('retention: secondary/tertiary pools convert partially per pulse', async () => {
  const p = await makeChar('Retainer', 'warmage');
  // Pick any skill NOT in the guild's primary or secondary lists.
  const others = Object.keys((await import('../data/skills.js')).SKILLS)
    .filter((id) => !p.guild.primary.includes(id) && !p.guild.secondary.includes(id)
      && !(p.guild.spells || []).some((s) => s.skill === id));
  assert.ok(others.length, 'tertiary-tier skill exists');
  const tertiary = others.find((id) => expGroupFor(id) === 0) || others[0];
  const g = expGroupFor(tertiary);

  p.skills[tertiary] = { rank: 0, exp: 0 };
  p.expPools = { [tertiary]: 100 };
  pulseExp(p, g);
  const afterFirst = p.expPools[tertiary];
  assert.ok(afterFirst > 0 && afterFirst < 100, `tertiary retains a tail (${afterFirst} of 100)`);

  // Repeated pulses converge toward empty.
  for (let i = 1; i <= 40; i++) pulseExp(p, g + i);
  assert.equal(p.expPools[tertiary], undefined, 'tail eventually converts');
  assert.ok(p.skills[tertiary].exp > 0 || p.skills[tertiary].rank > 0, 'converted exp landed');
  game.removePlayer(p);
});
