export function selectLocalReplayEvents(events, { eventTimestamp = null, limit = 1,
  requiredAction = null } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 10)
    throw new RangeError('Local replay limit must be an integer from 1 to 10.');
  const candidates = events.filter(event => event?.type === 'local-decision'
    && typeof event.ts === 'string' && event.state && Array.isArray(event.options)
    && event.options.length > 0
    && (!requiredAction || event.options.some(option => option.id === requiredAction)));
  if (eventTimestamp) return candidates.filter(event => event.ts === eventTimestamp);
  return candidates.slice(-limit);
}
