// Domain suite: crafting technique slots (Pillar 26) — rank-gated slots with
// guild-affinity bonus, station-routed learning, and concrete effects on
// quality rolls, work-order pay, and brew success/potency.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  auth, createCharacter, loadPlayer, Game, handleCommand, fakeWs, game,
  setupGame, teardownGame,
} from './helpers.mjs';
import { addItem } from '../server/player.js';

before(() => setupGame());
after(() => teardownGame());

const { craftSlotsFor, CRAFT_TECHNIQUES } = await import('../data/forging.js');

async function makeChar(name, guild = 'warmage') {
  const acc = await auth.registerAccount('Tech' + name + Math.floor(Math.random() * 9999), 's3cretword');
  const charId = createCharacter(acc.accountId, { name, race: 'human', guild });
  const p = loadPlayer(charId);
  p.ws = fakeWs();
  game.addPlayer(p);
  return p;
}

const stream = (p) => p.ws.msgs.map((m) => (m.msg || '').replace(/\x1b\[[0-9]+m/g, '')).join('\n');

test('slot math: rank growth + guild affinity bonus, capped', () => {
  assert.equal(craftSlotsFor(0), 1);
  assert.equal(craftSlotsFor(10), 2);
  assert.equal(craftSlotsFor(40), 5);
  // Affinity bonus: barbarians forge (+1 slot at every rank).
  assert.equal(craftSlotsFor(0, true), 2);
  assert.equal(craftSlotsFor(40, true), 6);
});

test('learning is station-routed, rank-gated, and costs silver', async () => {
  const p = await makeChar('Apprentice');
  p.room = 'forge';
  p.skills.forging = { rank: 30, exp: 0 };
  p.silver = 500;

  handleCommand(game, p, 'technique');
  assert.match(stream(p), /forging — \d+\/\d+ slots/);
  assert.match(stream(p), /Hammer Rhythm/);

  handleCommand(game, p, 'technique learn hammer rhythm');
  assert.ok(known(p, 'hammer_rhythm'), 'technique learned');
  assert.equal(p.silver, 425, 'tuition collected (75 silvers)');

  // Rank gate: Scale Fold needs 400 (not met); Hammer Rhythm needs 25 (met).
  handleCommand(game, p, 'technique learn dragon tongue');
  assert.ok(!known(p, 'dragon_tongue'), 'rank gate holds');
  handleCommand(game, p, 'technique learn hammer rhythm');
  assert.match(stream(p), /already practice/);
  game.removePlayer(p);
});

test('quality techniques raise the quality roll tier', async () => {
  const a = await makeChar('PlainQ');
  const b = await makeChar('TechQ');
  for (const p of [a, b]) {
    p.room = 'forge';
    p.skills.forging = { rank: 14, exp: 0 }; // base roll 0.482 -> mediocre; +3 technique crosses 0.5
    p.inventory = [];
    addItem(p, 'iron_ore', 2);
  }
  // Plain: mediocre at best. Tech: hammer_rhythm +3 -> roll crosses into
  // about-average territory (>= 0.5).
  b.craftTechs = { forging: ['hammer_rhythm'] };

  const realRandom = Math.random;
  Math.random = () => 0;
  try {
    handleCommand(game, a, 'forge forged short sword');
    handleCommand(game, b, 'forge forged short sword');
  } finally {
    Math.random = realRandom;
  }
  const qa = a.inventory.find((e) => e.item.id === 'forged_short_sword')?.quality ?? 1;
  const qb = b.inventory.find((e) => e.item.id === 'forged_short_sword')?.quality ?? 1;
  assert.ok(qb > qa, `technique quality bonus lifts the roll (${qa} -> ${qb})`);
  game.removePlayer(a);
  game.removePlayer(b);
});

test('order techniques boost work-order pay; brew techniques help potions', async () => {
  const p = await makeChar('Paid');
  p.craftTechs = { forging: ['master_patterns'] };
  p.room = 'forge';
  p.workOrder = {
    verb: 'forge', recipeId: 'forged_short_sword',
    qualMult: null, qualName: 'serviceable', pay: 100, npc: 'Bram', done: true,
  };
  const silverBefore = p.silver;
  handleCommand(game, p, 'order claim');
  assert.equal(p.silver - silverBefore, 125, "Master's Patterns pays +25%");

  // Potent Essence boosts brewed draughts... and any draught the drinker mixes? No:
  // it applies to the alchemist's OWN drinking per implementation; verify the hook.
  const healer = await makeChar('Sipper');
  healer.room = 'forge';
  healer.craftTechs = { alchemy: ['potent_essence'] };
  addItem(healer, 'herb_mint', 1);
  healer.hp = 50;
  handleCommand(game, healer, 'use mint');
  assert.match(stream(healer), /restore 15 health/, '12-point draught restores 15 under Potent Essence');
  game.removePlayer(p);
  game.removePlayer(healer);
});

test('magic techniques still route to the guild hall', async () => {
  const p = await makeChar('Magest');
  p.room = 'hall_warmage';
  handleCommand(game, p, 'technique');
  assert.match(stream(p), /Magic techniques/);
  game.removePlayer(p);
});

function known(p, techId) {
  return ((p.craftTechs || {}).forging || []).includes(techId);
}
