# Barbarian review and gap-study candidate — 2026-09-09

## Run status

No race-guild-sweep/live-sim process remained at review time. `nfbz` finished
its three seven-minute legs (baseline, diversity2, climbSurvivalFirst); all
ended at Circle 1. This short cohort is not a standard benchmark.

`yvkd` was terminated at 2026-09-09T18:15:00.905Z after 473,841 ms, before
its 30-minute cap. Its sole recorded diversity2 worker ended at Circle 1,
shortfall 50 toward Circle 2, zero deaths. The manifest declared concurrency
3 but listed only one leg: it is not an actual three-worker comparison.
Target Circle 10 was not reached. The per-run/current manifest and index
were reconciled to stopped from this final DB receipt, preserving the old
heartbeat timestamp. No new sim was launched during this review.

## Historical comparison

Source: public/live/sweeps.db and
public/live/fidelity-barbarian-edgedSkinCheapKit-gortog-inzl-iiij.log.

The death-free `inzl` control ended at Circle 1 with shortfall 15, versus
40 for baseline and 16 with one death for edgedSkinWeaponFirst in the same
cohort. Gor'Tog, paired-fixed-v1, boost 20, target Circle 5, 30 minutes,
three concurrent workers. Code receipt e285eecbc8db-dirty; control script
hash 2cfc1034d410fb72. This is a directional historical control, not proof
that today's generator has the same performance. No variant is promoted.

Across full-duration historical rows with those configuration dimensions:

| Variant | Samples | Median shortfall | Median deaths |
| --- | ---: | ---: | ---: |
| baseline | 14 | 33 | 0 |
| edgedSkinCheapKit | 8 | 19 | 0.5 |
| diversity2 | 7 | 30 | 0 |

These descriptive medians span code revisions and are not controlled
repeat evidence. No standard row reached the target. The lowest observed
shortfall was 14 in dves/edgedSkinCheapKit, with two deaths; inzl is the
strongest death-free individual result in this configuration.

In inzl, minute 16 to 24 added 73 total ranks (168 → 241), while shortfall
stayed 19. At 12:28:10.005Z, final evasion was 36/6, first weapon 31/8,
second weapon 20/8 and first armor 22/6. Remaining blockers were fourth
weapon 0/2, second armor 0/2, third survival 1/4, fourth survival 0/2,
tactics 0/2 and both lore rows 0/2. Late logs also show repeated movement
between sewers_1 and sewers_2. More raw EXP did not close these gaps.

## Candidate: edgedSkinGapStudy

One lever versus edgedSkinCheapKit: the town learning curriculum.

- Recompute missing skills from observed ranks and the authoritative next
  circle requirements on every script regeneration. Do not reuse stale
  missing-skill prose or fall back to the default curriculum for closed or
  unknown gaps.
- Spend hall training only on missing guild-teachable skills.
- Route open lore requirements to academy study, including zero-rank ties
  where the Nth pool happens to name performance. One study command feeds
  both appraisal and scholarship; re-observe before another visit. Stop the
  detour once the lore gate closes.
- Preserve the control's equipment, weapon rotation, combat and recovery.

This does not fix every missing equipment/survival lane or prove faster
leveling. Existing route-length safeguards may skip an unavailable academy
route. Incoming EXP may also still be draining between snapshots. The
candidate is not promoted and has not been benchmarked.

Next comparison, when requested: baseline, edgedSkinCheapKit,
edgedSkinGapStudy; Gor'Tog, paired-fixed-v1, concurrency 3, Circle 5,
boost 20, 30-minute cap. Run one bounded background cohort publishing to
the user's public/live; return after one launch receipt, then review saved
results later. Judge completion/deaths, then shortfall and timing. Reject
if the detour harms safety or closure without improving lore progress.
