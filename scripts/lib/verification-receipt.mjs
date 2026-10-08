// Durable verification evidence without capturing environment or child output.
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, unlinkSync, existsSync } from 'node:fs';
import { dirname, resolve, relative, sep } from 'node:path';
import { execFileSync } from 'node:child_process';

export function parseVerificationArgs(args) {
  let release = false, reportPath;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--release') release = true;
    else if (args[index] === '--report') {
      if (reportPath || !args[index + 1] || args[index + 1].startsWith('--')) throw new Error('--report requires one output path');
      reportPath = args[++index];
    } else throw new Error(`Unknown argument: ${args[index]}`);
  }
  return { release, reportPath };
}

export function fingerprintFiles(root, files, read = readFileSync) {
  const hash = createHash('sha256');
  const paths = [...new Set(files.map((path) => relative(root, resolve(root, path)).split(sep).join('/')))].sort();
  for (const path of paths) {
    const digest = createHash('sha256').update(read(resolve(root, path))).digest('hex');
    hash.update(path).update('\0').update(digest).update('\n');
  }
  return { algorithm: 'sha256', digest: hash.digest('hex'), fileCount: paths.length };
}

export function gitIdentity(root, execute = execFileSync) {
  try {
    const head = execute('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const status = execute('git', ['status', '--porcelain=v1', '-z', '--untracked-files=normal'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).split('\0');
    let trackedChanges = 0, untrackedEntries = 0;
    for (let index = 0; index < status.length; index++) {
      const entry = status[index];
      if (!entry) continue;
      const flags = entry.slice(0, 2);
      if (flags === '??') untrackedEntries++;
      else trackedChanges++;
      if (flags.includes('R') || flags.includes('C')) index++;
    }
    return { available: true, head, dirty: trackedChanges + untrackedEntries > 0, trackedChanges, untrackedEntries };
  } catch { return { available: false }; }
}

export function sourceIdentity(root, files, options = {}) {
  let fingerprint;
  try { fingerprint = { available: true, ...fingerprintFiles(root, files, options.read) }; }
  catch { fingerprint = { available: false }; }
  return { fingerprint, git: gitIdentity(root, options.execute), scope: 'Authored server/data/client/scripts/test source and explicitly listed package/documentation files; paths plus file bytes, excluding artifacts, runtime state and report destination' };
}

export function createReceipt({ mode = 'standard', source, now = () => new Date() } = {}) {
  return { schemaVersion: 1, kind: 'dragonrealms-verification', mode, startedAt: now().toISOString(), finishedAt: null, durationMs: null,
    source: { before: source ?? null, after: null, stable: null }, checks: [],
    limitations: ['Skipped checks remain unverified.', 'A Git commit identifies tracked history; dirty and untracked source is represented by the scoped file fingerprint.', 'The fingerprint excludes dependencies, runtime state, environment, generated artifacts outside its scope and external services.', 'Matching before/after fingerprints cannot detect edits made and reverted during a check.'] };
}

export function recordCheck(receipt, { id, name, run, counts }, now = () => new Date()) {
  const started = now();
  const check = { id, name, selected: true, status: 'pass', startedAt: started.toISOString(), finishedAt: null, durationMs: null };
  let failure;
  try {
    const result = run();
    const observed = typeof counts === 'function' ? counts(result) : counts;
    if (observed && typeof observed === 'object' && !Array.isArray(observed)) {
      const numericCounts = Object.fromEntries(Object.entries(observed).filter(([, value]) => typeof value === 'number' && Number.isFinite(value) && value >= 0));
      if (Object.keys(numericCounts).length) check.counts = numericCounts;
    }
  } catch (error) {
    failure = error;
    check.status = 'fail';
    // Error strings and output may contain credentials. Record only a numeric
    // subprocess exit status; console diagnostics stay in the caller's log.
    check.failure = { ...(Number.isInteger(error?.status) ? { exitCode: error.status } : {}), diagnostics: 'See the verification process log; error text and child output are excluded from this receipt.' };
  }
  const finished = now();
  check.finishedAt = finished.toISOString();
  check.durationMs = Math.max(0, finished - started);
  receipt.checks.push(check);
  return { check, failure };
}

export function recordSkip(receipt, { id, name, reason }) {
  receipt.checks.push({ id, name, selected: false, status: 'skip', verified: false, reason, startedAt: null, finishedAt: null, durationMs: 0 });
}

export function finishReceipt(receipt, { source, now = () => new Date() } = {}) {
  const finished = now();
  receipt.finishedAt = finished.toISOString();
  receipt.durationMs = Math.max(0, finished - new Date(receipt.startedAt));
  receipt.source.after = source ?? null;
  const before = receipt.source.before?.fingerprint, after = source?.fingerprint;
  receipt.source.stable = before?.available && after?.available ? before.digest === after.digest && before.fileCount === after.fileCount : null;
  receipt.sourceChanged = receipt.source.stable === null ? null : !receipt.source.stable;
  receipt.summary = { passed: receipt.checks.filter((check) => check.status === 'pass').length, failed: receipt.checks.filter((check) => check.status === 'fail').length, skipped: receipt.checks.filter((check) => check.status === 'skip').length };
  receipt.selectedChecksPassed = receipt.summary.failed === 0;
  receipt.allChecksVerified = receipt.summary.failed === 0 && receipt.summary.skipped === 0;
  if (receipt.source.stable === null) receipt.limitations.push('A scoped fingerprint is unavailable; source stability is unknown.');
  if (receipt.source.stable === false) receipt.limitations.push('Scoped source changed during verification; the checks cannot be attributed to a single stable source snapshot.');
  return receipt;
}

export function writeReceiptAtomic(path, receipt, operations = {}) {
  const write = operations.write ?? writeFileSync, rename = operations.rename ?? renameSync, remove = operations.remove ?? unlinkSync;
  const temporary = resolve(dirname(path), `.${randomUUID()}.verification.tmp`);
  try {
    write(temporary, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    rename(temporary, path);
  } finally {
    if ((operations.exists ?? existsSync)(temporary)) remove(temporary);
  }
}
