// Schema upgrades are an atomic, versioned startup step. No game runtime
// imports: upgrade tests can use an independent in-memory SQLite connection.
export function migrateSchema(db) {
  const foreignKeys = db.prepare('PRAGMA foreign_keys').get().foreign_keys;
  const legacyAlter = db.prepare('PRAGMA legacy_alter_table').get().legacy_alter_table;
  let started = false;
  try {
    // SQLite ignores this switch inside a transaction. Disable it before
    // rebuilding the parent table so child rows cannot cascade away.
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec('BEGIN IMMEDIATE');
    started = true;
    db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL)');
    const latest = db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get().version || 0;
    if (latest > 1) throw new Error(`Database schema version ${latest} is newer than this server supports (1).`);
    if (latest < 1) {
      applyBaseline(db);
      if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Foreign-key integrity check failed.');
      db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(1, 'baseline and guildless characters');
    }
    db.exec('COMMIT');
    started = false;
  } catch (cause) {
    if (started) db.exec('ROLLBACK');
    throw new Error(`Database migration failed: ${cause.message}`, { cause });
  } finally {
    db.exec(`PRAGMA legacy_alter_table = ${legacyAlter ? 'ON' : 'OFF'}`);
    db.exec(`PRAGMA foreign_keys = ${foreignKeys ? 'ON' : 'OFF'}`);
  }
}

function addColumn(db, table, column, definition) {
  // All identifiers/definitions here are authored constants, not client input.
  if (db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column)) return;
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`); }
  catch (cause) { throw new Error(`Cannot add ${table}.${column}: ${cause.message}`, { cause }); }
}

function relaxGuildConstraint(db) {
  if (!db.prepare('PRAGMA table_info(characters)').all().find((c) => c.name === 'guild')?.notnull) return;
  const original = db.prepare("SELECT sql FROM sqlite_schema WHERE type='table' AND name='characters'").get().sql;
  // Edit only the known historical declaration. Keeping the original CREATE
  // statement preserves CHECK/UNIQUE constraints, defaults and extra columns.
  const relaxed = original.replace(/\bguild\s+TEXT\s+NOT\s+NULL\b/i, 'guild TEXT');
  if (relaxed === original) throw new Error('Unrecognized characters.guild constraint; migration requires review.');
  const replacement = relaxed.replace(/^CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(?:"characters"|`characters`|\[characters\]|characters)(?=\s*\()/i, 'CREATE TABLE characters_new');
  if (replacement === relaxed) throw new Error('Unrecognized characters table declaration; migration requires review.');
  const objects = db.prepare("SELECT sql FROM sqlite_schema WHERE tbl_name='characters' AND type IN ('index', 'trigger') AND sql IS NOT NULL").all();
  const sequence = db.prepare("SELECT seq FROM sqlite_sequence WHERE name='characters'").get()?.seq;
  const columns = db.prepare('PRAGMA table_info(characters)').all().map((c) => '"' + c.name.replaceAll('"', '""') + '"').join(', ');
  db.exec(replacement);
  db.exec(`INSERT INTO characters_new (${columns}) SELECT ${columns} FROM characters`);
  db.exec('DROP TABLE characters');
  // Views still refer to the final name while it is temporarily absent.
  db.exec('PRAGMA legacy_alter_table = ON');
  db.exec('ALTER TABLE characters_new RENAME TO characters');
  for (const { sql } of objects) db.exec(sql);
  if (sequence !== undefined) {
    const updated = db.prepare("UPDATE sqlite_sequence SET seq=MAX(seq, ?) WHERE name='characters'").run(sequence);
    if (!updated.changes) db.prepare("INSERT INTO sqlite_sequence (name, seq) VALUES ('characters', ?)").run(sequence);
  }
}

function applyBaseline(db) {
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
      guild TEXT,
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
    addColumn(db, 'characters', col, def);
  }
  relaxGuildConstraint(db);
  addColumn(db, 'equipment', 'condition', 'INTEGER NOT NULL DEFAULT 100');
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
    addColumn(db, table, col, def);
  }
  addColumn(db, 'character_quest', 'state', "TEXT NOT NULL DEFAULT '{}'");
  addColumn(db, 'inventory', 'bundle', 'TEXT');
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
