import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { backupDatabase } from '../scripts/backup-db.mjs';

test('live WAL backup restores committed state without overwriting existing files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dr-backup-test-'));
  const source = join(dir, 'world.db'), target = join(dir, 'backup.db'), restored = join(dir, 'restored.db');
  const writer = new DatabaseSync(source);
  let reader;
  try {
    writer.exec('PRAGMA journal_mode=WAL; CREATE TABLE state(value INTEGER); INSERT INTO state VALUES(42)');
    backupDatabase(source, target);
    assert.equal(statSync(target).mode & 0o777, 0o600);
    writer.exec('UPDATE state SET value=99');
    assert.throws(() => backupDatabase(source, target), /exist/i);
    backupDatabase(target, restored);
    reader = new DatabaseSync(restored);
    assert.equal(reader.prepare('SELECT value FROM state').get().value, 42);
    assert.throws(() => backupDatabase(join(dir, 'missing.db'), join(dir, 'bad.db')));
    assert.equal(readdirSync(dir).some((name) => name.startsWith('.dr-backup-') || name === 'bad.db'), false);
  } finally {
    reader?.close(); writer.close(); rmSync(dir, { recursive: true, force: true });
  }
});
