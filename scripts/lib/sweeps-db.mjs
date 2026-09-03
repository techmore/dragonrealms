// Sweeps-history SQLite store — a SIM ARTIFACT, not game state.
// Deliberately lives beside the fidelity logs in public/live/sweeps.db and
// is NOT part of the game DB migrations in server/db.js.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export function openSweepsDb(liveDir) {
  mkdirSync(liveDir, { recursive: true });
  // Multiple benchmark processes may finish together and write the shared
  // sim-artifact DB. Let SQLite wait briefly for the other writer instead of
  // dropping a perfectly valid run on an immediate SQLITE_BUSY.
  const db = new DatabaseSync(join(liveDir, 'sweeps.db'), { timeout: 5000 });
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
  weaponPolicy: 'TEXT',
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
  // Circle-gap telemetry at finish: shortfall = sum of (need-have) over the
  // server's requirement list, blocked = count of unmet requirements. Lets
  // variants be ranked by RATE of gap closure from short runs, without
  // waiting (possibly forever) for an actual circle-up.
  shortfall: 'INTEGER',
  blocked: 'INTEGER',
  // Full circle-gap closure history. `shortfall`/`blocked` are the final
  // snapshot; these fields preserve the first/last values and each minute's
  // sample so DB reports do not need to re-parse fidelity logs.
  shortfallFirst: 'INTEGER',
  shortfallLast: 'INTEGER',
  gapsSamples: 'TEXT',
  // Per-minute total-rank deltas/rates plus high-ranked skills that were not
  // the concrete weakest member of the next-circle requirement set.
  expRateSamples: 'TEXT',
  // Reproducible experiment cohort. These fields prevent the reporting layer
  // from comparing runs with different targets, boosts, caps, arenas or
  // generated configurations as though they were equivalent repeats.
  targetCircle: 'INTEGER',
  boost: 'INTEGER',
  minutesCap: 'REAL',
  mode: 'TEXT',
  concurrency: 'INTEGER',
  comparisonType: 'TEXT',
  statPolicy: 'TEXT',
  statAllocation: 'TEXT',
  arena: 'TEXT',
  species: 'TEXT',
  variantConfig: 'TEXT',
  scriptHash: 'TEXT',
  scriptSchemaVersion: 'INTEGER',
  completedTarget: 'INTEGER',
  closurePerMin: 'REAL',
  finalRequirements: 'TEXT',
  requirementSplits: 'TEXT',
  stateChanges: 'TEXT',
  milestoneEvents: 'TEXT',
  finalTdp: 'INTEGER',
  finalSilver: 'INTEGER',
  codeRevision: 'TEXT',
  startingCircle: 'INTEGER',
  startingTotalRanks: 'INTEGER',
  commandCounts: 'TEXT',
};

const JSON_COLUMNS = new Set(['circleTimes', 'species', 'variantConfig', 'statAllocation', 'finalRequirements', 'requirementSplits', 'stateChanges', 'commandCounts', 'gapsSamples', 'expRateSamples', 'milestoneEvents']);

function migrateSweepsColumns(db) {
  const have = new Set(db.prepare('PRAGMA table_info(sweeps)').all().map((c) => c.name));
  for (const [col, type] of Object.entries(EXTRA_COLUMNS)) {
    if (have.has(col)) continue;
    // Two benchmark processes may open the shared sim-artifact DB at the
    // same time (for example, separate ports/DBs running against this
    // checkout). Both can observe the column as absent before either ALTER
    // commits. Treat the resulting duplicate-column race as success; any
    // other migration error must still surface to the caller.
    try {
      db.exec(`ALTER TABLE sweeps ADD COLUMN ${col} ${type}`);
    } catch (e) {
      if (!/duplicate column name/i.test(String(e?.message || e))) throw e;
    }
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
    vals.push(JSON_COLUMNS.has(col) ? JSON.stringify(r[col]) : (r[col] ?? null));
  }
  const placeholders = cols.map(() => '?').join(', ');
  db.prepare(`INSERT INTO sweeps (${cols.join(', ')}) VALUES (${placeholders})`).run(...vals);
}
