// Declarative command contracts. Handlers keep their existing function shape;
// this module supplies structural metadata and resolves static aliases without
// duplicating roundtime or panel policy in the dispatcher.
import { DIR_ALIASES } from './dirs.js';

const VERB_RE = /^[a-z][a-z-]*$/;
const RT_EXEMPTS = new Set(['desperateFlee']);

function strings(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry)) {
    throw new Error(`${label} must be an array of non-empty strings.`);
  }
  return [...new Set(value)];
}

export function normalizeCommandMetadata(definition = {}) {
  if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
    throw new Error('Command metadata must be an object.');
  }
  const aliases = strings(definition.aliases, 'aliases');
  for (const alias of aliases) {
    if (!VERB_RE.test(alias)) throw new Error(`Invalid command alias "${alias}".`);
  }
  const rt = definition.rt || {};
  if (!rt || typeof rt !== 'object' || Array.isArray(rt)) throw new Error('rt metadata must be an object.');
  if (rt.exempt != null && !RT_EXEMPTS.has(rt.exempt)) throw new Error(`Unknown roundtime exemption "${rt.exempt}".`);
  const validation = definition.validation || 'custom';
  if (!['custom', 'central'].includes(validation)) throw new Error(`Unknown command validation policy "${validation}".`);
  return Object.freeze({
    aliases: Object.freeze(aliases),
    requires: Object.freeze({ ...(definition.requires || {}) }),
    capabilities: Object.freeze(strings(definition.capabilities, 'capabilities')),
    rt: Object.freeze({ gate: rt.gate === true, exempt: rt.exempt || null }),
    mutates: Object.freeze(strings(definition.mutates, 'mutates')),
    panelSafe: definition.panelSafe === true,
    validation,
  });
}

export function buildCommandMetadata(registry, definitions = {}) {
  const normalized = new Map();
  for (const [command, definition] of Object.entries(definitions)) {
    if (!Object.hasOwn(registry, command)) throw new Error(`Metadata defines unknown command "${command}".`);
    if (!VERB_RE.test(command)) throw new Error(`Invalid command name "${command}".`);
    normalized.set(command, normalizeCommandMetadata(definition));
  }

  const aliases = new Map();
  for (const [command, meta] of normalized) {
    for (const alias of meta.aliases) {
      if (!Object.hasOwn(registry, alias)) throw new Error(`Command "${command}" aliases unknown command "${alias}".`);
      if (normalized.has(alias)) throw new Error(`Command alias "${alias}" is also a canonical metadata command.`);
      if (aliases.has(alias)) throw new Error(`Command alias "${alias}" is claimed by both ${aliases.get(alias)} and ${command}.`);
      aliases.set(alias, command);
    }
  }

  const result = new Map();
  for (const command of Object.keys(registry)) {
    const own = normalized.get(command);
    if (own) {
      result.set(command, Object.freeze({ name: command, canonical: command, aliasOf: null, ...own }));
    } else {
      const defaultMeta = normalizeCommandMetadata();
      result.set(command, Object.freeze({ name: command, canonical: command, aliasOf: null, ...defaultMeta }));
    }
  }
  for (const [alias, canonical] of aliases) {
    const meta = result.get(canonical);
    result.set(alias, Object.freeze({ ...meta, name: alias, canonical, aliasOf: canonical }));
  }
  return result;
}

export function commandMetadata(registryMetadata, name) {
  return registryMetadata.get(String(name || '').toLowerCase()) || null;
}

export function roundtimeCommands(registryMetadata) {
  return new Set([...registryMetadata]
    .filter(([, meta]) => meta.rt.gate)
    .map(([name]) => name));
}

const COMBAT_RT = [
  'attack', 'berserk', 'roar', 'meditate', 'form', 'whirlwind', 'stomp', 'choke',
  'mageslash', 'dispel', 'backstab', 'snipe', 'slip', 'smite', 'impede', 'ambush', 'hide',
  'advance', 'retreat', 'flee',
];
const WORLD_RT = [
  'forage', 'scavenge', 'track', 'hunt', 'skin', 'steal', 'pick', 'study', 'perform',
  'appraise', 'unlock', 'sing',
];
const CRAFT_RT = ['forge', 'shape', 'tailor', 'craft', 'imbue', 'tend', 'repair', 'use', 'drink', 'eat'];
const MAGIC_RT = [
  'cast', 'khri', 'predict', 'harness', 'perceive', 'charge', 'invoke', 'focus', 'animate',
  'ritual', 'beseech', 'enchante', 'glyph', 'summon', 'sacrifice',
];

const definitions = {};
const define = (command, mutates, extra = {}) => {
  definitions[command] = { rt: { gate: true }, mutates, ...extra };
};
for (const command of COMBAT_RT) define(command, ['player', 'combat', 'skills']);
for (const command of WORLD_RT) define(command, ['player', 'world', 'skills']);
for (const command of CRAFT_RT) define(command, ['player', 'inventory', 'economy', 'skills', 'persistence']);
for (const command of MAGIC_RT) define(command, ['player', 'magic', 'skills']);
definitions.attack.aliases = ['kill'];
definitions.disarm = {
  rt: { gate: true },
  mutates: ['player', 'combat', 'skills'],
  aliases: ['trip', 'bash', 'shield-bash'],
};
definitions.tend.aliases = ['bandage'];
definitions.appraise.aliases = ['appr'];
definitions.flee.rt.exempt = 'desperateFlee';
for (const command of ['inventory', 'score', 'info', 'skills', 'exp', 'spells']) {
  definitions[command] = { panelSafe: true };
}

export const COMMAND_METADATA = Object.freeze(definitions);
export const MOVEMENT_METADATA = Object.freeze(normalizeCommandMetadata({ mutates: ['player', 'world'] }));
export const MOVEMENT_COMMAND_METADATA = Object.freeze(
  Object.fromEntries(['go', ...Object.keys(DIR_ALIASES)].map((command) => [command, MOVEMENT_METADATA])),
);
