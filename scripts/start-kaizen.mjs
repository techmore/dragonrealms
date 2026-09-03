#!/usr/bin/env node
// Human-editable standard launcher. Edit kaizen-profile.json, then run:
//   node scripts/start-kaizen.mjs
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const profilePath = join(root, 'scripts', 'kaizen-profile.json');
const currentPath = join(root, 'public', 'live', 'experiment-current.json');
const profile = JSON.parse(readFileSync(profilePath, 'utf8'));
const required = ['guild', 'variants', 'concurrency', 'minutes', 'circle', 'boost', 'statPolicy'];
for (const key of required) if (!(key in profile)) throw new Error(`kaizen profile missing ${key}`);
if (!Array.isArray(profile.variants) || profile.variants.length !== 3) throw new Error('standard Kaizen requires exactly three variants');
if (profile.concurrency !== 3 || profile.minutes !== 20 || profile.circle !== 5) {
  throw new Error('standard Kaizen is fixed at concurrency=3, minutes=20, circle=5');
}
if (profile.statPolicy !== 'paired-fixed-v1') throw new Error('standard Kaizen requires statPolicy=paired-fixed-v1');
let sweepRunning = false;
try {
  execFileSync('pgrep', ['-f', 'scripts/race-guild-sweep.mjs'], { stdio: 'ignore' });
  sweepRunning = true;
} catch {}
if (existsSync(currentPath) && sweepRunning) {
  const current = JSON.parse(readFileSync(currentPath, 'utf8'));
  if (current.status === 'running') throw new Error(`a Kaizen cohort is already running (${current.runId}); wait for it to finish before starting another`);
}

const args = [
  'scripts/race-guild-sweep.mjs', '--benchmark', profile.guild,
  '--variants', profile.variants.join(','), '--concurrency', String(profile.concurrency),
  '--minutes', String(profile.minutes), '--circle', String(profile.circle),
  '--boost', String(profile.boost), '--stat-policy', profile.statPolicy,
];
console.log(`Starting standard Kaizen: ${profile.variants.join(' vs ')} | ${profile.minutes}m | 3 workers | Circle ${profile.circle}`);
const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
