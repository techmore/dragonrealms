// Periodic FE telemetry has an incidental transcript position and is tested by
// the browser suite. All other frames and gameplay numbers remain compared.
// Authentication tokens and explicitly recorded generated actor identity are
// the only normalized values. No clocks, vitals, RT, currencies or stats masked.
export function sanitizeCorpusMessages(messages) {
  return messages.map((message) => message.t === 'authed' && typeof message.token === 'string'
    ? { ...message, token: 'SESSION_TOKEN' } : message);
}

export function normalizeCorpus(messages, { name, username, characterId } = {}) {
  const identities = [[name, 'CORPUS_CHARACTER'], [username, 'CORPUS_ACCOUNT']]
    .filter(([value]) => typeof value === 'string' && value.length > 0)
    .sort((a, b) => b[0].length - a[0].length);
  const replaceIdentity = (text) => {
    for (const [value, replacement] of identities) {
      // Match an entire actor identifier, never a substring of another word.
      const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      text = text.replace(new RegExp(`(^|[^\\w]|\\x1b\\[[0-9;]*m)${escaped}(?![\\w])`, 'g'), (_match, prefix) => prefix + replacement);
    }
    return text;
  };
  const visit = (value) => {
    if (typeof value === 'string') return replaceIdentity(value);
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, visit(child)]));
    return value;
  };
  return sanitizeCorpusMessages(messages).filter((message) => message.t !== 'mindstate').map((original) => {
    const message = visit(original);
    if (typeof message.msg === 'string') message.msg = message.msg.replace(/\s+/g, ' ');
    if (message.t === 'prompt' && characterId !== undefined && message.journey?.characterId === characterId) {
      message.journey = { ...message.journey, characterId: 'CORPUS_CHARACTER_ID' };
    }
    return JSON.stringify(message);
  }).join('\n');
}
