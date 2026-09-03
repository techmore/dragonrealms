# Barbarian Kaizen operator guide

## Start one standard cohort

Edit [`scripts/kaizen-profile.json`](../scripts/kaizen-profile.json), keeping
three variants: `baseline`, the current matched leader, and one new candidate.
Then run:

```sh
node scripts/start-kaizen.mjs
```

The launcher enforces the shared comparison contract: three concurrent workers,
30 minutes, Circle 5, and `paired-fixed-v1`. It prints the run ID when the
sweep starts. Do not launch a second sweep against the same `public/live`
directory.

## Where the metrics live

| Question | Source | Field or search |
|---|---|---|
| Is the cohort running? | `public/live/experiment-current.json` | `runId`, `status`, `updatedAt`, `plan` |
| What happened per worker? | `public/live/fidelity-summary.jsonl` | `shortfall`, `completedTarget`, `deaths`, `stallVerdict`, `stallReason` |
| Did EXP drain to ranks? | same JSONL | `expRateSamples`, `closurePerMin`, `rankSplits` |
| Which requirement is blocking? | same JSONL and raw log | `finalRequirements.missing`, `[reqs]` |
| When did a worker get stuck? | raw `fidelity-*.log` | `[stall]`, `[rt-stall]`, `[reqs]`, `[exp]`, `[WEAPON]` |
| Compare matched cohorts | `public/live/sweeps.db` | `node scripts/race-guild-sweep.mjs --report --by-variant` |
| Visual live view | `/sims.html` | current cohort, worker cards, requirement ledger, EXP-rate chart |

Useful commands:

```sh
node scripts/race-guild-sweep.mjs --report --by-variant
rg -n '\\[stall|\\[rt-stall|\\[reqs|\\[exp|\\[WEAPON' public/live/fidelity-*.log
```

## Debug order when a script struggles

1. Check the manifest heartbeat and worker process; a stale `updatedAt` means
   the run is wedged or finished, not that the script needs tuning.
2. Check `stallVerdict` and `stallReason` before looking at kills/hour.
3. Read the last three `[reqs]` samples and identify the owner of the largest
   remaining requirement; do not tune a different skill.
4. Compare `expRateSamples` for zero-drain minutes, then inspect nearby raw-log
   commands for RT refusals, navigation loops, shop failures, or weapon swaps.
5. Change one lever, add its falsifiable hypothesis to `data/guild-scripts.js`,
   and rerun baseline + current leader + candidate as one cohort.

Never promote from a partial or mixed cohort. Keep the run ID, manifest,
variant config, `scriptHash`, requirement samples, and final JSONL row with the
Kaizen note.
