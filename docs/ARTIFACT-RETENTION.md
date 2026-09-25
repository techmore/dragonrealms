# Public experiment artifact retention

`public/live/` is a mixed, publicly served evidence tree. Do not clean it with a
blind `rm`, wildcard, or age-only script. The repository now provides a
conservative planner that is dry-run by default:

```sh
npm run retention
npm run retention -- --max-age-days 30 --keep-last 5
npm run retention -- --max-age-days 30 --keep-last 5 --json
```

An apply requires both review of the dry-run and an explicit flag:

```sh
npm run retention -- --max-age-days 7 --keep-last 10 --budget-mb 900 --apply
```

`--budget-mb` is a target, not permission to cross protected evidence. The
command reports `budget met: no` when active, recent, referenced, review, shared,
or unrecognized artifacts prevent compliance.

## Current eligible families

The first retention version recognizes only complete run directories with known
manifest schemas:

- `public/live/jev-player/<run>/` — `dragonrealms.jev-realtime-player/*`;
- `public/live/puffer/<run>/` — `dragonrealms.puffer.run/*`;
- `public/live/unreal-agent/<run>/` — `dragonrealms.unreal-player/*`.

A run is eligible only when its manifest is terminal, its process is not still
running, it is outside the age window, it is outside the per-family recent-run
allowance, and no retained JSON/JSONL artifact outside the run directory refers
to its run ID. A process whose identity cannot be verified is protected.

These states are always protected:

- Jev `starting`/`playing` and Unreal `starting`/`playing`;
- Puffer `launching`/`starting`/`running`;
- Puffer evaluation `pending`/`running`, even if the training run completed;
- Puffer promotion `approval_required` or `rejected` (both are comparison
  evidence, and neither means a model was deployed);
- malformed, mismatched, missing, or unknown manifests;
- symlinks, unknown directories, and all paths outside the configured root.

Before removal, apply mode re-reads the manifest, checks its mtime, re-checks
process state and references, and verifies canonical path containment. Each
selected run is deleted as one directory group. A failure is recorded without
deleting protected evidence.

## Protected by default

The planner does **not** delete or rewrite:

- root `fidelity-*.log`, `sim-*.log`, `warmage-*.log`, mapper, launcher, or Jev
  launch logs;
- `fidelity-summary.jsonl`, `sims-history.jsonl`, `training-ledger.jsonl`, or
  other shared histories;
- `sweeps.db` and SQLite sidecars;
- `index.json`, `index-meta.json`, current/latest pointers, or generated
  catalogs;
- experiment manifests/indexes, script libraries, `fly/`, or any unrecognized
  family;
- any run referenced by a queue, report, pointer, catalog, or other retained
  JSON/JSONL file.

This means the first version can remove isolated complete run directories but
cannot reclaim space from the large shared logs/history that dominate the
current footprint. That is intentional: shared-history compaction and SQLite
row deletion require a separate lock, backup, integrity-check, and derived-index
rebuild workflow.

## Retention receipt

Dry-run mode writes nothing. Apply mode atomically publishes
`public/live/retention-manifest.json` with:

- policy, observed/projected/final bytes, and budget status;
- relative protected/candidate/selected paths and reasons;
- deleted groups and any revalidation/removal errors.

The receipt contains no absolute path, credential, account, token, or artifact
payload. It is publicly served, so do not add private evidence to it.

## Operating procedure

1. Run dry-run with the intended age, recent-run allowance, and disk budget.
2. Confirm active simulations are represented as protected, not merely assumed
   to be finished.
3. Inspect the selected relative paths and the JSON report. Archive any evidence
   that must be preserved **before** apply; deletion from `public/live/` is not a
   backup operation.
4. Prefer a maintenance window with no simulation writers. The tool protects
   known active processes, but writers not covered by a manifest contract are
   outside its authority.
5. Run apply, retain the emitted manifest with the run records, then run a second
   dry-run to confirm idempotence.
6. If a budget remains unmet, archive or move protected evidence to reviewed
   off-volume storage before designing shared-history compaction. Missing or
   stale telemetry remains unknown, not zero progress.

## CLI contract

```text
--root PATH          Analyze another root (primarily for drills/tests)
--max-age-days N     Completed-run age boundary; default 30, range 1–3650
--keep-last N        Oldest-terminal protection per family; default 5, range 0–1000
--budget-mb N        Optional disk target in MiB
--apply              Delete eligible complete run groups and publish a receipt
--json               Emit the complete machine-readable report
--help               Show usage
```

Unknown flags, missing values, and out-of-range values fail before planning.
