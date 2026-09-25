import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { migrateSchema } from '../server/schema.js';

function legacy() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE accounts(id INTEGER PRIMARY KEY);
    INSERT INTO accounts VALUES (1);
    CREATE TABLE characters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      name TEXT NOT NULL UNIQUE, race TEXT NOT NULL, guild TEXT NOT NULL,
      silver INTEGER NOT NULL DEFAULT 25 CHECK(silver >= 0),
      extra TEXT NOT NULL DEFAULT 'kept'
    );
    INSERT INTO characters(id,account_id,name,race,guild,silver) VALUES(2,1,'Legacy','human','barbarian',321);
    INSERT INTO characters(id,account_id,name,race,guild) VALUES(42,1,'Deleted','human','barbarian');
    DELETE FROM characters WHERE id=42;
    CREATE INDEX custom_character_race ON characters(race);
    CREATE TABLE change_log(name TEXT);
    CREATE TRIGGER character_name_log AFTER UPDATE OF name ON characters
      BEGIN INSERT INTO change_log VALUES (NEW.name); END;
    CREATE VIEW character_names AS SELECT name FROM characters;
    CREATE TABLE inventory(id INTEGER PRIMARY KEY,character_id INTEGER REFERENCES characters(id) ON DELETE CASCADE,item_id TEXT,qty INTEGER);
    INSERT INTO inventory VALUES(8,2,'club',1);
  `);
  return db;
}
const schema = db => db.prepare("SELECT name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all();

function failing(db, match) {
  return {
    prepare: sql => db.prepare(sql),
    exec(sql) { if (match(sql)) throw new Error('injected storage failure'); db.exec(sql); },
  };
}

test('fresh schema is versioned and repeated migration is a no-op', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON');
    migrateSchema(db);
    const before = schema(db);
    migrateSchema(db);
    assert.deepEqual(schema(db), before);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n, 3);
    assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
    assert.equal(db.prepare('PRAGMA table_info(characters)').all().find(c=>c.name==='guild').notnull, 0);
    assert.ok(db.prepare('PRAGMA table_info(sessions)').all().some(c => c.name === 'token_hash'));
    assert.equal(db.prepare('PRAGMA table_info(sessions)').all().some(c => c.name === 'token'), false);
  } finally { db.close(); }
});

test('legacy upgrade preserves children, constraints, extra columns, views, indexes, triggers and ID sequence', () => {
  const db = legacy();
  try {
    migrateSchema(db);
    const character = db.prepare('SELECT * FROM characters WHERE id=2').get();
    assert.equal(character.silver, 321);
    assert.equal(character.extra, 'kept');
    assert.equal(character.persistent_state, '{}');
    assert.equal(db.prepare('SELECT character_id FROM inventory WHERE id=8').get().character_id, 2);
    assert.equal(db.prepare('PRAGMA table_info(characters)').all().find(c=>c.name==='guild').notnull, 0);
    assert.equal(db.prepare("SELECT name FROM sqlite_schema WHERE name='custom_character_race'").get().name, 'custom_character_race');
    db.exec("UPDATE characters SET name='Renamed', guild=NULL WHERE id=2");
    assert.equal(db.prepare('SELECT name FROM change_log').get().name, 'Renamed');
    assert.equal(db.prepare('SELECT name FROM character_names').get().name, 'Renamed');
    assert.throws(()=>db.exec('UPDATE characters SET silver=-1 WHERE id=2'), /CHECK/);
    assert.throws(()=>db.exec("INSERT INTO characters(account_id,name,race) VALUES(1,'Renamed','human')"), /UNIQUE/);
    const inserted = db.prepare("INSERT INTO characters(account_id,name,race) VALUES(1,'New','human')").run();
    assert.ok(Number(inserted.lastInsertRowid) > 42, 'deleted IDs are not reused');
    assert.throws(()=>db.exec("INSERT INTO inventory(character_id,item_id,qty) VALUES(999,'club',1)"), /FOREIGN KEY/);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    const migrated = schema(db);
    migrateSchema(db);
    assert.deepEqual(schema(db), migrated);
  } finally { db.close(); }
});

test('failed column addition rolls back earlier additions and does not record success', () => {
  const db = legacy();
  try {
    const before = schema(db);
    assert.throws(()=>migrateSchema(failing(db,sql=>sql.includes('ADD COLUMN stance '))), /Cannot add characters.stance: injected storage failure/);
    assert.deepEqual(schema(db), before);
    assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
    migrateSchema(db);
    assert.equal(db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get().version, 3);
  } finally { db.close(); }
});

test('failure after table rebuild restores the original table and dependent objects', () => {
  const db = legacy();
  try {
    const before = schema(db);
    assert.throws(()=>migrateSchema(failing(db,sql=>sql.includes('idx_skills_character'))), /injected storage failure/);
    assert.deepEqual(schema(db), before);
    assert.equal(db.prepare('PRAGMA table_info(characters)').all().find(c=>c.name==='guild').notnull, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM inventory').get().n, 1);
    assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
    assert.equal(db.prepare('PRAGMA legacy_alter_table').get().legacy_alter_table, 0);
  } finally { db.close(); }
});

test('a pre-existing rebuild table is preserved and stops the upgrade', () => {
  const db = legacy();
  try {
    db.exec('CREATE TABLE characters_new (evidence TEXT); INSERT INTO characters_new VALUES (\'keep\')');
    const before = schema(db);
    assert.throws(()=>migrateSchema(db), /characters_new already exists/);
    assert.deepEqual(schema(db), before);
    assert.equal(db.prepare('SELECT evidence FROM characters_new').get().evidence, 'keep');
  } finally { db.close(); }
});

test('foreign-key violations and newer schema versions fail explicitly', () => {
  const db = legacy();
  try {
    db.exec("PRAGMA foreign_keys=OFF; INSERT INTO inventory VALUES(9,999,'club',1); PRAGMA foreign_keys=ON");
    const before = schema(db);
    assert.throws(()=>migrateSchema(db), /Foreign-key integrity check failed/);
    assert.deepEqual(schema(db), before);
    db.exec("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,name TEXT NOT NULL); INSERT INTO schema_migrations VALUES(4,'future')");
    assert.throws(()=>migrateSchema(db), /newer than this server supports/);
    assert.equal(db.prepare('SELECT version FROM schema_migrations').get().version, 4);
  } finally { db.close(); }
});
