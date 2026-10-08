import test from 'node:test';
import assert from 'node:assert/strict';
import { transcriptSearchQuery } from '../public/js/search-routing.js';

test('explicit corpse searches continue to the game, including named and case variations', () => {
  for (const line of ['search', 'search corpse', "search Arwen's corpse", 'SEARCH CORPSE',
    '  search  Arwen’s Corpse  ', 'search the corpse here']) {
    assert.equal(transcriptSearchQuery(line), null, line);
  }
});
test('legacy searches retain local transcript behavior for non-corpse terms', () => {
  for (const [line, query] of [['search goblin', 'goblin'], ['SEARCH Bank', 'Bank'],
    ['search corpses', 'corpses'], ['search corpseflower', 'corpseflower'],
    ['search two words', 'two words'], ['  search  room description  ', 'room description']]) {
    assert.equal(transcriptSearchQuery(line), query, line);
  }
});
test('find always searches locally and opens the search bar when no term is supplied', () => {
  for (const [line, query] of [['find', ''], ['find corpse', 'corpse'], ["find Arwen's corpse", "Arwen's corpse"],
    ['FIND CORPSE', 'CORPSE'], ['find room description', 'room description']]) {
    assert.equal(transcriptSearchQuery(line), query, line);
  }
});
test('unrelated commands and command chains do not become local search requests', () => {
  for (const line of ['look corpse', 'say find corpse', 'research corpse', 'findings', 'get corpse', 'look; search corpse', '']) {
    assert.equal(transcriptSearchQuery(line), null, line);
  }
});
