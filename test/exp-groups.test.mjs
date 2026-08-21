// Domain suite: field-exp pools & pulse groups (Pillar 24) — DR model:
// everything banks, ten fixed groups convert on 20-second phases (200 s
// cycle), pool caps by skillset + Int/Disc, pulse fractions by tier with
// low-rank accelerators and Wisdom scaling.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  auth, createCharacter, loadPlayer, Game, fakeWs, game,
  setupGame, teardownGame,
} from './helpers.mjs';

before(() => setupGame());
after(() => teardownGame());

const { expGroupFor, poolCap, pulseFraction, gainSkillExp, pulseExp } = await import('../server/player.js');
const { PULSE_GROUPS, SKILLS } = await import('../data/skills.js');

async function makeChar(name, guild, race = 'human') {
  const acc = await auth.registerAccount('Pulse' + name + Math.floor(Math.random() * 9999), 's3cretword');
  const charId = createCharacter(acc.accountId, { name, race, guild });
  const p = loadPlayer(charId);
  p.ws = fakeWs();
  game.addPlayer(p);
  return p;
}

test('groups: every mapped id is a real skill; lookup is total and stable', () => {
  for (const ids of PULSE_GROUPS) {
    assert.ok(Array.isArray(ids) && ids.length > 0, 'group non-empty');
    for (const id of ids) assert.ok(SKILLS[id], `${id} resolves in SKILLS`);
  }
  // Documented anchors (docs/elanthipedia/Experience.md group table).
  assert.equal(expGroupFor('shield_usage'), 0);
  assert.equal(expGroupFor('parry'), 1);
  assert.equal(expGroupFor('bow'), 2);
  assert.equal(expGroupFor('staff'), 3);
  assert.equal(expGroupFor('primary_magic'), 4);
  assert.equal(expGroupFor('evasion'), 5);
  assert.equal(expGroupFor('stealth'), 6);
  assert.equal(expGroupFor('skinning'), 7);
  assert.equal(expGroupFor('forging'), 8);
  assert.equal(expGroupFor('tactics'), 9);
  // Guild skills pulse in the final group.
  assert.equal(expGroupFor('backstab'), 9);
  assert.equal(expGroupFor('astrology'), 9);
  // Unknown ids still get a stable in-range bucket.
  assert.equal(expGroupFor('no_such_skill'), expGroupFor('no_such_skill'));
  assert.ok(expGroupFor('no_such_skill') >= 0 && expGroupFor('no_such_skill') <= 9);
});

test('banking: field exp banks fully; nothing converts at gain time', async () => {
  const p = await makeChar('Banker', 'warmage');
  const rankBefore = p.skills.war_magic.rank;
  const leveled = gainSkillExp(p, 'war_magic', 50);
  assert.equal(leveled, 0, 'gain never levels directly');
  assert.equal(p.skills.war_magic.rank, rankBefore, 'rank unchanged at gain time');
  assert.ok(p.expPools.war_magic >= 50, 'everything banked');
  game.removePlayer(p);
});

test('pool cap: banking stops at the formula cap (mind lock)', async () => {
  const p = await makeChar('Locker', 'warmage');
  const cap = poolCap(p, 'war_magic');
  assert.ok(cap > 1000, `circle-1 primary pool has real room (${cap})`);
  gainSkillExp(p, 'war_magic', Math.ceil(cap) + 5000);
  assert.ok(p.expPools.war_magic <= cap, 'pool never exceeds its cap');
  assert.equal(p.expPools.war_magic, Math.floor(cap), 'overflow is discarded at exactly the cap');
  // Stats size the pool: raising Intelligence raises the cap.
  const before = poolCap(p, 'war_magic');
  p.stats.int = 60;
  assert.ok(poolCap(p, 'war_magic') > before, 'Intelligence grows the pool');
  game.removePlayer(p);
});

test('pulses: only the matching group converts on a phase', async () => {
  const p = await makeChar('Grouped', 'warmage');
  // shield_usage is group 0; bow is group 2.
  p.expPools = { shield_usage: 100, bow: 100 };
  const drained = pulseExp(p, 0);
  assert.ok(drained > 0, 'group-0 pool drained');
  assert.equal(p.expPools.bow, 100, 'group-2 pool untouched on group-0 phase');
  const drained2 = pulseExp(p, 2);
  assert.ok(drained2 > 0, 'group-2 pool drains on its own phase');
  game.removePlayer(p);
});

test('fractions: primaries drain slowly; tertiaries retain a longer tail', async () => {
  const p = await makeChar('Retainer', 'warmage');
  // war_magic is warmage primary; pick a tertiary-tier skill from another set.
  const tertiary = 'brawling';
  assert.ok(!p.guild.primary.includes(tertiary) && !p.guild.secondary.includes(tertiary));
  p.skills[tertiary] = { rank: 60, exp: 0 }; // above the accelerator band
  p.expPools = { war_magic: 1500, [tertiary]: 1500 };
  pulseExp(p); // flush both
  const primaryLeft = p.expPools.war_magic || 0;
  const tertiaryLeft = p.expPools[tertiary] || 0;
  assert.ok(primaryLeft < 1500, 'primary converted part of its pool');
  assert.ok(tertiaryLeft > primaryLeft, `tertiary retains more per pulse (${tertiaryLeft} vs ${primaryLeft})`);
  game.removePlayer(p);
});

test('accelerator: young secondary drains like primary', async () => {
  const p = await makeChar('Youngblood', 'warmage');
  const secondary = p.guild.secondary[0];
  p.skills[secondary] = { rank: 10, exp: 0 }; // under the rank-50 accelerator
  p.expPools = { [secondary]: 900 };
  const frac = pulseFraction(p, secondary);
  assert.ok(frac > 1 / 19 && frac <= 1 / 15 + 0.01, `young secondary drains at primary rate (${frac.toFixed(3)})`);
  p.skills[secondary].rank = 80; // veteran secondary: back to its own rate
  const vet = pulseFraction(p, secondary);
  assert.ok(vet < frac, `veteran secondary drains slower (${vet.toFixed(3)} < ${frac.toFixed(3)})`);
  game.removePlayer(p);
});

test('wisdom scales the pulse fraction on the mental-stat curve', async () => {
  const p = await makeChar('Seer', 'warmage');
  const base = pulseFraction(p, 'war_magic');
  p.stats.wis = 60;
  const boosted = pulseFraction(p, 'war_magic');
  assert.ok(boosted > base, `Wisdom quickens draining (${boosted.toFixed(3)} > ${base.toFixed(3)})`);
  assert.ok(boosted < base * 1.3, 'and the effect stays inside the documented curve');
  game.removePlayer(p);
});
