import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('missing browser fails the gate and removes its disposable database/profile', { timeout: 20000 }, () => {
  const directory = mkdtempSync(join(tmpdir(), 'dr-driver-failure-'));
  try {
    const result = spawnSync(process.execPath, ['scripts/client-regression.mjs'], {
      cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8', timeout: 15000,
      env: { ...process.env, TMPDIR: directory, DR_CHROMIUM_PATH: join(directory, 'missing-browser') },
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /CLIENT CHECK FAILED:.*ENOENT/);
    assert.deepEqual(readdirSync(directory), [], 'failed startup cleans up owned artifacts');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
