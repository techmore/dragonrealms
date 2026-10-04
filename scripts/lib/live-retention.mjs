// Conservative retention planning for public/live experiment artifacts.
// Shared histories and unknown families are protected. Only complete, terminal,
// unreferenced run directories from explicitly recognized families are eligible.
import {
  lstatSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';

const DAY_MS = 24 * 60 * 60 * 1000;
const MANIFEST_SCHEMA = 'dragonrealms.live-retention/1';
const MAX_REFERENCE_FILE_BYTES = 10 * 1024 * 1024;

const FAMILIES = Object.freeze({
  'jev-player': {
    kind: 'jev-run',
    schemas: /^dragonrealms\.jev-realtime-player\/\d+$/,
    active: new Set(['starting', 'playing']),
    terminal: new Set(['complete', 'incomplete', 'failed']),
  },
  puffer: {
    kind: 'puffer-run',
    schemas: /^dragonrealms\.puffer\.run\/\d+$/,
    active: new Set(['launching', 'starting', 'running']),
    terminal: new Set(['completed', 'stopped', 'failed', 'interrupted']),
  },
  'unreal-agent': {
    kind: 'unreal-run',
    schemas: /^dragonrealms\.unreal-player\/\d+$/,
    active: new Set(['starting', 'playing']),
    terminal: new Set(['completed', 'stopped', 'failed']),
  },
});

function readJson(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); }
  catch { return null; }
}

function safeRelative(root, file) {
  const rel = relative(root, file).split(sep).join('/');
  return rel && !rel.startsWith('../') ? rel : null;
}

function contained(root, file) {
  const path = resolve(file);
  return path === root || path.startsWith(root + sep);
}

function treeBytes(path) {
  const own = lstatSync(path);
  if (own.isSymbolicLink()) return own.size;
  if (!own.isDirectory()) return own.size;
  let bytes = own.size;
  for (const entry of readdirSync(path)) bytes += treeBytes(join(path, entry));
  return bytes;
}

function isPidRunning() {
  // Library callers that do not supply a process-identity checker must fail
  // closed. The CLI injects a family-aware ps check.
  return null;
}

function classifyRun(root, family, name, { nowMs, isProcessAlive = isPidRunning } = {}) {
  const familyRoot = join(root, family);
  const directory = join(familyRoot, name);
  const relDir = safeRelative(root, directory);
  const base = { path: relDir, kind: FAMILIES[family].kind, runId: name, bytes: 0 };
  let directoryStat;
  try { directoryStat = lstatSync(directory); }
  catch { return { ...base, decision: 'protected', reason: 'missing-directory' }; }
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
    return { ...base, decision: 'protected', reason: 'not-a-real-directory' };
  }

  const manifestPath = join(directory, 'manifest.json');
  let manifestStat;
  try { manifestStat = statSync(manifestPath); }
  catch { return { ...base, decision: 'protected', reason: 'missing-manifest' }; }
  const manifest = readJson(manifestPath);
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { ...base, decision: 'protected', reason: 'malformed-manifest' };
  }

  const bytes = treeBytes(directory);
  const item = {
    ...base,
    bytes,
    manifestPath: safeRelative(root, manifestPath),
    manifestMtimeMs: manifestStat.mtimeMs,
    status: String(manifest.status || 'unknown'),
    schema: String(manifest.schema || ''),
  };
  if (!FAMILIES[family].schemas.test(item.schema)) {
    return { ...item, decision: 'protected', reason: 'unrecognized-schema' };
  }
  if (manifest.runId && String(manifest.runId) !== name) {
    return { ...item, decision: 'protected', reason: 'run-id-mismatch' };
  }
  if (FAMILIES[family].active.has(item.status)) {
    return { ...item, decision: 'protected', reason: 'active-status' };
  }
  if (family === 'puffer' && ['pending', 'running'].includes(String(manifest.evaluation_status || ''))) {
    return { ...item, decision: 'protected', reason: 'active-evaluation' };
  }
  if (family === 'puffer' && ['approval_required', 'rejected'].includes(String(manifest.promotion?.status || ''))) {
    return { ...item, decision: 'protected', reason: `promotion-${manifest.promotion.status}` };
  }
  if (!FAMILIES[family].terminal.has(item.status)) {
    return { ...item, decision: 'protected', reason: 'nonterminal-status' };
  }

  const pid = Number(manifest.pid);
  if (Number.isInteger(pid) && pid > 0) {
    const alive = isProcessAlive(pid, family);
    if (alive === true) return { ...item, decision: 'protected', reason: 'process-still-running' };
    if (alive === null) return { ...item, decision: 'protected', reason: 'process-state-unknown' };
  }

  const finished = manifest.finishedAt || manifest.finished_at || null;
  // Python manifests use Unix seconds; JavaScript producers use ISO strings.
  const finishedMs = typeof finished === 'number' && Number.isFinite(finished) && finished > 0
    ? finished * 1000 : typeof finished === 'string' ? Date.parse(finished) : Number.NaN;
  if (!Number.isFinite(finishedMs)) {
    return { ...item, decision: 'protected', reason: 'missing-terminal-timestamp' };
  }
  return { ...item, decision: 'candidate', reason: 'terminal-unreferenced', terminalMs: finishedMs };
}

function* collectReferenceFiles(root, directory = root) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) { yield* collectReferenceFiles(root, path); continue; }
    if (!entry.isFile() || !/\.(?:json|jsonl)$/i.test(entry.name)) continue;
    const rel = safeRelative(root, path);
    if (!rel || rel === 'retention-manifest.json') continue;
    const stat = statSync(path);
    if (stat.size > MAX_REFERENCE_FILE_BYTES) { yield { path: rel, unknown: true }; continue; }
    try { yield { path: rel, text: readFileSync(path, 'utf8') }; }
    catch { yield { path: rel, unknown: true }; }
  }
}

function attachReferences(root, runItems) {
  const items = runItems.map((item) => ({ ...item }));
  // Retain at most one file's contents, not the whole experiment history.
  for (const ref of collectReferenceFiles(root)) {
    for (const item of items) {
      if (item.decision !== 'candidate' || ref.path.startsWith(item.path + '/')) continue;
      if (!ref.unknown && !ref.text.includes(item.runId)) continue;
      Object.assign(item, { decision: 'protected',
        reason: ref.unknown ? 'reference-scan-incomplete' : 'referenced', reference: ref.path });
    }
  }
  return items;
}

function publicReport(plan) {
  return {
    schema: MANIFEST_SCHEMA,
    generatedAt: new Date(plan.nowMs).toISOString(),
    mode: plan.apply ? 'apply' : 'dry-run',
    root: 'public/live',
    policy: {
      maxAgeDays: plan.maxAgeDays,
      keepLast: plan.keepLast,
      budgetBytes: plan.budgetBytes,
      sharedHistory: 'protect',
      unknownArtifacts: 'protect',
    },
    observedBytes: plan.observedBytes,
    projectedBytes: plan.projectedBytes,
    reclaimableBytes: plan.reclaimableBytes,
    budgetMet: plan.budgetMet,
    protectedBytes: plan.protectedBytes,
    protectedRunBytes: plan.protectedRunBytes,
    sharedProtectedBytes: plan.sharedProtectedBytes,
    counts: plan.counts,
    protected: plan.protected,
    candidates: plan.candidates.map(({ terminalMs, ...item }) => item),
    selected: plan.selected.map(({ terminalMs, manifestPath, manifestMtimeMs, ...item }) => item),
    skipped: plan.skipped,
  };
}

export function planLiveRetention(rootPath, {
  nowMs = Date.now(), maxAgeDays = 30, keepLast = 5, budgetBytes = null,
  apply = false, isProcessAlive = isPidRunning,
} = {}) {
  if (!Number.isFinite(nowMs) || nowMs < 0) throw new Error('nowMs must be a non-negative number.');
  if (!Number.isInteger(maxAgeDays) || maxAgeDays < 1 || maxAgeDays > 3650) {
    throw new Error('maxAgeDays must be an integer from 1 to 3650.');
  }
  if (!Number.isInteger(keepLast) || keepLast < 0 || keepLast > 1000) {
    throw new Error('keepLast must be an integer from 0 to 1000.');
  }
  if (budgetBytes !== null && (!Number.isSafeInteger(budgetBytes) || budgetBytes < 0)) {
    throw new Error('budgetBytes must be a non-negative safe integer.');
  }

  const root = realpathSync(resolve(rootPath));
  if (!statSync(root).isDirectory()) throw new Error('Retention root must be a directory.');
  const runs = [];
  for (const family of Object.keys(FAMILIES)) {
    const familyRoot = join(root, family);
    let entries = [];
    try { entries = readdirSync(familyRoot, { withFileTypes: true }); }
    catch { continue; }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      runs.push(classifyRun(root, family, entry.name, { nowMs, isProcessAlive }));
    }
  }
  const classified = attachReferences(root, runs);
  const cutoff = nowMs - maxAgeDays * DAY_MS;
  for (const item of classified) {
    if (item.decision === 'candidate' && item.terminalMs >= cutoff) {
      item.decision = 'protected';
      item.reason = 'within-retention-age';
    }
  }

  // Preserve the newest terminal runs in each family even when they are old.
  for (const family of Object.keys(FAMILIES)) {
    const terminal = classified
      .filter((item) => item.kind === FAMILIES[family].kind
        && FAMILIES[family].terminal.has(item.status)
        && item.decision === 'candidate')
      .sort((a, b) => b.terminalMs - a.terminalMs || a.runId.localeCompare(b.runId));
    for (const item of terminal.slice(0, keepLast)) {
      if (item.decision === 'candidate') {
        item.decision = 'protected';
        item.reason = 'kept-recent-terminal-run';
      }
    }
  }

  const observedBytes = treeBytes(root);
  const protectedItems = classified.filter((item) => item.decision === 'protected');
  const candidates = classified
    .filter((item) => item.decision === 'candidate')
    .sort((a, b) => a.terminalMs - b.terminalMs || b.bytes - a.bytes || a.runId.localeCompare(b.runId));
  let selected = candidates;
  if (budgetBytes !== null) {
    selected = [];
    let projectedBytes = observedBytes;
    for (const item of candidates) {
      if (projectedBytes <= budgetBytes) break;
      selected.push(item);
      projectedBytes -= item.bytes;
    }
  }
  const projectedBytes = observedBytes - selected.reduce((sum, item) => sum + item.bytes, 0);
  const protectedRunBytes = protectedItems.reduce((sum, item) => sum + item.bytes, 0);
  const knownRunBytes = classified.reduce((sum, item) => sum + item.bytes, 0);
  const sharedProtectedBytes = Math.max(0, observedBytes - knownRunBytes);
  const protectedBytes = protectedRunBytes + sharedProtectedBytes;
  const skipped = [{
    path: '(shared-and-unrecognized-artifacts)',
    reason: 'protected-by-policy',
    bytes: sharedProtectedBytes,
  }];

  return {
    root, nowMs, maxAgeDays, keepLast, budgetBytes, apply,
    observedBytes, projectedBytes, protectedBytes, protectedRunBytes, sharedProtectedBytes,
    reclaimableBytes: candidates.reduce((sum, item) => sum + item.bytes, 0),
    budgetMet: budgetBytes === null || projectedBytes <= budgetBytes,
    protected: protectedItems.map(({ terminalMs, manifestPath, manifestMtimeMs, ...item }) => item),
    candidates, selected, skipped,
    counts: {
      recognizedRuns: classified.length,
      protectedRuns: protectedItems.length,
      candidates: candidates.length,
      selected: selected.length,
    },
  };
}

function revalidateSelected(root, item, isProcessAlive) {
  if (!contained(root, resolve(root, item.path))) return 'path-escape';
  let directory;
  try { directory = lstatSync(resolve(root, item.path)); }
  catch { return 'already-missing'; }
  if (!directory.isDirectory() || directory.isSymbolicLink()) return 'not-a-real-directory';
  if (!contained(root, realpathSync(resolve(root, item.path)))) return 'symlink-escape';
  const family = Object.keys(FAMILIES).find((name) => item.path.startsWith(`${name}/`));
  if (!family) return 'unknown-family';
  let fresh = classifyRun(root, family, basename(item.path), { isProcessAlive });
  fresh = attachReferences(root, [fresh])[0];
  if (fresh.decision !== 'candidate') return fresh.reason;
  const manifestPath = resolve(root, fresh.manifestPath);
  const stat = statSync(manifestPath);
  if (stat.mtimeMs !== item.manifestMtimeMs) return 'manifest-changed';
  return null;
}

export function applyLiveRetention(plan, { isProcessAlive = isPidRunning } = {}) {
  if (!plan?.root || !Array.isArray(plan.selected)) throw new Error('A retention plan is required.');
  const deleted = [];
  const errors = [];
  for (const item of plan.selected) {
    try {
      const reason = revalidateSelected(plan.root, item, isProcessAlive);
      if (reason) { errors.push({ path: item.path, reason }); continue; }
      rmSync(resolve(plan.root, item.path), { recursive: true, force: false });
      deleted.push({ path: item.path, bytes: item.bytes, runId: item.runId, kind: item.kind });
    } catch (error) {
      errors.push({ path: item.path, reason: error.code || error.message });
    }
  }
  const finalBytes = treeBytes(plan.root);
  const report = {
    ...publicReport(plan),
    mode: 'apply',
    finalBytes,
    budgetMet: plan.budgetBytes === null || finalBytes <= plan.budgetBytes,
    deleted,
    errors,
  };
  const target = join(plan.root, 'retention-manifest.json');
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o644 });
    renameSync(temporary, target);
  } catch (error) {
    try { rmSync(temporary, { force: true }); } catch {}
    throw error;
  }
  return report;
}

export function retentionReport(plan) {
  return publicReport(plan);
}

export const LIVE_RETENTION_SCHEMA = MANIFEST_SCHEMA;
