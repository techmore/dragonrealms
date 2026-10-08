import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMMAND_REFERENCE } from '../public/js/command-reference.js';
import { commandHelpEntries, formatCommandHelp } from '../server/command-help.js';
import { setupGame, teardownGame, handleCommand, fakeWs } from './helpers.mjs';
import { commandContract, readPanel } from '../server/commands/index.js';
import { before, after } from 'node:test';

before(setupGame);
after(teardownGame);

test('contextual help returns exact commands and aliases before incidental description matches', () => {
  assert.deepEqual(commandHelpEntries('JOIN').entries.map((entry) => entry.verb), ['join']);
  assert.deepEqual(commandHelpEntries('info').entries.map((entry) => entry.verb), ['score']);
  assert.deepEqual(commandHelpEntries('kill').entries.map((entry) => entry.verb), ['attack']);
  assert.match(formatCommandHelp('join'), /join <guild>/);
  assert.match(formatCommandHelp('join'), /Take a guild oath/);
  assert.match(formatCommandHelp('alias'), /alias \[<name> <command>\]/);
  assert.match(formatCommandHelp('alias'), /\$1 through \$9/);
  assert.deepEqual(commandHelpEntries('ability').entries.map((entry) => entry.verb), ['abilities']);
  assert.deepEqual(commandHelpEntries('training').entries.map((entry) => entry.verb), ['training']);
  assert.match(formatCommandHelp('training'), /training \[skills\|stats\]/);
  assert.deepEqual(commandHelpEntries('equipment').entries.map((entry) => entry.verb), ['equipment']);
});

test('category names, multiword categories and useful synonyms expose their own entries', () => {
  for (const [query, category] of [
    ['COMBAT', 'Combat'], ['guild powers', 'Guild powers'], ['powers', 'Guild powers'],
    ['items', 'Equipment'], ['gear', 'Equipment'], ['advancement', 'Character'], ['movement', 'Exploration'],
  ]) {
    const result = commandHelpEntries(query);
    assert.equal(result.category, category);
    assert.ok(result.entries.length > 1);
    assert.ok(result.entries.every((entry) => entry.category === category));
  }
});

test('all multiword search terms must match and unknown queries give recovery options', () => {
  const results = commandHelpEntries('guild oath');
  assert.deepEqual(results.entries.map((entry) => entry.verb), ['join']);
  assert.match(formatCommandHelp('no-such-verb'), /No command reference matches/);
  assert.match(formatCommandHelp('no-such-verb'), /Help topics:.*Combat/);
  assert.match(formatCommandHelp('topics'), /help <topic>/);
  assert.match(formatCommandHelp('script'), /client command/);
  assert.deepEqual(commandHelpEntries('  guild\n powers  ').entries, commandHelpEntries('guild powers').entries);
});

test('every referenced server command resolves to the registry and help remains ungated', () => {
  for (const entry of COMMAND_REFERENCE.filter((entry) => !entry.local)) {
    assert.ok(commandContract(entry.verb), `missing command ${entry.verb}`);
    assert.equal(commandHelpEntries(entry.verb).entries[0], entry);
  }
  assert.equal(commandContract('help').rt.gate, false);
  assert.deepEqual(commandContract('help').mutates, []);
});

test('dispatching help for a mutating command does not perform that action or change player state', () => {
  const p = { name: 'Reader', aliases: {}, silver: 100, circle: 1, inventory: [], ws: fakeWs() };
  const game = { status() {} };
  const snapshot = JSON.stringify({ silver: p.silver, circle: p.circle, inventory: p.inventory });
  handleCommand(game, p, 'help buy');
  assert.match(p.ws.msgs.at(-1).msg, /buy <item>/);
  assert.equal(JSON.stringify({ silver: p.silver, circle: p.circle, inventory: p.inventory }), snapshot);
  handleCommand(game, p, 'help combat');
  assert.match(p.ws.msgs.at(-1).msg, /assess/);
  handleCommand(game, p, 'help');
  assert.match(p.ws.msgs.at(-1).msg, /Dragon Realms — quick help/);
  assert.equal(commandContract('help').panelSafe, true);
  assert.match(readPanel(game, p, 'help').lines.join('\n'), /Dragon Realms — quick help/);
});
