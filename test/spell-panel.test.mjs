import test from 'node:test';
import assert from 'node:assert/strict';
import { SPELL_TABS, spellTab, nextSpellTab, spellbookQuery, spellPanelRequest } from '../public/js/spell-panel.js';

test('spell tabs admit only passive spell inspection verbs', () => {
  for(const key of SPELL_TABS) assert.equal(spellTab(key),key);
  for(const key of ['learn fireball','prepare fireball','spells;attack',null,'']) assert.equal(spellTab(key),'spells');
  assert.equal(Object.isFrozen(SPELL_TABS),true);
});

test('spell tab navigation supports both arrows, wrapping, Home and End', () => {
  assert.equal(nextSpellTab('spells','ArrowRight'),'spellbook');
  assert.equal(nextSpellTab('spellbook','ArrowRight'),'slots');
  assert.equal(nextSpellTab('slots','ArrowRight'),'spells');
  assert.equal(nextSpellTab('spells','ArrowLeft'),'slots');
  assert.equal(nextSpellTab('slots','ArrowLeft'),'spellbook');
  assert.equal(nextSpellTab('spellbook','Home'),'spells');
  assert.equal(nextSpellTab('spells','End'),'slots');
});


test('spellbook queries trim and bound plain text without interpreting commands or HTML', () => {
  assert.equal(spellbookQuery('  elemental fire  '), 'elemental fire');
  assert.equal(spellbookQuery(' x '.repeat(100)).length, 120);
  assert.equal(spellbookQuery(null), '');
  assert.equal(spellbookQuery('  <img>;learn fireball  '), '<img>;learn fireball');
});

test('only spellbook request frames carry plain text query and never ordinary input', () => {
  assert.deepEqual(spellPanelRequest('spellbook','request-1','  fire  '), {t:'panel_request',requestId:'request-1',panel:'spellbook',query:'fire'});
  assert.deepEqual(spellPanelRequest('spellbook','request-2',''), {t:'panel_request',requestId:'request-2',panel:'spellbook',query:''});
  for(const panel of ['spells','slots','learn']) {
    const frame=spellPanelRequest(panel,'request-3','attack');
    assert.equal(frame.t,'panel_request');
    assert.equal(Object.hasOwn(frame,'query'),false);
    assert.equal(Object.hasOwn(frame,'line'),false);
  }
});
