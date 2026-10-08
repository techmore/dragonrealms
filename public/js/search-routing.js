// Legacy SEARCH searches the transcript unless the request explicitly names a
// corpse. FIND always searches locally, including the literal word "corpse".
// Null means continue normal game/auth routing; an empty string opens search.
export function transcriptSearchQuery(line) {
  const match = /^(find|search)(?:\s+([\s\S]*))?$/i.exec(String(line).trim());
  if (!match) return null;
  const query = (match[2] || '').trim();
  if (match[1].toLowerCase() === 'find') return query;
  if (!query || /\bcorpse\b/i.test(query)) return null;
  return query;
}
