// Static registry extraction plus pure fixture-driven guide validation.
// Handler bodies are never evaluated and gameplay modules are never imported.
import { normalizeCommandMetadata } from '../../server/commands/metadata.js';
import { sourceTokens } from './module-audit.mjs';

export function registryDeclarations(source) {
  const tokens = sourceTokens(source);
  const word = (token, value) => token?.type === 'word' && token.value === value;
  const punctuation = (token, values) => token?.type === 'punctuation' && values.includes(token.value);
  const start = tokens.findIndex((token, index) => word(token, 'export') && word(tokens[index + 1], 'const') && word(tokens[index + 2], 'commands') && punctuation(tokens[index + 3], ['=']) && punctuation(tokens[index + 4], ['{']));
  if (start < 0) throw new Error('Unsupported command module: export const commands object not found');
  const entries = [];
  let depth = 1, expectKey = true;
  for (let index = start + 5; index < tokens.length; index++) {
    const token = tokens[index];
    if (depth === 1 && expectKey && !punctuation(token, ['}'])) {
      if (!['word', 'string'].includes(token.type) || !punctuation(tokens[index + 1], [':', ',', '}', '('])) throw new Error(`Unsupported command key near ${token.value}`);
      const shorthand = punctuation(tokens[index + 1], [',', '}']);
      const value = tokens[index + 2];
      const direct = shorthand ? token.value : value?.type === 'word' && punctuation(tokens[index + 3], [',', '}']) ? value.value : null;
      entries.push({ verb: token.value, handler: direct, line: source.slice(0, token.start).split('\n').length });
      expectKey = false;
    }
    if (punctuation(token, ['{', '[', '('])) depth++;
    if (punctuation(token, ['}', ']', ')'])) depth--;
    if (depth === 0) return entries;
    if (depth === 1 && punctuation(token, [','])) expectKey = true;
  }
  throw new Error('Unterminated command registry literal');
}

export function auditCommandContracts({ modules, metadata, movement = {}, catalog, categories, localCommands = [] }) {
  const issues = [], information = [];
  const add = (code, path, message) => issues.push({ code, path, message });
  const registry = new Map(), handlerKeys = new Map();
  for (const [module, entries] of Object.entries(modules).sort(([a], [b]) => a.localeCompare(b))) for (const entry of entries) {
    if (registry.has(entry.verb)) add('duplicate-registry-command', `${module}:${entry.line}`, `Command ${entry.verb} already belongs to ${registry.get(entry.verb)}`);
    else { registry.set(entry.verb, module); if (entry.handler) handlerKeys.set(entry.verb, `${module}:${entry.handler}`); }
  }
  const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  if (!isRecord(metadata)) { add('invalid-metadata-schema', 'metadata', 'Command metadata must be an object'); metadata = {}; }
  const normalized = new Map();
  const fields = new Set(['aliases', 'requires', 'capabilities', 'rt', 'mutates', 'panelSafe', 'validation']);
  const canonicals = new Map();
  for (const [verb, definition] of Object.entries(metadata)) {
    if (!registry.has(verb)) add('unknown-metadata-command', `metadata.${verb}`, `Metadata defines missing registry command ${verb}`);
    const path = `metadata.${verb}`;
    if (!/^[a-z][a-z-]*$/.test(verb)) add('invalid-metadata-command', path, 'Metadata command identifiers must be lowercase verbs');
    if (!isRecord(definition)) { add('invalid-metadata-schema', path, 'Command definition must be an object'); continue; }
    let valid = true;
    const invalid = (field, message) => { valid = false; add('invalid-metadata-schema', `${path}.${field}`, message); };
    for (const field of Object.keys(definition)) if (!fields.has(field)) invalid(field, `Unsupported metadata field ${field}`);
    for (const field of ['aliases', 'capabilities', 'mutates']) if (definition[field] !== undefined && (!Array.isArray(definition[field]) || definition[field].some(value => typeof value !== 'string' || !value.trim()))) invalid(field, `${field} must be an array of nonempty strings`);
    if (definition.requires !== undefined && !isRecord(definition.requires)) invalid('requires', 'requires must be an object');
    if (definition.panelSafe !== undefined && typeof definition.panelSafe !== 'boolean') invalid('panelSafe', 'panelSafe must be boolean');
    if (definition.validation !== undefined && !['custom', 'central'].includes(definition.validation)) invalid('validation', 'validation must be custom or central');
    if (definition.rt !== undefined) {
      if (!isRecord(definition.rt)) invalid('rt', 'rt must be an object');
      else {
        for (const field of Object.keys(definition.rt)) if (!['gate', 'exempt'].includes(field)) invalid(`rt.${field}`, `Unsupported roundtime field ${field}`);
        if (definition.rt.gate !== undefined && typeof definition.rt.gate !== 'boolean') invalid('rt.gate', 'Roundtime gate must be boolean');
        if (definition.rt.exempt != null && definition.rt.exempt !== 'desperateFlee') invalid('rt.exempt', 'Unknown roundtime exemption');
      }
    }
    if (Array.isArray(definition.aliases) && definition.aliases.some(alias => typeof alias === 'string' && !/^[a-z][a-z-]*$/.test(alias))) invalid('aliases', 'Aliases must be lowercase command identifiers');
    if (valid) {
      try { normalized.set(verb, normalizeCommandMetadata(definition)); }
      catch (error) { add('invalid-metadata-schema', path, error.message); }
    }
    for (const alias of Array.isArray(definition.aliases) ? definition.aliases.filter(alias => typeof alias === 'string') : []) {
      if (!registry.has(alias)) add('unknown-metadata-alias', `metadata.${verb}.aliases`, `Alias ${alias} is absent from the registry`);
      if (Object.hasOwn(metadata, alias)) add('canonical-alias-conflict', `metadata.${verb}.aliases`, `Alias ${alias} also has canonical metadata`);
      if (canonicals.has(alias)) add('duplicate-metadata-alias', `metadata.${verb}.aliases`, `Alias ${alias} belongs to multiple canonical commands`);
      canonicals.set(alias, verb);
    }
  }
  for (const [verb, definition] of normalized) if (definition.panelSafe) {
    const path = `metadata.${verb}`;
    if (definition.mutates.length) add('panel-mutation-contract', `${path}.mutates`, 'Passive panel commands must declare no mutation domains');
    if (definition.rt.gate) add('panel-roundtime-contract', `${path}.rt.gate`, 'Passive panel commands must not gate on roundtime');
    if (definition.rt.exempt) add('panel-roundtime-contract', `${path}.rt.exempt`, 'Passive panel commands must not declare a roundtime exemption');
  }
  const panelSafeCommands = [...registry.keys()].sort().flatMap(name => {
    const canonical = canonicals.get(name) ?? name;
    return normalized.get(canonical)?.panelSafe ? [{ name, canonical, aliasOf: name === canonical ? null : canonical }] : [];
  });
  const panelSafeCanonicals = panelSafeCommands.filter(command => command.aliasOf === null);
  const available = new Set([...registry.keys(), ...Object.keys(movement)]), locals = new Set(localCommands), identifiers = new Set(), covered = new Set();
  let localCount = 0, aliasCount = 0;
  for (const [index, entry] of catalog.entries()) {
    const path = `catalog.${index}`;
    if (!entry || typeof entry !== 'object') { add('invalid-entry', path, 'Guide entry must be an object'); continue; }
    if (typeof entry.verb !== 'string' || !/^[a-z][a-z-]*$/.test(entry.verb)) add('invalid-verb', path, 'Guide requires a lowercase command identifier');
    if (identifiers.has(entry.verb)) add('duplicate-guide-command', path, `Duplicate guide identifier ${entry.verb}`);
    identifiers.add(entry.verb);
    if (!categories.includes(entry.category)) add('invalid-category', path, `Unknown or missing category ${entry.category}`);
    if (typeof entry.syntax !== 'string' || !entry.syntax.trim()) add('missing-usage', path, `Command ${entry.verb} has no usage`);
    else if (entry.syntax.trim().split(/\s/)[0] !== entry.verb) add('usage-command-mismatch', path, `Usage for ${entry.verb} begins with another command`);
    if (typeof entry.description !== 'string' || !entry.description.trim()) add('missing-description', path, `Command ${entry.verb} has no description`);
    if (entry.local) {
      localCount++;
      if (!locals.has(entry.verb)) add('unknown-local-command', path, `Client command ${entry.verb} has no recognized local route`);
    } else {
      if (!available.has(entry.verb)) add('unknown-guide-command', path, `Guide command ${entry.verb} is absent from the dispatcher`);
      covered.add(entry.verb);
    }
    if (!Array.isArray(entry.aliases)) { add('invalid-aliases', path, `Command ${entry.verb} aliases must be an array`); continue; }
    const seenAliases = new Set();
    for (const alias of entry.aliases) {
      aliasCount++;
      if (seenAliases.has(alias)) add('duplicate-guide-alias', path, `Command ${entry.verb} repeats alias ${alias}`);
      seenAliases.add(alias);
      if (entry.local) { if (!locals.has(alias)) add('unknown-local-alias', path, `Client alias ${alias} has no recognized local route`); continue; }
      covered.add(alias);
      if (!available.has(alias)) { add('unknown-guide-alias', path, `Guide alias ${alias} is absent from the dispatcher`); continue; }
      const canonical = canonicals.get(alias);
      if (canonical && canonical !== entry.verb && canonical !== canonicals.get(entry.verb)) add('guide-alias-mismatch', path, `Alias ${alias} resolves to ${canonical}, not ${entry.verb}`);
      else if (!canonical && handlerKeys.has(alias) && handlerKeys.has(entry.verb) && handlerKeys.get(alias) !== handlerKeys.get(entry.verb)) add('guide-handler-mismatch', path, `Alias ${alias} and ${entry.verb} reference different handlers`);
    }
  }
  const uncovered = [...available].filter((verb) => !covered.has(verb)).sort();
  if (uncovered.length) information.push({ code: 'uncovered-dispatcher-commands', message: 'The guide is curated; uncovered commands are informational.', commands: uncovered });
  return { schemaVersion: 1, ok: issues.length === 0, counts: { registryCommands: registry.size, metadataCommands: Object.keys(metadata).length, movementCommands: Object.keys(movement).length, guideEntries: catalog.length, localGuideEntries: localCount, guideAliases: aliasCount, uncoveredCommands: uncovered.length, panelSafeCanonicalCommands: panelSafeCanonicals.length, panelSafeResolvedCommands: panelSafeCommands.length }, panelSafeCommands, issueCount: issues.length, issues, information,
    scope: { curatedGuide: true, registryExtraction: 'lexical static literal keys; handler bodies never evaluated', panelContractLimitations: 'Structural metadata checks only; handler purity and requires semantics are not inferred or evaluated', scannerLimitations: 'Simple template literals are opaque; nested template interpolations and all JavaScript grammar are not fully parsed' } };
}
