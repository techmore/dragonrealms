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
// 1b. STAGES must be real stage objects (this catches features accidentally
//     appended to the STAGES array, e.g. the f164 case).
for (const s of STAGES) {
  if (typeof s.id !== 'number' || !s.title || !s.desc) {
    err(`STAGES entry is not a valid stage: ${JSON.stringify(s).slice(0, 90)}`);
    continue;
  }
  if (!['done', 'partial', 'todo'].includes(s.badge)) err(`stage ${s.id} has bad badge ${JSON.stringify(s.badge)}`);
  if (seen.has(String(s.id)) || FEATURES.some((f) => f.id === String(s.id))) {
    err(`stage ${s.id} shares an id with a feature`);
  }
}
// 1c. Feature ids must not collide with stage ids as rendered strings.
for (const f of FEATURES) {
  if (STAGES.some((s) => typeof s.id === 'number' && String(s.id) === f.id)) {
    err(`feature ${f.id} collides with stage id`);
  }
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

// 2b. Status marker cross-check: if the tracker marks the best-matching
//     feature as fully done, the ROADMAP.md row must not read as
//     planned/partial (stale-doc detection). The allowlist holds rows whose
//     prose deliberately tracks a partially-shipped subsystem that shares
//     words with a done tracker feature.
const STATUS_ALLOW = [
  'Scouting + TRACK, trailmarkers', // trailmarkers still pending; f112 only covers stance points
];
const markers = (row) => (row.startsWith('✅') ? 'done' : row.startsWith('🚧') ? 'partial' : row.startsWith('⬜') ? 'todo' : null);
let statusDrift = 0;
for (const r of rows) {
  const mdStatus = markers(r.status);
  if (!mdStatus) continue;
  if (STATUS_ALLOW.some((p) => r.text.startsWith(p))) continue;
  const words = [...new Set(sig(r.text))];
  if (!words.length) continue;
  let best = null, bestScore = 0;
  for (const f of FEATURES) {
    const c = (f.label + ' ' + f.detail).toLowerCase();
    const hit = words.filter((w) => c.includes(w)).length;
    const sc = hit / words.length;
    if (sc > bestScore) { bestScore = sc; best = f; }
  }
  if (!best || bestScore < 0.5) continue;
  if (best.status === 'done' && mdStatus !== 'done') {
    statusDrift++;
    console.log(`STALE (${Math.round(bestScore * 100)}% match to ${best.id} "${best.label}"): ${r.text.slice(0, 80)}  [md=${mdStatus}]`);
  } else if (best.status === 'todo' && mdStatus !== 'todo') {
    statusDrift++;
    console.log(`OVERCLAIM (matches untracked ${best.id} "${best.label}"): ${r.text.slice(0, 80)}  [md=${mdStatus}]`);
  }
}
if (statusDrift) errors += statusDrift;

// 3. Generators reproducible (scoped to the files they own, so other
//    in-flight work never trips this check)
console.log('\nVerifying generators are current...');
const { execSync } = await import('node:child_process');
const GENERATED = ['public/ROADMAP.html', 'public/SKILLS.html', 'SKILLS.md'];
const beforeGeneration = new Map(GENERATED.map((f) => [f, readFileSync(join(ROOT, f), 'utf8')]));
for (const script of ['build-roadmap.mjs', 'build-skills-doc.mjs']) {
  execSync(process.execPath, ['scripts/' + script], { cwd: ROOT });
}
const changedByGenerator = GENERATED.filter((f) => readFileSync(join(ROOT, f), 'utf8') !== beforeGeneration.get(f));
if (changedByGenerator.length) {
  errors++;
  console.log('GENERATED FILES WERE STALE: ' + changedByGenerator.join(', '));
} else {
  console.log('generators reproducible: ok');
}

console.log(`\nResult: ${errors} errors, ${missing} unmatched roadmap rows (potential gaps), ${statusDrift} stale status markers.`);
process.exit(errors ? 1 : 0);
