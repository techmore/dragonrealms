// Versioned client configuration. Pure validation keeps malformed imports
// from reaching boot-time consumers or partially replacing a working setup.
export const CONFIG_KEYS = ['dr_settings', 'dr_macros', 'dr_triggers', 'dr_highlights_v1', 'dr_gags_v1', 'dr_scripts_v1', 'dr_windows_v1'];
const record = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const string = (v) => typeof v === 'string';
const boolean = (v) => typeof v === 'boolean';
const dict = (v, check) => record(v) && Object.entries(v).every(([k, value]) =>
  !['__proto__', 'prototype', 'constructor'].includes(k) && check(value, k));
const strings = (v) => dict(v, string);
const colors = new Set(['red', 'green', 'amber', 'magenta', 'cyan', 'dim', 'white']);
const settingsChecks = {
  theme: (v) => ['dark', 'ember', 'parchment', 'green'].includes(v),
  font: (v) => Number.isFinite(v) && v >= 11 && v <= 24,
  fontFamily: (v) => ['mono', 'serif'].includes(v),
  lineHeight: (v) => Number.isFinite(v) && v >= 1 && v <= 3,
  scrollback: (v) => Number.isInteger(v) && v >= 0 && v <= 100000,
  statusstrip: (v) => v === null || boolean(v),
  colors: (v) => dict(v, (c, k) => ['text', 'amber', 'green', 'dim'].includes(k) && /^#[0-9a-f]{6}$/i.test(c)),
  channels: (v) => dict(v, boolean),
};
for (const k of ['dpad', 'autoscroll', 'condensed', 'haptics', 'macrobar', 'exits', 'expblips', 'timestamps', 'soundAlerts']) settingsChecks[k] = boolean;

const validators = {
  dr_settings: (v) => dict(v, (value, key) => Object.hasOwn(settingsChecks, key) && settingsChecks[key](value)),
  dr_macros: strings,
  dr_scripts_v1: (v) => dict(v, (body, name) => /^[a-z0-9_]{1,24}$/.test(name) && string(body) && body.length <= 16000),
  dr_triggers: (v) => Array.isArray(v) && v.every((t) => record(t) && (string(t.id) || Number.isFinite(t.id)) && string(t.pattern) && string(t.command)),
  dr_highlights_v1: (v) => Array.isArray(v) && v.every((h) => record(h) && string(h.id) && string(h.pattern) && colors.has(h.color) && boolean(h.bold)),
  dr_gags_v1: (v) => Array.isArray(v) && v.every((g) => record(g) && string(g.id) && string(g.pattern)),
  dr_windows_v1: (v) => dict(v, (value, key) => ['hidden', 'collapsed', 'force'].includes(key) && dict(value, boolean)),
};

export function parseConfig(text) {
  const document = JSON.parse(text);
  if (!record(document)) throw new Error('Configuration must be a JSON object.');
  if (Object.hasOwn(document, 'version') && document.version !== 1) throw new Error('Unsupported configuration version.');
  const source = Object.hasOwn(document, 'version') ? document.config : document;
  if (!record(source)) throw new Error('Configuration must contain settings.');
  const config = {};
  for (const key of CONFIG_KEYS) {
    if (!Object.hasOwn(source, key)) continue;
    if (!validators[key](source[key])) throw new Error(`Invalid configuration for ${key}; nothing was imported.`);
    config[key] = source[key];
  }
  if (!Object.keys(config).length) throw new Error('No recognized configuration settings found.');
  return config;
}

export function restoreConfig(storage, config) {
  const prior = new Map(Object.keys(config).map((key) => [key, storage.getItem(key)]));
  try {
    for (const [key, value] of Object.entries(config)) storage.setItem(key, JSON.stringify(value));
  } catch (error) {
    // Remove the new values before restoring, freeing space after quota errors.
    for (const key of prior.keys()) storage.removeItem(key);
    for (const [key, value] of prior) if (value !== null) storage.setItem(key, value);
    throw error;
  }
}
