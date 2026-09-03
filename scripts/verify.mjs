// One-command verification for pre-commit / pre-sync.
// 1. syntax-check every JS/MJS file
// 2. run the full test suite
// 3. corpus capture+replay against a running server on :3000 (if reachable)
// Usage: node scripts/verify.mjs
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
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
  for (const f of files) execFileSync('node', ['--check', f], { stdio: 'pipe' });
});

console.log('running npm test...');
run('test suite', () => {
  execFileSync('npm', ['test'], { stdio: 'inherit' });
});

// Corpus replay needs a live server.
const reachable = await fetch('http://localhost:3000/').then((r) => r.ok).catch(() => false);
if (reachable) {
  console.log('server reachable — running corpus capture+replay...');
  const corpus = '/tmp/dr-verify-corpus.json';
  run('corpus capture', () => execFileSync('node', ['scripts/client-corpus.mjs', 'capture', corpus], { stdio: 'inherit' }));
  run('corpus replay', () => execFileSync('node', ['scripts/client-corpus.mjs', 'replay', corpus], { stdio: 'inherit' }));
} else {
  steps.push('SKIP  corpus replay (no server on :3000 — run `npm start` first)');
}

console.log('\n--- verification summary ---');
for (const s of steps) console.log(s);
if (process.exitCode) console.log('\nFAILURES — fix before committing.');
else console.log('\nAll checks passed. Safe to commit.');
