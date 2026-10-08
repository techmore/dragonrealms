import test from 'node:test';
import assert from 'node:assert/strict';
import { COMMAND_REFERENCE, COMMAND_CATEGORIES, searchCommands, referenceDraft } from '../public/js/command-reference.js';

// Check against the actual dispatcher in a disposable database, never game state.
process.env.DR_DB_PATH = ':memory:';
const { commandContract } = await import('../server/commands/index.js');
const { closeDb } = await import('../server/db.js');
test.after(closeDb);

test('reference verbs and aliases exist in the real command dispatcher', () => {
  const unique = new Set();
  for (const entry of COMMAND_REFERENCE) {
    assert(!unique.has(entry.verb), `duplicate verb ${entry.verb}`);
    unique.add(entry.verb);
    assert(COMMAND_CATEGORIES.includes(entry.category));
    assert.equal(entry.syntax.split(' ')[0], entry.verb);
    if (entry.local) continue;
    assert(commandContract(entry.verb), `unknown command ${entry.verb}`);
    for (const alias of entry.aliases) assert(commandContract(alias), `unknown alias ${alias}`);
  }
});

test('search combines category and case-insensitive terms and prioritizes exact aliases', () => {
  assert.deepEqual(searchCommands(' BANK ').map(e => e.verb), ['dir', 'deposit', 'withdraw']);
  assert.deepEqual(searchCommands('bank', 'Combat'), []);
  assert(searchCommands('barbarian learned', 'Guild powers').every(e => e.description.includes('Barbarian')));
  assert(searchCommands('barbarian learned', 'Guild powers').length > 1);
  assert.equal(searchCommands('i')[0].verb, 'inventory');
  assert.equal(searchCommands('stance')[0].verb, 'stance');
  assert.equal(searchCommands('zz-unrecognized-zz').length, 0);
  assert(searchCommands('', 'Magic').every(e => e.category === 'Magic'));
});

test('prepare produces only a verb, preserves drafts, and rejects unavailable input', () => {
  const entry = searchCommands('deposit')[0];
  assert.equal(referenceDraft('', entry, true).value, 'deposit');
  assert.equal(referenceDraft('   ', entry, true).value, 'deposit');
  for (const draft of ['say hello', '  say hello  ', 'attack; flee']) {
    const result = referenceDraft(draft, entry, true);
    assert.equal(result.ok, false);
    assert.equal(result.value, undefined);
  }
  const result = referenceDraft('', entry, false);
  assert.equal(result.ok, false);
  assert.equal(result.value, undefined);
});
