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
  migrateSweepsColumns(db);
  return db;
}

// Guarded column migration for pre-existing DBs (CREATE TABLE IF NOT EXISTS
// never adds columns to an existing table): add verdict/variant columns only
// when a pragma check says they're missing. Old DBs keep working; every
// reader treats NULL as "unknown" and renders '-'.
const EXTRA_COLUMNS = {
  variant: 'TEXT',
  timeToCircleMs: 'INTEGER',
  stallVerdict: 'TEXT',
  stallReason: 'TEXT',
  // Leveling lab: JSON array of {circle, ms} splits — the per-circle pacing
  // curve for the run. NULL for ordinary fidelity sweeps.
  circleTimes: 'TEXT',
  // Leveling lab: ms from enter to the first rank gain; JSON [{ranks, ms}]
  // crossings at +5/+10/+15 total ranks.
  firstExpMs: 'INTEGER',
  rankSplits: 'TEXT',
  // End-of-run snapshot from the GM API: character name + summed skill ranks.
  char: 'TEXT',
  totalRanks: 'INTEGER',
};

function migrateSweepsColumns(db) {
  const have = new Set(db.prepare('PRAGMA table_info(sweeps)').all().map((c) => c.name));
  for (const [col, type] of Object.entries(EXTRA_COLUMNS)) {
    if (!have.has(col)) db.exec(`ALTER TABLE sweeps ADD COLUMN ${col} ${type}`);
  }
}

export function insertSweep(db, r) {
  // Column-aware insert: include the extended columns only when the row
  // carries them, so callers compiled against older schemas keep working.
  const cols = ['run_id', 'ts', 'guild', 'race', 'grade', 'circle', 'kills',
    'trains', 'circles_up', 'deaths', 'refusals', 'durationMs', 'notes'];
  const vals = [r.run_id, r.ts, r.guild, r.race, r.grade ?? null, r.circle ?? null,
    r.kills ?? 0, r.trains ?? 0, r.circles_up ?? 0, r.deaths ?? 0,
    r.refusals ?? 0, r.durationMs ?? null, r.notes ?? null];
  for (const col of Object.keys(EXTRA_COLUMNS)) {
    if (r[col] === undefined) continue;
    cols.push(col);
    // circleTimes is stored as its JSON encoding; everything else passes through.
    vals.push(col === 'circleTimes' ? JSON.stringify(r[col]) : (r[col] ?? null));
  }
  const placeholders = cols.map(() => '?').join(', ');
  db.prepare(`INSERT INTO sweeps (${cols.join(', ')}) VALUES (${placeholders})`).run(...vals);
}
