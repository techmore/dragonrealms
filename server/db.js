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
      stamina INTEGER NOT NULL DEFAULT 0,
      warrant TEXT,
      patron TEXT,
      element TEXT,
      caravan TEXT,
      link TEXT,
      achievements TEXT NOT NULL DEFAULT '[]',
      techniques TEXT NOT NULL DEFAULT '[]',
      persistent_state TEXT NOT NULL DEFAULT '{}',
      soul INTEGER NOT NULL DEFAULT 50,
      empathic_stain INTEGER NOT NULL DEFAULT 0,
      devotion INTEGER NOT NULL DEFAULT 30,
      exp_pools TEXT NOT NULL DEFAULT '{}',
      home_city TEXT NOT NULL DEFAULT 'crossing',
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
      qty INTEGER NOT NULL DEFAULT 1,
      condition INTEGER,
      quality REAL,
      maker TEXT,
      bundle TEXT
    );

    CREATE TABLE IF NOT EXISTS equipment (
      character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      slot TEXT NOT NULL,
      item_id TEXT NOT NULL,
      condition INTEGER NOT NULL DEFAULT 100,
      quality REAL,
      maker TEXT,
      PRIMARY KEY (character_id, slot)
    );

    CREATE TABLE IF NOT EXISTS character_quest (
      character_id INTEGER PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
      creature_id TEXT NOT NULL,
      count INTEGER NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      state TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS aliases (
      character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      command TEXT NOT NULL,
      PRIMARY KEY (character_id, name)
    );

    CREATE TABLE IF NOT EXISTS vault (
      character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      item_id TEXT NOT NULL,
      qty INTEGER NOT NULL DEFAULT 1,
      metadata TEXT NOT NULL DEFAULT '[]',
      PRIMARY KEY (character_id, item_id)
    );
  `);

  // Migrations for pre-existing databases.
  for (const [col, def] of [
    ['tdp', 'INTEGER NOT NULL DEFAULT 0'],
    ['stance', "TEXT NOT NULL DEFAULT 'balanced'"],
    ['tdp_pool', 'INTEGER NOT NULL DEFAULT 0'],
    ['pvp_stance', "TEXT NOT NULL DEFAULT 'guarded'"],
    ['rexp', 'INTEGER NOT NULL DEFAULT 0'],
    ['stamina', 'INTEGER NOT NULL DEFAULT 0'],
    ['warrant', 'TEXT'],
    ['patron', 'TEXT'],
    ['element', 'TEXT'],
    ['caravan', 'TEXT'],
    ['link', 'TEXT'],
    ['achievements', "TEXT NOT NULL DEFAULT '[]'"],
    ['techniques', "TEXT NOT NULL DEFAULT '[]'"],
    ['persistent_state', "TEXT NOT NULL DEFAULT '{}'"],
    ['soul', 'INTEGER NOT NULL DEFAULT 50'],
    ['empathic_stain', 'INTEGER NOT NULL DEFAULT 0'],
    ['devotion', 'INTEGER NOT NULL DEFAULT 30'],
    ['exp_pools', 'TEXT NOT NULL DEFAULT \'{}\''],
    ['home_city', "TEXT NOT NULL DEFAULT 'crossing'"],
  ]) {
    try {
      db.exec(`ALTER TABLE characters ADD COLUMN ${col} ${def}`);
    } catch { /* column already exists */ }
  }
  // Equipment condition (durability).
  try {
    db.exec('ALTER TABLE equipment ADD COLUMN condition INTEGER NOT NULL DEFAULT 100');
  } catch { /* column already exists */ }
  // Item instances carry their own durability and crafting quality. Nullable
  // columns preserve legacy stack rows without manufacturing meaningless
  // metadata for commodities and consumables.
  for (const [table, col, def] of [
    ['inventory', 'condition', 'INTEGER'],
    ['inventory', 'quality', 'REAL'],
    ['inventory', 'maker', 'TEXT'],
    ['equipment', 'quality', 'REAL'],
    ['equipment', 'maker', 'TEXT'],
    ['vault', 'metadata', "TEXT NOT NULL DEFAULT '[]'"],
  ]) {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
    } catch { /* column already exists */ }
  }
  try {
    db.exec("ALTER TABLE character_quest ADD COLUMN state TEXT NOT NULL DEFAULT '{}'");
  } catch { /* column already exists */ }
  // Bundled stacks (bundle command) remember what is inside the wrap.
  try {
    db.exec('ALTER TABLE inventory ADD COLUMN bundle TEXT');
  } catch { /* column already exists */ }
  // Auction listings survive world restarts: items are escrowed here at
  // offer time and returned on expiry or paid out on sale. Without this
  // table, a restart silently destroyed every open lot AND its contents.
  db.exec(`
    CREATE TABLE IF NOT EXISTS auctions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seller INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      item_id TEXT NOT NULL,
      item_name TEXT NOT NULL,
      qty INTEGER NOT NULL,
      price INTEGER NOT NULL,
      instances TEXT NOT NULL DEFAULT '[]',
      at INTEGER NOT NULL
    );
  `);
  // FK lookups run on every load/save — index them (previously full scans).
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_skills_character ON skills(character_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_character ON inventory(character_id);
    CREATE INDEX IF NOT EXISTS idx_equipment_character ON equipment(character_id);
    CREATE INDEX IF NOT EXISTS idx_aliases_character ON aliases(character_id);
    CREATE INDEX IF NOT EXISTS idx_vault_character ON vault(character_id);
    CREATE INDEX IF NOT EXISTS idx_quest_character ON character_quest(character_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_account ON sessions(account_id);
  `);
}

export function closeDb() {
  db.close();
}
