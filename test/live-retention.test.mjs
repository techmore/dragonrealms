import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  applyLiveRetention, LIVE_RETENTION_SCHEMA, planLiveRetention, retentionReport,
} from '../scripts/lib/live-retention.mjs';
import { parseRetentionArgs } from '../scripts/retention.mjs';

const NOW = Date.parse('2026-09-24T12:00:00.000Z');
const OLD = '2026-07-01T00:00:00.000Z';

function tempRoot(t) {
  const root = mkdtempSync(join(tmpdir(), 'dr-live-retention-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function addRun(root, family, name, manifest, body = 'event\n') {
  const directory = join(root, family, name);
  mkdirSync(directory, { recursive: true });
  const value = { runId: name, ...manifest };
  writeFileSync(join(directory, 'manifest.json'), `${JSON.stringify(value, null, 2)}\n`);
  if (body !== null) writeFileSync(join(directory, 'events.jsonl'), body);
  return directory;
}

const jev = (name, overrides = {}) => ({
  schema: 'dragonrealms.jev-realtime-player/2',
  status: 'complete',
  finishedAt: OLD,
  ...overrides,
});

const puffer = (name, overrides = {}) => ({
  schema: 'dragonrealms.puffer.run/1',
  status: 'completed',
  evaluation_status: 'completed',
  finished_at: OLD,
  ...overrides,
});

const unreal = (name, overrides = {}) => ({
  schema: 'dragonrealms.unreal-player/1',
  status: 'completed',
  finishedAt: OLD,
  ...overrides,
});

function plan(root, overrides = {}) {
  return planLiveRetention(root, { nowMs: NOW, maxAgeDays: 30, keepLast: 0, ...overrides });
}

test('dry-run plans only old terminal recognized runs and writes nothing', (t) => {
  const root = tempRoot(t);
  addRun(root, 'jev-player', 'old-complete', jev('old-complete'));
  addRun(root, 'unreal-agent', 'still-playing', unreal('still-playing', {
    status: 'playing', finishedAt: null,
  }));
  addRun(root, 'puffer', 'bad', { schema: 'unknown puffer schema', status: 'completed' });
  addRun(root, 'puffer', 'no-finish-time', {
    schema: 'dragonrealms.puffer.run/1', status: 'completed', evaluation_status: 'completed',
  });
  mkdirSync(join(root, 'fly', 'fly-balanced-20200101-000000'), { recursive: true });
  writeFileSync(join(root, 'fidelity-summary.jsonl'), '{"run_id":"shared"}\n');
  const before = readdirSync(root).sort();

  const report = retentionReport(plan(root));
  assert.equal(report.schema, LIVE_RETENTION_SCHEMA);
  assert.equal(report.mode, 'dry-run');
  assert.deepEqual(report.selected.map((item) => item.runId), ['old-complete']);
  assert.equal(report.protected.find((item) => item.runId === 'still-playing').reason, 'active-status');
  assert.equal(report.protected.find((item) => item.runId === 'bad').reason, 'unrecognized-schema');
  assert.equal(report.protected.find((item) => item.runId === 'no-finish-time').reason, 'missing-terminal-timestamp');
  assert.equal(report.skipped[0].bytes > 0, true);
  assert.deepEqual(readdirSync(root).sort(), before);
  assert.equal(existsSync(join(root, 'retention-manifest.json')), false);
});

test('active or uncertain processes and Puffer review states are protected', (t) => {
  const root = tempRoot(t);
  addRun(root, 'jev-player', 'process-live', jev('process-live', { pid: 101 }));
  addRun(root, 'jev-player', 'process-unknown', jev('process-unknown', { pid: 102 }));
  addRun(root, 'puffer', 'evaluating', puffer('evaluating', { evaluation_status: 'running' }));
  addRun(root, 'puffer', 'awaiting-review', puffer('awaiting-review', {
    promotion: { status: 'approval_required', eligible: true },
  }));
  addRun(root, 'puffer', 'rejected-evidence', puffer('rejected-evidence', {
    promotion: { status: 'rejected', eligible: false },
  }));

  const report = retentionReport(plan(root, { isProcessAlive: (pid) => pid === 101 ? true : null }));
  assert.equal(report.selected.length, 0);
  assert.equal(report.protected.find((item) => item.runId === 'process-live').reason, 'process-still-running');
  assert.equal(report.protected.find((item) => item.runId === 'process-unknown').reason, 'process-state-unknown');
  assert.equal(report.protected.find((item) => item.runId === 'evaluating').reason, 'active-evaluation');
  assert.equal(report.protected.find((item) => item.runId === 'awaiting-review').reason, 'promotion-approval_required');
  assert.equal(report.protected.find((item) => item.runId === 'rejected-evidence').reason, 'promotion-rejected');
});

test('Python numeric completion timestamps are recognized as Unix seconds', (t) => {
  const root = tempRoot(t);
  addRun(root, 'puffer', 'python-completed', puffer('python-completed', { finished_at: Date.parse(OLD) / 1000 }));
  addRun(root, 'puffer', 'invalid-number', puffer('invalid-number', { finished_at: -1 }));
  const report = retentionReport(plan(root));
  assert.deepEqual(report.selected.map((item) => item.runId), ['python-completed']);
  assert.equal(report.protected.find((item) => item.runId === 'invalid-number').reason, 'missing-terminal-timestamp');
});

test('protected run dependencies are visible to planning and application', (t) => {
  const root = tempRoot(t);
  const parent = addRun(root, 'jev-player', 'parent-evidence', jev('parent-evidence'));
  addRun(root, 'jev-player', 'active-child', jev('active-child', { status: 'playing', parentRun: 'parent-evidence' }));
  const planned = plan(root);
  assert.equal(planned.selected.length, 0);
  assert.equal(planned.protected.find((item) => item.runId === 'parent-evidence').reason, 'referenced');
  applyLiveRetention(planned);
  assert.equal(existsSync(parent), true);
});

test('incomplete reference scans fail closed instead of deleting evidence', (t) => {
  const root = tempRoot(t);
  addRun(root, 'jev-player', 'old-evidence', jev('old-evidence'));
  writeFileSync(join(root, 'large-history.jsonl'), ' '.repeat(10 * 1024 * 1024 + 1));
  const report = retentionReport(plan(root));
  assert.equal(report.selected.length, 0);
  assert.equal(report.protected[0].reason, 'reference-scan-incomplete');
});

test('queue/report references protect a run and keepLast preserves recent terminal evidence', (t) => {
  const root = tempRoot(t);
  addRun(root, 'jev-player', 'referenced', jev('referenced'));
  addRun(root, 'jev-player', 'newest', jev('newest', { finishedAt: '2026-06-20T00:00:00.000Z' }));
  addRun(root, 'jev-player', 'middle', jev('middle', { finishedAt: '2026-06-10T00:00:00.000Z' }));
  addRun(root, 'jev-player', 'older', jev('older', { finishedAt: '2026-06-01T00:00:00.000Z' }));
  addRun(root, 'jev-player', 'oldest', jev('oldest', { finishedAt: '2026-05-01T00:00:00.000Z' }));
  writeFileSync(join(root, 'jev-player-queue.json'), JSON.stringify({ candidate: { runId: 'referenced' } }));

  const report = retentionReport(plan(root, { keepLast: 3 }));
  assert.equal(report.protected.find((item) => item.runId === 'referenced').reason, 'referenced');
  assert.equal(report.protected.find((item) => item.runId === 'referenced').reference, 'jev-player-queue.json');
  assert.equal(report.protected.find((item) => item.runId === 'newest').reason, 'kept-recent-terminal-run');
  assert.equal(report.protected.find((item) => item.runId === 'middle').reason, 'kept-recent-terminal-run');
  assert.deepEqual(report.selected.map((item) => item.runId), ['oldest']);
});

test('budget selects the oldest complete evidence first and reports protected shortfall', (t) => {
  const root = tempRoot(t);
  addRun(root, 'jev-player', 'one', jev('one', { finishedAt: '2026-06-01T00:00:00.000Z' }), 'x'.repeat(1000));
  addRun(root, 'jev-player', 'two', jev('two', { finishedAt: '2026-06-02T00:00:00.000Z' }), 'x'.repeat(1000));
  addRun(root, 'jev-player', 'three', jev('three', { finishedAt: '2026-06-03T00:00:00.000Z' }), 'x'.repeat(1000));
  const full = plan(root);
  const oneBytes = full.candidates[0].bytes;
  const report = retentionReport(plan(root, { budgetBytes: full.observedBytes - oneBytes }));

  assert.deepEqual(report.selected.map((item) => item.runId), ['one']);
  assert.equal(report.budgetMet, true);
  const impossible = retentionReport(plan(root, { budgetBytes: 1 }));
  assert.equal(impossible.selected.length, 3);
  assert.equal(impossible.budgetMet, false);
  assert.equal(impossible.protectedBytes > 0, true);
});

test('apply revalidates references, removes complete groups, writes a manifest, and is idempotent', (t) => {
  const root = tempRoot(t);
  const directory = addRun(root, 'jev-player', 'eligible', jev('eligible'));
  const first = plan(root);
  assert.deepEqual(first.selected.map((item) => item.runId), ['eligible']);

  // A queue/reference can appear between planning and apply. Revalidation must
  // preserve the run rather than executing the stale plan.
  writeFileSync(join(root, 'late-reference.json'), JSON.stringify({ manifest: 'jev-player/eligible/manifest.json' }));
  const blocked = applyLiveRetention(first);
  assert.equal(existsSync(directory), true);
  assert.equal(blocked.errors[0].reason, 'referenced');

  rmSync(join(root, 'late-reference.json'));
  const applied = applyLiveRetention(plan(root));
  assert.equal(existsSync(directory), false);
  assert.deepEqual(applied.deleted.map((item) => item.runId), ['eligible']);
  const manifest = JSON.parse(readFileSync(join(root, 'retention-manifest.json'), 'utf8'));
  assert.equal(manifest.schema, LIVE_RETENTION_SCHEMA);
  assert.equal(manifest.mode, 'apply');
  assert.equal(manifest.deleted.length, 1);
  assert.equal(manifest.deleted[0].path, 'jev-player/eligible');
  assert.equal(readdirSync(root).some((name) => name.includes('.tmp')), false);

  const second = retentionReport(plan(root));
  assert.equal(second.selected.length, 0);
});

test('unknown and symlinked family entries are never deletion candidates', (t) => {
  const root = tempRoot(t);
  const outside = tempRoot(t);
  mkdirSync(join(outside, 'secret'), { recursive: true });
  writeFileSync(join(outside, 'secret', 'keep.txt'), 'keep');
  mkdirSync(join(root, 'puffer'), { recursive: true });
  symlinkSync(outside, join(root, 'puffer', 'linked-run'), 'dir');
  addRun(root, 'unreal-agent', 'real', unreal('real'));

  const report = retentionReport(plan(root));
  assert.deepEqual(report.selected.map((item) => item.runId), ['real']);
  assert.equal(existsSync(join(outside, 'secret', 'keep.txt')), true);
});

test('retention CLI rejects unknown and invalid arguments', () => {
  assert.throws(() => parseRetentionArgs(['--wat']), /Unknown argument/);
  assert.throws(() => parseRetentionArgs(['--keep-last']), /requires a value/);
  assert.throws(() => parseRetentionArgs(['--max-age-days', '0']), /integer from 1/);
  assert.throws(() => parseRetentionArgs(['--budget-mb', '-1']), /integer from 1/);
  const parsed = parseRetentionArgs(['--max-age-days', '7', '--keep-last', '0', '--budget-mb', '2', '--apply', '--json']);
  assert.equal(parsed.maxAgeDays, 7);
  assert.equal(parsed.keepLast, 0);
  assert.equal(parsed.budgetBytes, 2 * 1024 * 1024);
  assert.equal(parsed.apply, true);
  assert.equal(parsed.json, true);
});
