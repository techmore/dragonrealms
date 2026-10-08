import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditModules } from './lib/module-audit.mjs';

const args = process.argv.slice(2);
if (args.includes('--help')) console.log('Usage: node scripts/audit-modules.mjs [--json]\nRead-only lexical relative ESM audit. Missing files fail; cycles are informational.');
else if (args.some((argument) => argument !== '--json')) {
  console.error('Unknown argument. Usage: node scripts/audit-modules.mjs [--json]');
  process.exitCode = 2;
} else {
  let result;
  try { result = auditModules(resolve(dirname(fileURLToPath(import.meta.url)), '..')); }
  catch (error) { result = { schemaVersion: 1, ok: false, issueCount: 1, issues: [{ code: 'audit-read-error', message: error.message }] }; }
  console.log(args.includes('--json') ? JSON.stringify(result, null, 2) : result.counts
    ? `${result.ok ? 'MODULE REFERENCES VALID' : `ISSUES (${result.issueCount})`} (${result.counts.files} files, ${result.counts.relativeReferences} relative references; ${result.graph.cycleGroupCount} informational cycle groups, ${result.counts.skippedDynamicImports} unresolved dynamic imports skipped)${result.issues.length ? `\n${result.issues.map((issue) => issue.message).join('\n')}` : ''}`
    : result.issues.map((issue) => issue.message).join('\n'));
  process.exitCode = result.ok ? 0 : 1;
}
