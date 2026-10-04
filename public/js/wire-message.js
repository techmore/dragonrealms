// Additive protocol boundary: allow future message kinds, reject malformed
// known fields before routing. Optional extensions remain backward compatible.
const record = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const textTypes = new Set(['room', 'msg', 'combat', 'notice', 'error', 'prompt', 'charselect', 'charalloc']);
export function isServerMessage(message) {
  if (!record(message) || typeof message.t !== 'string' || !message.t) return false;
  if (textTypes.has(message.t) && typeof message.msg !== 'string') return false;
  if (message.t === 'room' && message.exits !== undefined
    && (!Array.isArray(message.exits) || !message.exits.every(v => typeof v === 'string'))) return false;
  if (message.requirements !== undefined
    && (!record(message.requirements) || !Array.isArray(message.requirements.rows)
      || !message.requirements.rows.every(r => record(r) && (r.have === undefined || (Number.isFinite(r.have) && Number.isFinite(r.need)))))) return false;
  if (message.journey !== undefined && (!record(message.journey)
    || !Number.isSafeInteger(message.journey.characterId)
    || !(message.journey.guildId === null || typeof message.journey.guildId === 'string'))) return false;
  return true;
}
