import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { refreshLiveIndex } from '../scripts/lib/live-index.mjs';

test('live index publishes legacy names and throttled metadata', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dr-live-index-'));
  const log = join(dir, 'worker.log');
  writeFileSync(log, 'one\n');

  assert.equal(refreshLiveIndex(dir, { force: true }), true);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')), ['worker']);

  const first = JSON.parse(readFileSync(join(dir, 'index-meta.json'), 'utf8'));
  assert.equal(first.logs.length, 1);
  assert.equal(first.logs[0].name, 'worker');
  assert.equal(first.logs[0].size, 4);

  appendFileSync(log, 'two\n');
  assert.equal(refreshLiveIndex(dir, { minIntervalMs: 60_000 }), false);
  assert.equal(JSON.parse(readFileSync(join(dir, 'index-meta.json'), 'utf8')).logs[0].size, 4);

  assert.equal(refreshLiveIndex(dir, { force: true }), true);
  assert.equal(JSON.parse(readFileSync(join(dir, 'index-meta.json'), 'utf8')).logs[0].size, 8);
  assert.equal(readdirSync(dir).some((name) => name.endsWith('.tmp')), false);
});
