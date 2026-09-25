const normalizeItemName = value => String(value || '')
  .trim()
  .replace(/[,;:.!?]+$/g, '')
  .replace(/^(a|an|the)\s+/i, '')
  .toLowerCase();

// Skin output is ordinary player text. Strip list punctuation before matching
// carried loot against the item catalog (e.g. "a marsh hog hide,").
export function skinnedItemIds(text, items) {
  const match = /You carefully skin .*? and add\s+(.+?)\s+to your pack\./i.exec(String(text || ''));
  if (!match) return [];
  const byName = new Map(Object.entries(items || {}).map(([id, item]) => [normalizeItemName(item?.name), id]));
  return match[1].split(',').map(normalizeItemName).filter(Boolean)
    .map(name => byName.get(name)).filter(Boolean);
}

export function skinnedCreatureName(text) {
  const match = /You carefully skin (?:a|an|the) (.+?) and add\s+/i.exec(String(text || ''));
  return match?.[1]?.trim().toLowerCase() || '';
}

export function visibleCorpseCounts(text) {
  const counts = {};
  const corpsePattern = /the corpse of (?:a |an |the )?([a-z][a-z' -]*?)(?=,\s*the corpse of|\s+lie on the ground)/gi;
  for (const match of String(text || '').matchAll(corpsePattern)) {
    const name = match[1].trim().toLowerCase();
    if (name) counts[name] = (counts[name] || 0) + 1;
  }
  return counts;
}

export function soldQuantityFromText(text) {
  const match = /^You sell (?:(\d+)x )?/i.exec(String(text || ''));
  return match ? Math.max(1, Number(match[1] || 1)) : 0;
}

// Picking consumes a box when it opens or when a skilled picker jams it for
// good; green fingers leave a failed box intact for another attempt.
export function consumedStrongboxFromText(text) {
  return /^(?:You work the lock and the box springs open, revealing \d+ silvers!|The lock defies your picks, and the mechanism jams for good\.)/i
    .test(String(text || '')) ? 1 : 0;
}
