// Only passive spell inspection verbs can be selected by the dock.
export const SPELL_TABS = Object.freeze(['spells', 'spellbook', 'slots']);
export function spellTab(key) { return SPELL_TABS.includes(key) ? key : 'spells'; }
export function nextSpellTab(current, key) {
  if (key === 'Home') return SPELL_TABS[0];
  if (key === 'End') return SPELL_TABS.at(-1);
  const index = SPELL_TABS.indexOf(spellTab(current));
  return SPELL_TABS[(index + (key === 'ArrowLeft' ? -1 : 1) + SPELL_TABS.length) % SPELL_TABS.length];
}

// Queries are plain text, never command fragments; only spellbook accepts one.
export function spellbookQuery(value) { return String(value ?? '').trim().slice(0, 120); }
export function spellPanelRequest(panel, requestId, query) {
  const selected = spellTab(panel);
  return { t: 'panel_request', requestId, panel: selected,
    ...(selected === 'spellbook' ? { query: spellbookQuery(query) } : {}) };
}
