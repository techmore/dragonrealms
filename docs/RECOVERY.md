# Backup and recovery

The world database defaults to `data/store/dragonrealms.db`; `DR_DB_PATH` selects another path. Use the exact database path from the world's launch configuration.

## Create a verified snapshot

From the repository root, with an existing destination directory:

```sh
node scripts/backup-db.mjs /absolute/path/world.db /absolute/path/backups/world-2026-09-07.db
```

This works while SQLite is running: `VACUUM INTO` captures committed data, including the WAL. The tool checks the resulting database's integrity, publishes a complete file with mode 0600, and refuses to overwrite an existing destination. Choose a new filename for each backup. Keep backups outside the served `public/` directory: they contain account and session data.

Runtime changes awaiting autosave are not part of a live database snapshot. For the latest player state, stop the owned world normally (SIGTERM or the admin Stop action), wait for a successful exit, then take the snapshot. A failed shutdown requires investigation; do not describe that snapshot as a complete final-state backup. SIGKILL cannot flush in-memory state.

## Restore without destroying the original

1. Stop the intended world and wait for it to exit. Keep its database and any WAL/SHM files together for diagnosis.
2. Restore the backup to a **new** database path using the same tool:

   ```sh
   node scripts/backup-db.mjs /absolute/path/backups/world-2026-09-07.db /absolute/path/restored/world.db
   ```

3. Start the world with `DR_DB_PATH=/absolute/path/restored/world.db` and the normal port and operator settings. The parent directory must already exist for the backup command. Do not replace a live database or reuse unrelated WAL files.
4. Confirm startup, login, character selection, inventory, balances and progression. Keep the old database until the restored state is accepted. A snapshot restores sessions as well as characters; it is not a credential-rotation procedure.

## Automated evidence

`node --test test/backup.test.mjs test/process-recovery.test.mjs` verifies live WAL capture, private output permissions, refusal to overwrite, restoration, a real server SIGTERM flushing an unsaved online allocation, and a restored server accepting the saved session. Tests create their own temporary databases and ports, never use the shared world, and remove their artifacts.

These checks establish specific recovery invariants, not resilience to every disk failure or a guarantee that unsaved state survives forced termination.

## Isolated integration checks

```sh
node scripts/verify-corpus.mjs
DR_VERIFY_CORPUS=1 npm run verify
```

The corpus runner starts separate fresh worlds for capture and replay and stops them afterward. No pre-existing server is required. A same-revision capture/replay checks repeatability; cross-revision behavior preservation requires retaining and replaying a deliberate baseline. The existing corpus normalizes numbers and tokens, so exact economic/stat values are checked in the domain tests rather than inferred from a corpus match.

The browser regression suite is optional and reported as skipped unless `DR_VERIFY_BROWSER=1` is set. Do not interpret the verification summary as a complete UI/accessibility or simulator certification.

### Browser verification

`npm run regression` now owns a disposable world, database and Chromium profile. It needs a Chromium-compatible executable named `chromium`, or an explicit `DR_CHROMIUM_PATH`. The executable path may contain spaces when passed as an environment variable. Missing executables, startup failures, CDP errors, request timeouts and failed assertions exit nonzero and clean up owned resources.

`DR_VERIFY_BROWSER=1 DR_VERIFY_CORPUS=1 npm run verify` includes both integration gates. Browser checks are implemented in `scripts/lib/client-checks.mjs`, separate from process startup, so the same assertions can run through an inspected browser's CDP interface. Checks cover onboarding, panels, customization, scripts, equipment, combat, mobile geometry and logout. They are not a visual or screen-reader certification.

## Startup schema upgrades

`server/schema.js` owns versioned migrations; `schema_migrations` records only
successfully committed versions. Startup upgrades the existing schema in one
transaction and stops with a contextual error if a column addition, rebuild,
index creation or foreign-key check fails. It refuses database versions newer
than this server supports. A failed upgrade rolls back its schema/data changes;
there is no automatic retry that ignores the failure.

The legacy guildless-character upgrade preserves the original table constraints,
extra columns, indexes, triggers, views, dependent rows and AUTOINCREMENT high
water mark while removing the historical `guild TEXT NOT NULL` constraint. An
unrecognized declaration or an existing `characters_new` table requires review;
the migration does not delete that table to force progress. Connection foreign-key
and legacy-alter settings are restored after success or failure.

Take a verified snapshot before upgrading a persistent deployment. On failure,
retain the original database and inspect the error; use the new-path restore
procedure above rather than editing migration history or deleting tables.
Tests in `test/schema.test.mjs` exercise fresh/legacy upgrades, repeatability,
injected early/late failures, dependent objects and foreign-key rejection. They
do not claim compatibility with every manually modified SQLite schema.
