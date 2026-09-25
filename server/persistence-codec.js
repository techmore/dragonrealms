// Backward-compatible codec boundary for characters.persistent_state.
// The stored document stays flat because crafting and external SQL tools use
// top-level JSON paths such as $.workOrder and $.forgedQuality.
export const PERSISTENT_STATE_SCHEMA = 'dragonrealms.characters.persistent_state';
export const PERSISTENT_STATE_VERSION = 1;

const SLEEP_STATES = new Set(['awake', 'light', 'deep']);

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function objectValue(value, fallback, errors, path) {
  if (value === undefined || value === null) return structuredClone(fallback);
  if (!plainObject(value)) {
    errors.push({ path, code: 'expected-object' });
    return structuredClone(fallback);
  }
  return structuredClone(value);
}

function nullableObject(value, errors, path) {
  if (value === undefined || value === null) return null;
  if (!plainObject(value)) {
    errors.push({ path, code: 'expected-object-or-null' });
    return null;
  }
  return structuredClone(value);
}

function arrayValue(value, errors, path) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    errors.push({ path, code: 'expected-array' });
    return [];
  }
  return structuredClone(value);
}

function numberValue(value, fallback, errors, path, { nullable = false } = {}) {
  if (nullable && (value === undefined || value === null)) return null;
  if (!Number.isFinite(value)) {
    if (value !== undefined) errors.push({ path, code: 'expected-finite-number' });
    return fallback;
  }
  return value;
}

function sleepValue(value, errors) {
  if (value === undefined) return 'awake';
  if (!SLEEP_STATES.has(value)) {
    errors.push({ path: 'sleep', code: 'expected-sleep-state' });
    return 'awake';
  }
  return value;
}

function cooldownsValue(value, errors) {
  if (value === undefined || value === null) return {};
  if (!plainObject(value)) {
    errors.push({ path: 'cooldowns', code: 'expected-object' });
    return {};
  }
  const result = {};
  for (const [key, timestamp] of Object.entries(value)) {
    if (Number.isFinite(timestamp) && timestamp > 0) result[key] = timestamp;
    else errors.push({ path: `cooldowns.${key}`, code: 'expected-positive-timestamp' });
  }
  return result;
}

function unsupported(source, errors = []) {
  return {
    state: {
      schema: PERSISTENT_STATE_SCHEMA,
      version: PERSISTENT_STATE_VERSION,
      cooldowns: {},
    },
    diagnostics: {
      status: 'unsupported', source, errors, rawWasValidJson: source !== 'missing' && source !== 'malformed',
      legacyUnversioned: false, canWrite: false,
    },
  };
}

export function decodePersistentState(raw) {
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    const result = unsupported('missing');
    result.diagnostics.status = 'legacy';
    result.diagnostics.legacyUnversioned = true;
    result.diagnostics.canWrite = true;
    return result;
  }

  let value;
  try { value = JSON.parse(raw); }
  catch {
    const result = unsupported('malformed');
    result.diagnostics.status = 'repaired';
    result.diagnostics.legacyUnversioned = true;
    result.diagnostics.canWrite = true;
    return result;
  }
  if (!plainObject(value)) {
    const result = unsupported('invalid-shape');
    result.diagnostics.status = 'repaired';
    result.diagnostics.legacyUnversioned = true;
    result.diagnostics.canWrite = true;
    return result;
  }

  if (value.schema !== undefined && value.schema !== PERSISTENT_STATE_SCHEMA) return unsupported('unsupported-schema');
  if (value.version !== undefined && value.version !== PERSISTENT_STATE_VERSION) return unsupported('unsupported-version');

  const errors = [];
  const state = {
    schema: PERSISTENT_STATE_SCHEMA,
    version: PERSISTENT_STATE_VERSION,
    abilities: arrayValue(value.abilities, errors, 'abilities'),
    lastForgetAt: numberValue(value.lastForgetAt, 0, errors, 'lastForgetAt'),
    forgedQuality: objectValue(value.forgedQuality, {}, errors, 'forgedQuality'),
    crimeHeat: numberValue(value.crimeHeat, 0, errors, 'crimeHeat'),
    jailUntil: numberValue(value.jailUntil, 0, errors, 'jailUntil'),
    stocksUntil: numberValue(value.stocksUntil, 0, errors, 'stocksUntil'),
    innerFire: numberValue(value.innerFire, 100, errors, 'innerFire'),
    voice: numberValue(value.voice, 40, errors, 'voice'),
    companion: nullableObject(value.companion, errors, 'companion'),
    familiar: nullableObject(value.familiar, errors, 'familiar'),
    cambrinth: nullableObject(value.cambrinth, errors, 'cambrinth'),
    commodities: objectValue(value.commodities, {}, errors, 'commodities'),
    chafferNext: value.chafferNext === undefined ? false : Boolean(value.chafferNext),
    wounds: arrayValue(value.wounds, errors, 'wounds'),
    flags: objectValue(value.flags, {}, errors, 'flags'),
    scripts: objectValue(value.scripts, {}, errors, 'scripts'),
    spellsKnown: arrayValue(value.spellsKnown, errors, 'spellsKnown'),
    spellsForgotten: arrayValue(value.spellsForgotten, errors, 'spellsForgotten'),
    debt: numberValue(value.debt, 0, errors, 'debt'),
    workOrder: nullableObject(value.workOrder, errors, 'workOrder'),
    craftTechs: objectValue(value.craftTechs, {}, errors, 'craftTechs'),
    sleep: sleepValue(value.sleep, errors),
    deepSleepSince: numberValue(value.deepSleepSince, null, errors, 'deepSleepSince', { nullable: true }),
    cooldowns: cooldownsValue(value.cooldowns, errors),
  };
  const source = value.schema === PERSISTENT_STATE_SCHEMA
    ? (value.version === PERSISTENT_STATE_VERSION ? 'tagged-v1' : 'tagged-unversioned')
    : (value.version === PERSISTENT_STATE_VERSION ? 'legacy-flat-v1' : 'legacy-unversioned');
  return {
    state,
    diagnostics: {
      status: errors.length ? 'repaired' : (value.schema ? 'ok' : 'legacy'),
      source,
      errors,
      rawWasValidJson: true,
      legacyUnversioned: value.version === undefined,
      canWrite: true,
    },
  };
}

export function encodePersistentState(state) {
  if (!plainObject(state)) throw new Error('Persistent state must be an object.');
  return JSON.stringify({
    ...state,
    schema: PERSISTENT_STATE_SCHEMA,
    version: PERSISTENT_STATE_VERSION,
  });
}
