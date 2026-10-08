import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMMAND_METADATA, MOVEMENT_COMMAND_METADATA } from '../server/commands/metadata.js';
import { COMMAND_REFERENCE, COMMAND_CATEGORIES } from '../public/js/command-reference.js';
import { transcriptSearchQuery } from '../public/js/search-routing.js';
import { registryDeclarations, auditCommandContracts } from './lib/command-audit.mjs';

const args = process.argv.slice(2);
if (args.includes('--help')) console.log('Usage: node scripts/audit-commands.mjs [--json]\nRead-only guide/registry/metadata audit; uncovered commands are informational.');
else if (args.some((argument) => argument !== '--json')) { console.error('Unknown argument. Usage: node scripts/audit-commands.mjs [--json]'); process.exitCode = 2; }
else {
  let result;
  try {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const modules = {};
    for (const name of ['combat', 'magic', 'items', 'shops', 'character', 'world', 'dir', 'join']) modules[name] = registryDeclarations(readFileSync(resolve(root, `server/commands/${name}.js`), 'utf8'));
    const input = readFileSync(resolve(root, 'public/js/input.js'), 'utf8');
    const localCommands = [...input.matchAll(/parts\[0\]\.toLowerCase\(\) === '([a-z-]+)'/g)].map((match) => match[1]);
    for (const verb of ['find', 'search']) if (transcriptSearchQuery(`${verb} test`) !== null) localCommands.push(verb);
    result = auditCommandContracts({ modules, metadata: COMMAND_METADATA, movement: MOVEMENT_COMMAND_METADATA, catalog: COMMAND_REFERENCE, categories: COMMAND_CATEGORIES, localCommands });
  } catch (error) { result = { schemaVersion: 1, ok: false, issueCount: 1, issues: [{ code: 'audit-extraction-error', message: error.message }] }; }
  console.log(args.includes('--json') ? JSON.stringify(result, null, 2) : result.counts
    ? `${result.ok ? 'COMMAND CONTRACTS VALID' : `ISSUES (${result.issueCount})`} (${result.counts.registryCommands} registry commands, ${result.counts.guideEntries} guide entries; ${result.counts.uncoveredCommands} uncovered commands informational)${result.issues.length ? `\n${result.issues.map((issue) => issue.message).join('\n')}` : ''}`
    : result.issues.map((issue) => issue.message).join('\n'));
  process.exitCode = result.ok ? 0 : 1;
}
