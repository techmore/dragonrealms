// One-command verification for pre-commit / pre-sync.
// 1. syntax-check every JS/MJS file
// 2. run the full test suite
// 3. data and documentation consistency
// 4. optional corpus capture+replay (DR_VERIFY_CORPUS=1, automatically isolated worlds)
// Usage: node scripts/verify.mjs [--release] [--report /absolute/path/receipt.json]
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { verificationCounts, captureVerificationCommand } from './lib/verification-counts.mjs';
import { PROJECT_DOCUMENTS } from './lib/project-check.mjs';
import { parseVerificationArgs, sourceIdentity, createReceipt, recordCheck, recordSkip, finishReceipt, writeReceiptAtomic } from './lib/verification-receipt.mjs';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
let options;
try { options = parseVerificationArgs(process.argv.slice(2)); }
catch (error) { console.error(error.message); process.exit(2); }
const { release } = options;
const reportPath = options.reportPath ? resolve(options.reportPath) : null;
const files = [];
const clientSources = [];
const SKIP_DIRS = new Set(['node_modules', 'store', '.git', 'live', 'bins']);
const walk = (dir) => {
  for (const e of readdirSync(dir)) {
    if (SKIP_DIRS.has(e) || e.startsWith('Qwen')) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.js') || p.endsWith('.mjs')) files.push(p);
    else if (p.startsWith(join(ROOT, 'public') + '/') && /\.(?:html|css)$/.test(p)) clientSources.push(p);
  }
};
walk(ROOT);
files.sort();
const isAuthored = (path) => !relative(ROOT, path).split('/').some(part => ['artifacts', 'generated', 'tmp'].includes(part));
const identityInputs = () => [
  ...files.filter(path => ['server', 'data', 'public/js', 'scripts', 'test'].some(tree => path.startsWith(join(ROOT, tree) + '/')) && isAuthored(path)),
  ...clientSources.filter(isAuthored),
  ...['package.json', 'package-lock.json', 'AGENTS.md', 'ROADMAP.md', 'SKILLS.md', ...PROJECT_DOCUMENTS]
    .map(path => join(ROOT, path)).filter(existsSync),
].filter(path => path !== reportPath);
const receipt = createReceipt({ mode: release ? 'release' : 'standard', source: reportPath ? sourceIdentity(ROOT, identityInputs()) : null });

const steps = [];
const run = (name, fn, counts) => {
  const { check, failure } = recordCheck(receipt, { id: name.replace(/ /g, '-'), name, run: fn, counts });
  if (failure) {
    steps.push(`FAIL  ${name}: ${String(failure.message || failure).split('\n')[0]}`);
    process.exitCode = 1;
  } else steps.push(`PASS  ${name}`);
  return check;
};
const audit = (script) => {
  if (!reportPath) return execFileSync(process.execPath, [script], { cwd: ROOT, stdio: 'inherit' });
  // Capture this invocation once to attach its structured counts. Child output
  // stays in the process log and never enters the verification receipt.
  let output;
  try { output = execFileSync(process.execPath, [script, '--json'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 32 * 1024 * 1024 }); }
  catch (error) { if (error.stdout) process.stdout.write(error.stdout); throw error; }
  const result = JSON.parse(output);
  console.log(`${script}: ${result.ok ? 'PASS' : 'FAIL'} (${result.issueCount} issues)`);
  return result;
};
const auditCounts = (result) => result?.counts;

const runWithResultCounts = (name, command, args, kind, additionalCounts = {}) => {
  if (!reportPath) return run(name, () => execFileSync(command, args, { cwd: ROOT, stdio: 'inherit' }), additionalCounts);
  let evidence = verificationCounts(kind, undefined);
  const check = run(name, () => {
    const result = captureVerificationCommand(command, args, kind, { cwd: ROOT });
    evidence = result.evidence;
    if (result.failure) throw result.failure;
    return evidence;
  }, result => ({ ...additionalCounts, ...result.counts }));
  check.countEvidence = { known: evidence.known, ...(evidence.reason ? { reason: evidence.reason } : {}) };
  return check;
};

console.log(`syntax-checking ${files.length} files...`);
run('syntax check', () => {
  for (const f of files) execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
}, { files: files.length });

console.log('running npm test...');
runWithResultCounts('test suite', 'npm', ['test'], 'tests', {
  testFiles: files.filter(path => path.startsWith(join(ROOT, 'test') + '/') && path.endsWith('.test.mjs')).length,
});

run('data integrity', () => audit('scripts/audit-data.mjs'), auditCounts);
run('command contracts', () => audit('scripts/audit-commands.mjs'), auditCounts);
run('module references', () => audit('scripts/audit-modules.mjs'), auditCounts);
run('documentation consistency', () => execFileSync(process.execPath, ['scripts/verify-roadmap.mjs'], { cwd: ROOT, stdio: 'inherit' }));
run('project references', () => audit('scripts/project-check.mjs'), auditCounts);

// Corpus owns its worlds; never connect to a shared development server.
if (release || process.env.DR_VERIFY_CORPUS === '1') {
  runWithResultCounts('isolated corpus capture and replay', process.execPath, ['scripts/verify-corpus.mjs'], 'corpus');
} else {
  steps.push('SKIP  corpus integration (set DR_VERIFY_CORPUS=1; disposable worlds start automatically)');
  recordSkip(receipt, { id: 'isolated-corpus-capture-and-replay', name: 'isolated corpus capture and replay', reason: 'Not selected; set DR_VERIFY_CORPUS=1 or --release. Disposable worlds start automatically.' });
}
if (release || process.env.DR_VERIFY_BROWSER === '1') {
  runWithResultCounts('isolated browser regression', process.execPath,
    [process.env.DR_VERIFY_BROWSER_DRIVER === 'ego' ? 'scripts/client-regression-ego.mjs' : 'scripts/client-regression.mjs'], 'browser');
} else {
  steps.push('SKIP  browser regression (set DR_VERIFY_BROWSER=1 and DR_CHROMIUM_PATH if needed)');
  recordSkip(receipt, { id: 'isolated-browser-regression', name: 'isolated browser regression', reason: 'Not selected; set DR_VERIFY_BROWSER=1 or --release and configure a supported browser.' });
}

console.log('\n--- verification summary ---');
for (const s of steps) console.log(s);
if (process.exitCode) console.log('\nVerification failed. See failures above.');
else console.log(steps.some(s => s.startsWith('SKIP'))
  ? '\nSelected checks passed. Skipped checks remain unverified.'
  : '\nAll configured verification checks passed.');

if (reportPath) {
  let finalSource;
  try {
    files.length = 0;
    clientSources.length = 0;
    walk(ROOT);
    finalSource = sourceIdentity(ROOT, identityInputs());
  } catch { finalSource = { fingerprint: { available: false }, git: { available: false }, scope: 'Final source scan unavailable; source stability is unknown.' }; }
  finishReceipt(receipt, { source: finalSource });
  try {
    writeReceiptAtomic(reportPath, receipt);
    console.log(`Verification receipt: ${reportPath}`);
    if (receipt.source.stable === false) console.log('Scoped source changed during verification; receipt records this limitation.');
  } catch (error) {
    console.error(`Could not write verification receipt: ${error.code || 'write failed'}`);
    process.exitCode = 1;
  }
}
