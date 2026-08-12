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

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      pass_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS characters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      name TEXT NOT NULL UNIQUE,
      race TEXT NOT NULL,
      guild TEXT NOT NULL,
      circle INTEGER NOT NULL DEFAULT 1,
      str INTEGER NOT NULL, con INTEGER NOT NULL, ref INTEGER NOT NULL,
      agi INTEGER NOT NULL, cha INTEGER NOT NULL, dis INTEGER NOT NULL,
      wis INTEGER NOT NULL, int INTEGER NOT NULL,
      unspent_stat INTEGER NOT NULL DEFAULT 0,
      mana INTEGER NOT NULL DEFAULT 0,
      tdp INTEGER NOT NULL DEFAULT 0,
      tdp_pool INTEGER NOT NULL DEFAULT 0,
      stance TEXT NOT NULL DEFAULT 'balanced',
      pvp_stance TEXT NOT NULL DEFAULT 'guarded',
      rexp INTEGER NOT NULL DEFAULT 0,
      silver INTEGER NOT NULL DEFAULT 0,
      bank INTEGER NOT NULL DEFAULT 0,
      room TEXT NOT NULL,
      hp INTEGER NOT NULL, max_hp INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS skills (
      character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      skill_id TEXT NOT NULL,
      rank INTEGER NOT NULL DEFAULT 0,
      exp INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (character_id, skill_id)
    );

    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      item_id TEXT NOT NULL,
      qty INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS equipment (
      character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      slot TEXT NOT NULL,
      item_id TEXT NOT NULL,
      PRIMARY KEY (character_id, slot)
    );

    CREATE TABLE IF NOT EXISTS character_quest (
      character_id INTEGER PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
      creature_id TEXT NOT NULL,
      count INTEGER NOT NULL,
      done INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS aliases (
      character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      command TEXT NOT NULL,
      PRIMARY KEY (character_id, name)
    );
  `);

  // Migrations for pre-existing databases.
  for (const [col, def] of [
    ['tdp', 'INTEGER NOT NULL DEFAULT 0'],
    ['stance', "TEXT NOT NULL DEFAULT 'balanced'"],
    ['tdp_pool', 'INTEGER NOT NULL DEFAULT 0'],
    ['pvp_stance', "TEXT NOT NULL DEFAULT 'guarded'"],
    ['rexp', 'INTEGER NOT NULL DEFAULT 0'],
  ]) {
    try {
      db.exec(`ALTER TABLE characters ADD COLUMN ${col} ${def}`);
    } catch { /* column already exists */ }
  }
}

export function closeDb() {
  db.close();
}
