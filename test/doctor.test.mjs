import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { diagnose, launchSummary } from '../scripts/doctor.mjs';

test('launch summary validates configuration and excludes credentials', () => {
  const secret = 'private-value-that-must-never-appear';
  const summary = launchSummary({ DR_GM_TOKEN: secret, DR_DEBUG_TOKEN: secret }, '/project');
  assert.equal(summary.database, '/project/data/store/dragonrealms.db');
  assert.equal(JSON.stringify(summary).includes(secret), false);
  assert.throws(() => launchSummary({ PORT: 'broken' }), /PORT/);
  assert.equal(launchSummary({ DR_DB_PATH: ':memory:' }).database, ':memory:');
});

test('preflight checks prospective storage without creating a database or directory', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dr-doctor-'));
  try {
    mkdirSync(join(root, 'public'));
    writeFileSync(join(root, 'public/index.html'), '<!doctype html>');
    const report = await diagnose({ root, env: {} });
    assert.equal(report.ok, true);
    assert.deepEqual(readdirSync(root), ['public']);
    assert.equal(report.checks.find(check => check.name === 'Database location').status, 'pass');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('preflight aggregates bad settings and rejects a directory as a database', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dr-doctor-'));
  try {
    const report = await diagnose({ root, env: { PORT: 'broken' }, version: '20.0.0' });
    assert.equal(report.ok, false);
    assert.equal(report.checks.filter(check => check.status === 'fail').length, 3);
    assert.equal(report.launch, undefined);
    const storage = await diagnose({ root, env: { DR_DB_PATH: root } });
    assert.match(storage.checks.find(check => check.name === 'Database location').detail, /must name a file/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
