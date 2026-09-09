import { migrateSchema } from './schema.js';
// SQLite persistence layer using node:sqlite (zero native deps).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DR_DB_PATH
  ? dirname(process.env.DR_DB_PATH)
  : join(__dirname, '..', 'data', 'store');
mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(
  process.env.DR_DB_PATH || join(dataDir, 'dragonrealms.db')
);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;');

export function migrate() {
  migrateSchema(db);
}

export function closeDb() {
  db.close();
}
