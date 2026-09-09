import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, chmodSync, statSync, symlinkSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writePrivateJson, readPrivateJson } from '../server/runtime-files.js';

test('credential publication replaces permissive files and symlinks without changing their targets', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dr-runtime-files-'));
  const path = join(directory, 'token.json'), other = join(directory, 'other');
  try {
    writeFileSync(path, 'old'); chmodSync(path, 0o644);
    assert.throws(() => readPrivateJson(path), /private/);
    writePrivateJson(path, { token: 'test' });
    assert.equal(statSync(path).mode & 0o777, 0o600);
    assert.deepEqual(readPrivateJson(path), { token: 'test' });
    rmSync(path); writeFileSync(other, 'unchanged'); symlinkSync(other, path);
    assert.throws(() => readPrivateJson(path), 'credential reads refuse symlinks');
    writePrivateJson(path, { token: 'replacement' });
    assert.equal(readFileSync(other, 'utf8'), 'unchanged');
    assert.equal(statSync(path).mode & 0o777, 0o600);
    assert.deepEqual(JSON.parse(readFileSync(path)), { token: 'replacement' });
    assert.deepEqual(readdirSync(directory).sort(), ['other', 'token.json']);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
