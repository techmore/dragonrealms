// Sweeps-history SQLite store — a SIM ARTIFACT, not game state.
// Deliberately lives beside the fidelity logs in public/live/sweeps.db and
// is NOT part of the game DB migrations in server/db.js.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export function openSweepsDb(liveDir) {
  mkdirSync(liveDir, { recursive: true });
  const db = new DatabaseSync(join(liveDir, 'sweeps.db'));
  db.exec(`
    CREATE TABLE IF NOT EXISTS sweeps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      ts TEXT NOT NULL,
      guild TEXT NOT NULL,
      race TEXT NOT NULL,
      grade TEXT,
      circle INTEGER,
      kills INTEGER DEFAULT 0,
      trains INTEGER DEFAULT 0,
      circles_up INTEGER DEFAULT 0,
      deaths INTEGER DEFAULT 0,
      refusals INTEGER DEFAULT 0,
      durationMs INTEGER,
      notes TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sweeps_guild_race_ts ON sweeps(guild, race, ts);
    CREATE INDEX IF NOT EXISTS idx_sweeps_run ON sweeps(run_id);
  `);
  return db;
}

export function insertSweep(db, r) {
  db.prepare(`INSERT INTO sweeps
    (run_id, ts, guild, race, grade, circle, kills, trains, circles_up, deaths, refusals, durationMs, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    r.run_id, r.ts, r.guild, r.race, r.grade ?? null, r.circle ?? null,
    r.kills ?? 0, r.trains ?? 0, r.circles_up ?? 0, r.deaths ?? 0,
    r.refusals ?? 0, r.durationMs ?? null, r.notes ?? null,
  );
}
