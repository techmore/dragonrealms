// Barbarian circling: regression guard for a structural fidelity bug.
//
// Circle 2+ requires "1st Supernatural" (data/guilds.js CIRCLE_TABLES), but
// barbarians have no mana and never cast, so the only code that fed the
// supernatural pools (Combat.castSpell -> afterCast) was unreachable for them
// and the guild's trainer teaches none of those skills either. Result:
// barbarians could NEVER gain a single supernatural rank, making circling
// mathematically impossible. Live sweep characters reached 524 total ranks and
// still failed, blocked only on that one slot.
//
// Elanthipedia (docs/elanthipedia/Barbarian.md) is explicit that Inner Fire
// abilities train it: berserks and forms "Will train Inner Fire, and then
// either Augmentation or Warding". Combat.useAbility now does exactly that.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  auth, createCharacter, loadPlayer, handleCommand, fakeWs, game,
  setupGame, teardownGame,
} from './helpers.mjs';
import { GUILDS, circleRequirements, trainableSkills } from '../data/guilds.js';
import { BARBARIAN_ABILITIES, barbarianAbilityById } from '../data/abilities.js';

before(setupGame);
after(teardownGame);

const SUPERNATURAL = ['augmentation', 'debilitation', 'targeted_magic', 'utility_magic', 'warding_magic'];

async function barb(name) {
  const acc = await auth.registerAccount(name + 'Acct', 's3cretword');
  const charId = createCharacter(acc.accountId, { name, race: 'giantman', guild: 'barbarian' });
  const p = loadPlayer(charId);
  p.ws = fakeWs();
  game.addPlayer(p);
  return p;
}

test('the supernatural requirement is real and unreachable via the trainer', () => {
  // Documents WHY abilities must train it: nothing the trainer teaches counts.
  const teachable = trainableSkills(GUILDS.barbarian);
  const viaTrainer = SUPERNATURAL.filter((s) => teachable.includes(s));
  assert.deepEqual(viaTrainer, [],
    'barbarian trainer teaches no supernatural skill — abilities are the only path');

  const missing = circleRequirements(GUILDS.barbarian, {}, 2).missing;
  assert.ok(missing.some((m) => /supernatural/i.test(m)),
    'circle 2 must still demand a supernatural rank (DR-accurate)');
});

test('barbarian abilities train a supernatural skill (augmentation or warding)', async () => {
  const p = await barb('Supertest');
  p.room = 'sewers_1';
  p.circle = 4;
  p.abilities = BARBARIAN_ABILITIES.map((a) => a.id);
  p.innerFire = 100;
  p.voice = 100;
  const { CREATURES } = await import('../data/creatures.js');
  game.roomCreatures.get(p.room).push(game.makeCreature(CREATURES.wolf));
  handleCommand(game, p, 'attack wolf');
  const combat = game.combat.getFor(p);
  assert.ok(combat, 'need an active fight to use abilities');

  // gainSkillExp banks into p.expPools (DR pool model) — ranks only move on
  // pulses — so assert on the POOL, not skills[id].exp.
  const pool = (id) => p.expPools?.[id] || 0;
  assert.equal(pool('augmentation'), 0, 'starts with no augmentation exp');
  assert.equal(pool('warding_magic'), 0, 'starts with no warding exp');

  // A roar (berserk-style art) leans Augmentation.
  const roar = combat.useAbility(barbarianAbilityById('everilds_rage'), null);
  assert.equal(roar.ok, true, `roar should succeed: ${roar.msg}`);
  assert.ok(pool('augmentation') > 0, 'a roar trains Augmentation');

  // A meditation (defensive art) leans Warding.
  p.innerFire = 100;
  const med = combat.useAbility(barbarianAbilityById('tenacity'), null);
  assert.equal(med.ok, true, `meditation should succeed: ${med.msg}`);
  assert.ok(pool('warding_magic') > 0, 'a meditation trains Warding');

  // Inner Fire itself still trains, per "will train Inner Fire, and then...".
  assert.ok(pool('inner_fire') > 0, 'abilities still train Inner Fire');

  game.removePlayer(p);
});

test('a well-trained barbarian can satisfy every circle-2 requirement', async () => {
  const p = await barb('Circleable');
  // Ranks a real grinding run plausibly reaches, plus the supernatural rank
  // that abilities now make obtainable. If circling were still impossible
  // this assertion could not pass at ANY rank level.
  const set = {
    expertise: 8, melee_mastery: 8, inner_fire: 2, parry: 8, evasion: 6,
    blunt: 8, large_edged: 8, twohanded_blunt: 4, thrown: 2,
    light_armor: 6, shield_usage: 2,
    perception: 4, athletics: 4, foraging: 4, skinning: 2,
    tactics: 2, appraisal: 2, scholarship: 2,
    augmentation: 2,
  };
  for (const [id, rank] of Object.entries(set)) p.skills[id] = { rank, exp: 0 };
  const res = circleRequirements(GUILDS.barbarian, p.skills, 2);
  assert.deepEqual(res.missing, [], 'no requirement may be unsatisfiable');
  assert.equal(res.ok, true, 'barbarian must be able to reach circle 2');
  game.removePlayer(p);
});
