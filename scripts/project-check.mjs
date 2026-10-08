import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkProject } from './lib/project-check.mjs';

const args = process.argv.slice(2);
if (args.includes('--help')) console.log('Usage: node scripts/project-check.mjs [--json]\nRead-only checks for active guide links/anchors and explicit npm Node targets.');
else if (args.some((arg) => arg !== '--json')) {
  console.error('Unknown argument. Usage: node scripts/project-check.mjs [--json]');
  process.exitCode = 2;
} else {
  const result = checkProject({ root: resolve(dirname(fileURLToPath(import.meta.url)), '..') });
  console.log(args.includes('--json') ? JSON.stringify(result, null, 2) : result.ok
    ? `PROJECT REFERENCES VALID (${result.counts.documents} documents, ${result.counts.localLinks} local links, ${result.counts.nodeTargets} Node targets; ${result.counts.skippedNodePatterns} glob/stdin targets skipped)`
    : `ISSUES (${result.issueCount}):\n${result.issues.map((issue) => `[${issue.code}] ${issue.path}${issue.line ? `:${issue.line}` : ''}: ${issue.message}`).join('\n')}`);
  process.exitCode = result.ok ? 0 : 1;
}
