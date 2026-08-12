// Docs consistency checker: validates the roadmap data and cross-checks
// ROADMAP.md rows against the tracker features, so the two hand-maintained
// sources stay aligned.
// Run: node scripts/verify-roadmap.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STAGES, FEATURES } from '../data/roadmap.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const md = readFileSync(join(ROOT, 'ROADMAP.md'), 'utf8');

let errors = 0;
const err = (msg) => { errors++; console.log('ERR:', msg); };

// 1. Data integrity
const ids = FEATURES.map((f) => f.id);
const seen = new Set();
for (const id of ids) {
  if (seen.has(id)) err(`duplicate feature id ${id}`);
  seen.add(id);
}
const stageIds = new Set(STAGES.map((s) => s.id));
for (const f of FEATURES) {
  if (!stageIds.has(f.s)) err(`feature ${f.id} references unknown stage ${f.s}`);
  if (!['done', 'partial', 'todo'].includes(f.status)) err(`feature ${f.id} has bad status ${f.status}`);
}

// 2. ROADMAP.md rows vs tracker features (word-overlap matching)
const rows = [...md.matchAll(/^\| ([^|]+) \| ([^\n|]+) \|$/gm)]
  .map((m) => ({ text: m[1].trim(), status: m[2].trim() }))
  .filter((r) => r.status.includes('⬜') || r.status.includes('🚧'));

const corpus = FEATURES.map((f) => (f.label + ' ' + f.detail).toLowerCase());
const sig = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter((w) => w.length > 3);
const overlap = (rowText) => {
  const words = [...new Set(sig(rowText))];
  if (!words.length) return 1;
  const hit = words.filter((w) => corpus.some((c) => c.includes(w))).length;
  return hit / words.length;
};

let missing = 0;
for (const r of rows) {
  const score = overlap(r.text.replace(/\*\*/g, ''));
  if (score < 0.5) {
    missing++;
    console.log(`GAP (${Math.round(score * 100)}%): ${r.text.slice(0, 90)}  [${r.status.trim()}]`);
  }
}

// 3. Generators reproducible (scoped to the files they own, so other
//    in-flight work never trips this check)
console.log('\nVerifying generators are current...');
const { execSync } = await import('node:child_process');
for (const script of ['build-roadmap.mjs', 'build-skills-doc.mjs']) {
  execSync(process.execPath, ['scripts/' + script], { cwd: ROOT });
}
const GENERATED = ['public/ROADMAP.html', 'public/SKILLS.html', 'SKILLS.md'];
let dirty = [];
for (const f of GENERATED) {
  try {
    const out = execSync(`git diff --stat -- ${f}`, { cwd: ROOT, encoding: 'utf8' });
    if (out.trim()) dirty.push(f);
  } catch { /* no repo */ }
}
if (dirty.length) {
  errors++;
  console.log('GENERATORS DIRTY (regeneration changed): ' + dirty.join(', '));
} else {
  console.log('generators reproducible: ok');
}

console.log(`\nResult: ${errors} errors, ${missing} unmatched roadmap rows (potential gaps).`);
process.exit(errors ? 1 : 0);
