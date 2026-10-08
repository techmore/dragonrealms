import { auth, createCharacter, loadPlayer, setupGame, teardownGame, game, handleCommand, fakeWs } from './helpers.mjs';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { GUILDS, spellSlotCost, spellSlotsTotal } from '../data/guilds.js';
import { circleSpellPlan, heldSpellIds } from '../server/spell-policy.js';
before(setupGame);
after(teardownGame);

test('authored circle-1 curricula fit every magical guild starting budget', () => {
  const magical = Object.values(GUILDS).filter(guild => guild.magic);
  assert.equal(magical.length, 8);
  for (const guild of magical) {
    const initial = guild.spells.filter(spell => spell.minCircle <= 1);
    assert.ok(initial.reduce((sum, spell) => sum + spellSlotCost(spell), 0) <= spellSlotsTotal(guild, 1), guild.id);
    assert.deepEqual(heldSpellIds(guild, 1), initial.map(spell => spell.id));
  }
});

test('circle-8 cleric grants a newly unlocked spell when its cost fits exactly once', async () => {
  const account = await auth.registerAccount('Curriculumcleric', 'secretword9');
  const p = loadPlayer(createCharacter(account.accountId, { name: 'Priest', race: 'human', guild: 'cleric' }));
  p.ws = fakeWs(); game.addPlayer(p);
  p.circle = 7; p.room = 'hall_cleric';
  p.spellsForgotten = undefined;
  for (const skill of Object.values(p.skills)) skill.rank = 1000;
  const oldHeld = GUILDS.cleric.spells.filter(spell => spell.minCircle <= 7).map(spell => spell.id);
  handleCommand(game, p, 'circle');
  assert.equal(p.circle, 8);
  assert.ok(p.spellsKnown.includes('judgement_sun'));
  assert.ok(oldHeld.every(id => p.spellsKnown.includes(id)));
  assert.deepEqual(p.spellsForgotten, []);
  game.removePlayer(p);
});

test('new spells consume their costs once in authored order; rejected and forgotten spells stay excluded', () => {
  const guild = { id: 'cleric', magic: true, spells: [
    { id: 'intro', minCircle: 1 },
    { id: 'first', minCircle: 2 },
    { id: 'second', minCircle: 2 },
    { id: 'third', minCircle: 2 },
  ] };
  const forgotten = ['unrelated', 'unrelated'];
  const plan = circleSpellPlan(guild, 1, 2, forgotten);
  assert.deepEqual(plan.granted.map(s => s.id), ['first', 'second']);
  assert.deepEqual(plan.rejected.map(s => s.id), ['third']);
  assert.equal(plan.used, 14);
  assert.equal(plan.total, 16);
  assert.deepEqual(plan.held, ['intro', 'first', 'second']);
  assert.deepEqual(forgotten, ['unrelated', 'unrelated'], 'planning is pure');
  const later = circleSpellPlan(guild, 2, 3, plan.forgotten);
  assert.deepEqual(later.granted, [], 'extra capacity never silently relearns an old rejection');
  assert.deepEqual(later.held, plan.held);
  const explicitlyForgotten = circleSpellPlan(guild, 1, 2, ['first']);
  assert.ok(!explicitlyForgotten.held.includes('first'));
  assert.ok(!explicitlyForgotten.granted.some(s => s.id === 'first'));
});

test('legacy overbudget holdings survive; only a newly unlocked spell is rejected', () => {
  const old = Array.from({ length: 10 }, (_, i) => ({ id: `old${i}`, minCircle: 1 }));
  const guild = { id: 'cleric', magic: true, spells: [...old, { id: 'new', minCircle: 2 }] };
  const plan = circleSpellPlan(guild, 1, 2);
  assert.deepEqual(plan.held, old.map(s => s.id));
  assert.deepEqual(plan.rejected.map(s => s.id), ['new']);
  assert.equal(plan.used, 20);
  assert.equal(plan.total, 16);
  assert.deepEqual(heldSpellIds({ magic: false }, 10), []);
});

test('passive spells follows holdings without rewriting a stale roster; forget and relearn persist a normalized roster', async () => {
  const account = await auth.registerAccount('Curriculumwarmage', 'secretword9');
  const id = createCharacter(account.accountId, { name: 'Scholar', race: 'human', guild: 'warmage' });
  const p = loadPlayer(id);
  p.ws = fakeWs(); game.addPlayer(p);
  p.spellsKnown = ['bogus'];
  handleCommand(game, p, 'spells');
  assert.match(p.ws.msgs.map(m => m.msg || '').join('\n'), /Spells you hold:[\s\S]*Fire Shard/);
  assert.deepEqual(p.spellsKnown, ['bogus'], 'inspection must remain passive');
  p.spellsKnown = null;
  p.spellsForgotten = undefined;
  handleCommand(game, p, 'forget fire_shard');
  assert.deepEqual(p.spellsKnown, []);
  assert.deepEqual(loadPlayer(id).spellsKnown, [], 'load excludes persisted forgotten spells');
  p.spellsKnown = null;
  p.room = 'hall_warmage';
  handleCommand(game, p, 'learn fire_shard');
  assert.deepEqual(p.spellsKnown, ['fire_shard']);
  assert.deepEqual(loadPlayer(id).spellsKnown, ['fire_shard']);
  assert.deepEqual(loadPlayer(id).spellsForgotten, []);
  game.removePlayer(p);
});

test('circle-7 paladin preserves old holdings instead of evicting them while evaluating new costs', async () => {
  const account = await auth.registerAccount('Curriculumpaladin', 'secretword9');
  const p = loadPlayer(createCharacter(account.accountId, { name: 'Knight', race: 'human', guild: 'paladin' }));
  p.ws = fakeWs(); game.addPlayer(p);
  p.circle = 6; p.room = 'hall_paladin';
  for (const skill of Object.values(p.skills)) skill.rank = 1000;
  const oldHeld = GUILDS.paladin.spells.filter(spell => spell.minCircle <= 6).map(spell => spell.id);
  handleCommand(game, p, 'circle');
  assert.equal(p.circle, 7);
  assert.ok(oldHeld.every(id => p.spellsKnown.includes(id)));
  assert.deepEqual(p.spellsForgotten, []);
  game.removePlayer(p);
});
