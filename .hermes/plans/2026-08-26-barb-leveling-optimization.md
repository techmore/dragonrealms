# Roadmap: Optimize the Barbarian Leveling Script

Written 2026-08-26. Goal: minimize time-to-circle and rank-gain latency for
the barbarian hunt loop, measured by the leveling lab
(`race-guild-sweep.mjs --benchmark --lab`, sweeps.db, `--report --lab`).

## Where we are (baseline facts)

Measurement stack (done, committed):
- Per-run: firstEXP latency, +5/+10/+15 total-rank splits, circle1 time,
  kills/trains/deaths/refusals, stall verdict — all in sweeps.db.
- Benchmark matrix: variants × races × repeats, sequential runs, boost x20.
- CSV/JSON export for graphing lands with the current matrix run.

First real data points (vkpj baseline, post-digit-fix):
- +5 ranks at 4m16s, +10 ranks at 4m46s — then STALLED at sewers_1 for the
  last 5+ min of a 10-min run. Only 2 kills, 0 circles, firstEXP never fired
  (rankBaseline bug? see P0-2).
- Healthy cadence when fighting: attack/analyze/skin/roar every ~6-15s.

## Known problems to fix first (P0)

P0-1. **Late-run stalls at the arena** (the big one). Baseline stalled
5+ minutes in-room with creatures presumably present but no engagement.
Suspects: stale creature list after kill (re-look safety net too slow),
RT gate stuck from a refused action, or rest threshold triggering without
recovery available. Instrument first: log WHY each tick declines to act.

P0-2. **firstExpMs never fires** despite 45 ranks gained. The lab tap
compares onSkills feeds vs rankBaseline; either onSkills isn't wired for
benchmark agents or baseline snapshot happens after first gain. Fix so the
headline metric actually measures something.

P0-3. **Hall-trip cadence wrong**: baseline went to hall after 1 kill
(expected every ~4). Either hallEvery isn't applied to the generated
script or the kill counter resets. Wasted round trips cost circle pace.

P0-4. **Weapon ladder vs new shop prices**: script ladder thresholds
(150/80/65) predate Milgrym's prices (short sword now 337, club 112).
A fresh char's starting purse can't follow the intended ladder. Re-key
thresholds to real prices or seed starting silver.

## Optimization levers (after P0), in expected-value order

L1. **Rest threshold & recovery placement** — fight longer between rests,
rest in safe adjacency not mid-arena. Grid search restPct {25,35,45} ×
arenaBand {1,2,3} via existing variant matrix machinery.

L2. **Creature selection** — prefer low-circle dense spawns over mixed
rooms; avoid retarget thrash. Compare kills/hour across arena candidates.

L3. **Signature ability rotation** — roar/butt/shove cadence: which mix
raises weapon exp per kill vs RT cost. Fidelity counters already track use;
add exp-per-kill attribution.

L4. **Circle-up routing** — combine TDP spend + curriculum retarget into
one trip (already partially done); avoid double trips when both triggers
fire close together.

L5. **Skinning & loot** — skin adds exp but costs RT mid-fight; test skin-
after-combat-only vs opportunistic skinning.

## Experiment plan

Phase A (P0 fixes): one session each, verify with single 10-min runs.
Exit criteria: zero wedges in 3 consecutive runs; firstEXP fires every run;
hall trips at configured cadence.

Phase B (grid): restPct × arenaBand matrix, giantman only, 3 repeats each
(~90 min per cell-pair batch). Judge on median +10-rank time AND spread.

Phase C (rotation): L3/L5 arms against the Phase B winner, 10-min runs,
exp-per-minute-of-RT as the metric.

Phase D (confirm): winner runs to circle 5 unboosted once — sanity-check
that boost-relative ordering survives natural pacing.

## Rules of engagement

- Never compare rows across price/economy commits (apples-to-apples rule).
- Purge wedge rows before reporting; wedges are bugs, not data.
- Every change lands with node --check + npm test green.
- The current matrix (vkpj) is contaminated by its pre-fix run 1 and the
  P0 bugs above — treat its output as diagnostic, not conclusive.
