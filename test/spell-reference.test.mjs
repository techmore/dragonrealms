// Initialize disposable persistence before the registry/Player import graph.
import { setupGame, teardownGame, auth, createCharacter, loadPlayer, fakeWs, handleCommand } from './helpers.mjs';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { GUILDS, spellSlotCost, spellSlotsTotal } from '../data/guilds.js';
import { spellbookSnapshot, formatSpellbook } from '../server/spell-reference.js';
import { commandContract, readPanel } from '../server/commands/index.js';

before(setupGame);
after(teardownGame);

const player = () => ({ guild: GUILDS.cleric, circle: 3, room: 'square', skills: {}, spellsKnown: [], spellsForgotten: [], mana: 0 });

test('every magical guild curriculum reports exact spell IDs, slot cost, base mana and circle state', () => {
  for (const guild of Object.values(GUILDS).filter(guild => guild.magic)) {
    const p = { ...player(), guild };
    const initial = JSON.stringify(p);
    const book = spellbookSnapshot(p);
    assert.equal(book.totalSlots, spellSlotsTotal(guild, 3));
    assert.equal(book.total, guild.spells.length);
    for (const definition of guild.spells) {
      const entry = spellbookSnapshot(p, definition.id).entries[0];
      assert.equal(entry.id, definition.id);
      assert.equal(entry.slots, spellSlotCost(definition));
      assert.equal(entry.baseMana, definition.mana);
      assert.equal(entry.minCircle, definition.minCircle);
      assert.equal(entry.state, definition.minCircle <= 3 ? 'held' : 'future');
    }
    assert.equal(JSON.stringify(p), initial);
  }
});

test('casting availability follows circle and forgotten status, independently of the legacy spellsKnown list', () => {
  const p = player();
  p.spellsKnown = ['wrath', 'holy_aegis'];
  p.spellsForgotten = ['wrath'];
  const book = spellbookSnapshot(p);
  assert.equal(book.entries.find(spell => spell.id === 'sacred_flame').held, true);
  assert.equal(book.entries.find(spell => spell.id === 'sacred_flame').rosterMismatch, true);
  assert.equal(book.entries.find(spell => spell.id === 'wrath').state, 'forgotten');
  assert.equal(book.entries.find(spell => spell.id === 'wrath').held, false);
  assert.equal(book.entries.find(spell => spell.id === 'holy_aegis').state, 'future');
  assert.doesNotMatch(formatSpellbook(p, 'wrath'), /legacy "spells" list/);
  assert.doesNotMatch(formatSpellbook(p, 'sacred_flame'), /legacy "spells" list/);
});

test('relearning requires circle and slot room, with exact supported halls and soft mastery references', () => {
  const p = player();
  p.spellsForgotten = ['wrath'];
  p.room = 'rh_guilds';
  const book = spellbookSnapshot(p, 'wrath');
  assert.deepEqual(book.halls.map(hall => hall.roomId), ['hall_cleric', 'rh_guilds']);
  assert.equal(book.entries[0].canRelearn, true);
  assert.equal(book.entries[0].atLearningHall, true);
  assert.equal(book.entries[0].masteryRank, 10);
  assert.equal(book.entries[0].masteryGap, 10);
  assert.match(formatSpellbook(p, 'wrath'), /You are at a learning hall.*learn wrath.*fits/);
  assert.match(formatSpellbook(p, 'wrath'), /soft mastery reference/);
  p.room = 'rh_hall_cleric';
  assert.equal(spellbookSnapshot(p, 'wrath').entries[0].atLearningHall, false, 'dedicated Riverhaven hall is not a supported learnSpell gate');
  p.circle = 1;
  assert.equal(spellbookSnapshot(p, 'wrath').entries[0].canRelearn, false);
  assert.equal(spellbookSnapshot(p, 'wrath').entries[0].state, 'future');
});

test('over-budget existing holdings remain attemptable while relearning waits for free slots and result limits hold', () => {
  const p = player();
  p.circle = 1;
  p.guild = { ...p.guild, spells: Array.from({ length: 12 }, (_, i) => ({ id: `spell_${i}`, name: `Spell ${i}`, skill: 'holy_magic', minCircle: 1, mana: 10, desc: 'Holy flame.', kind: 'damage' })) };
  p.spellsForgotten = ['spell_11'];
  const book = spellbookSnapshot(p);
  assert.equal(book.overBudget, true);
  assert.equal(book.freeSlots, 0);
  assert.equal(book.entries.length, 8);
  assert.equal(spellbookSnapshot(p, 'spell_11').entries[0].canRelearn, false);
  assert.equal(spellbookSnapshot(p, 'spell_0').entries[0].held, true);
  assert.match(formatSpellbook(p), /Showing 8 of 12/);
  assert.match(formatSpellbook(p, 'spell_11'), /needs 2 free slots/);
});

test('search and nonmagical states give readable recovery without learning or modifying slots', () => {
  const p = player();
  assert.equal(spellbookSnapshot(p, 'holy flame').entries[0].id, 'sacred_flame');
  assert.ok(spellbookSnapshot(p, 'future').entries.every(entry => entry.state === 'future'));
  assert.match(formatSpellbook(p, 'missing'), /No spells match/);
  assert.match(formatSpellbook({ guild: null }), /no guild/);
  assert.match(formatSpellbook({ guild: GUILDS.barbarian }), /forswears spellcasting/);
});

test('native prepare confirms planner truth even when the legacy roster is inconsistent', async () => {
  const account = await auth.registerAccount('Spellplanner', 'secretword9');
  const p = loadPlayer(createCharacter(account.accountId, { name: 'Arcanist', race: 'human', guild: 'cleric' }));
  p.ws = fakeWs();
  p.circle = 3;
  p.spellsKnown = [];
  p.spellsForgotten = [];
  const game = { status() {} };
  assert.equal(spellbookSnapshot(p, 'wrath').entries[0].held, true);
  handleCommand(game, p, 'prepare wrath');
  assert.equal(p.prepared.spellId, 'wrath');
  p.prepared = null;
  p.spellsKnown = ['wrath'];
  p.spellsForgotten = ['wrath'];
  assert.equal(spellbookSnapshot(p, 'wrath').entries[0].held, false);
  handleCommand(game, p, 'prepare wrath');
  assert.equal(p.prepared, null);
  assert.match(p.ws.msgs.findLast(frame => frame.t === 'msg').msg, /not yet learned/);
});

test('spellbook and slots are panel-safe and remain passive during roundtime', () => {
  const p = { ...player(), aliases: { spellbook: 'forget sacred_flame' }, ws: fakeWs(), rtUntil: Date.now() + 60_000 };
  const initial = JSON.stringify({ ...p, ws: undefined });
  const game = { status() {}, persistPlayer() { throw new Error('must not persist'); } };
  assert.equal(commandContract('spellbook').panelSafe, true);
  assert.equal(commandContract('slots').panelSafe, true);
  assert.equal(commandContract('spellbook').rt.gate, false);
  assert.deepEqual(commandContract('spellbook').mutates, []);
  assert.match(readPanel(game, p, 'spellbook').lines.join('\n'), /Spellbook — Cleric/);
  assert.match(readPanel(game, p, 'slots').lines.join('\n'), /Spell slots/);
  assert.equal(JSON.stringify({ ...p, ws: undefined }), initial);
  p.aliases = {};
  const beforeCommand = JSON.stringify({ ...p, ws: undefined });
  handleCommand(game, p, 'spellbook wrath', 0, { applyRT: true });
  assert.match(p.ws.msgs[0].msg, /Spellbook — Cleric/);
  assert.equal(JSON.stringify({ ...p, ws: undefined }), beforeCommand);
});
