#!/usr/bin/env node
// Plan and optionally apply conservative retention to public/live run directories.
// Dry-run is the default. Shared histories, unknown artifacts, active runs,
// approval/rejection evidence, and referenced runs are never deleted.
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyLiveRetention, planLiveRetention, retentionReport } from './lib/live-retention.mjs';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DEFAULT_ROOT = join(REPO_ROOT, 'public', 'live');

function valueAfter(args, index, flag) {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
  return value;
}

function positiveInteger(value, flag, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`${flag} must be an integer from ${min} to ${max}.`);
  }
  return number;
}

export function parseRetentionArgs(args) {
  const result = {
    root: DEFAULT_ROOT,
    maxAgeDays: 30,
    keepLast: 5,
    budgetBytes: null,
    apply: false,
    json: false,
    help: false,
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--root') result.root = resolve(valueAfter(args, i++, arg));
    else if (arg === '--max-age-days') result.maxAgeDays = positiveInteger(valueAfter(args, i++, arg), arg, 1, 3650);
    else if (arg === '--keep-last') result.keepLast = positiveInteger(valueAfter(args, i++, arg), arg, 0, 1000);
    else if (arg === '--budget-mb') {
      const mb = positiveInteger(valueAfter(args, i++, arg), arg, 1, 10_000_000);
      result.budgetBytes = mb * 1024 * 1024;
    } else if (arg === '--apply') result.apply = true;
    else if (arg === '--json') result.json = true;
    else if (arg === '--help') result.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return result;
}

const PROCESS_PATTERNS = Object.freeze({
  'jev-player': /(?:^|\/)scripts\/jev-player\.mjs(?:\s|$)/,
  puffer: /(?:^|\/)puffer_adapter\/(?:train|run|live_play|evaluate|probe_progression|recompare)\.py(?:\s|$)/,
  'unreal-agent': /(?:^|\/)scripts\/unreal-dr-player-gateway\.mjs(?:\s|$)/,
});

export function pidState(pid, family) {
  try { process.kill(pid, 0); }
  catch (error) {
    if (error?.code === 'ESRCH') return false;
    if (error?.code === 'EPERM') return true;
    return null;
  }
  const result = spawnSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' });
  if (result.error || result.status !== 0) return null;
  const command = result.stdout.trim();
  if (!command) return false;
  const pattern = PROCESS_PATTERNS[family];
  return pattern ? pattern.test(command) : null;
}

function mib(bytes) { return `${(bytes / 1024 / 1024).toFixed(2)} MiB`; }

function printHuman(report, actualRoot) {
  console.log(`mode: ${report.mode}`);
  console.log(`observed: ${mib(report.observedBytes)}; projected: ${mib(report.projectedBytes)}; reclaimable: ${mib(report.reclaimableBytes)}`);
  console.log(`recognized runs: ${report.counts.recognizedRuns}; protected: ${report.counts.protectedRuns}; candidates: ${report.counts.candidates}; selected: ${report.counts.selected}`);
  console.log(`policy: max-age=${report.policy.maxAgeDays}d keep-last=${report.policy.keepLast} budget=${report.policy.budgetBytes ?? 'not set'}`);
  if (report.policy.budgetBytes !== null) console.log(`budget met: ${report.budgetMet ? 'yes' : 'no (protected evidence remains)'}`);
  for (const item of report.selected) console.log(`select ${item.path} (${item.kind}, ${item.status}, ${mib(item.bytes)})`);
  if (report.mode === 'apply') {
    for (const item of report.deleted || []) console.log(`deleted ${item.path} (${mib(item.bytes)})`);
    for (const item of report.errors || []) console.error(`skipped ${item.path}: ${item.reason}`);
    console.log(`retention manifest: ${actualRoot}/retention-manifest.json`);
  } else {
    console.log('dry-run only; pass --apply to delete the listed complete run directories');
  }
}

function main() {
  const args = parseRetentionArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node scripts/retention.mjs [--root PATH] [--max-age-days N] [--keep-last N] [--budget-mb N] [--apply] [--json]');
    console.log('Dry-run by default. Only terminal, unreferenced Jev/Puffer/Unreal run directories are eligible.');
    return;
  }
  const options = {
    maxAgeDays: args.maxAgeDays,
    keepLast: args.keepLast,
    budgetBytes: args.budgetBytes,
    apply: args.apply,
    isProcessAlive: pidState,
  };
  const report = args.apply
    ? applyLiveRetention(planLiveRetention(args.root, options), options)
    : retentionReport(planLiveRetention(args.root, options));
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else printHuman(report, args.root);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try { main(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
