// Consistent SQLite snapshot, including committed WAL data. Never overwrite.
// Usage: node scripts/backup-db.mjs <source.db> <new-backup.db>
import { DatabaseSync } from 'node:sqlite';
import { chmodSync, linkSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function backupDatabase(source, destination) {
  const target = resolve(destination);
  const temporary = mkdtempSync(join(dirname(target), '.dr-backup-'));
  const snapshot = join(temporary, 'snapshot.db');
  let db;
  try {
    db = new DatabaseSync(resolve(source), { readOnly: true });
    db.exec('PRAGMA busy_timeout=5000');
    db.prepare('VACUUM INTO ?').run(snapshot);
    db.close();
    db = null;
    db = new DatabaseSync(snapshot, { readOnly: true });
    const checks = db.prepare('PRAGMA integrity_check').all();
    if (checks.length !== 1 || Object.values(checks[0])[0] !== 'ok') throw new Error('Backup failed SQLite integrity check.');
    db.close();
    db = null;
    chmodSync(snapshot, 0o600);
    // Link publishes the complete file atomically and refuses existing targets.
    linkSync(snapshot, target);
    return target;
  } finally {
    db?.close();
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 4) {
    console.error('Usage: node scripts/backup-db.mjs <source.db> <new-backup.db>');
    process.exitCode = 1;
  } else {
    try { console.log(`Verified SQLite snapshot: ${backupDatabase(process.argv[2], process.argv[3])}`); }
    catch (error) { console.error(`Backup failed: ${error.message}`); process.exitCode = 1; }
  }
}
