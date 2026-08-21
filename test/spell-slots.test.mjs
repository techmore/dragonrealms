// Domain suite: spell-slot economy (Pillars 12/25) — learned registry,
// slot budgets by guild tier, learn/forget at the hall, prepare/cast gating,
// and the free magical feat at circle 2.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  auth, createCharacter, loadPlayer, Game, handleCommand, fakeWs, game,
  setupGame, teardownGame,
} from './helpers.mjs';

before(() => setupGame());
after(() => teardownGame());

const { spellSlotsTotal, spellSlotsUsed, spellSlotCost, GUILDS } = await import('../data/guilds.js');

// Full stream text across message types (gating lines ride on `msg`, not `error`).
const allText = (ws) => ws.msgs.map((m) => `${m.t}:${m.msg || ''}`).join('\n');

test('slot math: tier scaling, per-circle growth, circle-2 feat', () => {
  const warmage = GUILDS.warmage;   // primary magic
  const empath = GUILDS.empath;     // secondary magic
  const paladin = GUILDS.paladin;   // tertiary magic

  // Budgets grow with circle for magic guilds...
  assert.ok(spellSlotsTotal(warmage, 1) > 0);
  assert.ok(spellSlotsTotal(warmage, 10) > spellSlotsTotal(warmage, 5));
  // ...scale primary > secondary > tertiary...
  assert.ok(spellSlotsTotal(warmage, 5) > spellSlotsTotal(empath, 5));
  assert.ok(spellSlotsTotal(empath, 5) > spellSlotsTotal(paladin, 5));
  // ...and the circle-2 feat adds exactly two slots.
  const before = spellSlotsTotal(empath, 1);
  const after = spellSlotsTotal(empath, 2);
  assert.equal(after - before, Math.round((2 + 6 * 2) * 0.85) + 2 - before, 'feat contributes +2');

  // Non-magic guilds hold no slots.
  assert.equal(spellSlotsTotal(GUILDS.barbarian, 10), 0);

  // Costs follow tiers: intro < basic < intermediate <= advanced.
  assert.ok(spellSlotCost({ minCircle: 1 }) < spellSlotCost({ minCircle: 3 }));
  assert.ok(spellSlotCost({ minCircle: 3 }) < spellSlotCost({ minCircle: 5 }));
  assert.equal(spellSlotCost({ minCircle: 7 }), spellSlotCost({ minCircle: 8 }));

  // Used slots follow the circle curriculum minus forgotten spells.
  assert.equal(spellSlotsUsed(warmage, 1, []), spellSlotCost({ minCircle: 1 }));
  assert.equal(spellSlotsUsed(warmage, 1, ['fire_shard']), 0);
});

test('fresh magic characters hold their circle curriculum and can cast', async () => {
  const acc = await auth.registerAccount('SlotterA', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Arcane', race: 'human', guild: 'warmage' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  assert.deepEqual(p.spellsKnown, ['fire_shard'], 'circle-1 warmage holds the intro spell');
  handleCommand(game, p, 'cast fire_shard');
  assert.ok(!/not yet learned/.test(allText(ws)), 'held spells cast freely');
  game.removePlayer(p);
});

test('slots display shows budget and held costs', async () => {
  const acc = await auth.registerAccount('SlotterB', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Ledger', race: 'elf', guild: 'warmage' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  handleCommand(game, p, 'slots');
  const out = ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).join('\n');
  assert.match(out, /Spell slots: \d+ of \d+ used/);
  assert.match(out, /Fire Shard/i);
  game.removePlayer(p);
});

test('forget frees slots and gates casting; learn at the hall restores', async () => {
  const acc = await auth.registerAccount('SlotterC', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Fizzle', race: 'gnome', guild: 'warmage' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  handleCommand(game, p, 'forget fire_shard');
  assert.ok(!p.spellsKnown.includes('fire_shard'), 'spell removed from registry');

  handleCommand(game, p, 'cast fire_shard');
  assert.match(allText(ws), /not yet learned Fire Shard/, 'cast refuses unheld spells');

  // Learning away from the hall is refused...
  handleCommand(game, p, 'learn fire_shard');
  assert.match(allText(ws), /guild hall/);

  // ...and at the hall it returns within the budget.
  p.room = 'hall_warmage';
  handleCommand(game, p, 'learn fire_shard');
  assert.ok(p.spellsKnown.includes('fire_shard'), 'spell relearned at the hall');
  assert.match(ws.msgs.filter((m) => m.t === 'msg').map((m) => m.msg).join('\n'), /spell slots\)/);
  game.removePlayer(p);
});

test('non-magic guilds have no slots and cannot forget spells', async () => {
  const acc = await auth.registerAccount('SlotterD', 's3cretword');
  const charId = createCharacter(acc.accountId, { name: 'Brawn', race: 'gortog', guild: 'barbarian' });
  const p = loadPlayer(charId);
  const ws = fakeWs();
  p.ws = ws;
  game.addPlayer(p);

  assert.equal(spellSlotsTotal(p.guild, p.circle), 0, 'barbarians hold no spell slots');
  handleCommand(game, p, 'forget fire_shard');
  assert.match(allText(ws), /forswears/);
  game.removePlayer(p);
});
