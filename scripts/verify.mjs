// One-command verification for pre-commit / pre-sync.
// 1. syntax-check every JS/MJS file
// 2. run the full test suite
// 3. data and documentation consistency
// 4. optional corpus capture+replay (DR_VERIFY_CORPUS=1, automatically isolated worlds)
// Usage: node scripts/verify.mjs
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const release = process.argv.includes('--release');
const files = [];
const SKIP_DIRS = new Set(['node_modules', 'store', '.git', 'live', 'bins']);
const walk = (dir) => {
  for (const e of readdirSync(dir)) {
    if (SKIP_DIRS.has(e) || e.startsWith('Qwen')) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.js') || p.endsWith('.mjs')) files.push(p);
  }
};
walk(ROOT);

const steps = [];
const run = (name, fn) => {
  try {
    fn();
    steps.push(`PASS  ${name}`);
  } catch (e) {
    steps.push(`FAIL  ${name}: ${String(e.message || e).split('\n')[0]}`);
    process.exitCode = 1;
  }
};

console.log(`syntax-checking ${files.length} files...`);
run('syntax check', () => {
  for (const f of files) execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
});

console.log('running npm test...');
run('test suite', () => {
  execFileSync('npm', ['test'], { cwd: ROOT, stdio: 'inherit' });
});

run('data integrity', () => execFileSync(process.execPath, ['scripts/audit-data.mjs'], { cwd: ROOT, stdio: 'inherit' }));
run('documentation consistency', () => execFileSync(process.execPath, ['scripts/verify-roadmap.mjs'], { cwd: ROOT, stdio: 'inherit' }));

// Corpus owns its worlds; never connect to a shared development server.
if (release || process.env.DR_VERIFY_CORPUS === '1') {
  run('isolated corpus capture and replay', () => execFileSync(process.execPath,
    ['scripts/verify-corpus.mjs'], { cwd: ROOT, stdio: 'inherit' }));
} else {
  steps.push('SKIP  corpus integration (set DR_VERIFY_CORPUS=1; disposable worlds start automatically)');
}
if (release || process.env.DR_VERIFY_BROWSER === '1') {
  run('isolated browser regression', () => execFileSync(process.execPath,
    [process.env.DR_VERIFY_BROWSER_DRIVER === 'ego' ? 'scripts/client-regression-ego.mjs' : 'scripts/client-regression.mjs'], { cwd: ROOT, stdio: 'inherit' }));
} else {
  steps.push('SKIP  browser regression (set DR_VERIFY_BROWSER=1 and DR_CHROMIUM_PATH if needed)');
}

console.log('\n--- verification summary ---');
for (const s of steps) console.log(s);
if (process.exitCode) console.log('\nVerification failed. See failures above.');
else console.log(steps.some(s => s.startsWith('SKIP'))
  ? '\nSelected checks passed. Skipped checks remain unverified.'
  : '\nAll configured verification checks passed.');
